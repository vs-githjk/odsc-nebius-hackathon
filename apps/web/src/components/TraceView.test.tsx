import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { loadTraces } from "../data/loadTraces.ts";
import { scrubberStops } from "../model/scrubber.ts";
import { badgeFor } from "./badge.ts";
import { TraceView } from "./TraceView.tsx";
import { independence, independenceLine } from "pz/headline";
import { traceCost } from "../../../../packages/pz/src/usage/cost.ts";
import { cleanQuote } from "../model/quoteClean.ts";

beforeAll(() => {
  // No DOM in these tests: give the reduced-motion hook a stand-in.
  (globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
});

describe("TraceView", () => {
  const { traces } = loadTraces();

  it("puts the claim and verdict before the timeline, then copies and roots", () => {
    const html = renderToStaticMarkup(<TraceView trace={traces.find(t => t.id === "sample-rich")!} />);
    const positions = ['class="quote trace-claim"', 'aria-label="How this trace ended"', 'aria-label="Timeline of pages"', 'aria-label="Copies and roots"'].map(marker => html.indexOf(marker));
    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html.match(/aria-label="How this trace ended"/g)).toHaveLength(1);
    expect(html).toMatch(/Earliest pages? we found/);
    expect(html).toContain('class="ramp-dot"');
  });

  it("[C25] renders every fixture, starting on the newest stop's own words", () => {
    for (const trace of traces) {
      const html = renderToStaticMarkup(<TraceView trace={trace} />);
      const first = scrubberStops(trace)[0];
      if (first) {
        expect(html).toContain('role="slider"');
        // The page shows the quote after the display cleaners (menu text, leading emoji); the trace keeps the raw words.
        for (const word of cleanQuote(first.text, trace.claim.text).split(" ").slice(0, 3)) expect(html).toContain(word.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
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

  it("marks the red hop and starts the receipt without claiming a later hop exists", () => {
    const rich = traces.find((t) => t.id === "sample-rich")!;
    const html = renderToStaticMarkup(<TraceView trace={rich} />);
    expect(html).toContain("Wording changed here");
    expect(html).toContain('class="track-red"');
    expect(html).toMatch(/class="stop red"/);
    expect(html).toContain("band-link inferred red");
    expect(html).toContain("This is the latest page in the walk.");
    expect(html).toContain("How dated");
    const plain = traces.find((t) => t.id === "sample-origin")!;
    expect(renderToStaticMarkup(<TraceView trace={plain} />)).not.toContain("Wording changed here");
  });

  it("shows the shared headline counts, matching dots, deliberate stops and recorded cost", () => {
    for (const trace of traces) {
      const html = renderToStaticMarkup(<TraceView trace={trace} />);
      const counts = independence(trace);
      expect(html).toContain(independenceLine(trace));
      expect(html.match(/class="root-dot"/g) ?? []).toHaveLength(counts.independentRoots);
      expect(html.match(/class="root-dot hollow"/g) ?? []).toHaveLength(counts.copies);
      expect(html.includes("No origin is named on purpose")).toBe(trace.decision.state !== "ORIGIN_FOUND");
      if (trace.mode === "REPLAY" && trace.usage.length) expect(html).toContain(`Recorded run cost $${traceCost(trace).totalUsd.toFixed(3)}`);
      else expect(html).not.toContain("Recorded run cost");
    }
  });

  it("omits cost for recordings without usage and retains live credits", () => {
    const trace = traces.find(t => t.id === "dev-10")!;
    expect(renderToStaticMarkup(<TraceView trace={{ ...trace, usage: [] }} />)).not.toContain("Recorded run cost");
    const live = renderToStaticMarkup(<TraceView trace={{ ...trace, mode: "LIVE" }} />);
    expect(live).toContain(`Cost $${traceCost(trace).totalUsd.toFixed(3)} (${trace.budget.credits} Tavily credits)`);
    expect(live).not.toContain("Recorded run cost");
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
