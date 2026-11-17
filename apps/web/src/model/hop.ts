import type { Readout, Trace } from "pz/schema";
import type { Stop, Word } from "./scrubber.ts";

const LABELS: Record<Readout["id"], string> = {
  number_changed: "Number changed",
  unit_changed: "Unit changed",
  hedge_dropped: "Hedge dropped",
  comparison_added: "Comparison added",
  scope_widened: "Scope widened",
  attribution_shifted: "Attribution shifted",
  context_stripped: "Context stripped",
};

// One readout that fired on a hop. An unsure readout is drawn neutral, never as a change.
export type Chip = { id: Readout["id"]; label: string; tag: string; tone: "changed" | "unsure"; disputed: boolean };
export type HopView = { edgeId: string; red: boolean; chips: Chip[] };

const percent = (p: number | null) => (p === null ? "" : `, ${Math.round(p * 100)}%`);

function chip(r: Readout): Chip {
  const how = r.value === "unsure" ? "unsure" : r.source === "measured" ? "measured" : "inferred";
  const tag = `${how}${r.source === "inferred" ? percent(r.probability) : ""}${r.disputed ? ", disputed" : ""}`;
  return { id: r.id, label: LABELS[r.id], tag, tone: r.value === "unsure" ? "unsure" : "changed", disputed: r.disputed };
}

// The hop that carried the wording from the older stop i + 1 to stop i, with the readouts that fired on it.
// Null on the earliest stop, or when the older stop was not reached from this one's span.
export function hopInto(trace: Trace, stops: Stop[], i: number): HopView | null {
  const stop = stops[i];
  const edge = trace.edges.find((e) => e.id === stops[i + 1]?.edgeId);
  if (!stop || !edge || edge.childSpanId !== stop.spanId) return null;
  const hop = trace.hops.find((h) => h.edgeId === edge.id);
  const chips = (hop?.readouts ?? []).filter((r) => r.value !== "no").map(chip);
  return { edgeId: edge.id, red: edge.id === trace.redHopEdgeId, chips };
}

// The stop where the wording changed on the red hop, or -1 when the trace has none on the scrubber's path.
export function redStop(trace: Trace, stops: Stop[]): number {
  if (trace.redHopEdgeId === null) return -1;
  return stops.findIndex((_, i) => hopInto(trace, stops, i)?.red === true);
}

// Neighbouring words with the same mark joined, so a changed phrase reads as one run, not one box per word.
export function runs(words: Word[]): Word[] {
  const out: Word[] = [];
  for (const w of words) {
    const last = out[out.length - 1];
    if (last && last.changed === w.changed) last.text += ` ${w.text}`;
    else out.push({ ...w });
  }
  return out;
}
