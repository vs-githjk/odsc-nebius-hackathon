import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadTraces } from "../data/loadTraces.ts";
import { challengeTraces } from "../model/live.ts";
import { PausedLiveNote } from "./ClaimBox.tsx";

const { traces } = loadTraces();

describe("the paused claim note shared by idle and untraced claims", () => {
  it.each(["cap", "disabled", "not_configured"])("offers recordings once for %s", reason => {
    const html = renderToStaticMarkup(<PausedLiveNote mode="paused" reason={reason} traces={traces} />);
    expect(html.match(/Live tracing is paused/g)).toHaveLength(1);
    expect(html).toContain(reason === "cap" ? "budget for live searches is used up" : "paused for now");
    expect(html).toContain("Every recorded trace still opens free.");
    expect(html).toContain('href="#/traces">Open a recorded trace</a>');
    expect(html).toContain("Try these");
    const choices = challengeTraces(traces).slice(0, 3);
    expect(html.match(/class="sample"/g)).toHaveLength(choices.length);
    for (const trace of choices) expect(html).toContain(`href="#/t/${trace.id}"`);
    expect(html).not.toContain("Not traced yet");
    expect(html).not.toContain("Trace it live");
  });
  it("keeps the replay-only site silent about live", () => {
    expect(renderToStaticMarkup(<PausedLiveNote mode="absent" reason="cap" traces={traces} />)).toBe("");
  });
  it("still offers all recordings when no suggested recordings are available", () => {
    const html = renderToStaticMarkup(<PausedLiveNote mode="paused" traces={traces.filter(t => t.synthetic)} />);
    expect(html).toContain('href="#/traces"');
    expect(html).not.toContain("Try these");
  });
});
