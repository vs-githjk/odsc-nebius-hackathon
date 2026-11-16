import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadRules } from "../rules/index.ts";
import { Trace } from "../schema/index.ts";
import { verifyTrace } from "./checks.ts";

export { verifyTrace } from "./checks.ts";
export { datesIn, earliestDates, falseCertainty, ORIGIN_WORDS, originWords, unbacked, type FalseCertainty } from "./false-certainty.ts";
export type { Check, Failure, TraceReport } from "./checks.ts";

// Traces recorded under earlier rules and kept as they were, each pinned by id and content hash.
export type HistoricalManifest = { rulesAt: string; note: string; traces: { id: string; sha256: string }[] };

// A hash of the trace's content, through the schema, so line endings and spacing in the file never change it.
export function traceHash(trace: unknown): string {
  return createHash("sha256").update(JSON.stringify(Trace.parse(trace))).digest("hex");
}

// `pz verify`: one line per historical record, one per failure, then one summary line. Exit 0 only when every check passes.
export function runVerify(paths: string[], opts: { pagesDir?: string; historical?: HistoricalManifest } = {}): { code: number; lines: string[] } {
  const rules = loadRules();
  const traces = paths.map((p) => Trace.parse(JSON.parse(readFileSync(p, "utf8"))));
  // Historical only when both the id and the content match: a re-run under the same id is checked in full.
  const isHistorical = (t: Trace) => opts.historical?.traces.some((h) => h.id === t.id && h.sha256 === traceHash(t)) ?? false;
  const reports = traces.map((t) => verifyTrace(t, { pagesDir: opts.pagesDir, rules, historical: isHistorical(t) }));
  const notes = traces.filter(isHistorical).map((t) =>
    `HISTORICAL ${t.id}: recorded under the rules at ${opts.historical!.rulesAt} (${opts.historical!.note}); atoms re-check skipped, stop state compared on state and row`);
  const sum = (pick: (r: (typeof reports)[number]) => number) => reports.reduce((n, r) => n + pick(r), 0);
  const failures = reports.flatMap((r) => r.failures);
  const lines = [...notes, ...failures.map((f) => `FAIL ${f.traceId} ${f.check}: ${f.detail}`)];
  lines.push(`${sum((r) => r.spansOk)} of ${sum((r) => r.spans)} spans re-verified, ${sum((r) => r.edgesWithoutTwoSpans)} edges without two spans, `
    + (reports.every((r) => r.stateAgrees) ? "stop state agrees" : "stop state differs"));
  return { code: failures.length === 0 ? 0 : 1, lines };
}
