import { describe, expect, it } from "vitest";
import { displayQuote, previewQuote } from "./quote.ts";

describe("displayQuote", () => {
  it("drops a leading emoji from a social post (dev-10's X quote)", () => {
    expect(displayQuote("⚠️By 2050, oceans will have more plastic than fish, unless we take action.")).toBe("By 2050, oceans will have more plastic than fish, unless we take action.");
  });

  it("drops leading bullets, arrows and spaces", () => {
    expect(displayQuote("• → 96 times a day")).toBe("96 times a day");
  });

  it("keeps an opening quote mark, bracket or currency sign", () => {
    expect(displayQuote("“More plastic than fish”")).toBe("“More plastic than fish”");
    expect(displayQuote("$1 trillion a year")).toBe("$1 trillion a year");
    expect(displayQuote("(2016) more plastic")).toBe("(2016) more plastic");
  });

  it("leaves a sentence with nothing to strip alone, and never returns empty", () => {
    expect(displayQuote("By 2050 there will be more plastic.")).toBe("By 2050 there will be more plastic.");
    expect(displayQuote("⚠️")).toBe("⚠️");
  });
});

describe("previewQuote", () => {
  it("cuts on a word and marks the cut", () => {
    expect(previewQuote("one two three four five six seven", 20)).toBe("one two three...");
  });

  it("returns a short quote whole, cleaned", () => {
    expect(previewQuote("⚠️Short one", 50)).toBe("Short one");
  });
});
