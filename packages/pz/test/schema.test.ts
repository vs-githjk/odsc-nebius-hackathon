import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Edge, Question, QUESTIONS, Readout, Trace, questionsToJsonSchema } from "../src/schema/index.ts";

const atoms = { number: { raw: "4", canonical: "4" }, unit: null, subjectLemma: "widget", population: null, time: null, hedge: null, namedSource: null, variants: [] };
const trace = {
  schemaVersion: "1", id: "sample", mode: "SAMPLE", synthetic: true,
  recordedAt: "2026-11-01T08:00:00Z", claim: { text: "Four widgets", atoms }, viralSentence: "Four widgets",
  nodes: [], edges: [], clusters: [], spans: [], hops: [], blame: [],
  roots: { pages: 0, clusters: 0, rootsLinked: 0, clustersUnlinked: 0, studiesFound: null }, redHopEdgeId: null,
  earliest: { nodeIds: [], earlierWindowSearches: 0, earlierFound: 0 }, failure: null,
  budget: { credits: 0, usd: 0, ms: 0, capHit: null },
  decision: { state: "NO_PAGES_FOUND", row: 6, reasons: [], counts: {} }, searchLog: [], usage: [], scopeNote: "synthetic",
};

describe("shared schema contract", () => {
  it("parses a minimal trace and round-trips JSON", () => {
    expect(Trace.parse(JSON.parse(JSON.stringify(trace)))).toEqual(trace);
  });
  it("rejects an edge missing its child span", () => {
    expect(Edge.safeParse({ id: "e", parentId: "p", childId: "c", kind: "explicit", parentSpanId: "s", linkHref: null }).success).toBe(false);
  });
  it("rejects a readout score and other extra object fields", () => {
    const readout = { id: "scope_widened", source: "inferred", value: "unsure", probability: null, disputed: false };
    expect(Readout.safeParse(readout).success).toBe(true);
    expect(Readout.safeParse({ ...readout, score: 0.5 }).success).toBe(false);
    expect(Trace.safeParse({ ...trace, claim: { ...trace.claim, extra: true } }).success).toBe(false);
  });
  it("exports the committed JSON schemas without drift", () => {
    for (const [file, document] of [["trace", z.toJSONSchema(Trace)], ["questions", questionsToJsonSchema(QUESTIONS)]] as const) {
      const saved = JSON.parse(readFileSync(new URL(`../../../schema/${file}.schema.json`, import.meta.url), "utf8"));
      expect(saved).toEqual(document);
    }
  });
  it("makes a strict required enum field for each of the four questions", () => {
    const schema = questionsToJsonSchema(QUESTIONS);
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(QUESTIONS.map(q => q.id));
    for (const q of QUESTIONS) expect(schema.properties?.[q.id]).toMatchObject({ enum: q.options.map(o => o.id) });
  });
  it("round-trips the four questions with unique lowercase option ids", () => {
    expect(QUESTIONS).toHaveLength(4);
    for (const q of QUESTIONS) {
      expect(Question.parse(JSON.parse(JSON.stringify(q)))).toEqual(q);
      expect(q.instructions).toBe("PENDING");
      expect(new Set(q.options.map(o => o.id)).size).toBe(q.options.length);
      for (const option of q.options) {
        expect(option.id).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(option.id.length).toBeLessThanOrEqual(12);
        expect(option.label).toBe("PENDING");
      }
    }
  });
  it("rejects invalid or duplicate options and duplicate question fields", () => {
    const q = QUESTIONS[0]!;
    expect(Question.safeParse({ ...q, options: [{ id: "YES", label: "PENDING" }] }).success).toBe(false);
    expect(Question.safeParse({ ...q, options: [q.options[0], q.options[0]] }).success).toBe(false);
    expect(() => questionsToJsonSchema([q, q])).toThrow();
  });
});
