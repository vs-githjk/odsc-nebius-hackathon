import type { ReactNode } from "react";
import type { Trace } from "pz/schema";
import { independence } from "pz/headline";
import { ENDING_NAMES } from "../model/sampleRow.ts";
import { scrubberStops } from "../model/scrubber.ts";
import { stopCard } from "../model/stopCard.ts";
import { dateSource, domainOf, when } from "./Landing.tsx";

const explanations = {
  ORIGIN_FOUND: "The earliest page we found meets the origin rules. This does not establish the first use anywhere.",
  CONFLICTING: "The earliest pages disagree, so the trace cannot name one origin.",
  TRAIL_GOES_COLD: "We found the claim, but could not link it further back. A source may be in print, behind a paywall, missing or uncited.",
  PARTIAL: "A time, search or spending limit stopped the trace before it finished.",
  TOOL_FAILED: "A needed search service failed. The trace keeps the evidence gathered so far.",
  NO_PAGES_FOUND: "The searches found no usable pages for this claim.",
};

const shows = [
  { title: "The ending", body: "Where the trace stopped, and why, in one sentence." },
  { title: "Follow the wording", body: "The exact sentence on each page, oldest to newest, with what changed between them." },
  { title: "Copies and roots", body: "Which pages copy another and which stand on their own." },
];

function Step({ n, title, children, example }: { n: string; title: string; children: ReactNode; example: ReactNode }) {
  return (
    <li className="hw-step">
      <div>
        <h3><span className="lp-step-n">{n}</span>{title}</h3>
        <p>{children}</p>
      </div>
      {example && <p className="hw-example">{example}</p>}
    </li>
  );
}

// What each step did on one real recorded trace, read from the trace itself.
function examples(trace: Trace | null) {
  if (!trace) return { search: null, date: null, roots: null, end: null };
  const stops = scrubberStops(trace);
  const newest = stops[0];
  const oldest = stops[stops.length - 1];
  const { pages, independentRoots, copies } = independence(trace);
  const card = stopCard(trace);
  const label = <span className="hw-example-label">On a recorded trace:</span>;
  return {
    search: newest?.date && oldest?.date
      ? <>{label} {stops.length} stops on the way back, from {newest.date.slice(0, 4)} to {oldest.date.slice(0, 4)}.</>
      : null,
    date: oldest
      ? <>{label} the earliest page, {domainOf(oldest.url)}, is dated {when(oldest.date, oldest.precision)}: {dateSource(trace, oldest.url)}.</>
      : null,
    roots: <>{label} {pages} pages, {independentRoots} separate roots, {copies} copies.</>,
    end: <>{label} it ends with “{card.title}”. {card.sentence}</>,
  };
}

export function HowItWorks({ hero }: { hero: Trace | null }) {
  const ex = examples(hero);
  return (
    <main className="lp how-page">
      <section className="lp-hero hw-head">
        <div className="wrap">
          <h1 tabIndex={-1} className="lp-title hw-title">How it works</h1>
          <p className="lead lp-lead">Patient Zero walks a claim back through time to the earliest page it can find. It searches, reads pages, checks dates and compares the wording. Code decides the ending, never the model.</p>
        </div>
      </section>

      <section className="lp-section" aria-labelledby="hw-steps">
        <div className="wrap">
          <h2 id="hw-steps" className="lp-h2">Four steps</h2>
          <ol className="hw-steps">
            <Step n="1" title="Search back in time" example={ex.search}>
              Tavily searches for the claim, then again in older and older date windows, and extracts each page it finds.
            </Step>
            <Step n="2" title="Read and date every page" example={ex.date}>
              Code pulls the exact sentence that states the claim. Dates come from research registries, page metadata, the Wayback Machine, and a marked publication date in the article, only when nothing on the page contradicts it. Each date says where it came from.
            </Step>
            <Step n="3" title="Compare copies to roots" example={ex.roots}>
              Nebius Token Factory models answer typed questions about each hop under strict JSON schemas: did the number change, was a hedge dropped, is it the same claim? Pages that copy another are folded into its root.
            </Step>
            <Step n="4" title="Stop honestly" example={ex.end}>
              A decision table in code picks one of six endings. The model never names an origin. If a cited page needed to establish the origin can't be opened, the trail goes cold.
            </Step>
          </ol>
          {hero && <a className="lp-more" href={`#/t/${encodeURIComponent(hero.id)}`}>{`Open that trace: “${hero.claim.text}”`}</a>}
        </div>
      </section>

      <section className="lp-section" aria-labelledby="hw-endings">
        <div className="wrap">
          <h2 id="hw-endings" className="lp-h2">The six endings</h2>
          <p className="lp-intro">Every trace ends on exactly one of these. Only the first names a page, and only when it meets the origin rules.</p>
          <dl className="hw-endings">
            {Object.entries(explanations).map(([state, text]) => (
              <div key={state}>
                <dt>{ENDING_NAMES[state as keyof typeof ENDING_NAMES]}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="lp-section" aria-labelledby="hw-shows">
        <div className="wrap">
          <h2 id="hw-shows" className="lp-h2">What a trace shows</h2>
          <ol className="lp-steps hw-shows">
            {shows.map((s) => (
              <li key={s.title}>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="lp-section" aria-labelledby="hw-limits">
        <div className="wrap hw-limits">
          <div>
            <h2 id="hw-limits" className="lp-h2">Cost and limits</h2>
          </div>
          <div>
            <p>A live trace runs real searches and model calls. It usually costs a few cents and takes about 40 seconds, but can take nearly five minutes. Its result shows the recorded cost. Recorded traces open free.</p>
            <p>The earliest page we find is limited by what is on the web. Missing citations, circular references, pages that can't be opened and search limits can all stop a trail cold.</p>
            <a className="btn" href="#/">Try a claim</a>
          </div>
        </div>
      </section>
    </main>
  );
}
