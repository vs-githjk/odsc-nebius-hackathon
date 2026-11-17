import type { Trace } from "pz/schema";
import { claimProblem, findTrace } from "./claimMatch.ts";

// What the claim box shows under the field. `try` counts submits: it keys the answer, so a repeated answer is a new
// node and screen readers announce it again (XO on #184).
export type Outcome = { kind: "idle" } | { kind: "problem"; text: string; try: number } | { kind: "untraced"; claim: string; try: number };
export type Submitted = { kind: "empty" } | { kind: "open"; id: string } | Exclude<Outcome, { kind: "idle" }>;

// One submit of the claim box: nothing typed, a plain prompt, a recorded trace to open, or "not traced yet".
export function outcomeOf(text: string, traces: Trace[], previousTries: number): Submitted {
  const claim = text.trim();
  if (!claim) return { kind: "empty" };
  const problem = claimProblem(claim);
  if (problem) return { kind: "problem", text: problem, try: previousTries + 1 };
  const trace = findTrace(claim, traces);
  return trace ? { kind: "open", id: trace.id } : { kind: "untraced", claim, try: previousTries + 1 };
}

// Enter submits; Shift+Enter adds a line; Enter while an input method is composing picks a character.
export const submitsOnKey = (e: { key: string; shiftKey: boolean; isComposing: boolean }) => e.key === "Enter" && !e.shiftKey && !e.isComposing;

// A plain left click is ours; any modifier or another button is left to the browser (a new tab or window).
export const isPlainClick = (e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; button: number }) =>
  !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0;

const recordedOn = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

// The note on a trace opened from the claim box: a sample is never called recorded (XO on #184).
export function matchedNote(trace: Trace): string {
  return trace.synthetic || trace.mode === "SAMPLE"
    ? "Matched a sample trace: example data, not a recorded run."
    : `Matched a recorded trace, recorded ${recordedOn.format(new Date(trace.recordedAt))}.`;
}
