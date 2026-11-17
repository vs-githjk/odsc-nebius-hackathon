// T97 (#164): measures the embedding cutoffs on the E2 dev claims. LIVE: it embeds about 260 short texts with
// Qwen3-Embedding-8B (well under $0.01) and must run where live calls are allowed (Vidyut's machine, through XO).
// Vectors are cached under .cache/embed, so a second run is free.
//
//   node --env-file=.env --import tsx eval/drift/measure.ts
//
// (a) The same claim with another number: on the 107 hand-labelled sentences in labels.json (14 true), precision and
//     recall of code's gate plus similarity >= cutoff, for each cutoff. The cutoff with the best F1 is printed as
//     the candidate for rules.json otherNumberSimilarity; a human sets it.
// (b) Reworded copies: on the 131 labelled sentences in eval/weak-atoms and eval/same-claim, how many same-claim
//     pairs (both statesClaim, same claim) reach clusterSimilarityThreshold, and how many pairs from different
//     claims would wrongly merge.
// Tuned on E2 only.
//
//   node --env-file=.env --import tsx eval/drift/measure.ts --set=e3
//
// The E3 check: precision and recall at the rules.json cutoff only, on eval/drift/e3/labels.json (hand-labelled
// before this runs). It prints no other cutoff and picks nothing, since nothing is tuned on E3.
import { readFileSync } from "node:fs";
import { createTokenFactoryClient } from "../../packages/pz/src/clients/tokenfactory.ts";
import { cosine, createEmbedder, otherNumberCandidate } from "../../packages/pz/src/engine/similar.ts";
import { loadRules } from "../../packages/pz/src/rules/index.ts";
import type { Atoms } from "../../packages/pz/src/schema/index.ts";

if (!process.env.NEBIUS_API_KEY?.trim()) {
  console.error("needs NEBIUS_API_KEY: this is a live measurement (run it on the live machine, through XO)");
  process.exit(2);
}
const rules = loadRules();
const E3 = process.argv.includes("--set=e3");
const claims = Object.fromEntries((JSON.parse(readFileSync(E3 ? "eval/dev-claims-e3.json" : "eval/dev-claims.json", "utf8")) as { id: string; text: string }[]).map((c) => [c.id, c.text]));
const raw: Record<string, { number: string; subjectLemma: string; unit: string | null }> = E3 ? JSON.parse(readFileSync("eval/drift/e3/atoms.json", "utf8")) : {
  ...JSON.parse(readFileSync("eval/weak-atoms/atoms.json", "utf8")), ...JSON.parse(readFileSync("eval/same-claim/atoms.json", "utf8")),
};
const atomsOf = (id: string): Atoms => ({ number: { raw: raw[id]!.number, canonical: raw[id]!.number }, unit: raw[id]!.unit, subjectLemma: raw[id]!.subjectLemma,
  population: null, time: null, hedge: null, namedSource: null, variants: [] });
const embed = createEmbedder(createTokenFactoryClient({ step: "embed-measure" }), { cacheDir: ".cache/embed", traceId: "t97-measure" });

// (a)
type Label = { id: string; claim: string; sentence: string; sameClaimOtherNumber: boolean };
const labels = (JSON.parse(readFileSync(E3 ? "eval/drift/e3/labels.json" : "eval/drift/labels.json", "utf8")) as Label[]).filter((l) => raw[l.claim]);
const texts = [...new Set([...labels.map((l) => claims[l.claim]!), ...labels.map((l) => l.sentence)])];
const vec = await embed(texts);
const v = (t: string) => vec[texts.indexOf(t)]!;
const scored = labels.map((l) => ({ ...l, gate: otherNumberCandidate(l.sentence, atomsOf(l.claim), rules) !== null, sim: cosine(v(claims[l.claim]!), v(l.sentence)) }));
const score = (c: number) => {
  const hit = scored.filter((s) => s.gate && s.sim >= c);
  const tp = hit.filter((s) => s.sameClaimOtherNumber).length, fp = hit.length - tp, fn = scored.filter((s) => s.sameClaimOtherNumber).length - tp;
  return { tp, fp, fn, p: tp + fp ? tp / (tp + fp) : 0, r: tp + fn ? tp / (tp + fn) : 0 };
};
// Precision with no hits, or recall with no true labels, is undefined: printed as n/a, never as 0.00.
const ratio = (n: number, d: number) => (d ? (n / d).toFixed(2) : "n/a");
if (E3) {
  const e = score(rules.otherNumberSimilarity);
  console.log(`E3 check at otherNumberSimilarity ${rules.otherNumberSimilarity} (set on E2, not tuned here): ${labels.length} sentences, ${labels.filter((l) => l.sameClaimOtherNumber).length} true; `
    + `${e.tp} true hits, ${e.fp} false hits, ${e.fn} missed; precision ${ratio(e.tp, e.tp + e.fp)}, recall ${ratio(e.tp, e.tp + e.fn)}`);
  console.log(`embedding requests made: ${embed.calls()}`);
  process.exit(0);
}
console.log(`(a) same claim, another number: ${labels.length} E2 sentences, ${labels.filter((l) => l.sameClaimOtherNumber).length} true; ${scored.filter((s) => s.gate).length} pass code's gate`);
console.log("cutoff  true hits  false hits  missed  precision  recall");
let best = { cutoff: 0, f1: -1 };
for (let c = 0.5; c <= 0.951; c += 0.05) {
  const hit = scored.filter((s) => s.gate && s.sim >= c);
  const tp = hit.filter((s) => s.sameClaimOtherNumber).length, fp = hit.length - tp, fn = scored.filter((s) => s.sameClaimOtherNumber).length - tp;
  const p = tp + fp ? tp / (tp + fp) : 0, r = tp + fn ? tp / (tp + fn) : 0, f1 = p + r ? (2 * p * r) / (p + r) : 0;
  if (f1 > best.f1) best = { cutoff: Math.round(c * 100) / 100, f1 };
  console.log(`${c.toFixed(2).padEnd(8)}${String(tp).padEnd(11)}${String(fp).padEnd(12)}${String(fn).padEnd(8)}${ratio(tp, tp + fp).padEnd(11)}${ratio(tp, tp + fn)}`);
}
console.log(`best F1 on E2 at ${best.cutoff} (rules.json has ${rules.otherNumberSimilarity}); a human sets the rule`);

// (b)
type Sent = { claim: string; sentence: string; statesClaim: boolean };
const sents = [...JSON.parse(readFileSync("eval/weak-atoms/labels.json", "utf8")), ...JSON.parse(readFileSync("eval/same-claim/labels.json", "utf8"))] as Sent[];
const sv = await embed(sents.map((s) => s.sentence));
let same = 0, sameMerged = 0, cross = 0, crossMerged = 0;
sents.forEach((a, i) => sents.slice(i + 1).forEach((b, j) => {
  if (!a.statesClaim || !b.statesClaim) return;
  const merged = cosine(sv[i]!, sv[i + 1 + j]!) >= rules.clusterSimilarityThreshold;
  if (a.claim === b.claim) { same++; if (merged) sameMerged++; } else { cross++; if (merged) crossMerged++; }
}));
console.log(`(b) reworded copies at clusterSimilarityThreshold ${rules.clusterSimilarityThreshold}: ${sameMerged} of ${same} same-claim pairs merge; ${crossMerged} of ${cross} different-claim pairs would wrongly merge`);
console.log(`embedding requests made: ${embed.calls()}`);
