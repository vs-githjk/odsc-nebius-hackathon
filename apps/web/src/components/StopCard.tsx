import type { Trace } from "pz/schema";
import { PageReceipt } from "./Roots.tsx";
import { pageReceipt, uncheckedParents } from "../model/roots.ts";
import { cleanQuote } from "../model/quoteClean.ts";
import { sampleRow } from "../model/sampleRow.ts";
import { month, stopCard } from "../model/stopCard.ts";

// The card a trace ends on: the ending, one plain sentence, what was searched, the origin's own words when there is
// one, and the rule that decided, which opens the full rule sheet.
export function StopCard({ trace }: { trace: Trace }) {
  const card = stopCard(trace);
  const tone = sampleRow(trace).tone;
  const earliest = trace.nodes.filter(node => trace.earliest.nodeIds.includes(node.id))
    .sort((a, b) => (a.date.value ?? "9999").localeCompare(b.date.value ?? "9999"));
  return (
    <section className={`stop-card ${card.tone}`} aria-label="How this trace ended">
      <h2 className="trace-section-title">The ending</h2>
      <h3 className="stop-title"><span className={tone ? "ramp-dot" : "ramp-dot empty"} style={{ ["--tone" as string]: tone ?? "var(--ink-3)" }} aria-hidden="true" />{card.title}</h3>
      <p className="stop-sentence">{card.sentence}</p>
      {trace.decision.state !== "ORIGIN_FOUND" && <p className="stop-restraint">No origin is named on purpose: the evidence does not meet the origin rules.</p>}
      <div className="stop-earliest"><span className="meta">Earliest page we found</span>
        {earliest.length ? earliest.map(node => <p className="earliest-row" key={node.id}>
          <strong>{node.date.value ? month(node.date.value, node.date.precision) : "Undated"}</strong>
          <a href={node.url} target="_blank" rel="noreferrer">{node.domain}</a>
        </p>) : <p>No dated page with the claim.</p>}
      </div>
      {earliest.length > 0 && <section className="check-strip" aria-label="Why you can check this">
        <h3>Why you can check this</h3>
        {earliest.map(node => <div className="check-row" key={node.id}>
          <div className="root-page"><PageReceipt page={pageReceipt(trace, node)} /></div>
          {uncheckedParents(node).map(parent => <p key={parent.url}>Not checked: cited page <a href={parent.url} target="_blank" rel="noreferrer">{parent.host}</a> could not be opened.</p>)}
        </div>)}
      </section>}
      {card.origin && (
        <blockquote className="origin-quote" cite={card.origin.url}>
          <p className="quote">{cleanQuote(card.origin.quote, trace.claim.text)}</p>
          <footer>
            <a href={card.origin.url} target="_blank" rel="noreferrer">{card.origin.domain}</a>, {card.origin.when}
          </footer>
        </blockquote>
      )}
      <p className="stop-searched">{card.searched}</p>
      <details className="rule-sheet">
        <summary>How this was decided</summary>
        <ol>
          {card.rules.map((r) => (
            <li key={r.row} className={r.decided ? "decided" : ""} aria-current={r.decided ? "true" : undefined}>
              <span className="rule-row">Rule {r.row}</span> {r.text}
              {r.decided && <span className="rule-mark"> This rule decided.</span>}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
