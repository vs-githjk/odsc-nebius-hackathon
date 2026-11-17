import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Trace } from "pz/schema";
import { claimProblem, findTrace } from "../model/claimMatch.ts";

type Outcome = { kind: "idle" } | { kind: "problem"; text: string } | { kind: "untraced"; claim: string };

// The claim box. A claim that matches a recorded trace opens it; anything else gets a calm answer, never a guess.
// focusKey changes when the nav's "Trace a claim" is pressed, and the box takes focus.
export function ClaimBox({ traces, focusKey }: { traces: Trace[]; focusKey: number }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });

  useEffect(() => {
    if (focusKey === 0) return;
    input.current?.focus();
    input.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusKey]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const claim = text.trim();
    if (!claim) return input.current?.focus();
    const problem = claimProblem(claim);
    if (problem) return setOutcome({ kind: "problem", text: problem });
    const trace = findTrace(claim, traces);
    if (trace) window.location.hash = `#/t/${encodeURIComponent(trace.id)}`;
    else setOutcome({ kind: "untraced", claim });
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
          aria-label="A claim with a number in it"
          aria-describedby="claim-note"
          onChange={(e) => {
            setText(e.target.value);
            if (outcome.kind !== "idle") setOutcome({ kind: "idle" });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) submit(e);
          }}
        />
        <button className="btn claim-go" type="submit">
          Trace
        </button>
      </div>
      <div id="claim-note" className="claim-note" aria-live="polite">
        {outcome.kind === "idle" && <p className="meta">Paste the sentence the number came in. Recorded traces open straight away.</p>}
        {outcome.kind === "problem" && <p className="claim-problem">{outcome.text}</p>}
        {outcome.kind === "untraced" && (
          <div className="untraced">
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
