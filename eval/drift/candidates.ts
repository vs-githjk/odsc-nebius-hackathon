// T97 (#164): lists every sentence on an E2 dev claim's fetched pages that names the claim's subject and carries a
// number, but not the claim's number. Each is labelled by hand in labels.json: is it the same claim with the number
// changed (a drifted copy), or something else? E2 dev claims only; no spike, E3 or held-out page is opened.
// Run from the repo root after eval/weak-atoms/fetch.py: node --import tsx eval/drift/candidates.ts
// With --set=e3 (after fetch.py --set=e3) it lists the E3 check claims' sentences into eval/drift/e3/candidates.json,
// using the hand-written eval/drift/e3/atoms.json. Those are labelled by hand before any E3 embedding is run.
import { readFileSync, writeFileSync } from "node:fs";
import { normalise, parseNumbers, sameNumber } from "../../packages/pz/src/rules/index.ts";
import { parseNumberWords } from "../../packages/pz/src/rules/number-words.ts";

const E3 = process.argv.includes("--set=e3");
const cache = E3 ? ".cache/weak-atoms-e3" : ".cache/weak-atoms";
const atoms: Record<string, { number: string; subjectLemma: string }> = E3 ? JSON.parse(readFileSync("eval/drift/e3/atoms.json", "utf8")) : {
  ...JSON.parse(readFileSync("eval/weak-atoms/atoms.json", "utf8")),
  ...JSON.parse(readFileSync("eval/same-claim/atoms.json", "utf8")),
};
const index: Record<string, { url: string; key: string }[]> = JSON.parse(readFileSync(`${cache}/index.json`, "utf8"));
// The same sentence split as eval/weak-atoms/candidates.ts.
const sentences = (text: string) =>
  text.split(/\n+/).flatMap((block) => normalise(block).split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)).map((s) => s.trim()).filter((s) => s.length > 0);
const YEAR = /^(?:1[89]|20)\d{2}$/;

const out: { id: string; claim: string; url: string; sentence: string; numbers: string[] }[] = [];
for (const [claim, a] of Object.entries(atoms)) {
  const target = parseNumbers(a.number).numbers[0]!;
  const seen = new Set<string>();
  for (const page of index[claim] ?? []) {
    const text = readFileSync(`${cache}/${page.key}.txt`, "utf8");
    for (const s of sentences(text)) {
      if (s.length > 400 || seen.has(s) || !s.toLowerCase().includes(a.subjectLemma)) continue;
      const nums = [...parseNumbers(s).numbers, ...parseNumberWords(s)].filter((n) => !YEAR.test(n.raw) || claim === "dev-10");
      // Same value, with or without a percent word ("51 percent" is 51%), is the claim's own number, not another one.
      if (!nums.length || nums.some((n) => sameNumber(n, target).equal || n.value === target.value)) continue;
      seen.add(s);
      out.push({ id: `${claim}-d${String(out.filter((o) => o.claim === claim).length + 1).padStart(2, "0")}`, claim, url: page.url, sentence: s, numbers: nums.map((n) => n.raw) });
    }
  }
}
writeFileSync(E3 ? "eval/drift/e3/candidates.json" : "eval/drift/candidates.json", JSON.stringify(out, null, 2) + "\n");
console.log(Object.entries(Object.groupBy(out, (o) => o.claim)).map(([k, v]) => `${k}: ${v!.length}`).join(", "), `total ${out.length}`);
