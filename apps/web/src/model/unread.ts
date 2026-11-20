import type { Trace } from "pz/schema";
import rulesJson from "../../../../packages/pz/rules/rules.json";
import { bearingNodes, originPick } from "../../../../packages/pz/src/rules/decide.ts";
import type { Rules } from "../../../../packages/pz/src/rules/rules.ts";

export type UnreadParent = { url: string; host: string; citedBy: string[] };

const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };

// Every unread cited page, deduped by URL, with every host that cites it. Includes pages that only discuss the claim.
export function unreadParents(trace: Trace): UnreadParent[] {
  return collect(trace, trace.nodes);
}

// The same pages split the way the decision splits them (bearingNodes in decide.ts): "counted" ones bear on the claim
// and could block an origin; "setAside" ones are cited only by an off-topic fact-check off the origin's path. Under
// Origin found every unread page is set aside (otherwise row 5 would not hold), and the UI says why rather than hiding it.
export function unreadSplit(trace: Trace): { counted: UnreadParent[]; setAside: UnreadParent[] } {
  const originId = trace.decision.state === "ORIGIN_FOUND" ? originPick(trace, rulesJson as unknown as Rules)?.node.id ?? null : null;
  const bearing = new Set(bearingNodes(trace, originId).map(n => n.id));
  const counted = collect(trace, trace.nodes.filter(n => bearing.has(n.id)));
  const countedUrls = new Set(counted.map(p => p.url));
  const setAside = collect(trace, trace.nodes.filter(n => !bearing.has(n.id))).filter(p => !countedUrls.has(p.url));
  return { counted, setAside };
}

function collect(trace: Trace, nodes: Trace["nodes"]): UnreadParent[] {
  const parents = new Map<string, UnreadParent>();
  for (const node of nodes) {
    for (const parent of node.candidateParents) {
      if (parent.read) continue;
      const entry = parents.get(parent.url) ?? { url: parent.url, host: host(parent.url), citedBy: [] };
      const citingHost = host(node.url);
      if (!entry.citedBy.includes(citingHost)) entry.citedBy.push(citingHost);
      parents.set(parent.url, entry);
    }
  }
  return [...parents.values()];
}
