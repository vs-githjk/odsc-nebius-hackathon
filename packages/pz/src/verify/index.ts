import { readFileSync } from "node:fs";
import { loadRules } from "../rules/index.ts";
import { Trace } from "../schema/index.ts";
import { verifyTrace } from "./checks.ts";

export { verifyTrace } from "./checks.ts";
export { falseCertainty, type FalseCertainty } from "./false-certainty.ts";
export type { Check, Failure, TraceReport } from "./checks.ts";

// `pz verify`: one line per failure, then one summary line. Exit 0 only when every check passes.
export function runVerify(paths: string[], opts: { pagesDir?: string } = {}): { code: number; lines: string[] } {
  const rules = loadRules();
  const reports = paths.map((p) => verifyTrace(Trace.parse(JSON.parse(readFileSync(p, "utf8"))), { ...opts, rules }));
  const sum = (pick: (r: (typeof reports)[number]) => number) => reports.reduce((n, r) => n + pick(r), 0);
  const failures = reports.flatMap((r) => r.failures);
  const lines = failures.map((f) => `FAIL ${f.traceId} ${f.check}: ${f.detail}`);
  lines.push(`${sum((r) => r.spansOk)} of ${sum((r) => r.spans)} spans re-verified, ${sum((r) => r.edgesWithoutTwoSpans)} edges without two spans, `
    + (reports.every((r) => r.stateAgrees) ? "stop state agrees" : "stop state differs"));
  return { code: failures.length === 0 ? 0 : 1, lines };
}
