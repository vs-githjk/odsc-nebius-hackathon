import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { S7, answerPieces } from "./answerCheck.ts";

const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("../../../../fixtures/answers/s7-answer.json", import.meta.url)), "utf8"));

describe("the landing page's answer check matches the S7 recording", () => {
  it("has the recorded answer, summary and date", () => {
    expect(S7.answer).toBe(fixture.answer.trim());
    expect(S7.summary).toBe(fixture.summary);
    expect(fixture.recordedAt.startsWith(S7.recordedAt)).toBe(true);
  });

  it("marks exactly the recorded statistics, each of which went cold", () => {
    const recorded = [...new Map(fixture.claims.map((c: { start: number; end: number }) => [`${c.start}-${c.end}`, c])).values()] as { start: number; end: number; trace: { decision: { state: string } } }[];
    expect(S7.claims.map((c) => [c.start, c.end])).toEqual(recorded.map((c) => [c.start, c.end]));
    for (const c of fixture.claims) expect(c.trace.decision.state).toBe("TRAIL_GOES_COLD");
    expect(fixture.claims).toHaveLength(3);
  });

  it("cuts the answer into text and claims without losing a character", () => {
    const pieces = answerPieces(S7.answer, S7.claims);
    expect(pieces.map((p) => p.text).join("")).toBe(S7.answer);
    expect(pieces.filter((p) => p.claim)).toHaveLength(2);
  });
});
