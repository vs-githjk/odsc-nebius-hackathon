import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createBudget } from "../src/clients/budget.ts";
import { cacheKey, createFileCache } from "../src/clients/cache.ts";
import { ClientError, createPageFetcher } from "../src/clients/http.ts";
import { createTavily } from "../src/clients/tavily.ts";
import { WAYBACK_TIMEOUT_MS, createWayback } from "../src/clients/wayback.ts";
import { createUsageLog } from "../src/usage/log.ts";
import { UsageRow } from "pz/schema";

const KEY = "tvly-test-secret-value";
const recorded = (name: string) =>
  readFileSync(new URL(`./recorded/tavily/${name}.json`, import.meta.url), "utf8");

type Seen = { url: string; init: RequestInit };

function fakeFetch(...replies: (() => Response | Promise<Response>)[]) {
  const seen: Seen[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), init: init ?? {} });
    const reply = replies[Math.min(seen.length - 1, replies.length - 1)];
    if (!reply) throw new Error("no reply set");
    return reply();
  }) as typeof fetch;
  return { impl, seen };
}

let dir: string;
const setup = (fetchImpl: typeof fetch, maxCredits = 100) => {
  const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
  const cache = createFileCache(join(dir, "http"));
  const budget = createBudget(maxCredits);
  const deps = { fetch: fetchImpl, usage, cache, budget, traceId: "t1" };
  return {
    usage,
    cache,
    budget,
    tavily: createTavily({ ...deps, apiKey: KEY }),
    wayback: createWayback(deps),
    fetchPage: createPageFetcher(deps),
  };
};
const searchArgs = {
  query: '"a neutral phrase"',
  exactMatch: true,
  endDate: "2014-12-31",
  includeRawContent: false as const,
  includePublishedDate: true,
  maxResults: 10,
  excludeDomains: ["factcheck.example"],
};
const allOutput = (usagePath: string, cacheDir: string) =>
  readFileSync(usagePath, "utf8") +
  readdirSync(cacheDir)
    .map((f) => readFileSync(join(cacheDir, f), "utf8"))
    .join("");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pz-clients-"));
});

describe("tavily", () => {
  it("sends the request fields the probe found", async () => {
    const { impl, seen } = fakeFetch(() => new Response(recorded("search-exact-end-date")));
    const { tavily } = setup(impl);
    const { data, usage } = await tavily.search(searchArgs);
    expect(seen[0]?.url).toBe("https://api.tavily.com/search");
    expect(JSON.parse(String(seen[0]?.init.body))).toEqual({
      query: '"a neutral phrase"',
      exact_match: true,
      end_date: "2014-12-31",
      include_raw_content: false,
      include_published_date: true,
      max_results: 10,
      exclude_domains: ["factcheck.example"],
      include_usage: true,
    });
    expect(new Headers(seen[0]?.init.headers).get("authorization")).toBe(`Bearer ${KEY}`);
    expect(data.results).toHaveLength(2);
    expect(data.results[0]?.published_date).toBeTruthy();
    expect(UsageRow.parse(usage)).toMatchObject({
      service: "tavily",
      endpoint: "search",
      credits: 1,
      cacheHit: false,
      status: "200",
      traceId: "t1",
    });
  });

  it("sends exact_match only when the query holds a quoted phrase, after straightening curly quotes", async () => {
    const { impl, seen } = fakeFetch(() => new Response(recorded("search-empty")));
    const { tavily } = setup(impl);
    await tavily.search({ ...searchArgs, query: "10,000 steps daily health guideline origin" });
    await tavily.search({ ...searchArgs, query: "\u201C10,000 steps\u201D origin" });
    await tavily.search({ ...searchArgs, query: '"" steps' });
    await tavily.search({ ...searchArgs, query: '"10,000" steps' });
    const sent = seen.map((s) => JSON.parse(String(s.init.body)) as { query: string; exact_match: boolean });
    expect(sent.map((b) => b.exact_match)).toEqual([false, true, false, true]);
    expect(sent[1]?.query).toBe('"10,000 steps" origin');
  });

  it("sends filter_by_published_date and start_date only when asked", async () => {
    const { impl, seen } = fakeFetch(() => new Response(recorded("search-empty")));
    const { tavily } = setup(impl);
    await tavily.search({ ...searchArgs, startDate: "2001-01-01", filterByPublishedDate: true });
    const body = JSON.parse(String(seen[0]?.init.body));
    expect(body.start_date).toBe("2001-01-01");
    expect(body.filter_by_published_date).toBe(true);
  });

  it("extract keeps markdown links and asks for markdown", async () => {
    const { impl, seen } = fakeFetch(() => new Response(recorded("extract-markdown")));
    const { tavily } = setup(impl);
    const { data } = await tavily.extract({
      urls: ["https://en.wikipedia.org/wiki/Creaming_(food)"],
      query: "butter",
      format: "markdown",
    });
    expect(seen[0]?.url).toBe("https://api.tavily.com/extract");
    expect(JSON.parse(String(seen[0]?.init.body))).toMatchObject({ format: "markdown", query: "butter" });
    expect(data.results[0]?.raw_content).toContain("[link](/wiki/Butter)");
  });

  it("retries a 429 once and logs two rows", async () => {
    const { impl, seen } = fakeFetch(
      () => new Response("slow down", { status: 429 }),
      () => new Response(recorded("search-empty")),
    );
    const { tavily, usage } = setup(impl);
    await tavily.search(searchArgs);
    expect(seen).toHaveLength(2);
    expect(usage.rows.map((r) => r.status)).toEqual(["429", "200"]);
    expect(usage.rows.map((r) => r.credits)).toEqual([0, 1]);
    const lines = readFileSync(join(dir, "usage.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    lines.forEach((l) => UsageRow.parse(JSON.parse(l)));
  });

  it("retries a 5xx only once, then gives a typed http_error", async () => {
    const { impl, seen } = fakeFetch(() => new Response("down", { status: 503 }));
    const { tavily } = setup(impl);
    await expect(tavily.search(searchArgs)).rejects.toMatchObject({ code: "http_error", status: 503 });
    expect(seen).toHaveLength(2);
  });

  it("does not retry a 401", async () => {
    const { impl, seen } = fakeFetch(() => new Response("no", { status: 401 }));
    const { tavily } = setup(impl);
    await expect(tavily.search(searchArgs)).rejects.toMatchObject({ code: "http_error", status: 401 });
    expect(seen).toHaveLength(1);
  });

  it("gives bad_response on a body that is not the expected shape", async () => {
    const { impl } = fakeFetch(
      () => new Response("<html>"),
      () => new Response("{}"),
    );
    const { tavily } = setup(impl);
    await expect(tavily.search(searchArgs)).rejects.toMatchObject({ code: "bad_response" });
    await expect(tavily.search({ ...searchArgs, query: "other" })).rejects.toMatchObject({ code: "bad_response" });
  });

  it("gives not_configured with no key and calls nothing", async () => {
    const { impl, seen } = fakeFetch(() => new Response(recorded("search-empty")));
    const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
    const tavily = createTavily({ fetch: impl, usage, cache: createFileCache(join(dir, "http")), apiKey: "" });
    await expect(tavily.search(searchArgs)).rejects.toMatchObject({ code: "not_configured" });
    expect(seen).toHaveLength(0);
  });

  it("a cache hit logs cacheHit and 0 credits without a call", async () => {
    const { impl, seen } = fakeFetch(() => new Response(recorded("search-exact-end-date")));
    const { tavily, usage, budget } = setup(impl, 10);
    const first = await tavily.search(searchArgs);
    const second = await tavily.search(searchArgs);
    expect(seen).toHaveLength(1);
    expect(second.data).toEqual(first.data);
    expect(usage.rows[1]).toMatchObject({ cacheHit: true, credits: 0, costUsd: 0 });
    expect(budget.left()).toBe(9);
  });

  it("a failed call is not cached", async () => {
    const { impl, seen } = fakeFetch(
      () => new Response("no", { status: 401 }),
      () => new Response(recorded("search-empty")),
    );
    const { tavily } = setup(impl);
    await expect(tavily.search(searchArgs)).rejects.toBeInstanceOf(ClientError);
    await tavily.search(searchArgs);
    expect(seen).toHaveLength(2);
  });
});

describe("cache", () => {
  it("the key is a sha256 of the request and never depends on the api key", async () => {
    const a = fakeFetch(() => new Response(recorded("search-empty")));
    const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
    const cache = createFileCache(join(dir, "http"));
    await createTavily({ fetch: a.impl, usage, cache, apiKey: "key-one" }).search(searchArgs);
    await createTavily({ fetch: a.impl, usage, cache, apiKey: "key-two" }).search(searchArgs);
    expect(a.seen).toHaveLength(1);
    expect(cacheKey({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("budget", () => {
  it("throws budget_exceeded before calling when credits left are below the call's maximum", async () => {
    const budget = createBudget(1);
    expect(() => budget.beforeCall(1)).not.toThrow();
    expect(() => budget.beforeCall(2)).toThrow(expect.objectContaining({ code: "budget_exceeded" }));
    const { impl, seen } = fakeFetch(() => new Response(recorded("search-empty")));
    const { tavily } = setup(impl, 0);
    await expect(tavily.search(searchArgs)).rejects.toMatchObject({ code: "budget_exceeded" });
    expect(seen).toHaveLength(0);
  });

  it("budgets one credit per five urls on extract", async () => {
    const { impl, seen } = fakeFetch(() => new Response(recorded("extract-markdown")));
    const { tavily } = setup(impl, 1);
    const urls = Array.from({ length: 6 }, (_, i) => `https://a.example/${i}`);
    await expect(tavily.extract({ urls, format: "markdown" })).rejects.toMatchObject({ code: "budget_exceeded" });
    await tavily.extract({ urls: urls.slice(0, 5), format: "markdown" });
    expect(seen).toHaveLength(1);
  });
});

describe("secrets", () => {
  it("no row, error or cache file contains the key's value", async () => {
    const echo = recorded("search-empty").replace('"results"', `"echo": "${KEY}", "results"`);
    const { impl } = fakeFetch(() => new Response(echo));
    const { tavily } = setup(impl);
    await tavily.search(searchArgs);
    const failing = fakeFetch(() => {
      throw new Error(`socket failed for ${KEY}`);
    });
    const err = await setup(failing.impl)
      .tavily.search({ ...searchArgs, query: "other" })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "network_error" });
    expect(String((err as Error).message)).not.toContain(KEY);
    const bad = fakeFetch(() => new Response(KEY, { status: 400 }));
    const err2 = await setup(bad.impl)
      .tavily.search({ ...searchArgs, query: "third" })
      .catch((e: unknown) => e);
    expect(String((err2 as Error).message)).not.toContain(KEY);
    expect(allOutput(join(dir, "usage.jsonl"), join(dir, "http"))).not.toContain(KEY);
  });
});

describe("wayback", () => {
  const hang = (_: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_res, rej) => {
      init?.signal?.addEventListener("abort", () => rej(init.signal?.reason));
    });

  it("asks CDX for the exact url with limit 1 and reads the first capture", async () => {
    const { impl, seen } = fakeFetch(
      () => new Response('[["timestamp","original"],["20010331090921","https://a.example/x"]]'),
    );
    const { wayback, usage } = setup(impl);
    const { data } = await wayback.firstCapture("https://a.example/x");
    const url = new URL(seen[0]?.url ?? "");
    expect(url.origin + url.pathname).toBe("https://web.archive.org/cdx/search/cdx");
    expect(url.searchParams.get("url")).toBe("https://a.example/x");
    expect(url.searchParams.get("matchType")).toBe("exact");
    expect(url.searchParams.get("limit")).toBe("1");
    expect(url.searchParams.get("filter")).toBe("statuscode:200");
    expect(data).toEqual({ status: "found", firstCapture: "2001-03-31", timestamp: "20010331090921" });
    expect(usage.rows[0]).toMatchObject({ service: "wayback", credits: 0 });
  });

  it("an empty CDX answer is none", async () => {
    const { impl } = fakeFetch(() => new Response("[]"));
    expect((await setup(impl).wayback.firstCapture("https://a.example/y")).data).toEqual({ status: "none" });
  });

  it("a timeout retries once then returns pending and is not cached", async () => {
    let calls = 0;
    const impl = ((u: string | URL | Request, i?: RequestInit) => {
      calls += 1;
      return hang(u, i);
    }) as typeof fetch;
    const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
    const cacheDir = join(dir, "http");
    const wayback = createWayback({ fetch: impl, usage, cache: createFileCache(cacheDir), timeoutMs: 5 });
    expect((await wayback.firstCapture("https://a.example/z")).data).toEqual({ status: "pending" });
    expect(calls).toBe(2);
    expect(usage.rows.map((r) => r.status)).toEqual(["timeout", "timeout"]);
    expect(readdirSync(cacheDir)).toHaveLength(0);
    expect(WAYBACK_TIMEOUT_MS).toBe(20_000);
  });
});

describe("page fetch", () => {
  it("returns the page text with a fetch usage row and caches it", async () => {
    const { impl, seen } = fakeFetch(
      () => new Response("<p>hello</p>", { headers: { "content-type": "text/html" } }),
    );
    const { fetchPage, usage } = setup(impl);
    const first = await fetchPage("https://a.example/page");
    await fetchPage("https://a.example/page");
    expect(first.data).toEqual({ url: "https://a.example/page", text: "<p>hello</p>", contentType: "text/html" });
    expect(seen).toHaveLength(1);
    expect(usage.rows.map((r) => [r.service, r.cacheHit])).toEqual([
      ["fetch", false],
      ["fetch", true],
    ]);
  });

  it("a 403 is a typed http_error, never a decision", async () => {
    const { impl } = fakeFetch(() => new Response("no", { status: 403 }));
    await expect(setup(impl).fetchPage("https://a.example/blocked")).rejects.toMatchObject({
      code: "http_error",
      status: 403,
    });
  });
});
