import { AnswerRecord, type AnswerClaim } from "../schema/answer.ts";
import type { StopState, Trace } from "../schema/index.ts";
import type { IntakeClaim, IntakeResult } from "./intake.ts";

// T51: whole-answer mode. Intake finds every statistic in a pasted answer (code checks each one is in the text), then
// each accepted statistic gets its own trace, up to MAX_CLAIMS per answer, and code writes the summary from the stop
// states. The model never writes the summary and never says whether a statistic is true.

// At most this many traces per pasted answer. Each trace has its own caps (rules.json), so one answer costs at most
// MAX_CLAIMS times one trace's caps.
export const MAX_CLAIMS = 5;

const ERROR_CODES = new Set(["not_configured", "http_error", "network_error", "bad_response", "budget_exceeded"]);
type NotTraced = NonNullable<AnswerClaim["notTraced"]>;

// The summary phrase for each stop state, in the order the summary lists them. None says a statistic is true or false:
// the engine finds sources, it does not grade claims.
const PHRASES: [StopState, (n: number) => string][] = [
  ["ORIGIN_FOUND", (n) => `${n} traced to an earliest primary source`],
  ["CONFLICTING", (n) => `${n} ${n === 1 ? "has" : "have"} earliest pages that disagree`],
  ["TRAIL_GOES_COLD", (n) => `${n} went cold`],
  ["NO_PAGES_FOUND", (n) => `${n} turned up no page stating ${n === 1 ? "it" : "them"}`],
  ["PARTIAL", (n) => `${n} stopped at a cap`],
  ["TOOL_FAILED", (n) => `${n} stopped when a tool failed`],
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// "5 statistics: 2 traced to an earliest primary source, 2 went cold and 1 stopped at a cap." then, when they apply,
// what was not traced and what intake set aside. Built only from the claims' stop states and counts.
export function answerSummary(claims: readonly AnswerClaim[], rejected: readonly { reason: string }[]): string {
  if (!claims.length && !rejected.length) return "No statistics found in the answer.";
  const states = new Map<StopState, number>();
  for (const c of claims) if (c.trace) states.set(c.trace.decision.state, (states.get(c.trace.decision.state) ?? 0) + 1);
  const parts = PHRASES.filter(([s]) => states.has(s)).map(([s, phrase]) => phrase(states.get(s)!));
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
  const sentences = [claims.length ? `${plural(claims.length, "statistic")}${parts.length ? `: ${list(parts)}` : ""}.` : "No statistics passed the checks."];
  const capped = claims.filter((c) => c.notTraced === "over_claim_cap").length;
  const failed = claims.filter((c) => c.notTraced && c.notTraced !== "over_claim_cap").length;
  const notTraced = [capped && `${capped} over the ${MAX_CLAIMS}-statistic limit`, failed && `${failed} could not run`].filter(Boolean) as string[];
  if (notTraced.length) sentences.push(`Not traced: ${list(notTraced)}.`);
  // Worded by intake's reason: a repeat is not a sentence code failed to match.
  const repeats = rejected.filter((r) => r.reason === "duplicate").length;
  const noNumber = rejected.filter((r) => r.reason === "no_number").length;
  const unmatched = rejected.length - repeats - noNumber;
  const aside = [
    noNumber && `${plural(noNumber, "sentence")} with no number to check`,
    unmatched && `${plural(unmatched, "sentence")} whose number code could not match to the text`,
    repeats && `${plural(repeats, "repeat")} of a statistic already listed`,
  ].filter(Boolean) as string[];
  if (aside.length) sentences.push(`Set aside by code: ${list(aside)}.`);
  return sentences.join(" ");
}

export type TraceClaim = (claim: IntakeClaim) => Promise<Trace>;

// Runs the whole answer. A trace that fails with a known error code is recorded with that code and the rest go on;
// "not_configured" (no key) stops every remaining trace, since none could run. Anything else is thrown.
export async function traceAnswer(answer: string, deps: {
  intake: (answer: string) => Promise<IntakeResult>; traceClaim: TraceClaim; now: () => string; maxClaims?: number;
}): Promise<AnswerRecord> {
  const max = deps.maxClaims ?? MAX_CLAIMS;
  const found = await deps.intake(answer);
  const claims: AnswerClaim[] = [];
  let stopAll: NotTraced | null = null;
  for (const [i, claim] of found.claims.entries()) {
    const base = { text: claim.text, start: claim.start, end: claim.end, number: claim.number };
    if (i >= max) { claims.push({ ...base, trace: null, notTraced: "over_claim_cap" }); continue; }
    if (stopAll) { claims.push({ ...base, trace: null, notTraced: stopAll }); continue; }
    try {
      claims.push({ ...base, trace: await deps.traceClaim(claim), notTraced: null });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" && ERROR_CODES.has(error.code)
        ? (error.code as NotTraced) : null;
      if (!code) throw error;
      if (code === "not_configured") stopAll = code;
      claims.push({ ...base, trace: null, notTraced: code });
    }
  }
  const rejected = found.rejected.map((r) => ({ sentence: r.sentence, number: r.number, reason: r.reason }));
  return AnswerRecord.parse({
    schemaVersion: "1", recordedAt: deps.now(), answer, claims, rejected, intakeUsage: found.usage,
    summary: answerSummary(claims, rejected),
  });
}

// A recorded answer, re-checked: every trace parses and the summary is exactly what code builds from it now.
export function replayAnswer(value: unknown, replay: (trace: unknown) => Trace): AnswerRecord {
  const record = AnswerRecord.parse(value);
  const claims = record.claims.map((c) => ({ ...c, trace: c.trace ? replay(c.trace) : null }));
  const summary = answerSummary(claims, record.rejected);
  if (summary !== record.summary) throw new Error("Answer summary does not match its traces");
  return { ...record, claims };
}
