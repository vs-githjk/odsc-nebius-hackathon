import { randomUUID } from "node:crypto";
import { createBudget } from "../clients/budget.ts";
import { createFileCache, type Cache } from "../clients/cache.ts";
import { ClientError } from "../clients/errors.ts";
import { type TavilySender, createTavily } from "../clients/tavily.ts";
import { createTokenFactoryClient } from "../clients/tokenfactory.ts";
import { createWayback } from "../clients/wayback.ts";
import { decideStopState, loadRules } from "../rules/index.ts";
import type { Atoms, Edge, Trace, UsageRow } from "../schema/index.ts";
import { ask } from "../typed/ask.ts";
import { createUsageLog } from "../usage/log.ts";
import { clusterStep } from "./cluster.ts";
import { claimNumber, fingerprint } from "./fingerprint.ts";
import { intake } from "./intake.ts";
import { hopFor, redHop } from "./readouts.ts";
import { walkStep } from "./walk.ts";
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
    spans: downstream?.spans ?? (trace => {
      const pages = trace.nodes.filter(node => node.read && !node.meta && node.spanIds.length);
      const byUrl = new Map(pages.map(node => [node.url, node]));
      const edges: Edge[] = [];
      for (const child of pages) {
        for (const candidate of child.candidateParents) {
          const parent = byUrl.get(candidate.url);
          if (!candidate.read || !parent || parent.id === child.id) continue;
          edges.push({
            id: `e${edges.length + 1}`, kind: "explicit", parentId: parent.id, childId: child.id,
            parentSpanId: parent.spanIds[0]!, childSpanId: child.spanIds[0]!, linkHref: candidate.url,
          });
        }
      }
      return { ...trace, edges };
    }),
    walk: walkStep(trace => ({
      tavily, wayback, usage, budget, rules,
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
      if (!number) throw new ClientError("bad_response", "Claim has no supported number");
      const result = await intake(text, { client: tokenFactory });
      const atoms: Atoms = {
        number: result.claims.find(claim => claim.text === text)?.number ?? number,
        unit: null, subjectLemma: "", population: null, time: null, hedge: null, namedSource: null, variants: [],
      };
      const trace: Trace = {
        schemaVersion: "1", id, mode: "LIVE", synthetic: false, recordedAt: new Date().toISOString(),
        claim: { text, atoms }, viralSentence: text,
        nodes: [], edges: [], clusters: [], spans: [], hops: [], blame: [], redHopEdgeId: null,
        roots: { pages: 0, clusters: 0, rootsLinked: 0, clustersUnlinked: 0, studiesFound: null },
        earliest: { nodeIds: [], earlierWindowSearches: 0, earlierFound: 0 },
        failure: null, budget: { credits: 0, usd: result.usage.reduce((sum, row) => sum + row.costUsd, 0), ms: 0, capHit: null },
        decision: { state: "NO_PAGES_FOUND", row: 6, reasons: [], counts: {} },
        searchLog: [], usage: result.usage,
        scopeNote: "Web pages only; print and paywalled origins are out of scope. Earliest source we found, not proof of first use.",
      };
      return { ...trace, decision: decideStopState(trace, rules) };
    },
    async fingerprint(trace) {
      const result = await fingerprint(trace.claim.text, { client: tokenFactory, number: trace.claim.atoms.number });
      if (!result.atoms) throw new ClientError("bad_response", "Claim fingerprint has no usable subject");
      return {
        ...trace, claim: { ...trace.claim, atoms: result.atoms },
        usage: [...trace.usage, ...result.usage],
        budget: { ...trace.budget, usd: trace.budget.usd + result.usage.reduce((sum, row) => sum + row.costUsd, 0) },
      };
    },
    async card(trace, context) {
      const completed = downstream ? await downstream.card(trace, context) : trace;
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
