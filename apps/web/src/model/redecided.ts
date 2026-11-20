import type { Trace } from "pz/schema";

// Explicit provenance from eval/dev-score.md: these live cold endings were re-decided on Nov 20.
// The recordings have no marker. Limit this map to the reviewed recordings (#316), never infer it from state.
export const REDECIDED: Readonly<Record<string, string>> = {
  "dev-09": "Ending re-decided on Nov 20 from this recording by the refined origin rule (#316); the live run ended cold.",
  "dev-10": "Ending re-decided on Nov 20 from this recording by the refined origin rule (#316); the live run ended cold.",
};

export const redecidedNote = (trace: Trace): string | null =>
  trace.mode === "REPLAY" && !trace.synthetic ? REDECIDED[trace.id] ?? null : null;
