import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blind, draw, formFromTrace, scrub, SEED, unblind, type Grade, type Key } from "../../../eval/rematch/rematch.ts";
import { Trace } from "../src/schema/index.ts";

const root = new URL("../../../", import.meta.url);
const e3 = JSON.parse(readFileSync(new URL("eval/dev-claims-e3.json", root), "utf8")) as { id: string; text: string; expected: string }[];
const load = (name: string) => Trace.parse(JSON.parse(readFileSync(new URL(`fixtures/traces/${name}.json`, root), "utf8")));

describe("T93 rematch", () => {
  it("draws the committed 10 E3 claims from the fixed seed, with no held-out or spike claim possible", () => {
    const committed = JSON.parse(readFileSync(new URL("eval/rematch/draw.json", root), "utf8")) as { seed: string; claims: string[] };
    expect(committed.seed).toBe(SEED);
    expect(draw(e3)).toEqual(committed.claims);
    expect(committed.claims).toHaveLength(10);
    expect(committed.claims.every((id) => id.startsWith("e3-"))).toBe(true);
    expect(draw(e3, "another seed")).not.toEqual(committed.claims);
  });

  it("puts our trace in the spike's form shape, and never says origin unless the trace found one", () => {
    const origin = formFromTrace(load("sample-origin"));
    expect(origin).toMatch(/^- Earliest URL: https:\/\//);
    expect(origin).toContain("## Chain, newest to oldest");
    expect(origin).toContain("This page is the earliest source found");
    const cold = formFromTrace(load("sample-rich"));
    expect(cold).toContain("No earlier source could be confirmed");
    expect(cold.toLowerCase()).not.toMatch(/\borigin/);
    expect(formFromTrace(load("sample-no-pages"))).toContain("No page stating the claim was found.");
  });

  it("removes what would tell the grader which tool wrote a form", () => {
    const text = scrub("ChatGPT Deep Research found it citeturn12search0. Perplexity agrees; Claude too. Patient Zero (REPLAY) Decision table row 6. https://chatgpt.com/share/abc");
    for (const word of ["ChatGPT", "Deep Research", "citeturn", "Perplexity", "Claude", "Patient Zero", "REPLAY", "row 6", "chatgpt.com"]) expect(text).not.toContain(word);
  });

  it("blinds per claim with the key outside git, and unblinds grades into per-tool totals", () => {
    const dir = mkdtempSync(join(tmpdir(), "pz-rematch-"));
    const claims = [{ id: "e3-02", text: "1 in 3 people globally do not have access to safe drinking water.", expected: "origin" },
      { id: "e3-32", text: "It takes 43 muscles to frown and only 17 to smile.", expected: "cold" }];
    for (const tool of ["chatgpt", "claude", "perplexity"]) {
      mkdirSync(join(dir, "raw", tool), { recursive: true });
      for (const c of claims) writeFileSync(join(dir, "raw", tool, `${c.id}.form.md`), `- Earliest URL: https://${tool}.example/${c.id}\n- Its date: 2020\n- Stop statement: "${tool} says so"`);
    }
    mkdirSync(join(dir, "raw", "patient-zero"), { recursive: true });
    writeFileSync(join(dir, "raw", "patient-zero", "e3-02.json"), readFileSync(new URL("fixtures/traces/sample-origin.json", root)));
    const keyPath = join(mkdtempSync(join(tmpdir(), "pz-key-")), "key.json");
    const order = [0, 1, 0];
    const result = blind(dir, claims, keyPath, (n) => order.shift() ?? n - 1);
    expect(result).toEqual({ forms: 7, missing: ["patient-zero/e3-32"] });
    expect(readdirSync(join(dir, "forms")).sort()).toEqual(["e3-02-A.md", "e3-02-B.md", "e3-02-C.md", "e3-02-D.md", "e3-32-A.md", "e3-32-B.md", "e3-32-C.md"]);
    for (const f of readdirSync(join(dir, "forms"))) expect(readFileSync(join(dir, "forms", f), "utf8")).not.toMatch(/chatgpt|claude|perplexity/i);
    expect(existsSync(keyPath)).toBe(true);
    const repoKey = join(new URL(".", root).pathname, "eval/rematch/key.json");
    expect(() => blind(dir, claims, repoKey)).toThrow(/outside the repo/);

    const key = JSON.parse(readFileSync(keyPath, "utf8")) as Key;
    const ours = key.find((k) => k.claim === "e3-02" && k.tool === "patient-zero")!;
    const grades: Grade[] = key.map((k) => ({ claim: k.claim, form: k.letter, earliest: k.tool === "patient-zero" || k.claim === "e3-32" ? (k.claim === "e3-32" ? "Boundary" : "Pass") : "Fail",
      stop: "Pass", citation: k.tool === "patient-zero" ? "Pass" : "Fail" }));
    const table = unblind(grades, key, claims);
    expect(table).toContain("| patient-zero | 1/1 | 0/0 | 1/1 | 1/1 |");
    expect(table).toContain("| chatgpt | 0/1 | 1/1 | 0/2 | 1/2 |");
    expect(table).toContain(`| e3-02 | origin | patient-zero | ${ours.letter} | Pass | Pass | Pass |`);
    expect(table).toContain("| e3-32 | cold | patient-zero | none | not graded |");
  });
});
