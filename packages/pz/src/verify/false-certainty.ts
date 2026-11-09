import { decideStopState, loadRules, normalise, parseNumbers, sameNumber, type Rules } from "../rules/index.ts";
import type { Trace } from "../schema/index.ts";

export type FalseCertainty = { originOnCold: number; typedWithoutInferred: number; sentenceStrongerThanSpans: number; undatedShownDated: number };

const TYPED = new Set(["scope_widened", "attribution_shifted", "context_stripped"]);

// Words that start many sentences, so a capital first letter there does not make them a name.
const OPENERS = new Set(["the", "a", "an", "this", "that", "these", "those", "it", "its", "in", "on", "at", "by", "from", "for", "of",
  "according", "our", "we", "they", "he", "she", "one", "each", "every", "some", "most", "many", "there", "when", "while", "after",
  "before", "as", "if", "earliest", "no", "only", "since", "until", "what", "where", "who", "both", "two", "all"]);
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DATE = new RegExp(String.raw`\b(\d{4})-(\d{2})-(\d{2})\b|\b(${MONTHS.join("|")})\s+(?:(\d{1,2}),?\s+)?(\d{4})\b|\b(\d{1,2})\s+(${MONTHS.join("|")})\s+(\d{4})\b`, "gi");

// Dates in a sentence, as "YYYY-MM-DD" or "YYYY-MM" when the day is not given.
export function datesIn(sentence: string): { raw: string; value: string }[] {
  const pad = (n: string) => n.padStart(2, "0");
  const month = (name: string) => pad(String(MONTHS.indexOf(name.toLowerCase()) + 1));
  return [...normalise(sentence).matchAll(DATE)].map((m) => ({
    raw: m[0],
    value: m[1] ? `${m[1]}-${m[2]}-${m[3]}` : m[4] ? `${m[6]}-${month(m[4])}${m[5] ? `-${pad(m[5])}` : ""}` : `${m[9]}-${month(m[8]!)}-${pad(m[7]!)}`,
  }));
}

// Things the card sentence says that nothing backs: numbers, quoted text and capitalised names not in the spans,
// and dates that are not the date of an earliest page (a month and year must match one).
export function unbacked(sentence: string, spans: string[], earliestDates: string[] = []): { numbers: string[]; quotes: string[]; names: string[]; dates: string[] } {
  const text = spans.map((s) => normalise(s)).join("\n");
  const dates = datesIn(sentence).filter((d) => !earliestDates.some((e) => e.startsWith(d.value))).map((d) => d.raw);
  const withoutDates = datesIn(sentence).reduce((s, d) => s.replace(d.raw, " "), normalise(sentence));
  const spanNumbers = parseNumbers(text).numbers;
  const numbers = parseNumbers(withoutDates).numbers.filter((n) => !spanNumbers.some((m) => sameNumber(n, m).equal)).map((n) => n.raw);
  const quotes = [...normalise(sentence).matchAll(/"([^"]+)"/g)].filter((m) => !text.includes(m[1]!)).map((m) => m[1]!);
  const words = withoutDates.split(" ").map((w) => w.replace(/[^\p{L}']/gu, ""));
  // The first word is a name unless it is a common opener or the spans use it in any case ("Penguins" from "penguins").
  const lowerText = text.toLowerCase();
  const first = (w: string) => OPENERS.has(w.toLowerCase()) || lowerText.includes(w.toLowerCase().replace(/s$/, ""));
  const names = words.filter((w, i) => /^\p{Lu}/u.test(w) && !text.includes(w) && !(i === 0 && first(w)) && !MONTHS.includes(w.toLowerCase()));
  return { numbers, quotes, names, dates };
}

export const earliestDates = (trace: Trace) =>
  trace.nodes.filter((n) => trace.earliest.nodeIds.includes(n.id)).map((n) => n.date.value).filter((d): d is string => d !== null);

// Each counter must be 0. The trace has no card sentence until T28, so it is passed in when there is one.
export function falseCertainty(trace: Trace, opts: { cardSentence?: string; rules?: Rules } = {}): FalseCertainty {
  const recomputed = decideStopState(trace, opts.rules ?? loadRules());
  return {
    originOnCold: trace.decision.state === "ORIGIN_FOUND" && recomputed.state !== "ORIGIN_FOUND" ? 1 : 0,
    typedWithoutInferred: trace.hops.flatMap((h) => h.readouts).filter((r) => TYPED.has(r.id) && r.source !== "inferred").length,
    sentenceStrongerThanSpans: opts.cardSentence ? Object.values(unbacked(opts.cardSentence, trace.spans.map((s) => s.text), earliestDates(trace))).flat().length : 0,
    undatedShownDated: trace.nodes.filter((n) => n.date.kind === "unconfirmed" && n.date.value !== null).length,
  };
}
