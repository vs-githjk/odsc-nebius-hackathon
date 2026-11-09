import { useEffect, useState } from "react";
import type { Trace } from "pz/schema";
import { ModeBadge } from "./components/ModeBadge.tsx";
import { loadTraces } from "./data/loadTraces.ts";
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

function Start() {
  return (
    <main className="wrap section stack">
      <h1 className="k">Where did this number start?</h1>
      <p className="lead">Paste a statistic. Patient Zero walks it back through time to the earliest page we can find, and shows every step.</p>
      <label className="stack">
        <span className="meta">Live traces arrive with the engine; samples below</span>
        <input className="input" type="text" placeholder="Paste a statistic or a quote" disabled />
      </label>
      <section aria-labelledby="samples-heading">
        <h2 id="samples-heading" className="meta">Samples</h2>
        <ul className="samples">
          {traces.map((trace) => (
            <li key={trace.id}>
              <a className="sample" href={`#/t/${encodeURIComponent(trace.id)}`}>
                <span>{trace.id}</span>
                <span className="meta">{stateLabel(trace)}</span>
                <ModeBadge trace={trace} />
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

function TraceView({ id }: { id: string }) {
  const trace = traces.find((t) => t.id === id);
  if (!trace) {
    return (
      <main className="wrap section stack">
        <p className="error" role="alert">No trace called {id}.</p>
        <a href="#/">Back to the samples</a>
      </main>
    );
  }
  return (
    <main className="wrap section stack">
      <div className="card stage stack">
        <ModeBadge trace={trace} />
        <p className="quote">{trace.viralSentence}</p>
        <div className="ramp" aria-hidden="true" />
        <p className="meta">
          {trace.roots.pages} pages, {trace.roots.clusters} clusters. Ends: {stateLabel(trace)}, How this was decided: row {trace.decision.row}.
        </p>
      </div>
      <a href="#/">Back to the samples</a>
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
          <a className="btn small" href="#/">Samples</a>
        </div>
      </nav>
      {route.name === "trace" ? <TraceView id={route.id} /> : <Start />}
    </>
  );
}
