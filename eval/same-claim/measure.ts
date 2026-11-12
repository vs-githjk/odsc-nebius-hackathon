// Scores the code half of the same-claim check (T36) against hand labels on the E2 dev claims only:
// eval/weak-atoms/labels.json (digits, 120 sentences) plus eval/same-claim/labels.json (numbers written in words).
// Run from the repo root: node --import tsx eval/same-claim/measure.ts [--diff]
import { readFileSync } from "node:fs";
import { atomHit, loadRules, normalise, parseNumbers } from "../../packages/pz/src/rules/index.ts";
import { numberToWords } from "../../packages/pz/src/rules/number-words.ts";
import { variantsFor } from "../../packages/pz/src/engine/fingerprint.ts";
import type { Atoms } from "../../packages/pz/src/schema/index.ts";

type Atom = { number: string; subjectLemma: string; unit: string | null };
type Label = { claim: string; sentence: string; statesClaim: boolean };
const atoms: Record<string, Atom> = { ...JSON.parse(readFileSync("eval/weak-atoms/atoms.json", "utf8")), ...JSON.parse(readFileSync("eval/same-claim/atoms.json", "utf8")) };
const claims: Record<string, string> = Object.fromEntries((JSON.parse(readFileSync("eval/dev-claims.json", "utf8")) as { id: string; text: string }[]).map((c) => [c.id, c.text]));
const labels: Label[] = [...JSON.parse(readFileSync("eval/weak-atoms/labels.json", "utf8")), ...JSON.parse(readFileSync("eval/same-claim/labels.json", "utf8"))];

// Candidate rule 1 from the spike post-mortem, measured here and not shipped: the sentence must carry a variant phrase.
const PERCENT_WORDS = ["%", " percent", " per cent"];

// The claim's number joined to its unit, in every declared form: "21 days", "21-day", "twenty-one days", "9%",
// "9 percent", "10,000 steps". Empty when the claim has no unit and no percent sign: the phrase rule then does not apply.
function variantPhrases(atoms: Atoms): string[] {
  const n = parseNumbers(atoms.number.canonical).numbers[0];
  if (!n) return [];
  const unit = atoms.unit ? normalise(atoms.unit).toLowerCase() : null;
  const percent = n.percent || unit === "percent" || unit === "per cent" || unit === "%";
  if (!unit && !percent) return [];
  const value = n.value;
  const numbers = [n.digits, numberToWords(value), Number.isInteger(value) && value >= 1000 ? value.toLocaleString("en-US") : null]
    .filter((x): x is string => !!x);
  const out = new Set<string>();
  if (percent) for (const x of numbers) for (const p of PERCENT_WORDS) out.add(x + p);
  else {
    const units = new Set([unit!, unit!.replace(/s$/, ""), unit!.replace(/es$/, "")].filter((u) => u.length > 1));
    for (const x of numbers) for (const u of units) { out.add(`${x} ${u}`); out.add(`${x}-${u}`); }
  }
  for (const v of atoms.variants) if (parseNumbers(v).numbers.length) out.add(normalise(v).toLowerCase());
  return [...out];
}

// True when the sentence carries one of the claim's variant phrases as whole words, or when the phrase rule does not apply.
function hasVariant(sentence: string, atoms: Atoms): boolean {
  const phrases = variantPhrases(atoms);
  if (!phrases.length) return true;
  const text = normalise(sentence).toLowerCase();
  return phrases.some((p) => {
    for (let at = text.indexOf(p); at >= 0; at = text.indexOf(p, at + 1)) {
      const before = text[at - 1] ?? "", after = text[at + p.length] ?? "";
      if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) return true;
    }
    return false;
  });
}

// Variants come from the fingerprint's own code (variantsFor), as the engine will make them.
const toAtoms = (id: string): Atoms => {
  const a = atoms[id]!;
  const number = { raw: a.number, canonical: a.number };
  return { number, unit: a.unit, subjectLemma: a.subjectLemma, population: null, time: null, hedge: null, namedSource: null,
    variants: variantsFor(claims[id]!, number).map((v) => v.text) };
};
const r = loadRules();
const digits = (l: Label) => atomHit(l.sentence, toAtoms(l.claim), r.weakNumberMinSigDigits, r.weakNumberMaxCommas, false);
const words = (l: Label) => atomHit(l.sentence, toAtoms(l.claim), r.weakNumberMinSigDigits, r.weakNumberMaxCommas, true);
const rules: Record<string, (l: Label) => boolean> = {
  "shipped (digits only)": digits,
  "+ number words": words,
  "+ variant phrase": (l) => digits(l) && hasVariant(l.sentence, toAtoms(l.claim)),
  "+ both": (l) => words(l) && hasVariant(l.sentence, toAtoms(l.claim)),
};

console.log("rule".padEnd(24), "hits  false  missed   (of", labels.filter((l) => l.statesClaim).length, "true,", labels.filter((l) => !l.statesClaim).length, "false)");
for (const [name, rule] of Object.entries(rules)) {
  let hit = 0, falseHit = 0, missed = 0;
  for (const l of labels) { const x = rule(l); if (x && l.statesClaim) hit++; else if (x) falseHit++; else if (l.statesClaim) missed++; }
  console.log(name.padEnd(24), String(hit).padStart(4), String(falseHit).padStart(6), String(missed).padStart(7));
}
if (process.argv.includes("--diff")) {
  const [a, b] = [process.argv[process.argv.indexOf("--diff") + 1]!, process.argv[process.argv.indexOf("--diff") + 2]!];
  for (const l of labels) if (rules[a]!(l) !== rules[b]!(l)) console.log(`${l.statesClaim ? "TRUE " : "FALSE"} ${l.claim} ${a}=${rules[a]!(l)} | ${l.sentence.slice(0, 140)}`);
}
if (process.argv.includes("--false")) for (const l of labels) if (!l.statesClaim && words(l)) console.log(`${l.claim} | ${l.sentence.slice(0, 160)}`);
