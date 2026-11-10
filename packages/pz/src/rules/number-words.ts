import { normalise } from "./normalise.ts";
import type { ParsedNumber } from "./numbers.ts";

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES: [number, string][] = [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];

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

type Kind = "ones" | "teen" | "tens" | "tens_ones" | "hundred";
// One word's kind and value: "eight", "twelve", "forty", "forty-two" or "hundred". Anything else, "fifty-fifty" among
// them, is not a number word.
function kindOf(word: string): { kind: Kind; value: number } | null {
  if (word === "hundred") return { kind: "hundred", value: 100 };
  const parts = word.split("-");
  if (parts.length === 2) {
    const tens = TENS.indexOf(parts[0]!), ones = ONES.indexOf(parts[1]!);
    return tens >= 2 && ones >= 1 && ones <= 9 ? { kind: "tens_ones", value: tens * 10 + ones } : null;
  }
  const ones = ONES.indexOf(word);
  if (ones >= 0) return { kind: ones < 10 ? "ones" : "teen", value: ones };
  const tens = TENS.indexOf(word);
  return tens >= 2 ? { kind: "tens", value: tens * 10 } : null;
}

// What may follow what inside one group under a thousand: "twenty one", "three hundred", "nine hundred and" is not read.
// "twenty twenty" and "nineteen eighty-four" are two numbers each, never 40 or 103.
const NEXT: Record<Kind | "start", Kind[]> = {
  start: ["ones", "teen", "tens", "tens_ones"],
  ones: ["hundred"], teen: ["hundred"], tens: ["ones"], tens_ones: [],
  hundred: ["ones", "teen", "tens", "tens_ones"],
};

// Every number written in words in a text ("eight", "twenty-one", "ten thousand", "three hundred twenty-one thousand"),
// with its value and its offsets in the normalised text. Words join only in number order, only across spaces, and a
// run never starts with a scale word ("a hundred", "millions"). A lone "one" is never read: "One study found" and
// "no one reads" are not the number 1.
export function parseNumberWords(text: string): ParsedNumber[] {
  const t = normalise(text);
  const tokens = [...t.toLowerCase().matchAll(/(?<![\p{L}\p{N}])[a-z]+(?:-[a-z]+)?(?![\p{L}\p{N}])/gu)];
  const out: ParsedNumber[] = [];
  for (let i = 0; i < tokens.length;) {
    let total = 0, group = 0, last: Kind | "start" = "start", lastScale = Infinity, j = i;
    for (; j < tokens.length; j++) {
      if (j > i && !/^\s+$/.test(t.slice(tokens[j - 1]!.index + tokens[j - 1]![0].length, tokens[j]!.index))) break;
      const word = tokens[j]![0];
      const scale = SCALES.find(([, name]) => name === word)?.[0];
      if (scale !== undefined) {
        if (last === "start" || scale >= lastScale) break;
        total += group * scale; group = 0; last = "start"; lastScale = scale;
        continue;
      }
      const k = kindOf(word);
      if (!k || !NEXT[last].includes(k.kind)) break;
      group = k.kind === "hundred" ? group * 100 : group + k.value;
      last = k.kind;
    }
    // Nothing read, or a lone "one": not a number.
    if (j === i || (j === i + 1 && tokens[i]![0] === "one")) { i++; continue; }
    const first = tokens[i]!, lastToken = tokens[j - 1]!;
    const start = first.index, end = lastToken.index + lastToken[0].length;
    const value = total + group;
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
