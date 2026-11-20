import type { ReactNode } from "react";
import type { Trace } from "pz/schema";
import { independence } from "pz/headline";
import { ClaimBox } from "./ClaimBox.tsx";
import { S7, answerPieces } from "../model/answerCheck.ts";
import { challengeTraces } from "../model/live.ts";
import { sampleRow } from "../model/sampleRow.ts";
import { scrubberStops, dateToX, heat } from "../model/scrubber.ts";
import { stopCard } from "../model/stopCard.ts";
import { previewQuote } from "../model/quote.ts";

const REPO = "https://github.com/vs-githjk/odsc-nebius-hackathon";
const blob = (path: string) => `${REPO}/blob/main/${path}`;
const traceHref = (t: Trace) => `#/t/${encodeURIComponent(t.id)}`;

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

// How a page's date was known, in words, from the trace's own date source.
function dateSource(trace: Trace, url: string): string {
  const node = trace.nodes.find((n) => n.url === url);
  if (!node) return "";
  if (node.date.source === "wayback_first_capture") return node.date.value ? "first archived by the Wayback Machine" : "date not confirmed";
  if (node.date.source === "metadata") return "date from the page's own metadata";
  return `date from ${String(node.date.source).replace(/_/g, " ")}`;
}

// A receipt: the claim we make, the real evidence, what it measures and where anyone can check it.
function Receipt({ n, title, children, measures, check }: { n: string; title: string; children: ReactNode; measures: string; check: { label: string; href: string }[] }) {
  return (
    <article className="lp-receipt card">
      <header className="lp-receipt-head">
        <span className="lp-step-n">{n}</span>
        <h3>{title}</h3>
      </header>
      <div className="lp-receipt-body">{children}</div>
      <dl className="lp-receipt-foot">
        <div><dt>What it measures</dt><dd>{measures}</dd></div>
        <div><dt>Where to check</dt><dd>{check.map((c, i) => <span key={c.href}>{i > 0 && ", "}<a href={c.href}>{c.label}</a></span>)}</dd></div>
      </dl>
    </article>
  );
}

// 1. The ending card, as the trace itself prints it.
function ColdEnding({ trace }: { trace: Trace }) {
  const card = stopCard(trace);
  return (
    <div className={`lp-ending ${card.tone}`}>
      <span className="lp-ending-claim">{`“${trace.claim.text}”`}</span>
      <strong>{card.title}</strong>
      <span>{card.sentence}</span>
    </div>
  );
}

// 2. Every stop on the way back: the date, how the date was known, the site and the exact sentence.
function Stops({ trace }: { trace: Trace }) {
  const stops = scrubberStops(trace);
  return (
    <ol className="lp-stops">
      {stops.map((s, i) => (
        <li key={`${s.spanId}-${i}`} style={{ ["--tone" as string]: s.date ? heat(dateToX(trace, s.date)) : "var(--ink-3)" }}>
          <span className="lp-stop-dot" aria-hidden="true" />
          <span className="lp-stop-when">{when(s.date, s.precision)} <span className="lp-stop-how">{dateSource(trace, s.url)}</span></span>
          <span className="lp-stop-where">{domainOf(s.url)}</span>
          <span className="lp-stop-text">{previewQuote(s.text, 150)}</span>
        </li>
      ))}
    </ol>
  );
}

// The hero's product shot: the hero trace walking back, newest page first, one stop at a time, to the card it ends
// on and its page count. All of it is read from the recorded trace.
function HeroTrace({ trace }: { trace: Trace }) {
  const stops = scrubberStops(trace);
  const card = stopCard(trace);
  const { pages, independentRoots, copies } = independence(trace);
  const years = stops.map((s) => s.date?.slice(0, 4)).filter(Boolean);
  return (
    <a className="lp-hero-trace card" href={traceHref(trace)} aria-label={`Open the recorded trace: ${trace.claim.text}`}>
      <span className="lp-ht-head">
        <span className="lp-ht-live"><i aria-hidden="true" />Recorded trace, replayed</span>
        {years.length > 1 && <span className="meta">{years[0]} back to {years[years.length - 1]}</span>}
      </span>
      <span className="lp-ht-claim">{`“${trace.claim.text}”`}</span>
      <ol className="lp-ht-stops">
        {stops.map((s, i) => (
          <li key={`${s.spanId}-${i}`} style={{ ["--i" as string]: i, ["--tone" as string]: s.date ? heat(dateToX(trace, s.date)) : "var(--ink-3)" }}>
            <i className="lp-ht-dot" aria-hidden="true" />
            <span className="lp-ht-when">{when(s.date, s.precision)}</span>
            <span className="lp-ht-where">{domainOf(s.url)}</span>
            <span className="lp-ht-text">{previewQuote(s.text, 90)}</span>
          </li>
        ))}
      </ol>
      <span className="lp-ht-end" style={{ ["--i" as string]: stops.length }}>
        <span className="lp-ht-verdict"><strong>{card.title}</strong><span>{card.sentence}</span></span>
        <span className="lp-ht-roots" aria-label={`${pages} pages, ${independentRoots} separate roots, ${copies} copies`}>
          <span className="lp-roots-dots" aria-hidden="true">
            {Array.from({ length: independentRoots }, (_, k) => <i key={`r${k}`} className="lp-dot-root" />)}
            {Array.from({ length: copies }, (_, k) => <i key={`c${k}`} className="lp-dot-copy" />)}
          </span>
          <span><strong>{pages} pages</strong>, {independentRoots} roots, {copies} copies</span>
        </span>
      </span>
    </a>
  );
}

// 3. Pages against roots: one filled dot per separate root, one ring per copy.
function RootDots({ trace, big }: { trace: Trace; big?: boolean }) {
  const { pages, independentRoots, copies } = independence(trace);
  return (
    <figure className={big ? "lp-roots big" : "lp-roots"}>
      <div className="lp-roots-dots" aria-hidden="true">
        {Array.from({ length: independentRoots }, (_, i) => <i key={`r${i}`} className="lp-dot-root" />)}
        {Array.from({ length: copies }, (_, i) => <i key={`c${i}`} className="lp-dot-copy" />)}
      </div>
      <figcaption>
        <strong>{pages} {pages === 1 ? "page" : "pages"}, {independentRoots} {independentRoots === 1 ? "root" : "roots"}</strong>
        <span className="meta">{`“${trace.claim.text}”`}</span>
      </figcaption>
    </figure>
  );
}

// 4. The pasted answer with each statistic it checked marked, and how each ended.
function AnswerCheck() {
  return (
    <div className="lp-answer">
      <p className="lp-answer-label meta">Pasted answer (an example AI-style answer, not from a real chatbot)</p>
      <p className="lp-answer-text">
        {answerPieces(S7.answer, S7.claims).map((p, i) => p.claim
          ? <mark key={i} title={p.claim.ending}>{p.text}</mark>
          : <span key={i}>{p.text}</span>)}
      </p>
      <ul className="lp-answer-results">
        {S7.claims.map((c) => <li key={c.start}><span className="lp-cold-dot" aria-hidden="true" />{c.ending}</li>)}
      </ul>
      <p className="lp-answer-sum"><strong>{S7.summary}</strong> <span className="meta">The claims are out there, but no page they came from could be confirmed, so none is named.</span></p>
    </div>
  );
}

const versus: [string, string][] = [
  ["A confident sentence and a link or two", "The exact sentence on every page that states it"],
  ["You open each link to see if it really says that", "Each page dated, and how the date was known"],
  ["Ten sites repeating it look like ten confirmations", "Copies counted apart from separate roots"],
  ["Something is always named as the source", "When the trail runs out, it says the trail goes cold"],
];

const steps = [
  { n: "1", title: "Search back in time", body: "Tavily searches for the claim, then again in older and older date windows, and extracts each page." },
  { n: "2", title: "Read and date every page", body: "Code pulls the exact sentence. Dates come from page metadata, the Wayback Machine and research registries, each labelled." },
  { n: "3", title: "Compare copies to roots", body: "Nebius Token Factory models answer typed questions on each hop: did the number change, was a hedge dropped, same claim?" },
  { n: "4", title: "Stop honestly", body: "A decision table in code picks the ending, never the model. If a page it cites can't be opened, the trail goes cold." },
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
  const copiesTrace = traces.find((t) => t.id === "dev-12" && !t.synthetic) ?? null;
  return (
    <main className="lp">
      <section className="lp-hero">
        <div className="wrap lp-hero-grid">
          <div className="lp-hero-copy">
          <p className="lp-eyebrow">For viral stats with no source</p>
          <h1 className="lp-title">Anyone can find you a source. <em>Patient Zero shows you whether to trust it.</em></h1>
          <p className="lead lp-lead">Paste a claim. Patient Zero walks it back through time to the earliest web page it can find, shows the exact sentence on every page, counts how many are only copies, and says so when the trail goes cold.</p>
          <div className="lp-claim card">
            <ClaimBox traces={traces} focusKey={focusKey} onMatch={onMatch} onLive={onLive} />
          </div>
          <div className="lp-hero-ramp ramp" aria-hidden="true" />
          </div>
          {hero && <HeroTrace trace={hero} />}
        </div>
      </section>

      <section className="lp-section" aria-labelledby="lp-vs">
        <div className="wrap">
          <p className="lp-eyebrow">The difference</p>
          <h2 id="lp-vs" className="lp-h2">A chat answer tells you. A trace shows you.</h2>
          <div className="lp-vs" role="table" aria-label="A chat answer compared with a Patient Zero trace">
            <div className="lp-vs-row lp-vs-head" role="row">
              <span role="columnheader">What a chat answer leaves you with</span>
              <span role="columnheader">What a Patient Zero trace gives you</span>
            </div>
            {versus.map(([a, b]) => (
              <div className="lp-vs-row" role="row" key={a}>
                <span role="cell">{a}</span>
                <span role="cell"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{b}</span>
              </div>
            ))}
          </div>
          <p className="meta lp-vs-note">The left column describes the shape of a typical chat answer. It is not a quote from any tool.</p>
        </div>
      </section>

      <section className="lp-section lp-alt" aria-labelledby="lp-only">
        <div className="wrap">
          <p className="lp-eyebrow">Receipts, from recorded traces</p>
          <h2 id="lp-only" className="lp-h2">Five things only a trace shows</h2>
          <div className="lp-receipts">
            {hero && (
              <Receipt n="1" title="It names no wrong origin" measures="False origins: a page named as the origin that isn't. On our 20-claim tuning set, final live run: 0. Most traces stop short of the origin (target page cited on 4 of 10), and none yet ends on its true origin."
                check={[{ label: "eval/dev-score.md", href: blob("eval/dev-score.md") }, { label: "open this trace", href: traceHref(hero) }]}>
                <p className="lp-big"><span>0</span> false origins</p>
                <ColdEnding trace={hero} />
              </Receipt>
            )}
            {hero && (
              <Receipt n="2" title="Every link is checkable" measures="Each stop is a real page with the sentence it holds, the date, and where that date came from."
                check={[{ label: "open this trace", href: traceHref(hero) }]}>
                <Stops trace={hero} />
              </Receipt>
            )}
            {copiesTrace && (
              <Receipt n="3" title="Copies are counted apart from roots" measures="Pages that copy another page are folded into that page's root. Ten repeats of one source count once."
                check={[{ label: "open this trace", href: traceHref(copiesTrace) }, ...(hero ? [{ label: "and this one", href: traceHref(hero) }] : [])]}>
                <RootDots trace={copiesTrace} big />
                {hero && <RootDots trace={hero} />}
                <p className="lp-legend meta"><i className="lp-dot-root" aria-hidden="true" /> separate root <i className="lp-dot-copy" aria-hidden="true" /> copy</p>
              </Receipt>
            )}
            <Receipt n="4" title="It checks a chatbot's own answer" measures={`Paste a whole answer: each statistic in it is found and traced on its own. Recorded ${S7.recordedAt}.`}
              check={[{ label: "fixtures/answers/s7-answer.json", href: blob("fixtures/answers/s7-answer.json") }]}>
              <AnswerCheck />
            </Receipt>
            <Receipt n="5" title="It is cheap and repeatable" measures="Median time and cost over the 20 recorded traces. Both miss their targets (30 s, $0.02); search is almost all of the cost."
              check={[{ label: "eval/perf.md", href: blob("eval/perf.md") }]}>
              <div className="lp-cost">
                <p className="lp-big"><span>44 s</span> median a trace</p>
                <p className="lp-big"><span>$0.08</span> median a trace</p>
              </div>
              <pre className="lp-cli"><code>pz trace "By 2050 there will be more plastic than fish"</code></pre>
              <p className="meta">Every trace is saved as JSON, replays free, and opens at its own link.</p>
            </Receipt>
          </div>
        </div>
      </section>

      <section className="lp-section" aria-labelledby="lp-how">
        <div className="wrap">
          <p className="lp-eyebrow">How it works</p>
          <h2 id="lp-how" className="lp-h2">Four steps, and code decides the ending</h2>
          <ol className="lp-steps">
            {steps.map((s) => (
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

      {tries.length > 0 && (
        <section className="lp-section lp-alt" aria-labelledby="lp-try">
          <div className="wrap">
            <div className="samples-head">
              <h2 id="lp-try" className="lp-h2">Try these</h2>
              <a className="meta" href="#/traces">All recorded traces</a>
            </div>
            <ul className="lp-tries">
              {tries.map((t) => (
                <li key={t.id}>
                  <a className="lp-try card" href={traceHref(t)}>
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
              {team.map((m) => <li key={m.gh}><a href={`https://github.com/${m.gh}`}>{m.name}</a></li>)}
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
