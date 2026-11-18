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

describe("#192 F5: multiplier words (XO on #197)", () => {
  it("'tenfold', 'ten-fold', 'two-fold' and 'twice' match a claim counted in times", () => {
    const brainCells = atoms("10", "10", "times", "cell");
    expect(hit("Glial cells outnumber neurons tenfold.", brainCells)).toBe(true);
    expect(hit("Glial cells are ten-fold more common.", brainCells)).toBe(true);
    expect(hit("Glial cells are two-fold more common.", brainCells)).toBe(false);
    const twice = atoms("2", "2", "times", "seal");
    expect(hit("Penguins nap twice as often as the seals do.", twice)).toBe(true);
    expect(hit("The seals grew two-fold.", twice)).toBe(true);
    expect(hit("Penguins nap twice as often as the seals do.", atoms("2", "2", "percent", "seal"))).toBe(false);
  });
});

describe("#192 F5: a year is never the claim's number", () => {
  it("dev-10: a lone year stays the claim's number (the whole-sentence fallback lost the WEF report on Nov 17)", () => {
    expect(claimNumber("By 2050 there will be more plastic than fish in the ocean.")).toEqual({ raw: "2050", canonical: "2050" });
    expect(claimNumber("Plastic will triple by 2050.")).toEqual({ raw: "2050", canonical: "2050" });
    expect(claimNumber("Since 2010 a million jobs were lost.")).toBeNull();
    expect(claimNumber("In 2015 plastic was banned.")).toBeNull();
  });

  it("a bare year is skipped whenever the claim has another number (XO's three cases)", () => {
    expect(claimNumber("The 1990 study found 10% of people agree.")).toEqual({ raw: "10%", canonical: "10%" });
    expect(claimNumber("In 2019 and 2020, 30 percent of firms cut jobs.")).toEqual({ raw: "30", canonical: "30" });
    expect(claimNumber("Between 2000 and 2010, emissions rose 40%.")).toEqual({ raw: "40%", canonical: "40%" });
    expect(claimNumber("The 1990 study found ten species gone.")).toEqual({ raw: "ten", canonical: "10" });
    expect(claimNumber("Between 2000 and 2010 nothing changed.")).toBeNull();
  });

  it("a year after a time word is skipped, a four-digit count is kept", () => {
    expect(claimNumber("In 2015, 9% of plastic was recycled.")).toEqual({ raw: "9%", canonical: "9%" });
    expect(claimNumber("Since 1990, ten species vanished.")).toEqual({ raw: "ten", canonical: "10" });
    expect(claimNumber("You need 2000 calories a day.")).toEqual({ raw: "2000", canonical: "2000" });
    const text = "Plastic will triple by 2050.";
    expect(isYear(text, { raw: "2050", start: text.indexOf("2050"), percent: false })).toBe(true);
  });
});

describe("#192 F5: a two-number claim keeps its other number, as a veto only", () => {
  const dev11 = "Just 100 companies are responsible for 71% of global emissions.";
  const companies = { ...atoms("100", "100", null, "compan"), alsoNumber: { raw: "71%", canonical: "71%" } } as Atoms;

  it("the fingerprint keeps both numbers, and never a year as the second", async () => {
    const { alsoNumber } = await import("../src/engine/fingerprint.ts");
    expect(claimNumber(dev11)).toEqual({ raw: "100", canonical: "100" });
    expect(alsoNumber(dev11, claimNumber(dev11)!)).toEqual({ raw: "71%", canonical: "71%" });
    expect(alsoNumber("In 2015, 9% of plastic was recycled.", { raw: "9%", canonical: "9%" })).toBeNull();
  });

  it("dev-11's gold CDP release ('over 70%') still states the claim; a plain other percent does not", () => {
    expect(hit("Press release Jul 10, 2017•Global New report shows just 100 companies are source of over 70% of emissions.", companies)).toBe(true);
    expect(hit("Just 100 companies are responsible for 71 percent of global emissions.", companies)).toBe(true);
    expect(hit("Just 100 companies are responsible for 30% of global plastic waste.", companies)).toBe(false);
    expect(hit("Nasdaq 100 Companies.", companies)).toBe(true);
  });

  it("the claim's own number never vetoes, even when the page leaves out the second (XO on #199)", () => {
    const seats = { ...atoms("25%", "25%", null, "women"), alsoNumber: { raw: "11%", canonical: "11%" } } as Atoms;
    expect(claimNumber("Women hold 25% of seats, up from 11% in 1995.")).toEqual({ raw: "25%", canonical: "25%" });
    expect(hit("Women now hold 25% of parliamentary seats worldwide.", seats)).toBe(true);
    expect(hit("Women now hold 25% of seats, up from 15%.", seats)).toBe(false);
    const plastic = { ...atoms("9%", "9%", null, "plastic"), alsoNumber: { raw: "12%", canonical: "12%" } } as Atoms;
    expect(hit("Only 9% of plastic waste has ever been recycled.", plastic)).toBe(true);
  });

  it("a claim with one number is unchanged", () => {
    expect(hit("Just 100 companies are responsible for 30% of global plastic waste.", atoms("100", "100", null, "compan"))).toBe(true);
  });
});
