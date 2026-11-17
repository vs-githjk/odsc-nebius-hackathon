import type { Node, Trace } from "../schema/index.ts";
import { normalise } from "./normalise.ts";
import type { Rules } from "./rules.ts";

// #192 F4: a page can cite an earlier source in words, with no link: "In the November/December 2009 issue of World
// Watch, Goodland and Anhang published...". citesEarlier counts links only, so such a page could end as the origin
// (dev-13, the one false origin in the first live E2 run). Code alone, on the span itself (not the text around it,
// which on interview pages holds unrelated dated facts): the span names a year before the page's own date AND
// matches one of rules.json writtenCitationCues. The earlier year comes back so the reason can quote it.
const YEAR = /(?<![\d.,])(1[5-9]\d{2}|20\d{2})(?![\d.,]*\d)/g;

export function writtenCitationYear(span: Pick<Trace["spans"][number], "text">, pageDate: string | null, rules: Pick<Rules, "writtenCitationCues">): number | null {
  const pageYear = pageDate ? Number(pageDate.slice(0, 4)) : NaN;
  if (!Number.isFinite(pageYear)) return null;
  const text = normalise(span.text);
  if (!rules.writtenCitationCues.some((p) => new RegExp(p, "iu").test(text))) return null;
  const earlier = [...text.matchAll(YEAR)].map((m) => Number(m[1])).filter((y) => y < pageYear);
  return earlier.length ? Math.min(...earlier) : null;
}

// The earliest year a page's spans cite in words, or null.
export function citesInWords(trace: Pick<Trace, "spans">, n: Node, rules: Pick<Rules, "writtenCitationCues">): number | null {
  const years = trace.spans.filter((s) => s.nodeId === n.id).map((s) => writtenCitationYear(s, n.date.value, rules)).filter((y): y is number => y !== null);
  return years.length ? Math.min(...years) : null;
}
