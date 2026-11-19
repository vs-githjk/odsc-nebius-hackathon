import { describe, expect, it } from "vitest";
import { independence } from "pz/headline";
import { loadTraces } from "../data/loadTraces.ts";
import { pageReceipt, rootRows, uncheckedParents } from "./roots.ts";

const { traces } = loadTraces();
const dev = traces.find(t => t.id === "dev-10")!;
describe("root receipts", () => {
  it("matches the real dev-10 headline and accounts for each page once", () => {
    const result = rootRows(dev);
    expect(result.counts).toEqual({ pages: 8, independentRoots: 6, copies: 2 });
    expect(result.rows).toHaveLength(6);
    expect(result.rows.flatMap(r => r.copies)).toHaveLength(2);
    expect(result.unrooted).toEqual([]);
  });
  it("matches the headline across fixtures without losing or duplicating non-meta nodes", () => {
    for (const trace of traces) {
      const result = rootRows(trace);
      expect(result.rows).toHaveLength(independence(trace).independentRoots);
      const ids = [...result.rows.flatMap(r => [r.node.id, ...r.copies.map(c => c.node.id)]), ...result.unrooted.map(p => p.node.id)];
      expect(ids.sort()).toEqual(trace.nodes.filter(n => !n.meta).map(n => n.id).sort());
    }
  });
  it("does not merge independent roots through inferred edges", () => {
    const trace = { ...dev, roots: { ...dev.roots, independentRoots: undefined, copies: undefined }, edges: dev.edges.map(e => ({ ...e, kind: "inferred" as const })) };
    expect(rootRows(trace).rows).toHaveLength(new Set(dev.nodes.filter(n => !n.meta).map(n => n.clusterId)).size);
  });
  it("keeps stored date precision and real archive links", () => {
    const node = dev.nodes.find(n => n.date.source === "wayback_first_capture" && n.date.value && dev.spans.some(s => s.nodeId === n.id && s.waybackUrl))!;
    const receipt = pageReceipt(dev, node);
    expect(receipt.evidence.label).toContain("First Wayback capture");
    expect(receipt.evidence.url).toBe(dev.spans.find(s => s.nodeId === node.id && s.waybackUrl)!.waybackUrl);
    expect(pageReceipt(dev, { ...node, date: { ...node.date, precision: "year" } }).date).toBe(node.date.value!.slice(0, 4));
  });
  it("shows only recorded unread cited pages", () => {
    for (const node of dev.nodes) expect(uncheckedParents(node).map(p => p.url)).toEqual(node.candidateParents.filter(p => !p.read).map(p => p.url));
    expect(uncheckedParents({ ...dev.nodes[0]!, candidateParents: [] })).toEqual([]);
  });
});
