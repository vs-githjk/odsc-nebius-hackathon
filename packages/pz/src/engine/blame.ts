import type { Blame, Edge, Node, Span } from "../schema/index.ts";
import { words } from "./readouts.ts";

// Each word of the viral sentence is blamed on the earliest non-meta page whose span has it, null when no page does
// ("first seen here in what we found"). Pages with no date sort last, so an undated page never claims a word first.
// viaInferredHop: that page is reached only by inferred edges, never by a link.
export function blameWords(viralSentence: string, nodes: Node[], spans: Span[], edges: Edge[]): Blame[] {
  const byDate = nodes.filter((n) => !n.meta)
    .sort((a, b) => (a.date.value ?? "9999").localeCompare(b.date.value ?? "9999") || a.id.localeCompare(b.id));
  const spanWords = new Map(spans.map((s) => [s.id, words(s.text)]));
  return words(viralSentence).map((word, index) => {
    const first = byDate.map((n) => ({ n, s: n.spanIds.find((id) => spanWords.get(id)?.includes(word)) })).find((x) => x.s);
    const into = first ? edges.filter((e) => e.childId === first.n.id) : [];
    const viaInferredHop = into.some((e) => e.kind === "inferred") && !into.some((e) => e.kind === "explicit");
    return { index, word, firstSeen: first ? { spanId: first.s!, nodeId: first.n.id, date: first.n.date.value } : null, viaInferredHop };
  });
}
