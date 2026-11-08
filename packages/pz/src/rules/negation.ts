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
