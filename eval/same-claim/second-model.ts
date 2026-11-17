// T79 (#138): does a second model family on same_claim lower false hits on E2 without losing true ones? LIVE: it
// asks Qwen and the second model about every labelled E2 sentence that passes code's check (about 95 sentences, two
// short calls each, well under $1), so it runs where live calls are allowed (Vidyut's machine, through XO). Answers
// are cached under .cache/second-model, so a second run is free.
//
//   node --env-file=.env --import tsx eval/same-claim/second-model.ts [deepseek-ai/DeepSeek-V4-Pro-0813]
//
// It prints, on the same sentences: true hits, false hits and misses for Qwen alone and for Qwen plus the second
// model, and how often the second model could not answer. rules.json secondSameClaimModel is switched on only if
// false hits drop and true hits do not. E2 only; E3 is checked once this is on, never tuned on.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTokenFactoryClient, TokenFactoryError } from "../../packages/pz/src/clients/tokenfactory.ts";
import { claimHit, loadRules } from "../../packages/pz/src/rules/index.ts";
import type { Atoms, TypedAnswer } from "../../packages/pz/src/schema/index.ts";
import { askSameClaim } from "../../packages/pz/src/typed/ask.ts";

if (!process.env.NEBIUS_API_KEY?.trim()) {
  console.error("needs NEBIUS_API_KEY: this is a live measurement (run it on the live machine, through XO)");
  process.exit(2);
}
const SECOND = process.argv[2] ?? "deepseek-ai/DeepSeek-V4-Pro-0813";
const FIRST = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const rules = loadRules();
type Label = { claim: string; sentence: string; statesClaim: boolean };
const raw: Record<string, { number: string; subjectLemma: string; unit: string | null }> = {
  ...JSON.parse(readFileSync("eval/weak-atoms/atoms.json", "utf8")), ...JSON.parse(readFileSync("eval/same-claim/atoms.json", "utf8")),
};
const claims = Object.fromEntries((JSON.parse(readFileSync("eval/dev-claims.json", "utf8")) as { id: string; text: string }[]).map((c) => [c.id, c.text]));
const atomsOf = (id: string): Atoms => ({ number: { raw: raw[id]!.number, canonical: raw[id]!.number }, unit: raw[id]!.unit, subjectLemma: raw[id]!.subjectLemma,
  population: null, time: null, hedge: null, namedSource: null, variants: [] });
const labels = ([...JSON.parse(readFileSync("eval/weak-atoms/labels.json", "utf8")), ...JSON.parse(readFileSync("eval/same-claim/labels.json", "utf8"))] as Label[])
  .filter((l) => raw[l.claim] && claimHit(l.sentence, atomsOf(l.claim), rules));

const client = createTokenFactoryClient({ step: "second-model-measure", traceId: "t79-measure" });
const cacheDir = ".cache/second-model";
mkdirSync(cacheDir, { recursive: true });
async function answer(model: string, claim: string, sentence: string): Promise<TypedAnswer | "error"> {
  const file = join(cacheDir, `${createHash("sha256").update(`${model}\u0000${claim}\u0000${sentence}`).digest("hex")}.json`);
  try { return JSON.parse(readFileSync(file, "utf8")) as TypedAnswer | "error"; } catch { /* not cached */ }
  let a: TypedAnswer | "error";
  try { a = await askSameClaim({ claim, sentence }, { client, threshold: rules.confidenceThreshold, model }); }
  catch (e) { if (!(e instanceof TokenFactoryError)) throw e; a = "error"; }
  writeFileSync(file, JSON.stringify(a));
  return a;
}

const rows: { label: Label; first: TypedAnswer | "error"; second: TypedAnswer | "error" }[] = [];
for (const label of labels) {
  const claim = claims[label.claim]!;
  rows.push({ label, first: await answer(FIRST, claim, label.sentence), second: await answer(SECOND, claim, label.sentence) });
}
const yes = (a: TypedAnswer | "error") => a !== "error" && a.optionId === "yes" && a.probability !== null;
const plain = (a: TypedAnswer | "error") => a !== "error" && a.optionId === "yes";
const score = (hit: (r: (typeof rows)[number]) => boolean) => {
  const tp = rows.filter((r) => hit(r) && r.label.statesClaim).length, fp = rows.filter((r) => hit(r) && !r.label.statesClaim).length;
  return { tp, fp, fn: rows.filter((r) => r.label.statesClaim).length - tp };
};
const alone = score((r) => yes(r.first)), both = score((r) => yes(r.first) && plain(r.second));
console.log(`${rows.length} E2 sentences pass code's check (${rows.filter((r) => r.label.statesClaim).length} true, ${rows.filter((r) => !r.label.statesClaim).length} false)`);
const row = (name: string, r: typeof alone) => `${name.padEnd(36)}${String(r.tp).padEnd(11)}${String(r.fp).padEnd(12)}${r.fn}`;
console.log(`${"rule".padEnd(36)}true hits  false hits  missed`);
console.log(row("Qwen alone", alone));
console.log(row(`Qwen + ${SECOND.split("/").at(-1)}`, both));
console.log(`second model could not answer: ${rows.filter((r) => r.second === "error").length}; answered without logprobs: ${rows.filter((r) => r.second !== "error" && r.second.probability === null).length}`);
console.log(both.fp < alone.fp && both.tp === alone.tp ? "Ship it: fewer false hits, no true hit lost." : "Do not ship: it does not lower false hits without losing true ones.");
