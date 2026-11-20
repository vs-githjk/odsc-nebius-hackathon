import { describe, expect, it } from "vitest";
import { loadRules } from "../src/rules/rules.ts";
import { replay, judge, bare } from "../src/eval/origin-replay.ts";
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
