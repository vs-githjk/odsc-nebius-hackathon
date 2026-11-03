import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkLeakage } from "../src/cli/leakage.ts";
import { lintCopy, lintText } from "../src/cli/lint-copy.ts";

const temp = () => mkdtempSync(join(tmpdir(), "pz-t8-"));

describe("copy lint", () => {
  it("[C17] flags each dash and each banned phrase", () => {
    const bad = ["a — b", "a – b", "two independent sources", "invented by them", "this outlet changed it", "it proves it", "introduced by them"];
    expect(bad.map((l) => lintText(l).length)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it("[C17] passes clean text and flags a dirty file in scope", () => {
    expect(lintText("Traced to 3 roots we could link. The earliest source we found is a keeper log.")).toEqual([]);
    const root = temp();
    writeFileSync(join(root, "README.md"), "Clean line.\nA draft — line.\n");
    const run = lintCopy(root);
    expect(run.code).toBe(1);
    expect(run.lines[0]).toBe("FAIL README.md:2: em dash (U+2014)");
  });
});

describe("leakage", () => {
  it("[C17] is not armed until the held-out claims are revealed", () => {
    expect(checkLeakage(temp())).toEqual({ code: 0, lines: ["not armed: held-out claims not revealed"] });
  });

  it("[C17] fails when a held-out claim appears in packages/", () => {
    const root = temp();
    mkdirSync(join(root, "eval"));
    mkdirSync(join(root, "packages/pz/rules"), { recursive: true });
    writeFileSync(join(root, "eval/heldout.claims.txt"), "Owls blink 9 times a minute\n");
    writeFileSync(join(root, "packages/pz/rules/rules.json"), "{\"note\": \"owls blink 9 times a minute\"}\n");
    const run = checkLeakage(root);
    expect(run.code).toBe(1);
    expect(run.lines[0]).toBe("FAIL packages/pz/rules/rules.json: contains held-out claim 1");
  });
});
