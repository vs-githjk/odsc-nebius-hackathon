import type { Trace } from "pz/schema";
import { runs } from "../model/hop.ts";
import { wordsAt, wordsLeaving, type Stop } from "../model/scrubber.ts";

// The page's own words at a scrubber position. Between two stops the newer page's changed words fade out,
// then the older page's dropped words fade in. Nothing here is generated: every word is a stored span's.
export function Sentence({ trace, stops, position }: { trace: Trace; stops: Stop[]; position: number }) {
  const i = Math.min(Math.floor(position), stops.length - 1);
  const q = position - i;
  const older = q >= 0.5 && i + 1 < stops.length;
  const words = runs(older ? wordsLeaving(trace, stops, i + 1) : wordsAt(trace, stops, i));
  const fade = q === 0 ? 1 : older ? 2 * q - 1 : 1 - 2 * q;
  const resting = q === 0;
  return (
    <p className="quote sentence" aria-live="polite">
      {words.map((w, n) => (
        <span key={n}>
          <span
            className={w.changed && resting ? "w changed" : "w"}
            style={w.changed && !resting ? { opacity: fade } : undefined}
          >
            {w.text}
          </span>
          {n < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}
