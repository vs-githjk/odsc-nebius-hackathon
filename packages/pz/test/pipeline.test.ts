import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initializeBudget, openBudget } from "../../../eval/recordings/budget.ts";
import { traceTransports } from "../../../eval/recordings/trace-transports.ts";
import { createPipeline } from "../src/engine/pipeline.ts";
import { traceCommand } from "../src/cli/trace.ts";
import { buildPipeline, closeTrail } from "../src/engine/pipeline.ts";
import { PHRASE_PROMPT } from "../src/engine/phrase.ts";
import { FINGERPRINT_PROMPT } from "../src/engine/fingerprint.ts";
import { QUERIES_PROMPT } from "../src/engine/queries.ts";
import { runTrace } from "../src/engine/run.ts";
import { createTokenFactoryClient } from "../src/clients/tokenfactory.ts";
import { createTavily } from "../src/clients/tavily.ts";
import { loadRules } from "../src/rules/index.ts";
import { Trace } from "../src/schema/index.ts";

// The default `pz trace "<claim>"` path, end to end, with every provider stubbed: one fetch answers Token Factory
// (chat and embeddings), Tavily and the Wayback CDX. Nothing here reaches the network or reads a key.
type Page = { url: string; date: string; title?: string; text: string; searchable?: boolean; factCheck?: boolean; html?: string };
type World = {
  pages: Page[];
  tavily?: "ok" | 503;
  planner?: "ok" | "bad";
  sameClaim?: "yes" | "no";
  phrase?: { phrases: string[]; subject: string };
  onSearch?: (count: number) => void;
};

// A reply with logprobs for each string field, so typed answers carry a confidence like the real provider's.
function typedReply(fields: Record<string, string>) {
  const entries = Object.entries(fields);
  const tokens: { token: string; top: [string, number][] }[] = [{ token: '{"', top: [['{"', -0.1]] }];
  entries.forEach(([key, value], index) => {
    tokens.push({ token: key, top: [[key, -0.01]] });
    tokens.push({ token: index === 0 ? '":"' : '":"', top: [['":"', -0.01]] });
    tokens.push({ token: value, top: [[value, -0.01], ["zzz", -6]] });
    tokens.push({ token: index === entries.length - 1 ? '"}' : '","', top: [['"}', -0.01]] });
  });
  const content = `{"${entries.map(([key, value]) => `${key}":"${value}`).join('","')}"}`;
  return {
    content,
    logprobs: { content: tokens.map(({ token, top }) => ({
      token, bytes: [...Buffer.from(token)], logprob: top[0]![1],
      top_logprobs: top.map(([t, logprob]) => ({ token: t, bytes: [...Buffer.from(t)], logprob })),
    })) },
  };
}

const pageOf = (body: { messages: { content: string }[] }) => body.messages[1]?.content ?? "";

function stub(world: World) {
  const calls: { url: string; step?: string; questions?: string[] }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url });
    if (url.includes("/cdx/")) {
      // The Wayback first capture is the only date the pipeline trusts here: each page was first archived on its date.
      const page = world.pages.find((p) => p.url === new URL(url).searchParams.get("url"));
      const rows = page ? [["timestamp", "original"], [`${page.date.replaceAll("-", "")}000000`, page.url]] : [];
      return new Response(JSON.stringify(rows));
    }
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url.endsWith("/search")) {
      world.onSearch?.(calls.filter((c) => c.url.endsWith("/search")).length);
      if (world.tavily === 503) return new Response("unavailable", { status: 503 });
      const only = body.include_domains as string[] | undefined;
      const results = world.pages.filter((p) => p.searchable !== false && (only ? p.factCheck : !p.factCheck)).map((p) => ({
        url: p.url, title: p.title ?? "A page", content: p.text.slice(0, 80), score: 0.5, published_date: p.date,
      }));
      return new Response(JSON.stringify({ query: body.query, results, usage: { credits: 1 } }));
    }
    if (url.endsWith("/extract")) {
      const results = world.pages.filter((p) => (body.urls as string[]).some((u) => p.url.replace("www.", "") === u.replace("www.", ""))).map((p) => ({ url: p.url, title: p.title ?? "A page", raw_content: p.text }));
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
      if (system === FINGERPRINT_PROMPT) {
        return reply(JSON.stringify({ subject: "penguins", unit: "times a day", population: null, time: null, hedge: null, namedSource: null }));
      }
      if (system === PHRASE_PROMPT) return reply(JSON.stringify(world.phrase ?? { phrases: [], subject: "" }));
      if (system === QUERIES_PROMPT) {
        calls.push({ url, step: "planner" });
        return world.planner === "bad" ? reply("not json") : reply(JSON.stringify({ queries: [] }));
      }
      const questions: { id: string; options: { id: string }[] }[] = JSON.parse(system);
      calls.push({ url, step: "typed", questions: questions.map((q) => q.id) });
      const fields = Object.fromEntries(questions.map((q) => [q.id,
        q.id === "same_claim" ? (world.sameClaim ?? "yes") : q.id === "boundary" ? "none" : q.id === "page_type" ? (pageOf(body).includes("keepers recorded") ? "dataset" : "report")
          : q.options.some((o) => o.id === "no") ? "no" : q.options[0]!.id]));
      const typed = typedReply(fields);
      return reply(typed.content, typed.logprobs);
    }
    const page = world.pages.find((p) => p.url === url);
    if (page?.html) return new Response(page.html, { headers: { "content-type": "text/html" } });
    throw new Error(`no stub for ${url}`);
  }) as typeof fetch;
  return { fetch: impl, calls };
}

// Search and page requests are cached on disk by request, so each test gets a number no other test or run has used.
let counter = 0;
const unique = () => String(2200 + ((Date.now() * 7 + ++counter * 1013) % 7700));

function run(claim: string, world: World, opts: { capUsd?: number; extra?: string[]; env?: Record<string, string> } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "pz-pipeline-"));
  const ledger = join(dir, "ledger.json");
  initializeBudget(ledger, { capUsd: opts.capUsd ?? 15, priorSpendUsd: 0, start: "2020-01-01T00:00:00.000Z", end: "2099-01-01T00:00:00.000Z" });
  const net = stub(world);
  const out: string[] = [];
  const err: string[] = [];
  const env = { NEBIUS_API_KEY: "test-nebius", TAVILY_API_KEY: "test-tavily", DEV_LEDGER: ledger, ...opts.env };
  const io = { write: (line: string) => out.push(line), error: (line: string) => err.push(line), color: false };
  const go = (args: string[]) => traceCommand(args, io, env, net.fetch);
  return { dir, ledger, net, out, err, go, args: [...(opts.extra ?? []), claim] };
}

const zoo = (id: string) => `Harbor Zoo penguins nap ${id} times a day.`;
// Page reads are cached by URL, so each claim's pages live at URLs of their own.
const pagesFor = (claim: string): Page[] => [
  { url: `https://news.example/penguins-${createHash("sha256").update(claim).digest("hex").slice(0, 10)}`, date: "2020-05-01", title: "Penguin naps", text: `Visitors learn that ${claim} Keepers keep a log of the naps.` },
  { url: `https://blog.example/naps-${createHash("sha256").update(claim).digest("hex").slice(0, 10)}`, date: "2021-02-03", title: "Nap blog", text: `As reported before, ${claim} It is a lovely fact.` },
];

describe("default pz trace path, stubbed providers", () => {
  it("runs a normal claim to a stop state with a card and records every paid attempt", async () => {
    const claim = zoo(unique());
    const t = run(claim, { pages: pagesFor(claim) }, { extra: ["--json"] });
    expect(await t.go(t.args)).toBe(0);
    expect(t.err).toEqual([]);
    const trace = Trace.parse(JSON.parse(t.out.join("")));
    expect(trace.mode).toBe("LIVE");
    // Fingerprint, planner, same_claim, page_type, dating and the walk all ran live-shaped: the earlier page is the origin.
    expect(trace.decision.state).toBe("ORIGIN_FOUND");
    expect(trace.nodes.find((node) => node.id === trace.earliest.nodeIds[0])?.url).toContain("news.example/penguins");
    expect(trace.nodes.length).toBeGreaterThan(0);
    expect(trace.claim.atoms.subjectLemma).toBeTruthy();
    expect(trace.earliest.nodeIds.length).toBeGreaterThan(0);
    const steps = new Set(trace.usage.map((row) => `${row.service}:${row.step}`));
    expect(steps).toContain("tokenfactory:tokenfactory");
    // Walk-stage model calls and embeddings are recorded on the trace, not only in the side log.
    expect(trace.usage.some((row) => row.step === "same_claim" && row.service === "tokenfactory")).toBe(true);
    expect(trace.usage.some((row) => row.step === "page_type" && row.service === "tokenfactory")).toBe(true);
    expect(trace.usage.some((row) => row.step === "embed" && row.endpoint === "/embeddings")).toBe(true);
    expect(trace.budget.usd).toBeCloseTo(trace.usage.reduce((sum, row) => sum + (row.service === "tokenfactory" ? row.costUsd : 0), 0), 10);
    expect(trace.budget.credits).toBe(trace.usage.reduce((sum, row) => sum + row.credits, 0));
  });

  it("prints the readable card by default and the raw trace with --json", async () => {
    const claim = zoo(unique());
    const t = run(claim, { pages: pagesFor(claim) });
    expect(await t.go(t.args)).toBe(0);
    const text = t.out.join("\n");
    expect(text).toContain("Patient Zero");
    expect(text).toContain("Raw trace: add --json");
    expect(text).not.toContain('"schemaVersion"');
  });

  it("asks the boundary question once for the earliest page of a cold trail, and records the call", async () => {
    const claim = zoo(unique());
    const t = run(claim, { pages: pagesFor(claim), sameClaim: "no" }, { extra: ["--json"] });
    expect(await t.go(t.args)).toBe(0);
    const trace = Trace.parse(JSON.parse(t.out.join("")));
    expect(trace.decision.state).toBe("TRAIL_GOES_COLD");
    const asked = t.net.calls.filter((c) => c.questions?.includes("boundary"));
    expect(asked).toHaveLength(trace.earliest.nodeIds.length);
    expect(trace.usage.filter((row) => row.step === "boundary")).toHaveLength(asked.length);
  });

  it("a phrase claim fingerprints by phrase and still runs to a card", async () => {
    const word = [...unique()].map((d) => "abcdefghij"[Number(d)]).join("");
    const phrase = `the only man made structure visible from ${word} space`;
    const claim = `Everyone knows that ${phrase}.`;
    const t = run(claim, {
      pages: pagesFor(claim), phrase: { phrases: [phrase], subject: "structure" },
    }, { extra: ["--json"] });
    const status = await t.go(t.args);
    expect(t.err).toEqual([]);
    expect(status).toBe(0);
    const trace = Trace.parse(JSON.parse(t.out.join("")));
    expect(trace.claim.atoms.number).toBeNull();
    expect(trace.claim.atoms.phrase).toBe(phrase);
    expect(trace.nodes.length).toBeGreaterThan(0);
  });

  it("a phrase claim with no usable phrase stops with a code, not a guess", async () => {
    const claim = `Nobody ever really knows ${[...unique()].map((d) => "abcdefghij"[Number(d)]).join("")} anything.`;
    const t = run(claim, { pages: [], phrase: { phrases: [], subject: "" } });
    expect(await t.go(t.args)).toBe(1);
    expect(t.err).toEqual(["bad_response"]);
    expect(t.net.calls.some((c) => c.url.endsWith("/search"))).toBe(false);
  });

  it("empty search ends NO_PAGES_FOUND with a card", async () => {
    const claim = zoo(unique());
    const t = run(claim, { pages: [] }, { extra: ["--json"] });
    expect(await t.go(t.args)).toBe(0);
    const trace = Trace.parse(JSON.parse(t.out.join("")));
    expect(trace.decision.state).toBe("NO_PAGES_FOUND");
    expect(trace.nodes).toEqual([]);
  });

  it("a Tavily 503 ends TOOL_FAILED with the failing service named, not trace_failed", async () => {
    const claim = zoo(unique());
    const t = run(claim, { pages: [], tavily: 503 }, { extra: ["--json"] });
    expect(await t.go(t.args)).toBe(0);
    const trace = Trace.parse(JSON.parse(t.out.join("")));
    expect(trace.decision.state).toBe("TOOL_FAILED");
    expect(trace.failure).toMatchObject({ service: "tavily", endpoint: "search", status: "http_error 503" });
  });

  it("a Token Factory bad_response in the query planner falls back to code queries and keeps the failed attempt's usage", async () => {
    const claim = zoo(unique());
    const t = run(claim, { pages: pagesFor(claim), planner: "bad" }, { extra: ["--json"] });
    expect(await t.go(t.args)).toBe(0);
    const trace = Trace.parse(JSON.parse(t.out.join("")));
    expect(trace.nodes.length).toBeGreaterThan(0);
    expect(trace.searchLog.some((line) => line.step === "model" && line.query.includes("bad_response"))).toBe(true);
    expect(trace.usage.filter((row) => row.service === "tokenfactory").length).toBeGreaterThan(1);
  });

  it("an exhausted ledger refuses before any request", async () => {
    const claim = zoo(unique());
    const t = run(claim, { pages: pagesFor(claim) }, { capUsd: 0.0001 });
    expect(await t.go(t.args)).toBe(1);
    expect(t.err.join(" ")).toMatch(/budget_exceeded|trace_failed/);
    expect(t.net.calls).toEqual([]);
  });

  it("says not_configured, never trace_failed, with no keys", async () => {
    const claim = zoo(unique());
    const t = run(claim, { pages: [] }, { env: { NEBIUS_API_KEY: "", TAVILY_API_KEY: "" } });
    expect(await t.go(t.args)).toBe(1);
    expect(t.err).toEqual(["not_configured: NEBIUS_API_KEY, TAVILY_API_KEY"]);
    expect(t.net.calls).toEqual([]);
  });

  it("replays a recorded live run with no keys and no network", async () => {
    const claim = zoo(unique());
    const live = run(claim, { pages: pagesFor(claim) });
    const saved = join(live.dir, "recorded.json");
    expect(await live.go(["--out", saved, claim])).toBe(0);
    expect(existsSync(saved)).toBe(true);
    const recorded = Trace.parse(JSON.parse(readFileSync(saved, "utf8")));
    const out: string[] = [];
    const err: string[] = [];
    const never = (() => { throw new Error("network used on replay"); }) as typeof fetch;
    const status = await traceCommand(["--replay-of", saved, "--json"], { write: (l) => out.push(l), error: (l) => err.push(l) }, {}, never);
    expect(status).toBe(0);
    const replayed = Trace.parse(JSON.parse(out.join("")));
    expect(replayed.mode).toBe("REPLAY");
    expect(replayed.decision).toEqual(recorded.decision);
    expect(replayed.usage).toEqual(recorded.usage);
  });
});

describe("fact-check meta maps through the full pipeline (T49)", () => {
  it("a fact-check page found by the domain-limited search leads to the origin, which keeps its own span", async () => {
    const claim = zoo(unique());
    const id = createHash("sha256").update(claim).digest("hex").slice(0, 10);
    const dataset = `https://zoo.example/dataset-${id}`;
    const pages: Page[] = [
      { url: `https://blog.example/p-${id}`, date: "2021-03-01", text: `Wow: ${claim}` },
      { url: `https://www.snopes.com/fact-check/${id}`, date: "2022-01-01", factCheck: true,
        text: `Claim: ${claim} The figure traces to the [Harbor Zoo keeper dataset](${dataset}), which counted it.\n\nAbout this site: we rate viral content every day, with a small team of editors and reporters who answer reader questions and publish corrections openly when we get things wrong. Follow us on [social media](https://social.example/post) or browse [our other checks](https://www.snopes.com/archive).` },
      { url: dataset, date: "2019-04-30", searchable: false, text: `Over 90 days the keepers recorded that ${claim}` },
    ];
    const t = run(claim, { pages }, { extra: ["--json"] });
    expect(await t.go(t.args)).toBe(0);
    const trace = Trace.parse(JSON.parse(t.out.join("")));
    const map = trace.nodes.find((n) => n.domain === "snopes.com")!;
    expect(map.meta).toBe(true);
    const origin = trace.nodes.find((n) => n.url === dataset)!;
    expect(origin.foundViaMeta).toBe(map.url);
    expect(trace.spans.some((sp) => sp.nodeId === origin.id)).toBe(true);
    expect(trace.earliest.nodeIds).toEqual([origin.id]);
    expect(trace.decision.state).toBe("ORIGIN_FOUND");
    expect(t.net.calls.filter((c) => c.url.endsWith("/search")).length).toBeGreaterThan(1);
  });
});

describe("publication evidence in dating (#79)", () => {
  const meta = (date: string) => `<html><head><meta name="citation_publication_date" content="${date}"></head><body>x</body></html>`;
  it("dates a page by its own metadata, capped by the archive capture, through the full pipeline", async () => {
    const claim = zoo(unique());
    const id = createHash("sha256").update(claim).digest("hex").slice(0, 10);
    const old = { url: `https://pubmed.example/old-${id}`, date: "2020-06-24", html: meta("2004/06/15"), text: `Study: ${claim}` };
    const late = { url: `https://blog.example/late-${id}`, date: "2021-02-03", html: meta("2023/01/01"), text: `Blog: ${claim}` };
    const t = run(claim, { pages: [old, late] }, { extra: ["--json"] });
    expect(await t.go(t.args)).toBe(0);
    const trace = Trace.parse(JSON.parse(t.out.join("")));
    const dateOf = (url: string) => trace.nodes.find((n) => n.url === url)!.date;
    // Published in 2004 by its own metadata, though first archived in 2020.
    expect(dateOf(old.url)).toMatchObject({ kind: "published", value: "2004-06-15", source: "metadata", firstCapture: "2020-06-24" });
    // A metadata date later than the first capture is capped and flagged.
    expect(dateOf(late.url)).toMatchObject({ kind: "existed_by", value: "2021-02-03", conflictingDate: true });
    expect(trace.earliest.nodeIds).toEqual([trace.nodes.find((n) => n.url === old.url)!.id]);
  });
  it("without a metadata tag the date stays the archive capture", async () => {
    const claim = zoo(unique());
    const id = createHash("sha256").update(claim).digest("hex").slice(0, 10);
    const p = { url: `https://plain.example/p-${id}`, date: "2020-06-24", html: "<html><body>no tags</body></html>", text: claim };
    const t = run(claim, { pages: [p] }, { extra: ["--json"] });
    expect(await t.go(t.args)).toBe(0);
    expect(Trace.parse(JSON.parse(t.out.join(""))).nodes[0]!.date).toMatchObject({ kind: "existed_by", value: "2020-06-24" });
  });
});

describe("caps end the walk with a card, not a failed trace", () => {
  it("the shared ledger running out mid-walk ends with capHit credits, a card and the spend kept", async () => {
    const claim = zoo(unique());
    const dir = mkdtempSync(join(tmpdir(), "pz-cap-"));
    const ledger = join(dir, "ledger.json");
    initializeBudget(ledger, { capUsd: 15, priorSpendUsd: 0, start: "2020-01-01T00:00:00.000Z", end: "2099-01-01T00:00:00.000Z" });
    const t = run(claim, { pages: pagesFor(claim), onSearch: (n) => { if (n === 1) openBudget(t.ledger).reserve(14.97); } }, { extra: ["--json"] });
    expect(await t.go(t.args)).toBe(0);
    expect(t.err).toEqual([]);
    const trace = Trace.parse(JSON.parse(t.out.join("")));
    expect(trace.budget.capHit).toBe("credits");
    expect(trace.decision.state).toBe("PARTIAL");
    expect(trace.usage.filter((row) => row.service === "tavily").length).toBeGreaterThan(0);
    expect(trace.usage.filter((row) => row.service === "tokenfactory").length).toBeGreaterThan(0);
  });

  it("a deadline that fires mid-walk ends as a named tool failure with a trace, not trace_failed", async () => {
    const claim = zoo(unique());
    const dir = mkdtempSync(join(tmpdir(), "pz-time-"));
    const ledger = join(dir, "ledger.json");
    initializeBudget(ledger, { capUsd: 15, priorSpendUsd: 0, start: "2020-01-01T00:00:00.000Z", end: "2099-01-01T00:00:00.000Z" });
    let expired = false;
    const net = stub({ pages: pagesFor(claim), onSearch: () => { expired = true; } });
    const { pipeline, wayback } = createPipeline({
      ...traceTransports(openBudget(ledger), 0.5, net.fetch, () => { if (expired) throw new DOMException("deadline", "TimeoutError"); }),
      archiveFetch: net.fetch, nebiusKey: "k", tavilyKey: "k", pagesDir: join(dir, "pages"), usagePath: join(dir, "usage.jsonl"),
      cache: { get: () => null, set: () => {} },
    });
    const trace = await runTrace(claim, pipeline, { wayback });
    expect(trace.decision.state).toBe("TOOL_FAILED");
    expect(trace.failure).toMatchObject({ service: "tavily" });
    expect(trace.usage.length).toBeGreaterThan(0);
  });
});

describe("budget seeding", () => {
  it("counts the credits earlier stages spent once, not twice", async () => {
    const claim = zoo(unique());
    const net = stub({ pages: pagesFor(claim) });
    const rules = loadRules();
    const dir = mkdtempSync(join(tmpdir(), "pz-seed-"));
    const { pipeline, wayback } = buildPipeline({
      chat: createTokenFactoryClient({ apiKey: "k", fetch: net.fetch, logUsage: () => {} }),
      embed: createTokenFactoryClient({ apiKey: "k", fetch: net.fetch, logUsage: () => {} }),
      tavily: (deps) => createTavily({ ...deps, apiKey: "k", fetch: net.fetch }),
      archiveFetch: net.fetch, pagesDir: join(dir, "pages"), usagePath: join(dir, "usage.jsonl"),
      cache: { get: () => null, set: () => {} },
    });
    const context = { input: claim, pages: [] };
    const started = await pipeline.intake(context);
    const fingerprinted = await pipeline.fingerprint(started, context);
    // An earlier stage already spent all but 2 credits of the cap. One search costs 1 credit.
    const spent = rules.caps.credits - 2;
    const seeded = { ...fingerprinted, usage: [...fingerprinted.usage, {
      at: "2026-11-17T00:00:00.000Z", traceId: fingerprinted.id, step: "earlier", service: "tavily" as const, endpoint: "search",
      model: null, promptTokens: 0, completionTokens: 0, cachedTokens: 0, credits: spent, costUsd: 0, latencyMs: 1, status: "200", cacheHit: false,
    }] };
    const result = await pipeline.walk(seeded, context);
    const walked = "trace" in result ? result.trace : result;
    // Counted twice the cap would already be spent and no search would run; counted once, searching goes on.
    expect(net.calls.some((c) => c.url.endsWith("/search"))).toBe(true);
    expect(walked.budget.credits).toBe(walked.usage.reduce((sum, row) => sum + row.credits, 0));
    expect(wayback).toBeDefined();
  });
});

describe("closeTrail", () => {
  it("keeps the earliest page free of incoming edges and adds an inferred edge for a later page with no link", async () => {
    const claim = zoo(unique());
    const net = stub({ pages: pagesFor(claim) });
    const dir = mkdtempSync(join(tmpdir(), "pz-close-"));
    const { pipeline, wayback } = buildPipeline({
      chat: createTokenFactoryClient({ apiKey: "k", fetch: net.fetch, logUsage: () => {} }),
      embed: createTokenFactoryClient({ apiKey: "k", fetch: net.fetch, logUsage: () => {} }),
      tavily: (deps) => createTavily({ ...deps, apiKey: "k", fetch: net.fetch }),
      archiveFetch: net.fetch, pagesDir: join(dir, "pages"), usagePath: join(dir, "usage.jsonl"),
      cache: { get: () => null, set: () => {} },
    });
    const trace = await runTrace(claim, pipeline, { wayback });
    for (const id of trace.earliest.nodeIds) expect(trace.edges.some((e) => e.childId === id)).toBe(false);
    expect(trace.edges.map((e) => e.id)).toEqual(trace.edges.map((_, i) => `e${i + 1}`));
    expect(closeTrail(trace)).toEqual(trace);
  });

  it("drops a link that points into the oldest page and draws the inferred edge instead", async () => {
    const claim = zoo(unique());
    const net = stub({ pages: pagesFor(claim) });
    const dir = mkdtempSync(join(tmpdir(), "pz-close2-"));
    const { pipeline, wayback } = buildPipeline({
      chat: createTokenFactoryClient({ apiKey: "k", fetch: net.fetch, logUsage: () => {} }),
      embed: createTokenFactoryClient({ apiKey: "k", fetch: net.fetch, logUsage: () => {} }),
      tavily: (deps) => createTavily({ ...deps, apiKey: "k", fetch: net.fetch }),
      archiveFetch: net.fetch, pagesDir: join(dir, "pages"), usagePath: join(dir, "usage.jsonl"),
      cache: { get: () => null, set: () => {} },
    });
    const trace = await runTrace(claim, pipeline, { wayback });
    const oldest = trace.nodes.find((n) => n.id === trace.earliest.nodeIds[0])!;
    const newer = trace.nodes.find((n) => n.id !== oldest.id)!;
    const span = (id: string) => trace.spans.find((sp) => sp.nodeId === id)!.id;
    const backwards = { id: "e9", kind: "explicit" as const, parentId: newer.id, childId: oldest.id, parentSpanId: span(newer.id), childSpanId: span(oldest.id), linkHref: newer.url };
    const closed = closeTrail({ ...trace, edges: [backwards] });
    expect(closed.edges.some((e) => e.childId === oldest.id)).toBe(false);
    expect(closed.edges).toEqual([expect.objectContaining({ id: "e1", kind: "inferred", parentId: oldest.id, childId: newer.id, linkHref: null })]);
    expect(closed.roots).toEqual(trace.roots);
  });
});
