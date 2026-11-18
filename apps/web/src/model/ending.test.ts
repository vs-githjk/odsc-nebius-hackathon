import { describe, expect, it } from "vitest";
import { loadTraces } from "../data/loadTraces.ts";
import { endingSentence } from "./ending.ts";

const { traces } = loadTraces();

describe("endingSentence", () => {
  it("gives every sample one plain sentence, all different, so two samples that end the same way still read apart", () => {
    const samples = traces.filter((t) => t.synthetic);
    const sentences = samples.map(endingSentence);
    expect(new Set(sentences).size).toBe(samples.length);
  });

  it("never shows ids, codes or field names on the first screen", () => {
    for (const trace of traces) {
      const s = endingSentence(trace);
      for (const n of trace.nodes) expect(s).not.toContain(n.id);
      expect(s).not.toMatch(/_|\(s\)|http_error|tavily|cap hit|\d{3}/i);
      expect(s).toMatch(/^[A-Z].*\.$/);
    }
  });

  it("names the cap that stopped a partial trace", () => {
    const partial = traces.find((t) => t.decision.state === "PARTIAL")!;
    expect(endingSentence(partial)).toBe("The search hit its credit cap before it finished.");
    expect(endingSentence({ ...partial, budget: { ...partial.budget, capHit: "ms" } })).toBe("The search hit its time limit before it finished.");
  });
});
