import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { usageTable } from "../scripts/usage-table.ts";
import { Trace } from "../src/schema/index.ts";

const base = Trace.parse(JSON.parse(readFileSync(new URL("../../../fixtures/traces/sample-origin.json", import.meta.url), "utf8")));
const row = { at: base.recordedAt, traceId: base.id, model: null, promptTokens: 0, completionTokens: 0, cachedTokens: 0, credits: 0, costUsd: 0, latencyMs: 0, status: "200", cacheHit: false };

describe("T75 usage table for the README", () => {
  it("lists every call in order from the trace's own rows, with totals that skip cache hits", () => {
    const trace: Trace = { ...base, usage: [
      { ...row, step: "fingerprint", service: "tokenfactory", endpoint: "chat", model: "Qwen/Qwen3-30B-A3B-Instruct-2507", promptTokens: 300, completionTokens: 40, costUsd: 0.000051, latencyMs: 820 },
      { ...row, step: "search", service: "tavily", endpoint: "search", credits: 1, costUsd: 0.008, latencyMs: 1400 },
      { ...row, step: "search", service: "tavily", endpoint: "search", latencyMs: 0, cacheHit: true },
      { ...row, step: "dating", service: "wayback", endpoint: "cdx", latencyMs: 300 },
    ] };
    const lines = usageTable(trace).split("\n");
    expect(lines[0]).toBe("| # | Step | Call | Model | Tokens in / out | Tavily credits | Cost | Latency | Status |");
    expect(lines[2]).toBe("| 1 | fingerprint | Token Factory chat | Qwen/Qwen3-30B-A3B-Instruct-2507 | 300 / 40 |  | $0.0001 | 820 ms | 200 |");
    expect(lines[3]).toBe("| 2 | search | Tavily search |  |  | 1 | $0.0080 | 1400 ms | 200 |");
    expect(lines[4]).toContain("200, cache hit");
    expect(lines.at(-1)).toBe("|  | **total** | 3 calls |  | 300 / 40 | 1 | $0.0081 | 2520 ms |  |");
  });
});
