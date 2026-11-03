import { describe, expect, it } from "vitest";
import { normalise, protectedTokens } from "../src/rules/index.ts";

describe("normalise", () => {
  it("[C2] turns curly quotes into straight quotes", () => {
    expect(normalise("\u201Cnaps\u201D and \u2018naps\u2019")).toBe("\"naps\" and 'naps'");
  });
  it("[C2] removes soft hyphens", () => {
    expect(normalise("pen\u00ADguins")).toBe("penguins");
  });
  it("[C2] turns non-breaking spaces into spaces and collapses whitespace", () => {
    expect(normalise("  14\u00A0times \n a\u202Fday ")).toBe("14 times a day");
  });
  it("[C2] turns look-alike dashes, including U+2212, into a hyphen", () => {
    expect(normalise("\u22125 and 3\u20134 and a\u2014b and x\u2010y")).toBe("-5 and 3-4 and a-b and x-y");
  });
  it("[C2] applies NFKC", () => {
    expect(normalise("\uFF11\uFF14 naps")).toBe("14 naps");
  });
});

describe("protectedTokens", () => {
  it("[C2] keeps negations and numbers", () => {
    expect(protectedTokens("is not 9")).toEqual(["not", "9"]);
  });
  it("[C2] finds no number inside a word and keeps percent signs", () => {
    expect(protectedTokens("Zoo2 says no, never 41.2%")).toEqual(["no", "never", "41.2%"]);
  });
});
