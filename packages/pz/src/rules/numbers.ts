import type { Atoms } from "../schema/index.ts";
import { normalise } from "./normalise.ts";

export type ParsedNumber = {
  raw: string; digits: string; value: number; decimals: number; percent: boolean; start: number; end: number;
};
export type SkipReason = "range" | "inequality" | "decimal_comma" | "two_numbers" | "joined" | "special_digit";
export type SameNumber = { equal: boolean; via: "exact" | "rounded" | "percent" | null };
type Skip = { raw: string; reason: SkipReason };

const NUM = String.raw`(?:\d+(?:,\d+)*(?:\.\d+)?|\.\d+)`;
const JOIN = String.raw`(?:\s?-\s?|\s+to\s+|\s?/\s?)`;
// A number starts after an inequality sign (which may follow a letter, as in "p<0.001") or after anything
// that is not a letter, digit, "." , "," or comparison sign; a minus sign counts only after a space, "(" or the start.
// It ends before anything but a digit or a decimal part, so units may follow ("1.5km") and 35 is never found
// inside 1935, 0.35 or 3,500. Numbers chained by "-", "to" or "/" are captured whole so they can be skipped.
const TOKEN = new RegExp(
  String.raw`(?:([<>\u2264\u2265]=?)\s?|(?<![\p{L}\p{N}_.,<>=\u2264\u2265]))((?<=^|[\s(\[])-)?(${NUM})(%?)((?:${JOIN}-?${NUM}%?)*)(?![\p{N}]|[.,]\d)`,
  "gu",
);
// Superscripts and vulgar fractions, which NFKC would turn into plain digits ("10\u00B2" into "102").
const SPECIAL = /[\d.,]*[\u00B2\u00B3\u00B9\u2070-\u2079\u00BC-\u00BE\u2150-\u215E][\d\u00B2\u00B3\u00B9\u2070-\u2079]*/g;

function chainReason(chain: string): SkipReason {
  const joins = chain.match(new RegExp(JOIN, "g")) ?? [];
  if (joins.some((j) => j.includes("/"))) return "two_numbers";
  return joins.length === 1 ? "range" : "joined";
}

export function parseNumbers(text: string): { numbers: ParsedNumber[]; skipped: Skip[] } {
  const numbers: ParsedNumber[] = [];
  const skipped: Skip[] = [];
  const masked = text.replace(SPECIAL, (raw) => { skipped.push({ raw, reason: "special_digit" }); return " # "; });
  const t = normalise(masked);
  for (const m of t.matchAll(TOKEN)) {
    const [raw, inequality, sign = "", body = "", percent, chain = ""] = m;
    const before = t.slice(0, m.index);
    if (inequality) skipped.push({ raw, reason: "inequality" });
    else if (/[\p{L}\p{N}]-$/u.test(before)) skipped.push({ raw: (before.match(/[\p{L}\p{N}-]*$/u)?.[0] ?? "") + raw, reason: "joined" });
    else if (chain) skipped.push({ raw, reason: chainReason(chain) });
    else if (/^0,/.test(body) || body.split(".")[0]!.split(",").slice(1).some((g) => g.length !== 3)) skipped.push({ raw, reason: "decimal_comma" });
    else {
      let digits = body.replace(/,/g, "");
      if (digits.startsWith(".")) digits = "0" + digits;
      digits = sign + digits;
      numbers.push({
        raw, digits, value: Number(digits), decimals: digits.split(".")[1]?.length ?? 0,
        percent: percent === "%", start: m.index, end: m.index + raw.length,
      });
    }
  }
  return { numbers, skipped };
}

export function canonicalKey(n: ParsedNumber): string {
  return n.digits + (n.percent ? "%" : "");
}

// Rounds a decimal string half up (away from zero) without binary floating point: "8.35" to 1 place is "8.4".
function roundDigits(digits: string, places: number): string {
  const negative = digits.startsWith("-");
  const [int, frac = ""] = digits.replace("-", "").split(".");
  if (frac.length <= places) return digits;
  let kept = BigInt(int! + frac.slice(0, places));
  if (Number(frac[places]) >= 5) kept += 1n;
  const s = kept.toString().padStart(places + 1, "0");
  const out = places ? `${s.slice(0, -places)}.${s.slice(-places)}` : s;
  return negative && /[1-9]/.test(out) ? "-" + out : out;
}

// Equal only exactly or through a declared transform: percent (0.412 is 41.2%) or rounding to the coarser displayed precision.
export function sameNumber(a: ParsedNumber, b: ParsedNumber): SameNumber {
  if (canonicalKey(a) === canonicalKey(b)) return { equal: true, via: "exact" };
  if (a.percent !== b.percent) {
    const [p, f] = a.percent ? [a, b] : [b, a];
    return Math.abs(f.value * 100 - p.value) < 1e-9 ? { equal: true, via: "percent" } : { equal: false, via: null };
  }
  const [coarse, fine] = a.decimals < b.decimals ? [a, b] : [b, a];
  if (coarse.decimals !== fine.decimals && roundDigits(fine.digits, coarse.decimals) === coarse.digits) return { equal: true, via: "rounded" };
  return { equal: false, via: null };
}

export function isWeak(n: ParsedNumber, minSigDigits = 3): boolean {
  let digits = n.digits.replace("-", "").replace(".", "").replace(/^0+/, "");
  if (n.decimals === 0) digits = digits.replace(/0+$/, "");
  return digits.length < minSigDigits;
}

const URL = /\bhttps?:\/\/\S+/g;

// A sentence carries the claim's number. Numbers inside URLs never count. When either the claim's number or the
// sentence's matching number is weak, the subject lemma must sit in the same clause as that number: nothing between
// them may be "|", ":", "(", ")", "[" or "]", and at most maxCommas commas (a list or a tag line is not one clause).
// The clause rule and its comma limit were chosen on the E2 dev claims (eval/weak-atoms), never on spike claims.
export function atomHit(sentence: string, atoms: Atoms, minSigDigits = 3, maxCommas = 2): boolean {
  const target = parseNumbers(atoms.number.canonical).numbers[0];
  if (!target) return false;
  const text = normalise(sentence.replace(URL, " "));
  const hits = parseNumbers(text).numbers.filter((n) => sameNumber(n, target).equal);
  if (hits.length === 0) return false;
  if (hits.some((n) => !isWeak(n, minSigDigits) && !isWeak(target, minSigDigits))) return true;
  const lemma = normalise(atoms.subjectLemma).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const subjects = [...text.matchAll(new RegExp(String.raw`(?<![\p{L}\p{N}])${lemma}`, "giu"))];
  return hits.some((n) => subjects.some((m) => {
    const between = m.index < n.start ? text.slice(m.index + m[0].length, n.start) : text.slice(n.end, m.index);
    return !/[|:()[\]]/.test(between) && (between.match(/,/g) ?? []).length <= maxCommas;
  }));
}
