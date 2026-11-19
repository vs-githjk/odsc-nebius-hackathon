import { mkdtempSync, readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBudget } from "../src/clients/budget.ts";
import { createFileCache } from "../src/clients/cache.ts";
import { createTavily } from "../src/clients/tavily.ts";
import { createWayback, MAX_CAPTURE_BYTES } from "../src/clients/wayback.ts";
import { dateNode } from "../src/engine/dating.ts";
import { pageHoldsSpan, wordsOf } from "../src/engine/capture.ts";
import { pdfText } from "../src/clients/pdf-text.ts";
import { walkClaim, type SpikeClaim } from "../src/engine/walk.ts";
import { loadRules } from "../src/rules/index.ts";
import { Trace } from "../src/schema/trace.ts";
import { createUsageLog } from "../src/usage/log.ts";

// L19: a first archive capture dates a URL, not a sentence. The capture is read, and the date stands only if it holds the claim.
const fixture = Trace.parse(JSON.parse(readFileSync(new URL("../../../fixtures/traces/sample-rich.json", import.meta.url), "utf8")));
const base = fixture.nodes.find((n) => n.id === "coast-news")!;

const SPAN = "At current rates plastic is expected to outweigh all the fish in the sea by 2050.";
const OCEAN = "http://www.biologicaldiversity.org/campaigns/ocean_plastics/";
const WEF = "https://www3.weforum.org/docs/WEF_The_New_Plastics_Economy.pdf";
const html = (body: string) => `<!doctype html><html><head><title>t</title><script>var x = "outweigh all the fish in the sea by 2050";</script></head><body>${body}</body></html>`;

type Archive = { first: string | null; body?: { type: string; text: string | Buffer } | { status: number; location?: string } | "timeout"; changed?: boolean };
function archive(table: Record<string, Archive>) {
  const seen: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    seen.push(url);
    const capture = /^https:\/\/web\.archive\.org\/web\/(\d+)id_\/(.+)$/.exec(url);
    if (capture) {
      const entry = table[capture[2]!];
      const body = entry?.body;
      if (body === "timeout") throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
      if (!body || "status" in body) return new Response("gone", { status: body && "status" in body ? body.status : 404, ...(body && "location" in body && body.location ? { headers: { location: body.location } } : {}) });
      return new Response(typeof body.text === "string" ? body.text : new Uint8Array(body.text), { headers: { "content-type": body.type } });
    }
    const target = new URL(url).searchParams.get("url")!;
    const entry = table[target];
    if (new URL(url).searchParams.get("collapse") === "digest") {
      return new Response(JSON.stringify([["timestamp", "digest"], ["20160120000000", "A"], ...(entry?.changed ? [["20200101000000", "B"]] : [])]));
    }
    return new Response(JSON.stringify(entry?.first ? [["timestamp", "original"], [`${entry.first.replaceAll("-", "")}000000`, target]] : [["timestamp", "original"]]));
  }) as typeof fetch;
  const dir = mkdtempSync(join(tmpdir(), "pz-capture-"));
  const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
  const wayback = createWayback({ fetch: fetchImpl, usage, cache: createFileCache(join(dir, "http")), sleep: async () => {} });
  return { wayback, seen, captureCalls: () => seen.filter((u) => u.includes("id_/")).length };
}
const node = (url: string) => ({ ...base, url });

describe("L19 a first archive capture dates the page only if it holds the claim", () => {
  it("1. a capture that lacks the sentence dates nothing (dev-10, biologicaldiversity.org 2013)", async () => {
    const a = archive({ [OCEAN]: { first: "2013-06-13", body: { type: "text/html", text: html("<h1>Ocean plastics</h1><p>Plastic pollution harms seabirds and turtles.</p>") } } });
    const { node: dated, extraUsage, note } = await dateNode(node(OCEAN), {}, a.wayback, [SPAN]);
    expect(dated.date).toMatchObject({ kind: "unconfirmed", value: null, firstCapture: "2013-06-13" });
    expect(extraUsage).toHaveLength(1);
    expect(extraUsage[0]).toMatchObject({ service: "wayback", endpoint: "capture", step: "dating", credits: 0 });
    expect(note).toContain("does not hold the claim's sentence");
  });

  it("2. a capture that holds the sentence keeps the existed_by date, even across tags, entities and curly quotes", async () => {
    const text = html("<p>At current rates <a href='/x'>plastic</a> is expected to <em>outweigh</em> all the fish in the&nbsp;sea by&nbsp;2050.</p>");
    const a = archive({ [WEF]: { first: "2016-01-20", body: { type: "text/html; charset=utf-8", text } } });
    const { node: dated } = await dateNode(node(WEF), {}, a.wayback, [SPAN]);
    expect(dated.date).toEqual({ kind: "existed_by", value: "2016-01-20", source: "wayback_first_capture", firstCapture: "2016-01-20", conflictingDate: false });
  });

  it("3. a capture that cannot be read (404, timeout) leaves the date unconfirmed with value null", async () => {
    for (const body of [{ status: 404 }, "timeout" as const]) {
      const a = archive({ [OCEAN]: { first: "2013-06-13", body } });
      const { node: dated, note } = await dateNode(node(OCEAN), {}, a.wayback, [SPAN]);
      expect(dated.date).toMatchObject({ kind: "unconfirmed", value: null, firstCapture: "2013-06-13" });
      expect(note).toContain("could not be read");
    }
  });

  it("4. a listing page that never held the 2023 sentence is not dated (dev-17, pulse.microsoft.com)", async () => {
    const url = "https://pulse.microsoft.com/en/discover/customer-stories-en";
    const a = archive({ [url]: { first: "2019-04-03", body: { type: "text/html", text: html("<ul><li>Customer story one</li><li>Customer story two</li></ul>") } } });
    const { node: dated } = await dateNode(node(url), {}, a.wayback, ["One year ago, ChatGPT launched and changed how we work."]);
    expect(dated.date).toMatchObject({ kind: "unconfirmed", value: null });
  });

  it("5. a PDF keeps its date only when the archive holds one version of the file; a changed file is unconfirmed", async () => {
    const pdf = { type: "application/pdf", text: "%PDF-1.5 binary \u0000\u0001" };
    const same = archive({ [WEF]: { first: "2016-01-20", body: pdf } });
    expect((await dateNode(node(WEF), {}, same.wayback, [SPAN])).node.date).toMatchObject({ kind: "existed_by", value: "2016-01-20" });
    const changed = archive({ [WEF]: { first: "2016-01-20", body: pdf, changed: true } });
    const out = await dateNode(node(WEF), {}, changed.wayback, [SPAN]);
    expect(out.node.date).toMatchObject({ kind: "unconfirmed", value: null, firstCapture: "2016-01-20" });
    expect(out.note).toContain("more than one version");
  });

  it("5b. a PDF whose text we can read is searched like a page: it holds the sentence even if the file changed later (dev-10 WEF report)", async () => {
    const filler = "Industry Agenda The New Plastics Economy Rethinking the future of plastics January 2016 all rights reserved. ".repeat(6);
    const content = `BT /F1 10 Tf (${filler}) Tj [(At current ) -320 (rates plastic is expected to outweigh all the ) 20 (fish in the sea by 2050.)] TJ ET`;
    const make = (compress: boolean) => {
      const data = compress ? deflateSync(Buffer.from(content, "latin1")) : Buffer.from(content, "latin1");
      return Buffer.concat([Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${data.length}${compress ? " /Filter /FlateDecode" : ""} >>\nstream\n`), data, Buffer.from("\nendstream\nendobj\n%%EOF")]);
    };
    for (const compress of [false, true]) {
      const a = archive({ [WEF]: { first: "2016-01-20", body: { type: "application/pdf", text: make(compress) }, changed: true } });
      const out = await dateNode(node(WEF), {}, a.wayback, [SPAN]);
      expect(out.node.date).toMatchObject({ kind: "existed_by", value: "2016-01-20" });
      expect(a.seen.some((u) => u.includes("collapse=digest"))).toBe(false);
    }
    // Readable but without the sentence: only an unchanged file keeps the date.
    const other = archive({ [WEF]: { first: "2016-01-20", body: { type: "application/pdf", text: make(false) }, changed: true } });
    expect((await dateNode(node(WEF), {}, other.wayback, ["A sentence this report never says about whales and cheese."])).node.date).toMatchObject({ kind: "unconfirmed", value: null });
    // Even a single archived version does not rescue a readable PDF that lacks the sentence (a file replaced after its capture).
    const unchanged = archive({ [WEF]: { first: "2016-01-20", body: { type: "application/pdf", text: make(false) } } });
    expect((await dateNode(node(WEF), {}, unchanged.wayback, ["A sentence this report never says about whales and cheese."])).node.date).toMatchObject({ kind: "unconfirmed", value: null });
    expect(unchanged.seen.some((u) => u.includes("collapse=digest"))).toBe(false);
  });

  it("5c. PDF ligature glyphs (control codes for fi and fl) do not hide a sentence with fish in it", async () => {
    const filler = "Industry Agenda The New Plastics Economy Rethinking the future of plastics January 2016 all rights reserved. ".repeat(6);
    const content = `BT /F1 10 Tf (${filler}) Tj [(At current rates plastic is expected to outweigh all the ) 20 (\x1fsh in the sea by 2050. The bene\x1fts are clear.)] TJ ET`;
    const data = Buffer.from(content, "latin1");
    const pdf = Buffer.concat([Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${data.length} >>\nstream\n`), data, Buffer.from("\nendstream\nendobj\n")]);
    const a = archive({ [WEF]: { first: "2016-01-20", body: { type: "application/pdf", text: pdf }, changed: true } });
    expect((await dateNode(node(WEF), {}, a.wayback, [SPAN])).node.date).toMatchObject({ kind: "existed_by", value: "2016-01-20" });
    expect((await dateNode(node(WEF), {}, a.wayback, ["At current rates plastic is expected to outweigh all the whales in the sea by 2050."])).node.date).toMatchObject({ kind: "unconfirmed", value: null });
  });

  it("5d. a high-ratio stream hits the inflate cap and the file degrades to cannot-verify; an oversized response is never read", async () => {
    const bomb = deflateSync(Buffer.alloc(6 * 2 ** 20, 0x20));
    expect(bomb.length).toBeLessThan(20_000);
    const pdf = Buffer.concat([Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${bomb.length} /Filter /FlateDecode >>\nstream\n`), bomb, Buffer.from("\nendstream\nendobj\n")]);
    const a = archive({ [WEF]: { first: "2016-01-20", body: { type: "application/pdf", text: pdf }, changed: true } });
    const got = await a.wayback.captureBody(WEF, "20160120000000");
    expect(got.data).toEqual({ kind: "binary", text: "" });
    expect((await dateNode(node(WEF), {}, a.wayback, [SPAN])).node.date).toMatchObject({ kind: "unconfirmed", value: null });
    const big = archive({ [WEF]: { first: "2016-01-20", body: { type: "text/html", text: Buffer.alloc(MAX_CAPTURE_BYTES + 10, 0x61) } } });
    expect((await big.wayback.captureBody(WEF, "20160120000000")).data).toEqual({ kind: "binary", text: "" });
  });

  it("5e. a redirect to another capture cannot be verified", async () => {
    const a = archive({ [OCEAN]: { first: "2013-06-13", body: { status: 302 } } });
    const out = await dateNode(node(OCEAN), {}, a.wayback, [SPAN]);
    expect(out.node.date).toMatchObject({ kind: "unconfirmed", value: null });
    expect(out.note).toContain("could not be read");
  });

  it("5g. a redirect to the same capture's canonical spelling is followed; one to another timestamp withholds", async () => {
    const bare = "https://market.biz/signal-statistics";
    const signal = "It is reported that Signal has approximately 100 million monthly active users globally.";
    const page = { type: "text/html", text: `<p>${signal}</p>` };
    const same = archive({
      [bare]: { first: "2025-09-06", body: { status: 302, location: `/web/20250906000000id_/${bare}/` } },
      [`${bare}/`]: { first: "2025-09-06", body: page },
    });
    expect((await dateNode(node(bare), {}, same.wayback, [signal])).node.date).toMatchObject({ kind: "existed_by", value: "2025-09-06" });
    const other = archive({
      [bare]: { first: "2025-09-06", body: { status: 302, location: `https://web.archive.org/web/20260101000000id_/${bare}/` } },
      [`${bare}/`]: { first: "2025-09-06", body: page },
    });
    const out = await dateNode(node(bare), {}, other.wayback, [signal]);
    expect(out.node.date).toMatchObject({ kind: "unconfirmed", value: null });
    expect(out.note).toContain("could not be read");
    // A loop of same-capture redirects stops after two hops.
    const loop = archive({ [bare]: { first: "2025-09-06", body: { status: 302, location: `/web/20250906000000id_/${bare}` } } });
    expect((await dateNode(node(bare), {}, loop.wayback, [signal])).node.date).toMatchObject({ kind: "unconfirmed", value: null });
    expect(loop.seen.filter((u) => u.includes("id_/")).length).toBe(3);
  });

  it("5h. hostile PDFs are read in bounded time: a wall of brackets, and thousands of stream keywords with no end", () => {
    const started = performance.now();
    const brackets = deflateSync(Buffer.from("BT (x) Tj " + "[".repeat(3.5 * 2 ** 20) + "] ET"));
    const wall = Buffer.concat([Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${brackets.length} /Filter /FlateDecode >>\nstream\n`), brackets, Buffer.from("\nendstream\n")]);
    expect(brackets.length).toBeLessThan(10_000);
    expect(pdfText(wall)).toContain("x");
    expect(pdfText(Buffer.from("%PDF-1.4\n" + "stream\n".repeat(200_000)))).toBe("");
    expect(pdfText(Buffer.from("%PDF-1.4\n" + "(".repeat(2_000_000)))).toBe("");
    expect(performance.now() - started).toBeLessThan(5000);
  });

  it("5i. ligature folding applies only inside words that held a control code: fiat is not flat", () => {
    const plain = wordsOf("The flat rate of tax applies now. Also the fish swim.", false, true);
    expect(pageHoldsSpan(plain, "The fiat rate of tax applies now", true)).toBe(false);
    expect(pageHoldsSpan(plain, "The flat rate of tax applies now", true)).toBe(true);
    const coded = wordsOf("The \u001fat rate of tax applies now.", false, true);
    expect(pageHoldsSpan(coded, "The flat rate of tax applies now", true)).toBe(true);
    expect(pageHoldsSpan(coded, "The fiat rate of tax applies now", true)).toBe(true);
    expect(pageHoldsSpan(coded, "The cat rate of tax applies now", true)).toBe(false);
  });

  it("5f. a span of fewer than six words never matches, and a place after a negation does not count", () => {
    expect(pageHoldsSpan(wordsOf("<p>Plastic outweighs fish by 2050.</p>"), "Plastic outweighs fish by 2050.")).toBe(false);
    const sentence = "Plastic is expected to outweigh all the fish in the sea by 2050";
    expect(pageHoldsSpan(wordsOf(`<p>It is a myth that ${sentence}.</p>`), sentence)).toBe(false);
    expect(pageHoldsSpan(wordsOf(`<p>It is a myth that ${sentence}.</p><p>${sentence}.</p>`), sentence)).toBe(true);
    expect(pageHoldsSpan(wordsOf(`<p>${sentence}.</p>`), sentence)).toBe(true);
  });

  it("6. a page dated by its own metadata or byline, on or before the capture, makes no capture request", async () => {
    const a = archive({ [OCEAN]: { first: "2013-06-13", body: { type: "text/html", text: html("<p>nothing</p>") } } });
    const meta = await dateNode(node(OCEAN), { metadata: "2012-05-01" }, a.wayback, [SPAN]);
    const byline = await dateNode(node(OCEAN), { byline: "2013-06-13" }, a.wayback, [SPAN]);
    expect(meta.node.date).toMatchObject({ kind: "published", value: "2012-05-01" });
    expect(byline.node.date).toMatchObject({ kind: "published", value: "2013-06-13" });
    expect(a.captureCalls()).toBe(0);
  });

  it("a later metadata date still stands when the capture lacks the claim, and the date_cap check stays quiet", async () => {
    const a = archive({ [OCEAN]: { first: "2013-06-13", body: { type: "text/html", text: html("<p>nothing</p>") } } });
    const { node: dated } = await dateNode(node(OCEAN), { metadata: "2019-02-02" }, a.wayback, [SPAN]);
    expect(dated.date).toMatchObject({ kind: "published", value: "2019-02-02", firstCapture: null, conflictingDate: false });
  });

  it("matches whole words in order, never a different sentence", () => {
    const page = wordsOf("<p>Plastic is expected to outweigh fish by 2040.</p>");
    expect(pageHoldsSpan(page, SPAN)).toBe(false);
    expect(pageHoldsSpan(wordsOf(`<p>${SPAN}</p>`), SPAN)).toBe(true);
    expect(pageHoldsSpan(wordsOf("<p>xAt current rates plastic is expected to outweigh all the fish in the sea by 2050</p>"), SPAN)).toBe(false);
    expect(pageHoldsSpan(wordsOf("<script>" + SPAN + "</script>"), SPAN)).toBe(false);
  });
});

describe("L19 in the walk's own dating", () => {
  const claim: SpikeClaim = {
    id: "cap", text: "Harbor Zoo penguins nap 14 times a day.",
    atoms: { number: { raw: "14", canonical: "14" }, unit: "times", subjectLemma: "penguin", population: null, time: null, hedge: null, namedSource: null, variants: ["14 times"] },
  };
  const page = { url: "https://zoo.example/data", text: "Keepers found the penguins nap 14 times a day." };
  async function run(capture: string) {
    const dir = mkdtempSync(join(tmpdir(), "pz-capwalk-"));
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/cdx/")) return new Response(JSON.stringify([["timestamp", "original"], ["20190502000000", page.url]]));
      if (url.includes("id_/")) return new Response(capture, { headers: { "content-type": "text/html" } });
      const body = JSON.parse(String(init?.body));
      if (url.endsWith("/search")) return new Response(JSON.stringify({ query: body.query, results: [{ url: page.url, title: "A page", content: page.text, score: 0.5, published_date: null }], usage: { credits: 1 } }));
      return new Response(JSON.stringify({ results: [{ url: page.url, title: "A page", raw_content: page.text }], failed_results: [], usage: { credits: 1 } }));
    }) as typeof fetch;
    const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
    const deps = { fetch: fetchImpl, usage, cache: createFileCache(join(dir, "http")), budget: createBudget(150), traceId: claim.id };
    return walkClaim(claim, { tavily: createTavily({ ...deps, apiKey: "k" }), wayback: createWayback(deps), usage, budget: deps.budget, rules: loadRules(),
      today: "2026-11-02", now: () => "2026-11-02T00:00:00.000Z", pagesDir: join(dir, "pages") });
  }
  it("a capture that holds the sentence dates the page from it; one that lacks it does not", async () => {
    const held = await run("<p>Keepers found the penguins nap 14 times a day.</p>");
    expect(held.trace.nodes[0]!.date).toMatchObject({ kind: "existed_by", value: "2019-05-02" });
    const lacking = await run("<p>A page about zoo hours.</p>");
    expect(lacking.trace.nodes[0]!.date).toMatchObject({ kind: "unconfirmed", value: null, firstCapture: "2019-05-02" });
    expect(lacking.trace.spans[0]!.waybackUrl).toBeNull();
    expect(lacking.trace.earliest.nodeIds).toEqual([]);
  });
});
