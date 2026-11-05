import { describe, expect, it } from "vitest";
import { findSpan } from "../src/match/verbatim.ts";

describe("findSpan", () => {
  it("[C2] finds an exact span at its offsets", () => {
    const page = "Intro text. Harbor Zoo penguins nap 14 times a day. More text.";
    const span = "Harbor Zoo penguins nap 14 times a day.";
    expect(findSpan(page, span)).toEqual({ start: 12, end: 12 + span.length, tier: "exact" });
  });

  it("[C2] matches at the normalised tier across curly quotes and soft hyphens", () => {
    const hit = findSpan("The “zoo” pen­guins nap 14 times.", '"zoo" penguins nap 14 times.');
    expect(hit).toMatchObject({ tier: "normalised" });
  });

  it("[C2] normalised offsets point at the span in the normalised page", () => {
    const hit = findSpan("A  “quote” here", '"quote" here');
    expect(hit).toEqual({ start: 2, end: 14, tier: "normalised" });
  });

  it("[C2] 8 seconds never matches 9 seconds", () => {
    expect(findSpan("Attention lasts 9 seconds.", "8 seconds")).toEqual({ rejected: "not_found" });
  });

  it("[C2] a digit is never matched inside a longer number", () => {
    expect(findSpan("Attention lasts 18 seconds.", "8 seconds")).toEqual({ rejected: "not_found" });
    expect(findSpan("Attention lasts 8.5 seconds.", "8")).toEqual({ rejected: "not_found" });
    expect(findSpan("Attention lasts 3,500 seconds.", "3")).toEqual({ rejected: "not_found" });
  });

  it("[C2] is never matches is not", () => {
    expect(findSpan("The figure is not 8.", "The figure is")).toEqual({ rejected: "negated" });
    expect(findSpan("The figure is not 8.", "is 8")).toEqual({ rejected: "not_found" });
  });

  it("[C2] a span preceded by a negation prefix is rejected", () => {
    expect(findSpan("It is a myth that penguins nap 14 times.", "penguins nap 14 times.")).toEqual({ rejected: "negated" });
    expect(findSpan("There is no evidence that penguins nap 14 times.", "penguins nap 14 times.")).toEqual({ rejected: "negated" });
    expect(findSpan("Keepers do not 14 times.", "14 times.")).toEqual({ rejected: "negated" });
  });

  it("[C2] uses a later clean occurrence when the first is negated", () => {
    const page = "It is a myth that penguins nap. Keepers say penguins nap.";
    expect(findSpan(page, "penguins nap.")).toMatchObject({ start: 44, tier: "exact" });
  });

  it("[C2] a word ending in a negation is not a prefix", () => {
    expect(findSpan("The knot 14 times.", "14 times.")).toMatchObject({ tier: "exact" });
  });
});

describe("findSpan negation through look-alike characters", () => {
  it("[C2] a no-break space inside a negation prefix is still a negation", () => {
    expect(findSpan("It is a myth that penguins nap 14 times a day.", "penguins nap 14 times a day.")).toEqual({ rejected: "negated" });
  });

  it("[C2] a soft hyphen inside a negation prefix is still a negation", () => {
    expect(findSpan("It is a my­th that penguins nap 14 times a day.", "penguins nap 14 times a day.")).toEqual({ rejected: "negated" });
  });

  it("[C2] a no-break space before a following not is still a negation", () => {
    expect(findSpan("The figure is not 8.", "The figure is")).toEqual({ rejected: "negated" });
  });
});
