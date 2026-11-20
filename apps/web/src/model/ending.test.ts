import { describe, expect, it } from "vitest";
import { loadTraces } from "../data/loadTraces.ts";
import { endingSentence } from "./ending.ts";

const { traces } = loadTraces();

describe("endingSentence", () => {
  it("translates recorded cold-stop reasons without claiming a primary source was absent", () => {
    const cold = traces.find(t => t.decision.state === "TRAIL_GOES_COLD")!;
    const withoutUnread = { ...cold, nodes: cold.nodes.map(n => ({ ...n, candidateParents: [] })) };
    const cases = [
      ["boundary print: the earliest page credits a print source, with no web copy to open", "The earliest page credits a print source, with no web copy to open."],
      ["boundary circular: the earliest pages only cite each other or later pages", "The earliest pages only cite each other or later pages."],
      ["earliest page n1 presents the claim as already said", "The earliest page presents the claim as something already said."],
      ["same_claim not asked", "The earliest page could not be confirmed as stating the same claim."],
    ];
    for (const [reason, expected] of cases) expect(endingSentence({ ...withoutUnread, decision: { ...cold.decision, reasons: [reason!] } })).toBe(expected);
    // dev-06 stays cold because an on-topic fact-check cites pages it could not open (#307).
    const unread = traces.find(t => t.id === "dev-06")!;
    expect(unread.decision.state).toBe("TRAIL_GOES_COLD");
    expect(endingSentence(unread)).toBe("A page it cites could not be opened.");
  });
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
