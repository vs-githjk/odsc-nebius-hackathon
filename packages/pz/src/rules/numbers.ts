import type { Atoms } from "../schema/index.ts";
import { normalise } from "./normalise.ts";

export type ParsedNumber = { raw: string; value: number; decimals: number; percent: boolean; start: number; end: number };
export type SkipReason = "range" | "inequality" | "decimal_comma" | "two_numbers";
export type SameNumber = { equal: boolean; via: "exact" | "rounded" | "percent" | null };

const NUM = String.raw`(?:\d+(?:,\d+)*(?:\.\d+)?|\.\d+)`;
// Whole numbers only: never starts after a letter, digit, "." or "," and never ends before a letter or digit,
// so 35 is not found inside 1935, 0.35 or 3,500. A second number joined by "-", "to" or "/" is captured
// so the pair can be skipped instead of guessed.
const TOKEN = new RegExp(
  String.raw`(?<![\p{L}\p{N}_.,])([<>\u2264\u2265]\s?)?(${NUM})(%?)(?:(\s?-\s?|\s+to\s+|/)${NUM}%?)?(?![\p{L}\p{N}_])`,
  "gu",
);

export function parseNumbers(text: string): { numbers: ParsedNumber[]; skipped: { raw: string; reason: SkipReason }[] } {
  const numbers: ParsedNumber[] = [];
  const skipped: { raw: string; reason: SkipReason }[] = [];
  for (const m of normalise(text).matchAll(TOKEN)) {
    const [raw, inequality, body = "", percent, joiner] = m;
    if (inequality) skipped.push({ raw, reason: "inequality" });
    else if (joiner) skipped.push({ raw, reason: joiner === "/" ? "two_numbers" : "range" });
    else if (body.split(".")[0]!.split(",").slice(1).some((group) => group.length !== 3)) skipped.push({ raw, reason: "decimal_comma" });
    else {
      const digits = body.replace(/,/g, "");
      numbers.push({
        raw, value: Number(digits), decimals: digits.split(".")[1]?.length ?? 0,
        percent: percent === "%", start: m.index, end: m.index + raw.length,
      });
    }
  }
  return { numbers, skipped };
}

export function canonicalKey(n: ParsedNumber): string {
  return n.value.toFixed(n.decimals) + (n.percent ? "%" : "");
}

// Equal only exactly or through a declared transform: percent (0.412 is 41.2%) or rounding to the coarser displayed precision.
export function sameNumber(a: ParsedNumber, b: ParsedNumber): SameNumber {
  if (canonicalKey(a) === canonicalKey(b)) return { equal: true, via: "exact" };
  if (a.percent !== b.percent) {
    const [p, f] = a.percent ? [a, b] : [b, a];
    return Math.abs(f.value * 100 - p.value) < 1e-9 ? { equal: true, via: "percent" } : { equal: false, via: null };
  }
  const places = Math.min(a.decimals, b.decimals);
  if (a.decimals !== b.decimals && a.value.toFixed(places) === b.value.toFixed(places)) return { equal: true, via: "rounded" };
  return { equal: false, via: null };
}

export function isWeak(n: ParsedNumber, minSigDigits = 3): boolean {
  let digits = n.value.toFixed(n.decimals).replace(".", "").replace(/^0+/, "");
  if (n.decimals === 0) digits = digits.replace(/0+$/, "");
  return digits.length < minSigDigits;
}

// A sentence carries the claim's number; a weak number counts only with the subject lemma in the same sentence.
export function atomHit(sentence: string, atoms: Atoms): boolean {
  const target = parseNumbers(atoms.number.canonical).numbers[0];
  if (!target) return false;
  const text = normalise(sentence);
  if (!parseNumbers(text).numbers.some((n) => sameNumber(n, target).equal)) return false;
  if (!isWeak(target)) return true;
  const lemma = normalise(atoms.subjectLemma).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(String.raw`(?<![\p{L}\p{N}])${lemma}`, "iu").test(text);
}
