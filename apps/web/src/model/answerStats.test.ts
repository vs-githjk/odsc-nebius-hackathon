import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { answerSegments, readAnswerCheck } from "./answerStats.ts";

const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("../../../../fixtures/answers/s7-answer.json", import.meta.url)), "utf8"));

describe("the #/answer page reads the S7 recording", () => {
  const check = readAnswerCheck(fixture);

  it("finds all three statistics, each with a valid recorded trace that went cold", () => {
    expect(check.stats.map((s) => s.number)).toEqual(["2050", "100", "71%"]);
    expect(check.stats.map((s) => s.n)).toEqual([1, 2, 3]);
    for (const s of check.stats) {
      expect(s.trace.decision.state).toBe("TRAIL_GOES_COLD");
      expect(s.trace.mode).toBe("REPLAY");
    }
    expect(check.summary).toBe("3 statistics: 3 went cold.");
  });

  it("cuts the answer without losing a character and links each number once", () => {
    const segments = answerSegments(check.answer, check.stats);
    const text = segments.map((s) => (s.kind === "text" ? s.text : s.parts.map((p) => p.text).join(""))).join("");
    expect(text).toBe(check.answer);
    const links = segments.flatMap((s) => (s.kind === "sentence" ? s.parts.filter((p) => p.n !== null) : []));
    expect(links.map((p) => [p.text, p.n])).toEqual([["2050", 1], ["100", 2], ["71%", 3]]);
    expect(segments.filter((s) => s.kind === "sentence")).toHaveLength(2);
  });
});
