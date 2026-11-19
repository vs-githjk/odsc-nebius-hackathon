import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Trace } from "../src/schema/index.ts";
import { liveService, RESERVATION, type Runner } from "../src/live/service.ts";
import { hash, memoryStore, micros, redisStore } from "../src/live/store.ts";
import { liveBudget } from "../src/live/budget.ts";
import { loadRules } from "../src/rules/index.ts";
import { pipelineRunner } from "../src/live/runtime.ts";
const fixture = Trace.parse(JSON.parse(readFileSync("fixtures/traces/sample-no-pages.json", "utf8")));
const env = { NEBIUS_API_KEY: "test-model-secret", TAVILY_API_KEY: "test-search-secret" };
const request = (claim: unknown = "A claim with 9 widgets.", ip = "192.0.2.1") => new Request("https://local/api/trace", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `${ip}, 192.0.2.2` }, body: JSON.stringify({ claim }) });
function setup(overrides: Record<string, string | undefined> = {}, runner?: Runner) {
  const store = memoryStore();
  const run = vi.fn<Runner>(runner ?? (async (_claim, _signal, emit, charge) => {
    charge(0.12); emit({ sequence: 0, type: "stage", stage: "walk", status: "started" });
    return structuredClone(fixture);
  }));
  return { store, run, service: liveService({ env: { ...env, ...overrides }, store, run, now: () => 0 }) };
}
const events = async (response: Response) => (await response.text()).trim().split("\n").map(line => JSON.parse(line));
describe("live service", () => {
  it("reserves 0.37 by default and admits 15 sequential traces under 2 dollars", async () => {
    expect(RESERVATION).toBe(0.37);
    const { service, store } = setup({}, async (_c, _s, _e, charge) => { charge(0.11); return fixture; });
    for (let i = 0; i < 15; i++) {
      expect((await service.status()).live).toBe(true);
      const response = await service.trace(request("Claim " + i, "192.0.2." + (i + 1)));
      expect(response.status).toBe(200);
      expect((await events(response)).at(-1).type).toBe("trace");
    }
    expect(await store.get("pz:spent_micros")).toBe("1650000");
    expect((await service.status()).reason).toBe("cap");
    expect((await service.trace(request("Next claim"))).status).toBe(503);
  });
  it("admits two concurrent traces under the default cap", async () => {
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const { service, store } = setup({}, async (_c, _s, _e, charge) => { await waiting; charge(0.11); return fixture; });
    const first = await service.trace(request("First claim"));
    const second = await service.trace(request("Second claim"));
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(await store.get("pz:spent_micros")).toBe("740000");
    release();
    await Promise.all([first.text(), second.text()]);
    expect(await store.get("pz:spent_micros")).toBe("220000");
  });
  it("clamps configured budgets to rules and uses the derived reservation", async () => {
    const { caps } = loadRules();
    expect(liveBudget({ LIVE_TRACE_CREDITS: "999", LIVE_TRACE_MODEL_USD: "999" }))
      .toEqual({ credits: caps.credits, usd: caps.usd, reservation: caps.usd + caps.credits * 0.008 });
    const high = setup({ LIVE_TRACE_CREDITS: "999", LIVE_TRACE_MODEL_USD: "999", LIVE_USD_CAP: "1" });
    expect((await high.service.status()).reason).toBe("cap");
    const low = setup({ LIVE_TRACE_CREDITS: "10", LIVE_TRACE_MODEL_USD: "0.02", LIVE_USD_CAP: "0.1" });
    expect((await low.service.status()).live).toBe(true);
    const response = await low.service.trace(request());
    expect(response.status).toBe(200);
    expect(await low.store.get("pz:spent_micros")).toBe("100000");
    await response.text();
  });
  it.each([
    [{ LIVE_TRACE_CREDITS: "2" }, "credits"],
    [{ LIVE_TRACE_MODEL_USD: "0" }, "usd"],
  ] as const)("streams a partial trace when the runner exhausts %j", async (limits, capHit) => {
    let searchCalls = 0;
    const fake: typeof fetch = async (url, init) => {
      if (String(url).includes("api.tavily.com")) {
        searchCalls++;
        return Response.json({ results: [], usage: { credits: 1 } });
      }
      const body = JSON.parse(String(init?.body));
      const properties = body.response_format.json_schema.schema.properties;
      const content = "subject" in properties
        ? { subject: "penguins", unit: "times a day", population: null, time: null, hedge: null, namedSource: null }
        : { queries: [] };
      return Response.json({ usage: { prompt_tokens: 100, completion_tokens: 20 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }] });
    };
    const { service, store } = setup(limits, pipelineRunner({ ...env, ...limits }, fake));
    const lines = await events(await service.trace(request("Penguins nap 9 times a day.")));
    expect(lines.some(e => e.type === "error")).toBe(false);
    const last = lines.at(-1);
    expect(last.type).toBe("trace");
    const trace = Trace.parse(last.trace);
    expect(trace.decision.state).toBe("PARTIAL");
    expect(trace.budget.capHit).toBe(capHit);
    expect(searchCalls).toBeLessThanOrEqual(capHit === "credits" ? 2 : 0);
    expect(Number(await store.get("pz:spent_micros")) / 1e6)
      .toBeCloseTo(trace.budget.usd + trace.budget.credits * 0.008, 5);
  });

  it.each(["", "   ", "x".repeat(401), 3, null, {}, []])("rejects invalid claims without spending: %j", async claim => {
    const { service, run, store } = setup(); expect((await service.trace(request(claim))).status).toBe(400);
    expect(run).not.toHaveBeenCalled(); expect(await store.get("pz:spent_micros")).toBeNull();
  });
  it("rejects methods, content types, malformed and oversized JSON", async () => {
    const { service, run } = setup();
    expect((await service.trace(new Request("https://local"))).status).toBe(405);
    for (const [body, content] of [["{}", "text/plain"], ["{", "application/json"], [" ".repeat(9000), "application/json"]]) {
      expect((await service.trace(new Request("https://local", { method: "POST", body, headers: { "content-type": content! } }))).status).toBe(400);
    }
    expect(run).not.toHaveBeenCalled();
  });
  it("fails closed without keys or a store and obeys both kill switches", async () => {
    const { service, run } = setup({ LIVE_ENABLED: "false" });
    expect((await service.status()).reason).toBe("disabled"); expect((await service.trace(request())).status).toBe(503);
    expect((await setup({ NEBIUS_API_KEY: "" }).service.status()).reason).toBe("not_configured");
    expect((await liveService({ env, store: null, run }).status()).reason).toBe("not_configured");
    const other = setup(); await other.store.set("pz:live_enabled", "false", 3600);
    expect((await other.service.status()).reason).toBe("disabled");
    expect((await other.service.trace(request())).status).toBe(503); expect(other.run).not.toHaveBeenCalled();
  });
  it("streams NDJSON stages followed by a trace and settles exact arithmetic", async () => {
    const { service, store } = setup(); const response = await service.trace(request());
    expect(response.headers.get("content-type")).toBe("application/x-ndjson");
    expect(await store.get("pz:spent_micros")).toBe(String(micros(RESERVATION)));
    const lines = await events(response); expect(lines.map(e => e.type)).toEqual(["stage", "trace"]);
    expect(lines[0]).toMatchObject({ stage: "walk", status: "started" });
    expect(await store.get("pz:spent_micros")).toBe("120000"); expect((await service.status()).spentUsd).toBe(0.12);
  });
  it("refuses a cap and atomically prevents concurrent overspending", async () => {
    const low = setup({ LIVE_USD_CAP: "0.36" }); expect((await low.service.status()).reason).toBe("cap");
    expect((await low.service.trace(request())).status).toBe(503); expect(low.run).not.toHaveBeenCalled();
    let release!: () => void;
    const { service, store } = setup({ LIVE_USD_CAP: "0.5" }, async (_c, _s, _e, charge) => { charge(0.12); await new Promise<void>(resolve => { release = resolve; }); return fixture; });
    const first = await service.trace(request());
    expect((await service.trace(request("Different claim", "192.0.2.3"))).status).toBe(503);
    release(); await first.text(); expect(await store.get("pz:spent_micros")).toBe("120000");
  });
  it("enforces per-IP and global daily limits without charging rejected requests", async () => {
    for (const limit of [{ LIVE_PER_IP_PER_HOUR: "1" }, { LIVE_PER_DAY: "1" }]) {
      const { service, store, run } = setup(limit);
      await (await service.trace(request())).text();
      const response = await service.trace(request("Another claim", limit.LIVE_PER_DAY ? "192.0.2.4" : "192.0.2.1"));
      expect(response.status).toBe(429); expect((await events(response))[0].code).toBe("rate_limit");
      expect(await store.get("pz:spent_micros")).toBe("120000"); expect(run).toHaveBeenCalledTimes(1);
    }
  });
  it("normalizes cache hits before rate limits and cap refusal, with no additional spend", async () => {
    const { service, store, run } = setup({ LIVE_PER_IP_PER_HOUR: "1" });
    await (await service.trace(request())).text(); await store.set("pz:spent_micros", "2000000", 60);
    const response = await service.trace(request("  A CLAIM   with 9 widgets.  "));
    expect(response.status).toBe(200); expect((await events(response)).map(e => e.type)).toEqual(["trace"]);
    expect(run).toHaveBeenCalledTimes(1); expect(await store.get("pz:spent_micros")).toBe("2000000");
  });
  it("skips oversized cache entries", async () => {
    const { service, store } = setup({}, async () => ({ ...fixture, scopeNote: "x".repeat(1000000) }));
    await (await service.trace(request())).text();
    expect(await store.get(`pz:trace:${hash("a claim with 9 widgets.")}`)).toBeNull();
  });
  it("settles failed attempts and never returns provider error secrets", async () => {
    const { service, store } = setup({}, async (_c, _s, _e, charge) => { charge(0.07); throw new Error(Object.values(env).join(" ")); });
    const body = await (await service.trace(request())).text();
    for (const secret of Object.values(env)) expect(body).not.toContain(secret);
    expect(JSON.parse(body).code).toBe("trace_failed"); expect(await store.get("pz:spent_micros")).toBe("70000");
  });
  it("redacts secrets in successful traces too", async () => {
    const { service } = setup({}, async () => ({ ...fixture, scopeNote: Object.values(env).join(" ") }));
    const body = await (await service.trace(request())).text();
    for (const secret of Object.values(env)) expect(body).not.toContain(secret);
  });
  it("deadline aborts the runner, sends time_limit and settles incurred spend", async () => {
    const store = memoryStore(); let signal: AbortSignal | undefined;
    const service = liveService({ env, store, deadlineMs: 5, run: async (_c, s, emit, charge) => {
      signal = s; charge(0.02); emit({ sequence: 0, type: "stage", stage: "walk", status: "started" });
      return new Promise<Trace>(() => {});
    } });
    const lines = await events(await service.trace(request())); expect(lines.at(-1).code).toBe("time_limit");
    expect(signal?.aborted).toBe(true); expect(await store.get("pz:spent_micros")).toBe("20000");
  });
  it("cancellation aborts providers and retains incurred spend", async () => {
    const store = memoryStore(); let signal: AbortSignal | undefined;
    const service = liveService({ env, store, run: async (_c, s, _emit, charge) => { signal = s; charge(0.03); return new Promise<Trace>(() => {}); } });
    const response = await service.trace(request()); await response.body!.cancel();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(signal?.aborted).toBe(true); expect(await store.get("pz:spent_micros")).toBe("30000");
  });
  it("store outages fail closed and failed settlement retains the reservation", async () => {
    const { store, run } = setup();
    const unavailable = liveService({ env, run, store: { ...store, get: async () => { throw new Error(env.NEBIUS_API_KEY); } } });
    expect((await unavailable.status()).reason).toBe("not_configured"); expect((await unavailable.trace(request())).status).toBe(503);
    const service = liveService({ env, run, store: { ...store, settle: async () => { throw new Error("offline"); } } });
    await (await service.trace(request())).text(); expect(await store.get("pz:spent_micros")).toBe(String(micros(RESERVATION)));
  });
  it("uses REST commands with bounded requests and safe errors", async () => {
    const calls: unknown[][] = [];
    const transport: typeof fetch = async (_url, init) => { expect(init?.signal).toBeDefined(); calls.push(JSON.parse(String(init?.body)) as unknown[]); return Response.json({ result: calls.length === 1 ? "ok" : 1 }); };
    const store = redisStore("https://redis.invalid", "test-redis-secret", transport);
    expect(await store.admit({ id: "one", ip: "hashed", hour: 0, day: 0, cap: 2000000, amount: 1700000, perIp: 2, perDay: 30 })).toBe("ok");
    await store.settle("one", 120000); expect(calls.every(call => call[0] === "EVAL")).toBe(true);
    const bad = redisStore("https://redis.invalid", "test-redis-secret", async () => Response.json({ error: env.NEBIUS_API_KEY }));
    await expect(bad.get("x")).rejects.toThrow("store_unavailable");
  });
  it("the real pipeline uses an abort signal and accounts for model usage on failure", async () => {
    let paid = 0; const controller = new AbortController();
    const fake: typeof fetch = async (_url, init) => {
      expect(init?.signal).toBeDefined(); expect(init?.redirect).toBe("error");
      return Response.json({ error: env.NEBIUS_API_KEY, usage: { prompt_tokens: 100, completion_tokens: 10 } }, { status: 400 });
    };
    await expect(pipelineRunner(env, fake)("A claim with 9 widgets.", controller.signal, () => {}, usd => { paid = usd; })).rejects.toThrow();
    expect(paid).toBeGreaterThan(0); expect(paid).toBeLessThan(0.01);
  });
  it("runs the production pipeline to a verified trace with fake search and model fetches", async () => {
    let charged = 0; const stages: string[] = []; const urls: string[] = [];
    const fake: typeof fetch = async (url, init) => {
      urls.push(String(url)); expect(init?.signal).toBeDefined();
      if (String(url).includes("api.tavily.com")) return Response.json({ results: [], usage: { credits: 1 } });
      const body = JSON.parse(String(init?.body)) as { response_format: { json_schema: { schema: { properties: Record<string, unknown> } } } };
      const properties = body.response_format.json_schema.schema.properties;
      const content = "subject" in properties
        ? { subject: "penguins", unit: "times a day", population: null, time: null, hedge: null, namedSource: null }
        : { queries: [] };
      return Response.json({ usage: { prompt_tokens: 100, completion_tokens: 20 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }] });
    };
    const trace = await pipelineRunner(env, fake)("Penguins nap 9 times a day.", new AbortController().signal,
      event => { if (event.type === "stage" && event.status === "completed") stages.push(event.stage); }, usd => { charged = usd; });
    expect(trace.mode).toBe("LIVE"); expect(trace.decision.state).toBe("NO_PAGES_FOUND");
    expect(stages).toEqual(["intake", "fingerprint", "walk", "spans", "dating", "clusters", "readouts", "card"]);
    expect(urls.some(url => url.includes("api.tavily.com"))).toBe(true);
    expect(charged).toBeCloseTo(trace.budget.usd + trace.budget.credits * 0.008, 8);
  });
  it("rate counters expire and settlement is idempotent", async () => {
    let time = 0; const store = memoryStore(() => time);
    const a = { id: "one", ip: "ip", hour: 0, day: 0, cap: 10000000, amount: 1700000, perIp: 1, perDay: 30 };
    expect(await store.admit(a)).toBe("ok"); await store.settle("one", 120000); await store.settle("one", 120000);
    expect(await store.get("pz:spent_micros")).toBe("120000");
    expect(await store.admit({ ...a, id: "two" })).toBe("rate_limit");
    time = 3600000; expect(await store.admit({ ...a, id: "two", hour: 1 })).toBe("ok");
    time = 7200001; expect(await store.get("pz:ip:ip:0")).toBeNull();
  });

});
