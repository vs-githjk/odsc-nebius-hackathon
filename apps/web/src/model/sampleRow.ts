import type { Trace } from "pz/schema";
import { heat, scrubberStops } from "./scrubber.ts";

// How each ending is named on a row: a few plain words, never the state code.
export const ENDING_NAMES: Record<Trace["decision"]["state"], string> = {
  TOOL_FAILED: "A search service failed",
  PARTIAL: "Stopped at a limit",
  NO_PAGES_FOUND: "No pages found",
  CONFLICTING: "The earliest pages disagree",
  ORIGIN_FOUND: "Origin found",
  TRAIL_GOES_COLD: "The trail goes cold",
};

// Years back from the trace's own recording that fill the whole ramp: a page this old or older is the deepest blue.
const RAMP_YEARS = 12;

export type SampleRow = {
  id: string;
  wording: string; // the claim as the newest page we found words it, else the claim as asked
  ending: string;
  earliestYear: number | null;
  tone: string | null; // the ramp colour for how far back the trace reached; null when no page was dated
  pages: number;
  synthetic: boolean;
};

export function sampleRow(trace: Trace): SampleRow {
  const dates = trace.earliest.nodeIds
    .map((id) => trace.nodes.find((n) => n.id === id)?.date.value)
    .filter((d): d is string => Boolean(d))
    .sort();
  const earliest = dates[0] ?? null;
  const yearsBack = earliest ? (Date.parse(trace.recordedAt) - Date.parse(earliest)) / (365.25 * 864e5) : null;
  return {
    id: trace.id,
    wording: scrubberStops(trace)[0]?.text ?? trace.claim.text,
    ending: ENDING_NAMES[trace.decision.state],
    earliestYear: earliest ? Number(earliest.slice(0, 4)) : null,
    tone: yearsBack === null ? null : heat(1 - Math.min(1, Math.max(0, yearsBack / RAMP_YEARS))),
    pages: trace.roots.pages,
    synthetic: trace.synthetic,
  };
}

// The rows with the most to show come first: more pages, then reaching further back, then by id so the order is stable.
export function sampleRows(traces: Trace[]): SampleRow[] {
  return traces
    .map(sampleRow)
    .sort((a, b) => b.pages - a.pages || (a.earliestYear ?? 9999) - (b.earliestYear ?? 9999) || a.id.localeCompare(b.id));
}

// The facts under a row's wording, in order: the ending, how far back it reached, how many pages.
export function rowFacts(row: SampleRow): string[] {
  return [row.ending, row.earliestYear === null ? "No dated page" : `Back to ${row.earliestYear}`, row.pages === 1 ? "1 page" : `${row.pages} pages`];
}
