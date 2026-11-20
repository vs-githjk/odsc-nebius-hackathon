import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fidelity, missTable, MISSES_FILE, replayClaim, replayWalk, selectClaims, setLabel } from "../../../eval/replay-walk.ts";
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

// Requests the live world fails, by URL test: a 404 page, a Wayback lookup that times out (replay-misses fix).
let failing: { test: (url: string) => boolean; fail: () => Response | never }[] = [];

const world = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  const failure = failing.find(f => f.test(url));
  if (failure) return failure.fail();
  if (url.includes("/cdx/")) {
    const page = pages.find(p => p.url === new URL(url).searchParams.get("url"));
    return new Response(JSON.stringify(page ? [["timestamp", "original"], [`${page.date.replaceAll("-", "")}000000`, page.url]] : []));
  }
  const capture = /^https:\/\/web\.archive\.org\/web\/\d+id_\/(.+)$/.exec(url);
  if (capture) return new Response(pages.find(p => p.url === capture[1])?.text ?? "", { headers: { "content-type": "text/html" } });
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

afterEach(() => {
  vi.unstubAllGlobals();
  failing = [];
});

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
    // Those paid requests make the claim a changed walk, not a $0 measurement (ported from #207).
    expect(fidelity(misses.list)).toMatch(/^walk changed: \d+ paid request\(s\) not recorded \(/);
  });

  it("says per claim whether it was an exact replay, and counts paid misses apart from free ones (from #207)", async () => {
    expect(fidelity([])).toBe("exact replay, $0");
    expect(fidelity([{ kind: "http", detail: "https://web.archive.org/cdx/search/cdx?url=x" }, { kind: "http", detail: "https://news.example/a" }]))
      .toBe("exact replay, $0 (2 free lookup(s) not recorded: wayback x1, page news.example x1)");
    expect(fidelity([{ kind: "http", detail: "https://api.tavily.com/search" }, { kind: "chat", detail: "source_text ..." }, { kind: "http", detail: "https://news.example/a" }]))
      .toBe("walk changed: 2 paid request(s) not recorded (tavily /search x1, model chat x1)");
    const dir = mkdtempSync(join(tmpdir(), "pz-replay-"));
    await record(dir);
    const lines: string[] = [];
    const report = await replayWalk([{ ...CLAIM, expected: "origin" as const, tracedOrigin: null, tracedBy: null }], { recordDir: dir, scratch: join(dir, "s4"), outDir: join(dir, "out4"), report: (l) => lines.push(l) });
    expect(report.exact).toBe(1);
    expect(lines).toEqual([expect.stringMatching(/ {2}exact replay, \$0$/)]);
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

  it("replays a lookup that failed live as the same failure, not as a miss (tonight's 21 http misses)", async () => {
    const blog = pages[1]!;
    failing = [
      { test: (url) => url === blog.url, fail: () => new Response("not found", { status: 404 }) },
      { test: (url) => url.includes("/cdx/") && url.includes(encodeURIComponent(blog.url)), fail: () => { throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); } },
    ];
    const dir = mkdtempSync(join(tmpdir(), "pz-replay-"));
    const live = await record(dir);
    failing = [];
    const misses = createMisses();
    const replayed = await replayClaim(CLAIM, { recordDir: dir, scratch: join(dir, "scratch-f"), misses });
    expect(misses.list).toEqual([]);
    const shape = (t: typeof live) => ({ state: t.decision.state, nodes: t.nodes.map(n => [n.url, n.date]), earliest: t.earliest.nodeIds });
    expect(shape(replayed)).toEqual(shape(live));
  });

  it("a normal live cache never stores a failure, so a transient error is retried on the next live run", async () => {
    const blog = pages[1]!;
    failing = [{ test: (url) => url === blog.url, fail: () => new Response("busy", { status: 503 }) }];
    const dir = mkdtempSync(join(tmpdir(), "pz-replay-"));
    await record(dir);
    const live = createFileCache(join(dir, "live-cache"));
    const stored = readdirSync(join(dir, "live-cache")).map(f => live.get(f.replace(/.json$/, "")));
    expect(stored.some(e => e && "failure" in e)).toBe(false);
  });
});

describe("replay miss file", () => {
  it("writes every miss by claim beside the replayed traces, and an empty map for an exact replay", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pz-replay-"));
    await record(dir);
    const claim = { ...CLAIM, expected: "origin" as const, tracedOrigin: null, tracedBy: null };
    await replayWalk([claim], { recordDir: dir, scratch: join(dir, "m1"), outDir: join(dir, "m1") });
    expect(JSON.parse(readFileSync(join(dir, "m1", MISSES_FILE), "utf8"))).toEqual({});
    const changed = { ...claim, text: `Really, ${CLAIM.text}` };
    await replayWalk([changed], { recordDir: dir, scratch: join(dir, "m2"), outDir: join(dir, "m2") }).catch(() => null);
    const byClaim = JSON.parse(readFileSync(join(dir, "m2", MISSES_FILE), "utf8"));
    expect(Object.keys(byClaim)).toEqual([CLAIM.id]);
    expect(byClaim[CLAIM.id].length).toBeGreaterThan(0);
  });
});

describe("replay tooling for walk changes (#164)", () => {
  const claim = { ...CLAIM, expected: "origin" as const, tracedOrigin: null, tracedBy: null };
  const other = { id: "dev-98", text: "Harbor Zoo penguins nap 12 times a day.", expected: "cold" as const, tracedOrigin: null, tracedBy: null };

  it("--claims replays only the listed claims, and rejects an id that is not in the set", () => {
    expect(selectClaims([claim, other], undefined).map(c => c.id)).toEqual([CLAIM.id, "dev-98"]);
    expect(selectClaims([claim, other], " dev-98 ").map(c => c.id)).toEqual(["dev-98"]);
    expect(selectClaims([claim, other], `${CLAIM.id},dev-98`).map(c => c.id)).toEqual([CLAIM.id, "dev-98"]);
    expect(() => selectClaims([claim, other], "dev-98,dev-77")).toThrow(/unknown claim id\(s\): dev-77/);
  });

  it("the report ends with a per-claim miss table: state, paid and free misses, verdict", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pz-replay-"));
    await record(dir);
    const report = await replayWalk([claim, other], { recordDir: dir, scratch: join(dir, "t1"), outDir: join(dir, "t1") });
    expect(report.rows).toEqual([
      { id: CLAIM.id, state: expect.any(String), paid: 0, free: 0, verdict: "exact" },
      { id: "dev-98", state: null, paid: 0, free: 0, verdict: "failed" },
    ]);
    const table = missTable(report.rows);
    expect(table[0]).toMatch(/^claim +state +paid +free +verdict$/);
    expect(table[1]).toMatch(new RegExp(`^${CLAIM.id} +[A-Z_]+ +0 +0 +exact$`));
    expect(table[2]).toMatch(/^dev-98 +- +0 +0 +failed$/);
  });
});

describe("a filtered replay reads as a subset (XO on #234)", () => {
  const all = Array.from({ length: 20 }, (_, i) => ({ id: `dev-${String(i + 1).padStart(2, "0")}`, text: "x", expected: "cold" as const, tracedOrigin: null, tracedBy: null }));
  it("labels the score lines as a subset with its size and ids, and the full set by its name", () => {
    expect(setLabel("E2", selectClaims(all, "dev-02,dev-05"), all)).toBe("E2 subset (2 of 20: dev-02, dev-05)");
    expect(setLabel("E2", selectClaims(all, undefined), all)).toBe("E2");
  });

  it("a --claims list with no ids is an error, not a run with nothing to replay", () => {
    expect(() => selectClaims(all, ",")).toThrow("no claim ids in --claims");
    expect(() => selectClaims(all, " , ,")).toThrow("no claim ids in --claims");
  });
});
