import { useEffect, useState } from "react";
import { ModeBadge } from "./components/ModeBadge.tsx";
import { TraceView } from "./components/TraceView.tsx";
import { loadTraces } from "./data/loadTraces.ts";
import { rowFacts, sampleRows } from "./model/sampleRow.ts";
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
        <span id="live-note" className="meta field-note">Recorded traces from our live runs and invented samples below.</span>
      </label>
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
