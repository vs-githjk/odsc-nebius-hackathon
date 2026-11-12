import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Trace } from "pz/schema";
import { createBudget } from "../src/clients/budget.ts";
import { createFileCache } from "../src/clients/cache.ts";
import { createTavily } from "../src/clients/tavily.ts";
import { createWayback } from "../src/clients/wayback.ts";
import { spansStep } from "../src/engine/spans.ts";
import { walkStep, type QueryPlanner } from "../src/engine/walk.ts";
import { loadRules } from "../src/rules/index.ts";
import { createUsageLog } from "../src/usage/log.ts";
import { verifyTrace } from "../src/verify/checks.ts";

const rules = loadRules();
const atoms = {
  number: { raw: "14", canonical: "14" }, unit: "times", subjectLemma: "penguins",
  population: null, time: null, hedge: null, namedSource: null, variants: ["14 times"],
};

type Page = { url: string; date: string | null; text: string; title?: string; onlyFor?: string };
// Recorded-style Tavily and CDX. Search serves pages inside the date window (a page with `onlyFor` only to queries
// containing that text); extract serves any page it knows. Every request is logged.
function world(pages: Page[]) {
  const searches: string[] = [];
  const extracted: string[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/cdx/")) return new Response("[]");
    const body = JSON.parse(String(init?.body));
    if (url.endsWith("/search")) {
      searches.push(body.query);
      const results = pages
        .filter((p) => p.date !== null && (!body.end_date || p.date <= body.end_date))
        .filter((p) => !p.onlyFor || body.query.includes(p.onlyFor))
        .map((p) => ({ url: p.url, title: p.title ?? "A page", content: p.text.slice(0, 80), score: 0.5, published_date: p.date }));
      return new Response(JSON.stringify({ query: body.query, results, usage: { credits: 1 } }));
    }
    extracted.push(...body.urls);
    const results = pages.filter((p) => body.urls.includes(p.url)).map((p) => ({ url: p.url, title: p.title ?? "A page", raw_content: p.text }));
    return new Response(JSON.stringify({ results, failed_results: [], usage: { credits: 1 } }));
  }) as typeof fetch;
  return { impl, searches, extracted };
}

let dir: string;
const build = (fetchImpl: typeof fetch, planQueries?: QueryPlanner) => () => {
  const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
  const base = { fetch: fetchImpl, usage, cache: createFileCache(join(dir, "http")), budget: createBudget(150), traceId: "neutral" };
  return {
    tavily: createTavily({ ...base, apiKey: "test-key" }), wayback: createWayback(base), usage, budget: base.budget, rules,
    today: "2026-11-12", now: () => "2026-11-12T00:00:00.000Z", pagesDir: join(dir, "pages"), ...(planQueries && { planQueries }),
  };
};

const handedOver: Trace = Trace.parse({
  schemaVersion: "1", id: "neutral", mode: "LIVE", synthetic: false, recordedAt: "2026-11-12T00:00:00.000Z",
  claim: { text: "Harbor Zoo penguins nap 14 times a day.", atoms }, viralSentence: "Harbor Zoo penguins nap 14 times a day.",
  nodes: [], edges: [], clusters: [], spans: [], hops: [], blame: [],
  roots: { pages: 0, clusters: 0, rootsLinked: 0, clustersUnlinked: 0, studiesFound: null }, redHopEdgeId: null,
  earliest: { nodeIds: [], earlierWindowSearches: 0, earlierFound: 0 }, failure: null,
  budget: { credits: 0, usd: 0, ms: 0, capHit: null },
  decision: { state: "NO_PAGES_FOUND", row: 3, reasons: [], counts: {} }, searchLog: [], usage: [], scopeNote: "",
});

const padding = `${"Unrelated words about the zoo shop and parking. ".repeat(6).trim()} `;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pz-walk-links-"));
});

describe("walk by links (T44)", () => {
  it("follows a far link whose own context states the claim, and reads the page it reaches", async () => {
    const news: Page = {
      url: "https://news.example/new", date: "2020-05-01",
      text: `Report: penguins nap 14 times a day. ${padding}An earlier survey also said penguins nap 14 times a day, see [the survey](https://survey.example/2010).`,
    };
    // Not findable by search at all: only the link reaches it.
    const survey: Page = { url: "https://survey.example/2010", date: null, text: "The 2010 survey found that penguins nap 14 times a day." };
    const w = world([news, survey]);
    const t = await walkStep(build(w.impl))(handedOver, {});
    expect(w.extracted).toContain(survey.url);
    expect(t.nodes.map((n) => n.url)).toContain(survey.url);
  });

  it("never fetches a menu link with nothing about the claim around it", async () => {
    const news: Page = { url: "https://news.example/new", date: "2020-05-01", text: `[Shop](https://zoo.example/shop) ${padding}Report: penguins nap 14 times a day.` };
    const w = world([news]);
    await walkStep(build(w.impl))(handedOver, {});
    expect(w.extracted).not.toContain("https://zoo.example/shop");
  });

  it("[C2] follows a DOI written beside the span, and the spans stage links it with both spans", async () => {
    const news: Page = { url: "https://news.example/new", date: "2020-05-01", text: "Researchers report penguins nap 14 times a day (doi:10.1234/zoo.5678)." };
    const paper: Page = { url: "https://doi.org/10.1234/zoo.5678", date: null, text: "Abstract. Adult penguins nap 14 times a day in daylight." };
    const w = world([news, paper]);
    const walked = await walkStep(build(w.impl))(handedOver, {});
    const t = spansStep()(walked, {});
    const kid = t.nodes.find((n) => n.url === news.url)!;
    const parent = t.nodes.find((n) => n.url === paper.url)!;
    expect(t.edges).toEqual([expect.objectContaining({ childId: kid.id, parentId: parent.id, kind: "explicit", linkHref: paper.url })]);
    expect(verifyTrace(t, { rules }).failures.filter((f) => f.check === "edge_spans" || f.check === "edge_kind")).toEqual([]);
  });

  it("searches by a source the page names ('according to ...')", async () => {
    const news: Page = { url: "https://news.example/new", date: "2020-05-01", text: "According to the Harbor Zoo Annual Report, penguins nap 14 times a day." };
    const report: Page = { url: "https://harborzoo.example/annual", date: "2015-03-01", onlyFor: "Harbor Zoo Annual Report", text: "Harbor Zoo Annual Report: our penguins nap 14 times a day." };
    const w = world([news, report]);
    const t = await walkStep(build(w.impl))(handedOver, {});
    expect(w.searches.some((q) => q.includes("Harbor Zoo Annual Report") && q.includes('"14 times"'))).toBe(true);
    expect(t.nodes.map((n) => n.url)).toContain(report.url);
  });

  it("uses the query planner it is given, and never searches later than the window", async () => {
    const asked: { hop: unknown; seen: string[] }[] = [];
    const planner: QueryPlanner = async (input) => {
      asked.push({ hop: input.hop, seen: [...input.seen] });
      return { queries: [{ query: '"14 times" penguins naps', endDate: "2099-01-01", why: "variant" }], rejected: [], usage: [], mode: "code_only" };
    };
    const news: Page = { url: "https://news.example/new", date: "2020-05-01", text: "Report: penguins nap 14 times a day." };
    const w = world([news]);
    const t = await walkStep(build(w.impl, planner))(handedOver, {});
    expect(asked[0]?.hop).toBeNull();
    expect(w.searches[0]).toBe('"14 times" penguins naps');
    expect(t.searchLog.every((s) => s.endDate !== null && s.endDate <= "2026-11-12")).toBe(true);
  });

  it("the budget counts every usage row the trace carries, intake's included (XO note on #82)", async () => {
    const intakeRow = { at: "2026-11-12T00:00:00.000Z", traceId: "neutral", step: "intake", service: "tokenfactory" as const, endpoint: "chat",
      model: "m", promptTokens: 10, completionTokens: 5, cachedTokens: 0, credits: 0, costUsd: 0.002, latencyMs: 9, status: "200", cacheHit: false };
    const incoming = { ...handedOver, budget: { ...handedOver.budget, ms: 40 }, usage: [intakeRow] };
    const news: Page = { url: "https://news.example/new", date: "2020-05-01", text: "Report: penguins nap 14 times a day." };
    const t = await walkStep(build(world([news]).impl))(incoming, {});
    expect(t.budget.usd).toBeCloseTo(0.002, 6);
    expect(t.budget.credits).toBe(t.usage.reduce((n, r) => n + r.credits, 0));
    expect(t.budget.ms).toBeGreaterThanOrEqual(40);
  });
});
