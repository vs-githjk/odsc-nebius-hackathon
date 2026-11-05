import { describe, expect, it } from "vitest";
import type { Trace } from "pz/schema";
import { loadTraces } from "../data/loadTraces.ts";
import { dateToX, edgeStyle, scrubberStops, wordsAt } from "./scrubber.ts";

const { traces } = loadTraces();
const byId = (id: string) => traces.find((t) => t.id === id)!;
const withStops = traces.filter((t) => scrubberStops(t).length > 0);

describe("scrubberStops", () => {
  it("[C25] on every fixture each stop's text equals a span's text in that trace, with its link", () => {
    expect(withStops.length).toBeGreaterThan(3);
    for (const trace of withStops) {
      for (const stop of scrubberStops(trace)) {
        const span = trace.spans.find((s) => s.id === stop.spanId);
        expect(span?.text).toBe(stop.text);
        expect(trace.nodes.find((n) => n.id === span?.nodeId)?.url).toBe(stop.url);
      }
    }
  });

  it("[C25] stops run from now to the past, in date order", () => {
    for (const trace of withStops) {
      const dates = scrubberStops(trace).map((s) => s.date).filter((d): d is string => d !== null);
      expect(dates).toEqual([...dates].sort().reverse());
    }
  });

  it("[C25] the rich sample walks through the red hop to the earliest page", () => {
    const trace = byId("sample-rich");
    const stops = scrubberStops(trace);
    expect(stops.map((s) => s.edgeId)).toContain(trace.redHopEdgeId);
    expect(trace.earliest.nodeIds).toContain(trace.spans.find((s) => s.id === stops.at(-1)?.spanId)?.nodeId);
    expect(stops[0]?.edgeId).toBeNull();
  });

  it("[C25] an inferred hop is flagged", () => {
    const stops = scrubberStops(byId("sample-rich"));
    const inferred = stops.filter((s) => s.inferred);
    expect(inferred.map((s) => s.edgeId)).toEqual(["e2"]);
  });

  it("[C25] a hop with an unsure readout is flagged unsure", () => {
    const stop = scrubberStops(byId("sample-rich")).find((s) => s.edgeId === "e2");
    expect(stop?.unsure).toBe(true);
  });

  it("[C20] sample-conflicting ends with two wordings, both from the earliest pages", () => {
    const trace = byId("sample-conflicting");
    const stops = scrubberStops(trace);
    const lastTwo = stops.slice(-2);
    expect(lastTwo).toHaveLength(2);
    expect(lastTwo[0]?.text).not.toBe(lastTwo[1]?.text);
    const nodeOf = (spanId: string) => trace.spans.find((s) => s.id === spanId)?.nodeId;
    expect(lastTwo.map((s) => nodeOf(s.spanId)).sort()).toEqual([...trace.earliest.nodeIds].sort());
  });

  it("a trace with no pages has no stops", () => {
    expect(scrubberStops(byId("sample-no-pages"))).toEqual([]);
  });
});

describe("edgeStyle", () => {
  it("[C3] explicit and inferred edges get different strokes and a text label, never colour alone", () => {
    const explicit = edgeStyle("explicit");
    const inferred = edgeStyle("inferred");
    expect(explicit.label).not.toBe(inferred.label);
    expect(explicit.dash).not.toBe(inferred.dash);
    expect(explicit.label).toMatch(/link/i);
    expect(inferred.label).toMatch(/inferred/i);
  });
});

describe("wordsAt", () => {
  it("[C25] at rest the words join back to the stop's own text", () => {
    for (const trace of withStops) {
      const stops = scrubberStops(trace);
      stops.forEach((stop, i) => {
        expect(wordsAt(trace, stops, i).map((w) => w.text).join(" ")).toBe(stop.text);
      });
    }
  });

  it("[C5] words new at the newer side of a hop are marked changed", () => {
    const trace = byId("sample-rich");
    const stops = scrubberStops(trace);
    const atChild = stops.findIndex((s, i) => stops[i + 1]?.edgeId === trace.redHopEdgeId);
    expect(wordsAt(trace, stops, atChild).some((w) => w.changed)).toBe(true);
  });
});

describe("dateToX", () => {
  it("puts now on the right and the past on the left", () => {
    const trace: Trace = byId("sample-rich");
    expect(dateToX(trace, "2019-12-15")).toBeCloseTo(0, 5);
    expect(dateToX(trace, "2023-03-01")).toBeCloseTo(1, 5);
    expect(dateToX(trace, "2021-06-01")).toBeGreaterThan(dateToX(trace, "2020-02-10"));
  });
});
