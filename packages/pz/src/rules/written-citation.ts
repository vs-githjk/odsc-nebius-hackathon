import type { Node, Trace } from "../schema/index.ts";
import { normalise } from "./normalise.ts";
import type { Rules } from "./rules.ts";

// #192 F4: a page can cite an earlier source in words, with no link: "In the November/December 2009 issue of World
// Watch, Goodland and Anhang published...". citesEarlier counts links only, so such a page could end as the origin
// (dev-13, the one false origin in the first live E2 run). Code alone, on the span itself (not the text around it,
// which on interview pages holds unrelated dated facts): a rules.json writtenCitationCues pattern matches, and the
// year inside that cited phrase (its `year` group) is before the page's own date. A year that is only part of the
// data ("emissions since 1988, according to the Carbon Majors Report") never counts (XO on #196).
export function writtenCitationYear(span: Pick<Trace["spans"][number], "text">, pageDate: string | null, rules: Pick<Rules, "writtenCitationCues">): number | null {
  const pageYear = pageDate ? Number(pageDate.slice(0, 4)) : NaN;
  if (!Number.isFinite(pageYear)) return null;
  const text = normalise(span.text);
  const years = rules.writtenCitationCues.flatMap((p) => [...text.matchAll(new RegExp(p, "giu"))].map((m) => Number(m.groups?.year)))
    .filter((y) => Number.isFinite(y) && y < pageYear);
  return years.length ? Math.min(...years) : null;
}

// The earliest year a page's spans cite in words, or null.
export function citesInWords(trace: Pick<Trace, "spans">, n: Node, rules: Pick<Rules, "writtenCitationCues">): number | null {
  const years = trace.spans.filter((s) => s.nodeId === n.id).map((s) => writtenCitationYear(s, n.date.value, rules)).filter((y): y is number => y !== null);
  return years.length ? Math.min(...years) : null;
}

// A page that presents the claim as already said ("the seemingly ubiquitous admonition to drink at least eight 8-oz
// glasses", "you have probably heard") repeats it, so it is never the origin. rules.json priorUseCues, on the page's
// own spans. dev-04 on the second live E2 run, Nov 17: a 2002 paper quoting the advice to question it ended as the origin.
export function presentsAsPrior(trace: Pick<Trace, "spans">, n: Node, rules: Pick<Rules, "priorUseCues">): string | null {
  for (const s of trace.spans.filter((x) => x.nodeId === n.id)) {
    const text = normalise(s.text);
    for (const p of rules.priorUseCues) {
      const m = new RegExp(p, "iu").exec(text);
      if (m) return m[0];
    }
  }
  return null;
}
