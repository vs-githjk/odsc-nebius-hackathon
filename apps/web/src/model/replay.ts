import type { Trace } from "pz/schema";
import { endingSentence } from "./ending.ts";

// One line of the recorded walk, replayed in the log rail. A page line lands that page on the band.
export type ReplayLine = { kind: "search" | "follow" | "model" | "page" | "end"; text: string; nodeId?: string };

const monthYear = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const month = (iso: string) => monthYear.format(new Date(iso));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function searchLine(s: Trace["searchLog"][number]): ReplayLine {
  if (s.step === "follow") return { kind: "follow", text: `Followed a citation to ${host(s.query.split(" ")[0] ?? "")}.` };
  if (s.step === "model") return { kind: "model", text: "A model call failed, so this step used code-only searches." };
  const when = s.endDate ? `pages before ${month(s.endDate)}` : "no date limit";
  // A query that carries its own quotes (an exact phrase) is shown as sent; any other is quoted.
  const query = s.query.includes("\"") ? s.query : `“${s.query}”`;
  return { kind: "search", text: `Searched for ${query}, ${when}: ${plural(s.results, "result", "results")}.` };
}

// What the page line says about the page, from what the trace recorded for it, never more (XO on #4): a page that
// discusses the claim is kept off the path; otherwise the typed same_claim answer stored on the page, with its
// confidence; with no stored answer, nothing is claimed about the page at all.
export function pageVerdict(n: Trace["nodes"][number]): string | null {
  if (n.meta) return "discusses the claim, kept off the path";
  const a = n.sameClaim;
  if (!a) return null;
  const p = a.probability === null ? "" : `, ${a.probability.toFixed(2)}`;
  if (a.optionId === "yes") return `states the claim (model: yes${p})`;
  if (a.optionId === "no") return `a different claim (model: no${p})`;
  return "not confirmed (model: unsure)";
}

function pageLine(n: Trace["nodes"][number]): ReplayLine {
  const when = n.date.value ? month(n.date.value) : "undated";
  const what = pageVerdict(n);
  return { kind: "page", nodeId: n.id, text: what ? `Read ${n.domain}, ${when}: ${what}.` : `Read ${n.domain}, ${when}.` };
}

// The walk as it was recorded: each search in the order it ran, and after it the pages it reached, in the order they
// were read. A trace stores no read time per page, so a page is placed after the last search whose window still
// covers it (the walk steps back in time, one window at a time; a window ending on a date searches before it). A page
// no recorded search covers was read before them, so it lands first. An undated page goes after the first search.
// Ends with how the trace ended. Built only from stored fields, so a replay can never show what the walk did not do.
export function replayLines(trace: Trace): ReplayLine[] {
  const searches = trace.searchLog.filter((s) => s.step !== "follow" && s.step !== "model");
  const windowOf = (n: Trace["nodes"][number]) => {
    if (searches.length === 0) return -1;
    if (!n.date.value) return 0;
    let at = -1;
    searches.forEach((s, i) => {
      if (s.endDate === null || s.endDate > n.date.value!) at = i;
    });
    return at;
  };
  const pagesAfter = new Map<number, Trace["nodes"]>();
  for (const n of trace.nodes) pagesAfter.set(windowOf(n), [...(pagesAfter.get(windowOf(n)) ?? []), n]);

  const lines: ReplayLine[] = (pagesAfter.get(-1) ?? []).map(pageLine);
  let w = -1;
  for (const s of trace.searchLog) {
    lines.push(searchLine(s));
    if (s.step === "follow" || s.step === "model") continue;
    w += 1;
    for (const n of pagesAfter.get(w) ?? []) lines.push(pageLine(n));
  }
  lines.push({ kind: "end", text: endingSentence(trace) });
  return lines;
}

// What the stage shows after the first `shown` lines: the pages landed so far and the counter.
export function replayFrame(trace: Trace, lines: ReplayLine[], shown: number): { nodeIds: Set<string>; pages: number; clusters: number } {
  const nodeIds = new Set(lines.slice(0, shown).flatMap((l) => (l.nodeId ? [l.nodeId] : [])));
  const landed = trace.nodes.filter((n) => nodeIds.has(n.id) && !n.meta);
  return { nodeIds, pages: landed.length, clusters: new Set(landed.map((n) => n.clusterId)).size };
}

// How long each line holds, in ms. A long walk is sped up so the whole replay fits in about seven seconds.
export function lineMs(lines: ReplayLine[]): number {
  return Math.round(Math.min(420, 7000 / Math.max(1, lines.length)));
}

// The recorded walk's own length, for the rail's footer: "The walk took 41 seconds."; null when it was not timed.
export function walkTook(trace: Trace): string | null {
  const s = Math.round(trace.budget.ms / 1000);
  if (s <= 0) return null;
  return s < 120 ? `The walk took ${plural(s, "second", "seconds")}.` : `The walk took ${plural(Math.round(s / 60), "minute", "minutes")}.`;
}

// The replay's state machine, pure so it is tested without a DOM (XO on #186). The hook only adds timers.
export type ReplayPhase = "lines" | "walk" | "done";

// Autoplay once per trace per visit, never under reduced motion.
export const autoplays = (seenBefore: boolean, reducedMotion: boolean) => !seenBefore && !reducedMotion;

// "Replay the walk": play from the first line, or under reduced motion jump straight to the end (DESIGN.md: motion never
// delays a result).
export const startPhase = (reducedMotion: boolean): ReplayPhase => (reducedMotion ? "done" : "lines");

// One tick of the rail: the next line, or once every line is shown, the handle's walk to the earliest page.
export function afterTick(shown: number, total: number): { phase: ReplayPhase; shown: number } {
  return shown >= total ? { phase: "walk", shown } : { phase: "lines", shown: shown + 1 };
}

const recordedDay = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

// The rail's header. Invented samples never claim a recorded walk or a duration (XO on #186).
export function railHead(trace: Trace): { title: string; sub: string } {
  if (trace.synthetic || trace.mode === "SAMPLE") return { title: "Sample walk, made-up data", sub: "Shown step by step from the sample trace." };
  const took = walkTook(trace);
  return {
    title: "Replaying the recorded walk",
    sub: `Recorded ${recordedDay.format(new Date(trace.recordedAt))}.${took ? ` ${took}` : ""} Shown faster.`,
  };
}
