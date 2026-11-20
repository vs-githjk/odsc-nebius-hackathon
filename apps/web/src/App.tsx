import { useEffect, useState, type MouseEvent } from "react";
import type { Trace } from "pz/schema";
import { HowItWorks } from "./components/HowItWorks.tsx";
import { TracesPage } from "./components/TracesPage.tsx";
import { NotFound, shownAddress } from "./components/NotFound.tsx";
import { AnswerPage, AnswerTrace } from "./components/AnswerPage.tsx";
import { Footer, Landing } from "./components/Landing.tsx";
import { BackToResults, RouteExperience } from "./components/RouteExperience.tsx";
import { ThemeToggle } from "./components/ThemeToggle.tsx";
import { TraceView } from "./components/TraceView.tsx";
import { loadTraces } from "./data/loadTraces.ts";
import { isPlainClick, matchedNote } from "./model/claimBox.ts";
import { navigation } from "./model/navigation.ts";
import { heroTrace } from "./model/sampleRow.ts";
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

// matched: the claim box opened a recording or sample for a pasted claim, not a fresh trace.
export function TraceRoute({ id, matched, all = traces }: { id: string; matched: boolean; all?: Trace[] }) {
  const trace = all.find((t) => t.id === id);
  if (!trace) {
    return (
      <NotFound title="No trace at this address" back={{ label: "Search the recorded traces", href: "#/traces" }}>
        <p>There is no recorded trace called <code>{shownAddress(id)}</code>. The link may be old or mistyped.</p>
      </NotFound>
    );
  }
  return (
    <main className="wrap trace-page">
      <BackToResults />
      {matched && (
        <p className="matched" role="status">
          {matchedNote(trace)}
        </p>
      )}
      <TraceView key={trace.id} trace={trace} />
    </main>
  );
}

export function App() {
  const route = useRoute();
  const [liveTraces, setLiveTraces] = useState<Trace[]>([]);
  const openLive = (trace: Trace) => {
    setLiveTraces(previous => [...previous, trace]);
    setMatchedId(null);
    navigation.liveArrival = `#/t/${encodeURIComponent(trace.id)}`;
    window.location.hash = navigation.liveArrival;
  };
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
      <RouteExperience routeKey={JSON.stringify(route)} />
      <nav className="nav" aria-label="Main">
        <div className="wrap">
          <a className="wordmark" href="#/">
            <span className="wordmark-ring" aria-hidden="true" />
            Patient Zero
          </a>
          <div className="nav-links">
          <a href="#/how">How it works</a>
          <a href="#/traces">Traces</a>
          <ThemeToggle />
          <a className="btn small" href="#/" onClick={traceAClaim}>
            Trace a claim
          </a>
          </div>
        </div>
      </nav>
      {route.name === "trace" ? (
        <TraceRoute id={route.id} matched={route.id === matchedId} all={[...traces, ...liveTraces]} />
      ) : route.name === "answer" ? (route.n === null ? <AnswerPage /> : <AnswerTrace n={route.n} />
      ) : route.name === "notFound" ? (
        <NotFound title="Nothing at this address">
          <p>Patient Zero has no page at <code>{shownAddress(route.hash)}</code>.</p>
        </NotFound>
      ) : route.name === "how" ? <HowItWorks hero={hero} /> : route.name === "traces" ? <TracesPage traces={traces} errors={errors} /> : (
        <Landing traces={traces} hero={hero} focusKey={focusKey} onMatch={setMatchedId} onLive={openLive} />
      )}
      <Footer />
    </>
  );
}
