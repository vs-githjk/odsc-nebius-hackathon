import { randomUUID } from "node:crypto";
import { closeSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { z } from "zod";

const units = z.number().int().nonnegative().safe();
const Ledger = z.object({
  cap: units.max(15_000_000), prior: units, start: z.iso.datetime(), end: z.iso.datetime(),
  breached: z.boolean(), entries: z.record(z.string(), z.object({ amount: units, settled: z.boolean() }).strict()),
}).strict();
type Ledger = z.infer<typeof Ledger>;
const micros = (usd: number) => {
  if (!Number.isFinite(usd) || usd < 0 || !Number.isSafeInteger(Math.ceil(usd * 1e6))) throw new Error("invalid_budget");
  return Math.ceil(usd * 1e6);
};
const spent = (ledger: Ledger) => ledger.prior + Object.values(ledger.entries).reduce((n, e) => n + e.amount, 0);

// Deliberately no default for prior spend or the week: callers must import the
// combined Tavily + Token Factory spend, not silently reset the team allowance.
export function initializeBudget(path: string, opts: {
  capUsd: number; priorSpendUsd: number; start: string; end: string;
}): void {
  const ledger = Ledger.parse({ cap: micros(opts.capUsd), prior: micros(opts.priorSpendUsd),
    start: opts.start, end: opts.end, breached: false, entries: {} });
  if (Date.parse(ledger.end) <= Date.parse(ledger.start) || ledger.prior > ledger.cap) throw new Error("invalid_budget");
  writeFileSync(path, JSON.stringify(ledger), { flag: "wx", mode: 0o600 });
}

export function openBudget(path: string, now = () => Date.now()) {
  function transaction<T>(change: (ledger: Ledger) => T): T {
    // A lock crash fails closed. Never auto-remove another process's lock.
    const lock = openSync(path + ".lock", "wx", 0o600);
    const temporary = path + "." + randomUUID() + ".tmp";
    try {
      const ledger = Ledger.parse(JSON.parse(readFileSync(path, "utf8")));
      const result = change(ledger);
      writeFileSync(temporary, JSON.stringify(ledger), { flag: "wx", mode: 0o600 });
      renameSync(temporary, path);
      return result;
    } finally {
      closeSync(lock); unlinkSync(path + ".lock");
    }
  }
  return {
    reserve(ceilingUsd: number): string {
      const amount = micros(ceilingUsd);
      if (!amount) throw new Error("invalid_budget");
      return transaction(ledger => {
        if (ledger.breached || now() < Date.parse(ledger.start) || now() >= Date.parse(ledger.end)
          || spent(ledger) + amount > ledger.cap) throw new Error("budget_exceeded");
        const id = randomUUID(); ledger.entries[id] = { amount, settled: false }; return id;
      });
    },
    settle(id: string, actualUsd: number): void {
      const amount = micros(actualUsd);
      const breached = transaction(ledger => {
        const entry = ledger.entries[id];
        if (!entry || entry.settled) throw new Error("invalid_reservation");
        ledger.breached ||= amount > entry.amount;
        entry.amount = amount; entry.settled = true;
        return ledger.breached;
      });
      if (breached) throw new Error("budget_bound_exceeded");
    },
  };
}

// Wrap the existing client's fetch, so each retry obtains its own reservation.
// The caller must supply a valid upper cost bound and trusted usage conversion.
// Unknown usage and transport/measurement failures retain the full reservation.
export function budgetedFetch(opts: {
  budget: ReturnType<typeof openBudget>; ceilingUsd: number;
  cost(response: Response): Promise<number | null>;
  fetch: typeof globalThis.fetch;
}): typeof globalThis.fetch {
  return async (input, init) => {
    const reservation = opts.budget.reserve(opts.ceilingUsd);
    const response = await opts.fetch(input, init);
    let actual: number | null;
    try { actual = await opts.cost(response.clone()); } catch { return response; }
    if (actual !== null) opts.budget.settle(reservation, actual);
    return response;
  };
}
