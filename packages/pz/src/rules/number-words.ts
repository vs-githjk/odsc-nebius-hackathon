import { normalise } from "./normalise.ts";
import type { ParsedNumber } from "./numbers.ts";

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES: [number, string][] = [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];
const SMALL = new Map<string, number>([...ONES.map((w, i) => [w, i] as [string, number]), ...TENS.map((w, i) => [w, i * 10] as [string, number]).filter(([w]) => w)]);
const BIG = new Map<string, number>([["hundred", 100], ...SCALES.map(([v, w]) => [w, v] as [string, number])]);

// Whole numbers below a trillion in words: 21 is "twenty-one", 10000 is "ten thousand".
export function numberToWords(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n >= 1e12) return null;
  const under1000 = (x: number): string => {
    const parts: string[] = [];
    if (x >= 100) { parts.push(`${ONES[Math.floor(x / 100)]} hundred`); x %= 100; }
    if (x >= 20) parts.push(TENS[Math.floor(x / 10)]! + (x % 10 ? `-${ONES[x % 10]}` : ""));
    else if (x > 0 || !parts.length) parts.push(ONES[x]!);
    return parts.join(" ");
  };
  if (n < 1000) return under1000(n);
  const parts: string[] = [];
  for (const [size, name] of SCALES) if (n >= size) { parts.push(`${under1000(Math.floor(n / size))} ${name}`); n %= size; }
  if (n) parts.push(under1000(n));
  return parts.join(" ");
}

// Every run of number words in a text ("eight", "twenty-one", "ten thousand"), with its value and its offsets in the
// normalised text. A run never starts with a scale word ("hundred", "million"), so "a hundred" and "millions" are not read.
export function parseNumberWords(text: string): ParsedNumber[] {
  const t = normalise(text);
  const tokens = [...t.toLowerCase().matchAll(/(?<![\p{L}\p{N}])[a-z]+(?:-[a-z]+)?(?![\p{L}\p{N}])/gu)];
  const out: ParsedNumber[] = [];
  for (let i = 0; i < tokens.length;) {
    let total = 0, current = 0, j = i;
    for (; j < tokens.length; j++) {
      // A run is broken by anything but spaces between its words ("eight, ten" is two numbers).
      if (j > i && !/^\s+$/.test(t.slice(tokens[j - 1]!.index + tokens[j - 1]![0].length, tokens[j]!.index))) break;
      const word = tokens[j]![0];
      const parts = word.split("-");
      if (parts.every((p) => SMALL.has(p))) current += parts.reduce((s, p) => s + SMALL.get(p)!, 0);
      else if (BIG.has(word) && j > i) {
        const scale = BIG.get(word)!;
        if (scale === 100) current *= 100; else { total += current * scale; current = 0; }
      } else break;
    }
    if (j === i) { i++; continue; }
    const first = tokens[i]!, last = tokens[j - 1]!;
    const start = first.index, end = last.index + last[0].length;
    const value = total + current;
    out.push({ raw: t.slice(start, end), digits: String(value), value, decimals: 0, percent: false, start, end });
    i = j;
  }
  return out;
}

// The first run of number words in a text, with its value.
export function wordsToNumber(text: string): { raw: string; value: number } | null {
  const first = parseNumberWords(text)[0];
  return first ? { raw: first.raw, value: first.value } : null;
}
