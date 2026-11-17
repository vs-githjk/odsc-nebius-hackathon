import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Trace } from "pz/schema";
import { createBudget } from "../src/clients/budget.ts";
import { createFileCache } from "../src/clients/cache.ts";
import { createTavily } from "../src/clients/tavily.ts";
import { TokenFactoryError } from "../src/clients/tokenfactory.ts";
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
    const asked: { hop: unknown; seen: unknown[] }[] = [];
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

describe("T44 review notes (#110)", () => {
  it("never follows a menu row in the next paragraph, even cross-site", async () => {
    const news: Page = { url: "https://news.example/new", date: "2020-05-01", text: "Report: penguins nap 14 times a day.\n\n[Shop](https://shop.example/) | [Tickets](https://tickets.example/)" };
    const w = world([news]);
    await walkStep(build(w.impl))(handedOver, {});
    expect(w.extracted.some((u) => u.includes("shop.example") || u.includes("tickets.example"))).toBe(false);
  });

  // XO [M] on #110: with a CRLF or non-breaking-space blank line the menu links scored 6 and took the follow slots.
  for (const [name, gap] of [["CRLF", "\r\n\r\n"], ["non-breaking space", "\n \n"]] as const) {
    it(`never follows a menu row after a ${name} blank line`, async () => {
      const news: Page = { url: "https://news.example/new", date: "2020-05-01", text: `Report: penguins nap 14 times a day.${gap}[Shop](https://shop.example/) | [Tickets](https://tickets.example/)` };
      const w = world([news]);
      await walkStep(build(w.impl))(handedOver, {});
      expect(w.extracted.some((u) => u.includes("shop.example") || u.includes("tickets.example"))).toBe(false);
    });
  }

  it("passes the planner every sent query as a {query, endDate} pair, with the planned date, not the window's", async () => {
    const seenByCall: unknown[] = [];
    const planner: QueryPlanner = async (input) => {
      seenByCall.push(structuredClone(input.seen));
      return { queries: [{ query: '"14 times" penguins naps', endDate: "2099-01-01", why: "variant" }], rejected: [], usage: [], mode: "code_only" };
    };
    const older: Page = { url: "https://blog.example/old", date: "2012-02-08", text: "Our keepers noted that penguins nap 14 times a day." };
    const news: Page = { url: "https://news.example/new", date: "2020-05-01", text: "Report: penguins nap 14 times a day." };
    await walkStep(build(world([news, older]).impl, planner))(handedOver, {});
    expect(seenByCall.length).toBeGreaterThan(1);
    expect(seenByCall[1]).toContainEqual({ query: '"14 times" penguins naps', endDate: "2099-01-01" });
  });

  it("says in the trace why a followed far citation has no link-verified edge", async () => {
    const news: Page = {
      url: "https://news.example/new", date: "2020-05-01",
      text: `Report: penguins nap 14 times a day. ${padding}An earlier survey also said penguins nap 14 times a day, see [the survey](https://survey.example/2010).`,
    };
    const survey: Page = { url: "https://survey.example/2010", date: null, text: "The 2010 survey found that penguins nap 14 times a day." };
    const t = await walkStep(build(world([news, survey]).impl))(handedOver, {});
    const follow = t.searchLog.find((s) => s.step === "follow" && s.query.includes(survey.url));
    expect(follow?.query).toMatch(/not beside its span/);
  });

  it("seeds the walk's budget with the credits the trace already spent, so intake counts toward the cap", async () => {
    const spent = { at: "2026-11-12T00:00:00.000Z", traceId: "neutral", step: "intake", service: "tavily" as const, endpoint: "search",
      model: null, promptTokens: 0, completionTokens: 0, cachedTokens: 0, credits: 149, costUsd: 1.192, latencyMs: 9, status: "200", cacheHit: false };
    const news: Page = { url: "https://news.example/new", date: "2020-05-01", text: "Report: penguins nap 14 times a day." };
    const t = await walkStep(build(world([news]).impl))({ ...handedOver, usage: [spent] }, {});
    expect(t.budget.capHit).toBe("credits");
  });

  it("stores the same_claim answer it is given on each page it reads", async () => {
    const yes = { questionId: "same_claim", optionId: "yes", probability: 0.97, top: [{ optionId: "yes", p: 0.97 }], model: "m", threshold: null };
    const askSameClaim = async () => ({ candidate: true, codeHit: true, typed: yes, mode: "model" as const, reason: null });
    const news: Page = { url: "https://news.example/new", date: "2020-05-01", text: "Report: penguins nap 14 times a day." };
    const deps = build(world([news]).impl);
    const t = await walkStep(() => ({ ...deps(), askSameClaim }))(handedOver, {});
    expect(t.nodes.find((n) => n.url === news.url)?.sameClaim).toEqual(yes);
  });

  it("walks a claim with no single number, searching by its phrase", async () => {
    const phraseAtoms = { ...atoms, number: null, unit: null, variants: [], phrase: "nap more than seals" };
    const claim = { ...handedOver, claim: { text: "Penguins nap more than seals.", atoms: phraseAtoms } };
    const news: Page = { url: "https://news.example/new", date: "2020-05-01", text: "According to the Harbor Zoo Annual Report, penguins nap more than seals." };
    const w = world([news]);
    const t = await walkStep(build(w.impl))(Trace.parse(claim), {});
    expect(Trace.parse(t)).toBeTruthy();
    expect(w.searches.some((q) => q.includes('"nap more than seals"'))).toBe(true);
  });

  // XO [H] on #110: a schema-failing model reply threw out of walkStep with no failure state and no usage rows.
  const failedCall = { at: "2026-11-12T00:00:00.000Z", traceId: "neutral", step: "plan", service: "tokenfactory" as const, endpoint: "chat",
    model: "m", promptTokens: 120, completionTokens: 30, cachedTokens: 0, credits: 0, costUsd: 0.0001, latencyMs: 40, status: "200", cacheHit: false };

  it("a Token Factory error in the planner falls back to code-only queries, keeps its usage rows and says so", async () => {
    const planner: QueryPlanner = async () => {
      throw new TokenFactoryError("bad_response", 200, [failedCall]);
    };
    const news: Page = { url: "https://news.example/new", date: "2020-05-01", text: "Report: penguins nap 14 times a day." };
    const w = world([news]);
    const t = await walkStep(build(w.impl, planner))(handedOver, {});
    expect(Trace.parse(t)).toBeTruthy();
    expect(t.failure).toBeNull();
    expect(w.searches.some((q) => q.includes("14 times"))).toBe(true);
    expect(t.nodes.map((n) => n.url)).toContain(news.url);
    expect(t.usage).toContainEqual(failedCall);
    expect(t.searchLog.find((s) => s.step === "model")?.query).toBe("query planner failed (bad_response 200): code-only queries used for this window");
  });

  it("a Token Factory error in same_claim stores no answer for that page and the walk carries on", async () => {
    const askSameClaim = async () => {
      throw new TokenFactoryError("http_error", 503, [{ ...failedCall, step: "same_claim", status: "503" }]);
    };
    const news: Page = { url: "https://news.example/new", date: "2020-05-01", text: "Report: penguins nap 14 times a day." };
    const deps = build(world([news]).impl);
    const t = await walkStep(() => ({ ...deps(), askSameClaim }))(handedOver, {});
    const node = t.nodes.find((n) => n.url === news.url);
    expect(node).toBeDefined();
    expect(node?.sameClaim).toBeUndefined();
    expect(t.failure).toBeNull();
    expect(t.usage.some((r) => r.step === "same_claim" && r.status === "503")).toBe(true);
    expect(t.searchLog.some((s) => s.step === "model" && s.query.startsWith(`same_claim on ${news.url} failed (http_error 503)`))).toBe(true);
  });

  it("any other error still stops the walk loudly", async () => {
    const planner: QueryPlanner = async () => {
      throw new TypeError("a bug, not a model failure");
    };
    await expect(walkStep(build(world([]).impl, planner))(handedOver, {})).rejects.toThrow(TypeError);
  });
});
