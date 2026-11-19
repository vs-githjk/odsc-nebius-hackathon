// One-shot harness over the unchanged live dev runner. Scoring labels never reach the pipeline.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { initializeBudget, openBudget } from "./recordings/budget.ts";
import { runLiveDevBatch } from "./dev-run.ts";
import { createPipeline } from "./dev-pipeline.ts";

const privatePath = process.env.HELDOUT_FILE;
if (!privatePath) throw new Error("HELDOUT_FILE is required");
const bytes = readFileSync(privatePath);
const expectedHash = readFileSync("eval/heldout.sha256", "utf8").split(/\s/)[0]!;
const actualHash = createHash("sha256").update(bytes).digest("hex");
if (actualHash !== expectedHash) throw new Error("heldout_hash_mismatch");
const rows = bytes.toString("utf8").trim().split("\n").map(line => JSON.parse(line))
  .filter(row => typeof row.claim_text === "string");
if (rows.length !== 10) throw new Error("heldout_count_mismatch");
const dir = "eval/heldout-traces-nov19";
mkdirSync(dir, { recursive: true });
// Exclusive creation prevents a second invocation, including after a partial failure.
writeFileSync(dir + "/started.json", JSON.stringify({
  engine: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  startedAt: new Date().toISOString(), expectedHash, actualHash, matched: true,
  allocationUsd: 1.50,
  // The existing runner accepts dev-NN ids. Keep the mapping explicit and isolated from E2.
  mapping: rows.map((row, i) => ({ id: `dev-${String(i + 1).padStart(2, "0")}`, claimId: row.claim_id })),
}, null, 2) + "\n", { flag: "wx" });
const ledger = "../heldout-nov19-ledger.local.json";
initializeBudget(ledger, { capUsd: 1.50, priorSpendUsd: 0,
  start: "2026-11-19T08:00:00Z", end: "2026-11-20T08:00:00Z" });
const inputs = rows.map((row, i) => ({ id: `dev-${String(i + 1).padStart(2, "0")}`, text: row.claim_text }));
const result = await runLiveDevBatch(inputs, {
  dir, ledger: openBudget(ledger), loadFactory: async () => createPipeline,
  report: line => console.log(line),
});
const budget = JSON.parse(readFileSync(ledger, "utf8"));
const reservedMicros = Object.values(budget.entries).reduce((sum: number, entry: any) => sum + entry.amount, 0);
writeFileSync(dir + "/result.json", JSON.stringify({ ...result,
  finishedAt: new Date().toISOString(), reservedOrSpentUsd: reservedMicros / 1e6,
  unsettled: Object.values(budget.entries).filter((entry: any) => !entry.settled).length,
}, null, 2) + "\n");
console.log(JSON.stringify({ ...result, reservedOrSpentUsd: reservedMicros / 1e6 }));
