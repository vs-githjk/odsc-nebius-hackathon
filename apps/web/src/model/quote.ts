import type { Word } from "./scrubber.ts";

const normal = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// Only known, leading UI phrases are removed. The remaining quote is an exact suffix.
// A phrase present in the submitted claim is protected, even when it looks like UI.
export function cleanQuote(text: string, claim: string): string {
  const patterns = [
    /^\s*log\s*in\s*/i, /^\s*sign\s*up\s*/i,
    /^\s*skip to (?:main )?content\s*[:|]?\s*/i,
    /^\s*[^\n:]{1,100} on X:\s*/i,
    /^\s*(?:we use cookies[^.!?]*[.!?]\s*)(?:(?:accept all|reject all|manage cookies)\s*)*/i,
    /^\s*(?:accept all cookies|reject all cookies|cookie settings)\s*[:|]?\s*/i,
  ];
  let rest = text;
  for (;;) {
    const prefix = patterns.map(pattern => rest.match(pattern)?.[0]).find(Boolean);
    if (!prefix || !rest.slice(prefix.length).trim()) return rest;
    const protectedText = normal(claim);
    const removed = normal(prefix);
    const claimWords = new Set(protectedText.split(" "));
    // When the stored wording differs from the submitted claim, err on keeping
    // boilerplate if it shares a substantive word with the claim match.
    if (removed.split(" ").some(word => word.length > 2 && claimWords.has(word))) return rest;
    // Protect a full claim starting inside the prefix, or a UI phrase used by the claim.
    if (protectedText && (protectedText.includes(removed) || normal(rest).includes(protectedText) && normal(rest).indexOf(protectedText) < removed.length)) return rest;
    rest = rest.slice(prefix.length);
  }
}

// Clean after diff alignment so deleting a menu cannot shift changed-word markings.
export function cleanQuoteWords(words: Word[], claim: string): Word[] {
  const text = words.map(word => word.text).join(" ");
  let skip = text.length - cleanQuote(text, claim).length;
  return words.flatMap(word => {
    if (skip >= word.text.length) { skip -= word.text.length + 1; return []; }
    const next = { ...word, text: word.text.slice(Math.max(0, skip)) };
    skip = 0;
    return [next];
  });
}
