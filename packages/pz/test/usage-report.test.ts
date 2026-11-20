import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { usageReport } from "../scripts/usage-report.ts";
import { Trace } from "../src/schema/index.ts";

const sample = Trace.parse(JSON.parse(readFileSync(new URL("../../../fixtures/traces/sample-origin.json", import.meta.url), "utf8")));
const base = { ...sample, mode: "REPLAY" as const, synthetic: false };
const row = { at: base.recordedAt, traceId: base.id, step: "walk", service: "tavily" as const, endpoint: "search", model: null,
  promptTokens: 0, completionTokens: 0, cachedTokens: 0, credits: 1, costUsd: 0.008, latencyMs: 1, status: "200", cacheHit: false };
describe("recorded usage report", () => {
  it("includes failed attempts but never double counts copied cache usage", () => {
    const trace = { ...base, usage: [row, { ...row, status: "500" }, { ...row, cacheHit: true }] };
    const report = usageReport([{ path: "eval/dev-traces/dev-01.json", trace }]);
    expect(report).toContain("Request cache-hit rate: 33.33%");
    expect(report).toContain("| **Total** | | | | 2 | 1 | 0 | 0 | 0 | 2 | 0.01600000 |");
    expect(report).toContain("../eval/dev-traces/dev-01.json");
  });
  it("separates model and stage and retains provider cached tokens", () => {
    const chat = { ...row, service: "tokenfactory" as const, model: "qwen", endpoint: "chat", promptTokens: 10, completionTokens: 2, cachedTokens: 4, credits: 0, costUsd: 0.001 };
    const report = usageReport([{ path: "a", trace: { ...base, usage: [chat, { ...chat, step: "card" }] } }]);
    expect(report).toContain("| tokenfactory | chat | qwen | card |");
    expect(report).toContain("| **Total** | | | | 2 | 0 | 20 | 4 | 8 | 0 | 0.00200000 |");
  });
  it("refuses synthetic results and duplicate trace IDs", () => {
    expect(() => usageReport([{ path: "a", trace: sample }])).toThrow("Recorded traces required");
    expect(() => usageReport([{ path: "a", trace: base }, { path: "b", trace: base }])).toThrow("Duplicate trace IDs");
    expect(usageReport([])).toContain("Request cache-hit rate: 0.00%");
  });
});
