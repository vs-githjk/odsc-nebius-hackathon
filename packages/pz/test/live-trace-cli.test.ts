import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { initializeBudget } from "../../../eval/recordings/budget.ts";
import { traceCommand } from "../src/cli/trace.ts";

it("names missing provider keys before trying the default live trace", async () => {
  const io = { write: vi.fn(), error: vi.fn() };
  const transport = vi.fn<typeof fetch>();
  expect(await traceCommand(["The reserve holds 14 turtles."], io, {}, transport)).toBe(1);
  expect(io.error).toHaveBeenCalledWith("not_configured: NEBIUS_API_KEY, TAVILY_API_KEY");
  expect(transport).not.toHaveBeenCalled();
});

it("refuses an exhausted authoritative ledger before any provider call", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pz-trace-ledger-"));
  const ledger = join(dir, "ledger.json");
  const io = { write: vi.fn(), error: vi.fn() };
  const transport = vi.fn<typeof fetch>();
  try {
    initializeBudget(ledger, { capUsd: 1, priorSpendUsd: 1,
      start: new Date(Date.now() - 60_000).toISOString(), end: new Date(Date.now() + 60_000).toISOString() });
    expect(await traceCommand(["The reserve holds 14 turtles."], io, {
      NEBIUS_API_KEY: "test-nebius", TAVILY_API_KEY: "test-tavily", DEV_LEDGER: ledger,
    }, transport)).toBe(1);
    expect(io.error).toHaveBeenCalledWith("budget_exceeded");
    expect(transport).not.toHaveBeenCalled();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
