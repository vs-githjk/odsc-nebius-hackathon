import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTokenFactoryClient } from "../src/clients/tokenfactory.ts";
import { describe, expect, it } from "vitest";
import { budgetedFetch, initializeBudget, openBudget } from "../../../eval/recordings/budget.ts";

const start = "2026-11-09T08:00:00Z", end = "2026-11-16T08:00:00Z";
const setup = (priorSpendUsd = 14) => {
  const path = join(mkdtempSync(join(tmpdir(), "pz-week-")), "budget.json");
  initializeBudget(path, { capUsd: 15, priorSpendUsd, start, end });
  return { path, budget: openBudget(path, () => Date.parse(start) + 1) };
};
const entries = (path: string) => Object.values(JSON.parse(readFileSync(path, "utf8")).entries) as { amount: number; settled: boolean }[];

describe("T38 shared-file attempt budget", () => {
  it("imports prior spend, persists reservations across instances and refuses overspend", () => {
    const { path, budget } = setup(); budget.reserve(0.6);
    const other = openBudget(path, () => Date.parse(start) + 1);
    expect(() => other.reserve(0.5)).toThrow("budget_exceeded");
    other.reserve(0.4); expect(entries(path)).toHaveLength(2);
    expect(() => budget.reserve(0.000001)).toThrow("budget_exceeded");
  });
  it("settles a known charge once and releases only the unused reservation", () => {
    const { path, budget } = setup(); const id = budget.reserve(0.9); budget.settle(id, 0.2);
    budget.reserve(0.8); expect(entries(path)[0]).toEqual({ amount: 200000, settled: true });
    expect(() => budget.settle(id, 0)).toThrow("invalid_reservation");
  });
  it("retains unknown and failed attempts; each retry reserves again", async () => {
    const { path, budget } = setup(); let calls = 0;
    const fetch = budgetedFetch({ budget, ceilingUsd: 0.4, cost: async () => null, fetch: async () => {
      calls++; return new Response("{}", { status: calls === 1 ? 500 : 200 });
    } });
    await fetch("https://example.invalid"); await fetch("https://example.invalid");
    await expect(fetch("https://example.invalid")).rejects.toThrow("budget_exceeded");
    expect(calls).toBe(2); expect(entries(path).every(e => !e.settled)).toBe(true);
  });
  it("guards the existing Token Factory client's automatic retry before another HTTP attempt", async () => {
    const { path, budget } = setup(); let calls = 0;
    const key = process.env.NEBIUS_API_KEY;
    process.env.NEBIUS_API_KEY = "synthetic-test-key";
    try {
      const fetch = budgetedFetch({ budget, ceilingUsd: 0.6, cost: async () => null,
        fetch: async () => { calls++; return new Response("{}", { status: 500 }); } });
      const client = createTokenFactoryClient({ fetch, sleep: async () => {}, logUsage: () => {} });
      await expect(client.chat({ model: "Qwen/Qwen3-30B-A3B-Instruct-2507", messages: [], maxTokens: 1 })).rejects.toMatchObject({ code: "budget_exceeded", usage: [{ status: "500" }] });
      expect(calls).toBe(1); expect(entries(path)).toEqual([{ amount: 600000, settled: false }]);
    } finally {
      if (key === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = key;
    }
  });
  it("reserves before network transport errors and before usage parsing errors", async () => {
    const { path, budget } = setup();
    const failed = budgetedFetch({ budget, ceilingUsd: 0.4, cost: async () => 0, fetch: async () => { throw new Error("offline"); } });
    await expect(failed("https://example.invalid")).rejects.toThrow("offline");
    const unreadable = budgetedFetch({ budget, ceilingUsd: 0.4, cost: async () => { throw new Error("invalid usage"); },
      fetch: async () => new Response("not json") });
    expect(await (await unreadable("https://example.invalid")).text()).toBe("not json");
    expect(entries(path)).toEqual([{ amount: 400000, settled: false }, { amount: 400000, settled: false }]);
  });
  it("measures a clone without consuming the existing client's body", async () => {
    const { path, budget } = setup();
    const fetch = budgetedFetch({ budget, ceilingUsd: 0.5, cost: async r => (await r.json()).usd,
      fetch: async () => new Response('{"usd":0.1}') });
    expect(await (await fetch("https://example.invalid")).json()).toEqual({ usd: 0.1 });
    expect(entries(path)).toEqual([{ amount: 100000, settled: true }]);
  });
  it("fails closed for an occupied lock, corrupt ledger or missing ledger", () => {
    const { path, budget } = setup();
    writeFileSync(path + ".lock", "another run"); expect(() => budget.reserve(0.1)).toThrow();
    const corrupt = setup(); writeFileSync(corrupt.path, "{}"); expect(() => corrupt.budget.reserve(0.1)).toThrow();
    expect(() => openBudget(path + ".missing").reserve(0.1)).toThrow();
  });
  it("refuses calls outside the approved week and never resets an existing ledger", () => {
    const { path } = setup();
    for (const at of [Date.parse(start) - 1, Date.parse(end)]) expect(() => openBudget(path, () => at).reserve(0.1)).toThrow("budget_exceeded");
    expect(() => initializeBudget(path, { capUsd: 15, priorSpendUsd: 0, start, end })).toThrow();
  });
  it("records a violated cost bound and prevents future reservations", () => {
    const { path, budget } = setup(); const id = budget.reserve(0.1);
    expect(() => budget.settle(id, 0.2)).toThrow("budget_bound_exceeded");
    expect(JSON.parse(readFileSync(path, "utf8")).breached).toBe(true);
    expect(() => budget.reserve(0.1)).toThrow("budget_exceeded");
  });
  it("rejects invalid amounts, caps above $15 and inverted windows", () => {
    const { path, budget } = setup();
    for (const v of [0, -1, NaN, Infinity]) expect(() => budget.reserve(v)).toThrow("invalid_budget");
    expect(() => initializeBudget(path + ".new", { capUsd: 16, priorSpendUsd: 0, start, end })).toThrow();
    expect(() => initializeBudget(path + ".new", { capUsd: 15, priorSpendUsd: 0, start: end, end: start })).toThrow();
  });
});
