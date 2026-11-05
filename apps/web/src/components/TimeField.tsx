// The colour field behind the stage: the time ramp, warmest at today, with a glow that follows the handle.
export function TimeField({ x }: { x: number }) {
  return (
    <div className="time-field" aria-hidden="true">
      <div className="time-field-glow" style={{ left: `${x * 100}%` }} />
    </div>
  );
}
