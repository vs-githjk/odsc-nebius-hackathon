import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Trace } from "pz/schema";
import { badgeFor } from "../components/badge.ts";
import { loadTraces, parseTraces } from "./loadTraces.ts";

describe("loadTraces", () => {
  it("[C14] every fixture loads and parses with the Trace schema", () => {
    const { traces, errors } = loadTraces();
    expect(errors).toEqual([]);
    expect(traces.filter((t) => t.synthetic).map((t) => t.id).sort()).toEqual([
      "sample-cold-unread", "sample-conflicting", "sample-no-pages", "sample-origin", "sample-partial", "sample-rich", "sample-tool-failed",
    ]);
  });

  it("loads every recorded E2 trace in eval/dev-traces, and none of the failed-run error files", () => {
    const dir = fileURLToPath(new URL("../../../../eval/dev-traces/", import.meta.url));
    const recorded = readdirSync(dir).filter((f) => /^dev-\d{2}\.json$/.test(f)).map((f) => f.replace(".json", "")).sort();
    expect(recorded.length).toBeGreaterThan(0);
    const real = loadTraces().traces.filter((t) => !t.synthetic);
    expect(real.map((t) => t.id).sort()).toEqual(recorded);
  });

  it("lists real recordings first, then the samples", () => {
    const { traces } = loadTraces();
    const firstSample = traces.findIndex((t) => t.synthetic);
    expect(firstSample).toBeGreaterThan(0);
    expect(traces.slice(firstSample).every((t) => t.synthetic)).toBe(true);
  });

  it("a recorded trace reads REPLAY with its recorded date, never LIVE; a sample reads SAMPLE", () => {
    const { traces } = loadTraces();
    for (const t of traces.filter((x) => !x.synthetic)) {
      expect(badgeFor(t)).toEqual({ label: "REPLAY", note: expect.stringMatching(/^recorded [A-Z][a-z]{2} \d{1,2}, 2026$/) });
    }
    for (const t of traces.filter((x) => x.synthetic)) expect(badgeFor(t).label).toBe("SAMPLE");

  });

  it("reads recorded traces from traces/ and traces/gallery/ beside the samples, and sorts real traces first", () => {
    const real = { ...loadTraces().traces[0]!, id: "live-x", synthetic: false };
    const { traces } = parseTraces({ "/f/fixtures/traces/sample-a.json": { ...real, id: "sample-a", synthetic: true }, "/f/traces/gallery/live-x.json": real });
    expect(traces.map((t) => t.id)).toEqual(["live-x", "sample-a"]);
  });

  it("a file that fails the schema becomes a plain error, not a trace", () => {
    const { traces, errors } = parseTraces({ "/x/broken.json": { id: "broken" } });
    expect(traces).toEqual([]);
    expect(errors).toEqual([{ file: "broken.json", message: expect.stringMatching(/does not match the trace format/) }]);
  });
});

describe("ModeBadge", () => {
  const sample = loadTraces().traces.find((t) => t.synthetic)!;

  it("[C14] a synthetic trace reads SAMPLE", () => {
    expect(badgeFor(sample)).toEqual({ label: "SAMPLE", note: "example data" });
  });

  it("[C14] a synthetic trace can never read LIVE or REPLAY, whatever its mode says", () => {
    for (const mode of ["LIVE", "REPLAY"] as const) {
      expect(badgeFor({ ...sample, mode }).label).toBe("SAMPLE");
    }
  });

  it("[C14] a REPLAY trace shows its recorded date", () => {
    const replay: Trace = { ...sample, synthetic: false, mode: "REPLAY", recordedAt: "2026-11-02T18:35:00Z" };
    expect(badgeFor(replay)).toEqual({ label: "REPLAY", note: "recorded Nov 2, 2026" });
  });

  it("[C14] a real LIVE trace reads LIVE, with the date it was recorded, since the web only shows recordings", () => {
    expect(badgeFor({ ...sample, synthetic: false, mode: "LIVE", recordedAt: "2026-11-17T21:05:00Z" })).toEqual({ label: "LIVE", note: "recorded Nov 17, 2026" });
  });
});
