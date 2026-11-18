import type { Trace } from "pz/schema";

export type Badge = { label: "SAMPLE" | "REPLAY" | "LIVE"; note: string | null };

const recorded = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

// Synthetic data is always SAMPLE, whatever its mode field says. The web only ever shows traces read from disk, so a
// LIVE trace here is a recording of a live run and says when it was recorded (XO on #184).
export function badgeFor(trace: Trace): Badge {
  if (trace.synthetic) return { label: "SAMPLE", note: "example data" };
  if (trace.mode === "REPLAY") return { label: "REPLAY", note: `recorded ${recorded.format(new Date(trace.recordedAt))}` };
  if (trace.mode === "LIVE") return { label: "LIVE", note: `recorded ${recorded.format(new Date(trace.recordedAt))}` };
  return { label: "SAMPLE", note: "example data" };
}
