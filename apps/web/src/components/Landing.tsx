import type { Trace } from "pz/schema";
import { ClaimBox } from "./ClaimBox.tsx";
import shotLight from "../assets/trace-dev10-light.png";
import shotDark from "../assets/trace-dev10-dark.png";
import { challengeTraces } from "../model/live.ts";
import { sampleRow } from "../model/sampleRow.ts";
import { scrubberStops, dateToX, heat } from "../model/scrubber.ts";
import { stopCard } from "../model/stopCard.ts";

const REPO = "https://github.com/vs-githjk/odsc-nebius-hackathon";

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\d?\./, ""); } catch { return url; }
}

function when(date: string | null, precision?: "day" | "month" | "year"): string {
  if (!date) return "undated";
  const [y, m, d] = date.split("-");
  if (precision === "year" || !m) return y!;
  const month = new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return precision === "month" || !d ? `${month} ${y}` : `${month} ${Number(d)}, ${y}`;
}

// The worked example: the hero trace's own stops, newest first, then the card it ends on. Every line is read from the
// recorded trace, so the page can't say more than the trace does.
function WorkedExample({ trace }: { trace: Trace }) {
  const stops = scrubberStops(trace);
  const card = stopCard(trace);
  const row = sampleRow(trace);
  return (
    <div className="lp-example card">
      <p className="lp-eyebrow">A recorded trace</p>
      <p className="lp-example-claim">{`“${trace.claim.text}”`}</p>
      <ol className="lp-stops">
        {stops.map((s, i) => (
          <li key={`${s.spanId}-${i}`} style={{ ["--tone" as string]: s.date ? heat(dateToX(trace, s.date)) : "var(--ink-3)" }}>
            <span className="lp-stop-dot" aria-hidden="true" />
            <span className="lp-stop-when">{when(s.date, s.precision)}</span>
            <span className="lp-stop-where">{domainOf(s.url)}</span>
            <span className="lp-stop-text">{s.text.length > 160 ? `${s.text.slice(0, 157).trimEnd()}...` : s.text}</span>
          </li>
        ))}
      </ol>
      <div className={`lp-ending ${card.tone}`}>
        <strong>{card.title}</strong>
        <span>{card.sentence}</span>
        <span className="meta">{card.count}</span>
      </div>
      <a className="btn" href={`#/t/${encodeURIComponent(trace.id)}`}>Open the full trace</a>
      {row.earliestYear !== null && <span className="meta lp-example-note">Earliest page found: {row.earliestYear}. It is not called the origin while a page it cites is unread.</span>}
    </div>
  );
}

// A real capture of the trace view on the hero trace (light and dark), not mock art. Each theme shows its own.
function LiveFigure({ trace }: { trace: Trace }) {
  return (
    <a className="lp-figure card" href={`#/t/${encodeURIComponent(trace.id)}`}>
      <img className="lp-shot lp-shot-light" src={shotLight} width={729} height={425} alt="The trace view on the recorded plastic claim: the report's own sentence above a time axis from 2016 to 2024, one dot per page." />
      <img className="lp-shot lp-shot-dark" src={shotDark} width={729} height={425} alt="" aria-hidden="true" />
      <span className="meta lp-figure-cap">The trace view on the recorded plastic claim: one dot per page, the past on the left, links where one page cites another. Open it to scrub through time.</span>
    </a>
  );
}

const steps = [
  { n: "1", title: "Search back in time", body: "Tavily searches for the claim, then again in older and older date windows, and extracts each page it finds." },
  { n: "2", title: "Read and date every page", body: "Code pulls the exact sentence from each page. Dates come from page metadata, the Wayback Machine and research registries, each labelled." },
  { n: "3", title: "Compare copies to roots", body: "Nebius Token Factory models answer typed questions about each hop: did the number change, was a hedge dropped, is it the same claim." },
  { n: "4", title: "Stop honestly", body: "A decision table in code picks the ending, never the model. When a page it cites can't be opened, it says the trail goes cold." },
];

const team = [
  { name: "Vidyut", gh: "vs-githjk" },
  { name: "Rohan", gh: "rohanrastogi311" },
  { name: "Anoop", gh: "AnoopIbrampur" },
  { name: "Rishit", gh: "RishitRai" },
];

export function Landing({ traces, hero, focusKey, onMatch, onLive }: {
  traces: Trace[]; hero: Trace | null; focusKey: number; onMatch(id: string): void; onLive(trace: Trace): void;
}) {
  const tries = challengeTraces(traces);
  return (
    <main className="lp">
      <section className="lp-hero">
        <div className="wrap">
          <p className="lp-eyebrow">For viral stats with no source</p>
          <h1 className="lp-title">Where did that number <em>start?</em></h1>
          <p className="lead lp-lead">Paste a claim. Patient Zero walks it back through time to the earliest web page it can find, shows the exact sentence on every page, and stops honestly when the trail goes cold.</p>
          <div className="lp-claim card">
            <ClaimBox traces={traces} focusKey={focusKey} onMatch={onMatch} onLive={onLive} />
          </div>
          <div className="lp-hero-ramp ramp" aria-hidden="true" />
        </div>
      </section>

      {hero && (
        <section className="lp-section" aria-labelledby="lp-problem">
          <div className="wrap lp-split">
            <div className="lp-copy">
              <p className="lp-eyebrow">The problem</p>
              <h2 id="lp-problem" className="lp-h2">Everyone repeats it. Nobody links it.</h2>
              <p>A statistic goes viral, gets quoted by news sites, posts and AI answers, and the source falls off along the way. Checking it by hand means opening page after page, guessing which came first.</p>
              <p>Here is one we traced. It found the report the line comes from, and it still ends cold, because a page that report cites could not be opened. That honest ending is the point: it won't call something the origin when it can't check.</p>
            </div>
            <WorkedExample trace={hero} />
          </div>
        </section>
      )}

      <section className="lp-section lp-alt" aria-labelledby="lp-how">
        <div className="wrap">
          <p className="lp-eyebrow">How it works</p>
          <h2 id="lp-how" className="lp-h2">Four steps, and code decides the ending</h2>
          {hero && <LiveFigure trace={hero} />}
          <ol className="lp-steps">
            {steps.map(s => (
              <li key={s.n} className="card">
                <span className="lp-step-n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
          <a className="lp-more" href="#/how">Every ending, explained</a>
        </div>
      </section>

      <section className="lp-section" aria-labelledby="lp-proof">
        <div className="wrap">
          <p className="lp-eyebrow">Measured, misses included</p>
          <h2 id="lp-proof" className="lp-h2">What the recorded runs show</h2>
          <dl className="lp-stats">
            <div><dt>0</dt><dd>false origins on our 20-claim tuning set, final live run, Nov 19</dd></div>
            <div><dt>4/10</dt><dd>traces that cite the source page we registered for the claim in advance</dd></div>
            <div><dt>44 s</dt><dd>median time per trace (target 30 s, not met)</dd></div>
            <div><dt>$0.08</dt><dd>median cost per trace, almost all search (target $0.02, not met)</dd></div>
          </dl>
          <p className="meta lp-proof-note">No recorded trace yet ends on its true origin: most misses never reach the origin page. Sources: <a href={`${REPO}/blob/main/eval/dev-score.md`}>eval/dev-score.md</a> and <a href={`${REPO}/blob/main/eval/perf.md`}>eval/perf.md</a>.</p>
        </div>
      </section>

      {tries.length > 0 && (
        <section className="lp-section lp-alt" aria-labelledby="lp-try">
          <div className="wrap">
            <div className="samples-head">
              <h2 id="lp-try" className="lp-h2">Try these</h2>
              <a className="meta" href="#/traces">All recorded traces</a>
            </div>
            <ul className="lp-tries">
              {tries.map(t => (
                <li key={t.id}>
                  <a className="lp-try card" href={`#/t/${encodeURIComponent(t.id)}`}>
                    <span className="sample-claim">{t.claim.text}</span>
                    <span className="meta">{(t.otherNumbers?.length ?? 0) > 0 ? "Another page gives a different number" : sampleRow(t).ending}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="lp-section" aria-labelledby="lp-built">
        <div className="wrap lp-built">
          <div>
            <p className="lp-eyebrow">Built with</p>
            <h2 id="lp-built" className="lp-h2">Nebius Token Factory and Tavily</h2>
            <p>Token Factory open models answer typed questions under strict JSON schemas. Tavily does the search and page extraction. The Wayback Machine helps date pages.</p>
          </div>
          <div>
            <p className="lp-eyebrow">Team Says Who</p>
            <ul className="lp-team">
              {team.map(m => <li key={m.gh}><a href={`https://github.com/${m.gh}`}>{m.name}</a></li>)}
            </ul>
            <a className="btn secondary" href={REPO}>Read the code on GitHub</a>
          </div>
        </div>
      </section>
    </main>
  );
}

export function Footer() {
  return (
    <footer className="lp-footer">
      <div className="wrap">
        <span className="wordmark"><span className="wordmark-ring" aria-hidden="true" />Patient Zero</span>
        <span className="meta">ODSC x Nebius Hackathon 2026, team Says Who.</span>
        <nav className="lp-footer-links" aria-label="Footer">
          <a href="#/how">How it works</a>
          <a href="#/traces">Recorded traces</a>
          <a href={REPO}>GitHub</a>
        </nav>
      </div>
    </footer>
  );
}
