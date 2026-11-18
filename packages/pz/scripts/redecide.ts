// Re-derives the stored decision of committed traces with today's rules (decideStopState), leaving every other field
// as it is. For a recorded trace whose state still holds but whose reasons gained a rule added since it was recorded
// (dev-01 after #225). Usage: node --import tsx packages/pz/scripts/redecide.ts <trace.json...>
import { readFileSync, writeFileSync } from "node:fs";
import { decideStopState, loadRules } from "../src/rules/index.ts";
import { Trace } from "../src/schema/index.ts";

const rules = loadRules();
for (const path of process.argv.slice(2)) {
  const text = readFileSync(path, "utf8");
  const trace = Trace.parse(JSON.parse(text));
  const decision = decideStopState(trace, rules);
  if (decision.state !== trace.decision.state || decision.row !== trace.decision.row) {
    console.log(`${path}: state would change (${trace.decision.state} row ${trace.decision.row} -> ${decision.state} row ${decision.row}); not rewritten, re-record it`);
    process.exitCode = 1;
    continue;
  }
  const raw = JSON.parse(text) as { decision: unknown };
  raw.decision = decision;
  writeFileSync(path, JSON.stringify(raw, null, 2) + (text.endsWith("\n") ? "\n" : ""));
  console.log(`${path}: decision reasons refreshed (${decision.state} row ${decision.row})`);
}
