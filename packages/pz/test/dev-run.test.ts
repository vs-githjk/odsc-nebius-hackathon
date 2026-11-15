import { mkdtempSync, readFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { replayDevBatch, runDevBatch, runLiveDevBatch } from "../../../eval/dev-run.ts";
import { replayTrace } from "../src/engine/run.ts";
import { Trace } from "../src/schema/index.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "pz-dev-run-"));
  const fixture = Trace.parse(JSON.parse(readFileSync(new URL("../../../fixtures/traces/sample-rich.json", import.meta.url), "utf8")));
  const input = { id: "dev-01", text: fixture.claim.text, tracedOrigin: "scoring-only" };
  const live = { ...fixture, id: input.id, mode: "LIVE" as const, synthetic: false };
  return { dir, fixture, input, live };
}

describe("T39 batch runner", () => {
  it("preflights the entire run before invoking an adapter", async () => {
    const t = setup(), run = vi.fn();
    const checkBudget = vi.fn(() => { throw new Error("cap"); });
    await expect(runDevBatch([t.input, { ...t.input, id: "dev-02" }], {
      dir: t.dir, mode: "LIVE", run, checkBudget, report: () => {},
    })).rejects.toThrow("cap");
    expect(checkBudget).toHaveBeenCalledWith(1);
    expect(run).not.toHaveBeenCalled();
  });

  it("checks the real weekly ledger before importing the pipeline", async () => {
    const t = setup(), loadFactory = vi.fn();
    const ledger = { check: vi.fn(() => { throw Object.assign(new Error("cap"), { code: "budget_exceeded" }); }),
      reserve: vi.fn(), settle: vi.fn() };
    await expect(runLiveDevBatch([t.input], {
      dir: t.dir, ledger, loadFactory, report: () => {},
    })).rejects.toMatchObject({ code: "budget_exceeded" });
    expect(loadFactory).not.toHaveBeenCalled();
    expect(ledger.reserve).not.toHaveBeenCalled();
  });

  it("moves a stale trace out of the scorer path on a forced failure", async () => {
    const t = setup();
    const path = join(t.dir, "dev-01.json");
    writeFileSync(path, JSON.stringify(t.live));
    const result = await runDevBatch([t.input], {
      dir: t.dir, mode: "LIVE", force: true, checkBudget: () => {},
      report: () => {}, run: async () => { throw new Error("failed"); },
    });
    expect(result).toMatchObject({ failed: 1, recorded: 0 });
    expect(existsSync(path)).toBe(false);
    expect(readdirSync(t.dir).some(name => name.endsWith(".superseded"))).toBe(true);
  });

  it("applies the claim deadline before any further paid request", async () => {
    const t = setup();
    const controller = new AbortController();
    const timer = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const fetch = vi.fn<typeof globalThis.fetch>();
    const reserve = vi.fn();
    try {
      const result = await runLiveDevBatch([t.input], {
        dir: t.dir, ledger: { check: vi.fn(), reserve, settle: vi.fn() }, fetch, report: () => {},
        loadFactory: async () => async () => {
          controller.abort();
          throw new Error("cancelled factory");
        },
      });
      expect(timer).toHaveBeenCalledWith(300_000);
      expect(result).toMatchObject({ failed: 1, recorded: 0 });
      expect(fetch).not.toHaveBeenCalled();
      expect(reserve).not.toHaveBeenCalled();
      expect(JSON.parse(readFileSync(join(t.dir, "dev-01.error.json"), "utf8")).code).toBe("claim_timeout");
    } finally {
      timer.mockRestore();
    }
  });

  it("restores earliest ids after the walk clears them and accounts for embedding attempts", async () => {
    const t = setup();
    const usage = { at: t.live.recordedAt, traceId: t.live.id, step: "clusters", service: "tokenfactory" as const,
      endpoint: "/embeddings", model: "Qwen/Qwen3-Embedding-8B", promptTokens: 30, completionTokens: 0,
      cachedTokens: 0, credits: 0, costUsd: 0.0000003, latencyMs: 1, status: "200", cacheHit: false };
    const reserve = vi.fn(() => "embedding");
    const settle = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ usage: { prompt_tokens: 30 },
        data: request.input.map((_: string, index: number) => ({ index, embedding: [1, index + 1] })) }));
    });
    vi.stubEnv("NEBIUS_API_KEY", "test-only");
    const same = (trace: Trace) => trace;
    const run = await runLiveDevBatch([t.input], {
      dir: t.dir, ledger: { check: vi.fn(), reserve, settle }, fetch, report: () => {},
      loadFactory: async () => () => ({
        pipeline: {
          intake: () => ({ ...t.live, earliest: { ...t.live.earliest, nodeIds: [] } }),
          fingerprint: same, walk: same, spans: same, readouts: same, card: same,
        },
        wayback: { firstCapture: async url => {
          const firstCapture = t.live.nodes.find(node => node.url === url)?.date.firstCapture;
          return {
            data: firstCapture ? { status: "found", firstCapture, timestamp: firstCapture.replaceAll("-", "") + "000000" } : { status: "none" },
            usage: { ...usage, service: "wayback", step: "dating", promptTokens: 0, costUsd: 0 },
          };
        } },
      }),
    });
    expect(run).toMatchObject({ recorded: 1, failed: 0 });
    const result = Trace.parse(JSON.parse(readFileSync(join(t.dir, "dev-01.json"), "utf8")));
    vi.unstubAllEnvs();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toBe("https://api.tokenfactory.nebius.com/v1/embeddings");
    expect(reserve).toHaveBeenCalledExactlyOnceWith(0.002);
    expect(settle).toHaveBeenCalledWith("embedding", expect.closeTo(0.0000003));
    expect(result.earliest.nodeIds).toEqual(t.live.earliest.nodeIds);
    expect(result.nodes.map(node => node.date.value)).toEqual(t.live.nodes.map(node => node.date.value));
    expect(result.usage.at(-1)).toMatchObject({ endpoint: usage.endpoint, model: usage.model, promptTokens: 30 });
    expect(result.budget.usd).toBeCloseTo(t.live.budget.usd + usage.costUsd);
  });

  it("reserves each Tavily attempt and stops a denied retry before the transport", async () => {
    const t = setup();
    const fetch = vi.fn(async () => new Response("unavailable", { status: 503 }));
    const reserve = vi.fn().mockReturnValueOnce("first").mockImplementationOnce(() => {
      throw Object.assign(new Error("cap"), { code: "budget_exceeded" });
    });
    const result = await runLiveDevBatch([t.input], {
      dir: t.dir, fetch, ledger: { check: vi.fn(), reserve, settle: vi.fn() }, report: () => {},
      loadFactory: async () => async (_input, { sendTavily }) => {
        await sendTavily({
          cache: { get: () => null, set: vi.fn() },
          usage: { rows: [], append: vi.fn() },
        }, {
          service: "tavily", endpoint: "search", step: "walk", url: "https://api.tavily.com/search",
          cacheInput: {}, maxCredits: 2, timeoutMs: 1000, parse: () => ({ data: [], credits: 2 }),
        });
        throw new Error("unreachable");
      },
    });
    expect(result).toMatchObject({ failed: 1 });
    expect(reserve.mock.calls).toEqual([[0.02], [0.02]]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(readFileSync(join(t.dir, "dev-01.error.json"), "utf8")).code).toBe("budget_exceeded");
  });

  it("resumes valid traces and only passes claim text and id to the adapter", async () => {
    const t = setup();
    const opts = { dir: t.dir, mode: "LIVE" as const, run: vi.fn(async () => t.live),
      checkBudget: vi.fn(), report: vi.fn() };
    expect(await runDevBatch([t.input], opts)).toMatchObject({ recorded: 1 });
    expect(opts.run.mock.calls[0]).toEqual([{ id: t.input.id, text: t.input.text }, expect.objectContaining({ usd: 0.5 })]);
    expect(opts.checkBudget).toHaveBeenCalledTimes(2);
    expect(await runDevBatch([t.input], opts)).toMatchObject({ skipped: 1 });
    expect(opts.run).toHaveBeenCalledTimes(1);
  });

  it("writes typed failures without a half trace and stops at a budget refusal", async () => {
    const t = setup();
    const run = vi.fn(async () => { throw Object.assign(new Error("private response"), { code: "budget_exceeded" }); });
    const result = await runDevBatch([t.input, { ...t.input, id: "dev-02" }], {
      dir: t.dir, mode: "LIVE", run, checkBudget: () => {}, report: () => {},
    });
    expect(result).toEqual({ recorded: 0, skipped: 0, failed: 1, unattempted: 1 });
    expect(existsSync(join(t.dir, "dev-01.json"))).toBe(false);
    expect(JSON.parse(readFileSync(join(t.dir, "dev-01.error.json"), "utf8"))).toEqual({ id: "dev-01", code: "budget_exceeded" });
  });

  it("replays through the trace CLI and preserves an existing verified live result", async () => {
    const t = setup();
    const source = mkdtempSync(join(tmpdir(), "pz-dev-captures-"));
    const capture = JSON.stringify(t.live);
    writeFileSync(join(source, "dev-01.json"), capture);
    const opts = { source, dir: t.dir, report: () => {} };
    expect(await replayDevBatch([t.input], opts)).toMatchObject({ recorded: 1 });
    const path = join(t.dir, "dev-01.json");
    expect(JSON.parse(readFileSync(path, "utf8")).mode).toBe("REPLAY");
    writeFileSync(path, capture);
    expect(await replayDevBatch([t.input], opts)).toMatchObject({ skipped: 1 });
    expect(readFileSync(path, "utf8")).toBe(capture);
    expect(readFileSync(join(source, "dev-01.json"), "utf8")).toBe(capture);
  });

  it("accepts a keyless verified replay and rejects a synthetic trace in live mode", async () => {
    const t = setup(), checkBudget = vi.fn();
    expect(await runDevBatch([t.input], {
      dir: t.dir, mode: "REPLAY", checkBudget, report: () => {}, run: async () => replayTrace(t.live),
    })).toMatchObject({ recorded: 1 });
    expect(checkBudget).not.toHaveBeenCalled();
    expect(await runDevBatch([t.input], {
      dir: t.dir, mode: "LIVE", force: true, checkBudget, report: () => {}, run: async () => t.fixture,
    })).toMatchObject({ failed: 1 });
    expect(existsSync(join(t.dir, "dev-01.json"))).toBe(false);
  });
});
