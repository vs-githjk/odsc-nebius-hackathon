import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ChatData, ChatInput } from "../src/clients/tokenfactory.ts";
import { sameClaim } from "../src/match/same-claim.ts";
import { decideStopState, loadRules } from "../src/rules/index.ts";
import { Trace, type Atoms, type TypedAnswer, type UsageRow } from "../src/schema/index.ts";

const rules = loadRules();
const SECOND = "deepseek-ai/DeepSeek-V4-Pro-0813";
const usage: UsageRow = { at: "2026-11-16T00:00:00.000Z", traceId: null, step: "test", service: "tokenfactory", endpoint: "chat", model: SECOND,
  promptTokens: 0, completionTokens: 0, cachedTokens: 0, credits: 0, costUsd: 0, latencyMs: 0, status: "200", cacheHit: false };
const reply = (answer: string, model: string, p: number | null = 0.9): ChatData => ({ content: `{"same_claim":"${answer}"}`, model, logprobs: p === null ? null : { content: [
  { token: '{"same_claim":"', logprob: 0, top_logprobs: [] },
  { token: answer, logprob: Math.log(p), top_logprobs: [{ token: answer, logprob: Math.log(p) }] },
  { token: '"}', logprob: 0, top_logprobs: [] },
] } });
// First model (Qwen) and second model answer independently, picked by the request's model.
const clientFor = (first: string, second: string | Error, secondP: number | null = 0.9) => ({ chat: vi.fn(async (input: ChatInput) => {
  if (input.model === SECOND) { if (second instanceof Error) throw second; return { data: reply(second, SECOND, secondP), usage, attempts: [usage] }; }
  return { data: reply(first, input.model), usage, attempts: [usage] };
}) });
const atoms: Atoms = { number: { raw: "14", canonical: "14" }, unit: "times", subjectLemma: "penguin", population: null, time: null, hedge: null, namedSource: null, variants: [] };
const input = { claim: "Harbor Zoo penguins nap 14 times a day.", sentence: "The adult penguins nap 14 times a day.", atoms };
const on = { ...rules, secondSameClaimModel: SECOND };

describe("T79 second model on same_claim", () => {
  it("is off by default: one call, and the first model's yes stands", async () => {
    expect(rules.secondSameClaimModel).toBeNull();
    const client = clientFor("yes", "no");
    expect(await sameClaim(input, { client, rules })).toMatchObject({ candidate: true, reason: null });
    expect(client.chat).toHaveBeenCalledTimes(1);
  });

  it("when on, asks the second model only after a yes, and its no makes the page unsure", async () => {
    const agree = await sameClaim(input, { client: clientFor("yes", "yes"), rules: on });
    expect(agree).toMatchObject({ candidate: true, reason: null, second: { optionId: "yes", model: SECOND } });
    expect(await sameClaim(input, { client: clientFor("yes", "no"), rules: on })).toMatchObject({ candidate: false, reason: "second_disagrees" });
    const firstNo = clientFor("no", "yes");
    expect(await sameClaim(input, { client: firstNo, rules: on })).toMatchObject({ candidate: false, reason: "typed_no" });
    expect(firstNo.chat).toHaveBeenCalledTimes(1);
  });

  it("a second model that cannot answer counts as unsure; one with no logprobs can still agree", async () => {
    const { TokenFactoryError } = await import("../src/clients/tokenfactory.ts");
    expect(await sameClaim(input, { client: clientFor("yes", new TokenFactoryError("bad_response", 200, [])), rules: on })).toMatchObject({ candidate: false, reason: "second_disagrees", second: null });
    expect(await sameClaim(input, { client: clientFor("yes", "yes", null), rules: on })).toMatchObject({ candidate: true });
  });

  it("decide enforces it from the trace, so pz verify recomputes the same ending", () => {
    const t = Trace.parse(JSON.parse(readFileSync(new URL("../../../fixtures/traces/sample-origin.json", import.meta.url), "utf8")));
    expect(decideStopState(t, rules).state).toBe("ORIGIN_FOUND");
    const second = (optionId: string): TypedAnswer => ({ questionId: "same_claim", optionId, probability: null, top: [], model: SECOND, threshold: null });
    const withSecond = (optionId: string | null) => ({ ...t, nodes: t.nodes.map((n) => (t.earliest.nodeIds.includes(n.id) ? { ...n, sameClaimSecond: optionId ? second(optionId) : null } : n)) });
    expect(decideStopState(withSecond("yes"), on).state).toBe("ORIGIN_FOUND");
    const vetoed = decideStopState(withSecond("no"), on);
    expect(vetoed.state).toBe("TRAIL_GOES_COLD");
    expect(vetoed.reasons).toContain(`the second model (${SECOND}) did not say yes on same_claim for 1 earliest page(s), which counts as unsure`);
    expect(decideStopState(withSecond(null), on).state).toBe("TRAIL_GOES_COLD");
    expect(decideStopState(withSecond("no"), rules).state).toBe("ORIGIN_FOUND");
  });
});
