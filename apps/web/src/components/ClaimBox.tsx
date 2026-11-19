import { useEffect, useRef, useState, type FormEvent } from "react";
import { liveAction, liveMode, PAUSED, streamTrace, type LiveMode } from "../model/live.ts";
import type { Trace } from "pz/schema";
import { outcomeOf, submitsOnKey, type Outcome } from "../model/claimBox.ts";

// The claim box. A claim that matches a recorded trace opens it; anything else gets a calm answer, never a guess.
// focusKey changes when the nav's "Trace a claim" is pressed, and the box takes focus.
export function ClaimBox({ traces, focusKey, onMatch, onLive }: { traces: Trace[]; focusKey: number; onMatch(id: string): void; onLive(trace: Trace): void }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const tries = useRef(0);
  const [mode, setMode] = useState<LiveMode>("absent");
  const live = mode === "live";
  const [progress, setProgress] = useState<string | null>(null);
  const [failure, setFailure] = useState("");
  const running = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => { void liveMode().then(value => { if (active) setMode(value); }); };
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => { active = false; clearInterval(timer); running.current?.abort(); };
  }, []);
  const startLive = async () => {
    if (running.current || liveAction(text, traces, live) !== "live") return;
    if (text.length > 400) { setFailure("Enter a claim of 1 to 400 characters."); return; }
    const controller = new AbortController(); running.current = controller;
    setProgress("Starting"); setFailure("");
    try { const trace = await streamTrace(text.trim(), controller.signal, setProgress);
      if (!controller.signal.aborted) onLive(trace);
    } catch (error) { if (!controller.signal.aborted) setFailure(error instanceof Error && ["Too many traces. Try again later.", "The trace reached its time limit.", "Live tracing is unavailable. Try a recorded trace."].includes(error.message) ? error.message : "The trace could not finish."); }
    finally { if (running.current === controller) { running.current = null; setProgress(null); void liveMode().then(setMode); } }
  };

  useEffect(() => {
    if (focusKey === 0) return;
    input.current?.focus();
    input.current?.scrollIntoView({ block: "center", behavior: "smooth" });
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
        {outcome.kind === "untraced" && (
          <div key={outcome.try} className="untraced">
            <p className="untraced-title">Not traced yet</p>
            {live ? <>
              <p>Runs real searches and costs a few cents. Usually about 40 seconds, sometimes nearly five minutes.</p>
              <button className="btn" type="button" disabled={progress !== null} onClick={() => void startLive()}>Trace it live</button>
            </> : mode === "paused" ? <p>{PAUSED}</p> : (
              <p>No recorded trace has this claim yet. Every recorded trace is listed below.</p>
            )}
          </div>
        )}
        {mode === "paused" && outcome.kind !== "untraced" && <p>{PAUSED}</p>}
        {progress && <div role="status"><p>{progress}</p><button className="btn small" type="button" onClick={() => { running.current?.abort(); setProgress(null); }}>Cancel trace</button></div>}
        {failure && <p role="alert">{failure}</p>}
      </div>
    </form>
  );
}
