import { describe, expect, it } from "vitest";
import { loadRules } from "../src/rules/rules.ts";
import { replay, judge, bare, recordedTraces } from "../src/eval/origin-replay.ts";
import { decideStopState } from "../src/rules/decide.ts";
import { offTopicMeta, primaryUrl } from "../src/rules/decide.ts";

// The origin experiment, attempt A (#307). The gate: replaying the decision over every recorded trace (20 E2 dev
// traces and the gallery) gives 0 false origins and at least 1 new correct ORIGIN_FOUND.
const rules = loadRules();

describe("the gate: replay over every recorded trace", () => {
  const rows = replay(rules);
  it("covers the 20 dev traces and the gallery", () => {
    expect(rows.filter((r) => r.id.startsWith("dev-"))).toHaveLength(20);
    expect(rows.filter((r) => /^g\d$/.test(r.id)).length).toBeGreaterThanOrEqual(7);
  });
  it("names no false origin", () => {
    expect(rows.filter((r) => r.verdict === "false origin").map((r) => `${r.id} ${r.picked}`)).toEqual([]);
  });
  it("finds at least one correct origin, including dev-10 on the WEF report and dev-09 on the Science Advances paper", () => {
    const correct = rows.filter((r) => r.verdict === "correct origin").map((r) => r.id);
    expect(correct.length).toBeGreaterThanOrEqual(1);
    expect(correct).toEqual(expect.arrayContaining(["dev-09", "dev-10"]));
  });
  it("keeps the cold claims cold: dev-03, dev-06 and dev-11 stay without an origin, and G4 loses its false one", () => {
    for (const id of ["dev-03", "dev-06", "dev-11", "g4"]) expect(rows.find((r) => r.id === id)?.newState, id).not.toBe("ORIGIN_FOUND");
  });
});

describe("an off-topic fact-check's unread citations do not block an origin", () => {
  const claim = { number: { raw: "2050", canonical: "2050" }, subjectLemma: "plastic", text: "By 2050 there will be more plastic than fish in the ocean." };
  it("a fact-check about something else is off-topic", () => {
    expect(offTopicMeta("https://www.snopes.com/fact-check/sperm-whale-die-swallowing-64-pounds-plastic-debris", claim)).toBe(true);
  });
  it("a fact-check whose address carries the claim's number, or two of its words, is on-topic", () => {
    expect(offTopicMeta("https://www.snopes.com/articles/469277/fish-plastic-oceans-2050", claim)).toBe(false);
    expect(offTopicMeta("https://www.snopes.com/fact-check/more-plastic-than-fish", claim)).toBe(false);
    const steps = { number: { raw: "10,000", canonical: "10000" }, subjectLemma: "step", text: "You need to walk 10,000 steps a day to stay healthy." };
    expect(offTopicMeta("https://www.snopes.com/news/2021/02/02/do-we-really-need-to-walk-10000-steps-a-day", steps)).toBe(false);
  });
  it("an address with too few words to judge counts as on-topic, so it still blocks", () => {
    expect(offTopicMeta("https://www.snopes.com/articles/469277", claim)).toBe(false);
  });
  it("a number only counts as a whole token, not inside a date", () => {
    const nine = { number: { raw: "9%", canonical: "9%" }, subjectLemma: "plastic", text: "Only 9% of all plastic ever made has been recycled." };
    expect(offTopicMeta("https://www.snopes.com/news/2021/09/23/mcdonalds-plastic-happy-meal-toys", nine)).toBe(true);
  });
});

describe("a primary page's address must look like a document, not a dated article or a list", () => {
  it("refuses dated article paths and list pages", () => {
    expect(primaryUrl("https://www.cnbc.com/2017/07/10/just-100-firms-attributable-for-71-percent-of-global-emissions.html")).toBe(false);
    expect(primaryUrl("https://beyondgreenspace.net/2019/06/13/120-minutes-in-nature")).toBe(false);
    expect(primaryUrl("https://beyondgreenspace.net/published-papers")).toBe(false);
    expect(primaryUrl("https://example.org/publications/")).toBe(false);
    expect(primaryUrl("https://example.org/news")).toBe(false);
  });
  it("keeps reports, papers and registry pages", () => {
    expect(primaryUrl("https://www3.weforum.org/docs/WEF_The_New_Plastics_Economy.pdf")).toBe(true);
    expect(primaryUrl("https://www.science.org/doi/10.1126/sciadv.1700782")).toBe(true);
    expect(primaryUrl("https://pubmed.ncbi.nlm.nih.gov/7555502")).toBe(true);
    expect(primaryUrl("https://www.nature.com/articles/s41598-019-44097-3")).toBe(true);
  });
});

describe("the replay judge", () => {
  it("compares URLs loosely and treats any origin on a cold claim as false", () => {
    expect(bare("https://www3.weforum.org/docs/X.pdf")).toBe("weforum.org/docs/x.pdf");
    expect(judge("https://www3.weforum.org/docs/WEF_The_New_Plastics_Economy.pdf", { kind: "origin", urls: ["https://www3.weforum.org/docs/WEF_The_New_Plastics_Economy.pdf"] })).toBe("correct origin");
    expect(judge("https://x.org/a", { kind: "cold" })).toBe("false origin");
    expect(judge("https://beyondgreenspace.net/published-papers", { kind: "origin-hosts", hosts: ["nature.com", "ecehh.org"] })).toBe("false origin");
    expect(judge(null, { kind: "cold" })).toBe("no origin");
  });
});

// #307, XO's 05:04 brief: an origin must be the earliest-dated non-meta page in the trace. Under the #310 rules the
// S7 answer check's plastic claim named a Greenpeace whale-art page because the WEF report (2016) in the same trace
// was judged same_claim "no"; an earlier page that was not ruled out now demotes the pick.
describe("the wider gate: every recorded trace in the repo", () => {
  const rows = replay(rules, { wide: true });
  it("covers the dev traces, the gallery, the samples, the failure fixtures, the spike and the S7 answer check", () => {
    expect(rows.length).toBeGreaterThanOrEqual(41);
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining(["dev-10", "g4", "s7-claim-0", "s7-claim-1", "s7-claim-2"]));
  });
  it("names no false origin anywhere, and the S7 plastic claim is not an origin", () => {
    expect(rows.filter((r) => r.verdict === "false origin").map((r) => `${r.id} ${r.picked}`)).toEqual([]);
    expect(rows.find((r) => r.id === "s7-claim-0")?.newState).not.toBe("ORIGIN_FOUND");
  });
  it("keeps dev-09 and dev-10 on their expected origins", () => {
    for (const id of ["dev-09", "dev-10"]) expect(rows.find((r) => r.id === id)?.verdict, id).toBe("correct origin");
  });
});

describe("the earliest-dated-page guard", () => {
  const dev10 = recordedTraces().find((t) => t.id === "dev-10")!.trace;
  const earlier = (date: string, meta = false) => ({
    ...dev10, nodes: [...dev10.nodes, { ...dev10.nodes.find((n) => n.id === "n6")!, id: "n99", url: "https://earlier.example/page", meta, date: { ...dev10.nodes.find((n) => n.id === "n6")!.date, value: date } }],
  });
  it("demotes an origin when another page on the trail has an earlier date, whatever it said on same_claim", () => {
    const d = decideStopState(earlier("2015-03-01"), rules);
    expect(d.state).toBe("TRAIL_GOES_COLD");
    expect(d.reasons).toContain("An earlier page on the trail was not ruled out: https://earlier.example/page");
  });
  it("ignores meta pages, and pages dated the same day or later", () => {
    expect(decideStopState(earlier("2015-03-01", true), rules).state).toBe("ORIGIN_FOUND");
    expect(decideStopState(earlier("2016-01-20"), rules).state).toBe("ORIGIN_FOUND");
    expect(decideStopState(earlier("2018-01-01"), rules).state).toBe("ORIGIN_FOUND");
  });
  it("leaves dev-10 itself an origin", () => {
    expect(decideStopState(dev10, rules).state).toBe("ORIGIN_FOUND");
  });
});
