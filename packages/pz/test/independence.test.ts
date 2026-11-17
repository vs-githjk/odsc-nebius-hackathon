import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { independence, independenceLine } from "../src/card/headline.ts";
import { renderCard } from "../src/card/terminal.ts";
import { lintText } from "../src/cli/lint-copy.ts";
import { computeRoots } from "../src/engine/cluster.ts";
import { Trace, type Edge, type Node } from "../src/schema/index.ts";
import { verifyTrace } from "../src/verify/checks.ts";
import { originWords } from "../src/verify/false-certainty.ts";

const root = new URL("../../../", import.meta.url);
const load = (path: string): Trace => Trace.parse(JSON.parse(readFileSync(new URL(path, root), "utf8")));
const fixtures = readdirSync(new URL("fixtures/traces/", root)).filter((f) => f.endsWith(".json")).map((f) => load(`fixtures/traces/${f}`));

const node = (id: string, clusterId: string, meta = false): Node => ({
  id, url: `https://${id}.example/page`, domain: `${id}.example`, title: id,
  date: { kind: "published", value: "2020-01-01", source: "metadata", firstCapture: null, conflictingDate: false },
  clusterId, evidence: "observed", meta, read: true, versionOf: null, spanIds: [`s-${id}`],
  citesEarlier: false, candidateParents: [], pageType: null,
});
const edge = (parentId: string, childId: string, kind: Edge["kind"] = "explicit"): Edge => ({
  id: `${parentId}-${childId}`, parentId, childId, kind, parentSpanId: `s-${parentId}`, childSpanId: `s-${childId}`,
  linkHref: kind === "explicit" ? `https://${parentId}.example/page` : null,
});
const counts = (nodes: Node[], edges: Edge[]) => { const r = computeRoots(nodes, edges); return [r.pages, r.independentRoots, r.copies]; };

describe("T94 independence count", () => {
  it("all copies of one root: copies in its cluster and pages that link back to it", () => {
    const nodes = [node("a", "c1"), node("b", "c1"), node("c", "c2"), node("d", "c3")];
    expect(counts(nodes, [edge("a", "c"), edge("c", "d")])).toEqual([4, 1, 3]);
  });

  it("two independent roots: two clusters with no link-verified page before either", () => {
    const nodes = [node("a", "c1"), node("b", "c1"), node("x", "c2")];
    expect(counts(nodes, [])).toEqual([3, 2, 1]);
    // An inferred edge is not a verified link, so it does not make a page a copy.
    expect(counts(nodes, [edge("a", "x", "inferred")])).toEqual([3, 2, 1]);
    const t: Pick<Trace, "roots" | "nodes" | "edges" | "decision"> = { roots: computeRoots(nodes, []), nodes, edges: [], decision: { state: "CONFLICTING", row: 4, reasons: [], counts: {} } };
    expect(independenceLine(t)).toBe("Found on 3 pages: 2 independent roots. 1 is a copy.");
  });

  it("zero pages, and meta pages are never counted", () => {
    expect(counts([], [])).toEqual([0, 0, 0]);
    expect(counts([node("m", "c9", true)], [])).toEqual([0, 0, 0]);
    expect(counts([node("a", "c1"), node("m", "c9", true)], [edge("m", "a")])).toEqual([1, 1, 0]);
  });

  it("pages always equal independent roots plus copies, on every fixture and spike trace", () => {
    const spike = readdirSync(new URL("spike/traces/", root)).filter((f) => f.endsWith(".json")).map((f) => load(`spike/traces/${f}`));
    for (const t of [...fixtures, ...spike]) {
      const { pages, independentRoots, copies } = independence(t);
      expect(independentRoots + copies, t.id).toBe(pages);
      expect(independentRoots <= Math.max(pages, 0), t.id).toBe(true);
    }
  });

  it("the headline says 1 origin only on ORIGIN_FOUND, and passes the copy lint", () => {
    expect(independenceLine(load("fixtures/traces/sample-origin.json"))).toBe("Found on 3 pages: 1 independent root, 1 origin. 2 are copies.");
    expect(independenceLine(load("fixtures/traces/sample-rich.json"))).toBe("Found on 5 pages: 1 independent root. 4 are copies.");
    expect(independenceLine(load("fixtures/traces/sample-no-pages.json"))).toBe("Found on no pages.");
    expect(independenceLine(load("fixtures/traces/sample-tool-failed.json"))).toBe("Found on 1 page: 1 independent root. No copies.");
    for (const t of fixtures) {
      const line = independenceLine(t);
      expect(originWords(line, t.decision.state), t.id).toEqual([]);
      expect(lintText(line), t.id).toEqual([]);
      expect(renderCard(t).split("\n")[2], t.id).toBe(line);
    }
  });

  it("pz verify re-derives the counts and fails when the stored ones disagree", () => {
    const t = load("fixtures/traces/sample-rich.json");
    expect(verifyTrace(t).failures).toEqual([]);
    const tampered = { ...t, roots: { ...t.roots, independentRoots: 3, copies: 2 } };
    expect(verifyTrace(tampered).failures.map((f) => f.check)).toEqual(["roots"]);
    expect(verifyTrace(tampered).failures[0]!.detail).toContain("independentRoots: stored 3, edges give 1");
  });

  it("traces from before T94 carry no counts and are not held to them; the card derives the headline", () => {
    const old = load("spike/traces/claim-2.json");
    expect(old.roots.independentRoots).toBeUndefined();
    expect(verifyTrace(old, { historical: true }).failures.map((f) => f.check)).not.toContain("roots");
    expect(independenceLine(old)).toMatch(/^Found on 9 pages: \d+ independent roots?\./);
  });
});
