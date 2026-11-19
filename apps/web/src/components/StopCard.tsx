import type { Trace } from "pz/schema";
import { cleanQuote } from "../model/quote.ts";
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
      <h2 className="stop-title"><span className={tone ? "ramp-dot" : "ramp-dot empty"} style={{ ["--tone" as string]: tone ?? "var(--ink-3)" }} aria-hidden="true" />{card.title}</h2>
      <p className="stop-sentence">{card.sentence}</p>
      <div className="stop-earliest"><span className="meta">Earliest page we found</span>
        {earliest.length ? earliest.map(node => <p key={node.id}>
          <strong>{node.date.value ? month(node.date.value, node.date.precision) : "Undated"}</strong>{" · "}
          <a href={node.url} target="_blank" rel="noreferrer">{node.domain}</a>
        </p>) : <p>No dated page with the claim.</p>}
      </div>
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
