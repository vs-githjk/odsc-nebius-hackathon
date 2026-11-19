import { useCallback, useEffect, useMemo, useState } from "react";
import { traceCost } from "../../../../packages/pz/src/usage/cost.ts";
import type { Trace } from "pz/schema";
import { redStop } from "../model/hop.ts";
import { dateEvidence, possibleVariants, whatChanged } from "../model/receipt.ts";
import { scrubberStops, stopNote } from "../model/scrubber.ts";
import { independence, independenceLine } from "pz/headline";
import { ModeBadge } from "./ModeBadge.tsx";
import { Scrubber, stopXs, xAt } from "./Scrubber.tsx";
import { Sentence } from "./Sentence.tsx";
import { StopCard } from "./StopCard.tsx";
import { RecentTraces } from "./RecentTraces.tsx";
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
const when = (date: string | null, precision?: "day" | "month" | "year") => (date ? (precision === "year" ? date.slice(0, 4) : monthYear.format(new Date(date))) : "Undated");

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
  const change = whatChanged(trace, stops, open);
  const span = trace.spans.find(s => s.id === hop?.spanId);
  const node = trace.nodes.find(n => n.id === span?.nodeId);
  const dating = node ? dateEvidence(node, span) : null;
  const roots = independence(trace);
  const variants = possibleVariants(trace);
  const x = stops.length > 0 ? xAt(stopXs(trace, stops), position) : 1;

  return (
    <>
      <TimeField x={x} />
      <div className="card stage">
        <div className="stage-head">
          <ModeBadge trace={trace} />
          <ReplayAgain replay={replay} />
          {(trace.mode === "LIVE" || (trace.mode === "REPLAY" && trace.usage.length > 0)) &&
            <span className="meta trace-cost">{trace.mode === "LIVE" ? <>Cost ${traceCost(trace).totalUsd.toFixed(3)} ({trace.budget.credits} Tavily credits)</> : <>Recorded run cost ${traceCost(trace).totalUsd.toFixed(3)}</>}</span>}
        </div>
        <h1 tabIndex={-1} className="quote trace-claim">{trace.claim.text}</h1>
        <StopCard trace={trace} />
        <button type="button" className="roots-summary" onClick={() => { const section = document.getElementById("copies-and-roots"); section?.scrollIntoView({ behavior: "instant", block: "start" }); section?.focus({ preventScroll: true }); }}>
          <span>{independenceLine(trace)}</span>
          <span className="root-dots" aria-hidden="true">
            {Array.from({ length: roots.independentRoots }, (_, i) => <i className="root-dot" key={`root-${i}`} />)}
            {Array.from({ length: roots.copies }, (_, i) => <i className="root-dot hollow" key={`copy-${i}`} />)}
          </span>
          <span className="meta">Copies and roots ↓</span>
        </button>
        <section className="trace-timeline" aria-label="Timeline of pages">
          <h2 className="trace-section-title">Follow the wording</h2>
          <p className="meta">Step back through the pages and compare their words.</p>
          {stops.length === 0 ? (
            <p className="hop-note">No page with the claim's wording to step through.</p>
          ) : (
            <div className="evidence-receipt">
              <p className="meta receipt-heading">Words on this page</p>
              <Sentence trace={trace} stops={stops} position={position} />
              <Scrubber trace={trace} stops={stops} position={position} reducedMotion={reducedMotion} red={red} onMove={setPosition} onSettle={settle} />
              {hop && note && !replay.frame && (
                <section className="hop-detail" aria-label="The page at this stop">
                  <p className="hop-when">
                    {when(hop.date, hop.precision)}
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
                  <dl className="receipt-rows">
                    <div><dt>How dated</dt><dd>{dating?.label ?? "Undated"}{dating?.url && <> <a href={dating.url} target="_blank" rel="noreferrer">Open the capture</a></>}</dd></div>
                    <div><dt>What changed</dt><dd>
                      <p>{change.text}</p>
                      {/* A short swap (a number, a word) reads well spelled out; a long rewrite is already marked in the sentence. */}
                      {change.earlierWords && change.laterWords && [change.earlierWords, change.laterWords].every(w => w.split(" ").length <= 6) &&
                        <p>This page says <q>{change.earlierWords}</q>; the later page says <q>{change.laterWords}</q>.</p>}
                    </dd></div>
                  </dl>
                  {variants.length > 0 && <details className="receipt-variants"><summary>Other pages with possible number variants</summary><ul>{variants.map((variant, i) => <li key={i}><a href={variant.url} target="_blank" rel="noreferrer">{variant.label}</a><p>{variant.sentence}</p></li>)}</ul></details>}
                  {change.chips.length > 0 && (
                    <div className="readouts">
                      <p className="readouts-head">Checks on the change toward the later page</p>
                      {change.chips.length > 0 && (
                        <ul className="readout-list" key={`${trace.id}-${open}`}>
                          {change.chips.map((c, n) => (
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
            </div>
          )}
        </section>
        <section id="copies-and-roots" tabIndex={-1} className="trace-roots" aria-label="Copies and roots">
          <h2 className="trace-section-title">Copies and roots</h2>
          <p className="roots-explanation">An independent root is a group of copies with no verified link to an earlier page; every other page is a copy.</p>
          <p className="counter">
            <b>{counts.pages}</b> {counts.pages === 1 ? "page" : "pages"}{" · "}
            <b>{counts.clusters}</b> {counts.clusters === 1 ? "cluster" : "clusters"}
          </p>
          <ReplayRail trace={trace} replay={replay} />
          <TraceGraph trace={trace} activeSpanId={replay.frame ? null : hop?.spanId ?? null} x={x} landed={replay.frame?.nodeIds ?? null} />
        </section>
      </div>
      <RecentTraces trace={trace} />
    </>
  );
}
