import { Trace } from "pz/schema";
import { outcomeOf } from "./claimBox.ts";
declare const __PZ_REPLAY_ONLY__: boolean;
export const PAUSED = "Live tracing is paused. Here are recorded traces.";
export const STAGE_LABELS: Record<string, string> = { intake: "Starting", fingerprint: "Understanding the claim", walk: "Searching", spans: "Reading pages", dating: "Dating pages", clusters: "Grouping pages", readouts: "Comparing wording", card: "Deciding" };
export function liveStageLabel(stage: string, active: string | null, pages: number): string {
  return stage === "walk" && active === "walk" && pages > 0 ? "Searching and reading pages" : STAGE_LABELS[stage] ?? stage;
}
// "live": the server runs live traces. "paused": a live server is there but says no (cap, kill switch, not configured), so
// the page says live tracing is paused. "absent": no live server at all (the replay-only Pages site), so nothing is said.
export type LiveMode = "live" | "paused" | "absent";
export async function liveAvailability(transport: typeof fetch = fetch): Promise<{ mode: LiveMode; reason?: string }> {
  if (typeof __PZ_REPLAY_ONLY__ !== "undefined" && __PZ_REPLAY_ONLY__) return { mode: "absent" };
  try { const response = await transport("/api/status", { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { mode: "absent" };
    const body = await response.json() as { live?: unknown; reason?: string };
    if (typeof body.live !== "boolean") return { mode: "absent" };
    return { mode: body.live ? "live" : "paused", reason: body.reason };
  } catch { return { mode: "absent" }; }
}
export async function liveMode(transport: typeof fetch = fetch): Promise<LiveMode> {
  return (await liveAvailability(transport)).mode;
}
export type LiveProgress = { type: "stage"; stage: string; status: "started" | "completed" } | { type: "progress"; pages: number; hosts: string[] };
export const LIVE_ENDINGS: Record<string, string> = {
  rate_limit: "Too many traces. Try again later.",
  cap: "The live tracing budget has been reached.",
  disabled: "Live tracing is paused.",
  not_configured: "Live tracing is paused.",
  time_limit: "The trace reached its time limit.",
  trace_failed: "The trace could not finish.",
};
export class LiveError extends Error {
  constructor(public code: string) { super(LIVE_ENDINGS[code] ?? LIVE_ENDINGS.trace_failed); }
}
export async function liveStatus(transport: typeof fetch = fetch): Promise<boolean> {
  return (await liveMode(transport)) === "live";
}
export function liveAction(text: string, traces: Trace[], live: boolean) {
  const outcome = outcomeOf(text, traces, 0);
  return outcome.kind === "open" ? "replay" : outcome.kind === "untraced" && live ? "live" : "off";
}
export async function streamTrace(claim: string, signal: AbortSignal, progress: (event: LiveProgress) => void, transport: typeof fetch = fetch): Promise<Trace> {
  if (typeof __PZ_REPLAY_ONLY__ !== "undefined" && __PZ_REPLAY_ONLY__) throw new Error(PAUSED);
  const response = await transport("/api/trace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claim }), signal });
  if (!response.ok) {
    let code = response.status === 429 ? "rate_limit" : "trace_failed";
    try { const body = await response.json(); if (response.status !== 429 && typeof body.code === "string") code = body.code; } catch { /* Use the status fallback. */ }
    throw new LiveError(code);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The trace could not finish.");
  const decoder = new TextDecoder(); let buffer = ""; let result: Trace | undefined;
  function line(text: string) {
    if (!text.trim()) return;
    const event = JSON.parse(text) as { type: string; stage?: string; status?: string; pages?: number; hosts?: unknown; trace?: unknown; code?: string };
    if (event.type === "error") throw new LiveError(event.code ?? "trace_failed");
    if (event.type === "stage" && event.stage && Object.hasOwn(STAGE_LABELS, event.stage) && (event.status === "started" || event.status === "completed"))
      progress({ type: "stage", stage: event.stage, status: event.status });
    if (event.type === "progress" && Number.isSafeInteger(event.pages) && event.pages! >= 0 && Array.isArray(event.hosts))
      progress({ type: "progress", pages: event.pages!, hosts: event.hosts.filter((host): host is string => typeof host === "string" && /^[a-z0-9.-]+$/i.test(host)).slice(-3) });
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
