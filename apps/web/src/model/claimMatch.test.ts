import { describe, expect, it } from "vitest";
import { loadTraces } from "../data/loadTraces.ts";
import { lintText } from "../../../../packages/pz/src/cli/lint-copy.ts";
import { claimProblem, findTrace } from "./claimMatch.ts";

const { traces } = loadTraces();

describe("findTrace", () => {
  it("opens the recorded trace for its own claim, whatever the case, quotes or punctuation", () => {
    expect(findTrace("Harbor Zoo penguins nap 14 times a day, twice as often as the zoo's seals", traces)?.id).toBe("sample-rich");
    expect(findTrace("  “harbor zoo PENGUINS nap 14 times a day twice as often as the zoo’s seals!!” ", traces)?.id).toBe("sample-rich");
  });

  it("matches the wording a page used, not only the claim as asked", () => {
    expect(findTrace("Penguins nap 14 times a day, twice as often as seals, says a marine study.", traces)).not.toBeNull();
  });

  it("never opens a trace for a different number or a different claim", () => {
    expect(findTrace("Harbor Zoo penguins nap 41 times a day, twice as often as the zoo's seals", traces)?.id).not.toBe("sample-rich");
    expect(findTrace("Harbor Zoo penguins nap 15 times a day, twice as often as the zoo's seals", traces)).toBeNull();
    expect(findTrace("The average human attention span is 8 seconds, shorter than a goldfish's 9 seconds.", traces)).toBeNull();
    expect(findTrace("", traces)).toBeNull();
    expect(findTrace("penguins 14", traces)).toBeNull();
  });
});

describe("claimProblem", () => {
  it("asks for a number, then for the whole sentence, in plain words", () => {
    expect(claimProblem("")).toBeNull();
    expect(claimProblem("penguins nap a lot")).toMatch(/number/);
    expect(claimProblem("14 naps")).toMatch(/whole sentence/);
    expect(claimProblem("Penguins nap 14 times a day")).toBeNull();
    for (const s of ["penguins nap a lot", "14 naps"]) expect(lintText(claimProblem(s)!)).toEqual([]);
  });
});
