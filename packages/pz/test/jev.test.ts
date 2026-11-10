import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { QUESTIONS } from "../src/schema/questions.ts";
import { createJevClient } from "../src/clients/jev.ts";
import { compareJev } from "../../../eval/ablation/jev.ts";

const reply = (file: string) => JSON.parse(readFileSync(new URL(`./recorded/jev/${file}.json`, import.meta.url), "utf8"));
const input = { earlier: "Earlier synthetic passage.", later: "Later synthetic passage.", page: "A synthetic report." };
const key = "test-private-jev-credential";
function setup(transform: (body: ReturnType<typeof reply>) => unknown = b => b) {
  const requests: { body: any; init: RequestInit }[] = [];
  const rows: unknown[] = [];
  let clock = 0;
  const client = createJevClient({ apiKey: key, logUsage: row => { rows.push(row); }, now: () => clock += 10,
    fetch: (async (url, init) => {
      expect(String(url)).toBe("https://api.typesafe.ai/v1/systemone");
      requests.push({ body: JSON.parse(String(init?.body)), init: init ?? {} });
      return new Response(JSON.stringify(transform(reply(requests.length % 2 ? "pair" : "page"))));
    }) as typeof fetch });
  return { client, requests, rows };
}

describe("Jev comparison", () => {
  it("sends the four owner questions unchanged in separate pair/page requests", async () => {
    const { client, requests } = setup();
    const result = await client.askFour(input);
    expect(result.answers.map(a => a.questionId)).toEqual(QUESTIONS.map(q => q.id));
    expect(requests).toHaveLength(2);
    for (const { body } of requests) for (const [id, q] of Object.entries(body.questions) as [string, any][]) {
      const owner = QUESTIONS.find(o => o.id === id)!;
      expect(q).toEqual({ type: "choice", instructions: owner.instructions, criteria: Object.fromEntries(owner.options.map(o => [o.id, o.label])) });
    }
    expect(requests[0]?.body.state).toEqual({ source_text: JSON.stringify({ EARLIER: input.earlier, LATER: input.later }) });
    expect(requests[1]?.body.state).toEqual({ source_text: input.page });
    expect(Object.keys(requests[1]?.body.questions)).toEqual(["page_type"]);
    expect(new Headers(requests[0]?.init.headers).get("authorization")).toBe(`Bearer ${key}`);
    expect(result.answers[0]).toMatchObject({ optionId: "yes", probability: 0.8, threshold: null });
    expect(result.vendorConfidence.scope_widened).toBe(0.7);
    expect(result.usage.map(r => r.latencyMs)).toEqual([10, 10]);
    expect(result.usage[0]?.costUsd).toBeCloseTo(120 * 0.042 / 1_000_000);
  });
  it("computes agreement and latency against file-supplied baseline answers", async () => {
    const baseline = await setup().client.askFour(input);
    baseline.answers[1]!.optionId = "yes";
    let time = 0;
    const result = await compareJev([{ ...input, baseline: { answers: baseline.answers, latencyMs: 90 } }], setup().client, () => time += 20);
    expect(result.summary).toMatchObject({ questions: 4, matches: 3, agreement: 0.75, jevLatencyMs: { p50: 20, p90: 20 }, baselineLatencyMs: { p50: 90, p90: 90 } });
    expect(result.rows[0]?.matches).toBe(3);
    expect(JSON.stringify(result)).not.toContain(input.earlier);
    expect(JSON.stringify(result)).not.toContain(key);
  });
  it("validates all comparison cases before the first provider call", async () => {
    const base = await setup().client.askFour(input);
    const run = setup();
    await expect(compareJev([{ ...input, baseline: { answers: base.answers, latencyMs: 1 } }, {}], run.client)).rejects.toThrow();
    expect(run.requests).toEqual([]);
    await expect(compareJev([], run.client)).rejects.toThrow();
  });
  it("rejects a thresholded or incomplete baseline instead of mixing policies", async () => {
    const base = await setup().client.askFour(input);
    base.answers[0]!.threshold = 0.8;
    await expect(compareJev([{ ...input, baseline: { answers: base.answers, latencyMs: 1 } }], setup().client)).rejects.toThrow();
  });
  it("rejects bad provider options, missing questions and invalid probability values", async () => {
    for (const mutate of [
      (b: any) => { b.answers.scope_widened.choice = "unknown"; return b; },
      (b: any) => { delete b.answers.context_stripped; return b; },
      (b: any) => { b.answers.scope_widened.probabilities.yes = 2; return b; },
    ]) await expect(setup(mutate).client.askFour(input)).rejects.toMatchObject({ code: "bad_response" });
  });
  it("keeps echoed credentials out of models, rows, exceptions and all returned data", async () => {
    const run = setup(b => ({ ...b, model: key, ignored: key }));
    const result = await run.client.askFour(input);
    expect(JSON.stringify({ result, rows: run.rows })).not.toContain(key);
    const logs: unknown[] = [];
    for (const impl of [
      async () => { throw new Error(key); },
      async () => new Response(key, { status: 401 }),
      async () => new Response(key),
    ]) {
      const client = createJevClient({ apiKey: key, fetch: impl as typeof fetch, logUsage: r => { logs.push(r); } });
      const err = await client.askFour(input).catch(e => e);
      expect(err.code).toBeTruthy();
      expect(JSON.stringify({ message: String(err), usage: err.usage, logs })).not.toContain(key);
    }
  });
  it("checks key and complete input before calling, and preserves answers if persistence fails", async () => {
    let calls = 0;
    const fetch = (async () => { calls++; return new Response("{}"); }) as typeof globalThis.fetch;
    await expect(createJevClient({ apiKey: "", fetch }).askFour(input)).rejects.toMatchObject({ code: "not_configured" });
    await expect(createJevClient({ apiKey: key, fetch }).askFour({ earlier: "x" } as never)).rejects.toThrow();
    expect(calls).toBe(0);
    const run = setup();
    const client = createJevClient({ apiKey: key, fetch: (async () => new Response(JSON.stringify(reply(++calls === 1 ? "pair" : "page")))) as typeof globalThis.fetch, logUsage: () => { throw new Error("disk full"); } });
    expect((await client.askFour(input)).answers).toHaveLength(4);
    expect(run.requests).toEqual([]);
  });
});
