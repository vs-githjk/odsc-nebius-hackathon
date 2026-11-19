import { describe, expect, it } from "vitest";
import type { Trace } from "pz/schema";
import { loadTraces } from "../data/loadTraces.ts";
import { lintText } from "../../../../packages/pz/src/cli/lint-copy.ts";
import { afterTick, autoplays, lineMs, pageVerdict, railHead, replayFrame, replayLines, startPhase, walkTook } from "./replay.ts";

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

  it("says what the trace recorded about each page, never more (XO on #4)", () => {
    const base = byId("sample-rich");
    const page = base.nodes.find((n) => !n.meta && n.sameClaim)!;
    const yes = { ...page.sameClaim!, optionId: "yes", probability: 0.987 };
    expect(pageVerdict({ ...page, sameClaim: yes })).toBe("states the claim (model: yes, 0.99)");
    expect(pageVerdict({ ...page, sameClaim: { ...yes, optionId: "no", probability: 0.97 } })).toBe("a different claim (model: no, 0.97)");
    expect(pageVerdict({ ...page, sameClaim: { ...yes, optionId: "unsure" } })).toBe("not confirmed (below the confidence bar)");
    // decide.ts confidentYes refuses a yes whose confidence could not be read, so the rail does not claim it either.
    expect(pageVerdict({ ...page, sameClaim: { ...yes, probability: null } })).toBe("not confirmed (model: yes, confidence not recorded)");
    expect(pageVerdict({ ...page, sameClaim: { ...yes, probability: 0.9999 } })).toBe("states the claim (model: yes, >0.99)");
    expect(pageVerdict({ ...page, sameClaim: { ...yes, probability: 0.994 } })).toBe("states the claim (model: yes, 0.99)");
    // No stored answer: the line names the page and its date and says nothing about it.
    const unasked = { ...base, nodes: base.nodes.map((n) => (n.id === page.id ? { ...n, sameClaim: null } : n)) };
    expect(replayLines(unasked).find((l) => l.nodeId === page.id)!.text).toMatch(/^Read [^:]+, [A-Z][a-z]+ \d{4}\.$/);
  });

  it("dev-10 (Nov 19 run): the WEF report's line says what same_claim recorded, here yes", () => {
    const dev10 = byId("dev-10");
    const wef = dev10.nodes.find((n) => n.domain === "www3.weforum.org")!;
    expect(wef.sameClaim?.optionId).toBe("yes");
    const line = replayLines(dev10).find((l) => l.nodeId === wef.id)!.text;
    expect(line).toMatch(/^Read www3\.weforum\.org, January 2016: states the claim \(model: yes, (?:>0\.99|\d\.\d{2})\)\.$/);
    for (const l of replayLines(dev10)) expect(lintText(l.text)).toEqual([]);
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

describe("the replay's state machine (XO on #186)", () => {
  it("autoplays once per trace per visit, and never under reduced motion", () => {
    expect(autoplays(false, false)).toBe(true);
    expect(autoplays(true, false)).toBe(false);
    expect(autoplays(false, true)).toBe(false);
  });

  it("'Replay the walk' under reduced motion jumps straight to the end; otherwise it plays from the first line", () => {
    expect(startPhase(true)).toBe("done");
    expect(startPhase(false)).toBe("lines");
  });

  it("ticks one line at a time, then hands over to the handle's walk", () => {
    expect(afterTick(0, 3)).toEqual({ phase: "lines", shown: 1 });
    expect(afterTick(2, 3)).toEqual({ phase: "lines", shown: 3 });
    expect(afterTick(3, 3)).toEqual({ phase: "walk", shown: 3 });
  });
});

describe("railHead", () => {
  it("never says recorded, or gives a duration, on an invented sample", () => {
    const head = railHead(byId("sample-rich"));
    expect(head).toEqual({ title: "Sample walk, made-up data", sub: "Shown step by step from the sample trace." });
    expect(`${head.title} ${head.sub}`).not.toMatch(/recorded|seconds|took/i);
  });

  it("gives a recorded trace its date and how long the walk took", () => {
    const real: Trace = { ...byId("sample-rich"), synthetic: false, mode: "LIVE", recordedAt: "2026-11-17T23:05:00Z", budget: { ...byId("sample-rich").budget, ms: 36_400 } };
    expect(railHead(real)).toEqual({ title: "Replaying the recorded walk", sub: "Recorded November 17, 2026. The walk took 36 seconds. Shown faster." });
  });
});
