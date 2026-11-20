// The recorded answer check (S7, fixtures/answers/s7-answer.json): an AI-style answer pasted into `pz trace --answer`,
// with each statistic it found and how that trace ended. The full recording is 300 KB of traces, so the landing page
// carries only these few fields; answerCheck.test.ts pins them to the recording.
export type CheckedClaim = { start: number; end: number; ending: string };

export const S7 = {
  answer:
    "Plastic pollution is one of the biggest threats to marine life. By 2050 there will be more plastic than fish in the ocean, according to widely cited projections. Corporate emissions are concentrated too: just 100 companies are responsible for 71% of global emissions.",
  claims: [
    { start: 64, end: 161, ending: "The trail goes cold" },
    { start: 162, end: 267, ending: "The trail goes cold (traced twice: it holds two numbers)" },
  ] satisfies CheckedClaim[],
  summary: "3 statistics: 3 went cold.",
  recordedAt: "2026-11-19",
};

export type Piece = { text: string; claim: CheckedClaim | null };

// The answer cut into plain text and the checked statistics, in order.
export function answerPieces(answer: string, claims: CheckedClaim[]): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  for (const c of [...claims].sort((a, b) => a.start - b.start)) {
    if (c.start > at) out.push({ text: answer.slice(at, c.start), claim: null });
    out.push({ text: answer.slice(c.start, c.end), claim: c });
    at = c.end;
  }
  if (at < answer.length) out.push({ text: answer.slice(at), claim: null });
  return out;
}

// The plastic statistic is the same claim as the recorded dev-10 trace, which now ends Origin found, while this run of it
// stops cold. Both are true: this run also read the WEF report (same sentence), but its same-claim model answered "no"
// (0.73), so the report was not accepted (fixtures/answers/s7-answer.json, claim 0, node n6). One line says so where both
// endings are on screen (#259, 08:00 judge pass).
export const PLASTIC_CLAIM_START = 64;
export const DEV10_HREF = "#/t/dev-10";
export function sameClaimNote(where: "landing" | "page"): string {
  const lead = where === "landing" ? "Same claim as the trace above, a different run" : "Same claim as the recorded plastic trace, a different run";
  return `${lead}: this one also read the WEF report, but its model judged the report's sentence not to state the same claim, so it stops cold. Each run is judged on its own evidence.`;
}
