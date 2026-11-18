import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Trace } from "pz/schema";
import { outcomeOf, submitsOnKey, type Outcome } from "../model/claimBox.ts";

// The claim box. A claim that matches a recorded trace opens it; anything else gets a calm answer, never a guess.
// focusKey changes when the nav's "Trace a claim" is pressed, and the box takes focus.
export function ClaimBox({ traces, focusKey, onMatch }: { traces: Trace[]; focusKey: number; onMatch(id: string): void }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const tries = useRef(0);

  useEffect(() => {
    if (focusKey === 0) return;
    input.current?.focus();
    input.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusKey]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
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
          placeholder="Paste a statistic or a quote"
          aria-label="A claim to trace"
          aria-describedby="claim-note"
          onChange={(e) => {
            setText(e.target.value);
            if (outcome.kind !== "idle") setOutcome({ kind: "idle" });
          }}
          onKeyDown={(e) => {
            if (submitsOnKey({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })) submit(e);
          }}
        />
        <button className="btn claim-go" type="submit">
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
            <p>
              No recorded trace has this claim. Traces are recorded one claim at a time from the command line, and every
              recorded one is listed below.
            </p>
          </div>
        )}
      </div>
    </form>
  );
}
