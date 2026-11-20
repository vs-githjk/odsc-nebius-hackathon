import { useEffect, useState } from "react";
import { independence } from "pz/headline";
import { type AnswerCheck, answerSegments, readAnswerCheck } from "../model/answerStats.ts";
import { stopCard } from "../model/stopCard.ts";
import { TraceView } from "./TraceView.tsx";
import { when } from "./Landing.tsx";
import { NotFound } from "./NotFound.tsx";

const FILE = "fixtures/answers/s7-answer.json";
const BLOB = `https://github.com/vs-githjk/odsc-nebius-hackathon/blob/main/${FILE}`;

// The recording is about 300 KB of traces, so it loads only when this page opens.
function useAnswerCheck(): AnswerCheck | null | "failed" {
  const [check, setCheck] = useState<AnswerCheck | null | "failed">(null);
  useEffect(() => {
    let live = true;
    import("../../../../fixtures/answers/s7-answer.json")
      .then((m) => { if (live) setCheck(readAnswerCheck(m.default)); })
      .catch(() => { if (live) setCheck("failed"); });
    return () => { live = false; };
  }, []);
  return check;
}

function Loading({ check }: { check: "failed" | null }) {
  return <p className="meta" role="status">{check === "failed" ? "The recorded answer could not be loaded." : "Loading the recorded answer..."}</p>;
}

export function AnswerPage() {
  const check = useAnswerCheck();
  return (
    <main className="lp answer-page">
      <section className="lp-hero hw-head">
        <div className="wrap">
          <h1 tabIndex={-1} className="lp-title hw-title">Check an AI answer</h1>
          <p className="lead lp-lead">Give Patient Zero a whole answer and it finds each statistic in it, then traces every one on its own. Below is one recorded run, replayed. Click a number to open its trace.</p>
        </div>
      </section>

      <section className="lp-section" aria-labelledby="an-answer">
        <div className="wrap">
          {check === null || check === "failed" ? <Loading check={check} /> : (
            <>
              <p className="an-label meta">
                Recorded example, {when(check.recordedAt.slice(0, 10), "day")}. The answer was written for this demo. It is not a reply from any AI tool.
              </p>
              <h2 id="an-answer" className="visually-hidden">The answer</h2>
              <blockquote className="an-answer">
                {answerSegments(check.answer, check.stats).map((seg, i) => seg.kind === "text"
                  ? <span key={i}>{seg.text}</span>
                  : (
                    <mark key={i}>
                      {seg.parts.map((p, j) => p.n === null
                        ? <span key={j}>{p.text}</span>
                        : <a key={j} href={`#/answer/${p.n}`} aria-label={`${p.text}: open its trace`}>{p.text}</a>)}
                    </mark>
                  ))}
              </blockquote>
              <p className="lp-big an-summary"><span>{check.summary}</span></p>
              <p className="lp-intro">Every statistic in the answer turned up on the web, but no page it came from could be confirmed, so Patient Zero names none.</p>

              <ol className="an-stats">
                {check.stats.map((s) => {
                  const card = stopCard(s.trace);
                  const { pages, independentRoots } = independence(s.trace);
                  return (
                    <li key={s.n}>
                      <a href={`#/answer/${s.n}`}>
                        <span className="an-number">{s.number}</span>
                        <span className="an-sentence">{`“${s.sentence}”`}</span>
                        <span className="an-ending"><strong>{card.title}</strong> {card.sentence}</span>
                        <span className="meta">{pages} {pages === 1 ? "page" : "pages"}, {independentRoots} {independentRoots === 1 ? "root" : "roots"}. Open its trace</span>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      </section>

      <section className="lp-section" aria-labelledby="an-cli">
        <div className="wrap hw-limits">
          <div>
            <h2 id="an-cli" className="lp-h2">Live answers run on the command line</h2>
          </div>
          <div>
            <p>The web replays this recorded answer. The claim box on the home page takes one claim at a time. Checking a whole new answer live runs from the command line only, with your own keys.</p>
            <pre className="lp-cli"><code>pz trace --answer-replay-of {FILE}</code></pre>
            <p>That replays this run for free. <code>pz trace --answer &lt;file&gt;</code> checks a new one live. The full recording is <a href={BLOB}>{FILE}</a>.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

// One statistic's recorded trace, opened from the answer.
export function AnswerTrace({ n }: { n: number }) {
  const check = useAnswerCheck();
  const stat = check && check !== "failed" ? check.stats.find((s) => s.n === n) : undefined;
  if (check && check !== "failed" && !stat) {
    return (
      <NotFound title="No statistic at this address" back={{ label: "Back to the answer", href: "#/answer" }}>
        <p>The recorded answer has {check.stats.length} statistics, so there is no statistic {n}.</p>
      </NotFound>
    );
  }
  return (
    <main className="wrap trace-page">
      <a className="back" href="#/answer">Back to the answer</a>
      {check === null || check === "failed" ? <Loading check={check} />
        : stat ? (
          <>
            <p className="matched" role="status">Statistic {stat.n} of {check.stats.length} in the recorded answer: <strong>{stat.number}</strong>. This trace follows that number.</p>
            <TraceView key={n} trace={stat.trace} />
          </>
        )
        : null}
    </main>
  );
}
