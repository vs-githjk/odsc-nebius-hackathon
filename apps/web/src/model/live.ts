import { Trace } from "pz/schema";
import { outcomeOf } from "./claimBox.ts";
declare const __PZ_REPLAY_ONLY__: boolean;
export const PAUSED = "Live tracing is paused. Here are recorded traces.";
export const STAGE_LABELS: Record<string, string> = { intake: "Starting", fingerprint: "Understanding the claim", walk: "Searching", spans: "Reading pages", dating: "Dating pages", clusters: "Grouping pages", readouts: "Comparing wording", card: "Deciding" };
// "live": the server runs live traces. "paused": a live server is there but says no (cap, kill switch, not configured), so
// the page says live tracing is paused. "absent": no live server at all (the replay-only Pages site), so nothing is said.
export type LiveMode = "live" | "paused" | "absent";
export async function liveMode(transport: typeof fetch = fetch): Promise<LiveMode> {
  if (typeof __PZ_REPLAY_ONLY__ !== "undefined" && __PZ_REPLAY_ONLY__) return "absent";
  try { const response = await transport("/api/status", { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return "absent";
    const body = await response.json() as { live?: unknown };
    if (typeof body.live !== "boolean") return "absent";
    return body.live ? "live" : "paused";
  } catch { return "absent"; }
}
export async function liveStatus(transport: typeof fetch = fetch): Promise<boolean> {
  return (await liveMode(transport)) === "live";
}
export function liveAction(text: string, traces: Trace[], live: boolean) {
  const outcome = outcomeOf(text, traces, 0);
  return outcome.kind === "open" ? "replay" : outcome.kind === "untraced" && live ? "live" : "off";
}
export async function streamTrace(claim: string, signal: AbortSignal, progress: (label: string) => void, transport: typeof fetch = fetch): Promise<Trace> {
  if (typeof __PZ_REPLAY_ONLY__ !== "undefined" && __PZ_REPLAY_ONLY__) throw new Error(PAUSED);
  const response = await transport("/api/trace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claim }), signal });
  if (!response.ok) throw new Error(response.status === 429 ? "Too many traces. Try again later." : "Live tracing is unavailable. Try a recorded trace.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The trace could not finish.");
  const decoder = new TextDecoder(); let buffer = ""; let result: Trace | undefined;
  function line(text: string) {
    if (!text.trim()) return;
    const event = JSON.parse(text) as { type: string; stage?: string; trace?: unknown; code?: string };
    if (event.type === "error") throw new Error(event.code === "time_limit" ? "The trace reached its time limit." : "The trace could not finish.");
    if (event.type === "stage") progress(STAGE_LABELS[event.stage ?? ""] ?? "Tracing");
    if (event.type === "trace") result = Trace.parse(event.trace);
  }
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf("\n")) !== -1) { line(buffer.slice(0, end)); buffer = buffer.slice(end + 1); }
    }
    line(buffer + decoder.decode());
    if (!result) throw new Error("The trace could not finish.");
    return result;
  } finally { await reader.cancel(); }
}
export function challengeTraces(traces: Trace[]): Trace[] {
  const recorded = traces.filter(t => !t.synthetic);
  const selected = [recorded.find(t => t.decision.state === "TRAIL_GOES_COLD"), recorded.find(t => (t.otherNumbers?.length ?? 0) > 0), ...recorded];
  return [...new Map(selected.filter((t): t is Trace => !!t).map(t => [t.id, t])).values()].slice(0, 4);
}
