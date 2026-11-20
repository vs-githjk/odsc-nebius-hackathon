import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Trace } from "pz/schema";
import { unreadParents } from "../model/unread.ts";
import { StopCard } from "./StopCard.tsx";

const recorded = Trace.parse(JSON.parse(readFileSync("eval/dev-traces/dev-10.json", "utf8")));
// dev-10 now ends Origin found (#310); the same evidence read as a cold ending exercises the unread list.
const trace: Trace = { ...recorded, decision: { ...recorded.decision, state: "TRAIL_GOES_COLD", row: 6 } };

describe("StopCard unread citations", () => {
  it.each(["dev-09", "dev-10"])("names %s below the h2 and lists the picked origin first", id => {
    const trace = Trace.parse(JSON.parse(readFileSync(`eval/dev-traces/${id}.json`, "utf8")));
    const html = renderToStaticMarkup(<StopCard trace={trace} />);
    expect(html).toContain('The ending: </span>');
    expect(html).toContain('Origin found:</h2><p class="stop-origin-detail">');
    const lines = [...html.matchAll(/class="earliest-line">.*?href="([^"]+)"/g)].map(match => match[1]);
    expect(lines[0]).toBe(id === "dev-10" ? "https://www3.weforum.org/docs/WEF_The_New_Plastics_Economy.pdf" : "https://www.science.org/doi/10.1126/sciadv.1700782");
    expect(html).toContain(id === "dev-10" ? "online by January 20, 2016" : "dated July 7, 2017");
    expect(html).not.toContain("World Economic Forum report");
  });

  it("keeps the remaining earliest pages in date order and leaves cold endings in date order", () => {
    const origin = recorded.nodes.find(node => node.id === "n7")!;
    const primarySpan = recorded.spans.find(span => span.nodeId === origin.id)!;
    const other = (id: string, value: string) => ({ ...origin, id, url: `https://${id}.example/page`, domain: `${id}.example`, date: { ...origin.date, value }, spanIds: [`s-${id}`], pageType: null });
    const later = other("later", "2016-01-25");
    const earlier = other("earlier", "2016-01-01");
    const trace = { ...recorded, nodes: [later, earlier, ...recorded.nodes], spans: [
      ...recorded.spans, ...[later, earlier].map(node => ({ ...primarySpan, id: node.spanIds[0]!, nodeId: node.id })),
    ], earliest: { ...recorded.earliest, nodeIds: [later.id, earlier.id, origin.id] } };
    const hosts = (trace: Trace) => [...renderToStaticMarkup(<StopCard trace={trace} />).matchAll(/class="earliest-line">.*?href="([^"]+)"/g)].map(match => match[1]);
    expect(hosts(trace)).toEqual([origin.url, earlier.url, later.url]);
    expect(hosts({ ...trace, decision: { ...trace.decision, state: "TRAIL_GOES_COLD", row: 6 } })).toEqual([earlier.url, origin.url, later.url]);
  });

  it("names every unread page directly below the ending sentence", () => {
    const html = renderToStaticMarkup(<StopCard trace={trace} />);
    expect(html).toContain("Pages it cites that could not be opened");
    expect(html.indexOf('class="stop-unread"')).toBeGreaterThan(html.indexOf('class="stop-sentence"'));
    expect(html.indexOf('class="stop-unread"')).toBeLessThan(html.indexOf('class="stop-earliest"'));
    for (const entry of unreadParents(trace)) {
      expect(html).toContain(`href="${entry.url}" target="_blank" rel="noreferrer">${entry.host}</a>`);
    }
    expect(html.match(/cited by www.snopes.com/g)).toHaveLength(2);
    expect(html).not.toContain("Not checked:");
  });
  it("under Origin found, shows the set-aside pages muted, with the reason, instead of hiding them", () => {
    expect(recorded.decision.state).toBe("ORIGIN_FOUND");
    const html = renderToStaticMarkup(<StopCard trace={recorded} />);
    expect(html).not.toContain("Pages it cites that could not be opened");
    expect(html).toContain("Not counted against this origin:");
    expect(html).toContain("cited only by an off-topic fact-check that could not be opened");
    expect(html).toContain(">media.greenpeace.org</a>");
    expect(html).toContain(">cavite.gov.ph</a>");
    expect(html).toContain("(cited by www.snopes.com)");
  });
  it("omits the section when there are no unread citations", () => {
    expect(renderToStaticMarkup(<StopCard trace={{ ...trace, nodes: [] }} />)).not.toContain("Pages it cites that could not be opened");
  });
});
