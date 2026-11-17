import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Trace } from "pz/schema";
import { createBudget } from "../src/clients/budget.ts";
import { createFileCache } from "../src/clients/cache.ts";
import { createTavily } from "../src/clients/tavily.ts";
import { createWayback } from "../src/clients/wayback.ts";
import { linkEdges, spansStep } from "../src/engine/spans.ts";
import { toPlain } from "../src/engine/walk.ts";
import { walkStep } from "../src/engine/walk.ts";
import { loadRules } from "../src/rules/index.ts";
import { createUsageLog } from "../src/usage/log.ts";
import { verifyTrace } from "../src/verify/checks.ts";

const rules = loadRules();
const atoms = {
  number: { raw: "14", canonical: "14" }, unit: "times", subjectLemma: "penguins",
  population: null, time: null, hedge: null, namedSource: null, variants: ["14 times"],
};

type Page = { url: string; date: string | null; text: string; title?: string };
// Recorded-style Tavily and CDX: search serves pages inside the date window; extract serves every page it knows,
// and reports the ones in `dead` as failed.
function world(pages: Page[], dead: string[] = []) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/cdx/")) return new Response("[]");
    const body = JSON.parse(String(init?.body));
    if (url.endsWith("/search")) {
      const results = pages
        .filter((p) => !body.end_date || (p.date !== null && p.date <= body.end_date))
        .map((p) => ({ url: p.url, title: p.title ?? "A page", content: p.text.slice(0, 80), score: 0.5, published_date: p.date }));
      return new Response(JSON.stringify({ query: body.query, results, usage: { credits: 1 } }));
    }
    const asked: string[] = body.urls;
    const results = pages.filter((p) => asked.includes(p.url) && !dead.includes(p.url)).map((p) => ({ url: p.url, title: p.title ?? "A page", raw_content: p.text }));
    const failed = asked.filter((u) => dead.includes(u)).map((u) => ({ url: u, error: "unreachable" }));
    return new Response(JSON.stringify({ results, failed_results: failed, usage: { credits: 1 } }));
  }) as typeof fetch;
}

let dir: string;
const build = (fetchImpl: typeof fetch) => () => {
  const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
  const base = { fetch: fetchImpl, usage, cache: createFileCache(join(dir, "http")), budget: createBudget(150), traceId: "neutral" };
  return {
    tavily: createTavily({ ...base, apiKey: "test-key" }), wayback: createWayback(base), usage, budget: base.budget, rules,
    today: "2026-11-10", now: () => "2026-11-10T00:00:00.000Z", pagesDir: join(dir, "pages"),
  };
};

const handedOver: Trace = Trace.parse({
  schemaVersion: "1", id: "neutral", mode: "LIVE", synthetic: false, recordedAt: "2026-11-10T00:00:00.000Z",
  claim: { text: "Harbor Zoo penguins nap 14 times a day.", atoms }, viralSentence: "Harbor Zoo penguins nap 14 times a day.",
  nodes: [], edges: [], clusters: [], spans: [], hops: [], blame: [],
  roots: { pages: 0, clusters: 0, rootsLinked: 0, clustersUnlinked: 0, studiesFound: null }, redHopEdgeId: null,
  earliest: { nodeIds: [], earlierWindowSearches: 0, earlierFound: 0 }, failure: null,
  budget: { credits: 0, usd: 0, ms: 0, capHit: null },
  decision: { state: "NO_PAGES_FOUND", row: 3, reasons: [], counts: {} }, searchLog: [], usage: [], scopeNote: "",
});

const walkThenSpans = async (pages: Page[], dead: string[] = []) => spansStep()(await walkStep(build(world(pages, dead)))(handedOver, {}), {});
const nodeAt = (t: Trace, url: string) => t.nodes.find((n) => n.url === url);

const older: Page = { url: "https://blog.example/old", date: "2012-02-08", text: "Our keepers noted that penguins nap 14 times a day." };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pz-spans-"));
});

describe("spans and links (T24)", () => {
  it("[C2] a link beside the span to a page in the trace makes an explicit edge, backed by both pages' spans", async () => {
    const child: Page = { url: "https://news.example/new", date: "2020-05-01", text: "Report: penguins nap 14 times a day. See [the older post](https://blog.example/old) for more." };
    const t = await walkThenSpans([child, older]);
    const parent = nodeAt(t, older.url)!;
    const kid = nodeAt(t, child.url)!;
    expect(t.edges).toEqual([
      { id: "e1", parentId: parent.id, childId: kid.id, kind: "explicit", parentSpanId: parent.spanIds[0], childSpanId: kid.spanIds[0], linkHref: older.url },
    ]);
    expect(verifyTrace(t, { rules }).failures.filter((f) => f.check === "edge_spans" || f.check === "edge_kind")).toEqual([]);
  });

  it("[C2] a link far from the span is not a citation of the claim and makes no edge", async () => {
    const padding = `${"word ".repeat(60).trim()}. `;
    const child: Page = {
      url: "https://news.example/new", date: "2020-05-01",
      text: `See [the older post](https://blog.example/old). ${padding}Report: penguins nap 14 times a day.`,
    };
    const t = await walkThenSpans([child, older]);
    expect(t.edges).toEqual([]);
    expect(nodeAt(t, child.url)?.candidateParents).toEqual([]);
  });

  it("[C2] the link resolves to the parent through fragments and trailing slashes", async () => {
    const child: Page = { url: "https://news.example/new", date: "2020-05-01", text: "Report: penguins nap 14 times a day, as [the blog](https://blog.example/old/#notes) wrote." };
    const t = await walkThenSpans([child, older]);
    expect(t.edges.map((e) => [nodeAt(t, child.url)?.id === e.childId, e.linkHref])).toEqual([[true, "https://blog.example/old"]]);
  });

  it("[C2] an unfetchable parent stays a candidate marked read: false, with no edge", async () => {
    const child: Page = { url: "https://news.example/new", date: "2020-05-01", text: "Report: penguins nap 14 times a day. See [the source](https://gone.example/s)." };
    const gone: Page = { url: "https://gone.example/s", date: null, text: "never served" };
    const t = await walkThenSpans([child, gone], [gone.url]);
    expect(nodeAt(t, child.url)?.candidateParents).toEqual([{ url: gone.url, read: false }]);
    expect(t.edges).toEqual([]);
  });

  it("[C1] meta pages never take part in an edge", async () => {
    const meta: Page = { url: "https://checkdesk.example/m", date: "2015-01-01", title: "The myth of penguin naps", text: "Writers repeat that penguins nap 14 times a day, see [this](https://blog.example/old)." };
    const t = await walkThenSpans([meta, older]);
    const metaId = nodeAt(t, meta.url)!.id;
    expect(t.edges.some((e) => e.childId === metaId || e.parentId === metaId)).toBe(false);
  });

  it("[C3] the spans stage only adds link-verified edges; inferred edges wait for dates", async () => {
    const plain: Page = { url: "https://news.example/new", date: "2020-05-01", text: "Report: penguins nap 14 times a day." };
    const t = await walkThenSpans([plain, older]);
    expect(t.edges).toEqual([]);
  });

  it("linkEdges is pure: same trace in, same edges out, nothing else changed", async () => {
    const child: Page = { url: "https://news.example/new", date: "2020-05-01", text: "Report: penguins nap 14 times a day. See [the older post](https://blog.example/old)." };
    const walked = await walkStep(build(world([child, older])))(handedOver, {});
    expect(linkEdges(walked)).toEqual(linkEdges(walked));
    expect(spansStep()(walked, {}).nodes).toEqual(walked.nodes);
  });
});

describe("same-site citations (#108 note)", () => {
  it("[C2] a page citing its own site's older post, beside the span, makes an explicit edge", async () => {
    const child: Page = { url: "https://blog.example/new", date: "2020-05-01", text: "Report: penguins nap 14 times a day, as [we wrote](/old/#notes) before." };
    const t = await walkThenSpans([child, older]);
    const kid = nodeAt(t, child.url)!;
    const parent = nodeAt(t, older.url)!;
    expect(t.edges.map((e) => [e.childId, e.parentId, e.linkHref])).toEqual([[kid.id, parent.id, older.url]]);
  });

  it("[C2] a link back to the page itself is never a parent", async () => {
    const self: Page = { url: "https://blog.example/old", date: "2012-02-08", text: "Our keepers noted that penguins nap 14 times a day ([permalink](https://blog.example/old#top))." };
    const t = await walkThenSpans([self]);
    expect(nodeAt(t, self.url)?.candidateParents).toEqual([]);
    expect(t.edges).toEqual([]);
  });
});

describe("same paragraph only (#108 review)", () => {
  it("[C2] a menu row after a blank line is never a citation, even with the parent page on the same site", async () => {
    const child: Page = { url: "https://blog.example/new", date: "2020-05-01", text: "Report: penguins nap 14 times a day.\n\n[Home](/) | [Archive](/old) | [About](/about)" };
    const t = await walkThenSpans([child, older]);
    expect(nodeAt(t, child.url)?.candidateParents).toEqual([]);
    expect(t.edges).toEqual([]);
  });

  it("[C2] a cross-site link in the next paragraph is not a citation of the span either", async () => {
    const child: Page = { url: "https://news.example/new", date: "2020-05-01", text: "Report: penguins nap 14 times a day.\n\nRead [the blog](https://blog.example/old)." };
    const t = await walkThenSpans([child, older]);
    expect(t.edges).toEqual([]);
  });

  it("[C2] a self-link written with www, a tracking query or a fragment is never a parent", async () => {
    const self: Page = { url: "https://blog.example/old", date: "2012-02-08", text: "Our keepers noted that penguins nap 14 times a day ([link](https://www.blog.example/old/?utm_source=feed#top))." };
    const t = await walkThenSpans([self]);
    expect(nodeAt(t, self.url)?.candidateParents).toEqual([]);
  });
});

describe("toPlain paragraph breaks", () => {
  it("reports where blank lines were without changing the text or the link offsets", () => {
    const { text, links, breaks } = toPlain("First line about [a](https://a.example).\n\n  \nSecond line with [b](https://b.example).");
    expect(text).toBe("First line about a. Second line with b.");
    expect(breaks).toEqual([text.indexOf("Second")]);
    expect(links.map((l) => text.slice(l.start, l.end))).toEqual(["a", "b"]);
  });
});
