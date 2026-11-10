import { decideStopState, loadRules, normalise, parseNumbers, sameNumber, type Rules } from "../rules/index.ts";
import type { Trace } from "../schema/index.ts";

export type FalseCertainty = { originOnCold: number; typedWithoutInferred: number; sentenceStrongerThanSpans: number; undatedShownDated: number };

const TYPED = new Set(["scope_widened", "attribution_shifted", "context_stripped"]);

// Words that start many sentences, so a capital first letter there does not make them a name.
const OPENERS = new Set(["the", "a", "an", "this", "that", "these", "those", "it", "its", "in", "on", "at", "by", "from", "for", "of",
  "according", "our", "we", "they", "he", "she", "one", "each", "every", "some", "most", "many", "there", "when", "while", "after",
  "before", "as", "if", "earliest", "no", "only", "since", "until", "what", "where", "who", "both", "two", "all",
  // Linking words and generic nouns that open sentences ("However, ...", "Researchers found ...").
  "however", "but", "yet", "so", "also", "although", "though", "because", "still", "instead", "meanwhile", "moreover",
  "furthermore", "overall", "here", "today", "now", "then", "later", "earlier", "despite", "during", "under", "over",
  "about", "around", "nearly", "almost", "more", "less", "none", "neither", "either", "another", "other",
  "researchers", "scientists", "experts", "studies", "study", "reports", "report", "data", "people", "users", "authors",
  "officials", "analysts", "surveys", "survey", "estimates", "claims", "posts", "articles", "sources", "pages", "page"]);

// Words that say a page is where a claim started. The card may use them only when the trace ends ORIGIN_FOUND.
export const ORIGIN_WORDS = ["origin", "originated", "originally", "started", "came from", "comes from", "first said", "first published",
  "first page to say", "first to say", "source of the claim"];

// The origin words a sentence uses when the stop state is not ORIGIN_FOUND. Empty on an ORIGIN_FOUND trace.
export function originWords(sentence: string, state: Trace["decision"]["state"]): string[] {
  if (state === "ORIGIN_FOUND") return [];
  const text = normalise(sentence).toLowerCase();
  return ORIGIN_WORDS.filter((w) => new RegExp(String.raw`(?<![\p{L}\p{N}])${w}(?![\p{L}\p{N}])`, "u").test(text));
}
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
  // The first word is a name unless it is a common opener or the spans use it as a whole word in any case
  // ("Penguins" from "penguins" or "penguin"). Whole words only: "Tim" is not backed by "times", nor "Ann" by "annual".
  const spanWords = new Set(text.toLowerCase().split(/[^\p{L}']+/u).filter(Boolean));
  const first = (w: string) => {
    const low = w.toLowerCase();
    return OPENERS.has(low) || spanWords.has(low) || spanWords.has(low.replace(/s$/, "")) || spanWords.has(`${low}s`);
  };
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
    // Unbacked numbers, quotes, names and dates, plus origin words on a trace that did not find the origin.
    sentenceStrongerThanSpans: opts.cardSentence
      ? Object.values(unbacked(opts.cardSentence, trace.spans.map((s) => s.text), earliestDates(trace))).flat().length
        + originWords(opts.cardSentence, trace.decision.state).length
      : 0,
    undatedShownDated: trace.nodes.filter((n) => n.date.kind === "unconfirmed" && n.date.value !== null).length,
  };
}
