import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { scrubberKey } from "../model/traceKeyboard.ts";
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

const LABEL_GAP = 0.07;

type Tick = { key: string; x: number; label: string; hop: boolean };

// One label per year across the trace, bold where a stop sits. When the stops sit within two years of each other,
// years alone would repeat, so each stop is labelled with its month instead. A label that would crowd one already
// placed is skipped; the current stop's label is placed first.
function tickLabels(trace: Trace, stops: Stop[], xs: number[], index: number): Tick[] {
  const dated = stops.map((s) => s.date).filter((d): d is string => d !== null);
  const years = dated.map((d) => Number(d.slice(0, 4)));
  const short = years.length === 0 || Math.max(...years) - Math.min(...years) < 2;
  const candidates: Tick[] = short
    ? stops.map((s, i) => ({ key: s.spanId, x: xs[i]!, label: s.date?.slice(0, 7) ?? "undated", hop: true }))
    : Array.from({ length: Math.max(...years) - Math.min(...years) + 1 }, (_, n) => Math.min(...years) + n).map((y) => ({
        key: String(y),
        x: Math.min(1, Math.max(0, dateToX(trace, `${y}-07-01`))),
        label: String(y),
        hop: years.includes(y),
      }));
  const current = short ? candidates[index] : candidates.find((c) => c.label === stops[index]?.date?.slice(0, 4));
  const placed: Tick[] = [];
  for (const c of [...(current ? [current] : []), ...candidates.filter((c) => c.hop), ...candidates]) {
    if (!placed.includes(c) && placed.every((p) => Math.abs(p.x - c.x) >= LABEL_GAP)) placed.push(c);
  }
  return placed.sort((a, b) => a.x - b.x);
}

type Props = {
  trace: Trace;
  stops: Stop[];
  position: number;
  reducedMotion: boolean;
  red: number; // the stop where the wording changed, or -1
  onMove(position: number): void;
  onSettle(index: number): void;
};

export function Scrubber({ trace, stops, position, reducedMotion, red, onMove, onSettle }: Props) {
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
    const next = scrubberKey(e.key, index, last);
    if (next === null) return;
    e.preventDefault();
    onSettle(next);
  };

  const ticks = tickLabels(trace, stops, xs, index);
  const current = stops[index];
  const handleX = xAt(xs, position);
  return (
    <div className={red >= 0 ? "scrub has-red" : "scrub"}>
      <div className="track" ref={track} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="track-rest" />
        <div className="track-fill" style={{ ["--x" as string]: handleX }} />
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
        {red >= 0 && red + 1 < stops.length && (
          <span className="track-red" style={{ left: `${xs[red + 1]! * 100}%`, width: `${(xs[red]! - xs[red + 1]!) * 100}%` }} />
        )}
        {red >= 0 && (
          <span className={`red-label ${xs[red]! < 0.15 ? "start" : xs[red]! > 0.85 ? "end" : "middle"}`} style={{ left: `${xs[red]! * 100}%` }}>
            Wording changed here
          </span>
        )}
        {stops.map((s, i) => (
          <span key={s.spanId} className={`stop${i === index ? " lit" : ""}${i === red ? " red" : ""}`} style={{ left: `${xs[i]! * 100}%` }} />
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
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7M3 4v4.5h4.5M12 7.5V12l3 2" />
          </svg>
        </div>
      </div>
      <div className="ticks" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t.key} className={t.hop ? "hop" : ""} style={{ left: `${t.x * 100}%` }}>
            {t.label}
          </span>
        ))}
      </div>
      <div className="scrub-steps">
        <button type="button" className="btn secondary" disabled={index === last} onClick={() => onSettle(Math.min(last, index + 1))}>Earlier page</button>
        <button type="button" className="btn secondary" disabled={index === 0} onClick={() => onSettle(Math.max(0, index - 1))}>Newer page</button>
      </div>
    </div>
  );
}
