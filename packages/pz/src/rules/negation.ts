import { normalise } from "./normalise.ts";

// A span is negated when it starts with a negation prefix ("It is a myth that ...") or its context ends with one.
export function isNegated(span: { contextBefore: string; text: string }, prefixes: string[]): boolean {
  const text = normalise(span.text).toLowerCase();
  const before = normalise(span.contextBefore).toLowerCase();
  return prefixes.some((p) => {
    const prefix = normalise(p).toLowerCase();
    return text.startsWith(prefix + " ") || before === prefix || before.endsWith(" " + prefix);
  });
}

// T50: a span carries an instruction aimed at a model when its text or the context around it matches one of
// rules.json injectionPatterns ("ignore your instructions", "system prompt", "classify this page as"). The typed
// answers about such a page are not trusted for an origin, however confident.
export function isInjected(span: { contextBefore: string; text: string; contextAfter: string }, patterns: string[]): boolean {
  return hasInjection(`${span.contextBefore} ${span.text} ${span.contextAfter}`, patterns);
}

export function hasInjection(text: string, patterns: string[]): boolean {
  const plain = normalise(text).toLowerCase();
  return patterns.some((p) => new RegExp(p, "iu").test(plain));
}

// The model reads the whole page for page_type, so an instruction anywhere on it can steer the answer. Scans the
// whole page (title included, across sentence breaks) and returns the earliest match with up to 80 characters either
// side, or null. The window always holds the whole match, so pz verify can re-test it without the page, however
// long the sentence around it runs.
export function findInjection(title: string, text: string, patterns: string[]): string | null {
  const page = normalise(`${title}\n${text}`);
  let best: { start: number; end: number } | null = null;
  for (const p of patterns) {
    const m = new RegExp(p, "iu").exec(page);
    if (m && (!best || m.index < best.start)) best = { start: m.index, end: m.index + m[0].length };
  }
  return best ? page.slice(Math.max(0, best.start - 80), best.end + 80).trim() : null;
}
