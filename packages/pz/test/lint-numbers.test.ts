import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { claimRow, proofFiles } from "../src/cli/claims.ts";
import { lintNumbers, lintNumbersIn } from "../src/cli/lint-numbers.ts";

const files: Record<string, string> = {
  "spike/grading.md": "| Perplexity | 4/4 | 6/6 |\n| Ours | 1/4 | 0/6 |\nruns took 12 to 47 s",
  "rules.json": "{ \"credits\": 150, \"steps\": 10000 }",
};
const read = (path: string) => files[path] ?? null;
const lint = (text: string) => lintNumbers("README.md", text, read).map((p) => `${p.line}: ${p.issue}`);

describe("T55 number lint", () => {
  it("passes a number found in a file its section links to, and fails one that is not", () => {
    expect(lint("## Spike\n\nWe scored 1/4 against 4/4 ([grading](spike/grading.md)).")).toEqual([]);
    expect(lint("## Spike\n\nWe scored 3/4 ([grading](spike/grading.md)).")).toEqual(["3: \"3\" is not in any file this section links to"]);
  });

  it("looks only at links in the same section", () => {
    expect(lint("## Caps\n\n150 credits ([rules](rules.json)).\n\n## Other\n\nAlso 150 credits.")).toEqual(["7: \"150\" is not in any file this section links to"]);
  });

  it("reads 10,000 and 10000 as the same number, and does not find 15 inside 150 or 1.5", () => {
    expect(lint("## Caps\n\n10,000 steps ([rules](rules.json)).")).toEqual([]);
    expect(lint("## Caps\n\n15 credits ([rules](rules.json)).")).toEqual(["3: \"15\" is not in any file this section links to"]);
  });

  it("skips code, link targets, dates, years, list numbering and numbers inside identifiers", () => {
    expect(lint([
      "## Status", "", "Run `make replay ARGS=--json` or see ```", "```sh", "node 99 bottles", "```",
      "See [#130](https://github.com/x/y/issues/130) and [PR](https://github.com/x/y/pull/154).",
      "The run is Monday Nov 16, then Nov 18, 2026, and 2026-11-20; ODSC 2026.",
      "1. first step", "Uses Qwen3-30B, T72 and C17 on a 1440px screen.",
    ].join("\n"))).toEqual([]);
  });

  it("allows a number named in a numbers ok comment in the same section, so the exception is visible", () => {
    expect(lint("## Look\n\n<!-- numbers ok: 1440 (screenshot width) -->\nShown at 1440 px.")).toEqual([]);
    expect(lint("## Look\n\n<!-- numbers ok: 1440 -->\n\n## Next\n\nShown at 1440 px.")).toEqual(["7: \"1440\" is not in any file this section links to"]);
  });

  it("reports file and line for each problem across the scope", () => {
    const root = mkdtempSync(join(tmpdir(), "pz-numbers-"));
    writeFileSync(join(root, "README.md"), "# T\n\nWe found 7 roots.\n");
    writeFileSync(join(root, "llms.txt"), "# T\n\nNo numbers here.\n");
    expect(lintNumbersIn(root)).toEqual({ code: 1, lines: ["FAIL README.md:3: \"7\" is not in any file this section links to", "number lint: 2 files checked, 1 unbacked numbers"] });
  });
});

describe("T55 a built claim names a proof file that exists", () => {
  const root = mkdtempSync(join(tmpdir(), "pz-proof-"));
  mkdirSync(join(root, "eval"), { recursive: true });
  writeFileSync(join(root, "eval/score.md"), "a\nb\nc\n");
  it("finds paths and path:line references, and names the missing ones", () => {
    expect(proofFiles("dev score in eval/score.md:2 and traps/traps.lock", root)).toEqual({ found: ["eval/score.md:2"], missing: ["traps/traps.lock"] });
    expect(proofFiles("eval/score.md:99", root)).toEqual({ found: [], missing: ["eval/score.md:99"] });
    expect(proofFiles("a CI run link", root)).toEqual({ found: [], missing: [] });
  });
  it("a built row with no proof file, or a missing one, is 'proof missing'; planned rows are not checked", () => {
    const tally = { passed: 2, failed: 0 };
    expect(claimRow({ id: "C7", state: "built", text: "x", proof: "unit tests in eval/score.md" }, tally, root)).toBe("C7   built PASS   2 of 2 tagged tests pass");
    expect(claimRow({ id: "C7", state: "built", text: "x", proof: "unit tests" }, tally, root)).toBe("C7   proof missing 2 of 2 tagged tests pass; names no proof file");
    expect(claimRow({ id: "C7", state: "built", text: "x", proof: "tests in eval/gone.md" }, tally, root)).toBe("C7   proof missing 2 of 2 tagged tests pass; missing eval/gone.md");
    expect(claimRow({ id: "C7", state: "planned", text: "x", proof: "nothing" }, tally, root)).toBe("C7   planned      2 of 2 tagged tests pass");
  });
});
