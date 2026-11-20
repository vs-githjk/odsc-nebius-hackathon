import { useEffect, useRef, useState, type FormEvent } from "react";
import { liveAction, liveAvailability, LIVE_ENDINGS, LiveError, STAGE_LABELS, streamTrace, type LiveMode } from "../model/live.ts";
import type { Trace } from "pz/schema";
import { outcomeOf, submitsOnKey, type Outcome } from "../model/claimBox.ts";

// The claim box. A claim that matches a recorded trace opens it; anything else gets a calm answer, never a guess.
// focusKey changes when the nav's "Trace a claim" is pressed, and the box takes focus.
export function ClaimBox({ traces, focusKey, onMatch, onLive }: { traces: Trace[]; focusKey: number; onMatch(id: string): void; onLive(trace: Trace): void }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const progressPanel = useRef<HTMLElement>(null);
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const tries = useRef(0);
  const [mode, setMode] = useState<LiveMode>("absent");
  const live = mode === "live";
  const [progress, setProgress] = useState<string | null>(null);
  const [failure, setFailure] = useState("");
  const [pages, setPages] = useState(0);
  const [hosts, setHosts] = useState<string[]>([]);
  const [done, setDone] = useState<string[]>([]);
  const [reason, setReason] = useState<string>();
  const [failureCode, setFailureCode] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const isRunning = progress !== null;
  useEffect(() => {
    if (isRunning) progressPanel.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [isRunning]);
  useEffect(() => {
    if (!isRunning) return;
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [isRunning]);
  const running = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => { void liveAvailability().then(value => { if (active) { setMode(value.mode); setReason(value.reason); } }); };
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => { active = false; clearInterval(timer); running.current?.abort(); };
  }, []);
  const startLive = async () => {
    if (running.current || liveAction(text, traces, live) !== "live") return;
    if (text.length > 400) { setFailure("Enter a claim of 1 to 400 characters."); return; }
    const controller = new AbortController(); running.current = controller;
    setProgress("intake"); setFailure(""); setPages(0); setHosts([]); setDone([]);
    try { const trace = await streamTrace(text.trim(), controller.signal, event => {
      if (controller.signal.aborted) return;
      if (event.type === "progress") { setPages(event.pages); setHosts(event.hosts); }
      else { setProgress(event.stage); if (event.status === "completed") setDone(previous => [...new Set([...previous, event.stage])]); }
    });
      if (!controller.signal.aborted) onLive(trace);
    } catch (error) { if (!controller.signal.aborted) {
      const code = error instanceof LiveError ? error.code : "trace_failed";
      setFailureCode(code); setFailure(LIVE_ENDINGS[code] ?? LIVE_ENDINGS.trace_failed!);
    } }
    finally { if (running.current === controller) { running.current = null; setProgress(null); void liveAvailability().then(value => { setMode(value.mode); setReason(value.reason); }); } }
  };

  useEffect(() => {
    if (focusKey === 0) return;
    input.current?.focus();
    input.current?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [focusKey]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (running.current) return;
    const next = outcomeOf(text, traces, tries.current);
    if (next.kind === "empty") return input.current?.focus();
    if (next.kind === "open") {
      onMatch(next.id);
      window.location.hash = `#/t/${encodeURIComponent(next.id)}`;
      return;
    }
    tries.current = next.try;
    setOutcome(next);
  };

  return (
    <form className="claim-box" onSubmit={submit} role="search" aria-label="Trace a claim">
      <div className="claim-row">
        <textarea
          ref={input}
          id="claim"
          className="input claim-input"
          rows={1}
          value={text}
          disabled={progress !== null}
          placeholder="Paste a statistic or a quote"
          aria-label="A claim to trace"
          aria-describedby="claim-note"
          onChange={(e) => {
            setText(e.target.value); setFailure("");
            if (outcome.kind !== "idle") setOutcome({ kind: "idle" });
          }}
          onKeyDown={(e) => {
            if (submitsOnKey({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })) submit(e);
          }}
        />
        <button className="btn claim-go" type="submit" disabled={progress !== null}>
          Trace
        </button>
      </div>
      <div id="claim-note" className="claim-note" aria-live="polite">
        {outcome.kind === "idle" && <p className="meta">Paste the claim as you saw it, the whole sentence. Recorded traces open straight away.</p>}
        {outcome.kind === "problem" && (
          <p key={outcome.try} className="claim-problem">
            {outcome.text}
          </p>
        )}
        {outcome.kind === "untraced" && !isRunning && !failure && (
          <div key={outcome.try} className="untraced">
            <p className="untraced-title">Not traced yet</p>
            {live ? <>
              <p className="meta live-cost">Runs real searches and costs a few cents. Usually about 40 seconds, sometimes nearly five minutes.</p>
              <button className="btn" type="button" disabled={progress !== null} onClick={() => void startLive()}>Trace it live</button>
            </> : mode === "paused" ? null : (
              <p>No recorded trace has this claim yet. Every recorded trace is listed below.</p>
            )}
          </div>
        )}
        {mode === "paused" && !isRunning && !failure && <div className="untraced live-ending">
          <p>{reason === "cap" ? LIVE_ENDINGS.cap : LIVE_ENDINGS.disabled}</p>
          {traces[0] && <button className="btn secondary" type="button" onClick={() => onMatch(traces[0]!.id)}>Open a recorded trace</button>}
          {!traces[0] && <p className="meta">Try again later.</p>}
        </div>}
        {progress && <section ref={progressPanel} className="untraced live-progress" aria-label="Live trace progress">
          <div className="live-progress-head"><p className="untraced-title">Following the claim</p>
            <span className="meta live-clock" aria-live="off">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} elapsed</span></div>
          <ol className="live-stages">
            {Object.entries(STAGE_LABELS).map(([stage, label]) => <li key={stage} className={done.includes(stage) ? "done" : stage === progress ? "active" : "future"} aria-current={stage === progress && !done.includes(stage) ? "step" : undefined}>
              <span className="stage-marker" aria-hidden="true">{done.includes(stage) ? "✓" : ""}</span>{label}
            </li>)}
          </ol>
          <div className="live-pages" role="status"><p><b>{pages}</b> {pages === 1 ? "page" : "pages"} read</p>
            <ul className="live-hosts">{hosts.map((host, i) => <li key={i}>{host}</li>)}</ul>
          </div>
          <button className="btn secondary" type="button" onClick={() => { running.current?.abort(); setProgress(null); }}>Cancel trace</button>
        </section>}
        {failure && <div className={"untraced live-ending " + (failureCode === "trace_failed" ? "failed" : "")} role="status">
          <p>{failure}</p>
          {traces[0] && <button className="btn secondary" type="button" onClick={() => onMatch(traces[0]!.id)}>Open a recorded trace</button>}
          {!traces[0] && <p className="meta">Try again later.</p>}
        </div>}
      </div>
    </form>
  );
}
