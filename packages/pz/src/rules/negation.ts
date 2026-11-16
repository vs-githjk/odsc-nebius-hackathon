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
  const text = normalise(`${span.contextBefore} ${span.text} ${span.contextAfter}`).toLowerCase();
  return patterns.some((p) => new RegExp(p, "iu").test(text));
}
