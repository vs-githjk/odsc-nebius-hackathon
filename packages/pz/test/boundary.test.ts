import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { endingSentence, renderCard } from "../src/card/terminal.ts";
import type { ChatData, ChatInput } from "../src/clients/tokenfactory.ts";
import { lintText } from "../src/cli/lint-copy.ts";
import { withBoundaries } from "../src/engine/boundary.ts";
import { BOUNDARY_REASONS, findBoundary } from "../src/rules/boundary.ts";
import { decideStopState, loadRules } from "../src/rules/index.ts";
import { Trace, type TypedAnswer, type UsageRow } from "../src/schema/index.ts";
import { BOUNDARY } from "../src/schema/questions.ts";
import { verifyTrace } from "../src/verify/checks.ts";

const rules = loadRules();
const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");
const load = (name: string) => Trace.parse(JSON.parse(readFileSync(new URL(`../../../fixtures/traces/${name}.json`, import.meta.url), "utf8")));
const answer = (optionId: string, probability: number | null = 0.95): TypedAnswer => ({ questionId: "boundary", optionId, probability, top: [], model: "stub", threshold: null });

// sample-rich ends cold on one earliest page, the zoo's 2019 annual report. Each helper changes only what a case needs.
const cold = load("sample-rich");
const earliestId = cold.earliest.nodeIds[0]!;
function withEarliest(change: { boundary?: TypedAnswer | null; after?: string; url?: string; parents?: Trace["nodes"][number]["candidateParents"] }): Trace {
  const spans = cold.spans.map((s) => {
    if (s.nodeId !== earliestId || change.after === undefined) return s;
    return { ...s, contextAfter: change.after, windowSha256: sha256(s.contextBefore + s.text + change.after) };
  });
  const nodes = cold.nodes.map((n) => (n.id !== earliestId ? n : {
    ...n, boundary: change.boundary ?? null, ...(change.url ? { url: change.url, domain: new URL(change.url).hostname } : {}),
    ...(change.parents ? { candidateParents: change.parents, citesEarlier: change.parents.length > 0 } : {}),
  }));
  const t = { ...cold, spans, nodes };
  return { ...t, decision: decideStopState(t, rules) };
}

describe("T37 cold trails that explain themselves", () => {
  it("print: a confident typed print, with a print cue beside the sentence, leads the reasons and the card", () => {
    const t = withEarliest({ boundary: answer("print"), after: " The figure comes from Dr Okafor's book on seabirds (1967), pp. 112." });
    expect(findBoundary(t, rules)).toBe("print");
    expect(t.decision).toMatchObject({ state: "TRAIL_GOES_COLD", row: 6 });
    expect(t.decision.reasons[0]).toBe(BOUNDARY_REASONS.print);
    expect(endingSentence(t)).toBe("The trail ends at a print source the earliest page credits. There is no web copy to open.");
    expect(lintText(renderCard(t))).toEqual([]);
    expect(verifyTrace(t).failures).toEqual([]);
  });

  it("the model alone never decides: typed print with no print cue, or with no known confidence, counts for nothing", () => {
    expect(findBoundary(withEarliest({ boundary: answer("print") }), rules)).toBeNull();
    expect(findBoundary(withEarliest({ boundary: answer("print", null), after: " From a 1967 study." }), rules)).toBeNull();
    expect(findBoundary(withEarliest({ boundary: answer("print", 0.4), after: " From a 1967 study." }), { ...rules, confidenceThreshold: 0.8 })).toBeNull();
    expect(findBoundary(withEarliest({ after: " From a 1967 study." }), rules)).toBeNull();
  });

  it("unsourced: an editable page that cites nothing, and only then", () => {
    const wiki = withEarliest({ boundary: answer("unsourced"), url: "https://en.wikipedia.org/wiki/Harbor_Zoo" });
    expect(findBoundary(wiki, rules)).toBe("unsourced");
    expect(endingSentence(wiki)).toBe("The earliest page is one anyone can edit, and it gives no source for the claim.");
    expect(findBoundary(withEarliest({ boundary: answer("unsourced") }), rules)).toBeNull();
    expect(findBoundary(withEarliest({ boundary: answer("unsourced"), url: "https://en.wikipedia.org/wiki/Harbor_Zoo", parents: [{ url: "https://zoo.example/data", read: true }] }), rules)).not.toBe("unsourced");
  });

  it("circular, by code alone: the earliest page cites only pages in the trace that are no earlier than it", () => {
    const later = cold.nodes.find((n) => n.id !== earliestId && !n.meta && n.date.value && n.date.value > (cold.nodes.find((m) => m.id === earliestId)!.date.value ?? ""))!;
    const loop = withEarliest({ parents: [{ url: later.url, read: true }] });
    expect(findBoundary(loop, rules)).toBe("circular");
    expect(loop.decision.reasons[0]).toBe(BOUNDARY_REASONS.circular);
    expect(endingSentence(loop)).toBe("The earliest pages only cite each other or later copies, so there is nothing earlier to follow.");
    expect(findBoundary(withEarliest({ parents: [{ url: "https://not-in-trace.example/x", read: false }] }), rules)).toBeNull();
  });

  it("never touches a trace that does not go cold, and leaves every committed trace's decision as it was", () => {
    const origin = load("sample-origin");
    expect(decideStopState(origin, rules)).toEqual(origin.decision);
    for (const name of ["sample-rich", "sample-cold-unread", "sample-conflicting", "sample-partial", "sample-no-pages", "sample-tool-failed"]) {
      const t = load(name);
      expect(decideStopState(t, rules), name).toEqual(t.decision);
    }
  });
});

describe("T37 asking the boundary question in the pipeline", () => {
  const usage: UsageRow = { at: "2026-11-16T00:00:00.000Z", traceId: null, step: "test", service: "tokenfactory", endpoint: "chat", model: "Qwen/Qwen3-30B-A3B-Instruct-2507",
    promptTokens: 0, completionTokens: 0, cachedTokens: 0, credits: 0, costUsd: 0, latencyMs: 0, status: "200", cacheHit: false };
  const reply = (option: string, p: number): ChatData => ({ content: `{"boundary":"${option}"}`, model: "Qwen/Qwen3-30B-A3B-Instruct-2507", logprobs: { content: [
    { token: '{"boundary":"', logprob: 0, top_logprobs: [] },
    { token: option, logprob: Math.log(p), top_logprobs: [{ token: option, logprob: Math.log(p) }, { token: "none", logprob: Math.log(1 - p) }] },
    { token: '"}', logprob: 0, top_logprobs: [] },
  ] } });
  const clientFor = (data: ChatData) => ({ chat: vi.fn(async (_: ChatInput) => ({ data, usage, attempts: [usage] })) });

  it("asks once per earliest page of a cold trace, with the sentence and its surroundings as data, and decides again", async () => {
    const t = withEarliest({ after: " The figure comes from a 1967 study of seabirds." });
    const client = clientFor(reply("print", 0.93));
    const out = await withBoundaries(t, { client, rules });
    expect(client.chat).toHaveBeenCalledTimes(1);
    const [request] = client.chat.mock.calls[0]!;
    expect(request.messages[0]!.content).toBe(JSON.stringify([BOUNDARY]));
    expect(JSON.parse(JSON.parse(request.messages[1]!.content).source_text)).toMatchObject({ CLAIM: t.claim.text });
    expect(out.nodes.find((n) => n.id === earliestId)!.boundary).toMatchObject({ optionId: "print" });
    expect(out.decision.reasons[0]).toBe(BOUNDARY_REASONS.print);
  });

  it("makes no call on a trace that is not cold, or with no model", async () => {
    const client = clientFor(reply("print", 0.9));
    const origin = load("sample-origin");
    expect(await withBoundaries(origin, { client, rules })).toBe(origin);
    expect(await withBoundaries(cold, { client: null, rules })).toBe(cold);
    expect(client.chat).not.toHaveBeenCalled();
  });
});
