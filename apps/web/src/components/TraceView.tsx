import { useCallback, useEffect, useMemo, useState } from "react";
import type { Trace } from "pz/schema";
import { hopInto, readoutsHead, redStop } from "../model/hop.ts";
import { scrubberStops, stopNote } from "../model/scrubber.ts";
import { ModeBadge } from "./ModeBadge.tsx";
import { Scrubber, stopXs, xAt } from "./Scrubber.tsx";
import { Sentence } from "./Sentence.tsx";
import { StopCard } from "./StopCard.tsx";
import { TimeField } from "./TimeField.tsx";
import { TraceGraph } from "./TraceGraph.tsx";
import { ReplayAgain, ReplayRail, useReplay } from "./WalkReplay.tsx";

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

const monthYear = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const when = (date: string | null) => (date ? monthYear.format(new Date(date)) : "Undated");

export function TraceView({ trace }: { trace: Trace }) {
  const stops = useMemo(() => scrubberStops(trace), [trace]);
  const reducedMotion = useReducedMotion();
  const [position, setPosition] = useState(0);
  const [open, setOpen] = useState(0);
  useEffect(() => {
    setPosition(0);
    setOpen(0);
  }, [trace.id]);

  const settle = useCallback((i: number) => {
    setPosition(i);
    setOpen(i);
  }, []);
  const replay = useReplay(trace, stops.length, reducedMotion, setPosition, settle);
  const counts = replay.frame ?? trace.roots;
  const hop = stops[open];
  const note = hop ? stopNote(trace, stops, open) : null;
  const red = useMemo(() => redStop(trace, stops), [trace, stops]);
  const into = hop ? hopInto(trace, stops, open) : null;
  const x = stops.length > 0 ? xAt(stopXs(trace, stops), position) : 1;

  return (
    <>
      <TimeField x={x} />
      <div className="card stage">
        <div className="stage-head">
          <ModeBadge trace={trace} />
          <ReplayAgain replay={replay} />
          <p className="counter">
            <b>{counts.pages}</b> {counts.pages === 1 ? "page" : "pages"} <span aria-hidden="true">·</span> <b>{counts.clusters}</b>{" "}
            {counts.clusters === 1 ? "cluster" : "clusters"}
          </p>
        </div>
        <ReplayRail trace={trace} replay={replay} />
        {stops.length === 0 ? (
          <>
            <p className="quote sentence">{trace.viralSentence}</p>
            <p className="hop-note">No page with the claim's wording to step through.</p>
          </>
        ) : (
          <>
            <Sentence trace={trace} stops={stops} position={position} />
            <TraceGraph trace={trace} activeSpanId={replay.frame ? null : hop?.spanId ?? null} x={x} landed={replay.frame?.nodeIds ?? null} />
            <Scrubber trace={trace} stops={stops} position={position} reducedMotion={reducedMotion} red={red} onMove={setPosition} onSettle={settle} />
            {hop && note && !replay.frame && (
              <section className="hop-detail" aria-label="The page at this stop">
                <p className="hop-when">
                  {when(hop.date)}
                  {open === red && <span className="red-tag">Wording changed here</span>}
                </p>
                <p className="hop-page">
                  <span className="hop-name">{new URL(hop.url).hostname}</span>
                  <span className="pill">{hop.tier} match</span>
                </p>
                <p className="hop-note">
                  {note.earliest ? "Earliest page we found. " : ""}
                  {note.via?.kind === "explicit" && `${note.via.label} links to this page (${note.via.date ?? "undated"}). `}
                  {note.via?.kind === "inferred" && `Inferred as the source for ${note.via.label} (${note.via.date ?? "undated"}) by date; no link. `}
                  {hop.unsure && "One readout on this hop is unsure. "}
                  <a href={hop.url} target="_blank" rel="noreferrer">Open the page</a>
                </p>
                {into && (
                  <div className="readouts">
                    <p className="readouts-head">{readoutsHead(into)}</p>
                    {into.chips.length > 0 && (
                      <ul className="readout-list" key={`${trace.id}-${open}`}>
                        {into.chips.map((c, n) => (
                          <li key={c.id} className={`readout ${c.tone}${c.disputed ? " disputed" : ""}`} style={{ ["--i" as string]: n }}>
                            <span className="readout-label">{c.label}</span>
                            <span className="readout-tag">{c.tag}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            )}
          </>
        )}
        {/* The ending closes the stage: the card replaces the old one-line footnote (T85). */}
        {!replay.frame && <StopCard trace={trace} />}
      </div>
    </>
  );
}
