import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadRules } from "../src/rules/index.ts";

// T97 follow-up: otherNumberSimilarity is set from the E2 measure, and the E3 check has hand-written atoms that come
// from the claim texts alone (no E3 page was opened to write them).
const root = new URL("../../../", import.meta.url);
const read = (p: string) => JSON.parse(readFileSync(new URL(p, root), "utf8"));

describe("T97 other-number cutoff", () => {
  it("is 0.75, the best F1 on the 107 labelled E2 sentences", () => {
    expect(loadRules().otherNumberSimilarity).toBe(0.75);
  });

  it("E3 check atoms name only E3 claims, and each number and subject is in the claim's own text", () => {
    const claims = new Map((read("eval/dev-claims-e3.json") as { id: string; text: string }[]).map((c) => [c.id, c.text]));
    const atoms = read("eval/drift/e3/atoms.json") as Record<string, { number: string; subjectLemma: string }>;
    expect(Object.keys(atoms).length).toBe(22);
    for (const [id, a] of Object.entries(atoms)) {
      const text = claims.get(id);
      expect(text, id).toBeDefined();
      expect(text!.toLowerCase(), id).toContain(a.subjectLemma);
      expect(text!.replace(/ percent/, "%"), id).toContain(a.number.replace(/%$/, ""));
    }
  });
});
