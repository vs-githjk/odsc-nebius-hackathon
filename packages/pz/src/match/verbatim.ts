import { loadRules, normalise } from "../rules/index.ts";
import type { MatchTier } from "../schema/index.ts";

export type SpanHit = { start: number; end: number; tier: MatchTier };
export type SpanMiss = { rejected: "not_found" | "negated" };

const ALNUM = /[\p{L}\p{N}]/u;
const FOLLOWING_NEGATION = /^\s+(?:not|no|never|none|nor|without)(?![\p{L}\p{N}])/iu;

// A match may not start or end inside a word or a longer number, so 8 is not found in 18 or 8.5.
function onBoundary(page: string, start: number, end: number): boolean {
  const before = page[start - 1] ?? "";
  const after = page[end] ?? "";
  if (ALNUM.test(before) && ALNUM.test(page[start] ?? "")) return false;
  if (ALNUM.test(after) && ALNUM.test(page[end - 1] ?? "")) return false;
  if (/\d/.test(page[start] ?? "") && /[.,]/.test(before) && /\d/.test(page[start - 2] ?? "")) return false;
  return !(/\d/.test(page[end - 1] ?? "") && /[.,]/.test(after) && /\d/.test(page[end + 1] ?? ""));
}

function negated(page: string, start: number, end: number, prefixes: string[]): boolean {
  // Read what follows through the normaliser too, so a soft hyphen inside "not" cannot hide it.
  if (FOLLOWING_NEGATION.test(normalise(`x${page.slice(end, end + 16)}`).slice(1))) return true;
  // Read the prefix through the normaliser, so a no-break space or soft hyphen cannot hide it.
  const before = normalise(`${page.slice(0, start)}x`).slice(0, -1).trimEnd().toLowerCase();
  return prefixes.some((p) => {
    const prefix = p.toLowerCase();
    return before.endsWith(prefix) && !ALNUM.test(before[before.length - prefix.length - 1] ?? "");
  });
}

function search(page: string, span: string, tier: MatchTier, prefixes: string[]): SpanHit | SpanMiss {
  let sawNegated = false;
  for (let at = page.indexOf(span); at >= 0; at = page.indexOf(span, at + 1)) {
    const end = at + span.length;
    if (!onBoundary(page, at, end)) continue;
    if (!negated(page, at, end, prefixes)) return { start: at, end, tier };
    sawNegated = true;
  }
  return { rejected: sawNegated ? "negated" : "not_found" };
}

// Exact tier first, then the normalised tier, whose offsets refer to the normalised page. Digits and negations are never fuzzed.
export function findSpan(pageText: string, spanText: string, prefixes: string[] = loadRules().negationPrefixes): SpanHit | SpanMiss {
  const exact = search(pageText, spanText, "exact", prefixes);
  if ("start" in exact || exact.rejected === "negated") return exact;
  return search(normalise(pageText), normalise(spanText), "normalised", prefixes);
}
