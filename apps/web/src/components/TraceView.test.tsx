import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { loadTraces } from "../data/loadTraces.ts";
import { scrubberStops } from "../model/scrubber.ts";
import { TraceView } from "./TraceView.tsx";

beforeAll(() => {
  // No DOM in these tests: give the reduced-motion hook a stand-in.
  (globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
});

describe("TraceView", () => {
  const { traces } = loadTraces();

  it("[C25] renders every fixture, starting on the newest stop's own words", () => {
    for (const trace of traces) {
      const html = renderToStaticMarkup(<TraceView trace={trace} />);
      const first = scrubberStops(trace)[0];
      if (first) {
        expect(html).toContain('role="slider"');
        for (const word of first.text.split(" ").slice(0, 3)) expect(html).toContain(word.replace(/&/g, "&amp;").replace(/'/g, "&#x27;"));
      } else {
        expect(html).toContain("No page with the claim");
      }
      expect(html).toContain(`row ${trace.decision.row}`);
      expect(html).toContain("SAMPLE");
    }
  });

  it("[C3] the graph labels edges by kind in text, not only by stroke", () => {
    const rich = traces.find((t) => t.id === "sample-rich")!;
    const html = renderToStaticMarkup(<TraceView trace={rich} />);
    expect(html).toContain("link-verified");
    expect(html).toContain("inferred, no link");
  });

  it("draws the band as swarms of copies, one dot per page, with the active cluster named by its site", () => {
    const rich = traces.find((t) => t.id === "sample-rich")!;
    const html = renderToStaticMarkup(<TraceView trace={rich} />);
    const pages = rich.nodes.filter((n) => !n.meta && n.date.value).length;
    expect(html.match(/class="copy( ring)?"/g)).toHaveLength(pages);
    expect(html).toContain("chirp.example, 1 page");
    expect(html).toContain('class="swarm-halo"');
  });
});
