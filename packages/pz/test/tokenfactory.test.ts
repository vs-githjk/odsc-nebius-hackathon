import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createTokenFactoryClient } from "../src/clients/tokenfactory.ts";
import type { UsageRow } from "../src/schema/usage.ts";

const model = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const embeddingModel = "Qwen/Qwen3-Embedding-8B";
const fixture = async (name: string) => JSON.parse(await readFile(new URL(`./recorded/tokenfactory/${name}.json`, import.meta.url), "utf8"));
const args = { model, messages: [{ role: "user" as const, content: "Hello" }], maxTokens: 20 };
function setup(responses: (Response | Error)[]) {
  vi.stubEnv("NEBIUS_API_KEY", "test-secret-only");
  const rows: UsageRow[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error("Unexpected extra network call");
    return next;
  });
  const client = createTokenFactoryClient({ fetch, logUsage: row => { rows.push(row); }, sleep: async () => {} });
  return { client, fetch, rows };
}
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => vi.unstubAllEnvs());

describe("Token Factory client", () => {
  it("sends strict schema and logprobs together and reads recorded tokens", async () => {
    const body = await fixture("qwen-schema-logprobs");
    const { client, fetch, rows } = setup([response(body)]);
    const schema = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: { label: { type: "string", enum: ["copy", "new_wording", "unrelated"] } }, required: ["label"], additionalProperties: false };
    const result = await client.chat({ ...args, jsonSchema: schema, logprobs: true, topLogprobs: 5 });
    const sent = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
    expect(sent).toMatchObject({ temperature: 0, max_tokens: 20, logprobs: true, top_logprobs: 5, response_format: { type: "json_schema", json_schema: { strict: true, schema } } });
    expect(result.data.content).toBe(body.choices[0].message.content);
    expect(result.data.logprobs?.content).toEqual(body.choices[0].logprobs.content);
    expect(result.usage).toMatchObject({ promptTokens: 45, completionTokens: 10, cachedTokens: 0, status: "200" });
    expect(result.usage.costUsd).toBeCloseTo(0.0000075, 12);
    expect(rows).toHaveLength(1);
  });
  it.each([429, 500, 503])("retries %s once and logs both attempts", async status => {
    const { client, fetch, rows } = setup([response({}, status), response(await fixture("qwen-chat"))]);
    await client.chat(args);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(rows.map(row => row.status)).toEqual([String(status), "200"]);
  });
  it("stops after the second retryable error and never copies response bodies", async () => {
    const { client, fetch, rows } = setup([response({ error: "test-secret-only" }, 503), response({}, 503)]);
    const error = await client.chat(args).catch(error => error);
    expect(error).toMatchObject({ code: "http_error", status: 503 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(error)).not.toContain("test-secret-only");
  });
  it("HTTP 400 is a typed error without retry", async () => {
    const { client, fetch } = setup([response({}, 400)]);
    await expect(client.chat(args)).rejects.toMatchObject({ code: "http_error", status: 400 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("log failure preserves a paid answer and the in-memory usage row", async () => {
    const body = await fixture("qwen-chat");
    const { fetch } = setup([response(body)]);
    const client = createTokenFactoryClient({ fetch, logUsage: async () => { throw new Error("disk unavailable"); } });
    const result = await client.chat(args);
    expect(result.data.content).toBe(body.choices[0].message.content);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toEqual(result.usage);
  });
  it("log failure preserves typed HTTP and network errors, and retries", async () => {
    for (const [responses, code] of [[[response({}, 400)], "http_error"], [[new Error("network")], "network_error"]] as const) {
      const { fetch } = setup([...responses]);
      const client = createTokenFactoryClient({ fetch, logUsage: () => { throw new Error("disk unavailable"); } });
      const error = await client.chat(args).catch(error => error);
      expect(error.code).toBe(code);
      expect(error.usage).toHaveLength(1);
    }
    const { fetch } = setup([response({}, 429), response(await fixture("qwen-chat"))]);
    const client = createTokenFactoryClient({ fetch, logUsage: () => { throw new Error("disk unavailable"); }, sleep: async () => {} });
    expect((await client.chat(args)).attempts).toHaveLength(2);
  });
  it("unknown price configuration makes no request", async () => {
    const { client, fetch } = setup([]);
    for (const model of ["unconfigured-model", "constructor", "__proto__"]) await expect(client.chat({ ...args, model })).rejects.toMatchObject({ code: "not_configured", usage: [] });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects non-empty truncated JSON even if usage is valid", async () => {
    const body = await fixture("qwen-chat");
    body.choices[0].finish_reason = "length";
    body.choices[0].message.content = '{"label":"par';
    const { client } = setup([response(body)]);
    await expect(client.chat(args)).rejects.toMatchObject({ code: "bad_response" });
  });
  it("missing key makes no request", async () => {
    const { client, fetch } = setup([]);
    vi.stubEnv("NEBIUS_API_KEY", "");
    await expect(client.chat(args)).rejects.toMatchObject({ code: "not_configured" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON, missing usage, empty content and truncated completion", async () => {
    const valid = await fixture("qwen-chat");
    for (const body of [new Response("{"), response({ choices: valid.choices }), response({ ...valid, choices: [{ message: { content: "" }, finish_reason: "stop" }] }), response(await fixture("glm-chat-128"))]) {
      const { client } = setup([body]);
      await expect(client.chat(args)).rejects.toMatchObject({ code: "bad_response" });
    }
  });
  it("network errors are sanitized and logged without fabricated answers", async () => {
    const { client, rows } = setup([new Error("test-secret-only")]);
    const error = await client.chat(args).catch(error => error);
    expect(error).toMatchObject({ code: "network_error" });
    expect(rows[0]?.status).toBe("network_error");
    expect(JSON.stringify(error) + JSON.stringify(rows)).not.toContain("test-secret-only");
  });
  it("redacts echoed keys from returned data", async () => {
    const body = await fixture("qwen-chat");
    body.choices[0].message.content = "test-secret-only";
    const { client } = setup([response(body)]);
    expect(JSON.stringify(await client.chat(args))).not.toContain("test-secret-only");
  });
  it("prices cached input separately and preserves absent logprobs", async () => {
    const body = await fixture("qwen-chat");
    body.usage = { prompt_tokens: 100, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 80 } };
    const { client } = setup([response(body)]);
    const result = await client.chat({ ...args, model: "deepseek-ai/DeepSeek-V4-Pro-0813" });
    expect(result.usage.costUsd).toBeCloseTo(20 * 0.00000132 + 80 * 0.00000004 + 2 * 0.00000396, 12);
    expect(result.data.logprobs).toBeNull();
  });
  it("sends embedding inputs and restores index order, rejecting missing vectors", async () => {
    const body = { data: [{ index: 1, embedding: [0.3, 0.4] }, { index: 0, embedding: [0.1, 0.2] }], usage: { prompt_tokens: 10 } };
    const { client, fetch } = setup([response(body)]);
    const result = await client.embed({ model: embeddingModel, input: ["neutral a", "neutral b"] });
    expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual({ model: embeddingModel, input: ["neutral a", "neutral b"] });
    expect(result.data.embeddings).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(result.usage.costUsd).toBeCloseTo(0.0000001, 12);
    const clamped = setup([response({ data: [{ index: 0, embedding: [0.1, 0.2] }], usage: { prompt_tokens: 1 } })]);
    await expect(clamped.client.embed({ model: embeddingModel, input: "a", dimensions: 3 })).rejects.toMatchObject({ code: "bad_response" });
    const broken = setup([response({ ...body, data: body.data.slice(0, 1) })]);
    await expect(broken.client.embed({ model: embeddingModel, input: ["a", "b"] })).rejects.toMatchObject({ code: "bad_response" });
  });
});
