import type { Trace } from "pz/schema";
import { pageReceipt } from "../model/roots.ts";
import { unreadParents, unreadSplit } from "../model/unread.ts";
import { cleanQuote } from "../model/quoteClean.ts";
import { sampleRow } from "../model/sampleRow.ts";
import { month, stopCard } from "../model/stopCard.ts";

// The card a trace ends on: the ending, one plain sentence, what was searched, the origin's own words when there is
// one, and the rule that decided, which opens the full rule sheet.
export function StopCard({ trace }: { trace: Trace }) {
  const card = stopCard(trace);
  const found = trace.decision.state === "ORIGIN_FOUND";
  // Cold endings list every unread cited page. Under Origin found, the pages the decision set aside are still shown,
  // muted and with the reason, never hidden (#311): the split is decide.ts's own (bearingNodes).
  const unread = found ? [] : unreadParents(trace);
  const setAside = found ? unreadSplit(trace).setAside : [];
  const tone = sampleRow(trace).tone;
  const earliest = trace.nodes.filter(node => trace.earliest.nodeIds.includes(node.id))
    .sort((a, b) => (a.date.value ?? "9999").localeCompare(b.date.value ?? "9999"));
  return (
    <section className={`stop-card ${card.tone}`} aria-label="How this trace ended">
      {/* The verdict is the section heading itself, at the same level and size as the other sections (#259 item 3). */}
      <h2 className="trace-section-title stop-title"><span className="visually-hidden">The ending: </span><span className={tone ? "ramp-dot" : "ramp-dot empty"} style={{ ["--tone" as string]: tone ?? "var(--ink-3)" }} aria-hidden="true" />{card.title}</h2>
      <p className="stop-sentence">{card.sentence}</p>
      {trace.decision.state !== "ORIGIN_FOUND" && <p className="stop-restraint">No origin is named on purpose: the evidence does not meet the origin rules.</p>}
      {unread.length > 0 && <section className="stop-unread" aria-label="Pages it cites that could not be opened">
        <h3>Pages it cites that could not be opened</h3>
        <ul>{unread.map(parent => <li key={parent.url}>
          <a href={parent.url} target="_blank" rel="noreferrer">{parent.host}</a>
          <span>cited by {parent.citedBy.join(", ")}</span>
        </li>)}</ul>
      </section>}
      {/* One list: each earliest page with its date, how that date is proven and what could not be checked (#259). */}
      <section className="stop-earliest" aria-label="Earliest pages we found, and why you can check them">
        <h3 className="meta">{earliest.length > 1 ? "Earliest pages we found" : "Earliest page we found"}</h3>
        {earliest.length ? earliest.map(node => {
          const proof = pageReceipt(trace, node).evidence;
          return <div className="earliest-row" key={node.id}>
            <p className="earliest-line">
              <strong>{node.date.value ? month(node.date.value, node.date.precision) : "Undated"}</strong>
              <a href={node.url} target="_blank" rel="noreferrer">{node.domain}</a>
            </p>
            {node.date.value && <p className="earliest-proof">{proof.url ? <a href={proof.url} target="_blank" rel="noreferrer">{proof.label}</a> : proof.label}</p>}
          </div>;
        }) : <p>No dated page with the claim.</p>}
      </section>
      {card.origin && (
        <blockquote className="origin-quote" cite={card.origin.url}>
          <p className="quote">{cleanQuote(card.origin.quote, trace.claim.text)}</p>
          <footer>
            <a href={card.origin.url} target="_blank" rel="noreferrer">{card.origin.domain}</a>, {card.origin.when}
          </footer>
        </blockquote>
      )}
      {setAside.length > 0 && <section className="stop-unread set-aside" aria-label="Not counted against this origin">
        <p><strong>Not counted against this origin:</strong> {setAside.length === 1 ? "a page" : "pages"} cited only by an off-topic fact-check that could not be opened: {setAside.map((parent, i) => <span key={parent.url}>{i > 0 && ", "}<a href={parent.url} target="_blank" rel="noreferrer">{parent.host}</a></span>)} (cited by {[...new Set(setAside.flatMap(parent => parent.citedBy))].join(", ")})</p>
      </section>}
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
