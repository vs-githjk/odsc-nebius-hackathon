import { independence } from "pz/headline";
import { datePhrase, type Node, type Trace } from "pz/schema";
import { dateEvidence } from "./receipt.ts";

export function pageReceipt(trace: Trace, node: Node) {
  return { node, host: new URL(node.url).host,
    date: node.date.value ? datePhrase(node.date.value, node.date.precision) : "Undated",
    evidence: dateEvidence(node, trace.spans.find(s => s.nodeId === node.id && s.waybackUrl) ?? trace.spans.find(s => s.nodeId === node.id), true) };
}

// Match computeRoots in pz/headline: non-meta nodes, node.clusterId, and only
// explicit inter-cluster edges determine independence. Inferred edges never merge roots.
export function rootRows(trace: Trace) {
  const pages = trace.nodes.filter(n => !n.meta).sort((a, b) =>
    (a.date.value ?? "9999").localeCompare(b.date.value ?? "9999") || a.id.localeCompare(b.id));
  const byId = new Map(pages.map(n => [n.id, n]));
  const clusters = [...new Set(pages.map(n => n.clusterId))];
  const links = trace.edges.filter(e => e.kind === "explicit" && byId.has(e.parentId) && byId.has(e.childId)
    && byId.get(e.parentId)!.clusterId !== byId.get(e.childId)!.clusterId);
  const incoming = new Set(links.map(e => byId.get(e.childId)!.clusterId));
  const roots = clusters.filter(c => !incoming.has(c));
  const owner = new Map(roots.map(c => [c, c]));
  // Deterministic first reachable root owns a shared descendant, so pages appear once.
  for (const root of roots) {
    const visit = (cluster: string, seen = new Set<string>()) => {
      if (seen.has(cluster)) return;
      seen.add(cluster);
      for (const edge of links.filter(e => byId.get(e.parentId)!.clusterId === cluster)) {
        const child = byId.get(edge.childId)!.clusterId;
        if (!owner.has(child)) owner.set(child, root);
        visit(child, seen);
      }
    };
    visit(root);
  }
  const relation = (node: Node, root: Node) => {
    const edge = trace.edges.find(e => e.childId === node.id && byId.has(e.parentId) && e.kind === "explicit")
      ?? trace.edges.find(e => e.childId === node.id && byId.has(e.parentId));
    if (edge) return `${edge.kind === "explicit" ? "Links to" : "Source inferred by date, no link:"} ${new URL(byId.get(edge.parentId)!.url).host}`;
    const rule = trace.clusters.find(c => c.id === node.clusterId)?.rule;
    const label = rule === "versions" ? "Version of" : rule === "same_byline" ? "Shares a byline with" : rule === "near_duplicate" ? "Similar wording to" : "Copies wording from";
    return `${label} ${new URL(root.url).host}`;
  };
  return {
    counts: independence(trace),
    rows: roots.map(cluster => {
      const root = pages.find(n => n.clusterId === cluster)!;
      return { ...pageReceipt(trace, root),
        inferred: trace.edges.filter(e => e.kind === "inferred" && e.childId === root.id && byId.has(e.parentId)).map(e => relation(root, byId.get(e.parentId)!)),
        copies: pages.filter(n => n.id !== root.id && owner.get(n.clusterId) === cluster)
          .map(n => ({ ...pageReceipt(trace, n), relation: relation(n, root) })) };
    }),
    // Explicit cycles have no independent root under computeRoots. Do not invent one.
    unrooted: pages.filter(n => !owner.has(n.clusterId)).map(n => pageReceipt(trace, n)),
  };
}

export function uncheckedParents(node: Node) {
  return node.candidateParents.filter(parent => !parent.read).map(parent => ({ url: parent.url, host: new URL(parent.url).host }));
}
