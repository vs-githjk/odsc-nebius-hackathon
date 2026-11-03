import { appendFile, mkdir } from "node:fs/promises";
import { z } from "zod";
import prices from "../../config/prices.json" with { type: "json" };
import type { UsageRow } from "../schema/usage.ts";

export type ErrorCode = "not_configured" | "http_error" | "network_error" | "bad_response";
export class TokenFactoryError extends Error {
  constructor(public readonly code: ErrorCode, public readonly status: number | null = null, public readonly usage: UsageRow[] = []) {
    super(`Token Factory ${code}${status === null ? "" : ` (${status})`}`);
    this.name = "TokenFactoryError";
  }
}
const count = z.number().int().nonnegative();
const Usage = z.object({ prompt_tokens: count, completion_tokens: count.optional(), prompt_tokens_details: z.object({ cached_tokens: count.optional() }).nullable().optional() });
const Alternative = z.object({ token: z.string(), logprob: z.number(), bytes: z.array(z.number().int()).nullable().optional() });
const Logprobs = z.object({ content: z.array(Alternative.extend({ top_logprobs: z.array(Alternative) })) });
const Chat = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }), finish_reason: z.literal("stop"), logprobs: Logprobs.nullable().optional() })).min(1) });
const Embedding = z.object({ data: z.array(z.object({ index: count, embedding: z.array(z.number()).min(1) })).min(1) });
export type ChatData = { content: string; logprobs: z.infer<typeof Logprobs> | null; model: string };
export type ChatInput = { model: string; messages: { role: "system" | "user" | "assistant"; content: string }[]; jsonSchema?: object; logprobs?: boolean; topLogprobs?: number; maxTokens: number };
type Context = { traceId?: string; step?: string };
type Options = Context & { fetch?: typeof globalThis.fetch; logUsage?: (row: UsageRow) => void | Promise<void>; sleep?: (ms: number) => Promise<void>; timeoutMs?: number };
export type Result<T> = { data: T; usage: UsageRow; attempts: UsageRow[] };
const defaultLog = async (row: UsageRow) => {
  await mkdir("runs", { recursive: true });
  await appendFile("runs/usage.jsonl", JSON.stringify(row) + "\n", { mode: 0o600 });
};

// One row per HTTP attempt, including retries. Zero tokens on errors mean
// unreported usage, not a promise that the provider billed nothing.
export function createTokenFactoryClient(options: Options = {}) {
  const fetch = options.fetch ?? globalThis.fetch;
  const log = options.logUsage ?? defaultLog;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  async function request(endpoint: string, body: { model: string; [key: string]: unknown }, context: Context = {}) {
    const key = process.env.NEBIUS_API_KEY?.trim();
    if (!key) throw new TokenFactoryError("not_configured");
    const price = Object.hasOwn(prices.models, body.model) ? (prices.models as Record<string, { input: number; output: number; cachedInput: number }>)[body.model] : undefined;
    if (!price) throw new TokenFactoryError("not_configured");
    const rows: UsageRow[] = [];
    const redact = (value: unknown): unknown => {
      if (typeof value === "string") return value.split(key).join("[REDACTED]");
      if (Array.isArray(value)) return value.map(redact);
      if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [String(redact(k)), redact(v)]));
      return value;
    };
    async function record(row: UsageRow) {
      rows.push(row);
      try { await log(row); } catch { /* The returned attempt rows remain authoritative when persistence fails. */ }
    }
    const safeModel = String(redact(body.model));
    for (let attempt = 0; attempt < 2; attempt++) {
      const at = new Date().toISOString(), start = performance.now();
      let response: Response;
      try {
        response = await fetch("https://api.tokenfactory.nebius.com/v1" + endpoint, {
          method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify(body), signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
        });
      } catch {
        const row = rowFor("network_error");
        await record(row);
        throw new TokenFactoryError("network_error", null, rows);
      }
      let raw: unknown;
      try { raw = await response.json(); } catch { raw = null; }
      const parsedUsage = Usage.safeParse(raw && typeof raw === "object" ? (raw as Record<string, unknown>).usage : null);
      const u = parsedUsage.success ? parsedUsage.data : null;
      const row = rowFor(String(response.status), u);
      await record(row);
      if (!response.ok) {
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) { await sleep(250); continue; }
        throw new TokenFactoryError("http_error", response.status, rows);
      }
      if (!u || (u.prompt_tokens_details?.cached_tokens ?? 0) > u.prompt_tokens || (endpoint === "/chat/completions" && u.completion_tokens === undefined)) throw new TokenFactoryError("bad_response", response.status, rows);
      return { raw: redact(raw), usage: row, attempts: rows };

      function rowFor(status: string, usage: z.infer<typeof Usage> | null = null): UsageRow {
        const promptTokens = usage?.prompt_tokens ?? 0, completionTokens = usage?.completion_tokens ?? 0;
        const cachedTokens = Math.min(usage?.prompt_tokens_details?.cached_tokens ?? 0, promptTokens);
        return { at, traceId: context.traceId ? String(redact(context.traceId)) : options.traceId ? String(redact(options.traceId)) : null,
          step: String(redact(context.step ?? options.step ?? "tokenfactory")), service: "tokenfactory", endpoint,
          model: safeModel, promptTokens, completionTokens, cachedTokens, credits: 0,
          costUsd: (promptTokens - cachedTokens) * price!.input + cachedTokens * price!.cachedInput + completionTokens * price!.output,
          latencyMs: Math.round(performance.now() - start), status, cacheHit: false };
      }
    }
    throw new TokenFactoryError("bad_response", null, rows);
  }
  return {
    async chat(input: ChatInput, context?: Context): Promise<Result<ChatData>> {
      const result = await request("/chat/completions", {
        model: input.model, messages: input.messages, temperature: 0, max_tokens: input.maxTokens,
        ...(input.jsonSchema ? { response_format: { type: "json_schema", json_schema: { name: "typed_answer", strict: true, schema: input.jsonSchema } } } : {}),
        ...(input.logprobs === undefined ? {} : { logprobs: input.logprobs }),
        ...(input.topLogprobs === undefined ? {} : { top_logprobs: input.topLogprobs }),
      }, context);
      const parsed = Chat.safeParse(result.raw);
      const choice = parsed.success ? parsed.data.choices[0] : undefined;
      if (!choice || !choice.message.content.trim()) throw new TokenFactoryError("bad_response", 200, result.attempts);
      return { data: { content: choice.message.content, logprobs: choice.logprobs ?? null, model: input.model }, usage: result.usage, attempts: result.attempts };
    },
    async embed(input: { model: string; input: string | string[]; dimensions?: number }, context?: Context): Promise<Result<{ embeddings: number[][] }>> {
      const result = await request("/embeddings", { ...input }, context);
      const parsed = Embedding.safeParse(result.raw);
      const count = Array.isArray(input.input) ? input.input.length : 1;
      const data = parsed.success ? parsed.data.data.toSorted((a, b) => a.index - b.index) : [];
      if (!parsed.success || data.length !== count || data.some((v, i) => v.index !== i || v.embedding.length !== data[0]?.embedding.length || (input.dimensions !== undefined && v.embedding.length !== input.dimensions))) throw new TokenFactoryError("bad_response", 200, result.attempts);
      return { data: { embeddings: data.map(v => v.embedding) }, usage: result.usage, attempts: result.attempts };
    },
  };
}
export const tokenfactory = createTokenFactoryClient();
