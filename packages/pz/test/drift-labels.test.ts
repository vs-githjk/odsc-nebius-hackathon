import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);
const read = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, root), "utf8")) as T;

describe("T97 E2 labels for the other-number cutoff", () => {
  it("label every candidate exactly once, from E2 claims only", () => {
    const candidates = read<{ id: string; sentence: string }[]>("eval/drift/candidates.json");
    const labels = read<{ id: string; claim: string; sentence: string; sameClaimOtherNumber: boolean }[]>("eval/drift/labels.json");
    expect(labels.map((l) => [l.id, l.sentence])).toEqual(candidates.map((c) => [c.id, c.sentence]));
    expect([labels.length, labels.filter((l) => l.sameClaimOtherNumber).length]).toEqual([107, 14]);
    const e2 = new Set(read<{ id: string }[]>("eval/dev-claims.json").map((c) => c.id));
    expect(labels.every((l) => e2.has(l.claim))).toBe(true);
  });
});
