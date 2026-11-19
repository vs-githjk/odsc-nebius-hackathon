// A quote as shown on screen: the page's sentence without the emoji, arrows and bullets a page (often a social post)
// puts in front of it. Only the display changes: the trace keeps the sentence exactly as recorded. Shared by the
// landing page and the trace view (#257, #259).
const LEADING_JUNK = /^[^\p{L}\p{N}"“‘'(\[$£€]+/u;

export function displayQuote(text: string): string {
  const cleaned = text.replace(LEADING_JUNK, "").trimStart();
  return cleaned.length > 0 ? cleaned : text;
}

// The same, cut to a length for a preview, ending on a word.
export function previewQuote(text: string, max: number): string {
  const q = displayQuote(text);
  if (q.length <= max) return q;
  const cut = q.slice(0, max - 3);
  const atWord = cut.slice(0, cut.lastIndexOf(" ") > max / 2 ? cut.lastIndexOf(" ") : cut.length);
  return `${atWord.trimEnd()}...`;
}
