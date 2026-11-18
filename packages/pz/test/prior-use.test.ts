import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decideStopState, loadRules } from "../src/rules/index.ts";
import { presentsAsPrior } from "../src/rules/written-citation.ts";
import type { Trace } from "../src/schema/index.ts";

const rules = loadRules();
const node = { id: "n1" } as Trace["nodes"][number];
const said = (text: string) => presentsAsPrior({ spans: [{ id: "s1", nodeId: "n1", text } as Trace["spans"][number]] }, node, rules);

describe("a page that presents the claim as already said is never its origin (dev-04, second live run Nov 17)", () => {
  it("the recorded PubMed span quotes the advice to question it", () => {
    expect(said("Despite the seemingly ubiquitous admonition to \"drink at least eight 8-oz glasses of water a day\" (with an accompanying reminder that beverages containing caffeine and alcohol do not count), rigorous proof for this counsel appears to be lacking.")).toBe("admonition");
    expect(said("You've probably heard that you need eight glasses a day.")).not.toBeNull();
    expect(said("It is often said that we use 10 percent of our brains.")).not.toBeNull();
    expect(said("The common advice is to walk 10,000 steps.")).not.toBeNull();
  });

  it("a page that states the claim as its own finding is not caught", () => {
    expect(said("We recommend that adults drink eight glasses of water a day.")).toBeNull();
    expect(said("Our survey found 71% of emissions came from 100 companies.")).toBeNull();
    expect(said("The study says this is common in older adults.")).toBeNull();
  });

  it("the committed SAMPLE origin traces still end ORIGIN_FOUND", () => {
    const sample: Trace = JSON.parse(readFileSync(fileURLToPath(new URL("../../../fixtures/traces/sample-origin.json", import.meta.url)), "utf8"));
    expect(decideStopState(sample, rules).state).toBe("ORIGIN_FOUND");
  });
});
