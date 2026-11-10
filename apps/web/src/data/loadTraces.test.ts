import { describe, expect, it } from "vitest";
import type { Trace } from "pz/schema";
import { badgeFor } from "../components/badge.ts";
import { loadTraces, parseTraces } from "./loadTraces.ts";

describe("loadTraces", () => {
  it("[C14] every fixture loads and parses with the Trace schema", () => {
    const { traces, errors } = loadTraces();
    expect(errors).toEqual([]);
    expect(traces.map((t) => t.id).sort()).toEqual([
      "sample-cold-unread", "sample-conflicting", "sample-no-pages", "sample-origin", "sample-partial", "sample-rich", "sample-tool-failed",
    ]);
  });

  it("a file that fails the schema becomes a plain error, not a trace", () => {
    const { traces, errors } = parseTraces({ "/x/broken.json": { id: "broken" } });
    expect(traces).toEqual([]);
    expect(errors).toEqual([{ file: "broken.json", message: expect.stringMatching(/does not match the trace format/) }]);
  });
});

describe("ModeBadge", () => {
  const sample = loadTraces().traces[0]!;

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

  it("[C14] a real LIVE trace reads LIVE", () => {
    expect(badgeFor({ ...sample, synthetic: false, mode: "LIVE" }).label).toBe("LIVE");
  });
});
