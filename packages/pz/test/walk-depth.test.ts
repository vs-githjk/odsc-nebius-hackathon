import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Trace } from "pz/schema";
import { createBudget } from "../src/clients/budget.ts";
import { createFileCache } from "../src/clients/cache.ts";
import { createTavily } from "../src/clients/tavily.ts";
import { createWayback } from "../src/clients/wayback.ts";
import { LINK_ROUNDS_WITHOUT_PROGRESS, walkStep } from "../src/engine/walk.ts";
import { decideStopState, loadRules, type Rules } from "../src/rules/index.ts";
import { createUsageLog } from "../src/usage/log.ts";

// F7 (#192): caps.depth counts steps back in time; rounds that only follow citations have their own small limit.
const base = loadRules();
const rules = (depth: number): Rules => ({ ...base, caps: { ...base.caps, depth } });
const atoms = {
  number: { raw: "14", canonical: "14" }, unit: "times", subjectLemma: "penguins",
  population: null, time: null, hedge: null, namedSource: null, variants: ["14 times"],
};

type Page = { url: string; date: string | null; text: string; searchable: boolean };
// Search serves the newest searchable page on or before the window end (one page per window, so each window can only
// step back once); extract serves any page. Undated pages are reachable only by following a link.
function world(pages: Page[]) {
  const extracted: string[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/cdx/")) return new Response("[]");
    const body = JSON.parse(String(init?.body));
    if (url.endsWith("/search")) {
      const hit = pages
        .filter((p) => p.searchable && p.date !== null && (!body.end_date || p.date <= body.end_date))
        .sort((a, b) => b.date!.localeCompare(a.date!))[0];
      const results = hit ? [{ url: hit.url, title: "A page", content: hit.text.slice(0, 80), score: 0.5, published_date: hit.date }] : [];
      return new Response(JSON.stringify({ query: body.query, results, usage: { credits: 1 } }));
    }
    extracted.push(...body.urls);
    const results = pages.filter((p) => body.urls.includes(p.url)).map((p) => ({ url: p.url, title: "A page", raw_content: p.text }));
    return new Response(JSON.stringify({ results, failed_results: [], usage: { credits: 1 } }));
  }) as typeof fetch;
  return { impl, extracted };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pz-f7-"));
});

const handed = Trace.parse({
  schemaVersion: "1", id: "f7", mode: "LIVE", synthetic: false, recordedAt: "2026-11-12T00:00:00.000Z",
  claim: { text: "Harbor Zoo penguins nap 14 times a day.", atoms }, viralSentence: "Harbor Zoo penguins nap 14 times a day.",
  nodes: [], edges: [], clusters: [], spans: [], hops: [], blame: [],
  roots: { pages: 0, clusters: 0, rootsLinked: 0, clustersUnlinked: 0, studiesFound: null }, redHopEdgeId: null,
  earliest: { nodeIds: [], earlierWindowSearches: 0, earlierFound: 0 }, failure: null,
  budget: { credits: 0, usd: 0, ms: 0, capHit: null },
  decision: { state: "NO_PAGES_FOUND", row: 3, reasons: [], counts: {} }, searchLog: [], usage: [], scopeNote: "",
});

async function walk(pages: Page[], r: Rules) {
  const w = world(pages);
  const t = await walkStep(() => {
    const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
    const b = { fetch: w.impl, usage, cache: createFileCache(join(dir, "http")), budget: createBudget(500), traceId: "f7" };
    return {
      tavily: createTavily({ ...b, apiKey: "test-key" }), wayback: createWayback(b), usage, budget: b.budget, rules: r,
      today: "2026-11-12", now: () => "2026-11-12T00:00:00.000Z", pagesDir: join(dir, "pages"),
    };
  })(handed, {});
  return { t, extracted: w.extracted };
}

describe("F7: the depth cap counts steps back, not link rounds (#192)", () => {
  // A cold claim: one dated page, then a chain of pages that each cite the next and are never earlier (undated).
  const chain = Array.from({ length: 6 }, (_, i) => `https://chain.example/${i + 1}`);
  const cites = (url: string) => `Keepers say penguins nap 14 times a day, as [this report](${url}) also says.`;
  const pages: Page[] = [
    { url: "https://news.example/2020", date: "2020-05-01", text: cites(chain[0]!), searchable: true },
    ...chain.map((url, i) => ({ url, date: null, text: chain[i + 1] ? cites(chain[i + 1]!) : "Keepers say penguins nap 14 times a day.", searchable: false })),
  ];

  it("a long citation chain that never reaches an earlier page stops after a few idle rounds, without a cap hit", async () => {
    // Before F7 every link round counted as depth: with a depth cap of 3 this walk ended PARTIAL ("depth").
    const { t, extracted } = await walk(pages, rules(3));
    expect(t.budget.capHit).toBeNull();
    expect(decideStopState(t, rules(3)).state).not.toBe("PARTIAL");
    const followed = chain.filter((u) => extracted.includes(u));
    expect(followed.length).toBe(LINK_ROUNDS_WITHOUT_PROGRESS);
    expect(extracted).not.toContain(chain.at(-1));
  });

  it("a trail that keeps stepping back still stops at the depth cap, as a cap hit", async () => {
    const years = ["2024", "2022", "2020", "2018", "2016", "2014"];
    const steps: Page[] = years.map((y) => ({ url: `https://site${y}.example/report`, date: `${y}-03-01`, text: `Keepers at the ${["north", "south", "east", "west", "old", "new"][years.indexOf(y)]} pool said penguins nap 14 times a day.`, searchable: true }));
    const { t, extracted } = await walk(steps, rules(3));
    expect(t.budget.capHit).toBe("depth");
    // Three steps back: 2024, then 2022, then 2020. The 2018 page was never reached.
    expect(extracted).toContain("https://site2020.example/report");
    expect(extracted).not.toContain("https://site2018.example/report");
  });
});

describe("time reserve: a trail that keeps stepping back stops at 70% of the time cap (#192 F2, dev-05)", () => {
  it("starts no round after caps.walkShare (0.7) of caps.ms, and says it stopped at the time cap", async () => {
    // Forty years of pages, each a step back, so only the clock can end this walk. Each search costs 40 s.
    const years = Array.from({ length: 40 }, (_, i) => 2024 - i);
    const steps: Page[] = years.map((y, i) => ({ url: `https://site${y}.example/report`, date: `${y}-03-01`, text: `Keepers at pool number ${String.fromCharCode(97 + (i % 26))} said penguins nap 14 times a day.`, searchable: true }));
    const r: Rules = { ...base, caps: { ...base.caps, depth: 100, ms: 300_000 } };
    const w = world(steps);
    let now = 0;
    const timed = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/search")) now += 40_000;
      return w.impl(input, init);
    }) as typeof fetch;
    const t = await walkStep(() => {
      const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
      const b = { fetch: timed, usage, cache: createFileCache(join(dir, "http")), budget: createBudget(5000), traceId: "f7-time" };
      return {
        tavily: createTavily({ ...b, apiKey: "test-key" }), wayback: createWayback(b), usage, budget: b.budget, rules: r,
        today: "2026-11-12", now: () => "2026-11-12T00:00:00.000Z", pagesDir: join(dir, "pages"), clockMs: () => now,
      };
    })(handed, {});
    expect(t.budget.capHit).toBe("ms");
    // The last round started before 210 s; it may finish past it, but the walk never runs on to the 300 s cap.
    expect(r.caps.walkShare).toBe(0.7);
    expect(now).toBeGreaterThanOrEqual(300_000 * r.caps.walkShare);
    expect(now).toBeLessThan(300_000);
  });
});
