import { describe, expect, it } from "vitest";
import { month } from "./stopCard.ts";

describe("partial dates in the web app", () => {
  it("a year-only date reads as the year, a month date as the month", () => {
    expect(month("2020-12-31", "year")).toBe("2020");
    expect(month("2020-06-30", "month")).toBe("June 2020");
    expect(month("2020-06-15", "day")).toBe("June 2020");
    expect(month("2020-06-15")).toBe("June 2020");
  });
});
