import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAll, readPage, sha256 } from "../../../fixtures/src/build.ts";
import { decideStopState, loadRules } from "../src/rules/index.ts";
import { Trace } from "../src/schema/index.ts";

const dir = new URL("../../../fixtures/traces/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
const traces = files.map((f) => Trace.parse(JSON.parse(readFileSync(new URL(f, dir), "utf8"))));

describe("synthetic fixture traces", () => {
  it("has the seven fixtures, all synthetic and SAMPLE", () => {
    expect(files).toHaveLength(7);
    for (const t of traces) expect([t.synthetic, t.mode]).toEqual([true, "SAMPLE"]);
  });
  it("finds every span at start..end in its normalised page, with the page hash", () => {
    for (const t of traces) for (const s of t.spans) {
      const page = readPage(s.nodeId);
      expect(page.slice(s.start, s.end)).toBe(s.text);
      expect(s.extractSha256).toBe(sha256(page));
      expect(s.windowSha256).toBe(sha256(s.contextBefore + s.text + s.contextAfter));
    }
  });
  it("uses only .example domains", () => {
    for (const t of traces) for (const n of t.nodes) {
      expect(n.domain.endsWith(".example")).toBe(true);
      expect(new URL(n.url).hostname).toBe(n.domain);
    }
  });
  it("builds identical bytes twice, equal to the committed files", () => {
    const first = buildAll();
    expect(buildAll()).toEqual(first);
    for (const f of files) expect(first[f]).toBe(readFileSync(new URL(f, dir), "utf8"));
  });
  it("[C16] recomputing every fixture gives its stored decision", () => {
    const rules = loadRules();
    for (const t of traces) expect(decideStopState(t, rules)).toEqual(t.decision);
  });
  it("sample-rich carries everything the UI shows", () => {
    const t = traces.find((x) => x.id === "sample-rich")!;
    const red = t.hops.find((h) => h.edgeId === t.redHopEdgeId)!;
    const clusterOf = (id: string) => t.nodes.find((n) => n.id === id)!.clusterId;
    expect(t.roots.clusters).toBe(4);
    expect(t.edges.filter((e) => clusterOf(e.parentId) !== clusterOf(e.childId))).toHaveLength(5);
    expect(red.readouts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "comparison_added", source: "measured", value: "yes" }),
      expect.objectContaining({ id: "scope_widened", source: "inferred", probability: 0.81 }),
      expect.objectContaining({ id: "attribution_shifted", value: "unsure", probability: 0.55 }),
    ]));
    expect(t.hops.flatMap((h) => h.readouts).filter((r) => r.disputed)).toHaveLength(1);
    expect(t.edges.filter((e) => e.kind === "inferred")).toHaveLength(1);
    expect(t.nodes.filter((n) => n.versionOf)).toHaveLength(1);
    expect(t.nodes.filter((n) => n.meta)).toHaveLength(1);
    expect(t.blame.every((b) => b.firstSeen !== null)).toBe(true);
  });
});
