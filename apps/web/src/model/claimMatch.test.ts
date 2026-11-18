import { describe, expect, it } from "vitest";
import { loadTraces } from "../data/loadTraces.ts";
import { lintText } from "../../../../packages/pz/src/cli/lint-copy.ts";
import { claimProblem, findTrace, sameClaimWords } from "./claimMatch.ts";
import { outcomeOf } from "./claimBox.ts";

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
  it("asks for the whole sentence when a text is too short to be a claim; a claim with no number is a phrase claim", () => {
    expect(claimProblem("")).toBeNull();
    expect(claimProblem("14 naps")).toMatch(/whole sentence/);
    expect(claimProblem("Great Wall")).toMatch(/whole sentence/);
    expect(claimProblem("penguins nap a lot")).toBeNull();
    expect(claimProblem("Penguins nap 14 times a day")).toBeNull();
    expect(claimProblem("Penguins nap fourteen times a day")).toBeNull();
    expect(lintText(claimProblem("14 naps")!)).toEqual([]);
  });
});

describe("folding that keeps a recorded claim matchable (XO on #184, c56c2c6)", () => {
  it("thousands commas: '10000 steps' is dev-06's '10,000 steps'", () => {
    expect(sameClaimWords("You need to walk 10000 steps a day to stay healthy.", "You need to walk 10,000 steps a day to stay healthy.")).toBe(true);
    expect(sameClaimWords("You need to walk 10,001 steps a day to stay healthy.", "You need to walk 10,000 steps a day to stay healthy.")).toBe(false);
  });

  it("percent forms: '9 percent', 'nine percent' and '9 per cent' are '9%'", () => {
    const base = "Only 9% of all plastic ever made has been recycled.";
    for (const w of ["Only 9 percent of all plastic ever made has been recycled.", "Only nine percent of all plastic ever made has been recycled.", "Only 9 per cent of all plastic ever made has been recycled."])
      expect(sameClaimWords(w, base)).toBe(true);
    expect(sameClaimWords("Only 19 percent of all plastic ever made has been recycled.", base)).toBe(false);
  });

  it("'per day', 'each day' and 'daily' are 'a day'; a plural is its singular", () => {
    const base = "People check their phones 96 times a day.";
    for (const w of ["People check their phones 96 times per day.", "People check their phones 96 times each day.", "People check their phone 96 times a day."])
      expect(sameClaimWords(w, base)).toBe(true);
    expect(sameClaimWords("People check their phones 96 times a week.", base)).toBe(false);
  });

  it("the one-word probes still never match", () => {
    expect(sameClaimWords("Harbor Zoo penguins nap 14 times a day, twice as often as the zoo's lions", CLAIM)).toBe(false);
    expect(sameClaimWords("Harbor Zoo penguins nap more than 14 times a day, twice as often as the zoo's seals", CLAIM)).toBe(false);
  });
});

describe("the recorded E2 traces (#220)", () => {
  it.runIf(traces.some((t) => t.id === "dev-06"))("'10000 steps' opens dev-06's recorded trace", () => {
    expect(findTrace("You need to walk 10000 steps a day to stay healthy", traces)?.id).toBe("dev-06");
  });
});

describe("XO on #184 (4689534)", () => {
  it("a reversed comparison is a different claim: 'more fish than plastic' never opens dev-10", () => {
    expect(sameClaimWords("By 2050 there will be more fish than plastic in the ocean.", "By 2050 there will be more plastic than fish in the ocean.")).toBe(false);
    expect(sameClaimWords("By 2050 there will be more plastic than fish in the ocean!", "By 2050 there will be more plastic than fish in the ocean.")).toBe(true);
    expect(findTrace("By 2050 there will be more fish than plastic in the ocean.", traces)).toBeNull();
  });

  it("'over' is not folded: 'over 300 million jobs' never opens dev-16's '300 million jobs'", () => {
    expect(sameClaimWords("AI could replace over 300 million jobs.", "AI could replace 300 million jobs.")).toBe(false);
    expect(findTrace("AI could replace over 300 million jobs.", traces)).toBeNull();
  });

  it.runIf(traces.some((t) => t.id === "dev-10"))("the claim as asked still opens dev-10", () => {
    expect(findTrace("By 2050 there will be more plastic than fish in the ocean.", traces)?.id).toBe("dev-10");
  });
});

describe("word order after the first number (XO on #184, follow-up)", () => {
  it("'head heat through your body' is not dev-07's 'body heat through your head'", () => {
    expect(sameClaimWords("You lose 40 to 45 percent of your head heat through your body.", "You lose 40 to 45 percent of your body heat through your head.")).toBe(false);
    expect(findTrace("You lose 40 to 45 percent of your head heat through your body.", traces)).toBeNull();
    expect(sameClaimWords("You lose 40 to 45 percent of your body heat through your head!", "You lose 40 to 45 percent of your body heat through your head.")).toBe(true);
  });
});

// XO on #228 and #2: phrase claims (no digit) open their recorded trace, with the same care against a wrong match.
describe.runIf(["dev-01", "dev-08", "dev-12"].every((id) => traces.some((t) => t.id === id)))("phrase claims with no number", () => {
  it.each([
    ["dev-01", "Insanity is doing the same thing over and over again and expecting different results."],
    ["dev-01", "insanity is doing the same thing over and over again, and expecting different results!"],
    ["dev-01", "Insanity is doing the same thing over and over again"],
    ["dev-08", "The Great Wall of China is the only man-made structure visible from space."],
    ["dev-12", "You eat a credit card's worth of plastic every week."],
    ["dev-12", "You eat a credit card’s worth of plastic a week"],
  ])("opens %s for %s", (id, text) => {
    expect(findTrace(text, traces)?.id).toBe(id);
    expect(outcomeOf(text, traces, 0)).toEqual({ kind: "open", id });
  });

  it.each([
    ["a bare subject", "The Great Wall of China"],
    ["a negation", "The Great Wall of China is not the only man-made structure visible from space."],
    ["another unit", "You eat a credit card's worth of plastic every month."],
    ["another object", "You eat a credit card's worth of plastic every week, and a spoon of sand."],
    ["words shuffled", "Insanity is expecting different results and doing the same thing over and over again."],
    ["one changed word", "Insanity is doing the same thing over and over again and expecting the same results."],
    ["another landmark", "The Great Pyramid of Giza is the only man-made structure visible from space."],
    // XO on #233: a masthead span on a recorded page; a phrase claim is never matched against page spans.
    ["a newspaper headline on a recorded page", "Democracy Dies in Darkness. Some facts for Donald Trump about the Great Wall of China."],
  ])("never opens a trace for %s", (_, text) => {
    expect(findTrace(text, traces)).toBeNull();
  });
});

// Moved from claimBox.test.tsx (XO on #233): one submit of the claim box, short text and an unrecorded phrase claim.
describe("outcomeOf for short and phrase claims", () => {
  it("asks for the whole sentence for a short text, and says not traced yet for an unrecorded phrase claim", () => {
    expect(outcomeOf("14 naps", traces, 0)).toMatchObject({ kind: "problem", try: 1 });
    expect(outcomeOf("penguins nap a lot more than seals", traces, 0)).toMatchObject({ kind: "untraced", try: 1 });
  });
});
