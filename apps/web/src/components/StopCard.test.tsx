import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Trace } from "pz/schema";
import { unreadParents } from "../model/unread.ts";
import { StopCard } from "./StopCard.tsx";

const trace = Trace.parse(JSON.parse(readFileSync("eval/dev-traces/dev-10.json", "utf8")));

describe("StopCard unread citations", () => {
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
  it("omits the section when there are no unread citations", () => {
    expect(renderToStaticMarkup(<StopCard trace={{ ...trace, nodes: [] }} />)).not.toContain("Pages it cites that could not be opened");
  });
});
