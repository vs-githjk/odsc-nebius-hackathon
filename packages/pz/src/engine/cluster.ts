import { normalise } from "../rules/normalise.ts";
import type { Rules } from "../rules/rules.ts";
import type { Cluster, Edge, Node, Roots, Span } from "../schema/index.ts";

// Text in, one vector per text out. Tests inject hand-made vectors; T18's tokenfactory.embed plugs in later.
export type Embed = (texts: string[]) => Promise<number[][]>;
export type ClusterInput = {
  nodes: Node[];
  spans: Span[];
  bylines?: Record<string, string>;   // node id to byline, once T24 extracts them; nodes carry no byline field yet
};

// Stronger rules win when several joined the same cluster.
const PRIORITY: Cluster["rule"][] = ["versions", "syndicated", "same_byline", "near_duplicate"];

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  a.forEach((x, i) => { dot += x * (b[i] ?? 0); na += x * x; nb += (b[i] ?? 0) ** 2; });
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// Groups copies by a stated rule: version pairs, syndicated copies (same normalised wording), same byline,
// then near-duplicates by embedding similarity at or above rules.clusterSimilarityThreshold. Meta pages stay alone.
export async function clusterNodes(input: ClusterInput, embed: Embed, rules: Rules): Promise<{ clusters: Cluster[]; clusterOf: Record<string, string> }> {
  const byDate = [...input.nodes].sort((a, b) => (a.date.value ?? "9999").localeCompare(b.date.value ?? "9999") || a.id.localeCompare(b.id));
  const pages = byDate.filter((n) => !n.meta);
  const parent = new Map(byDate.map((n) => [n.id, n.id]));
  const joined = new Map<string, Cluster["rule"][]>();
  const find = (id: string): string => (parent.get(id) === id ? id : find(parent.get(id)!));
  const union = (a: string, b: string, rule: Cluster["rule"]) => {
    const [ra, rb] = [find(a), find(b)];
    const rules_ = [...(joined.get(ra) ?? []), ...(joined.get(rb) ?? []), rule];
    if (ra !== rb) parent.set(rb, ra);
    joined.set(ra, rules_);
  };
  const textOf = new Map(pages.map((n) => [n.id, normalise(input.spans.find((s) => s.nodeId === n.id)?.text ?? "")]));

  for (const n of pages) if (n.versionOf && textOf.has(n.versionOf)) union(n.versionOf, n.id, "versions");
  pages.forEach((a, i) => pages.slice(i + 1).forEach((b) => {
    if (textOf.get(a.id) && textOf.get(a.id) === textOf.get(b.id)) union(a.id, b.id, "syndicated");
    const [ba, bb] = [input.bylines?.[a.id], input.bylines?.[b.id]];
    if (ba && ba === bb) union(a.id, b.id, "same_byline");
  }));

  const withText = pages.filter((n) => textOf.get(n.id));
  const vectors = withText.length > 1 ? await embed(withText.map((n) => textOf.get(n.id)!)) : [];
  withText.forEach((a, i) => withText.slice(i + 1).forEach((b, j) => {
    if (find(a.id) !== find(b.id) && cosine(vectors[i]!, vectors[i + 1 + j]!) >= rules.clusterSimilarityThreshold) union(a.id, b.id, "near_duplicate");
  }));

  const members = new Map<string, string[]>();
  for (const n of byDate) members.set(find(n.id), [...(members.get(find(n.id)) ?? []), n.id]);
  const clusters: Cluster[] = [...members.entries()].map(([root, nodeIds]) => ({
    id: `c-${nodeIds[0]}`, nodeIds,
    rule: nodeIds.length === 1 ? "single" : PRIORITY.find((r) => joined.get(root)?.includes(r)) ?? "single",
  }));
  const clusterOf = Object.fromEntries(clusters.flatMap((c) => c.nodeIds.map((id) => [id, c.id])));
  return { clusters, clusterOf };
}

// "Traced to N roots we could link (M clusters unlinked)". Only link-verified (explicit) edges between different
// clusters count: a root has outgoing links and no incoming one; a cluster with no explicit link at all is unlinked,
// even when an inferred edge joins it. Meta pages are not counted. studiesFound waits for page types (T28).
export function computeRoots(nodes: Node[], edges: Edge[]): Roots {
  const pages = nodes.filter((n) => !n.meta);
  const clusterOf = new Map(pages.map((n) => [n.id, n.clusterId]));
  const clusters = new Set(pages.map((n) => n.clusterId));
  const links = edges.filter((e) => e.kind === "explicit" && clusterOf.has(e.parentId) && clusterOf.has(e.childId)
    && clusterOf.get(e.parentId) !== clusterOf.get(e.childId));
  const from = new Set(links.map((e) => clusterOf.get(e.parentId)!));
  const into = new Set(links.map((e) => clusterOf.get(e.childId)!));
  return {
    pages: pages.length,
    clusters: clusters.size,
    rootsLinked: [...clusters].filter((c) => from.has(c) && !into.has(c)).length,
    clustersUnlinked: [...clusters].filter((c) => !from.has(c) && !into.has(c)).length,
    studiesFound: null,
  };
}
