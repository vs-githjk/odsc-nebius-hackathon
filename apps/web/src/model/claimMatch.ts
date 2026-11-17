import type { Trace } from "pz/schema";
import { sampleRows } from "./sampleRow.ts";

// Words that carry no claim of their own. Negations, multipliers, number words and units are never here: they are
// what make two claims different.
const STOP = new Set(
  "a an the of to in on at by for from with and or but as is are was were be been being it its this that these those than then so says said say according do does did has have had which who whom whose there their they them we our you your he she his her i my me about into over".split(" "),
);
const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18",
  nineteen: "19", twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60", seventy: "70", eighty: "80", ninety: "90",
  hundred: "100", thousand: "1000", million: "1000000", billion: "1000000000", dozen: "12",
};
const MULTIPLIERS = new Set(["once", "twice", "thrice", "double", "doubled", "triple", "tripled", "quadruple", "half", "halved", "third", "quarter"]);
const NEGATIONS = new Set(["not", "no", "never", "none", "nor", "without", "cannot", "dont", "doesnt", "didnt", "isnt", "arent", "wasnt", "werent", "wont"]);
const UNITS: Record<string, string> = {
  second: "second", seconds: "second", minute: "minute", minutes: "minute", hour: "hour", hours: "hour", hourly: "hour",
  day: "day", days: "day", daily: "day", week: "week", weeks: "week", weekly: "week", month: "month", months: "month",
  monthly: "month", year: "year", years: "year", yearly: "year", annually: "year", decade: "decade", decades: "decade",
  percent: "%", "%": "%", per: "per", cent: "cent",
};

type Parsed = { content: string[]; numbers: string; multipliers: string; negations: string; units: string };

function parse(text: string): Parsed {
  const tokens = text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/(\d)\s*%/g, "$1 %")
    .replace(/n't\b/g, "nt")
    .split(/[^\p{L}\p{N}%.']+/u)
    .map((w) => w.replace(/^[.']+|[.']+$/g, "").replace(/'s$/, ""))
    .filter(Boolean)
    .map((w) => NUMBER_WORDS[w] ?? w.replace(/,/g, ""));
  const content = tokens.filter((w) => !STOP.has(w));
  const pick = (keep: (w: string) => boolean, as: (w: string) => string = (w) => w) => content.filter(keep).map(as).sort().join(" ");
  return {
    content,
    numbers: pick((w) => /\d/.test(w)),
    multipliers: pick((w) => MULTIPLIERS.has(w)),
    negations: pick((w) => NEGATIONS.has(w), () => "not"),
    units: pick((w) => w in UNITS && UNITS[w] !== "per" && UNITS[w] !== "cent", (w) => UNITS[w]!),
  };
}

const share = (from: string[], into: string[]) => {
  const pool = new Set(into);
  return from.length === 0 ? 0 : from.filter((w) => pool.has(w)).length / from.length;
};
const twoWay = (a: string[], b: string[]) => Math.min(share(a, b), share(b, a));
// The words before the claim's first number (its subject and verb) and the words after it.
const sides = (ws: string[]) => {
  const at = ws.findIndex((w) => /\d/.test(w));
  return [ws.slice(0, at), ws.slice(at + 1)] as const;
};

// Two-way: each text's content words must be found in the other. The words before the first number and the words
// after it are also checked apart, which keeps who does what ("seals nap ... than penguins" is not "penguins nap ...
// than seals") while allowing "Penguins at Harbor Zoo nap". Numbers, multipliers, negations and units match exactly.
export const WORD_SHARE = 0.9;
export const SIDE_SHARE = 0.8;
const MIN_WORDS = 4;

export function sameClaimText(a: Parsed, b: Parsed): boolean {
  if (a.numbers !== b.numbers || a.multipliers !== b.multipliers || a.negations !== b.negations || a.units !== b.units) return false;
  if (twoWay(a.content, b.content) < WORD_SHARE) return false;
  const [[headA, tailA], [headB, tailB]] = [sides(a.content), sides(b.content)];
  const sideOk = (x: string[], y: string[]) => (x.length === 0 && y.length === 0) || twoWay(x, y) >= SIDE_SHARE;
  return sideOk(headA, headB) && sideOk(tailA, tailB);
}

// The recorded trace for a typed or pasted claim: one whose claim, or the wording on one of its pages, states the same
// thing (see sameClaimText). Prefers the trace with the most to show. Null when nothing matches, so the page says the
// claim is not traced yet instead of opening the wrong trace.
export function findTrace(text: string, traces: Trace[]): Trace | null {
  const asked = parse(text);
  if (asked.content.length < MIN_WORDS || asked.numbers === "") return null;
  for (const row of sampleRows(traces)) {
    const trace = traces.find((t) => t.id === row.id)!;
    if ([trace.claim.text, trace.viralSentence, ...trace.spans.map((s) => s.text)].some((w) => sameClaimText(asked, parse(w)))) return trace;
  }
  return null;
}

// Why the box would not look: no number in it, or too short to be a claim.
export function claimProblem(text: string): string | null {
  const parsed = parse(text);
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  if (parsed.numbers === "") return "Patient Zero traces claims with a number in them. Add the number as you saw it.";
  if (words.length < MIN_WORDS) return "Paste the whole sentence the number came in.";
  return null;
}
