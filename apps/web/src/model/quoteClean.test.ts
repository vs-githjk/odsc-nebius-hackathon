import { describe, expect, it } from "vitest";
import { cleanQuote, cleanQuoteWords } from "./quoteClean.ts";

describe("display quote cleanup", () => {
  const claim = "By 2050 there will be more plastic than fish in the ocean.";
  it.each([
    "Log inSign up United Nations on X: ",
    "Skip to content ",
    "We use cookies to improve your experience. Accept all ",
    "Cookie settings ",
  ])("removes a leading menu: %s", prefix => {
    expect(cleanQuote(prefix + claim, claim)).toBe(claim);
  });
  it("keeps quote punctuation, internal UI words and unrecognized prefixes", () => {
    expect(cleanQuote('Log inSign up United Nations on X: "' + claim + '"', claim)).toBe('"' + claim + '"');
    for (const text of ["People can Log in to read more.", "An introduction. " + claim, "Log in"]) expect(cleanQuote(text, claim)).toBe(text);
  });
  it("never strips a menu phrase that is part of the claim", () => {
    for (const text of ["Log in to see 9 facts.", "Sign up for 9 facts.", "Skip to content is a useful link.", "United Nations on X: 9 facts."]) {
      expect(cleanQuote(text, text)).toBe(text);
      expect(cleanQuote("Log inSign up " + text, text)).toContain(text);
    }
    expect(cleanQuote("United Nations on X: Nine facts.", "United Nations reports 9 facts.")).toBe("United Nations on X: Nine facts.");
  });
  it("keeps stored diff flags aligned and does not mutate the words", () => {
    const words = [{ text: "Log", changed: false }, { text: "inSign", changed: false }, { text: "up", changed: false }, { text: "9", changed: true }, { text: "facts.", changed: false }];
    const before = structuredClone(words);
    expect(cleanQuoteWords(words, "9 facts.")).toEqual(words.slice(3));
    expect(words).toEqual(before);
  });
});

describe("cleanQuote with the shared display rule", () => {
  it("strips the X menu and then the leading warning emoji", () => {
    expect(cleanQuote("Log inSign up United Nations on X: ⚠️By 2050, oceans will have more plastic than fish", "By 2050 there will be more plastic than fish in the ocean."))
      .toBe("By 2050, oceans will have more plastic than fish");
  });
});
