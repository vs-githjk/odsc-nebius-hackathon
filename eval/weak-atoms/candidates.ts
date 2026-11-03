// Lists every sentence on a dev claim's fetched pages that carries the claim's number (any match tier),
// so each can be labelled by hand: does the sentence state the claim? Writes eval/weak-atoms/candidates.json.
// Run from the repo root after fetch.py: node --import tsx eval/weak-atoms/candidates.ts
import { readFileSync, writeFileSync } from "node:fs";
import { normalise, parseNumbers, sameNumber } from "../../packages/pz/src/rules/index.ts";

const atoms: Record<string, { number: string }> = JSON.parse(readFileSync("eval/weak-atoms/atoms.json", "utf8"));
const index: Record<string, { url: string; key: string }[]> = JSON.parse(readFileSync(".cache/weak-atoms/index.json", "utf8"));

export function sentences(text: string): string[] {
  return text.split(/\n+/).flatMap((block) => normalise(block).split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)).map((s) => s.trim()).filter((s) => s.length > 0);
}

const out: { id: string; claim: string; url: string; sentence: string }[] = [];
for (const [claim, a] of Object.entries(atoms)) {
  const target = parseNumbers(a.number).numbers[0]!;
  const seen = new Set<string>();
  for (const page of index[claim] ?? []) {
    const text = readFileSync(`.cache/weak-atoms/${page.key}.txt`, "utf8");
    for (const s of sentences(text)) {
      if (s.length > 400 || seen.has(s)) continue;
      if (!parseNumbers(s).numbers.some((n) => sameNumber(n, target).equal)) continue;
      seen.add(s);
      out.push({ id: `${claim}-${String(out.filter((o) => o.claim === claim).length + 1).padStart(2, "0")}`, claim, url: page.url, sentence: s });
    }
  }
}
writeFileSync("eval/weak-atoms/candidates.json", JSON.stringify(out, null, 2) + "\n");
console.log(Object.entries(Object.groupBy(out, (o) => o.claim)).map(([k, v]) => `${k}: ${v!.length}`).join(", "), `total ${out.length}`);
