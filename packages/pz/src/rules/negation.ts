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

// The model reads the whole page for page_type, so an instruction anywhere on it can steer the answer. Returns the
// first stretch of the page (title included) that matches a pattern, quoted up to 300 characters, or null. The walker
// stores it on the node so pz verify can re-test it without the page.
export function findInjection(title: string, text: string, patterns: string[]): string | null {
  for (const part of [title, ...text.split(/(?<=[.!?])\s+|\n+/)]) {
    const piece = part.trim();
    if (piece && hasInjection(piece, patterns)) return piece.slice(0, 300);
  }
  return null;
}
