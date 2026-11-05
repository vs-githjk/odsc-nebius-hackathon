import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { Trace } from "pz/schema";
import { dateToX, type Stop } from "../model/scrubber.ts";

export function stopXs(trace: Trace, stops: Stop[]): number[] {
  // Undated stops sit evenly between their dated neighbours' order; with no dates at all, stops spread evenly.
  return stops.map((s, i) => (s.date ? dateToX(trace, s.date) : 1 - i / Math.max(1, stops.length - 1)));
}

// Fractional stop position for a point on the track (0 = left, 1 = right). Stops run newest first, right to left.
function positionAt(xs: number[], x: number): number {
  if (xs.length < 2) return 0;
  if (x >= xs[0]!) return 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i]!;
    const b = xs[i + 1]!;
    if (x <= a && x >= b) return a === b ? i : i + (a - x) / (a - b);
  }
  return xs.length - 1;
}

export function xAt(xs: number[], position: number): number {
  const i = Math.min(Math.floor(position), xs.length - 1);
  const q = position - i;
  return q === 0 || i + 1 >= xs.length ? xs[i]! : xs[i]! + (xs[i + 1]! - xs[i]!) * q;
}

const LABEL_GAP = 0.06;

type Props = {
  trace: Trace;
  stops: Stop[];
  position: number;
  reducedMotion: boolean;
  onMove(position: number): void;
  onSettle(index: number): void;
};

export function Scrubber({ trace, stops, position, reducedMotion, onMove, onSettle }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const xs = stopXs(trace, stops);
  const last = stops.length - 1;
  const index = Math.round(position);

  const fromPointer = (e: PointerEvent) => {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0) return position;
    const p = positionAt(xs, Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)));
    return reducedMotion ? Math.round(p) : p;
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onMove(fromPointer(e));
  };
  const move = (e: PointerEvent) => {
    if (dragging.current) onMove(fromPointer(e));
  };
  const up = (e: PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    onSettle(Math.round(fromPointer(e)));
  };
  // Left is the past: ArrowLeft steps one hop older, ArrowRight one hop newer.
  const key = (e: KeyboardEvent) => {
    const next = { ArrowLeft: index + 1, ArrowDown: index + 1, ArrowRight: index - 1, ArrowUp: index - 1, Home: last, End: 0 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onSettle(Math.min(last, Math.max(0, next)));
  };

  // A year label is skipped when it would sit on one already shown; the current stop's label always wins.
  const labelled = new Set<number>();
  for (const i of [index, ...stops.keys()]) {
    if (xs[i] !== undefined && [...labelled].every((j) => Math.abs(xs[j]! - xs[i]!) >= LABEL_GAP)) labelled.add(i);
  }
  // Years alone read the same when the stops sit within two years of each other; show the month too.
  const years = stops.map((s) => s.date).filter((d): d is string => d !== null).map((d) => Number(d.slice(0, 4)));
  const labelChars = years.length > 0 && Math.max(...years) - Math.min(...years) < 2 ? 7 : 4;
  const current = stops[index];
  const handleX = xAt(xs, position);
  return (
    <div className="scrub">
      <div className="track" ref={track} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="track-fill" />
        <div className="track-future" style={{ left: `${xs[0]! * 100}%` }} />
        {stops.slice(1).map((s, n) =>
          s.inferred ? (
            <span
              key={`inferred-${s.spanId}`}
              className="track-inferred"
              style={{ left: `${xs[n + 1]! * 100}%`, width: `${(xs[n]! - xs[n + 1]!) * 100}%` }}
              title="inferred hop, no link"
            />
          ) : null,
        )}
        {stops.map((s, i) => (
          <span key={s.spanId} className={`stop${i === index ? " lit" : ""}`} style={{ left: `${xs[i]! * 100}%` }} />
        ))}
        <div
          className="handle"
          role="slider"
          tabIndex={0}
          aria-label="Time machine: step back through the pages"
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={index}
          aria-valuetext={current ? `${current.date ?? "undated"}, ${new URL(current.url).hostname}` : ""}
          onKeyDown={key}
          style={{ left: `${handleX * 100}%` }}
        />
      </div>
      <div className="ticks" aria-hidden="true">
        {stops.map((s, i) =>
          labelled.has(i) ? (
            <span key={s.spanId} className={i === index ? "hop" : ""} style={{ left: `${xs[i]! * 100}%` }}>
              {s.date?.slice(0, labelChars) ?? "?"}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}
