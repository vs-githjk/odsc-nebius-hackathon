import { randomUUID } from "node:crypto";
import { createBudget } from "../clients/budget.ts";
import { createFileCache, type Cache } from "../clients/cache.ts";
import { ClientError } from "../clients/errors.ts";
import { type TavilySender, createTavily } from "../clients/tavily.ts";
import { createTokenFactoryClient } from "../clients/tokenfactory.ts";
import { createWayback } from "../clients/wayback.ts";
import { decideStopState, loadRules } from "../rules/index.ts";
import type { Atoms, Trace, UsageRow } from "../schema/index.ts";
import { ask } from "../typed/ask.ts";
import { createUsageLog } from "../usage/log.ts";
import { clusterNodes, computeRoots } from "./cluster.ts";
import { withBoundaries } from "./boundary.ts";
import { fingerprintPhrase } from "./phrase.ts";
import { spansStep } from "./spans.ts";
import { pageType } from "../card/index.ts";
import { claimNumber, fingerprint } from "./fingerprint.ts";
import { intake } from "./intake.ts";
import { hopFor, redHop } from "./readouts.ts";
import { plannerFor, sameClaimFor, walkStep } from "./walk.ts";
import type { Pipeline } from "./run.ts";

type StageClients = {
  tavily: ReturnType<typeof createTavily>;
  wayback: ReturnType<typeof createWayback>;
  tokenFactory: ReturnType<typeof createTokenFactoryClient>;
  usage: ReturnType<typeof createUsageLog>;
  budget: ReturnType<typeof createBudget>;
  rules: ReturnType<typeof loadRules>;
};

type Downstream = Omit<Pipeline, "intake" | "fingerprint" | "clusters" | "walk" | "readouts">;

// The caller supplies the ledger-guarded paid transports. Public archive
// requests use a separate transport and never receive provider credentials.
export function createPipeline(options: {
  buildDownstream?: (clients: StageClients) => Downstream;
  tokenFactoryFetch: typeof fetch;
  embeddingFetch: typeof fetch;
  cache?: Cache;
  nebiusKey?: string;
  tavilyKey?: string;
  archiveFetch?: typeof fetch;
  traceId?: string;
  pagesDir?: string;
} & ({ tavilySender: TavilySender; tavilyFetch?: never } | { tavilySender?: never; tavilyFetch: typeof fetch })) {
  let startedAt = 0;
  const id = options.traceId ?? randomUUID();
  const rules = loadRules();
  const usage = createUsageLog();
  const budget = createBudget(rules.caps.credits);
  const base = { usage, cache: options.cache ?? createFileCache(), traceId: id };
  const tavily = createTavily({ ...base, budget, apiKey: options.tavilyKey, fetch: options.tavilyFetch }, options.tavilySender);
  const wayback = createWayback({ ...base, fetch: options.archiveFetch });
  const tokenFactory = createTokenFactoryClient({ traceId: id, apiKey: options.nebiusKey, fetch: options.tokenFactoryFetch });
  const downstream = options.buildDownstream?.({ tavily, wayback, tokenFactory, usage, budget, rules });

  const cluster = clusterStep(createTokenFactoryClient({
    traceId: id, apiKey: options.nebiusKey, fetch: options.embeddingFetch,
  }), rules);
  const pipeline: Pipeline = {
    spans: downstream?.spans ?? spansStep(),
    walk: walkStep(trace => ({
      tavily, wayback, usage, budget, rules,
      planQueries: plannerFor(tokenFactory, rules), askSameClaim: sameClaimFor(tokenFactory, rules),
      today: trace.recordedAt.slice(0, 10), now: () => new Date().toISOString(),
      pagesDir: options.pagesDir ?? "runs/pages",
    })),
    async readouts(trace) {
      const addedUsage: UsageRow[] = [];
      const client = {
        chat: async (input: Parameters<typeof tokenFactory.chat>[0]) => {
          const response = await tokenFactory.chat(input, { step: "readouts" });
          addedUsage.push(...response.attempts);
          return response;
        },
      };
      const hops = [];
      for (const edge of trace.edges) {
        hops.push(await hopFor(edge, trace.spans, trace.claim.atoms, rules,
          (questions, input) => ask(questions, input, { client, threshold: rules.confidenceThreshold })));
      }
      return { ...trace, hops, redHopEdgeId: redHop(hops, trace.edges, trace.nodes), usage: [...trace.usage, ...addedUsage] };
    },
    clusters: (trace, context) => {
      if (downstream) return cluster(trace, context);
      const firstDate = trace.nodes.flatMap(node => !node.meta && node.date.value ? [node.date.value] : []).sort()[0];
      const earliest = new Set(trace.nodes.filter(node => firstDate && node.date.value === firstDate).map(node => node.id));
      // A link that points away from the oldest dated page cannot establish an earlier source.
      return cluster({ ...trace, edges: trace.edges.filter(edge => !earliest.has(edge.childId)) }, context);
    },
    async intake({ input }) {
      startedAt = performance.now();
      const text = input.trim();
      const number = claimNumber(text);
      const result = await intake(text, { client: tokenFactory });
      const phrase = number ? null : await fingerprintPhrase(text, { client: tokenFactory });
      const atoms: Atoms | null = number ? {
        number: result.claims.find(claim => claim.text === text)?.number ?? number,
        unit: null, subjectLemma: "", population: null, time: null, hedge: null, namedSource: null, variants: [],
      } : phrase?.atoms ?? null;
      if (!atoms) throw new ClientError("bad_response", "Claim has no supported number or phrase");
      const intakeUsage = [...result.usage, ...(phrase?.usage ?? [])];
      const trace: Trace = {
        schemaVersion: "1", id, mode: "LIVE", synthetic: false, recordedAt: new Date().toISOString(),
        claim: { text, atoms }, viralSentence: text,
        nodes: [], edges: [], clusters: [], spans: [], hops: [], blame: [], redHopEdgeId: null,
        roots: { pages: 0, clusters: 0, rootsLinked: 0, clustersUnlinked: 0, studiesFound: null },
        earliest: { nodeIds: [], earlierWindowSearches: 0, earlierFound: 0 },
        failure: null, budget: { credits: 0, usd: intakeUsage.reduce((sum, row) => sum + row.costUsd, 0), ms: 0, capHit: null },
        decision: { state: "NO_PAGES_FOUND", row: 6, reasons: [], counts: {} },
        searchLog: [], usage: intakeUsage,
        scopeNote: "Web pages only; print and paywalled origins are out of scope. Earliest source we found, not proof of first use.",
      };
      return { ...trace, decision: decideStopState(trace, rules) };
    },
    async fingerprint(trace) {
      if (trace.claim.atoms.number === null) return trace;
      const result = await fingerprint(trace.claim.text, { client: tokenFactory, number: trace.claim.atoms.number });
      if (!result.atoms) throw new ClientError("bad_response", "Claim fingerprint has no usable subject");
      return {
        ...trace, claim: { ...trace.claim, atoms: result.atoms },
        usage: [...trace.usage, ...result.usage],
        budget: { ...trace.budget, usd: trace.budget.usd + result.usage.reduce((sum, row) => sum + row.costUsd, 0) },
      };
    },
    async card(trace, context) {
      const cardUsage: UsageRow[] = [];
      const client = {
        chat: async (input: Parameters<typeof tokenFactory.chat>[0]) => {
          const result = await tokenFactory.chat(input, { step: "card" });
          cardUsage.push(...result.attempts);
          return result;
        },
      };
      let completed = trace;
      if (downstream) {
        completed = await downstream.card(trace, context);
      } else if (!trace.failure && !trace.budget.capHit) {
        const earliest = new Set(trace.earliest.nodeIds);
        const nodes = [];
        for (const node of trace.nodes) {
          const span = trace.spans.find(item => item.nodeId === node.id);
          if (!earliest.has(node.id) || !span) { nodes.push(node); continue; }
          const typed = await pageType(span.contextBefore + span.text + span.contextAfter,
            (questions, page) => ask(questions, page, { client, threshold: rules.confidenceThreshold }));
          nodes.push({ ...node, pageType: typed });
        }
        const bounded = await withBoundaries({ ...trace, nodes }, { client, rules });
        completed = { ...bounded, usage: [...bounded.usage, ...cardUsage] };
      }
      const totals = completed.usage.reduce((sum, row) => ({
        credits: sum.credits + row.credits,
        usd: sum.usd + row.costUsd,
      }), { credits: 0, usd: 0 });
      return {
        ...completed,
        budget: { ...completed.budget, ...totals, ms: Math.round(performance.now() - startedAt) },
      };
    },
  };
  return { pipeline, wayback };
}

type EmbedClient = Pick<ReturnType<typeof createTokenFactoryClient>, "embed">;

function clusterStep(client: EmbedClient, rules: Rules): Pipeline["clusters"] {
  return async trace => {
    const usage: UsageRow[] = [];
    const { clusters, clusterOf } = await clusterNodes(
      { nodes: trace.nodes, spans: trace.spans },
      async texts => {
        const result = await client.embed(
          { model: "Qwen/Qwen3-Embedding-8B", input: texts },
          { traceId: trace.id, step: "clusters" },
        );
        usage.push(...result.attempts);
        return result.data.embeddings;
      },
      rules,
    );
    const nodes = trace.nodes.map(node => ({ ...node, clusterId: clusterOf[node.id]! }));
    const dated = nodes.filter(node => !node.meta && node.date.value !== null);
    const earliestDate = dated.map(node => node.date.value!).sort()[0];
    return {
      ...trace,
      nodes,
      clusters,
      roots: computeRoots(nodes, trace.edges),
      earliest: { ...trace.earliest, nodeIds: dated.filter(node => node.date.value === earliestDate).map(node => node.id) },
      usage: [...trace.usage, ...usage],
      budget: { ...trace.budget, usd: trace.budget.usd + usage.reduce((sum, row) => sum + row.costUsd, 0) },
    };
  };
}
