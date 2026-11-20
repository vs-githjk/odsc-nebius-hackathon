// Stops are newest first. Left and Home move toward the oldest page.
export function scrubberKey(key: string, index: number, last: number): number | null {
  const steps: Record<string, number> = { ArrowLeft: index + 1, ArrowDown: index + 1, ArrowRight: index - 1, ArrowUp: index - 1, Home: last, End: 0 };
  const next = Object.hasOwn(steps, key) ? steps[key] : undefined;
  return next === undefined ? null : Math.min(last, Math.max(0, next));
}

export function closeDetails(event: { key: string; target: EventTarget | null; preventDefault(): void; stopPropagation(): void }) {
  if (event.key !== "Escape") return;
  const target = event.target as Element | null;
  const details = target?.closest<HTMLDetailsElement>("details[open]");
  if (!details) return;
  const summary = details.querySelector<HTMLElement>(":scope > summary");
  if (!summary) return;
  event.preventDefault();
  event.stopPropagation();
  details.open = false;
  summary.focus({ preventScroll: true });
}
