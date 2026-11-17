import type { Node, Trace } from "../schema/index.ts";
import { normalise } from "./normalise.ts";
import type { Rules } from "./rules.ts";

// T37 (#87): where a cold trail ends, said plainly. Three boundaries, checked on the earliest pages only:
// - print: the typed boundary question says "print" with a confidence that clears the threshold, AND code finds a
//   print cue (rules.json printCues) in the sentence or the text around it, AND the page cites no link we never
//   opened (an unread link could be the web copy, so "no web copy to open" would be untrue);
// - unsourced: the typed answer says "unsourced", AND the page is on an editable domain (rules.json
//   editableDomains), AND it cites nothing beside the sentence;
// - circular: code alone. Every earliest page cites something, and everything it cites is a page already in the
//   trace that is no earlier than it, so the pages only point at each other or at later copies.
// The model never picks the ending: a typed answer without code's agreement counts for nothing.

export type Boundary = "print" | "unsourced" | "circular";
export const BOUNDARY_REASONS: Record<Boundary, string> = {
  print: "boundary print: the earliest page credits a print source, with no web copy to open",
  unsourced: "boundary unsourced: the earliest page is an editable page that gives no source for the claim",
  circular: "boundary circular: the earliest pages only cite each other or later pages",
};

const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };

function confidentAnswer(n: Node, optionId: string, rules: Pick<Rules, "confidenceThreshold">): boolean {
  const a = n.boundary;
  return !!a && a.optionId === optionId && a.probability !== null && (rules.confidenceThreshold === null || a.probability >= rules.confidenceThreshold);
}

export function findBoundary(trace: Trace, rules: Pick<Rules, "printCues" | "editableDomains" | "confidenceThreshold">): Boundary | null {
  const earliest = trace.nodes.filter((n) => !n.meta && trace.earliest.nodeIds.includes(n.id));
  if (!earliest.length) return null;
  const textOf = (n: Node) => trace.spans.filter((s) => s.nodeId === n.id).map((s) => normalise(`${s.contextBefore} ${s.text} ${s.contextAfter}`)).join(" ");
  const cue = (text: string) => rules.printCues.some((p) => new RegExp(p, "iu").test(text));
  const byUrl = new Map(trace.nodes.map((n) => [n.url, n]));
  const unread = (n: Node) => n.candidateParents.some((p) => !p.read && !byUrl.has(p.url));
  if (earliest.some((n) => confidentAnswer(n, "print", rules) && cue(textOf(n)) && !unread(n))) return "print";
  const editable = (n: Node) => rules.editableDomains.some((d) => host(n.url) === d || host(n.url).endsWith(`.${d}`));
  if (earliest.some((n) => confidentAnswer(n, "unsourced", rules) && editable(n) && n.candidateParents.length === 0)) return "unsourced";
  const circular = earliest.every((n) => n.candidateParents.length > 0 && n.candidateParents.every((p) => {
    const cited = byUrl.get(p.url);
    return !!cited && cited.id !== n.id && !(cited.date.value && n.date.value && cited.date.value < n.date.value);
  }));
  return circular ? "circular" : null;
}
