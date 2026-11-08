import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { blameWords } from "../src/engine/blame.ts";
import { hopFor, measuredReadouts, redHop, typedReadouts, wordDiff, words, type Ask } from "../src/engine/readouts.ts";
import type { ChatData, ChatInput } from "../src/clients/tokenfactory.ts";
import { loadRules } from "../src/rules/index.ts";
import { Hop, Readout, type Edge, type Node, type Span, type Trace } from "../src/schema/index.ts";
import { ask } from "../src/typed/ask.ts";

const rules = loadRules();
const dir = new URL("../../../fixtures/traces/", import.meta.url);
const fixtures: Trace[] = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));
const rich = fixtures.find((t) => t.id === "sample-rich")!;
const atoms = rich.claim.atoms;
const value = (readouts: Readout[], id: Readout["id"]) => readouts.find((r) => r.id === id)?.value;

// A Token Factory client that answers each typed question with the given option and first-token probability,
// so the real T19 ask parses it. No model is called.
function clientFor(answers: Record<string, [string, number]>) {
  const chat = vi.fn(async (request: ChatInput) => {
    const ids = (JSON.parse(request.messages[0]!.content) as { id: string }[]).map((q) => q.id);
    const tokens = [{ token: "{", logprob: 0, top_logprobs: [] as { token: string; logprob: number }[] }];
    ids.forEach((id, i) => {
      const [option, p] = answers[id]!;
      const other = option === "yes" ? "no" : "yes";
      tokens.push({ token: (i ? "," : "") + JSON.stringify(id) + ":", logprob: 0, top_logprobs: [] }, { token: '"', logprob: 0, top_logprobs: [] },
        { token: option, logprob: Math.log(p), top_logprobs: [{ token: option, logprob: Math.log(p) }, { token: other, logprob: Math.log(1 - p) }] },
        { token: '"', logprob: 0, top_logprobs: [] });
    });
    tokens.push({ token: "}", logprob: 0, top_logprobs: [] });
    const data: ChatData = { content: tokens.map((t) => t.token).join(""), logprobs: { content: tokens }, model: "Qwen/Qwen3-30B-A3B-Instruct-2507" };
    return { data, usage: null as never, attempts: [] };
  });
  return { chat };
}
const askWith = (answers: Record<string, [string, number]>, threshold: number | null = null) => {
  const client = clientFor(answers);
  const bound: Ask = (questions, input) => ask(questions, input, { client, threshold });
  return Object.assign(bound, { client });
};
const typical = { scope_widened: ["yes", 0.81], attribution_shifted: ["no", 0.9], context_stripped: ["no", 0.7] } as Record<string, [string, number]>;

const node = (id: string, date: string | null, over: Partial<Node> = {}): Node => ({
  id, url: `https://${id}.example/`, domain: `${id}.example`, title: id,
  date: { kind: "published", value: date, source: "metadata", firstCapture: date, conflictingDate: false },
  clusterId: `c-${id}`, evidence: "observed", meta: false, read: true, versionOf: null, spanIds: [`s-${id}`],
  citesEarlier: false, candidateParents: [], pageType: null, ...over,
});
const span = (nodeId: string, text: string): Span => ({
  id: `s-${nodeId}`, nodeId, text, contextBefore: "", contextAfter: "", start: 0, end: text.length,
  extractSha256: "x", windowSha256: "x", fetchedAt: "2026-11-01T00:00:00Z", waybackUrl: null, tier: "exact",
});
const edge = (id: string, parentId: string, childId: string, kind: Edge["kind"] = "explicit"): Edge => ({
  id, parentId, childId, kind, parentSpanId: `s-${parentId}`, childSpanId: `s-${childId}`, linkHref: kind === "explicit" ? `https://${parentId}.example/` : null,
});
const hop = (edgeId: string, readouts: Readout[]): Hop => ({ edgeId, readouts, wordDiff: [], faithful: false });
const yes = (id: Readout["id"], over: Partial<Readout> = {}): Readout => ({ id, source: "measured", value: "yes", probability: null, disputed: false, ...over });

describe("measured readouts", () => {
  it("[C5] agree with every measured readout stored in the fixtures", () => {
    let checked = 0;
    for (const t of fixtures) for (const e of t.edges) {
      const text = (id: string) => t.spans.find((s) => s.id === id)!.text;
      const computed = measuredReadouts(text(e.parentSpanId), text(e.childSpanId), t.claim.atoms, rules);
      for (const r of t.hops.find((h) => h.edgeId === e.id)!.readouts.filter((r) => r.source === "measured")) {
        expect([t.id, e.id, r.id, value(computed, r.id)]).toEqual([t.id, e.id, r.id, r.value]);
        checked++;
      }
    }
    expect(checked).toBe(19);
  });

  it("[C5] reads each change from the two spans of a hop", () => {
    const m = (a: string, b: string) => Object.fromEntries(measuredReadouts(a, b, atoms, rules).map((r) => [r.id, r.value]));
    expect(m("Penguins nap 14 times a day.", "Penguins nap 41 times a day.")).toMatchObject({ number_changed: "yes", unit_changed: "no" });
    expect(m("Penguins nap 14 times a day.", "Penguins nap 14.2 times a day.")).toMatchObject({ number_changed: "no" });
    expect(m("Penguins nap 14 times a day.", "Penguins nap 14 times a week.")).toMatchObject({ number_changed: "no", unit_changed: "yes" });
    expect(m("Penguins nap about 14 times a day.", "Penguins nap 14 times a day.")).toMatchObject({ hedge_dropped: "yes" });
    expect(m("Penguins nap 14 times a day.", "Penguins nap about 14 times a day.")).toMatchObject({ hedge_dropped: "no" });
    expect(m("Penguins nap 14 times a day.", "Penguins nap 14 times a day, twice as often as seals.")).toMatchObject({ comparison_added: "yes" });
    expect(m("Penguins nap often.", "Penguins nap 14 times a day.")).toMatchObject({ number_changed: "unsure", unit_changed: "unsure" });
  });

  it("[C5] the word diff matches every fixture hop", () => {
    for (const t of fixtures) for (const e of t.edges) {
      const text = (id: string) => words(t.spans.find((s) => s.id === id)!.text);
      expect(wordDiff(text(e.parentSpanId), text(e.childSpanId))).toEqual(t.hops.find((h) => h.edgeId === e.id)!.wordDiff);
    }
  });
});

describe("typed readouts", () => {
  it("[C27] come from ask as inferred readouts with their own probability, and no score", async () => {
    const a = askWith(typical);
    const readouts = await typedReadouts("Penguins nap about 14 times a day.", "All birds nap 14 times a day.", a);
    expect(readouts.map((r) => [r.id, r.source, r.value, r.probability])).toEqual([
      ["scope_widened", "inferred", "yes", expect.closeTo(0.81)],
      ["attribution_shifted", "inferred", "no", expect.closeTo(0.9)],
      ["context_stripped", "inferred", "no", expect.closeTo(0.7)],
    ]);
    for (const r of readouts) expect(() => Readout.parse(r)).not.toThrow();
    expect(readouts.every((r) => !("score" in r))).toBe(true);
    const [request] = a.client.chat.mock.calls[0]!;
    expect(a.client.chat).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.parse(request.messages[1]!.content).source_text)).toEqual({ EARLIER: "Penguins nap about 14 times a day.", LATER: "All birds nap 14 times a day." });
  });

  it("[C27] an answer below the confidence threshold is unsure", async () => {
    const readouts = await typedReadouts("a", "b", askWith(typical, 0.75));
    expect(readouts.map((r) => [r.id, r.value])).toEqual([["scope_widened", "yes"], ["attribution_shifted", "no"], ["context_stripped", "unsure"]]);
  });

  it("[C27] a hop carries seven separate readouts, measured or inferred, and is faithful only when all say no", async () => {
    const e = rich.edges.find((x) => x.id === "e2")!;
    const h = await hopFor(e, rich.spans, atoms, rules, askWith(typical));
    expect(() => Hop.parse(h)).not.toThrow();
    expect(h.readouts.map((r) => `${r.id}:${r.source}`)).toEqual([
      "number_changed:measured", "unit_changed:measured", "hedge_dropped:measured", "comparison_added:measured",
      "scope_widened:inferred", "attribution_shifted:inferred", "context_stripped:inferred",
    ]);
    expect(h.faithful).toBe(false);
    const calm = { scope_widened: ["no", 0.9], attribution_shifted: ["no", 0.9], context_stripped: ["no", 0.9] } as Record<string, [string, number]>;
    const same = { ...e, id: "same", parentSpanId: "s-social-post", childSpanId: "s-social-post" };
    expect((await hopFor(same, rich.spans, atoms, rules, askWith(calm))).faithful).toBe(true);
    expect((await hopFor(same, rich.spans, atoms, rules, askWith(calm, 0.95))).faithful).toBe(false);
  });
});

describe("red hop", () => {
  const nodes = [node("a", "2019-01-01"), node("b", "2019-06-01"), node("c", "2020-01-01"), node("d", "2021-01-01")];
  const edges = [edge("e1", "a", "b"), edge("e2", "b", "c"), edge("e3", "c", "d")];

  it("[C5] is the earliest hop, by the child's date, with any readout saying yes", () => {
    expect(redHop([hop("e3", [yes("number_changed")]), hop("e2", [yes("scope_widened", { source: "inferred", probability: 0.8 })]), hop("e1", [])], edges, nodes)).toBe("e2");
    expect(redHop([hop("e1", []), hop("e2", []), hop("e3", [])], edges, nodes)).toBeNull();
  });

  it("[C5] orders by date, not by edge id, and puts an undated child last", () => {
    const late = [...edges, edge("e0", "a", "d")];
    expect(redHop([hop("e0", [yes("hedge_dropped")]), hop("e2", [yes("hedge_dropped")])], late, nodes)).toBe("e2");
    const undated = [...nodes, node("x", null)];
    expect(redHop([hop("e0", [yes("hedge_dropped")]), hop("e3", [yes("hedge_dropped")])], [edge("e0", "a", "x"), ...edges], undated)).toBe("e3");
  });

  it("[C27] unsure and disputed readouts never make a hop red", () => {
    const unsure = yes("attribution_shifted", { source: "inferred", value: "unsure", probability: 0.55 });
    const disputed = yes("context_stripped", { source: "inferred", probability: 0.62, disputed: true });
    expect(redHop([hop("e1", [unsure]), hop("e2", [disputed]), hop("e3", [yes("hedge_dropped")])], edges, nodes)).toBe("e3");
  });

  it("[C5] skips hops that touch a meta page and breaks date ties by edge id", () => {
    const meta = [...nodes.slice(0, 3), node("d", "2019-06-01", { meta: true })];
    const tied = [edge("e9", "a", "b"), edge("e1", "a", "d"), edge("e2", "a", "b")];
    expect(redHop([hop("e9", [yes("hedge_dropped")]), hop("e1", [yes("hedge_dropped")]), hop("e2", [yes("hedge_dropped")])], tied, meta)).toBe("e2");
  });
});

describe("word blame", () => {
  it("[C26] recomputes the stored blame on every fixture", () => {
    for (const t of fixtures) expect([t.id, blameWords(t.viralSentence, t.nodes, t.spans, t.edges)]).toEqual([t.id, t.blame]);
  });

  it("[C26] every blamed word is in the span it points at, and missing words are null", () => {
    const nodes = [node("old", "2019-01-01"), node("new", "2020-01-01")];
    const spans = [span("old", "Penguins nap 14 times a day."), span("new", "Penguins nap 14 times a day, twice as often as seals.")];
    const blame = blameWords("Penguins nap 14 times a day, twice as often as walruses", nodes, spans, [edge("e1", "old", "new", "inferred")]);
    for (const b of blame.filter((b) => b.firstSeen)) expect(words(spans.find((s) => s.id === b.firstSeen!.spanId)!.text)).toContain(b.word);
    expect(blame.find((b) => b.word === "penguins")).toMatchObject({ firstSeen: { nodeId: "old", date: "2019-01-01" }, viaInferredHop: false });
    expect(blame.find((b) => b.word === "twice")).toMatchObject({ firstSeen: { nodeId: "new" }, viaInferredHop: true });
    expect(blame.find((b) => b.word === "walruses")!.firstSeen).toBeNull();
    const linked = blameWords("twice", nodes, spans, [edge("e1", "old", "new", "inferred"), edge("e2", "old", "new")]);
    expect(linked[0]).toMatchObject({ firstSeen: { nodeId: "new" }, viaInferredHop: false });
  });

  it("[C26] skips meta pages and never blames an undated page first", () => {
    const nodes = [node("undated", null), node("myth", "2018-01-01", { meta: true }), node("dated", "2020-01-01")];
    const spans = [span("undated", "Penguins nap."), span("myth", "Penguins nap."), span("dated", "Penguins nap.")];
    expect(blameWords("Penguins nap", nodes, spans, []).map((b) => b.firstSeen?.nodeId)).toEqual(["dated", "dated"]);
  });
});
