import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { replayClaim, replayWalk } from "../../../eval/replay-walk.ts";
import { createFileCache } from "../src/clients/cache.ts";
import { createMisses, recordPaths } from "../src/clients/tape.ts";
import { FINGERPRINT_PROMPT } from "../src/engine/fingerprint.ts";
import { createPipeline } from "../src/engine/pipeline.ts";
import { QUERIES_PROMPT } from "../src/engine/queries.ts";
import { runTrace } from "../src/engine/run.ts";

// Record one claim through the real pipeline against a stubbed world, then replay it from the recording alone.
// Replay gets a fetch that throws, and the global fetch is replaced with one that throws too: zero network.
type Page = { url: string; date: string; text: string };
const pages: Page[] = [
  { url: "https://news.example/penguins-replay", date: "2020-05-01", text: "Visitors learn that Harbor Zoo penguins nap 31 times a day. Keepers keep a log of the naps." },
  { url: "https://blog.example/naps-replay", date: "2021-02-03", text: "As reported before, Harbor Zoo penguins nap 31 times a day. It is a lovely fact." },
];
const CLAIM = { id: "dev-99", text: "Harbor Zoo penguins nap 31 times a day." };

function typedReply(fields: Record<string, string>) {
  const entries = Object.entries(fields);
  const tokens: { token: string; top: [string, number][] }[] = [{ token: '{"', top: [['{"', -0.1]] }];
  entries.forEach(([key, value], index) => {
    tokens.push({ token: key, top: [[key, -0.01]] }, { token: '":"', top: [['":"', -0.01]] }, { token: value, top: [[value, -0.01], ["zzz", -6]] },
      { token: index === entries.length - 1 ? '"}' : '","', top: [['"}', -0.01]] });
  });
  const content = `{"${entries.map(([key, value]) => `${key}":"${value}`).join('","')}"}`;
  return { content, logprobs: { content: tokens.map(({ token, top }) => ({ token, bytes: [...Buffer.from(token)], logprob: top[0]![1],
    top_logprobs: top.map(([t, logprob]) => ({ token: t, bytes: [...Buffer.from(t)], logprob })) })) } };
}

const world = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.includes("/cdx/")) {
    const page = pages.find(p => p.url === new URL(url).searchParams.get("url"));
    return new Response(JSON.stringify(page ? [["timestamp", "original"], [`${page.date.replaceAll("-", "")}000000`, page.url]] : []));
  }
  const body = JSON.parse(String(init?.body ?? "{}"));
  if (url.endsWith("/search")) {
    const results = pages.map(p => ({ url: p.url, title: "A page", content: p.text.slice(0, 80), score: 0.5, published_date: p.date }));
    return new Response(JSON.stringify({ query: body.query, results, usage: { credits: 1 } }));
  }
  if (url.endsWith("/extract")) {
    const results = pages.filter(p => (body.urls as string[]).includes(p.url)).map(p => ({ url: p.url, title: "A page", raw_content: p.text }));
    return new Response(JSON.stringify({ results, failed_results: [], usage: { credits: 1 } }));
  }
  if (url.endsWith("/v1/embeddings")) {
    const data = (body.input as string[]).map((text, index) => {
      const slot = createHash("sha256").update(text).digest()[0]! % 64;
      return { index, embedding: Array.from({ length: 64 }, (_, i) => (i === slot ? 1 : 0)) };
    });
    return new Response(JSON.stringify({ data, usage: { prompt_tokens: 20 } }));
  }
  if (url.endsWith("/chat/completions")) {
    const system: string = body.messages[0].content;
    const reply = (content: string, logprobs: unknown = null) => new Response(JSON.stringify({
      model: body.model, usage: { prompt_tokens: 100, completion_tokens: 20 },
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content }, logprobs }],
    }));
    if (system === FINGERPRINT_PROMPT) return reply(JSON.stringify({ subject: "penguins", unit: "times a day", population: null, time: null, hedge: null, namedSource: null }));
    if (system === QUERIES_PROMPT) return reply(JSON.stringify({ queries: [] }));
    const questions: { id: string; options: { id: string }[] }[] = JSON.parse(system);
    const fields = Object.fromEntries(questions.map(q => [q.id, q.id === "same_claim" ? "yes" : q.id === "boundary" ? "none" : q.id === "page_type" ? "report"
      : q.options.some(o => o.id === "no") ? "no" : q.options[0]!.id]));
    const typed = typedReply(fields);
    return reply(typed.content, typed.logprobs);
  }
  const page = pages.find(p => p.url === url);
  if (page) return new Response("<html><head><title>A page</title></head><body>page</body></html>", { headers: { "content-type": "text/html" } });
  throw new Error(`no stub for ${url}`);
}) as typeof fetch;

async function record(dir: string) {
  process.env.PZ_RECORD_DIR = dir;
  try {
    const { pipeline, wayback } = createPipeline({
      tokenFactoryFetch: world, embeddingFetch: world, tavilyFetch: world, archiveFetch: world, pageFetch: world,
      nebiusKey: "test-nebius", tavilyKey: "test-tavily", cache: createFileCache(join(dir, "live-cache")), sleep: async () => {},
      resolveHost: async () => ["93.184.216.34"], traceId: CLAIM.id, pagesDir: join(dir, "live-pages"), usagePath: join(dir, "live-usage.jsonl"),
    });
    return await runTrace(CLAIM.text, pipeline, { wayback });
  } finally {
    delete process.env.PZ_RECORD_DIR;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("walk replay from a recording", () => {
  it("replays one recorded claim end to end with zero network and zero misses", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pz-replay-"));
    const live = await record(dir);
    expect(live.decision.state).toBe("ORIGIN_FOUND");
    expect(readdirSync(recordPaths(dir).model).length).toBeGreaterThan(3);
    expect(existsSync(join(recordPaths(dir).claims, `${CLAIM.id}.json`))).toBe(true);

    const network = vi.fn(() => { throw new Error("network used during replay"); });
    vi.stubGlobal("fetch", network);
    const misses = createMisses();
    const replayed = await replayClaim(CLAIM, { recordDir: dir, scratch: join(dir, "scratch"), misses });
    expect(network).not.toHaveBeenCalled();
    expect(misses.list).toEqual([]);
    expect(replayed.decision.state).toBe(live.decision.state);
    expect(replayed.earliest.nodeIds.map(id => replayed.nodes.find(n => n.id === id)?.url))
      .toEqual(live.earliest.nodeIds.map(id => live.nodes.find(n => n.id === id)?.url));
    expect(replayed.nodes.map(n => n.url)).toEqual(live.nodes.map(n => n.url));
  });

  it("a replay with PZ_RECORD_DIR still set never writes to the recording (#208 review)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pz-replay-"));
    await record(dir);
    const before = readdirSync(recordPaths(dir).model).length;
    vi.stubEnv("PZ_RECORD_DIR", dir);
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("network used during replay"); }));
    for (let i = 0; i < 2; i++) {
      const misses = createMisses();
      // A model miss may end the replay early; what matters is that it is counted and never written to the tape.
      await replayClaim({ ...CLAIM, text: `Really, ${CLAIM.text}` }, { recordDir: dir, scratch: join(dir, `scratch-${i}`), misses }).catch(() => null);
      expect(misses.list.length).toBeGreaterThan(0);
    }
    expect(readdirSync(recordPaths(dir).model).length).toBe(before);
    vi.unstubAllEnvs();
  });

  it("a change in what the walk sees changes the replayed result", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pz-replay-"));
    const live = await record(dir);
    const earliestUrl = (t: typeof live) => t.nodes.find(n => n.id === t.earliest.nodeIds[0])?.url;
    expect(earliestUrl(live)).toContain("news.example");
    // Stands in for a walk code change that skips the oldest page: the request is the recorded one, the walk just
    // does not use that page. (A change that asks for a different page set makes a new request: a counted miss.)
    const skipOldest = (tavily: Parameters<NonNullable<Parameters<typeof replayClaim>[1]["wrapTavily"]>>[0]) => ({
      ...tavily,
      extract: async (...args: Parameters<typeof tavily.extract>) => {
        const found = await tavily.extract(...args);
        return { ...found, data: { ...found.data, results: found.data.results.filter(r => !r.url.includes("news.example")) } };
      },
    });
    const misses = createMisses();
    const changed = await replayClaim(CLAIM, { recordDir: dir, scratch: join(dir, "scratch2"), misses, wrapTavily: skipOldest });
    expect(earliestUrl(changed)).toContain("blog.example");
    expect(changed.nodes.some(n => n.url.includes("news.example") && n.read)).toBe(false);
    // The changed walk goes on to ask things the recording never saw (an earlier-window search, a same_claim on the
    // other page): those are counted, and that count is the replay's fidelity.
    expect(misses.count()).toBeGreaterThan(0);
  });

  it("reports a claim the recording lacks as failed, not run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pz-replay-"));
    await record(dir);
    const claims = [{ ...CLAIM, expected: "origin" as const, tracedOrigin: null, tracedBy: null },
      { id: "dev-98", text: "Harbor Zoo penguins nap 12 times a day.", expected: "cold" as const, tracedOrigin: null, tracedBy: null }];
    const report = await replayWalk(claims, { recordDir: dir, scratch: join(dir, "s3"), outDir: join(dir, "out") });
    expect(report.replayed).toBe(1);
    expect(report.failed.map(f => f.id)).toEqual(["dev-98"]);
  });
});
