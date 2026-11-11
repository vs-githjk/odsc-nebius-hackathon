import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { replayDevBatch, runDevBatch, runLiveDevBatch } from "../../../eval/dev-run.ts";
import { replayTrace } from "../src/engine/run.ts";
import { send } from "../src/clients/http.ts";
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

  it("counts unreported attempts against the claim ceiling before reserving more shared spend", async () => {
    const t = setup();
    const ledger = { check: vi.fn(), reserve: vi.fn(() => "pending"), settle: vi.fn() };
    const result = await runLiveDevBatch([t.input], {
      dir: t.dir, ledger, report: () => {},
      loadFactory: async () => (_input, { budget }) => {
        budget.reserve(0.49);
        budget.reserve(0.02);
        throw new Error("unreachable");
      },
    });
    expect(result).toMatchObject({ failed: 1, recorded: 0 });
    expect(ledger.reserve).toHaveBeenCalledExactlyOnceWith(0.49);
    expect(JSON.parse(readFileSync(join(t.dir, "dev-01.error.json"), "utf8")).code).toBe("budget_exceeded");
  });

  it("restores earliest ids after the walk clears them and accounts for embedding attempts", async () => {
    const t = setup();
    const usage = { at: t.live.recordedAt, traceId: t.live.id, step: "clusters", service: "tokenfactory" as const,
      endpoint: "/embeddings", model: "Qwen/Qwen3-Embedding-8B", promptTokens: 30, completionTokens: 0,
      cachedTokens: 0, credits: 0, costUsd: 0.0000003, latencyMs: 1, status: "200", cacheHit: false };
    const embed = vi.fn(async ({ input }: { input: string | string[] }) => ({
      data: { embeddings: Array.from(input, (_, i) => [1, i + 1]) }, usage, attempts: [usage],
    }));
    const same = (trace: Trace) => trace;
    const run = await runLiveDevBatch([t.input], {
      dir: t.dir, ledger: { check: vi.fn(), reserve: vi.fn(), settle: vi.fn() }, report: () => {},
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
        embeddingClient: { embed },
      }),
    });
    expect(run).toMatchObject({ recorded: 1, failed: 0 });
    const result = Trace.parse(JSON.parse(readFileSync(join(t.dir, "dev-01.json"), "utf8")));
    expect(embed).toHaveBeenCalledOnce();
    expect(result.earliest.nodeIds).toEqual(t.live.earliest.nodeIds);
    expect(result.nodes.map(node => node.date.value)).toEqual(t.live.nodes.map(node => node.date.value));
    expect(result.usage.at(-1)).toEqual(usage);
    expect(result.budget.usd).toBeCloseTo(t.live.budget.usd + usage.costUsd);
  });

  it("reserves each Tavily attempt and stops a denied retry before the transport", async () => {
    const t = setup();
    const fetch = vi.fn(async () => new Response("unavailable", { status: 503 }));
    const reserve = vi.fn().mockReturnValueOnce("first").mockImplementationOnce(() => {
      throw Object.assign(new Error("cap"), { code: "budget_exceeded" });
    });
    const result = await runLiveDevBatch([t.input], {
      dir: t.dir, ledger: { check: vi.fn(), reserve, settle: vi.fn() }, report: () => {},
      loadFactory: async () => async (_input, { tavilyAttempts }) => {
        await send({
          fetch, tavilyAttempts, cache: { get: () => null, set: vi.fn() },
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
    expect(JSON.parse(readFileSync(join(t.dir, "dev-01.json"), "utf8")).mode).toBe("REPLAY");
  });
});
