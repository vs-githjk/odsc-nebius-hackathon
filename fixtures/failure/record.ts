// T76: the two failure endings, run through the engine's own stages with recorded Tavily responses and no keys.
// A forced Tavily 503 on search ends TOOL_FAILED; an empty search ends NO_PAGES_FOUND.
//
// What is real here: runTrace, the walk stage (walkStep and walkClaim), dating, the Tavily and Wayback clients, the
// HTTP layer with its retries, the usage log and decideStopState. What is stubbed: intake and fingerprint (the claim
// and atoms are given), and the stages after the walk, which have nothing to do with no pages. The responses are
// authored, not captured from a live call, so both traces are labelled synthetic and replay as SAMPLE.
// When engine/pipeline.ts (T71, #130) lands, the same recorded fetch plugs into its factory.
//
// Run from the repo root: node --import tsx fixtures/failure/record.ts
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBudget } from "../../packages/pz/src/clients/budget.ts";
import { createFileCache } from "../../packages/pz/src/clients/cache.ts";
import { createTavily } from "../../packages/pz/src/clients/tavily.ts";
import { createWayback } from "../../packages/pz/src/clients/wayback.ts";
import { runTrace, type Pipeline } from "../../packages/pz/src/engine/run.ts";
import { walkStep } from "../../packages/pz/src/engine/walk.ts";
import { loadRules } from "../../packages/pz/src/rules/index.ts";
import { Trace } from "../../packages/pz/src/schema/index.ts";
import { createUsageLog } from "../../packages/pz/src/usage/log.ts";

export const CASES = {
  "failure-tavily-503": "tavily-search-503.json",
  "failure-empty-search": "tavily-search-empty.json",
} as const;
export type CaseId = keyof typeof CASES;

const ROOT = new URL("../", import.meta.url);
const AT = "2026-11-15T08:00:00.000Z";
const SCOPE = "Synthetic: an invented claim, and a Tavily response written for this test, not captured from a live call.";

// A fetch that serves one recorded Tavily response for every search and an empty Wayback CDX answer. Any other
// request is refused, so nothing here can reach the network.
export function recordedFetch(file: string): { fetch: typeof fetch; calls: string[] } {
  const recorded = JSON.parse(readFileSync(new URL(`failure/responses/${file}`, ROOT), "utf8")) as { status: number; body: unknown };
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/cdx/")) return new Response("[]");
    if (url.endsWith("/search")) {
      const body = typeof recorded.body === "string" ? recorded.body : JSON.stringify(recorded.body);
      return new Response(body, { status: recorded.status });
    }
    throw new Error(`no recorded response for ${url}`);
  }) as typeof fetch;
  return { fetch: impl, calls };
}

// The claim as intake and fingerprint would hand it on: the invented Harbor Zoo claim from the fixtures.
function intake(id: CaseId): Trace {
  const base = Trace.parse(JSON.parse(readFileSync(new URL("traces/sample-no-pages.json", ROOT), "utf8")));
  return Trace.parse({
    ...base, id, mode: "SAMPLE", synthetic: true, recordedAt: AT,
    nodes: [], edges: [], clusters: [], spans: [], hops: [], blame: [], redHopEdgeId: null,
    roots: { pages: 0, clusters: 0, rootsLinked: 0, clustersUnlinked: 0, studiesFound: null },
    earliest: { nodeIds: [], earlierWindowSearches: 0, earlierFound: 0 },
    failure: null, budget: { credits: 0, usd: 0, ms: 0, capHit: null },
    decision: { state: "NO_PAGES_FOUND", row: 3, reasons: [], counts: {} }, searchLog: [], usage: [], scopeNote: SCOPE,
  });
}

export async function recordCase(id: CaseId): Promise<{ trace: Trace; calls: string[] }> {
  const dir = mkdtempSync(join(tmpdir(), `pz-${id}-`));
  const { fetch, calls } = recordedFetch(CASES[id]);
  const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
  const budget = createBudget(150);
  const clients = { fetch, usage, cache: createFileCache(join(dir, "http")), budget, traceId: id };
  // A placeholder key: the recorded fetch never checks it, and no real key is read.
  const tavily = createTavily({ ...clients, apiKey: "recorded" });
  const wayback = createWayback(clients);
  const rules = loadRules();
  const same = async (t: Trace) => t;
  const pipeline: Pipeline = {
    intake: async () => intake(id),
    fingerprint: same,
    walk: walkStep(() => ({ tavily, wayback, usage, budget, rules, today: AT.slice(0, 10), now: () => AT, pagesDir: join(dir, "pages") })),
    // The walk writes the engine's scope note; the card stage puts the synthetic label in front of it.
    spans: same, clusters: same, readouts: same, card: async (t: Trace) => ({ ...t, scopeNote: `${SCOPE} ${t.scopeNote}` }),
  };
  const trace = await runTrace(id, pipeline, { wayback });
  // Clock fields are zeroed so the committed file is stable; every other field is what the engine wrote.
  return { trace: Trace.parse({ ...trace, budget: { ...trace.budget, ms: 0 }, usage: trace.usage.map((u) => ({ ...u, at: AT, latencyMs: 0 })) }), calls };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const id of Object.keys(CASES) as CaseId[]) {
    const { trace } = await recordCase(id);
    writeFileSync(new URL(`failure/traces/${id}.json`, ROOT), JSON.stringify(trace, null, 2) + "\n");
    console.log(`${id}: ${trace.decision.state}`);
  }
}
