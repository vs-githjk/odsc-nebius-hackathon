import { heat } from "../model/scrubber.ts";

// The colour field behind the stage: two soft blobs whose hue follows the scrubber along the time ramp.
export function TimeField({ x }: { x: number }) {
  return (
    <div className="time-field" aria-hidden="true" style={{ ["--heat" as string]: heat(x), ["--heat-far" as string]: heat(Math.max(0, x - 0.35)) }}>
      <div className="time-blob near" style={{ left: `${10 + x * 70}%` }} />
      <div className="time-blob far" />
    </div>
  );
}
