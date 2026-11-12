// Lists every sentence on a dev claim's fetched pages that carries the claim's number written out in words
// ("eight spiders", "ten thousand steps") and is not already in eval/weak-atoms/labels.json, so each can be labelled
// by hand. E2 dev claims only. Writes eval/same-claim/candidates.json.
// Run from the repo root after eval/weak-atoms/fetch.py: node --import tsx eval/same-claim/candidates.ts
import { readFileSync, writeFileSync } from "node:fs";
import { normalise, parseNumbers, sameNumber } from "../../packages/pz/src/rules/index.ts";
import { parseNumberWords } from "../../packages/pz/src/rules/number-words.ts";

const atoms: Record<string, { number: string }> = {
  ...JSON.parse(readFileSync("eval/weak-atoms/atoms.json", "utf8")),
  ...JSON.parse(readFileSync("eval/same-claim/atoms.json", "utf8")),
};
const labelled = new Set((JSON.parse(readFileSync("eval/weak-atoms/labels.json", "utf8")) as { claim: string; sentence: string }[]).map((l) => `${l.claim}|${l.sentence}`));
const index: Record<string, { url: string; key: string }[]> = JSON.parse(readFileSync(".cache/weak-atoms/index.json", "utf8"));

// The same sentence split as eval/weak-atoms/candidates.ts (importing it would rerun that script).
const sentences = (text: string) =>
  text.split(/\n+/).flatMap((block) => normalise(block).split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)).map((s) => s.trim()).filter((s) => s.length > 0);

const out: { id: string; claim: string; url: string; sentence: string }[] = [];
for (const [claim, a] of Object.entries(atoms)) {
  const target = parseNumbers(a.number).numbers[0]!;
  const seen = new Set<string>();
  for (const page of index[claim] ?? []) {
    const text = readFileSync(`.cache/weak-atoms/${page.key}.txt`, "utf8");
    for (const s of sentences(text)) {
      if (s.length > 400 || seen.has(s) || labelled.has(`${claim}|${s}`)) continue;
      if (!parseNumberWords(s).some((n) => sameNumber(n, target).equal)) continue;
      seen.add(s);
      out.push({ id: `${claim}-w${String(out.filter((o) => o.claim === claim).length + 1).padStart(2, "0")}`, claim, url: page.url, sentence: s });
    }
  }
}
writeFileSync("eval/same-claim/candidates.json", JSON.stringify(out, null, 2) + "\n");
console.log(Object.entries(Object.groupBy(out, (o) => o.claim)).map(([k, v]) => `${k}: ${v!.length}`).join(", "), `total ${out.length}`);
