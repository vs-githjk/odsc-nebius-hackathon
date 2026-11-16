import { decideStopState, loadRules, normalise, parseNumbers, sameNumber, type Rules } from "../rules/index.ts";
import { parseNumberWords } from "../rules/number-words.ts";
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

// Abbreviated titles only: "the zoo's president said" is not a name.
const TITLES = new Set(["dr", "mr", "mrs", "ms", "prof"]);

// Words that say a page is where a claim started. The card may use them only when the trace ends ORIGIN_FOUND.
export const ORIGIN_WORDS = ["origin", "origins", "originated", "originates", "originally", "started", "starts", "began", "begins", "begun",
  "came from", "comes from", "come from", "first said", "first published", "first appeared", "first appears", "first posted", "first reported",
  "first stated", "first mentioned", "first surfaced", "first emerged", "first seen", "first made", "first put", "first page to say",
  "first to say", "source of the claim", "traces back to", "traced back to", "trace back to", "dates back to", "dated back to", "goes back to",
  "can be traced", "birthplace", "patient zero"];

// Patterns, not a list, for the open-ended ways of saying it: "first" + a past-tense verb ("first shared", "first tweeted",
// "first circulated", "first went", "first written"), "appeared first", "original" / "originally" / "originator",
// and "coined". "first" + a noun ("the first page", "first 100 results") is not matched.
const W = String.raw`(?<![\p{L}\p{N}])`, E = String.raw`(?![\p{L}\p{N}])`;
const ORIGIN_PATTERNS = [
  new RegExp(String.raw`${W}first\s+(?:[a-z]+(?:ed|en)|went|came|made|said|put|sent|told|wrote|spread|ran|shown|seen)${E}`, "gu"),
  new RegExp(String.raw`${W}appear(?:ed|s)?\s+first${E}`, "gu"),
  new RegExp(String.raw`${W}original(?:ly|s|ator|ators)?${E}`, "gu"),
  new RegExp(String.raw`${W}coin(?:ed|s|ing)?${E}(?!\s+(?:toss|flip))`, "gu"),
];

// The origin words a sentence uses when the stop state is not ORIGIN_FOUND. Empty on an ORIGIN_FOUND trace.
export function originWords(sentence: string, state: Trace["decision"]["state"]): string[] {
  if (state === "ORIGIN_FOUND") return [];
  const text = normalise(sentence).toLowerCase();
  const listed = ORIGIN_WORDS.filter((w) => new RegExp(String.raw`(?<![\p{L}\p{N}])${w}(?![\p{L}\p{N}])`, "u").test(text));
  const patterned = ORIGIN_PATTERNS.flatMap((p) => [...text.matchAll(p)].map((m) => m[0]));
  return [...new Set([...listed, ...patterned])];
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
// `earliestCount` lets the sentence count the earliest pages in words ("Two earliest pages disagree").
export function unbacked(sentence: string, spans: string[], earliestDates: string[] = [], earliestCount = 0): { numbers: string[]; quotes: string[]; names: string[]; dates: string[] } {
  const text = spans.map((s) => normalise(s)).join("\n");
  const dates = datesIn(sentence).filter((d) => !earliestDates.some((e) => e.startsWith(d.value))).map((d) => d.raw);
  const withoutDates = datesIn(sentence).reduce((s, d) => s.replace(d.raw, " "), normalise(sentence));
  const spanNumbers = parseNumbers(text).numbers;
  const spanValues = new Set([...spanNumbers.map((n) => n.value), ...parseNumberWords(text).map((n) => n.value)]);
  const numbers = [
    ...parseNumbers(withoutDates).numbers.filter((n) => !spanNumbers.some((m) => sameNumber(n, m).equal) && !spanValues.has(n.value)),
    // Number words count too: "fifteen times a day" is not backed by spans that say 14.
    ...parseNumberWords(withoutDates).filter((n) => !spanValues.has(n.value) && n.value !== earliestCount),
  ].map((n) => n.raw);
  // Double or single quotes. A single quote opens and closes only next to a non-letter, so "zoo's" is not a quote.
  const quoted = [...normalise(sentence).matchAll(/"([^"]+)"|(?<![\p{L}\p{N}])'([^']+?)'(?![\p{L}\p{N}])/gu)].map((m) => (m[1] ?? m[2])!);
  const quotes = quoted.filter((q) => !text.includes(q));
  const words = withoutDates.split(" ").map((w) => w.replace(/[^\p{L}']/gu, ""));
  // The first word is a name unless it is a common opener or the spans use it as a whole word in any case
  // ("Penguins" from "penguins" or "penguin"). Every capitalised word must be a whole word in the spans: "Tim" is not
  // backed by "times", nor "Ann" by "annual", wherever it sits in the sentence.
  const spanWords = new Set(text.toLowerCase().split(/[^\p{L}']+/u).filter(Boolean));
  const first = (w: string) => {
    const low = w.toLowerCase();
    return OPENERS.has(low) || spanWords.has(low) || spanWords.has(low.replace(/s$/, "")) || spanWords.has(`${low}s`);
  };
  const names = words.filter((w, i) => /^\p{Lu}/u.test(w) && !spanWords.has(w.toLowerCase()) && !(i === 0 && first(w)) && !MONTHS.includes(w.toLowerCase()));
  // A name written in lower case still follows a title ("according to dr okafor").
  words.forEach((w, i) => {
    const next = words[i + 1];
    if (next && TITLES.has(w.toLowerCase().replace(/\.$/, "")) && !/^\p{Lu}/u.test(next) && !spanWords.has(next.toLowerCase())) names.push(next);
  });
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
      ? Object.values(unbacked(opts.cardSentence, trace.spans.map((s) => s.text), earliestDates(trace), trace.earliest.nodeIds.length)).flat().length
        + originWords(opts.cardSentence, trace.decision.state).length
      : 0,
    undatedShownDated: trace.nodes.filter((n) => n.date.kind === "unconfirmed" && n.date.value !== null).length,
  };
}
