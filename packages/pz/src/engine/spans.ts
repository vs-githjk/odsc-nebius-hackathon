import type { Edge, Trace } from "../schema/index.ts";
import { canonUrl } from "./walk.ts";

// Link-verified edges (T24). The walk found each page's span and kept the links that sit beside it as candidate
// parents (`candidateParents`, with `read: false` where the linked page could not be fetched). A candidate that
// resolves to another page in the trace becomes an explicit edge from the linking page (the child) to the linked
// page (the parent), backed by both pages' spans. The link gives the direction, so no date is needed: inferred
// edges, which do need dates, are left for after the dating stage.
export function linkEdges(trace: Trace): Edge[] {
  const pages = trace.nodes.filter((n) => !n.meta && n.read && n.spanIds.length > 0);
  const byUrl = new Map(pages.map((n) => [canonUrl(n.url), n]));
  const edges: Edge[] = [];
  for (const child of pages) {
    for (const candidate of child.candidateParents) {
      const parent = byUrl.get(canonUrl(candidate.url));
      if (!candidate.read || !parent || parent.id === child.id) continue;
      if (edges.some((e) => e.parentId === parent.id && e.childId === child.id)) continue;
      edges.push({
        id: `e${edges.length + 1}`, parentId: parent.id, childId: child.id, kind: "explicit",
        parentSpanId: parent.spanIds[0]!, childSpanId: child.spanIds[0]!, linkHref: canonUrl(parent.url),
      });
    }
  }
  return edges;
}

// The pipeline's spans stage (T29): adds the link-verified edges and changes nothing else.
export function spansStep<C>(): (trace: Trace, context: C) => Trace {
  return (trace) => ({ ...trace, edges: linkEdges(trace) });
}
