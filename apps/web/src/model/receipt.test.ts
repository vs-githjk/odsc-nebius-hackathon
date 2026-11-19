import { describe, expect, it } from "vitest";
import { loadTraces } from "../data/loadTraces.ts";
import { dateEvidence, possibleVariants, whatChanged } from "./receipt.ts";
import { scrubberStops } from "./scrubber.ts";
import { hopInto } from "./hop.ts";

const { traces } = loadTraces();
const rich = traces.find(t => t.id === "sample-rich")!;

describe("date evidence", () => {
  it("labels the stored source and respects partial date precision", () => {
    const node = rich.nodes[0]!;
    expect(dateEvidence({ ...node, date: { ...node.date, value: "2020-12-31", source: "metadata", precision: "year", kind: "published" } }).label).toBe("Dated by the page's own metadata, 2020.");
    expect(dateEvidence({ ...node, date: { ...node.date, value: "2020-06-30", source: "registry_pubmed", precision: "month", kind: "published" } }).label).toBe("Dated by PubMed, June 2020.");
    expect(dateEvidence({ ...node, date: { ...node.date, value: null } })).toEqual({ label: "Undated", url: null });
    expect(dateEvidence({ ...node, date: { ...node.date, value: "2020-01-01", kind: "unconfirmed", conflictingDate: true } }).label).toMatch(/^Unconfirmed date from.*Date evidence conflicts\.$/);
  });

  it("uses actual Wayback evidence without making a timestamp from a day", () => {
    const trace = traces.find(t => t.id === "dev-10")!;
    const span = trace.spans.find(s => s.waybackUrl && trace.nodes.find(n => n.id === s.nodeId)?.date.source === "wayback_first_capture")!;
    const node = trace.nodes.find(n => n.id === span.nodeId)!;
    expect(dateEvidence(node, span).url).toBe(span.waybackUrl);
    expect(dateEvidence(node, span).label).toContain("first Wayback Machine capture");
    expect(dateEvidence(node).url).toBeNull();
    expect(dateEvidence({ ...node, date: { ...node.date, firstCapture: "20160120070441" } }).url).toBe(`https://web.archive.org/web/20160120070441/${node.url}`);
    const metadata = { ...node, date: { ...node.date, source: "metadata" as const } };
    expect(dateEvidence(metadata, span).url).toBeNull();
  });
});

describe("what changed toward the later hop", () => {
  it("compares the selected older page with the previous stop, including uncertain chips", () => {
    const stops = scrubberStops(rich);
    expect(whatChanged(rich, stops, 0).text).toContain("latest page");
    const result = whatChanged(rich, stops, 2);
    expect(result.text).toContain("inferred by date; no link");
    expect(result.chips).toEqual(hopInto(rich, stops, 1)!.chips);
    expect(result.chips.some(c => c.tone === "unsure")).toBe(true);
    const diff = rich.hops.find(h => h.edgeId === stops[2]!.edgeId)!.wordDiff;
    expect(result.earlierWords).toBe(diff.filter(w => w.op === "del").map(w => w.text).join(" "));
    expect(result.laterWords).toBe(diff.filter(w => w.op === "add").map(w => w.text).join(" "));
  });

  it("does not claim unchanged wording when comparison evidence is missing", () => {
    const stops = scrubberStops(rich);
    expect(whatChanged({ ...rich, hops: [] }, stops, 1).text).toContain("No wording comparison");
    expect(whatChanged({ ...rich, edges: [] }, stops, 1).text).toContain("No recorded hop");
    const hops = rich.hops.map(h => ({ ...h, wordDiff: [{ op: "same" as const, text: "claim" }] }));
    expect(whatChanged({ ...rich, hops }, stops, 1).text).toContain("wording is unchanged");
  });

  it("keeps earlier and later numeric differences in their recorded direction", () => {
    const stops = scrubberStops(rich);
    const hops = rich.hops.map(h => h.edgeId === stops[1]!.edgeId ? {
      ...h, wordDiff: [{ op: "del" as const, text: "71%" }, { op: "add" as const, text: "70%" }],
    } : h);
    const result = whatChanged({ ...rich, hops }, stops, 1);
    expect(result.earlierWords).toBe("71%");
    expect(result.laterWords).toBe("70%");
    expect(result.text).toContain("The later page links to this page.");
  });

  it("keeps other numbers as possible variants, never a claimed hop", () => {
    for (const trace of traces) {
      const variants = possibleVariants(trace);
      expect(variants).toHaveLength(trace.otherNumbers?.length ?? 0);
      variants.forEach((variant, i) => {
        expect(variant.label).toBe(`Possible variant on ${trace.otherNumbers![i]!.domain}: ${trace.otherNumbers![i]!.number}`);
        expect(variant.sentence).toBe(trace.otherNumbers![i]!.sentence);
      });
    }
  });
});
