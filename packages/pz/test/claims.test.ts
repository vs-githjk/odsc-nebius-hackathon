import { describe, expect, it } from "vitest";
import { claimRow, parseClaims, tallyTags } from "../src/cli/claims.ts";

const plan = [
  "## Claims we will make",
  "Intro line.",
  "- C3 | planned | Edges are labelled | proof: a test (T2)",
  "- C16 | built | The stop state is decided by code | proof: decision tests (T5)",
  "- C17 | built | make verify runs | proof: CI (T8)",
  "## Review Focus",
  "- C99 | built | not a claim | proof: none",
].join("\n");

const results = { testResults: [{ assertionResults: [
  { title: "[C16] row 1", status: "passed" }, { title: "[C16] [C3] row 2", status: "passed" },
  { title: "[C17] lint", status: "failed" }, { title: "untagged", status: "passed" },
] }] };

describe("claims table", () => {
  it("[C17] parses the claim lines in the section only", () => {
    expect(parseClaims(plan)).toEqual([
      { id: "C3", state: "planned", text: "Edges are labelled" },
      { id: "C16", state: "built", text: "The stop state is decided by code" },
      { id: "C17", state: "built", text: "make verify runs" },
    ]);
  });

  it("[C17] maps tagged test results to rows", () => {
    const tally = tallyTags(results);
    const [c3, c16, c17] = parseClaims(plan);
    expect(claimRow(c3!, tally.get("C3"))).toBe("C3   planned      1 of 1 tagged tests pass");
    expect(claimRow(c16!, tally.get("C16"))).toBe("C16  built PASS   2 of 2 tagged tests pass");
    expect(claimRow(c17!, tally.get("C17"))).toBe("C17  built FAIL   0 of 1 tagged tests pass");
    expect(claimRow({ id: "C9", state: "built", text: "x" }, undefined)).toBe("C9   no test yet  no tagged tests");
  });
});
