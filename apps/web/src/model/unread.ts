import type { Trace } from "pz/schema";

export type UnreadParent = { url: string; host: string; citedBy: string[] };

// Include pages that only discuss the claim, and retain every citing host for a shared URL.
export function unreadParents(trace: Trace): UnreadParent[] {
  const parents = new Map<string, UnreadParent>();
  for (const node of trace.nodes) {
    for (const parent of node.candidateParents) {
      if (parent.read) continue;
      const entry = parents.get(parent.url) ?? { url: parent.url, host: new URL(parent.url).host, citedBy: [] };
      const citingHost = new URL(node.url).host;
      if (!entry.citedBy.includes(citingHost)) entry.citedBy.push(citingHost);
      parents.set(parent.url, entry);
    }
  }
  return [...parents.values()];
}
