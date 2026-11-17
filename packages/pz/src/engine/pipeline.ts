import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createBudget } from "../clients/budget.ts";
import { createFileCache, type Cache } from "../clients/cache.ts";
import { createFileTape, recordDirOf, recordPaths, recordingCache, recordingClient, writeClaimClock } from "../clients/tape.ts";
import { ClientError } from "../clients/errors.ts";
import type { ClientDeps } from "../clients/http.ts";
import { type TavilySender, createTavily } from "../clients/tavily.ts";
import { TokenFactoryError, createTokenFactoryClient } from "../clients/tokenfactory.ts";
import { createWayback } from "../clients/wayback.ts";
import { decideStopState, loadRules } from "../rules/index.ts";
import type { Atoms, Edge, Hop, Trace, UsageRow } from "../schema/index.ts";
import { ask } from "../typed/ask.ts";
import { createUsageLog } from "../usage/log.ts";
import { pageType } from "../card/index.ts";
import { computeRoots } from "./cluster.ts";
import { withBoundaries } from "./boundary.ts";
import { claimNumber, fingerprint } from "./fingerprint.ts";
import { fingerprintPhrase } from "./phrase.ts";
import { measuredReadouts, hopFor, redHop, wordDiff, words } from "./readouts.ts";
import type { PageInput, Pipeline } from "./run.ts";
import { spansStep } from "./spans.ts";
import { createEmbedder } from "./similar.ts";
import { createEvidence, type Resolver } from "./publication.ts";
import { plannerFor, sameClaimFor, walkStep } from "./walk.ts";

type TokenFactory = ReturnType<typeof createTokenFactoryClient>;

// The page_type question reads the start of the saved page: enough to tell a study from a blog, well inside the
// per-attempt Token Factory ceiling.
const PAGE_CHARS = 8000;
const SCOPE_NOTE = "Web pages only; print and paywalled origins are out of scope. Earliest source we found, not proof of first use.";

// Rows added by a later stage join the trace's usage, and the budget line is re-derived from every row the trace
// carries. Credits count every service; dollars count Token Factory only, as the walk does (walkStep).
function withUsage(trace: Trace, rows: readonly UsageRow[]): Trace {
  const usage = [...trace.usage, ...rows];
  return {
    ...trace, usage,
    budget: {
      ...trace.budget,
      credits: usage.reduce((sum, row) => sum + row.credits, 0),
      usd: usage.reduce((sum, row) => sum + (row.service === "tokenfactory" ? row.costUsd : 0), 0),
    },
  };
}

// The clusters stage. Dates are final by now (the dating stage ran), so this is where the earliest pages, the
// date-ordered edges and the root counts are settled. The walk already grouped reworded copies with its own embedding
// call (deps.embed), so nothing is embedded again here.
// - Earliest: the dated pages with the oldest date.
// - A link that points away from the oldest dated page cannot establish an earlier source, so an earliest page keeps
//   no incoming edge (the verifier's `earliest` check).
// - A dated page with no link-verified parent gets an inferred edge from the latest earlier page in another cluster.
export function closeTrail(trace: Trace): Trace {
  const dated = trace.nodes.filter((node) => !node.meta && node.date.value !== null);
  const first = dated.map((node) => node.date.value!).sort()[0];
  const earliestIds = first === undefined ? [] : dated.filter((node) => node.date.value === first).map((node) => node.id);
  const earliest = new Set(earliestIds);
  const kept = trace.edges.filter((edge) => !earliest.has(edge.childId));
  const edges: Edge[] = [...kept];
  const linked = new Set(kept.map((edge) => edge.childId));
  const pages = dated.filter((node) => node.read && node.spanIds.length > 0)
    .sort((a, b) => a.date.value!.localeCompare(b.date.value!) || a.id.localeCompare(b.id));
  for (const child of pages) {
    if (earliest.has(child.id) || linked.has(child.id)) continue;
    const parent = pages.filter((page) => page.date.value! < child.date.value! && page.clusterId !== child.clusterId).at(-1);
    if (!parent) continue;
    edges.push({
      id: "", kind: "inferred", parentId: parent.id, childId: child.id,
      parentSpanId: parent.spanIds[0]!, childSpanId: child.spanIds[0]!, linkHref: null,
    });
  }
  const numbered = edges.map((edge, index) => ({ ...edge, id: `e${index + 1}` }));
  return {
    ...trace, edges: numbered,
    earliest: { ...trace.earliest, nodeIds: earliestIds },
    roots: computeRoots(trace.nodes, numbered),
  };
}

// The claim as the pipeline starts: no pages, no atoms beyond what code can read. A claim with no single number is
// held by its own text until the fingerprint stage finds its phrase.
function startTrace(id: string, text: string, rules: ReturnType<typeof loadRules>, recordedAt: string): Trace {
  const number = claimNumber(text);
  const atoms: Atoms = {
    number, ...(number ? {} : { phrase: text }), unit: null, subjectLemma: "", population: null, time: null, hedge: null, variants: [],
    namedSource: null,
  };
  const trace: Trace = {
    schemaVersion: "1", id, mode: "LIVE", synthetic: false, recordedAt,
    claim: { text, atoms }, viralSentence: text,
    nodes: [], edges: [], clusters: [], spans: [], hops: [], blame: [], redHopEdgeId: null,
    roots: { pages: 0, clusters: 0, rootsLinked: 0, clustersUnlinked: 0, studiesFound: null },
    earliest: { nodeIds: [], earlierWindowSearches: 0, earlierFound: 0 },
    failure: null, budget: { credits: 0, usd: 0, ms: 0, capHit: null },
    decision: { state: "NO_PAGES_FOUND", row: 6, reasons: [], counts: {} },
    searchLog: [], usage: [], scopeNote: SCOPE_NOTE,
  };
  return { ...trace, decision: decideStopState(trace, rules) };
}

export type PipelineParts = {
  chat: Pick<TokenFactory, "chat">;
  embed: Pick<TokenFactory, "embed">;
  // Builds the Tavily client for one walk from the run's shared deps (usage log, cache, per-walk budget).
  tavily: (deps: ClientDeps) => ReturnType<typeof createTavily>;
  archiveFetch?: typeof fetch;
  // Fetches a page's raw HTML for its publication metadata (dating, #79). Without it, dates come from archive captures only.
  pageFetch?: typeof fetch;
  resolveHost?: Resolver;
  // Waits between a rate-limited archive request and its retry; tests pass a no-op.
  sleep?: (ms: number) => Promise<void>;
  cache?: Cache;
  traceId?: string;
  pagesDir?: string;
  usagePath?: string;
  // The run's clock. Replay pins it to the recorded day, because the search window ends "today" and is part of every cache key.
  clock?: () => Date;
};

// The production pipeline from ready clients. One pipeline serves one trace: it holds that trace's usage log and clock.
// Every Token Factory attempt, including retries and failures, ends up as a usage row on the trace.
export function buildPipeline(parts: PipelineParts): { pipeline: Pipeline; wayback: ReturnType<typeof createWayback> } {
  let startedAt = performance.now();
  const id = parts.traceId ?? randomUUID();
  const rules = loadRules();
  const usage = createUsageLog(parts.usagePath ? { path: parts.usagePath } : {});
  const clock = parts.clock ?? (() => new Date());
  // PZ_RECORD_DIR turns any live run into a recording for eval/replay-walk.ts: HTTP responses are mirrored into the
  // directory and every Token Factory reply is written to its tape.
  const recordDir = recordDirOf();
  const model = recordDir
    ? recordingClient({ chat: parts.chat.chat, embed: parts.embed.embed }, createFileTape(recordPaths(recordDir).model))
    : { chat: parts.chat.chat, embed: parts.embed.embed };
  const chatClient: Pick<TokenFactory, "chat"> = { chat: model.chat };
  const embedClient: Pick<TokenFactory, "embed"> = { embed: model.embed };
  const cache = recordDir ? recordingCache(parts.cache ?? createFileCache(), recordPaths(recordDir).http) : parts.cache ?? createFileCache();
  const base = { usage, cache, traceId: id, sleep: parts.sleep };
  const wayback = createWayback({ ...base, fetch: parts.archiveFetch });
  const pagesDir = parts.pagesDir ?? "runs/pages";

  // Walk-stage model calls (the same_claim question) return no usage of their own, so each successful call's attempt
  // rows go to the run's usage log here. A failed call's rows are added by the walk's own fallback (modelFailed).
  const walkChat = (step: string) => ({
    chat: async (input: Parameters<TokenFactory["chat"]>[0]) => {
      const response = await chatClient.chat(input, { step });
      for (const row of response.attempts) usage.append(row);
      return response;
    },
  });
  // Embedding calls report nothing to the walk, so success and failure rows both go to the usage log.
  const walkEmbed = {
    embed: async (input: Parameters<TokenFactory["embed"]>[0], context?: Parameters<TokenFactory["embed"]>[1]) => {
      try {
        const response = await embedClient.embed(input, { ...context, step: "embed" });
        for (const row of response.attempts) usage.append(row);
        return response;
      } catch (error) {
        if (error instanceof TokenFactoryError) for (const row of error.usage) usage.append(row);
        throw error;
      }
    },
  };
  // Stage calls after the walk collect their rows into `rows`, which the stage adds to the trace.
  const collecting = (rows: UsageRow[], step: string) => ({
    chat: async (input: Parameters<TokenFactory["chat"]>[0]) => {
      try {
        const response = await chatClient.chat(input, { step });
        rows.push(...response.attempts);
        return response;
      } catch (error) {
        if (error instanceof TokenFactoryError) rows.push(...error.usage);
        throw error;
      }
    },
  });

  const walkStage = walkStep((trace) => {
      // A fresh budget for each walk: walkStep spends the credits the earlier stages already used onto it, once.
      // Sharing a budget with an earlier stage would count those credits twice.
      const budget = createBudget(rules.caps.credits);
      return {
        tavily: parts.tavily({ ...base, budget }),
        wayback, usage, budget, rules,
        planQueries: plannerFor(chatClient, rules),
        askSameClaim: sameClaimFor(walkChat("same_claim"), rules),
        embed: createEmbedder(walkEmbed, { traceId: id }),
        today: trace.recordedAt.slice(0, 10), now: () => clock().toISOString(),
        pagesDir,
      };
    });

  const pipeline: Pipeline = {
    async intake({ input }) {
      startedAt = performance.now();
      const text = input.trim();
      if (!text) throw new ClientError("bad_response", "Empty claim");
      const recordedAt = clock().toISOString();
      if (recordDir) writeClaimClock(recordDir, id, recordedAt);
      return startTrace(id, text, rules, recordedAt);
    },

    async fingerprint(trace) {
      const text = trace.claim.text;
      const number = trace.claim.atoms.number;
      let atoms: Atoms;
      let rows: UsageRow[];
      if (number) {
        const result = await fingerprint(text, { client: chatClient, number });
        if (!result.atoms) throw new ClientError("bad_response", "Claim fingerprint has no usable subject");
        atoms = result.atoms;
        rows = result.usage;
      } else {
        // T53: no single number, so the phrase drives matching. A named stop ends the run with a code, never a guess.
        const result = await fingerprintPhrase(text, { client: chatClient });
        if (!result.atoms) {
          throw new ClientError(result.reason === "no_model" ? "not_configured" : "bad_response", `Phrase claim stopped: ${result.reason}`);
        }
        atoms = result.atoms;
        rows = result.usage;
      }
      return withUsage({ ...trace, claim: { ...trace.claim, atoms } }, rows);
    },

    walk: async (trace, context) => {
      const walked = await walkStage(trace, context);
      if (!parts.pageFetch) return walked;
      // The walk reads markdown, which has no meta tags, so the dating stage gets each page's publication evidence
      // from a scholarly registry or the page's own HTML (publication.ts). Every request is a usage row on the trace.
      const rows: UsageRow[] = [];
      const evidence = createEvidence({ fetch: parts.pageFetch, cache: base.cache, usage: { rows, append: (row) => { rows.push(row); } }, traceId: id, resolve: parts.resolveHost });
      const queue = walked.nodes.filter((node) => !node.meta && node.read);
      const pages: PageInput[] = [];
      const work = async () => {
        for (let node = queue.shift(); node; node = queue.shift()) {
          const found = await evidence(node.url);
          if (found) pages.push({ url: node.url, text: "", metadata: found.date, metadataSource: found.source === "metadata" ? undefined : found.source });
        }
      };
      await Promise.all([work(), work()]);
      return { trace: withUsage(walked, rows), pages };
    },

    spans: spansStep(),

    // Dates are final, so settle the trail, then ask the page_type question about each earliest page (T19): an origin
    // needs a confident primary page type, and nothing else in the pipeline sets it. It reads the page the walk saved.
    // A failed call leaves the type unset, so that page cannot become the origin, and its attempts stay on the trace.
    async clusters(trace) {
      const closed = closeTrail(trace);
      const rows: UsageRow[] = [];
      const client = collecting(rows, "page_type");
      const nodes = [...closed.nodes];
      for (const nodeId of closed.earliest.nodeIds) {
        const at = nodes.findIndex((node) => node.id === nodeId);
        if (at < 0 || nodes[at]!.meta || !nodes[at]!.read) continue;
        let text: string;
        try { text = readFileSync(join(pagesDir, closed.id, `${nodeId}.txt`), "utf8"); } catch { continue; }
        try {
          const answer = await pageType(text.slice(0, PAGE_CHARS), (questions, page) =>
            ask(questions, page, { client, threshold: rules.confidenceThreshold }));
          nodes[at] = { ...nodes[at]!, pageType: answer };
        } catch (error) {
          if (!(error instanceof TokenFactoryError)) throw error;
        }
      }
      return withUsage({ ...closed, nodes }, rows);
    },

    async readouts(trace) {
      const rows: UsageRow[] = [];
      const client = collecting(rows, "readouts");
      const hops: Hop[] = [];
      for (const edge of trace.edges) {
        try {
          hops.push(await hopFor(edge, trace.spans, trace.claim.atoms, rules,
            (questions, input) => ask(questions, input, { client, threshold: rules.confidenceThreshold })));
        } catch (error) {
          // A failed model call keeps the measured readouts and leaves the hop unfaithful, not unmeasured (T76 fallback).
          if (!(error instanceof TokenFactoryError)) throw error;
          const text = (spanId: string) => trace.spans.find((span) => span.id === spanId)?.text ?? "";
          const [earlier, later] = [text(edge.parentSpanId), text(edge.childSpanId)];
          hops.push({
            edgeId: edge.id, readouts: measuredReadouts(earlier, later, trace.claim.atoms, rules),
            wordDiff: wordDiff(words(earlier), words(later)), faithful: false,
          });
        }
      }
      return withUsage({ ...trace, hops, redHopEdgeId: redHop(hops, trace.edges, trace.nodes) }, rows);
    },

    async card(trace) {
      // T37: a trace that went cold asks the boundary question about each earliest page. Code still picks the ending.
      const rows: UsageRow[] = [];
      let bounded = trace;
      try {
        bounded = await withBoundaries(trace, { client: collecting(rows, "boundary"), rules });
      } catch (error) {
        if (!(error instanceof TokenFactoryError)) throw error;
      }
      const done = withUsage(bounded, rows);
      return { ...done, budget: { ...done.budget, ms: Math.round(performance.now() - startedAt) } };
    },
  };
  return { pipeline, wayback };
}

// The default pipeline for `pz trace "<claim>"`. The caller supplies the ledger-guarded paid transports. Public
// archive requests use a separate transport and never receive provider credentials.
export function createPipeline(options: {
  tokenFactoryFetch: typeof fetch;
  embeddingFetch: typeof fetch;
  cache?: Cache;
  nebiusKey?: string;
  tavilyKey?: string;
  archiveFetch?: typeof fetch;
  pageFetch?: typeof fetch;
  resolveHost?: Resolver;
  sleep?: (ms: number) => Promise<void>;
  traceId?: string;
  pagesDir?: string;
  usagePath?: string;
} & ({ tavilySender: TavilySender; tavilyFetch?: never } | { tavilySender?: never; tavilyFetch: typeof fetch })) {
  const traceId = options.traceId ?? randomUUID();
  return buildPipeline({
    chat: createTokenFactoryClient({ traceId, apiKey: options.nebiusKey, fetch: options.tokenFactoryFetch }),
    embed: createTokenFactoryClient({ traceId, apiKey: options.nebiusKey, fetch: options.embeddingFetch }),
    tavily: (deps) => createTavily({ ...deps, apiKey: options.tavilyKey, fetch: options.tavilyFetch }, options.tavilySender),
    archiveFetch: options.archiveFetch, pageFetch: options.pageFetch, resolveHost: options.resolveHost, sleep: options.sleep, cache: options.cache, traceId, pagesDir: options.pagesDir, usagePath: options.usagePath,
  });
}
