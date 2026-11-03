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

// XO review batch 1 on #4: each input reproduced a bug in e7c7df8.
describe("review fixes", () => {
  const keys = (text: string) => parseNumbers(text).numbers.map(canonicalKey);
  const reasons = (text: string) => parseNumbers(text).skipped.map((s) => s.reason);

  it("[C2] keeps a decimal glued to a unit whole", () => {
    expect(keys("Penguins swam 1.5km")).toEqual(["1.5"]);
    expect(keys("a $1.5bn deal")).toEqual(["1.5"]);
    expect(keys("3,500km away")).toEqual(["3500"]);
    expect(keys("14.2km")).toEqual(["14.2"]);
    expect(keys("8.25mg")).toEqual(["8.25"]);
    expect(parseNumbers("12-15km")).toEqual({ numbers: [], skipped: [{ raw: "12-15", reason: "range" }] });
    expect(atomHit("Penguins swam 1.5km.", atoms("1", "penguin"))).toBe(false);
  });

  it("[C2] skips inequalities that follow a letter or bracket", () => {
    for (const text of ["p<0.001", "(p<0.05)", "p<=0.05", "n>100"]) {
      expect(parseNumbers(text).numbers).toEqual([]);
      expect(reasons(text)).toEqual(["inequality"]);
    }
  });

  it("[C2] needs the subject lemma when the sentence's number is weak, even if the claim's is not", () => {
    expect(atomHit("Route 8 closed today.", atoms("8.25", "penguin"))).toBe(false);
    expect(atomHit("Penguins napped 8 times.", atoms("8.25", "penguin"))).toBe(true);
  });

  it("[C2] treats a leading 0, as a decimal comma", () => {
    expect(parseNumbers("0,412")).toEqual({ numbers: [], skipped: [{ raw: "0,412", reason: "decimal_comma" }] });
  });

  it("[C2] keeps minus signs and skips joined tokens and chains", () => {
    expect(keys("fell -5%")).toEqual(["-5%"]);
    expect(keys("fell \u22125%")).toEqual(["-5%"]);
    for (const text of ["COVID-19", "an F-35 jet", "on 2012-03-04"]) {
      expect(parseNumbers(text).numbers).toEqual([]);
      expect(reasons(text)).toEqual(["joined"]);
    }
    expect(parseNumbers("on 10/12/2020")).toEqual({ numbers: [], skipped: [{ raw: "10/12/2020", reason: "two_numbers" }] });
  });

  it("[C2] skips superscripts and vulgar fractions before NFKC can merge them", () => {
    for (const text of ["3\u00BD hours", "10\u00B2 km", "14\u00B9"]) {
      expect(parseNumbers(text).numbers).toEqual([]);
      expect(reasons(text)).toEqual(["special_digit"]);
    }
  });

  it("[C2] rounds the decimal string half up", () => {
    expect(sameNumber(one("8.35"), one("8.4"))).toEqual({ equal: true, via: "rounded" });
    expect(sameNumber(one("8.34"), one("8.4"))).toEqual({ equal: false, via: null });
  });

  it("[C2] reads two numbers in one cell with spaces and skips the whole chain", () => {
    expect(parseNumbers("14 / 7")).toEqual({ numbers: [], skipped: [{ raw: "14 / 7", reason: "two_numbers" }] });
    expect(parseNumbers("14/7/3")).toEqual({ numbers: [], skipped: [{ raw: "14/7/3", reason: "two_numbers" }] });
    expect(keys("12 (34%)")).toEqual(["12", "34%"]);
    expect(keys("5.2 \u00B1 1.1")).toEqual(["5.2", "1.1"]);
    expect(keys("3:1")).toEqual(["3", "1"]);
  });

  it("[C2] takes the weak-number threshold from the caller", () => {
    expect(atomHit("Seals nap 14 times a day.", atoms("14", "penguin"))).toBe(false);
    expect(atomHit("Seals nap 14 times a day.", atoms("14", "penguin"), 2)).toBe(true);
  });
});
