import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBudget } from "../src/clients/budget.ts";
import { createFileCache } from "../src/clients/cache.ts";
import { createTavily } from "../src/clients/tavily.ts";
import { createWayback } from "../src/clients/wayback.ts";
import { studyQueries, walkClaim, type QueryPlanner, type SpikeClaim } from "../src/engine/walk.ts";
import { loadRules } from "../src/rules/index.ts";
import { createUsageLog } from "../src/usage/log.ts";
import type { Atoms } from "../src/schema/index.ts";

const rules = loadRules();
// dev-12 as fingerprinted on the first live run: a phrase claim with no variants.
const plastic: SpikeClaim = {
  id: "dev-12", text: "You eat a credit card's worth of plastic every week.",
  atoms: { number: null, unit: null, subjectLemma: "plastic", population: null, time: null, hedge: null, namedSource: null, variants: [],
    phrase: "You eat a credit card's worth of plastic every week" } as Atoms,
};

// Every search is answered from these pages; each search body is kept so the test can count repeats.
type Page = { url: string; date: string; text: string };
function walk(claim: SpikeClaim, pages: Page[], planQueries?: QueryPlanner) {
  const bodies: Record<string, unknown>[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/cdx/")) return new Response("[]");
    const body = JSON.parse(String(init?.body));
    if (url.endsWith("/search")) {
      bodies.push(body);
      const results = pages.filter((p) => !body.end_date || p.date <= body.end_date)
        .map((p) => ({ url: p.url, title: "A page", content: p.text.slice(0, 80), score: 0.5, published_date: p.date }));
      return new Response(JSON.stringify({ query: body.query, results, usage: { credits: 1 } }));
    }
    const results = pages.filter((p) => body.urls.includes(p.url)).map((p) => ({ url: p.url, title: "A page", raw_content: p.text }));
    return new Response(JSON.stringify({ results, failed_results: [], usage: { credits: 1 } }));
  }) as typeof globalThis.fetch;
  const dir = mkdtempSync(join(tmpdir(), "pz-dedupe-"));
  const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
  const deps = { fetch, usage, cache: createFileCache(join(dir, "http")), budget: createBudget(150), traceId: claim.id };
  const run = walkClaim(claim, {
    tavily: createTavily({ ...deps, apiKey: "test-key" }), wayback: createWayback(deps), usage, budget: deps.budget, rules,
    today: "2026-11-02", now: () => "2026-11-02T00:00:00.000Z", pagesDir: join(dir, "pages"), ...(planQueries ? { planQueries } : {}),
  });
  return { run, bodies };
}

const pages: Page[] = [
  { url: "https://news.example/a", date: "2021-03-01", text: "Studies say you eat a credit card's worth of plastic every week." },
  { url: "https://blog.example/b", date: "2019-06-20", text: "Yes: you eat a credit card's worth of plastic every week, says WWF." },
];

describe("#192 F6: queries", () => {
  it("adds publisher and study queries that pass the query rules", () => {
    expect(studyQueries(plastic.text, plastic.atoms)).toEqual([
      "\"You eat a credit card's worth of plastic every week\" study",
      "\"You eat a credit card's worth of plastic every week\" report",
      "\"You eat a credit card's worth of plastic every week\" survey",
    ]);
  });

  it("dev-12: a planner that repeats one quoted phrase never sends the same search twice", async () => {
    const repeat: QueryPlanner = async () => ({ queries: Array.from({ length: 4 }, (_, i) => ({ query: "\"You eat a credit card's worth of plastic every week\"", endDate: i % 2 ? "2030-01-01" : null, why: "variant" })), rejected: [], usage: [], mode: "model" as const });
    const { run, bodies } = walk(plastic, pages, repeat);
    await run;
    const sent = bodies.map((b) => JSON.stringify(b));
    expect(new Set(sent).size).toBe(sent.length);
    expect(bodies.some((b) => / study$/.test(String(b.query)))).toBe(true);
  });

  it("a search that found nothing is not sent again with an earlier end date", async () => {
    const { run, bodies } = walk(plastic, []);
    await run;
    const sent = bodies.map((b) => JSON.stringify(b));
    expect(new Set(sent).size).toBe(sent.length);
  });
});
