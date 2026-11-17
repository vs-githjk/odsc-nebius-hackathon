import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Trace, type TypedAnswer } from "pz/schema";
import { createBudget } from "../src/clients/budget.ts";
import { createFileCache } from "../src/clients/cache.ts";
import { createTavily } from "../src/clients/tavily.ts";
import { createWayback } from "../src/clients/wayback.ts";
import { walkClaim, walkStep } from "../src/engine/walk.ts";
import { confidentNo, loadRules } from "../src/rules/index.ts";
import { createUsageLog } from "../src/usage/log.ts";
import { verifyTrace } from "../src/verify/checks.ts";

// F1 (#192): a page the model confidently says is another claim must never become the earliest page or set the window.
const rules = loadRules();
const atoms = {
  number: { raw: "14", canonical: "14" }, unit: "times", subjectLemma: "penguins",
  population: null, time: null, hedge: null, namedSource: null, variants: ["14 times"],
};

type Page = { url: string; date: string; text: string };
// Recorded-style Tavily: search serves pages on or before the window's end date and logs each end date it was sent.
function world(pages: Page[]) {
  const endDates: (string | null)[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/cdx/")) return new Response("[]");
    const body = JSON.parse(String(init?.body));
    if (url.endsWith("/search")) {
      endDates.push(body.end_date ?? null);
      const results = pages
        .filter((p) => !body.end_date || p.date <= body.end_date)
        .map((p) => ({ url: p.url, title: "A page", content: p.text.slice(0, 80), score: 0.5, published_date: p.date }));
      return new Response(JSON.stringify({ query: body.query, results, usage: { credits: 1 } }));
    }
    const results = pages.filter((p) => body.urls.includes(p.url)).map((p) => ({ url: p.url, title: "A page", raw_content: p.text }));
    return new Response(JSON.stringify({ results, failed_results: [], usage: { credits: 1 } }));
  }) as typeof fetch;
  return { impl, endDates };
}

const answer = (optionId: "yes" | "no" | "unsure", probability: number | null): TypedAnswer => ({
  questionId: "same_claim", optionId, probability, top: [{ optionId, p: probability ?? 0 }], model: "m", threshold: null,
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pz-f1-"));
});

// Answers same_claim by the sentence: `no` for the off-claim sentence, a confident yes for every other.
function walk(pages: Page[], offClaim: TypedAnswer, offText: string) {
  const w = world(pages);
  const askSameClaim = async ({ sentence }: { sentence: string }) => {
    const typed = sentence.includes(offText) ? offClaim : answer("yes", 0.97);
    return { candidate: typed.optionId === "yes", codeHit: true, typed, mode: "model" as const, reason: null };
  };
  const deps = () => {
    const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
    const base = { fetch: w.impl, usage, cache: createFileCache(join(dir, "http")), budget: createBudget(150), traceId: "f1" };
    return {
      tavily: createTavily({ ...base, apiKey: "test-key" }), wayback: createWayback(base), usage, budget: base.budget, rules,
      today: "2026-11-12", now: () => "2026-11-12T00:00:00.000Z", pagesDir: join(dir, "pages"), askSameClaim,
    };
  };
  const handed = Trace.parse({
    schemaVersion: "1", id: "f1", mode: "LIVE", synthetic: false, recordedAt: "2026-11-12T00:00:00.000Z",
    claim: { text: "Harbor Zoo penguins nap 14 times a day.", atoms }, viralSentence: "Harbor Zoo penguins nap 14 times a day.",
    nodes: [], edges: [], clusters: [], spans: [], hops: [], blame: [],
    roots: { pages: 0, clusters: 0, rootsLinked: 0, clustersUnlinked: 0, studiesFound: null }, redHopEdgeId: null,
    earliest: { nodeIds: [], earlierWindowSearches: 0, earlierFound: 0 }, failure: null,
    budget: { credits: 0, usd: 0, ms: 0, capHit: null },
    decision: { state: "NO_PAGES_FOUND", row: 3, reasons: [], counts: {} }, searchLog: [], usage: [], scopeNote: "",
  });
  return {
    run: () => walkStep(deps)(handed, {}),
    // walkClaim keeps its own earliest pages; in the pipeline the walk stage clears them and closeTrail sets them.
    own: async () => (await walkClaim({ id: "f1", text: handed.claim.text, atoms }, { ...deps(), cachedRun: "allow" })).trace,
    endDates: w.endDates,
  };
}

// dev-11's shape: the true claim first appears in 2017; an index page about something else carries "14 times" in 2014.
const origin: Page = { url: "https://zoo.example/2017-report", date: "2017-06-01", text: "Keepers found that penguins nap 14 times a day." };
const offClaim: Page = { url: "https://markets.example/2014", date: "2014-10-01", text: "The index rose 14 times a day as penguins traders cheered." };
const OFF = "The index rose";

describe("F1: a confident same_claim 'no' page leaves the trail (#192)", () => {
  it("never becomes the walk's earliest page, though it stays on the trace", async () => {
    const t = await walk([origin, offClaim], answer("no", 0.95), OFF).own();
    const urlOf = (id: string) => t.nodes.find((n) => n.id === id)!.url;
    expect(t.nodes.map((n) => n.url)).toContain(offClaim.url);
    expect(t.earliest.nodeIds.map(urlOf)).toEqual([origin.url]);
  });

  it("never sets the end of the next search window", async () => {
    const w = walk([origin, offClaim], answer("no", 0.95), OFF);
    await w.run();
    const later = w.endDates.filter((d): d is string => d !== null && d < "2026-11-12");
    expect(later.length).toBeGreaterThan(0);
    // Searches step back from the 2017 origin, never from the 2014 page.
    expect(later.every((d) => d >= "2017-05-31")).toBe(true);
    expect(later).toContain("2017-05-31");
  });

  it("an unsure or absent answer rules nothing out: that page can still be the earliest", async () => {
    const t = await walk([origin, offClaim], answer("unsure", 0.5), OFF).own();
    const urlOf = (id: string) => t.nodes.find((n) => n.id === id)!.url;
    expect(t.earliest.nodeIds.map(urlOf)).toEqual([offClaim.url]);
  });
});

describe("confidentNo", () => {
  it("needs a 'no' at or above the confidence threshold when one is set", () => {
    expect(confidentNo(answer("no", 0.9), { confidenceThreshold: null })).toBe(true);
    expect(confidentNo(answer("no", 0.9), { confidenceThreshold: 0.8 })).toBe(true);
    expect(confidentNo(answer("no", 0.7), { confidenceThreshold: 0.8 })).toBe(false);
    expect(confidentNo(answer("no", null), { confidenceThreshold: 0.8 })).toBe(false);
    expect(confidentNo(answer("unsure", 0.99), { confidenceThreshold: null })).toBe(false);
    expect(confidentNo(answer("yes", 0.99), { confidenceThreshold: null })).toBe(false);
    expect(confidentNo(undefined, { confidenceThreshold: null })).toBe(false);
  });
});

describe("pz verify knows F1", () => {
  // sample-origin plus an older page in its own cluster: allowed when the model confidently said it is another claim.
  const base = Trace.parse(JSON.parse(readFileSync(join(import.meta.dirname, "../../../fixtures/traces/sample-origin.json"), "utf8")));
  const keeper = base.nodes.find((n) => n.id === "keeper-log")!;
  const withOlder = (sameClaim: TypedAnswer): Trace => ({
    ...base,
    nodes: [...base.nodes, { ...keeper, id: "older-other", url: "https://markets.example/2014", domain: "markets.example", clusterId: "c-other", spanIds: [], sameClaim,
      date: { ...keeper.date, value: "2014-10-10", firstCapture: "2014-10-10" } }],
  });
  const earliestFailures = (t: Trace) => verifyTrace(t, { rules }).failures.filter((f) => f.check === "earliest");

  it("an older page with a confident same_claim 'no' does not make the stored earliest pages wrong", () => {
    expect(earliestFailures(withOlder(answer("no", 0.95)))).toEqual([]);
  });

  it("an older page with an unsure answer still does", () => {
    expect(earliestFailures(withOlder(answer("unsure", 0.5)))).toHaveLength(1);
  });
});
