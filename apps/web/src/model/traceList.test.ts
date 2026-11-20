import { describe, expect, it } from "vitest";
import { loadTraces } from "../data/loadTraces.ts";
import { endingCounts, traceList } from "./traceList.ts";
import { sampleRows } from "./sampleRow.ts";

const { traces } = loadTraces();
const all = { ending: null, query: "" };

describe("the #/traces list", () => {
  it("keeps recorded runs and invented examples apart, and loses none", () => {
    const list = traceList(traces, all);
    expect(list.recorded.every((r) => !r.synthetic)).toBe(true);
    expect(list.examples.every((r) => r.synthetic)).toBe(true);
    expect(list.recorded.length + list.examples.length).toBe(traces.length);
    expect(list.examples.length).toBeGreaterThan(0);
    expect(list.recorded.some((r) => r.id === "dev-10")).toBe(true);
  });

  it("filters by ending, and the counts add up to every trace", () => {
    const counts = endingCounts(sampleRows(traces));
    expect(counts.reduce((n, c) => n + c.count, 0)).toBe(traces.length);
    for (const { ending, count } of counts) {
      const list = traceList(traces, { ending, query: "" });
      const rows = [...list.recorded, ...list.examples];
      expect(rows).toHaveLength(count);
      expect(rows.every((r) => r.ending === ending)).toBe(true);
    }
  });

  it("searches every word in the claim, ignoring case and punctuation", () => {
    const list = traceList(traces, { ending: null, query: "PLASTIC, 2050" });
    expect(list.recorded.map((r) => r.id)).toContain("dev-10");
    for (const r of [...list.recorded, ...list.examples]) {
      const t = traces.find((x) => x.id === r.id)!;
      expect(`${r.wording} ${t.claim.text}`.toLowerCase()).toMatch(/plastic/);
    }
    const none = traceList(traces, { ending: null, query: "zzz no such claim" });
    expect(none.recorded.length + none.examples.length).toBe(0);
  });

  it("finds a trace by its id", () => {
    expect(traceList(traces, { ending: null, query: "dev-12" }).recorded.map((r) => r.id)).toEqual(["dev-12"]);
  });
});
