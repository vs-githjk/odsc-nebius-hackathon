import { useEffect, useState, type MouseEvent } from "react";
import type { Trace } from "pz/schema";
import { independenceLine } from "pz/headline";
import { HowItWorks } from "./components/HowItWorks.tsx";
import { challengeTraces } from "./model/live.ts";
import { ClaimBox } from "./components/ClaimBox.tsx";
import { ModeBadge } from "./components/ModeBadge.tsx";
import { TraceView } from "./components/TraceView.tsx";
import { loadTraces } from "./data/loadTraces.ts";
import { isPlainClick, matchedNote } from "./model/claimBox.ts";
import { heroTrace, rowFacts, sampleRow, sampleRows } from "./model/sampleRow.ts";
import { parseRoute, type Route } from "./route.ts";

const { traces, errors } = loadTraces();

function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

const hero = heroTrace(traces);

// The hero is a real recorded trace when there is one: its claim, its count and how far back it went. The invented
// samples never lead; they sit under Samples.
function Hero() {
  if (!hero) return <h1 className="hero-quote">Where did this number start?</h1>;
  const row = sampleRow(hero);
  return (
    <a className="hero" href={`#/t/${encodeURIComponent(hero.id)}`}>
      <h1 className="hero-quote">{`“${hero.claim.text}”`}</h1>
      <p className="hero-count">
        {independenceLine(hero)}
        {row.earliestYear !== null && ` Back to ${row.earliestYear}.`} <span className="hero-open">See the trace</span>
      </p>
    </a>
  );
}

function Start({ focusKey, onMatch, onLive }: { focusKey: number; onMatch(id: string): void; onLive(trace: Trace): void }) {
  return (
    <main className="wrap section stack">
      <Hero />
      <p className="lead">Patient Zero walks a claim back through time to the earliest page it can find, and shows every step.</p>
      <ClaimBox traces={traces} focusKey={focusKey} onMatch={onMatch} onLive={onLive} />
      <section aria-labelledby="challenges-heading">
        <div className="samples-head">
          <h2 id="challenges-heading">Try these</h2>
          <span className="meta">Recorded traces, free to open.</span>
        </div>
        <ul className="samples challenges">
          {challengeTraces(traces).map(t => {
            const row = sampleRow(t);
            const reason = (t.otherNumbers?.length ?? 0) > 0
              ? "Another page gives a different number"
              : row.ending;
            return <li key={t.id}>
              <a className="sample" href={`#/t/${encodeURIComponent(t.id)}`}>
                <span className="sample-claim">{t.claim.text}</span>
                <span className="sample-facts">{reason}</span>
                <svg className="sample-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
              </a>
            </li>;
          })}
        </ul>
      </section>
      <section aria-labelledby="samples-heading">
        <div className="samples-head">
          <h2 id="samples-heading">Traces</h2>
          <span className="meta">
            {traces.every((t) => t.synthetic)
              ? "Example data: an invented claim on invented pages."
              : "REPLAY rows are recorded live runs on our dev claims, replayed from the recording. SAMPLE rows are invented claims on invented pages."}
          </span>
        </div>
        <ul className="samples">
          {/* Real recordings first, then the samples, each ordered by what it has to show. */}
          {[...sampleRows(traces.filter((t) => !t.synthetic)), ...sampleRows(traces.filter((t) => t.synthetic))].map((row) => {
            const [ending, reach, pages] = rowFacts(row);
            const trace = traces.find((t) => t.id === row.id)!;
            return (
              <li key={row.id}>
                <a className="sample" href={`#/t/${encodeURIComponent(row.id)}`}>
                  <span className="sample-claim">{row.wording}</span>
                  <span className="sample-facts">
                    <span className="sample-ending">
                      <i className={row.tone ? "ramp-dot" : "ramp-dot empty"} style={row.tone ? { ["--tone" as string]: row.tone } : undefined} aria-hidden="true" />
                      {ending}
                    </span>
                    <span>{reach}</span>
                    <span>{pages}</span>
                    <ModeBadge trace={trace} />
                  </span>
                  <svg className="sample-go" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </a>
              </li>
            );
          })}
        </ul>
      </section>
      {errors.map((e) => (
        <p key={e.file} className="error" role="alert">{e.message}</p>
      ))}
    </main>
  );
}

// matched: the claim box opened this trace for a pasted claim, so the page says it is a recording (or a sample), not a
// fresh trace. A real trace's way back is plain "Back": the samples are not where it came from (#192 B).
export function TraceRoute({ id, matched, all = traces }: { id: string; matched: boolean; all?: Trace[] }) {
  const trace = all.find((t) => t.id === id);
  return (
    <main className="wrap trace-page">
      <a className="back" href="#/">{trace && !trace.synthetic ? "Back" : "Back to the samples"}</a>
      {trace && matched && (
        <p className="matched" role="status">
          {matchedNote(trace)}
        </p>
      )}
      {trace ? <TraceView trace={trace} /> : <p className="error" role="alert">No trace called {id}.</p>}
    </main>
  );
}

export function App() {
  const route = useRoute();
  const [liveTraces, setLiveTraces] = useState<Trace[]>([]);
  const openLive = (trace: Trace) => { setLiveTraces(previous => [...previous, trace]); setMatchedId(null); window.location.hash = `#/t/${encodeURIComponent(trace.id)}`; };
  const [focusKey, setFocusKey] = useState(0);
  const [matchedId, setMatchedId] = useState<string | null>(null);
  // The note belongs to the arrival only: leaving the trace clears it.
  useEffect(() => {
    if (route.name !== "trace" || route.id !== matchedId) setMatchedId(null);
  }, [route]);
  // "Trace a claim" goes to the start page and puts the cursor in the claim box. A modified or middle click is left
  // to the browser (a new tab or window).
  const traceAClaim = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(e)) return;
    e.preventDefault();
    if (route.name !== "start") window.location.hash = "#/";
    setFocusKey((k) => k + 1);
  };
  return (
    <>
      <nav className="nav" aria-label="Main">
        <div className="wrap">
          <a className="wordmark" href="#/">
            <span className="wordmark-ring" aria-hidden="true" />
            Patient Zero
          </a>
          <div className="nav-links">
          <a href="#/how">How it works</a>
          <a className="btn small" href="#/" onClick={traceAClaim}>
            Trace a claim
          </a>
          </div>
        </div>
      </nav>
      {route.name === "trace" ? (
        <TraceRoute id={route.id} matched={route.id === matchedId} all={[...traces, ...liveTraces]} />
      ) : route.name === "how" ? <HowItWorks /> : (
        <Start focusKey={focusKey} onMatch={setMatchedId} onLive={openLive} />
      )}
    </>
  );
}
