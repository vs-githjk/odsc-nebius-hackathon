import { describe, expect, it } from "vitest";
import type { Node, Span, Trace } from "../src/schema/index.ts";
import { Trace as TraceSchema } from "../src/schema/index.ts";
import { decideStopState, loadRules } from "../src/rules/index.ts";

const rules = loadRules();
const answer = (optionId: string) => ({ questionId: "page_type", optionId, probability: 0.9, top: [], model: "test", threshold: null });

const node = (id: string, over: Partial<Node> = {}): Node => ({
  id, url: `https://${id}.example/page`, domain: `${id}.example`, title: id,
  date: { kind: "published", value: "2020-01-01", source: "metadata", firstCapture: null, conflictingDate: false },
  clusterId: `c-${id}`, evidence: "observed", meta: false, read: true, versionOf: null, spanIds: [],
  citesEarlier: false, candidateParents: [], pageType: answer("study"), ...over,
});

const span = (id: string, nodeId: string, text: string): Span => ({
  id, nodeId, text, contextBefore: "", contextAfter: "", start: 0, end: text.length,
  extractSha256: "x", windowSha256: "x", fetchedAt: "2026-11-01T00:00:00Z", waybackUrl: null, tier: "exact",
});

// An invented claim whose trace meets every ORIGIN_FOUND condition; each test breaks one.
function trace(over: Partial<Trace> = {}): Trace {
  return TraceSchema.parse({
    schemaVersion: "1", id: "t", mode: "SAMPLE", synthetic: true, recordedAt: "2026-11-01T00:00:00Z",
    claim: { text: "Harbor Zoo penguins nap 14 times a day", atoms: {
      number: { raw: "14", canonical: "14" }, unit: "times a day", subjectLemma: "penguin", population: null,
      time: null, hedge: null, namedSource: null, variants: [] } },
    viralSentence: "Harbor Zoo penguins nap 14 times a day",
    nodes: [node("study"), node("news", { pageType: answer("news"), clusterId: "c-news" })],
    edges: [], clusters: [], spans: [span("s1", "study", "Penguins napped 14 times a day.")], hops: [], blame: [],
    roots: { pages: 2, clusters: 2, rootsLinked: 1, clustersUnlinked: 0, studiesFound: 1 }, redHopEdgeId: null,
    earliest: { nodeIds: ["study"], earlierWindowSearches: 2, earlierFound: 0 }, failure: null,
    budget: { credits: 10, usd: 0.01, ms: 1000, capHit: null },
    decision: { state: "ORIGIN_FOUND", row: 5, reasons: [], counts: {} }, searchLog: [], usage: [], scopeNote: "synthetic",
    ...over,
  });
}

const failure = { service: "tavily", endpoint: "search", status: "http_error", kept: "none" };
const state = (t: Trace) => decideStopState(t, rules);

describe("decideStopState rows", () => {
  it("[C16] row 1: a tool failure is TOOL_FAILED", () => {
    expect(state(trace({ failure }))).toMatchObject({ state: "TOOL_FAILED", row: 1 });
  });
  it("[C16] row 1 beats row 2: failure plus cap hit is TOOL_FAILED", () => {
    expect(state(trace({ failure, budget: { credits: 150, usd: 0, ms: 0, capHit: "credits" } })).state).toBe("TOOL_FAILED");
  });
  it("[C16] row 2: a cap hit is PARTIAL", () => {
    expect(state(trace({ budget: { credits: 150, usd: 0, ms: 0, capHit: "credits" } }))).toMatchObject({ state: "PARTIAL", row: 2 });
  });
  it("[C16] row 3: only meta pages is NO_PAGES_FOUND", () => {
    const t = trace({ nodes: [node("myth", { meta: true })], earliest: { nodeIds: [], earlierWindowSearches: 2, earlierFound: 0 } });
    expect(state(t)).toMatchObject({ state: "NO_PAGES_FOUND", row: 3 });
  });
  it("[C16] [C20] row 4: different numbers in the earliest cluster are CONFLICTING", () => {
    const t = trace({
      nodes: [node("study"), node("copy", { clusterId: "c-study" })],
      spans: [span("s1", "study", "Penguins napped 14 times a day."), span("s2", "copy", "Penguins napped 41 times a day.")],
    });
    expect(state(t)).toMatchObject({ state: "CONFLICTING", row: 4 });
  });
  it("[C20] numbers equal through a declared transform are not CONFLICTING", () => {
    const t = trace({
      nodes: [node("study"), node("copy", { clusterId: "c-study" })],
      spans: [span("s1", "study", "Penguins napped 14.2 times a day."), span("s2", "copy", "Penguins napped 14 times a day.")],
    });
    expect(state(t).state).toBe("ORIGIN_FOUND");
  });
  it("[C16] row 5: a dated primary earliest page with nothing unread is ORIGIN_FOUND", () => {
    expect(state(trace())).toMatchObject({ state: "ORIGIN_FOUND", row: 5, counts: { pages: 2, unreadParents: 0 } });
  });
  it("[C16] row 6: everything else is TRAIL_GOES_COLD", () => {
    expect(state(trace({ nodes: [node("study", { citesEarlier: true })] }))).toMatchObject({ state: "TRAIL_GOES_COLD", row: 6 });
  });
  it("[C20] a shared unrelated number does not hide a conflict", () => {
    for (const [a, b] of [
      ["In 2012 penguins napped 14 times a day.", "In 2012 penguins napped 41 times a day."],
      ["Penguins napped 14 times a day in 3 zoos.", "Penguins napped 41 times a day in 3 zoos."],
    ]) {
      const t = trace({
        nodes: [node("study"), node("copy", { clusterId: "c-study" })],
        spans: [span("s1", "study", a!), span("s2", "copy", b!)],
      });
      expect(state(t)).toMatchObject({ state: "CONFLICTING", row: 4 });
    }
  });
});

describe("rules wiring", () => {
  // "Superpenguins" contains the subject word but not as a whole word, so a weak 14 (under 3 significant digits)
  // does not hit; with weakNumberMinSigDigits 2, 14 is strong and hits, which exposes the conflict with 41.
  it("[C20] passes weakNumberMinSigDigits from rules.json into the conflict check", () => {
    const t = trace({
      nodes: [node("study"), node("copy", { clusterId: "c-study" })],
      spans: [span("s1", "study", "Superpenguins nap 14 times a day."), span("s2", "copy", "Penguins nap 41 times a day.")],
    });
    expect(decideStopState(t, rules).state).not.toBe("CONFLICTING");
    expect(decideStopState(t, { ...rules, weakNumberMinSigDigits: 2 }).state).toBe("CONFLICTING");
  });

  it("[C20] passes weakNumberMaxCommas from rules.json into the conflict check", () => {
    const t = trace({
      nodes: [node("study"), node("copy", { clusterId: "c-study" })],
      spans: [span("s1", "study", "Our penguins, the adults, nap 14 times a day."), span("s2", "copy", "Penguins nap 41 times a day.")],
    });
    expect(decideStopState(t, rules).state).toBe("CONFLICTING");
    expect(decideStopState(t, { ...rules, weakNumberMaxCommas: 0 }).state).not.toBe("CONFLICTING");
  });
});

describe("ORIGIN_FOUND blockers", () => {
  const cold = (t: Trace) => expect(state(t).state).toBe("TRAIL_GOES_COLD");
  it("[C16] an unread candidate parent blocks it", () => {
    cold(trace({ nodes: [node("study"), node("news", { candidateParents: [{ url: "https://old.example", read: false }] })] }));
  });
  it("[C16] an unsure page type blocks it", () => {
    cold(trace({ nodes: [node("study", { pageType: answer("unsure") })] }));
  });
  it("[C16] a non-primary page type blocks it", () => {
    cold(trace({ nodes: [node("study", { pageType: answer("blog") })] }));
  });
  it("[C2] [C16] a negated span on the earliest page blocks it", () => {
    cold(trace({ spans: [{ ...span("s1", "study", "Penguins napped 14 times a day."), contextBefore: "It is a myth that" }] }));
    cold(trace({ spans: [span("s1", "study", "It is a myth that penguins nap 14 times a day.")] }));
  });
  it("[C16] an earlier page found in the earlier-window searches blocks it", () => {
    cold(trace({ earliest: { nodeIds: ["study"], earlierWindowSearches: 2, earlierFound: 1 } }));
  });
  it("[C16] fewer than 2 earlier-window searches block it", () => {
    cold(trace({ earliest: { nodeIds: ["study"], earlierWindowSearches: 1, earlierFound: 0 } }));
  });
  it("[C16] an unconfirmed date blocks it", () => {
    cold(trace({ nodes: [node("study", { date: { kind: "unconfirmed", value: null, source: "tavily", firstCapture: null, conflictingDate: false } })] }));
  });
});
