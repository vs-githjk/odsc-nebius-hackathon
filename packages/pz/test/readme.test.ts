import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lintCopy } from "../src/cli/lint-copy.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const FILES = ["README.md", "llms.txt"];

describe("README and llms.txt", () => {
  it("[C17] pass the copy lint", () => {
    expect(lintCopy(root, FILES)).toEqual({ code: 0, lines: ["copy lint: 2 files checked, 0 problems"] });
  });

  it("every relative link resolves to a file in the repo", () => {
    for (const file of FILES) {
      const links = [...readFileSync(join(root, file), "utf8").matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]!)
        .filter((l) => !/^[a-z]+:/i.test(l) && !l.startsWith("#"));
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) expect(existsSync(join(root, link.split("#")[0]!)), `${file} links to ${link}`).toBe(true);
    }
  });
});
