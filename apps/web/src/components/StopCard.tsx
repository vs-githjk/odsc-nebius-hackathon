import type { Trace } from "pz/schema";
import { stopCard } from "../model/stopCard.ts";

// The card a trace ends on: the ending, one plain sentence, what was searched, the origin's own words when there is
// one, and the rule that decided, which opens the full rule sheet.
export function StopCard({ trace }: { trace: Trace }) {
  const card = stopCard(trace);
  return (
    <section className={`stop-card ${card.tone}`} aria-label="How this trace ended">
      <h2 className="stop-title">{card.title}</h2>
      <p className="stop-count">{card.count}</p>
      <p className="stop-sentence">{card.sentence}</p>
      {card.origin && (
        <blockquote className="origin-quote" cite={card.origin.url}>
          <p className="quote">{card.origin.quote}</p>
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
