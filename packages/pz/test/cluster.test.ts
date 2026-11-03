import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clusterNodes, computeRoots, type Embed } from "../src/engine/cluster.ts";
import { loadRules } from "../src/rules/index.ts";
import type { Edge, Node, Span, Trace } from "../src/schema/index.ts";

const rules = loadRules();

const node = (id: string, over: Partial<Node> = {}): Node => ({
  id, url: `https://${id}.example/page`, domain: `${id}.example`, title: id,
  date: { kind: "published", value: "2020-01-01", source: "metadata", firstCapture: null, conflictingDate: false },
  clusterId: "", evidence: "observed", meta: false, read: true, versionOf: null, spanIds: [`s-${id}`],
  citesEarlier: false, candidateParents: [], pageType: null, ...over,
});
const span = (nodeId: string, text: string): Span => ({
  id: `s-${nodeId}`, nodeId, text, contextBefore: "", contextAfter: "", start: 0, end: text.length,
  extractSha256: "x", windowSha256: "x", fetchedAt: "2026-11-01T00:00:00Z", waybackUrl: null, tier: "exact",
});
const edge = (id: string, parentId: string, childId: string, kind: Edge["kind"]): Edge => ({
  id, parentId, childId, kind, parentSpanId: `s-${parentId}`, childSpanId: `s-${childId}`,
  linkHref: kind === "explicit" ? `https://${parentId}.example/page` : null,
});

// Hand-made vectors, keyed by the span text; any text not listed gets its own orthogonal axis.
function fakeEmbed(vectors: Record<string, number[]> = {}): Embed & { calls: string[][] } {
  const calls: string[][] = [];
  const embed = async (texts: string[]) => {
    calls.push(texts);
    return texts.map((t, i) => vectors[t] ?? Array.from({ length: 64 }, (_, j) => (j === 32 + i ? 1 : 0)));
  };
  return Object.assign(embed, { calls });
}
const groups = (clusters: { nodeIds: string[] }[]) => clusters.map((c) => [...c.nodeIds].sort()).sort();

describe("clusterNodes", () => {
  it("[C4] collapses syndicated copies with identical wording", async () => {
    const text = "Harbor Zoo penguins nap 14 times a day.";
    const { clusters } = await clusterNodes({ nodes: [node("a"), node("b"), node("c")], spans: [span("a", text), span("b", text), span("c", "Seals nap 7 times.")] }, fakeEmbed(), rules);
    expect(groups(clusters)).toEqual([["a", "b"], ["c"]]);
    expect(clusters.find((c) => c.nodeIds.includes("a"))!.rule).toBe("syndicated");
    expect(clusters.find((c) => c.nodeIds.includes("c"))!.rule).toBe("single");
  });

  it("[C4] collapses version nodes into their original", async () => {
    const nodes = [node("v1"), node("v2", { versionOf: "v1" })];
    const { clusters } = await clusterNodes({ nodes, spans: [span("v1", "Penguins nap 14 times."), span("v2", "Penguins nap 14 times, twice as often as seals.")] }, fakeEmbed(), rules);
    expect(clusters).toEqual([{ id: "c-v1", nodeIds: ["v1", "v2"], rule: "versions" }]);
  });

  it("[C4] joins near-duplicates at or above the threshold and keeps the rest apart", async () => {
    const t = rules.clusterSimilarityThreshold;
    const vectors = { "A one.": [1, 0], "A two.": [t, Math.sqrt(1 - t * t)], "Far away.": [0, 1] };
    const { clusters } = await clusterNodes({ nodes: [node("a"), node("b"), node("c")], spans: [span("a", "A one."), span("b", "A two."), span("c", "Far away.")] }, fakeEmbed(vectors), rules);
    expect(groups(clusters)).toEqual([["a", "b"], ["c"]]);
    expect(clusters.find((c) => c.nodeIds.includes("a"))!.rule).toBe("near_duplicate");
  });

  it("[C4] joins pages with the same byline when bylines are supplied", async () => {
    const { clusters } = await clusterNodes({ nodes: [node("a"), node("b")], spans: [span("a", "One."), span("b", "Two.")], bylines: { a: "Zoo staff", b: "Zoo staff" } }, fakeEmbed(), rules);
    expect(clusters).toEqual([{ id: "c-a", nodeIds: ["a", "b"], rule: "same_byline" }]);
  });

  it("[C4] keeps meta pages out of every cluster and out of the embedding call", async () => {
    const text = "It is a myth that penguins nap 14 times a day.";
    const embed = fakeEmbed();
    const { clusters } = await clusterNodes({
      nodes: [node("m", { meta: true }), node("a"), node("b")],
      spans: [span("m", text), span("a", text), span("b", "Seals nap 7 times.")],
    }, embed, rules);
    expect(groups(clusters)).toEqual([["a"], ["b"], ["m"]]);
    expect(embed.calls.flat()).toEqual([text, "Seals nap 7 times."]);
  });

  it("is deterministic and orders cluster ids by the earliest page", async () => {
    const nodes = [node("late", { date: { ...node("x").date, value: "2022-01-01" } }), node("early", { date: { ...node("x").date, value: "2019-01-01" }, versionOf: null })];
    const text = "Penguins nap 14 times.";
    const input = { nodes, spans: [span("late", text), span("early", text)] };
    const first = await clusterNodes(input, fakeEmbed(), rules);
    expect(first.clusters[0]!.id).toBe("c-early");
    expect(await clusterNodes(input, fakeEmbed(), rules)).toEqual(first);
  });
});

describe("computeRoots", () => {
  const nodes = ["a", "b", "c"].map((id) => node(id, { clusterId: `c-${id}` }));

  it("[C4] counts a root only through link-verified edges", () => {
    expect(computeRoots(nodes, [edge("e1", "a", "b", "explicit"), edge("e2", "b", "c", "explicit")]))
      .toEqual({ pages: 3, clusters: 3, rootsLinked: 1, clustersUnlinked: 0, studiesFound: null });
  });

  it("[C4] counts clusters joined only by inferred edges as unlinked", () => {
    expect(computeRoots(nodes, [edge("e1", "a", "b", "explicit"), edge("e2", "b", "c", "inferred")]))
      .toEqual({ pages: 3, clusters: 3, rootsLinked: 1, clustersUnlinked: 1, studiesFound: null });
    expect(computeRoots(nodes, [edge("e1", "a", "b", "inferred")]))
      .toEqual({ pages: 3, clusters: 3, rootsLinked: 0, clustersUnlinked: 3, studiesFound: null });
  });

  it("[C4] ignores edges inside one cluster and meta pages", () => {
    const merged = [node("a", { clusterId: "c-a" }), node("b", { clusterId: "c-a" }), node("m", { clusterId: "c-m", meta: true })];
    expect(computeRoots(merged, [edge("e1", "a", "b", "explicit"), edge("e2", "m", "a", "explicit")]))
      .toEqual({ pages: 2, clusters: 1, rootsLinked: 0, clustersUnlinked: 1, studiesFound: null });
  });
});

describe("on the synthetic fixtures", () => {
  const dir = new URL("../../../fixtures/traces/", import.meta.url);
  const traces: Trace[] = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));

  it("[C4] reproduces every fixture's cluster membership", async () => {
    for (const t of traces) {
      // Nodes carry no byline yet (T24), so the fixture's same_byline grouping is supplied as input.
      const bylines = Object.fromEntries(t.clusters.filter((c) => c.rule === "same_byline").flatMap((c) => c.nodeIds.map((id) => [id, c.id])));
      const { clusters } = await clusterNodes({ nodes: t.nodes, spans: t.spans, bylines }, fakeEmbed(), rules);
      expect(groups(clusters), t.id).toEqual(groups(t.clusters));
    }
  });

  it("[C4] reproduces every fixture's roots counter", () => {
    for (const t of traces) expect(computeRoots(t.nodes, t.edges), t.id).toEqual(t.roots);
  });
});
