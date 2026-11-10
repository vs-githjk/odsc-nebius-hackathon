import type { Trace } from "pz/schema";
import { badgeFor } from "./badge.ts";

export function ModeBadge({ trace }: { trace: Trace }) {
  const { label, note } = badgeFor(trace);
  return (
    <span className="chip" data-mode={label}>
      {label}
      {note && <span className="chip-note">{note}</span>}
    </span>
  );
}
