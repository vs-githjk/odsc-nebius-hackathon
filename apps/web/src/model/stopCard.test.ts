import { describe, expect, it } from "vitest";
import type { Trace } from "pz/schema";
import rulesJson from "../../../../packages/pz/rules/rules.json";
import { decideStopState } from "../../../../packages/pz/src/rules/decide.ts";
import type { Rules } from "../../../../packages/pz/src/rules/rules.ts";
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
    expect(stopCard(byId("sample-rich")).searched).toBe("1 search, back to before December 2019. 6 pages read, 1 of them only discussing the claim.");
    expect(stopCard(byId("sample-cold-unread")).searched).toBe("2 searches, back to before December 2019. 2 pages read.");
    expect(stopCard(byId("sample-tool-failed")).searched).toBe("No search finished. 1 page read.");
    expect(stopCard(byId("sample-no-pages")).searched).toBe("2 searches, with no date limit. 1 page read, which only discusses the claim.");
  });

  it("an origin gets the origin page itself: its site, its month and its own words", () => {
    const card = stopCard(byId("sample-origin"));
    expect(card.origin).toEqual({ domain: "harborzoo.example", when: "April 2019", quote: expect.stringContaining("14") , url: expect.stringContaining("harborzoo.example") });
    expect(stopCard(byId("sample-rich")).origin).toBeNull();
  });

  // XO on #180: with two earliest pages, news listed first, the card must quote the page decide picked.
  it("quotes the page row 5 picked, not the first page of the earliest group", () => {
    const base = byId("sample-origin");
    const primary = base.nodes.find((n) => n.id === "keeper-log")!;
    const span = base.spans.find((s) => s.nodeId === primary.id)!;
    const news = {
      ...primary, id: "news-first", url: "https://news.example/penguins", domain: "news.example", spanIds: ["s-news-first"], clusterId: "c-news-first",
      pageType: { ...primary.pageType!, optionId: "news", top: [{ optionId: "news", p: 0.9 }] },
    };
    const trace: Trace = {
      ...base,
      nodes: [news, ...base.nodes],
      spans: [{ ...span, id: "s-news-first", nodeId: "news-first", text: "Penguins nap 14 times a day, a zoo report says." }, ...base.spans],
      earliest: { ...base.earliest, nodeIds: ["news-first", ...base.earliest.nodeIds] },
    };
    expect(decideStopState(trace, rulesJson as unknown as Rules).state).toBe("ORIGIN_FOUND");
    expect(stopCard({ ...trace, decision: decideStopState(trace, rulesJson as unknown as Rules) }).origin).toMatchObject({ domain: "harborzoo.example", quote: span.text });
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
