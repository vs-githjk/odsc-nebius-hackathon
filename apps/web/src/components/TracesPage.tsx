import { useState } from "react";
import type { Trace } from "pz/schema";
import type { LoadError } from "../data/loadTraces.ts";
import { rowFacts, sampleRows, type SampleRow } from "../model/sampleRow.ts";
import { endingCounts, traceList } from "../model/traceList.ts";
import { ModeBadge } from "./ModeBadge.tsx";

function Rows({ rows, traces }: { rows: SampleRow[]; traces: Trace[] }) {
  return (
    <ul className="tl-rows">
      {rows.map((row) => {
        const [ending, reach, pages] = rowFacts(row);
        const trace = traces.find((t) => t.id === row.id)!;
        return (
          <li key={row.id}>
            <a className="tl-row" href={`#/t/${encodeURIComponent(row.id)}`}>
              <span className="tl-claim">{row.wording}</span>
              <span className="tl-facts">
                <span className="tl-ending">
                  <i className={row.tone ? "ramp-dot" : "ramp-dot empty"} style={row.tone ? { ["--tone" as string]: row.tone } : undefined} aria-hidden="true" />
                  {ending}
                </span>
                <span>{reach}</span>
                <span>{pages}</span>
                <ModeBadge trace={trace} />
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function TracesPage({ traces, errors }: { traces: Trace[]; errors: LoadError[] }) {
  const [query, setQuery] = useState("");
  const [ending, setEnding] = useState<string | null>(null);
  // The counts are recorded runs only, so an invented example never inflates an ending (XO on #307). Every ending that
  // any trace has stays a filter, so the examples can still be found by their ending.
  const recorded = traces.filter((t) => !t.synthetic);
  const recordedCounts = new Map(endingCounts(sampleRows(recorded)).map((c) => [c.ending, c.count]));
  const counts = endingCounts(sampleRows(traces)).map((c) => ({ ending: c.ending, count: recordedCounts.get(c.ending) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.ending.localeCompare(b.ending));
  const list = traceList(traces, { ending, query });
  const shown = list.recorded.length + list.examples.length;
  const filtered = ending !== null || query.trim() !== "";
  const clear = () => { setQuery(""); setEnding(null); };
  return (
    <main className="lp traces-page">
      <section className="lp-hero hw-head">
        <div className="wrap">
          <h1 tabIndex={-1} className="lp-title hw-title">Recorded traces</h1>
          <p className="lead lp-lead">Every trace here opens free, replayed from its recording. <a href="#/">Trace a new claim</a>.</p>
        </div>
      </section>

      <section className="lp-section" aria-label="Find a trace">
        <div className="wrap">
          <div className="tl-controls">
            <label className="tl-search">
              <span>Search</span>
              <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="A word from the claim, or a trace id" />
            </label>
            <fieldset className="tl-endings">
              <legend>Ending</legend>
              <label className={ending === null ? "on" : undefined}>
                <input type="radio" name="tl-ending" checked={ending === null} onChange={() => setEnding(null)} />
                All <span className="tl-count">{recorded.length}</span>
              </label>
              {counts.map((c) => (
                <label key={c.ending} className={ending === c.ending ? "on" : undefined}>
                  <input type="radio" name="tl-ending" checked={ending === c.ending} onChange={() => setEnding(c.ending)} />
                  {c.ending} <span className="tl-count">{c.count}</span>
                </label>
              ))}
            </fieldset>
          </div>
          <p className="meta tl-status" role="status">
            {filtered ? <>{shown} of {traces.length} traces match. <button type="button" className="tl-clear" onClick={clear}>Show all</button></> : `${recorded.length} recorded runs and ${traces.length - recorded.length} examples. Counts are recorded runs only.`}
          </p>

          {shown === 0 && <p className="tl-empty">No trace matches. Try another word, or <button type="button" className="tl-clear" onClick={clear}>show all traces</button>.</p>}

          {list.recorded.length > 0 && (
            <section aria-labelledby="tl-recorded" className="tl-group">
              <h2 id="tl-recorded" className="lp-h3">Recorded runs <span className="tl-count">{list.recorded.length}</span></h2>
              <p className="meta">Live runs on our dev claims, replayed from the recording. Each is labelled REPLAY with the date it ran.</p>
              <Rows rows={list.recorded} traces={traces} />
            </section>
          )}

          {list.examples.length > 0 && (
            <section aria-labelledby="tl-examples" className="tl-group">
              <h2 id="tl-examples" className="lp-h3">Examples <span className="tl-count">{list.examples.length}</span></h2>
              <p className="meta">Invented claims on invented pages, one for each kind of ending, so you can see them all. Each is labelled SAMPLE. None of them is a real trace.</p>
              <Rows rows={list.examples} traces={traces} />
            </section>
          )}

          {errors.map((e) => <p key={e.file} className="error" role="alert">{e.message}</p>)}
        </div>
      </section>
    </main>
  );
}
