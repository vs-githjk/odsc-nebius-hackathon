import type { Edge, Hop, Node, Trace } from "pz/schema";

export type Stop = {
  edgeId: string | null; // the hop that reached this page from the newer stop; null on the first stop and on a second earliest page
  spanId: string;
  text: string;
  date: string | null;
  url: string;
  tier: "exact" | "normalised";
  inferred: boolean;
  unsure: boolean;
};

export type Word = { text: string; changed: boolean };

const byDateDesc = (a: Node, b: Node) => (b.date.value ?? "").localeCompare(a.date.value ?? "") || a.id.localeCompare(b.id);

// Every way back from `from` along edges to an earliest page, newest first.
function pathsBack(trace: Trace, from: Node, seen: Set<string> = new Set()): Edge[][] {
  if (trace.earliest.nodeIds.includes(from.id)) return [[]];
  const out: Edge[][] = [];
  for (const edge of trace.edges.filter((e) => e.childId === from.id && !seen.has(e.parentId))) {
    const parent = trace.nodes.find((n) => n.id === edge.parentId);
    if (!parent) continue;
    for (const rest of pathsBack(trace, parent, new Set([...seen, from.id]))) out.push([edge, ...rest]);
  }
  return out;
}

// The path the scrubber walks: from the newest page with a span back to an earliest page,
// through the red hop when one is on a path, else the longest path.
function chosenPath(trace: Trace): { start: Node; edges: Edge[] } | null {
  const pages = trace.nodes.filter((n) => !n.meta && n.spanIds.length > 0).sort(byDateDesc);
  for (const start of pages) {
    const paths = pathsBack(trace, start);
    if (paths.length === 0) continue;
    const score = (p: Edge[]) => (p.some((e) => e.id === trace.redHopEdgeId) ? 1000 : 0) + p.length;
    const best = [...paths].sort((a, b) => score(b) - score(a))[0]!;
    return { start, edges: best };
  }
  return null;
}

function stopFor(trace: Trace, node: Node, spanId: string, edge: Edge | null): Stop {
  const span = trace.spans.find((s) => s.id === spanId)!;
  const hop = edge && trace.hops.find((h) => h.edgeId === edge.id);
  return {
    edgeId: edge?.id ?? null, spanId, text: span.text, date: node.date.value, url: node.url, tier: span.tier,
    inferred: edge?.kind === "inferred", unsure: Boolean(hop?.readouts.some((r) => r.value === "unsure")),
  };
}

export function scrubberStops(trace: Trace): Stop[] {
  const path = chosenPath(trace);
  if (!path) return [];
  const node = (id: string) => trace.nodes.find((n) => n.id === id)!;
  const first = path.edges[0];
  const stops: Stop[] = [stopFor(trace, path.start, first?.childSpanId ?? path.start.spanIds[0]!, null)];
  for (const edge of path.edges) stops.push(stopFor(trace, node(edge.parentId), edge.parentSpanId, edge));

  // When the earliest pages disagree, the scrubber ends on every one of their wordings.
  if (trace.decision.state === "CONFLICTING") {
    const onPath = new Set([path.start.id, ...path.edges.map((e) => e.parentId)]);
    const others = trace.earliest.nodeIds.map(node).filter((n) => !onPath.has(n.id) && n.spanIds.length > 0);
    const ending = [stops.pop()!, ...others.map((n) => stopFor(trace, n, n.spanIds[0]!, null))];
    ending.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    stops.push(...ending);
  }
  return stops;
}

export function edgeStyle(kind: Edge["kind"]): { label: string; dash: string } {
  return kind === "explicit" ? { label: "link-verified", dash: "none" } : { label: "inferred, no link", dash: "6 5" };
}

// Position on the time axis: the earliest dated page at 0 (left), the newest at 1 (right).
export function dateToX(trace: Trace, date: string): number {
  const dated = trace.nodes.map((n) => n.date.value).filter((d): d is string => d !== null).map((d) => Date.parse(d));
  const min = Math.min(...dated);
  const max = Math.max(...dated);
  return max === min ? 0.5 : (Date.parse(date) - min) / (max - min);
}

const key = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

// The page's own words, marked from the stored diff. If the diff and the words cannot be lined up, nothing is marked.
function align(text: string, diff: Hop["wordDiff"], side: "child" | "parent"): Word[] {
  const words = text.split(" ");
  const keep = side === "child" ? "add" : "del";
  const tokens = diff.filter((d) => d.op === "same" || d.op === keep).flatMap((d) => d.text.split(" ").map((t) => ({ op: d.op, t })));
  const marked: Word[] = [];
  let i = 0;
  for (const word of words) {
    const k = key(word);
    if (!k) {
      marked.push({ text: word, changed: false });
      continue;
    }
    const token = tokens[i++];
    if (!token || token.t !== k) return words.map((w) => ({ text: w, changed: false }));
    marked.push({ text: word, changed: token.op === keep });
  }
  return i === tokens.length ? marked : words.map((w) => ({ text: w, changed: false }));
}

// Words at stop i: changed = new on this page compared with the next older stop.
export function wordsAt(trace: Trace, stops: Stop[], i: number): Word[] {
  const stop = stops[i]!;
  const olderEdge = trace.edges.find((e) => e.id === stops[i + 1]?.edgeId);
  const hop = olderEdge && olderEdge.childSpanId === stop.spanId && trace.hops.find((h) => h.edgeId === olderEdge.id);
  return hop ? align(stop.text, hop.wordDiff, "child") : stop.text.split(" ").map((text) => ({ text, changed: false }));
}

// Words at the older stop i, marked where they were dropped on the way to the newer stop i - 1.
export function wordsLeaving(trace: Trace, stops: Stop[], i: number): Word[] {
  const stop = stops[i]!;
  const edge = trace.edges.find((e) => e.id === stop.edgeId);
  const hop = edge && edge.parentSpanId === stop.spanId && trace.hops.find((h) => h.edgeId === edge.id);
  return hop ? align(stop.text, hop.wordDiff, "parent") : stop.text.split(" ").map((text) => ({ text, changed: false }));
}
