import { describe, expect, it } from "vitest";
import type { Trace } from "pz/schema";
import { loadTraces } from "../data/loadTraces.ts";
import { lintText } from "../../../../packages/pz/src/cli/lint-copy.ts";
import { lineMs, replayFrame, replayLines, walkTook } from "./replay.ts";

const { traces } = loadTraces();
const byId = (id: string) => traces.find((t) => t.id === id)!;

describe("replayLines", () => {
  it("lands every page exactly once and ends on how the trace ended", () => {
    for (const t of traces) {
      const lines = replayLines(t);
      const landed = lines.flatMap((l) => (l.nodeId ? [l.nodeId] : []));
      expect([...landed].sort()).toEqual(t.nodes.map((n) => n.id).sort());
      expect(lines.at(-1)!.kind).toBe("end");
    }
  });

  it("replays the rich sample: the pages it read in order, then its search further back, which found nothing", () => {
    const rich = byId("sample-rich");
    const lines = replayLines(rich);
    expect(lines.map((l) => l.kind)).toEqual(["page", "page", "page", "page", "page", "page", "search", "end"]);
    expect(lines[6]!.text).toBe("Searched for “Harbor Zoo penguins nap 14 times a day, twice as often as the zoo's seals”, pages before December 2019: 0 results.");
    expect(lines.filter((l) => l.kind === "page").map((l) => l.nodeId)).toEqual(rich.nodes.map((n) => n.id));
    expect(lines.find((l) => l.nodeId === "myth-page")!.text).toBe("Read checkdesk.example, March 2023: discusses the claim, kept off the path.");
  });

  it("puts each page after the last search whose window still covers it, and pages no search covers first", () => {
    const base = byId("sample-rich");
    const search = (endDate: string | null, query: string) => ({ ...base.searchLog[0]!, step: "search", endDate, query, results: 2 });
    const trace: Trace = { ...base, searchLog: [search(null, "first"), search("2021-01-01", "second"), search("2019-12-31", "third")] };
    const order = replayLines(trace).map((l) => (l.kind === "search" ? l.text.match(/“(\w+)/)![1] : l.nodeId ?? l.kind));
    // 2021 to 2023 pages only fit the first window (in read order); 2020 pages the second; the 2019 page the third.
    expect(order).toEqual(["first", "trivia-blog", "social-post", "myth-page", "second", "coast-news", "coast-news-v2", "third", "zoo-report", "end"]);
  });

  it("says a followed citation and a model fallback in plain words, never as codes", () => {
    const base = byId("sample-rich");
    const trace: Trace = {
      ...base,
      searchLog: [
        ...base.searchLog,
        { ...base.searchLog[0]!, step: "follow", query: "https://www.survey.example/2010 cited by https://news.example/new, not beside its span: no link-verified edge" },
        { ...base.searchLog[0]!, step: "model", query: "query planner failed (bad_response 200): code-only queries used for this window" },
      ],
    };
    const texts = replayLines(trace).map((l) => l.text);
    expect(texts).toContain("Followed a citation to survey.example.");
    expect(texts).toContain("A model call failed, so this step used code-only searches.");
    const phrase = replayLines({ ...base, searchLog: [{ ...base.searchLog[0]!, step: "search", query: "\"14 times a day\" penguins", endDate: null, results: 3 }] });
    expect(phrase.find((l) => l.kind === "search")!.text).toBe("Searched for \"14 times a day\" penguins, no date limit: 3 results.");
    for (const t of texts) expect(t).not.toMatch(/bad_response|_/);
  });

  it("every line passes the copy lint and names no node id", () => {
    for (const t of traces) {
      for (const l of replayLines(t)) {
        expect(lintText(l.text)).toEqual([]);
        for (const n of t.nodes) expect(l.text).not.toContain(` ${n.id}`);
      }
    }
  });
});

describe("replayFrame", () => {
  it("counts landed pages and clusters as the lines play, ending on the trace's own counts", () => {
    const rich = byId("sample-rich");
    const lines = replayLines(rich);
    expect(replayFrame(rich, lines, 0)).toMatchObject({ pages: 0, clusters: 0 });
    expect(replayFrame(rich, lines, 1).pages).toBe(1);
    expect(replayFrame(rich, lines, 2).pages).toBe(2);
    const end = replayFrame(rich, lines, lines.length);
    expect([end.pages, end.clusters]).toEqual([rich.roots.pages, rich.roots.clusters]);
  });
});

describe("pacing", () => {
  it("fits a long walk into about seven seconds and says how long the real one took", () => {
    expect(lineMs(replayLines(byId("sample-rich")))).toBe(420);
    expect(lineMs(Array.from({ length: 70 }, () => ({ kind: "page" as const, text: "" })))).toBe(100);
    expect(walkTook({ ...byId("sample-rich"), budget: { ...byId("sample-rich").budget, ms: 41_200 } })).toBe("The walk took 41 seconds.");
    expect(walkTook({ ...byId("sample-rich"), budget: { ...byId("sample-rich").budget, ms: 0 } })).toBeNull();
  });
});
