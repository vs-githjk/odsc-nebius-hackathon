import { describe, expect, it } from "vitest";
import { loadTraces } from "../data/loadTraces.ts";
import { createRecent } from "./recent.ts";

const base = loadTraces().traces[0]!;
const traces = Array.from({ length: 8 }, (_, i) => ({ ...base, id: String(i) }));
describe("session recent traces", () => {
  it("deduplicates, orders newest first, excludes current and caps at five", () => {
    let saved = "";
    const recent = createRecent(() => ({ getItem: () => null, setItem: (_, value) => { saved = value; } }));
    traces.forEach(trace => recent.open(trace));
    recent.open(traces[3]!);
    expect(recent.list(traces, "3").map(t => t.id)).toEqual(["7", "6", "5", "4", "2"]);
    expect(JSON.parse(saved)).toEqual(["3", "7", "6", "5", "4", "2"]);
  });
  it("survives denied storage access and retains live data only in memory", () => {
    const recent = createRecent(() => { throw new Error("denied"); });
    const live = { ...base, id: "live", mode: "LIVE" as const };
    recent.open(live);
    expect(recent.list([], "")).toEqual([live]);
    expect(recent.list([], "live")).toEqual([]);
  });
  it("restores ids, skips unavailable traces and tolerates malformed data and failed writes", () => {
    for (const value of ["{", "null", "{}"]) {
      expect(createRecent(() => ({ getItem: () => value, setItem() {} })).list(traces, "")).toEqual([]);
    }
    const recent = createRecent(() => ({ getItem: () => '["missing","2","2",null,"1"]', setItem() { throw new Error("full"); } }));
    expect(recent.list(traces, "").map(t => t.id)).toEqual(["2", "1"]);
    recent.open(traces[0]!);
    expect(recent.list(traces, "0").map(t => t.id)).toEqual(["2", "1"]);
  });
});
