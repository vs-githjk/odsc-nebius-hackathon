import { describe, expect, it } from "vitest";
import type { Atoms } from "../src/schema/index.ts";
import { atomHit, canonicalKey, isWeak, parseNumbers, sameNumber } from "../src/rules/index.ts";

const one = (text: string) => {
  const { numbers } = parseNumbers(text);
  expect(numbers).toHaveLength(1);
  return numbers[0]!;
};

const atoms = (raw: string, subjectLemma: string): Atoms => ({
  number: { raw, canonical: raw }, unit: null, subjectLemma, population: null, time: null,
  hedge: null, namedSource: null, variants: [],
});

describe("parseNumbers: whole-number boundaries", () => {
  it("[C2] never finds 35 inside 1935, 0.35 or 3,500", () => {
    for (const text of ["in 1935", "only 0.35", "about 3,500 penguins"]) {
      const keys = parseNumbers(text).numbers.map(canonicalKey);
      expect(keys).not.toContain("35");
    }
    expect(canonicalKey(one("about 3,500 penguins"))).toBe("3500");
  });
  it("[C2] finds no number glued to letters", () => {
    expect(parseNumbers("Zoo2 and B12 keepers").numbers).toEqual([]);
  });
});

describe("parseNumbers: refuse to guess", () => {
  it("[C2] skips ranges with a named reason", () => {
    expect(parseNumbers("naps 12-15 times").skipped).toEqual([{ raw: "12-15", reason: "range" }]);
    expect(parseNumbers("naps 12 to 15 times").skipped).toEqual([{ raw: "12 to 15", reason: "range" }]);
  });
  it("[C2] skips inequalities", () => {
    const r = parseNumbers("p <0.001");
    expect(r.numbers).toEqual([]);
    expect(r.skipped).toEqual([{ raw: "<0.001", reason: "inequality" }]);
  });
  it("[C2] skips decimal commas", () => {
    expect(parseNumbers("weighs 3,5 kg").skipped).toEqual([{ raw: "3,5", reason: "decimal_comma" }]);
  });
  it("[C2] skips two numbers in one cell", () => {
    expect(parseNumbers("14/7").skipped).toEqual([{ raw: "14/7", reason: "two_numbers" }]);
  });
});

describe("canonicalKey and sameNumber", () => {
  it("[C2] gives .412 and 0.412 one key", () => {
    expect(canonicalKey(one(".412"))).toBe("0.412");
    expect(sameNumber(one(".412"), one("0.412"))).toEqual({ equal: true, via: "exact" });
  });
  it("[C2] equates 0.412 and 41.2% only through the percent transform", () => {
    expect(canonicalKey(one("0.412"))).not.toBe(canonicalKey(one("41.2%")));
    expect(sameNumber(one("0.412"), one("41.2%"))).toEqual({ equal: true, via: "percent" });
    expect(sameNumber(one("41.2"), one("41.2%"))).toEqual({ equal: false, via: null });
  });
  it("[C2] treats 8.25 vs 8 as rounded and 8 vs 9 as different", () => {
    expect(sameNumber(one("8.25"), one("8"))).toEqual({ equal: true, via: "rounded" });
    expect(sameNumber(one("8"), one("9"))).toEqual({ equal: false, via: null });
  });
});

describe("isWeak and atomHit", () => {
  it("[C2] counts significant digits", () => {
    expect(isWeak(one("8"))).toBe(true);
    expect(isWeak(one("3,500"))).toBe(true);
    expect(isWeak(one("41.2%"))).toBe(false);
    expect(isWeak(one("0.412"))).toBe(false);
  });
  it("[C2] a weak number hits only with the subject lemma in the same sentence", () => {
    const a = atoms("8", "penguin");
    expect(atomHit("Harbor Zoo penguins nap for 8 seconds.", a)).toBe(true);
    expect(atomHit("Seals nap for 8 seconds.", a)).toBe(false);
  });
  it("[C2] 8 seconds never matches 9 seconds", () => {
    expect(atomHit("Harbor Zoo penguins nap for 9 seconds.", atoms("8", "penguin"))).toBe(false);
  });
  it("[C2] a strong number hits without the subject lemma", () => {
    expect(atomHit("The keepers logged 41.2% of naps.", atoms("41.2%", "penguin"))).toBe(true);
  });
});
