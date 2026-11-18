import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { loadTraces } from "../data/loadTraces.ts";
import { scrubberStops } from "../model/scrubber.ts";
import { badgeFor } from "./badge.ts";
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
      // Every trace ends on its stop card, with the deciding rule marked in the rule sheet (T85).
      expect(html).toContain("How this was decided");
      expect(html).toMatch(new RegExp(`aria-current="true"><span class="rule-row">Rule ${trace.decision.row}</span>`));
      expect(html).not.toContain("foot-note");
      // Samples read SAMPLE; the recorded E2 traces (#220) read REPLAY.
      expect(html).toContain(badgeFor(trace).label);
    }
  });

  it("first renders the finished trace, with the replay offered rather than forced (T86)", () => {
    const rich = traces.find((t) => t.id === "sample-rich")!;
    const html = renderToStaticMarkup(<TraceView trace={rich} />);
    expect(html).toContain("Replay the walk");
    expect(html).not.toContain("replay-rail");
    expect(html.match(/class="copy( ring)?"/g)).toHaveLength(rich.nodes.filter((n) => !n.meta && n.date.value).length);
  });

  it("[C3] the graph labels edges by kind in text, not only by stroke", () => {
    const rich = traces.find((t) => t.id === "sample-rich")!;
    const html = renderToStaticMarkup(<TraceView trace={rich} />);
    expect(html).toContain("link-verified");
    expect(html).toContain("inferred, no link");
  });

  it("marks the red hop in coral on the track and in the band, and shows the open stop's readout chips", () => {
    const rich = traces.find((t) => t.id === "sample-rich")!;
    const html = renderToStaticMarkup(<TraceView trace={rich} />);
    expect(html).toContain("Wording changed here");
    expect(html).toContain('class="track-red"');
    expect(html).toMatch(/class="stop red"/);
    expect(html).toContain("band-link inferred red");
    expect(html).toContain('<span class="readout-label">Attribution shifted</span><span class="readout-tag">inferred, 74%</span>');
    const plain = traces.find((t) => t.id === "sample-origin")!;
    expect(renderToStaticMarkup(<TraceView trace={plain} />)).not.toContain("Wording changed here");
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
