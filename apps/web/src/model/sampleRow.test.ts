import { describe, expect, it } from "vitest";
import { loadTraces } from "../data/loadTraces.ts";
import { lintText } from "../../../../packages/pz/src/cli/lint-copy.ts";
import { heroTrace, rowFacts, sampleRow, sampleRows } from "./sampleRow.ts";
import { scrubberStops } from "./scrubber.ts";

const { traces } = loadTraces();
const byId = (id: string) => traces.find((t) => t.id === id)!;

describe("sampleRow", () => {
  it("titles a row with the claim as a page words it, never with a state name or an id", () => {
    for (const t of traces) {
      const row = sampleRow(t);
      expect(row.wording).toBe(t.synthetic ? (scrubberStops(t)[0]?.text ?? t.claim.text) : t.claim.text);
      expect(row.wording).not.toMatch(/[A-Z]{2,}_[A-Z]/);
      expect(row.wording).not.toContain(t.id);
    }
    expect(sampleRow(byId("sample-no-pages")).wording).toBe(byId("sample-no-pages").claim.text);
  });

  it("gives the ending in words, the earliest year and the page count", () => {
    expect(rowFacts(sampleRow(byId("sample-rich")))).toEqual(["The trail goes cold", "Back to 2019", "5 pages"]);
    expect(rowFacts(sampleRow(byId("sample-origin")))).toEqual(["Origin found", "Back to 2019", "3 pages"]);
    expect(rowFacts(sampleRow(byId("sample-no-pages")))).toEqual(["No pages found", "No dated page", "0 pages"]);
  });

  it("colours the dot on the time ramp by how far back the trace reached, and leaves it empty with no dated page", () => {
    expect(sampleRow(byId("sample-rich")).tone).toMatch(/var\(--|color-mix/);
    expect(sampleRow(byId("sample-no-pages")).tone).toBeNull();
  });

  it("puts the rows with the most to show first, in a stable order", () => {
    const samples = traces.filter((t) => t.synthetic);
    const rows = sampleRows(samples);
    expect(rows[0]!.id).toBe("sample-rich");
    expect(rows.at(-1)!.id).toBe("sample-no-pages");
    expect(sampleRows([...samples].reverse()).map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });

  it("row copy passes the copy lint", () => {
    for (const r of sampleRows(traces)) for (const s of rowFacts(r)) expect(lintText(s)).toEqual([]);
  });
});

describe("heroTrace", () => {
  it("never leads with an invented sample, and picks the real trace with the most to show", () => {
    const samples = traces.filter((t) => t.synthetic);
    expect(heroTrace(samples)).toBeNull();
    const real = (id: string, pages: number) => ({ ...byId("sample-rich"), id, synthetic: false, roots: { ...byId("sample-rich").roots, pages } });
    expect(heroTrace([...samples, real("live-a", 3), real("live-b", 9)])?.id).toBe("live-b");
    // With the recorded E2 traces loaded (#220), the hero is a real one.
    if (traces.some((t) => !t.synthetic)) expect(heroTrace(traces)?.synthetic).toBe(false);
  });
});
