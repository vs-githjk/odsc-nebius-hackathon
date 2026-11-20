import { Trace } from "pz/schema";

// The recorded answer check (fixtures/answers/s7-answer.json) read for the #/answer page: each statistic found in the
// answer, where it sits, and its recorded trace. The three traces share one id in the recording, so the page addresses
// them by their place in the answer (#/answer/1, /2, /3), not by id. The data itself is not changed, except that a
// recorded trace shows as a REPLAY, the same as every other recording in the app (data/loadTraces.ts).
export type AnswerStat = { n: number; start: number; end: number; number: string; sentence: string; trace: Trace };
export type AnswerCheck = { answer: string; summary: string; recordedAt: string; stats: AnswerStat[] };

type RawClaim = { text: string; start: number; end: number; number?: { raw?: string } | null; trace?: unknown };
type RawAnswer = { answer: string; summary: string; recordedAt: string; claims: RawClaim[] };

export function readAnswerCheck(json: unknown): AnswerCheck {
  const raw = json as RawAnswer;
  const stats: AnswerStat[] = [];
  raw.claims.forEach((c) => {
    const parsed = Trace.safeParse(c.trace);
    if (!parsed.success) return;
    const trace = parsed.data.synthetic ? parsed.data : { ...parsed.data, mode: "REPLAY" as const };
    stats.push({ n: stats.length + 1, start: c.start, end: c.end, number: c.number?.raw ?? "", sentence: c.text, trace });
  });
  return { answer: raw.answer.trim(), summary: raw.summary, recordedAt: raw.recordedAt, stats };
}

// The answer cut into pieces: plain text, the sentence each statistic sits in, and inside it each statistic's own
// number, which links to its trace.
export type Part = { text: string; n: number | null };
export type Segment = { kind: "text"; text: string } | { kind: "sentence"; parts: Part[] };

export function answerSegments(answer: string, stats: AnswerStat[]): Segment[] {
  const spans = [...new Map(stats.map((s) => [`${s.start}-${s.end}`, { start: s.start, end: s.end }])).values()].sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let at = 0;
  for (const span of spans) {
    if (span.start > at) out.push({ kind: "text", text: answer.slice(at, span.start) });
    const text = answer.slice(span.start, span.end);
    // Each statistic's number, found in its sentence, in reading order.
    const hits = stats
      .filter((s) => s.start === span.start && s.end === span.end && s.number)
      .map((s) => ({ n: s.n, at: text.indexOf(s.number), len: s.number.length }))
      .filter((h) => h.at >= 0)
      .sort((a, b) => a.at - b.at);
    const parts: Part[] = [];
    let i = 0;
    for (const h of hits) {
      if (h.at < i) continue;
      if (h.at > i) parts.push({ text: text.slice(i, h.at), n: null });
      parts.push({ text: text.slice(h.at, h.at + h.len), n: h.n });
      i = h.at + h.len;
    }
    if (i < text.length) parts.push({ text: text.slice(i), n: null });
    out.push({ kind: "sentence", parts });
    at = span.end;
  }
  if (at < answer.length) out.push({ kind: "text", text: answer.slice(at) });
  return out;
}
