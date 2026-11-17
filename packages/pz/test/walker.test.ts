import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Trace } from "pz/schema";
import { queriesFor, toPlain, walkClaim, type SpikeClaim } from "../src/engine/walk.ts";
import { createBudget } from "../src/clients/budget.ts";
import { createFileCache } from "../src/clients/cache.ts";
import { createTavily } from "../src/clients/tavily.ts";
import { createWayback } from "../src/clients/wayback.ts";
import { loadRules } from "../src/rules/index.ts";
import { createUsageLog } from "../src/usage/log.ts";
import { verifyTrace } from "../src/verify/checks.ts";

const claim: SpikeClaim = {
  id: "neutral",
  text: "Harbor Zoo penguins nap 14 times a day.",
  atoms: {
    number: { raw: "14", canonical: "14" }, unit: "times", subjectLemma: "penguins",
    population: null, time: null, hedge: null, namedSource: null, variants: ["14 times"],
  },
};

type Page = { url: string; date: string | null; text: string; title?: string };

// Recorded-style fake of Tavily and CDX: pages are served only when their date is inside the requested window.
function world(pages: Page[], opts: { extractStatus?: number } = {}) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/cdx/")) return new Response("[]");
    const body = JSON.parse(String(init?.body));
    if (url.endsWith("/search")) {
      const results = pages
        .filter((p) => !body.end_date || (p.date !== null && p.date <= body.end_date))
        .map((p) => ({ url: p.url, title: p.title ?? "A page", content: p.text.slice(0, 80), score: 0.5, published_date: p.date }));
      return new Response(JSON.stringify({ query: body.query, results, usage: { credits: 1 } }));
    }
    if (opts.extractStatus) return new Response("no", { status: opts.extractStatus });
    const results = pages.filter((p) => body.urls.includes(p.url)).map((p) => ({ url: p.url, title: p.title ?? "A page", raw_content: p.text }));
    return new Response(JSON.stringify({ results, failed_results: [], usage: { credits: 1 } }));
  }) as typeof fetch;
  return { impl, calls };
}

let dir: string;
const rules = loadRules();
function run(fetchImpl: typeof fetch, credits = 150, ruleOverride = rules, extra: { replayOf?: Trace } = {}) {
  const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
  const deps = { fetch: fetchImpl, usage, cache: createFileCache(join(dir, "http")), budget: createBudget(credits), traceId: claim.id };
  return walkClaim(claim, {
    tavily: createTavily({ ...deps, apiKey: "test-key" }),
    wayback: createWayback(deps),
    usage,
    budget: deps.budget,
    rules: ruleOverride,
    today: "2026-11-02",
    now: () => "2026-11-02T00:00:00.000Z",
    pagesDir: join(dir, "pages"),
    ...extra,
  });
}

const newer: Page = { url: "https://news.example/new", date: "2020-05-01", text: "Report: penguins nap 14 times a day and never stop. See [the older post](https://blog.example/old) for more." };
const older: Page = { url: "https://blog.example/old", date: "2012-02-08", text: "Our keepers noted that penguins nap 14 times a day." };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pz-walk-"));
});

describe("walkClaim", () => {
  it("[C1] walks back in time and writes a schema-valid trace that passes pz verify", async () => {
    const { trace } = await run(world([newer, older]).impl);
    expect(Trace.parse(trace)).toBeTruthy();
    expect(trace.mode).toBe("LIVE");
    expect(trace.synthetic).toBe(false);
    expect(trace.nodes.map((n) => n.url).sort()).toEqual([older.url, newer.url].sort());
    expect(trace.earliest.nodeIds).toEqual([trace.nodes.find((n) => n.url === older.url)?.id]);
    expect(trace.earliest.earlierWindowSearches).toBeGreaterThanOrEqual(2);
    expect(trace.earliest.earlierFound).toBe(0);
    expect(verifyTrace(trace, { rules, pagesDir: join(dir, "pages", claim.id) }).failures).toEqual([]);
  });

  it("[C2] a link beside the span makes an explicit edge on the earlier page", async () => {
    const { trace } = await run(world([newer, older]).impl);
    expect(trace.edges).toHaveLength(1);
    const child = trace.nodes.find((n) => n.url === newer.url);
    const parent = trace.nodes.find((n) => n.url === older.url);
    expect(trace.edges[0]).toMatchObject({ kind: "explicit", linkHref: older.url, parentId: parent?.id, childId: child?.id });
  });

  it("[C3] with no link the edge to the earlier page is inferred", async () => {
    const plain = { ...newer, text: "Report: penguins nap 14 times a day." };
    const { trace } = await run(world([plain, older]).impl);
    expect(trace.edges[0]).toMatchObject({ kind: "inferred", linkHref: null });
  });

  it("[C1] a meta page never enters the path", async () => {
    const meta: Page = { url: "https://debunk.example/m", date: "2010-01-01", title: "The myth of penguin naps", text: "Writers repeat that penguins nap 14 times a day." };
    const { trace } = await run(world([newer, older, meta]).impl);
    const node = trace.nodes.find((n) => n.url === meta.url);
    expect(node?.meta).toBe(true);
    expect(trace.earliest.nodeIds).not.toContain(node?.id);
    expect(trace.edges.flatMap((e) => [e.parentId, e.childId])).not.toContain(node?.id);
  });

  it("[C2] a page that only negates the number gets no span and no node", async () => {
    const negated: Page = { url: "https://other.example/n", date: "2009-01-01", text: "It is a myth that penguins nap 14 times a day." };
    const { trace, log } = await run(world([newer, older, negated]).impl);
    expect(trace.nodes.map((n) => n.url)).not.toContain(negated.url);
    expect(log.some((l) => l.url === negated.url && l.kept === false)).toBe(true);
  });

  it("[C1] a different number never matches", async () => {
    const other: Page = { url: "https://other.example/x", date: "2009-01-01", text: "Keepers say penguins nap 15 times a day." };
    const { trace } = await run(world([older, other]).impl);
    expect(trace.nodes.map((n) => n.url)).toEqual([older.url]);
  });

  it("[C1] a credit cap hit stops as PARTIAL and keeps what it has", async () => {
    const { trace } = await run(world([newer, older]).impl, 2);
    expect(trace.budget.capHit).toBe("credits");
    expect(trace.decision.state).toBe("PARTIAL");
    expect(Trace.parse(trace)).toBeTruthy();
  });

  it("[C1] a depth cap hit stops as PARTIAL", async () => {
    const pages = Array.from({ length: 6 }, (_, i) => ({ url: `https://p${i}.example/a`, date: `20${10 + i}-01-01`, text: "Keepers noted that penguins nap 14 times a day." }));
    const shallow = { ...rules, caps: { ...rules.caps, depth: 1, frontier: 1 } };
    const { trace } = await run(world(pages).impl, 150, shallow);
    expect(trace.budget.capHit).toBe("depth");
    expect(trace.decision.state).toBe("PARTIAL");
  });

  it("[T53] a phrase claim searches for its quoted phrase and keeps only pages that state it, not ones that negate it", async () => {
    const quote: SpikeClaim = { id: "quote", text: "Insanity is doing the same thing over and over again and expecting different results.", atoms: {
      number: null, phrase: "doing the same thing over and over again", unit: null, subjectLemma: "insanity", population: null, time: null, hedge: null, namedSource: null, variants: [] } };
    const pages: Page[] = [
      { url: "https://quotes.example/a", date: "2015-01-01", text: "A famous line: insanity is doing the same thing over and over again and expecting different results." },
      { url: "https://debunk.example/b", date: "2016-01-01", text: "It is not true that Einstein said insanity is doing the same thing over and over again." },
      { url: "https://other.example/c", date: "2014-01-01", text: "Doing the same thing again and again is a habit." },
    ];
    const w = world(pages);
    const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
    const deps = { fetch: w.impl, usage, cache: createFileCache(join(dir, "http")), budget: createBudget(150), traceId: quote.id };
    const { trace } = await walkClaim(quote, { tavily: createTavily({ ...deps, apiKey: "test-key" }), wayback: createWayback(deps), usage, budget: deps.budget,
      rules, today: "2026-11-02", now: () => "2026-11-02T00:00:00.000Z", pagesDir: join(dir, "pages") });
    expect(trace.nodes.map((n) => n.url)).toEqual(["https://quotes.example/a"]);
    expect(trace.searchLog[0]!.query).toBe("\"doing the same thing over and over again\"");
    expect(queriesFor(quote.atoms)).toEqual(["\"doing the same thing over and over again\""]);
  });

  it("[C1] no results end as NO_PAGES_FOUND", async () => {
    const { trace } = await run(world([]).impl);
    expect(trace.decision.state).toBe("NO_PAGES_FOUND");
  });

  it("[C1] a tool failure ends as TOOL_FAILED and is not a decision about the claim", async () => {
    const { trace } = await run(world([older], { extractStatus: 401 }).impl);
    expect(trace.failure).toMatchObject({ service: "tavily", endpoint: "extract", status: "http_error 401" });
    expect(trace.decision.state).toBe("TOOL_FAILED");
  });

  it("[C1] a Tavily 503 on search names the service, the endpoint and the code (T76)", async () => {
    const down = (async (input: string | URL | Request) => String(input).includes("/cdx/") ? new Response("[]") : new Response("busy", { status: 503 })) as typeof fetch;
    const { trace } = await run(down);
    expect(trace.failure).toEqual({ service: "tavily", endpoint: "search", status: "http_error 503", kept: "0 pages read before the failure" });
    expect(trace.decision.state).toBe("TOOL_FAILED");
  });

  it("[C16] the stored state comes from decideStopState and is never ORIGIN_FOUND without a page type", async () => {
    const { trace } = await run(world([older]).impl);
    expect(trace.nodes[0]?.pageType).toBeNull();
    expect(trace.decision.state).toBe("TRAIL_GOES_COLD");
  });

  it("[C5] a mutated child gets a word diff and a measured comparison readout", async () => {
    const mutated = { ...newer, text: "Penguins nap 14 times a day, more than seals. See [the post](https://blog.example/old)." };
    const { trace } = await run(world([mutated, older]).impl);
    const hop = trace.hops[0];
    expect(hop?.readouts.find((r) => r.id === "comparison_added")).toMatchObject({ source: "measured", value: "yes" });
    expect(hop?.wordDiff.some((d) => d.op === "add" && d.text.includes("seals"))).toBe(true);
    expect(hop?.faithful).toBe(false);
    expect(trace.redHopEdgeId).toBe(trace.edges[0]?.id);
  });

  it("logs every query, window and kept or dropped page", async () => {
    const { trace, log } = await run(world([newer, older]).impl);
    expect(trace.searchLog.length).toBeGreaterThan(0);
    expect(trace.searchLog[0]).toMatchObject({ endDate: "2026-11-02" });
    expect(log.filter((l) => l.kept === true).map((l) => l.url)).toContain(older.url);
  });
});

describe("helpers", () => {
  it("builds exact-match queries from the variants, with the subject outside the quotes", () => {
    expect(queriesFor(claim.atoms)).toEqual(['"14 times" penguins']);
  });

  it("toPlain keeps link text, drops images and reports link offsets, including urls with parentheses", () => {
    const { text, links } = toPlain("See ![x](/a.png) the [Creaming page](https://e.example/Creaming_(food)) now.");
    expect(text).toBe("See the Creaming page now.");
    expect(links).toEqual([{ href: "https://e.example/Creaming_(food)", start: 8, end: 21 }]);
  });
});

describe("frontier", () => {
  it("[C1] orders by real date when Tavily sends RFC dates, reading the earliest first", async () => {
    const pages = [
      { url: "https://a.example/new", date: "2026-01-16", text: "Now penguins nap 14 times a day." },
      { url: "https://b.example/old", date: "2014-10-29", text: "Then penguins nap 14 times a day." },
    ];
    const base = world(pages);
    const rfc = (async (input: string | URL | Request, init?: RequestInit) => {
      const res = await base.impl(input, init);
      if (!String(input).endsWith("/search")) return res;
      const body = await res.json();
      for (const r of body.results) r.published_date = new Date(r.published_date).toUTCString();
      return new Response(JSON.stringify(body));
    }) as typeof fetch;
    const oneAtATime = { ...rules, caps: { ...rules.caps, frontier: 1 } };
    const { trace } = await run(rfc, 150, oneAtATime);
    expect(trace.nodes[0]?.url).toBe("https://b.example/old");
  });

  it("[C1] far-away and excess links never crowd out search results", async () => {
    const padding = `${"word ".repeat(60).trim()}. `;
    const child: Page = {
      url: "https://a.example/child", date: "2020-01-01",
      text: `[Join us](https://club.example/join) ${padding}Keepers say penguins nap 14 times a day. See [one](https://l1.example/a), [two](https://l2.example/a), [three](https://l3.example/a).`,
    };
    const { trace } = await run(world([child, older]).impl);
    const parents = trace.nodes.find((n) => n.url === child.url)?.candidateParents.map((p) => p.url);
    expect(parents).not.toContain("https://club.example/join");
    expect(trace.nodes.map((n) => n.url)).toContain(older.url);
  });
});

describe("spans", () => {
  it("[C2] markdown emphasis and heading marks stay out of a span", async () => {
    const marked: Page = { url: "https://a.example/m", date: "2012-01-01", text: "## Naps\n\nKeepers say penguins nap **14 times** a day." };
    const { trace } = await run(world([marked]).impl);
    expect(trace.spans[0]?.text).toBe("Keepers say penguins nap 14 times a day.");
  });
});

describe("review fixes", () => {
  it("[C3] an inferred edge never joins two pages with the same date", async () => {
    const a: Page = { url: "https://a.example/x", date: "2014-01-01", text: "Writers say penguins nap 14 times a day." };
    const b: Page = { url: "https://b.example/y", date: "2014-01-01", text: "Keepers report penguins nap 14 times a day." };
    const c: Page = { url: "https://c.example/z", date: "2010-01-01", text: "A study says penguins nap 14 times a day." };
    const { trace } = await run(world([a, b, c]).impl);
    const date = (id: string) => trace.nodes.find((n) => n.id === id)?.date.value ?? "";
    expect(trace.edges.length).toBeGreaterThan(0);
    for (const e of trace.edges) expect(date(e.parentId) < date(e.childId)).toBe(true);
  });

  it("[C1] a fact-check domain never enters the path: with metaMaps off it is never read, with it on it is only a meta map", async () => {
    const check: Page = { url: "https://www.snopes.com/fact-check/penguins", date: "2009-01-01", text: "Do penguins nap 14 times a day? Keepers say penguins nap 14 times a day." };
    const off = await run(world([older, check]).impl, 150, { ...rules, metaMaps: false });
    expect(off.trace.nodes.map((n) => n.url)).not.toContain(check.url);
    expect(off.log.some((l) => l.url === check.url && l.kept === true)).toBe(false);
    const on = await run(world([older, check]).impl);
    const node = on.trace.nodes.find((n) => n.url === "https://snopes.com/fact-check/penguins" || n.url === check.url);
    expect(node).toBeDefined();
    expect([node!.meta, node!.spanIds, on.trace.earliest.nodeIds.includes(node!.id)]).toEqual([true, [], false]);
    expect(on.trace.spans.some((sp) => on.trace.nodes.find((n) => n.id === sp.nodeId)?.url.includes("snopes"))).toBe(false);
  });

  it("[C14] a run served entirely from the cache is a REPLAY carrying the first run's date and usage rows", async () => {
    const pages = world([newer, older]);
    const first = await run(pages.impl);
    expect(first.trace.mode).toBe("LIVE");
    const callsAfterFirst = pages.calls.length;
    const replay = await run(pages.impl, 150, rules, { replayOf: first.trace });
    expect(pages.calls.length).toBe(callsAfterFirst);
    expect(replay.trace.mode).toBe("REPLAY");
    expect(replay.trace.recordedAt).toBe(first.trace.recordedAt);
    expect(replay.trace.usage).toEqual(first.trace.usage);
    expect(replay.trace.budget.credits).toBe(first.trace.budget.credits);
    expect(Trace.parse(replay.trace)).toBeTruthy();
  });

  it("[C14] a run served entirely from the cache with no first run to carry is refused, never written as LIVE", async () => {
    const pages = world([newer, older]);
    await run(pages.impl);
    await expect(run(pages.impl)).rejects.toThrow(/replay/i);
  });
});

describe("replay with fresh free calls", () => {
  it("[C14] fresh Wayback lookups keep a replay a REPLAY, and their rows are added after the recorded ones", async () => {
    const pages = world([newer, older]);
    const first = await run(pages.impl);
    const cdxFresh = (async (input: string | URL | Request, init?: RequestInit) =>
      pages.impl(String(input).includes("/cdx/") ? `${String(input)}&fresh=1` : input, init)) as typeof fetch;
    const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
    const cache = createFileCache(join(dir, "http"));
    const budget = createBudget(150);
    const deps = { usage, cache, budget, traceId: claim.id };
    const freshWayback = createWayback({ ...deps, fetch: (async (input: string | URL | Request, init?: RequestInit) => cdxFresh(input, init)) as typeof fetch });
    const wrapped = { ...freshWayback, firstCapture: (url: string, o?: { step?: string }) => freshWayback.firstCapture(`${url}#fresh`, o) };
    const replay = await walkClaim(claim, {
      tavily: createTavily({ ...deps, fetch: pages.impl, apiKey: "test-key" }), wayback: wrapped, usage, budget, rules,
      today: "2026-11-02", now: () => "2026-11-03T00:00:00.000Z", pagesDir: join(dir, "pages"), replayOf: first.trace,
    });
    expect(replay.trace.mode).toBe("REPLAY");
    expect(replay.trace.recordedAt).toBe(first.trace.recordedAt);
    expect(replay.trace.usage.slice(0, first.trace.usage.length)).toEqual(first.trace.usage);
    expect(replay.trace.usage.slice(first.trace.usage.length).every((r) => r.service === "wayback" && !r.cacheHit)).toBe(true);
    expect(replay.trace.usage.length).toBeGreaterThan(first.trace.usage.length);
  });
});

describe("replay guard", () => {
  it("[C14] refuses to replay a recorded trace of a different claim, before any call", async () => {
    const pages = world([newer, older]);
    const first = await run(pages.impl);
    const calls = pages.calls.length;
    await expect(run(pages.impl, 150, rules, { replayOf: { ...first.trace, id: "another-claim" } })).rejects.toThrow(/another-claim/);
    expect(pages.calls.length).toBe(calls);
  });
});
