import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decideStopState, loadRules, writtenCitationYear } from "../src/rules/index.ts";
import type { Trace } from "../src/schema/index.ts";

const rules = loadRules();
const fixture = (): Trace => JSON.parse(readFileSync(fileURLToPath(new URL("../../../fixtures/traces/sample-origin.json", import.meta.url)), "utf8"));
// dev-13's span in the first live E2 run (eval/dev-traces/dev-13.json), on a page first archived 2015-08-29.
const DEV13 = "In the November/December 2009 issue of the *World Watch* journal, Goodland and co-author Jeff Anhang published the shocking estimate of \"at least 51%\" of global greenhouse gas emissions attributable to the lifecycle and supply chain of livestock products.";

describe("#192 F4: an earlier source cited in words", () => {
  it("dev-13: an issue of a journal from 2009, on a 2015 page, cites earlier", () => {
    expect(writtenCitationYear({ text: DEV13 }, "2015-08-29", rules)).toBe(2009);
  });

  it("needs both a year before the page's own date and a citation cue in the span", () => {
    expect(writtenCitationYear({ text: DEV13 }, "2009-11-01", rules)).toBeNull();
    expect(writtenCitationYear({ text: "Livestock causes 51% of emissions, a figure that 2009 made famous." }, "2015-08-29", rules)).toBeNull();
    expect(writtenCitationYear({ text: "A study by the FAO puts it at 14.5%." }, "2015-08-29", rules)).toBeNull();
    expect(writtenCitationYear({ text: "A 2006 study by the FAO puts it at 18%." }, "2015-08-29", rules)).toBe(2006);
    expect(writtenCitationYear({ text: "According to a report published in 2013, it is 14.5%." }, "2015-08-29", rules)).toBe(2013);
    expect(writtenCitationYear({ text: DEV13 }, null, rules)).toBeNull();
  });

  it("a number that only looks like a year is not one", () => {
    expect(writtenCitationYear({ text: "A study by the agency counted 1,999.5 tonnes and 2009.7 more." }, "2015-08-29", rules)).toBeNull();
  });

  it("the earliest page that cites earlier in words is never the origin, and the reason says so", () => {
    const t = fixture();
    expect(decideStopState(t, rules).state).toBe("ORIGIN_FOUND");
    const span = t.spans.find((s) => s.nodeId === "keeper-log")!;
    span.text = `As first published in a 2011 keeper bulletin, ${span.text}`;
    const d = decideStopState(t, rules);
    expect(d.state).toBe("TRAIL_GOES_COLD");
    expect(d.reasons).toContain("earliest page keeper-log cites an earlier source in words (2011)");
  });

  it("the text around the span is not read: interview pages carry unrelated dated facts there", () => {
    const t = fixture();
    const span = t.spans.find((s) => s.nodeId === "keeper-log")!;
    span.contextBefore = "In 2008 a study by the zoo was published in a journal. ";
    expect(decideStopState(t, rules).state).toBe("ORIGIN_FOUND");
  });
});
