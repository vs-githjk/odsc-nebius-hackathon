import type { Trace } from "pz/schema";
import { sampleRows, type SampleRow } from "./sampleRow.ts";

// The #/traces list: recorded runs and invented examples kept apart, narrowed by an ending and a search.
export type ListFilter = { ending: string | null; query: string };
export type TraceList = { recorded: SampleRow[]; examples: SampleRow[] };

// Every ending that at least one trace has, with how many, most common first.
export function endingCounts(rows: SampleRow[]): { ending: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.ending, (counts.get(r.ending) ?? 0) + 1);
  return [...counts].map(([ending, count]) => ({ ending, count })).sort((a, b) => b.count - a.count || a.ending.localeCompare(b.ending));
}

// A search matches when every word in it appears in the claim (as asked, or as its newest page words it) or the id,
// ignoring case and punctuation, so "plastic 2050" finds "By 2050 there will be more plastic than fish".
const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}%.]+/gu, " ");

export function matches(row: SampleRow, trace: Trace | undefined, f: ListFilter): boolean {
  if (f.ending && row.ending !== f.ending) return false;
  const words = fold(f.query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold([row.wording, trace?.claim.text ?? "", row.id].join(" "));
  return words.every((w) => hay.includes(w));
}

export function traceList(traces: Trace[], f: ListFilter): TraceList {
  const byId = new Map(traces.map((t) => [t.id, t]));
  const keep = (rows: SampleRow[]) => rows.filter((r) => matches(r, byId.get(r.id), f));
  return {
    recorded: keep(sampleRows(traces.filter((t) => !t.synthetic))),
    examples: keep(sampleRows(traces.filter((t) => t.synthetic))),
  };
}
