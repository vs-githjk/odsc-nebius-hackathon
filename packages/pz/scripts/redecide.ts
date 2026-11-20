// Replay re-decision (#307): rewrite only the stored `decision` of recorded traces with today's rules. Nothing else in
// a trace changes, and no search, fetch or model call is made. Usage: node --import tsx packages/pz/scripts/redecide.ts <trace.json>...
import { readFileSync, writeFileSync } from "node:fs";
import { Trace } from "../src/schema/index.ts";
import { decideStopState, loadRules } from "../src/rules/index.ts";

const rules = loadRules();
for (const file of process.argv.slice(2)) {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const before = raw.decision;
  const after = decideStopState(Trace.parse(raw), rules);
  if (JSON.stringify(before) === JSON.stringify(after)) { console.log(`${file}: unchanged`); continue; }
  raw.decision = after;
  writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
  console.log(`${file}: ${before.state} row ${before.row} -> ${after.state} row ${after.row}`);
}
