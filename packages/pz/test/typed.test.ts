import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ask, markDisputed } from "../src/typed/ask.ts";
import { confidenceFor, OTHER_MASS } from "../src/typed/logprobs.ts";
import { QUESTIONS } from "../src/schema/questions.ts";
import type { ChatData, ChatInput } from "../src/clients/tokenfactory.ts";
import type { UsageRow } from "../src/schema/usage.ts";

const call = JSON.parse(readFileSync(new URL("./recorded/tokenfactory/typed-1.json", import.meta.url), "utf8"));
const choice = call.response.choices[0];
const recorded: ChatData = { content: choice.message.content, logprobs: choice.logprobs, model: call.request.model };
const usage: UsageRow = { at: call.at, traceId: null, step: "test", service: "tokenfactory", endpoint: call.endpoint, model: recorded.model,
  promptTokens: call.usage.prompt_tokens, completionTokens: call.usage.completion_tokens, cachedTokens: 0, credits: 0,
  costUsd: call.cost_usd, latencyMs: call.latency_ms, status: "200", cacheHit: false };
const input = { earlier: "A neutral blue rectangle.", later: "A neutral green circle.", page: "A neutral sample page." };
// Repackage recorded value tokens into each request's schema; no new model output.
function replay(request: ChatInput): ChatData {
  const questions = JSON.parse(request.messages[0]!.content) as typeof QUESTIONS;
  const values = JSON.parse(recorded.content);
  const tokens = [{ token: "{", logprob: 0, top_logprobs: [] as { token: string; logprob: number }[] }];
  questions.forEach((q, i) => {
    tokens.push({ token: (i ? "," : "") + JSON.stringify(q.id) + ":", logprob: 0, top_logprobs: [] });
    const value = values[q.id] as string;
    const original = recorded.logprobs!.content.find(t => t.token === value)!;
    tokens.push({ token: '"', logprob: 0, top_logprobs: [] }, structuredClone(original), { token: '"', logprob: 0, top_logprobs: [] });
  });
  tokens.push({ token: "}", logprob: 0, top_logprobs: [] });
  return { ...recorded, content: tokens.map(t => t.token).join(""), logprobs: { content: tokens } };
}
function clientFor(data?: ChatData) {
  return { chat: vi.fn(async (request: ChatInput) => ({ data: data ?? replay(request), usage, attempts: [usage] })) };
}
const question = QUESTIONS[0]!;
function measured(alternatives = [{ token: "yes", logprob: Math.log(.6) }, { token: "no", logprob: Math.log(.3) }, { token: "unknown", logprob: Math.log(.1) }]) {
  const content = '{"scope_widened":"yes"}';
  return { content, logprobs: { content: [
    { token: '{"scope_widened":"', logprob: 0, top_logprobs: [] },
    { token: "yes", logprob: Math.log(.6), top_logprobs: alternatives },
    { token: '"}', logprob: 0, top_logprobs: [] },
  ] } };
}

describe("typed decision mechanism", () => {
  it("[C19] round-trips four questions through a recorded response without changing owner wording", async () => {
    const client = clientFor();
    const answers = await ask(QUESTIONS, input, { client, threshold: null });
    const parsed = JSON.parse(recorded.content);
    expect(answers.map(a => [a.questionId, a.optionId])).toEqual(QUESTIONS.map(q => [q.id, parsed[q.id]]));
    expect(answers.every(a => a.probability !== null)).toBe(true);
    expect(client.chat).toHaveBeenCalledTimes(2);
    const pairQuestions = QUESTIONS.filter(q => q.id !== "page_type");
    const pageQuestions = QUESTIONS.filter(q => q.id === "page_type");
    const [pairRequest, pageRequest] = client.chat.mock.calls.map(([request]) => request);
    for (const [request, questions] of [[pairRequest!, pairQuestions], [pageRequest!, pageQuestions]] as const) {
      expect(request.logprobs).toBe(true);
      expect(request.topLogprobs).toBe(5);
      expect(request.jsonSchema).toMatchObject({ additionalProperties: false, required: questions.map(q => q.id) });
      expect(JSON.parse(request.messages[0]!.content)).toEqual(questions);
    }
    expect(JSON.parse(JSON.parse(pairRequest!.messages[1]!.content).source_text)).toEqual({ EARLIER: input.earlier, LATER: input.later });
    expect(JSON.parse(pageRequest!.messages[1]!.content)).toEqual({ source_text: input.page });
    for (const answer of answers) expect(answer.top.reduce((sum, option) => sum + option.p, 0)).toBeCloseTo(1, 10);
  });
  it("[C19] maps first-token mass and retains unmatched alternatives", () => {
    const data = measured();
    const answer = confidenceFor(question, data.content, data.logprobs);
    expect(answer.probability).toBeCloseTo(.6);
    expect(answer.top).toEqual([{ optionId: "yes", p: .6 }, { optionId: "no", p: expect.closeTo(.3) }, { optionId: OTHER_MASS, p: expect.closeTo(.1) }]);
  });
  it("[C19] carries unreturned tail mass as other instead of inflating known options", () => {
    const data = measured([{ token: "yes", logprob: Math.log(.6) }, { token: "no", logprob: Math.log(.3) }]);
    const answer = confidenceFor(question, data.content, data.logprobs);
    expect(answer.probability).toBeCloseTo(.6);
    expect(answer.top.find(o => o.optionId === OTHER_MASS)?.p).toBeCloseTo(.1);
  });
  it("[C19] padding has zero mass and real page_type other stays distinct", () => {
    const q = QUESTIONS.find(q => q.id === "page_type")!;
    const content = '{"page_type":"other"}';
    const logprobs = { content: [{ token: '{"page_type":"', logprob: 0, top_logprobs: [] },
      { token: "other", logprob: Math.log(.7), top_logprobs: [{ token: "other", logprob: Math.log(.7) }, { token: "!", logprob: -9999 }] },
      { token: '"}', logprob: 0, top_logprobs: [] }] };
    const result = confidenceFor(q, content, logprobs);
    expect(result.top.find(o => o.optionId === "other")?.p).toBeCloseTo(.7);
    expect(result.top.find(o => o.optionId === OTHER_MASS)?.p).toBeCloseTo(.3);
  });
  it("[C19] skips padding before deduplicating a real token", () => {
    const data = measured([{ token: "yes", logprob: -9999 }, { token: "yes", logprob: Math.log(.6) }, { token: "no", logprob: Math.log(.3) }]);
    expect(confidenceFor(question, data.content, data.logprobs).probability).toBeCloseTo(.6);
  });
  it("[C19] requires paired passages and an explicit page before making mixed calls", async () => {
    for (const invalid of ["bare text", { earlier: input.earlier, later: input.later }]) {
      const client = clientFor();
      await expect(ask(QUESTIONS, invalid, { client, threshold: null })).rejects.toMatchObject({ code: "bad_response" });
      expect(client.chat).not.toHaveBeenCalled();
    }
    const client = clientFor();
    const q = QUESTIONS.find(q => q.id === "page_type")!;
    const answers = await ask([q], input.page, { client, threshold: null });
    expect(client.chat).toHaveBeenCalledTimes(1);
    expect(JSON.parse(client.chat.mock.calls[0]![0].messages[1]!.content)).toEqual({ source_text: input.page });
    expect(answers[0]?.questionId).toBe("page_type");
  });
  it("[C19] preserves caller question order across split requests", async () => {
    const questions = [...QUESTIONS].reverse();
    expect((await ask(questions, input, { client: clientFor(), threshold: null })).map(a => a.questionId)).toEqual(questions.map(q => q.id));
  });
  it("[C19] ambiguous shared first tokens produce no claimed confidence", () => {
    const q = { ...question, options: [{ id: "yellow", label: "PENDING" }, { id: "yes", label: "PENDING" }] };
    const d = measured([{ token: "y", logprob: 0 }]);
    d.logprobs.content.splice(1, 1, { token: "y", logprob: 0, top_logprobs: [{ token: "y", logprob: 0 }] }, { token: "es", logprob: 0, top_logprobs: [] });
    expect(confidenceFor(q, d.content, d.logprobs).probability).toBeNull();
  });
  it("[C19] handles a quote merged into the first token and multi-token ids", () => {
    const q = { ...question, options: [{ id: "yellow", label: "PENDING" }, { id: "yes", label: "PENDING" }] };
    const content = '{"scope_widened":"yellow"}';
    const logprobs = { content: [{ token: '{"scope_widened":', logprob: 0, top_logprobs: [] },
      { token: '"yel', logprob: Math.log(.8), top_logprobs: [{ token: '"yel', logprob: Math.log(.8) }, { token: '"yes', logprob: Math.log(.2) }] },
      { token: 'low"}', logprob: 0, top_logprobs: [] }] };
    expect(confidenceFor(q, content, logprobs).probability).toBeCloseTo(.8);
  });
  it("[C19] an escaped value that has no exact token prefix gets null confidence", () => {
    const content = String.raw`{"scope_widened":"\u0079es"}`;
    const logprobs = { content: [{ token: '{"scope_widened":"', logprob: 0, top_logprobs: [] },
      { token: String.raw`\u0079`, logprob: 0, top_logprobs: [{ token: String.raw`\u0079`, logprob: 0 }] },
      { token: 'es"}', logprob: 0, top_logprobs: [] }] };
    expect(confidenceFor(question, content, logprobs).probability).toBeNull();
  });
  it("[C19] below threshold is unsure, equal threshold and null threshold preserve choice", async () => {
    const d = measured();
    const data = { ...recorded, ...d };
    expect((await ask([question], input, { client: clientFor(data), threshold: .7 }))[0]).toMatchObject({ optionId: "unsure", probability: expect.closeTo(.6), threshold: .7 });
    expect((await ask([question], input, { client: clientFor(data), threshold: .6 }))[0]?.optionId).toBe("yes");
    expect((await ask([question], input, { client: clientFor(data), threshold: null }))[0]?.optionId).toBe("yes");
  });
  it("[C19] no logprobs or misaligned tokens have null confidence without invented mass", async () => {
    for (const logprobs of [null, { content: [{ token: "not the response", logprob: 0, top_logprobs: [] }] }]) {
      const answers = await ask(QUESTIONS, input, { client: { chat: vi.fn(async (request: ChatInput) => ({ data: { ...replay(request), logprobs }, usage, attempts: [usage] })) }, threshold: .9 });
      expect(answers.every(a => a.probability === null && a.top.length === 0 && a.optionId !== "unsure")).toBe(true);
    }
  });
  it("[C19] invalid JSON, duplicate keys, missing fields and invalid ids are bad_response", async () => {
    for (const content of ["{", '{"scope_widened":"yes","scope_widened":"no"}', '{"scope_widened":"yes"}', JSON.stringify({ ...JSON.parse(recorded.content), page_type: "unknown" })]) {
      await expect(ask(QUESTIONS, input, { client: clientFor({ ...recorded, content }), threshold: null })).rejects.toMatchObject({ code: "bad_response" });
    }
  });
  it("[C19] code contradiction is disputed, unsure is not, and TypedAnswer stays unchanged", async () => {
    const answer = (await ask(QUESTIONS, input, { client: clientFor(), threshold: null }))[0]!;
    expect(markDisputed(answer, "no")).toEqual({ answer, disputed: true });
    expect(markDisputed(answer, true).disputed).toBe(false);
    expect(markDisputed({ ...answer, optionId: "unsure" }, "no").disputed).toBe(false);
    expect(answer).not.toHaveProperty("disputed");
  });
});
