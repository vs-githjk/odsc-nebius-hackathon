import { useEffect, useMemo, useState } from "react";
import type { Trace } from "pz/schema";
import { edgeStyle, scrubberStops } from "../model/scrubber.ts";
import { ModeBadge } from "./ModeBadge.tsx";
import { Scrubber, stopXs, xAt } from "./Scrubber.tsx";
import { Sentence } from "./Sentence.tsx";
import { TimeField } from "./TimeField.tsx";
import { TraceGraph } from "./TraceGraph.tsx";

function useReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setReduced(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

const stateLabel = (trace: Trace) => trace.decision.state.replace(/_/g, " ");

export function TraceView({ trace }: { trace: Trace }) {
  const stops = useMemo(() => scrubberStops(trace), [trace]);
  const reducedMotion = useReducedMotion();
  const [position, setPosition] = useState(0);
  const [open, setOpen] = useState(0);
  useEffect(() => {
    setPosition(0);
    setOpen(0);
  }, [trace.id]);

  const settle = (i: number) => {
    setPosition(i);
    setOpen(i);
  };
  const hop = stops[open];
  const edge = trace.edges.find((e) => e.id === hop?.edgeId);
  const x = stops.length > 0 ? xAt(stopXs(trace, stops), position) : 1;

  return (
    <div className="card stage stack">
      <TimeField x={x} />
      <div className="stage-head">
        <ModeBadge trace={trace} />
        <span className="meta">
          {trace.roots.pages} pages, {trace.roots.clusters} clusters
        </span>
      </div>
      {stops.length === 0 ? (
        <>
          <p className="quote">{trace.viralSentence}</p>
          <p className="meta">No page with the claim's wording to step through. Ends: {stateLabel(trace)}, How this was decided: row {trace.decision.row}.</p>
        </>
      ) : (
        <>
          <Sentence trace={trace} stops={stops} position={position} />
          <Scrubber trace={trace} stops={stops} position={position} reducedMotion={reducedMotion} onMove={setPosition} onSettle={settle} />
          {hop && (
            <section className="hop-open" aria-label="The page at this stop">
              <p className="hop-page">
                <a href={hop.url} target="_blank" rel="noreferrer">{new URL(hop.url).hostname}</a>
                <span className="meta">{hop.date ?? "undated"}</span>
              </p>
              <p className="chips">
                <span className="chip">verbatim, {hop.tier} match</span>
                {edge && <span className={`chip ${edge.kind}`}>{edgeStyle(edge.kind).label}</span>}
                {hop.unsure && <span className="chip">a readout is unsure</span>}
                {open === stops.length - 1 && <span className="chip">earliest page we found</span>}
              </p>
            </section>
          )}
          <TraceGraph trace={trace} activeSpanId={hop?.spanId ?? null} />
          <p className="meta">
            Ends: {stateLabel(trace)}, How this was decided: row {trace.decision.row}.
          </p>
        </>
      )}
    </div>
  );
}
