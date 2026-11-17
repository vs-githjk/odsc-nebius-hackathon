import { describe, expect, it } from "vitest";
import { loadTraces } from "../data/loadTraces.ts";
import { lintText } from "../../../../packages/pz/src/cli/lint-copy.ts";
import { scrubberStops, type Word } from "./scrubber.ts";
import { hopInto, readoutsHead, redStop, runs } from "./hop.ts";

const { traces } = loadTraces();
const byId = (id: string) => traces.find((t) => t.id === id)!;

describe("redStop", () => {
  it("[C25] marks the stop whose wording changed on the red hop, and nothing when there is no red hop", () => {
    const rich = byId("sample-rich");
    const stops = scrubberStops(rich);
    const i = redStop(rich, stops);
    expect(i).toBe(1);
    expect(stops[i + 1]!.edgeId).toBe(rich.redHopEdgeId);
    for (const t of traces.filter((t) => t.redHopEdgeId === null)) expect(redStop(t, scrubberStops(t))).toBe(-1);
  });
});

describe("hopInto", () => {
  it("gives the chips for what changed on the way into a stop, each measured or inferred with its percent", () => {
    const rich = byId("sample-rich");
    const hop = hopInto(rich, scrubberStops(rich), 1)!;
    expect(hop.red).toBe(true);
    expect(hop.chips.map((c) => [c.label, c.tag])).toEqual([
      ["Hedge dropped", "measured"],
      ["Comparison added", "measured"],
      ["Scope widened", "inferred, 81%"],
      ["Attribution shifted", "unsure, 55%"],
      ["Context stripped", "inferred, 62%, disputed"],
    ]);
  });

  it("draws an unsure readout neutral, never as a change", () => {
    const rich = byId("sample-rich");
    const chips = hopInto(rich, scrubberStops(rich), 1)!.chips;
    expect(chips.find((c) => c.id === "attribution_shifted")!.tone).toBe("unsure");
    expect(chips.filter((c) => c.tone === "changed").map((c) => c.id)).not.toContain("attribution_shifted");
  });

  it("leaves out readouts that did not fire, and the earliest stop has no hop into it", () => {
    const rich = byId("sample-rich");
    const stops = scrubberStops(rich);
    const newest = hopInto(rich, stops, 0)!;
    expect(newest.red).toBe(false);
    expect(newest.chips.map((c) => c.id)).toEqual(["attribution_shifted"]);
    expect(hopInto(rich, stops, stops.length - 1)).toBeNull();
  });

  it("chip copy passes the copy lint", () => {
    for (const t of traces) {
      const stops = scrubberStops(t);
      for (let i = 0; i < stops.length; i++) for (const c of hopInto(t, stops, i)?.chips ?? []) expect(lintText(`${c.label} ${c.tag}`)).toEqual([]);
    }
  });
});

describe("readoutsHead", () => {
  it("says the older page is only inferred as the source when no link joins them (XO on #181)", () => {
    const rich = byId("sample-rich");
    const stops = scrubberStops(rich);
    const red = hopInto(rich, stops, 1)!;
    expect(red.inferred).toBe(true);
    expect(readoutsHead(red)).toBe("What changed from the older page, which is inferred as the source by date, with no link.");
    const linked = hopInto(rich, stops, 0)!;
    expect(linked.inferred).toBe(false);
    expect(readoutsHead(linked)).toBe("What changed from the older page");
    expect(readoutsHead({ ...linked, chips: [] })).toBe("Nothing we check for changed from the older page.");
    for (const h of [red, linked]) expect(lintText(readoutsHead(h))).toEqual([]);
  });
});

describe("runs", () => {
  it("joins neighbouring changed words into one run and keeps the words in order", () => {
    const w = (text: string, changed = false): Word => ({ text, changed });
    const out = runs([w("Penguins"), w("nap"), w("twice", true), w("as", true), w("often", true), w("here")]);
    expect(out).toEqual([w("Penguins nap"), w("twice as often", true), w("here")]);
    expect(runs([])).toEqual([]);
  });
});
