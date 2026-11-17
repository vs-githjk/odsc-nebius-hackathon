import { describe, expect, it } from "vitest";
import { loadTraces } from "../data/loadTraces.ts";
import { lintText } from "../../../../packages/pz/src/cli/lint-copy.ts";
import { claimProblem, findTrace } from "./claimMatch.ts";

const { traces } = loadTraces();
const CLAIM = "Harbor Zoo penguins nap 14 times a day, twice as often as the zoo's seals";

describe("findTrace", () => {
  it("opens the recorded trace for its own claim, whatever the case, quotes or punctuation", () => {
    expect(findTrace(CLAIM, traces)?.id).toBe("sample-rich");
    expect(findTrace("  “harbor zoo PENGUINS nap 14 times a day twice as often as the zoo’s seals!!” ", traces)?.id).toBe("sample-rich");
    expect(findTrace("Harbor Zoo penguins nap fourteen times a day, twice as often as the zoo's seals.", traces)?.id).toBe("sample-rich");
    expect(findTrace("Penguins at Harbor Zoo nap 14 times a day, twice as often as the zoo's seals", traces)?.id).toBe("sample-rich");
    // Hedges and attribution verbs fold: they do not change the claim.
    expect(findTrace("Harbor Zoo penguins nap nearly 14 times a day, twice as often as the zoo's seals", traces)?.id).toBe("sample-rich");
    expect(findTrace("Harbor Zoo penguins nap around 14 times a day, twice as often as the zoo's seals", traces)?.id).toBe("sample-rich");
  });

  it("matches the wording a page used, not only the claim as asked", () => {
    expect(findTrace("Penguins nap 14 times a day, twice as often as seals, says a marine study.", traces)).not.toBeNull();
  });

  // XO's probes on #184: each of these opened sample-rich before.
  it.each([
    ["another verb", "Zoo penguins eat 14 times a day"],
    ["one changed verb in the full sentence", "Harbor Zoo penguins eat 14 times a day, twice as often as the zoo's seals"],
    ["another unit", "Harbor Zoo penguins nap 14 times a week, twice as often as the zoo's seals"],
    ["another multiplier", "Harbor Zoo penguins nap 14 times a day, three times as often as the zoo's seals"],
    ["half, not twice", "Harbor Zoo penguins nap 14 times a day, half as often as the zoo's seals"],
    ["a negation", "Harbor Zoo penguins do not nap 14 times a day, twice as often as the zoo's seals"],
    ["subject and object swapped", "Harbor Zoo seals nap 14 times a day, twice as often as the zoo's penguins"],
    ["another number", "Harbor Zoo penguins nap 41 times a day, twice as often as the zoo's seals"],
    ["a near number", "Harbor Zoo penguins nap 15 times a day, twice as often as the zoo's seals"],
    ["a percent", "Harbor Zoo penguins nap 14 percent of the day, twice as often as the zoo's seals"],
    ["another claim", "The average human attention span is 8 seconds, shorter than a goldfish's 9 seconds."],
    // XO's one-word probes on #184 (6ab1fff): each changed word is a different claim.
    ["another animal at the end", "Harbor Zoo penguins nap 14 times a day, twice as often as the zoo's lions"],
    ["more than", "Harbor Zoo penguins nap more than 14 times a day, twice as often as the zoo's seals"],
    ["less than", "Harbor Zoo penguins nap less than 14 times a day, twice as often as the zoo's seals"],
    ["fewer than", "Harbor Zoo penguins nap fewer than 14 times a day, twice as often as the zoo's seals"],
    ["rarely, not often", "Harbor Zoo penguins nap 14 times a day, twice as rarely as the zoo's seals"],
    ["a stance word", "Harbor Zoo penguins rarely nap 14 times a day, twice as often as the zoo's seals"],
    ["a denial", "Harbor Zoo penguins nap 14 times a day, twice as often as the zoo's seals, the zoo denied."],
    ["a denied study", "Penguins nap 14 times a day, twice as often as seals, denies a marine study."],
    ["another animal in the page wording", "Penguins nap 14 times a day, twice as often as walruses, says a marine study."],
    ["a fragment", "penguins 14"],
    ["nothing", ""],
  ])("never opens a trace for %s", (_, text) => {
    expect(findTrace(text, traces)).toBeNull();
  });
});

describe("claimProblem", () => {
  it("asks for a number, then for the whole sentence, in plain words", () => {
    expect(claimProblem("")).toBeNull();
    expect(claimProblem("penguins nap a lot")).toMatch(/number/);
    expect(claimProblem("14 naps")).toMatch(/whole sentence/);
    expect(claimProblem("Penguins nap 14 times a day")).toBeNull();
    expect(claimProblem("Penguins nap fourteen times a day")).toBeNull();
    for (const s of ["penguins nap a lot", "14 naps"]) expect(lintText(claimProblem(s)!)).toEqual([]);
  });
});
