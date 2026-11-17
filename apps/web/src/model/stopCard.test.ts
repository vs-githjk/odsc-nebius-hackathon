import { describe, expect, it } from "vitest";
import { loadTraces } from "../data/loadTraces.ts";
import { lintText } from "../../../../packages/pz/src/cli/lint-copy.ts";
import { RULES, stopCard } from "./stopCard.ts";

const { traces } = loadTraces();
const byId = (id: string) => traces.find((t) => t.id === id)!;

describe("stopCard", () => {
  it("[C16] each of the six endings gives its title and the rule row from the stored decision", () => {
    const titles = Object.fromEntries(traces.map((t) => [t.decision.state, stopCard(t).title]));
    expect(titles).toEqual({
      TOOL_FAILED: "A search service failed",
      PARTIAL: "Stopped at a limit",
      NO_PAGES_FOUND: "No pages found",
      CONFLICTING: "The earliest pages disagree",
      ORIGIN_FOUND: "Origin found",
      TRAIL_GOES_COLD: "The trail goes cold",
    });
    for (const t of traces) expect(stopCard(t).ruleRow).toBe(t.decision.row);
  });

  it("[C16] the rule sheet lists all six rows in order, in plain words, with the one that decided marked", () => {
    expect(RULES.map((r) => r.row)).toEqual([1, 2, 3, 4, 5, 6]);
    const card = stopCard(byId("sample-conflicting"));
    expect(card.rules.filter((r) => r.decided).map((r) => r.row)).toEqual([4]);
    for (const r of RULES) expect(r.text).toMatch(/^[A-Z].*\.$/);
  });

  it("says what was searched in plain words, with months, never raw dates", () => {
    expect(stopCard(byId("sample-rich")).searched).toBe("1 search, back to before December 2019. 6 pages read.");
    expect(stopCard(byId("sample-cold-unread")).searched).toBe("2 searches, back to before December 2019. 2 pages read.");
    expect(stopCard(byId("sample-tool-failed")).searched).toBe("No search finished. 1 page read.");
    expect(stopCard(byId("sample-no-pages")).searched).toBe("2 searches, with no date limit. 1 page read.");
  });

  it("an origin gets the origin page itself: its site, its month and its own words", () => {
    const card = stopCard(byId("sample-origin"));
    expect(card.origin).toEqual({ domain: "harborzoo.example", when: "April 2019", quote: expect.stringContaining("14") , url: expect.stringContaining("harborzoo.example") });
    expect(stopCard(byId("sample-rich")).origin).toBeNull();
  });

  // The copy lint itself checks every card string for banned phrases and dashes.
  it("no card string carries a banned phrase, a dash, an id or a code", () => {
    for (const t of traces) {
      const card = stopCard(t);
      const strings = [card.title, card.count, card.sentence, card.searched, ...card.rules.map((r) => r.text)];
      for (const s of strings) {
        expect(lintText(s)).toEqual([]);
        expect(s).not.toMatch(/_|row \d/);
        for (const n of t.nodes) expect(s).not.toContain(n.id);
      }
    }
  });

  it("leads with the independence count from pz/headline (T94)", () => {
    expect(stopCard(byId("sample-origin")).count).toBe("Found on 3 pages: 1 independent root, 1 origin. 2 are copies.");
    expect(stopCard(byId("sample-no-pages")).count).toBe("Found on no pages.");
  });

  it("the sentence and the tone come from the ending", () => {
    expect(stopCard(byId("sample-tool-failed")).tone).toBe("caution");
    expect(stopCard(byId("sample-origin")).tone).toBe("found");
    expect(stopCard(byId("sample-rich")).tone).toBe("cold");
    expect(stopCard(byId("sample-partial")).sentence).toBe("The search hit its credit cap before it finished.");
  });
});
