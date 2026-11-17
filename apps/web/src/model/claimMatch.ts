import type { Trace } from "pz/schema";
import { sampleRows } from "./sampleRow.ts";

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/[^\p{L}\p{N}%.']+/u)
    .map((w) => w.replace(/^[.']+|[.']+$/g, ""))
    .filter(Boolean);
const numbers = (ws: string[]) => ws.filter((w) => /\d/.test(w)).sort().join(" ");

// Share of the shorter text's words that the other text also has.
function overlap(a: string[], b: string[]): number {
  const [small, big] = a.length <= b.length ? [a, b] : [b, a];
  const pool = new Set(big);
  return small.length === 0 ? 0 : small.filter((w) => pool.has(w)).length / small.length;
}

// Words a pasted claim must share with a recorded wording, beyond carrying the same numbers.
export const MATCH_SHARE = 0.75;
const MIN_WORDS = 4;

// The recorded trace for a typed or pasted claim: one whose claim, or the wording on one of its pages, has the same
// numbers and most of the same words. Prefers the trace with the most to show. Null when nothing matches, so the
// page says the claim is not traced yet instead of opening the wrong trace.
export function findTrace(text: string, traces: Trace[]): Trace | null {
  const asked = words(text);
  if (asked.length < MIN_WORDS || !asked.some((w) => /\d/.test(w))) return null;
  const match = (wording: string) => {
    const ws = words(wording);
    return numbers(ws) === numbers(asked) && overlap(asked, ws) >= MATCH_SHARE;
  };
  for (const row of sampleRows(traces)) {
    const trace = traces.find((t) => t.id === row.id)!;
    if ([trace.claim.text, trace.viralSentence, ...trace.spans.map((s) => s.text)].some(match)) return trace;
  }
  return null;
}

// Why the box would not look: too short to be a claim, or no number in it.
export function claimProblem(text: string): string | null {
  const ws = words(text);
  if (ws.length === 0) return null;
  if (!ws.some((w) => /\d/.test(w))) return "Patient Zero traces claims with a number in them. Add the number as you saw it.";
  if (ws.length < MIN_WORDS) return "Paste the whole sentence the number came in.";
  return null;
}
