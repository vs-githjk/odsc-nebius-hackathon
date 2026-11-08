// The normalised tier: NFKC, soft hyphens removed, non-breaking spaces to spaces,
// curly quotes to straight, look-alike dashes (including U+2212) to "-", whitespace collapsed.
export function normalise(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\u00AD/g, "")
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, "\"")
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const NEGATIONS = new Set(["not", "no", "never", "none", "nor", "without"]);
const NUMBER_TOKEN = /^(?:\d+(?:,\d+)*(?:\.\d+)?|\.\d+)%?$/;

// Tokens that must never be fuzzed by any matcher: negations and numbers, in text order.
export function protectedTokens(text: string): string[] {
  const out: string[] = [];
  for (const word of normalise(text).split(" ")) {
    const token = word.replace(/^[^\p{L}\p{N}.]+|[^\p{L}\p{N}%]+$/gu, "");
    if (NEGATIONS.has(token.toLowerCase()) || NUMBER_TOKEN.test(token)) out.push(token);
  }
  return out;
}
