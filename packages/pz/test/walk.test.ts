import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Trace } from "pz/schema";
import { createBudget } from "../src/clients/budget.ts";
import { createFileCache } from "../src/clients/cache.ts";
import { createTavily } from "../src/clients/tavily.ts";
import { createWayback } from "../src/clients/wayback.ts";
import { walkClaim, walkStep } from "../src/engine/walk.ts";
import { loadRules } from "../src/rules/index.ts";
import { createUsageLog } from "../src/usage/log.ts";
import * as spike from "../../../spike/walk.ts";

const rules = loadRules();
const atoms = {
  number: { raw: "14", canonical: "14" }, unit: "times", subjectLemma: "penguins",
  population: null, time: null, hedge: null, namedSource: null, variants: ["14 times"],
};

type Page = { url: string; date: string | null; text: string; title?: string };
function world(pages: Page[]) {
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/cdx/")) return new Response("[]");
    const body = JSON.parse(String(init?.body));
    if (url.endsWith("/search")) {
      const results = pages
        .filter((p) => !body.end_date || (p.date !== null && p.date <= body.end_date))
        .map((p) => ({ url: p.url, title: p.title ?? "A page", content: p.text.slice(0, 80), score: 0.5, published_date: p.date }));
      return new Response(JSON.stringify({ query: body.query, results, usage: { credits: 1 } }));
    }
    const results = pages.filter((p) => body.urls.includes(p.url)).map((p) => ({ url: p.url, title: p.title ?? "A page", raw_content: p.text }));
    return new Response(JSON.stringify({ results, failed_results: [], usage: { credits: 1 } }));
  }) as typeof fetch;
  return impl;
}

const pages: Page[] = [
  { url: "https://news.example/new", date: "2020-05-01", text: "Report: penguins nap 14 times a day. See [the older post](https://blog.example/old)." },
  { url: "https://blog.example/old", date: "2012-02-08", text: "Our keepers noted that penguins nap 14 times a day." },
  { url: "https://checkdesk.example/m", date: "2010-01-01", title: "The myth of penguin naps", text: "Writers repeat that penguins nap 14 times a day." },
];

let dir: string;
const deps = (fetchImpl: typeof fetch, credits = 150) => {
  const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
  const base = { fetch: fetchImpl, usage, cache: createFileCache(join(dir, "http")), budget: createBudget(credits), traceId: "neutral" };
  return {
    tavily: createTavily({ ...base, apiKey: "test-key" }), wayback: createWayback(base), usage, budget: base.budget, rules,
    today: "2026-11-09", now: () => "2026-11-09T00:00:00.000Z", pagesDir: join(dir, "pages"),
  };
};

// The trace the intake and fingerprint stages hand over: the claim and its atoms, nothing walked yet.
const handedOver: Trace = Trace.parse({
  schemaVersion: "1", id: "neutral", mode: "LIVE", synthetic: false, recordedAt: "2026-11-09T00:00:00.000Z",
  claim: { text: "Harbor Zoo penguins nap 14 times a day.", atoms }, viralSentence: "Harbor Zoo penguins nap 14 times a day.",
  nodes: [], edges: [], clusters: [], spans: [], hops: [], blame: [],
  roots: { pages: 0, clusters: 0, rootsLinked: 0, clustersUnlinked: 0, studiesFound: null }, redHopEdgeId: null,
  earliest: { nodeIds: [], earlierWindowSearches: 0, earlierFound: 0 }, failure: null,
  budget: { credits: 0, usd: 0, ms: 0, capHit: null },
  decision: { state: "NO_PAGES_FOUND", row: 3, reasons: [], counts: {} }, searchLog: [], usage: [], scopeNote: "",
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pz-engine-walk-"));
});

describe("engine walk", () => {
  it("[C1] walkStep takes the handed-over trace, walks its claim and returns a schema-valid trace", async () => {
    const step = walkStep(deps(world(pages)));
    const trace = await step(handedOver);
    expect(Trace.parse(trace)).toBeTruthy();
    expect(trace.id).toBe("neutral");
    expect(trace.claim).toEqual(handedOver.claim);
    expect(trace.nodes.filter((n) => !n.meta).map((n) => n.url).sort()).toEqual(["https://blog.example/old", "https://news.example/new"]);
  });

  it("[C1] meta pages are kept only in the already-discussed list, never on the path or as the earliest", async () => {
    const trace = await walkStep(deps(world(pages)))(handedOver);
    const meta = trace.nodes.filter((n) => n.meta).map((n) => n.id);
    expect(meta).toHaveLength(1);
    expect(trace.earliest.nodeIds.some((id) => meta.includes(id))).toBe(false);
    expect(trace.edges.some((e) => meta.includes(e.parentId) || meta.includes(e.childId))).toBe(false);
  });

  it("[C1] a cap hit ends PARTIAL and no results end NO_PAGES_FOUND", async () => {
    expect((await walkStep(deps(world(pages), 2))(handedOver)).decision.state).toBe("PARTIAL");
    expect((await walkStep(deps(world([])))(handedOver)).decision.state).toBe("NO_PAGES_FOUND");
  });

  it("the spike script is a thin wrapper: it runs the engine's walker, so the two can never drift", () => {
    expect(spike.walkClaim).toBe(walkClaim);
  });
});
