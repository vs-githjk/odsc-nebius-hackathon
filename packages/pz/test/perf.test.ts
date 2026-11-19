import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { median, perfRow, report } from "../../../eval/perf.ts";
import { USD_PER_CREDIT } from "../src/clients/tavily.ts";
import { Trace } from "../src/schema/index.ts";
import { traceCost } from "../src/usage/cost.ts";

const load = (path: string): Trace => Trace.parse(JSON.parse(readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), "utf8")));

describe("#165 cost and time per trace", () => {
  it("adds Tavily credits at the list price to Token Factory's recorded cost, and skips cache hits", () => {
    const t = load("eval/dev-traces/dev-06.json");
    const model = t.usage.filter((r) => r.service === "tokenfactory" && !r.cacheHit).reduce((n, r) => n + r.costUsd, 0);
    const c = traceCost(t);
    expect(c.tavilyUsd).toBeCloseTo(t.budget.credits * USD_PER_CREDIT, 10);
    expect(c.modelUsd).toBeCloseTo(model, 10);
    expect(c.totalUsd).toBeCloseTo(c.tavilyUsd + c.modelUsd, 10);
    expect(c.seconds).toBe(t.budget.ms / 1000);
    // budget.usd on a live trace is Token Factory only, so the old card understated the cost.
    expect(t.budget.usd).toBeLessThan(c.totalUsd);
    const cached = { ...t, usage: t.usage.map((r) => ({ ...r, cacheHit: true })) };
    expect(traceCost(cached).modelUsd).toBe(0);
  });

  it("takes the median of an odd and an even list", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(Number.isNaN(median([]))).toBe(true);
  });

  it("reports the medians against the target, the services by latency and one row per trace", () => {
    const rows = ["eval/dev-traces/dev-06.json", "eval/dev-traces/dev-11.json"].map((p) => perfRow(load(p)));
    const md = report(rows, "eval/dev-traces");
    expect(md).toMatch(/Median time: \d+ s\*\* \((met|not met)\)/);
    expect(md).toMatch(/Median cost: \$\d+\.\d+\*\* \((met|not met)\)/);
    expect(md).toContain("| dev-06 | ");
    expect(md).toContain("| dev-11 | ");
    expect(rows[0]!.calls.tavily).toBeGreaterThan(0);
  });
});
