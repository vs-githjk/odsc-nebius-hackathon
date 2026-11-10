import { useEffect, useState } from "react";
import type { Trace } from "pz/schema";
import { ModeBadge } from "./components/ModeBadge.tsx";
import { TraceView } from "./components/TraceView.tsx";
import { loadTraces } from "./data/loadTraces.ts";
import { endingSentence } from "./model/ending.ts";
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

const stateLabel = (trace: Trace) => trace.decision.state.replace(/_/g, " ");
const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

const sharedClaim = traces.length > 0 && traces.every((t) => t.claim.text === traces[0]!.claim.text) ? traces[0]!.claim.text : null;

function Start() {
  return (
    <main className="wrap section stack">
      {sharedClaim ? (
        <h1 className="hero-quote">{`“${sharedClaim}”`}</h1>
      ) : (
        <h1 className="k">Where did this number start?</h1>
      )}
      <p className="lead">Patient Zero walks a claim back through time to the earliest page it can find, and shows every step.</p>
      <label className="field">
        <input className="input" type="text" placeholder="Paste a statistic or a quote" aria-describedby="live-note" disabled />
        <span id="live-note" className="meta field-note">Live traces arrive with the engine; samples below.</span>
      </label>
      <section aria-labelledby="samples-heading">
        <div className="samples-head">
          <h2 id="samples-heading">Samples</h2>
          {traces.every((t) => t.synthetic) && <span className="meta">Example data: an invented claim on invented pages.</span>}
        </div>
        <ul className="samples">
          {traces.map((trace) => (
            <li key={trace.id}>
              <a className="sample" href={`#/t/${encodeURIComponent(trace.id)}`}>
                <span className="sample-state">{sentenceCase(stateLabel(trace))}</span>
                <span className="meta">
                  {endingSentence(trace)} {trace.roots.pages} {trace.roots.pages === 1 ? "page" : "pages"}.
                </span>
                {!trace.synthetic && <ModeBadge trace={trace} />}
              </a>
            </li>
          ))}
        </ul>
      </section>
      {errors.map((e) => (
        <p key={e.file} className="error" role="alert">{e.message}</p>
      ))}
    </main>
  );
}

function TraceRoute({ id }: { id: string }) {
  const trace = traces.find((t) => t.id === id);
  return (
    <main className="wrap trace-page">
      <a className="back" href="#/">Back to the samples</a>
      {trace ? <TraceView trace={trace} /> : <p className="error" role="alert">No trace called {id}.</p>}
    </main>
  );
}

export function App() {
  const route = useRoute();
  return (
    <>
      <nav className="nav" aria-label="Main">
        <div className="wrap">
          <a className="wordmark" href="#/">
            <span className="wordmark-ring" aria-hidden="true" />
            Patient Zero
          </a>
          <a className="btn small" href="#/">Trace a claim</a>
        </div>
      </nav>
      {route.name === "trace" ? <TraceRoute id={route.id} /> : <Start />}
    </>
  );
}
