import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Trace } from "pz/schema";
import { afterTick, autoplays, lineMs, railHead, replayFrame, replayLines, startPhase, type ReplayLine } from "../model/replay.ts";

export type Replay = {
  phase: "lines" | "walk" | "done";
  lines: ReplayLine[];
  shown: number;
  frame: ReturnType<typeof replayFrame> | null; // null when the replay is not running: the stage shows the whole trace
  // True once the rail has closed while it held focus (Skip), so "Replay the walk" takes focus (XO on #186).
  returnFocus: boolean;
  start(): void;
  skip(): void;
};

const WALK_MS = 1400;
const seenKey = (id: string) => `pz-replayed:${id}`;
const seen = (id: string) => {
  try {
    return sessionStorage.getItem(seenKey(id)) === "1";
  } catch {
    return false;
  }
};
const markSeen = (id: string) => {
  try {
    sessionStorage.setItem(seenKey(id), "1");
  } catch {
    // Private windows may refuse storage; the replay then simply plays again next time.
  }
};

// The recorded walk, played back once per trace per visit: the log lines appear one by one and each page lands on the
// band, then the handle walks from today to the earliest stop. Skip jumps to the end. Reduced motion never autoplays.
// The first render is always the finished trace, so a page without scripts, or a test, shows everything.
export function useReplay(trace: Trace, stopCount: number, reducedMotion: boolean, walkTo: (position: number) => void, settle: (i: number) => void): Replay {
  const lines = useMemo(() => replayLines(trace), [trace]);
  const [phase, setPhase] = useState<Replay["phase"]>("done");
  const [shown, setShown] = useState(lines.length);
  const [returnFocus, setReturnFocus] = useState(false);
  const raf = useRef(0);
  const last = Math.max(0, stopCount - 1);

  const finish = useCallback(() => {
    cancelAnimationFrame(raf.current);
    // Focus inside the closing rail (on Skip) would be lost; it moves to "Replay the walk" instead.
    setReturnFocus(typeof document !== "undefined" && !!document.activeElement?.closest?.(".replay-rail"));
    setShown(lines.length);
    setPhase("done");
    settle(last);
    markSeen(trace.id);
  }, [lines.length, last, settle, trace.id]);

  const start = useCallback(() => {
    cancelAnimationFrame(raf.current);
    setReturnFocus(false);
    if (startPhase(reducedMotion) === "done") return finish();
    walkTo(0);
    setShown(0);
    setPhase("lines");
  }, [walkTo, reducedMotion, finish]);

  useLayoutEffect(() => {
    if (autoplays(seen(trace.id), reducedMotion)) start();
    else {
      setShown(lines.length);
      setPhase("done");
    }
    return () => cancelAnimationFrame(raf.current);
    // Once per trace: a change of trace starts its own replay.
  }, [trace.id]);

  useEffect(() => {
    if (phase !== "lines") return;
    const next = afterTick(shown, lines.length);
    if (next.phase === "walk") {
      setPhase("walk");
      return;
    }
    const t = setTimeout(() => setShown(next.shown), lineMs(lines));
    return () => clearTimeout(t);
  }, [phase, shown, lines]);

  useEffect(() => {
    if (phase !== "walk") return;
    if (last === 0) return finish();
    const began = performance.now();
    const step = (now: number) => {
      const q = Math.min(1, (now - began) / WALK_MS);
      // Ease out: the handle slows as it reaches the earliest page.
      walkTo(last * (1 - (1 - q) ** 3));
      if (q < 1) raf.current = requestAnimationFrame(step);
      else finish();
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [phase, last, walkTo, finish]);

  return { phase, lines, shown, frame: phase === "done" ? null : replayFrame(trace, lines, shown), returnFocus, start, skip: finish };
}

// The log rail: the walk's own lines as they replay, newest at the bottom, with Skip.
export function ReplayRail({ trace, replay }: { trace: Trace; replay: Replay }) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [replay.shown]);
  if (replay.phase === "done") return null;
  const head = railHead(trace);
  return (
    <section className="replay-rail" aria-label={head.title}>
      <div className="replay-head">
        <span className="replay-tag">
          <i className="replay-pulse" aria-hidden="true" />
          {head.title}
        </span>
        <span className="replay-sub">{head.sub}</span>
        <button type="button" className="replay-skip" onClick={replay.skip}>
          Skip
        </button>
      </div>
      <ol className="replay-lines" ref={list} aria-live="polite">
        {replay.lines.slice(0, replay.shown).map((l, i) => (
          <li key={i} className={`replay-line ${l.kind}`}>
            {l.text}
          </li>
        ))}
        {replay.phase === "walk" && <li className="replay-line walk">Stepping back to the earliest page.</li>}
      </ol>
    </section>
  );
}

// After the replay: one quiet control to watch it again.
export function ReplayAgain({ replay }: { replay: Replay }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (replay.phase === "done" && replay.returnFocus) button.current?.focus();
  }, [replay.phase, replay.returnFocus]);
  if (replay.phase !== "done") return null;
  return (
    <button type="button" className="replay-again" ref={button} onClick={replay.start}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4.5h4.5" />
      </svg>
      Replay the walk
    </button>
  );
}
