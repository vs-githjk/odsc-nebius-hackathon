import { describe, expect, it } from "vitest";
import { claimNumber, isYear } from "../src/engine/fingerprint.ts";
import { atomHit, loadRules } from "../src/rules/index.ts";
import { unitClassOf } from "../src/rules/numbers.ts";
import type { Atoms } from "../src/schema/index.ts";

const rules = loadRules();
const hit = (s: string, a: Atoms) => atomHit(s, a, rules.weakNumberMinSigDigits, rules.weakNumberMaxCommas);
const atoms = (raw: string, canonical: string, unit: string | null, subjectLemma: string): Atoms =>
  ({ number: { raw, canonical }, unit, subjectLemma, population: null, time: null, hedge: null, namedSource: null, variants: [] }) as Atoms;
// dev-03 as fingerprinted on the first live run (eval/dev-traces/dev-03.json).
const brain = atoms("10", "10", "percent", "human");

describe("#192 F5: units", () => {
  it("dev-03: '10 times more numerous glial cells' no longer states '10 percent of their brains'", () => {
    expect(hit("As to the 10 times more numerous glial cells in the human brain, they are not.", brain)).toBe(false);
  });

  it("a percent claim still matches every way of writing a percent, including the recorded discovermagazine span", () => {
    expect(hit("You've likely heard this wild (and wildly misinformed) idea in one form or another: we humans only use 10 percent of our brain.", brain)).toBe(true);
    expect(hit("Humans use 10% of their brain.", brain)).toBe(true);
    expect(hit("Humans use only ten per cent of their brains.", brain)).toBe(true);
    expect(hit("10 humans were scanned.", brain)).toBe(false);
  });

  it("a claim written with % keeps the declared fraction transform and accepts the word form", () => {
    const plastic = atoms("9%", "9%", null, "plastic");
    expect(hit("Only 9 percent of plastic has been recycled.", plastic)).toBe(true);
    expect(hit("Only 0.09 of all plastic has been recycled.", plastic)).toBe(true);
    expect(hit("Plastic production rose 9 times since 1970.", plastic)).toBe(false);
  });

  it("a claim counted in times never matches a percent; other units are not enforced", () => {
    const phones = atoms("96", "96", "times a day", "phone");
    expect(hit("Americans check their phones 96 times a day.", phones)).toBe(true);
    expect(hit("96% of Americans own phones.", phones)).toBe(false);
    const steps = atoms("10,000", "10000", "a day", "step");
    expect(hit("Walk 10,000 steps per day.", steps)).toBe(true);
  });

  it("reads unit classes from the claim's unit text only for percent and times", () => {
    expect(["percent", "per cent", "%", "times a day", "fold", "a day", "million", null].map(unitClassOf))
      .toEqual(["percent", "percent", "percent", "multiplier", "multiplier", null, null, null]);
  });
});

describe("#192 F5: a year is never the claim's number", () => {
  it("dev-10: 'By 2050' has no number, so it goes to the phrase step", () => {
    expect(claimNumber("By 2050 there will be more plastic than fish in the ocean.")).toBeNull();
  });

  it("a year after a time word is skipped, a four-digit count is kept", () => {
    expect(claimNumber("In 2015, 9% of plastic was recycled.")).toEqual({ raw: "9%", canonical: "9%" });
    expect(claimNumber("Since 1990, ten species vanished.")).toEqual({ raw: "ten", canonical: "10" });
    expect(claimNumber("You need 2000 calories a day.")).toEqual({ raw: "2000", canonical: "2000" });
    const text = "Plastic will triple by 2050.";
    expect(isYear(text, { raw: "2050", start: text.indexOf("2050"), percent: false })).toBe(true);
  });
});
