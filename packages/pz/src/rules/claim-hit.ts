import type { Atoms } from "../schema/index.ts";
import { normalise } from "./normalise.ts";
import { atomHit } from "./numbers.ts";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const lower = (s: string) => normalise(s).toLowerCase().replace(/[‘’]/g, "'");

// T53: a claim with no single number is matched by its phrase, normalised and verbatim, as whole words, with no
// negation word earlier in the sentence ("Einstein did not say ..." does not state the quote; the prefixes are rules.json negationPrefixes).
export function phraseHit(sentence: string, phrase: string, negationPrefixes: string[]): boolean {
  const text = lower(sentence);
  const m = new RegExp(String.raw`(?<![\p{L}\p{N}])${escape(lower(phrase))}(?![\p{L}\p{N}])`, "u").exec(text);
  if (!m) return false;
  const before = text.slice(0, m.index);
  return !negationPrefixes.some((p) => new RegExp(String.raw`(?<![\p{L}\p{N}])${escape(p.toLowerCase())}(?![\p{L}\p{N}])`, "u").test(before));
}

// Does this sentence carry the claim? The number rules when the claim has a number (unchanged from T36), else its
// phrase. Every place that judges a sentence (the walk, same_claim's code layer, decide row 5) goes through here.
export function claimHit(sentence: string, atoms: Atoms, rules: { weakNumberMinSigDigits: number; weakNumberMaxCommas: number; negationPrefixes: string[] }): boolean {
  if (atoms.number) return atomHit(sentence, atoms, rules.weakNumberMinSigDigits, rules.weakNumberMaxCommas);
  // A phrase claim's variants are only declared forms of its own phrase (a range written "40-45%").
  const hit = [atoms.phrase ?? "", ...atoms.variants].some((p) => !!p && phraseHit(sentence, p, rules.negationPrefixes));
  // A range ("40 to 45 percent") is common on its own, so it also needs the claim's subject word in the sentence;
  // "Turnout rose 40 to 45 percent" is not about body heat. A quote is distinctive enough without one.
  return hit && (!isRange(atoms) || lower(sentence).includes(atoms.subjectLemma.toLowerCase()));
}

// A phrase claim whose phrase carries digits is a range read by code (T53 claimRange).
export const isRange = (atoms: Atoms) => !atoms.number && /\d/.test(atoms.phrase ?? "");
