import { appendFile, mkdir } from "node:fs/promises";
import { z } from "zod";
import { QUESTIONS, TypedAnswer } from "../schema/questions.ts";
import type { UsageRow } from "../schema/usage.ts";

// Official API/pricing checked 2026-11-08: docs.typesafe.ai/api/system-one and /models.
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const PRICE_PER_INPUT_TOKEN = 0.042 / 1_000_000;
export const JevInput = z.object({ earlier: z.string(), later: z.string(), page: z.string() }).strict();
export type JevInput = z.infer<typeof JevInput>;
const probability = z.number().min(0).max(1);
const Choice = z.object({ type: z.literal("choice"), choice: z.string(), confidence: probability,
  probabilities: z.record(z.string(), probability) });
const ResponseBody = z.object({ model: z.string(), answers: z.record(z.string(), Choice),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }) });
export class JevError extends Error {
  constructor(public code: "not_configured" | "bad_response" | "network_error" | "http_error",
    public status: number | null = null, public usage: UsageRow[] = []) {
    super(`Jev ${code}`);
  }
}
const persist = async (row: UsageRow) => {
  await mkdir("runs", { recursive: true });
  await appendFile("runs/usage.jsonl", JSON.stringify(row) + "\n", { mode: 0o600 });
};

export function createJevClient(options: { apiKey?: string; model?: string; fetch?: typeof globalThis.fetch;
  logUsage?: (row: UsageRow) => void | Promise<void>; now?: () => number } = {}) {
  const fetch = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => performance.now());
  return {
    async askFour(value: JevInput) {
      const input = JevInput.safeParse(value);
      if (!input.success) throw new JevError("bad_response");
      const key = (options.apiKey ?? process.env.TYPESAFE_API_KEY ?? "").trim();
      const model = options.model ?? "jev-1.14.0";
      if (!key || !["jev-1.14.0", "jev-1.13.0"].includes(model)) throw new JevError("not_configured");
      const safe = (text: string) => text.replaceAll(key, "[REDACTED]");
      const usage: UsageRow[] = [], answers: TypedAnswer[] = [];
      const vendorConfidence: Record<string, number> = {};
      async function call(questions: typeof QUESTIONS, sourceText: string) {
        // Choice preserves every owner option/label, including on the yes/no questions.
        const body = { model, state: { source_text: sourceText }, questions: Object.fromEntries(questions.map(q =>
          [q.id, { type: "choice", instructions: q.instructions, criteria: Object.fromEntries(q.options.map(o => [o.id, o.label])) }])) };
        const start = now();
        let response: Response;
        try {
          response = await fetch(ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
        } catch {
          await record("network_error", 0, 0, model);
          throw new JevError("network_error", null, usage);
        }
        let raw: unknown;
        try { raw = await response.json(); } catch { raw = null; }
        const parsed = ResponseBody.safeParse(raw);
        await record(String(response.status), parsed.success ? parsed.data.usage.input_tokens : 0,
          parsed.success ? parsed.data.usage.output_tokens : 0, parsed.success ? parsed.data.model : model);
        if (!response.ok) throw new JevError("http_error", response.status, usage);
        if (!parsed.success || Object.keys(parsed.data.answers).length !== questions.length) throw new JevError("bad_response", response.status, usage);
        for (const q of questions) {
          const answer = parsed.data.answers[q.id];
          if (!answer || !q.options.some(o => o.id === answer.choice) ||
            Object.keys(answer.probabilities).length !== q.options.length || q.options.some(o => !Object.hasOwn(answer.probabilities, o.id)))
            throw new JevError("bad_response", response.status, usage);
          vendorConfidence[q.id] = answer.confidence;
          answers.push(TypedAnswer.parse({ questionId: q.id, optionId: answer.choice, probability: answer.probabilities[answer.choice],
            top: q.options.map(o => ({ optionId: o.id, p: answer.probabilities[o.id] })), model: safe(parsed.data.model), threshold: null }));
        }
        async function record(status: string, inputTokens: number, outputTokens: number, responseModel: string) {
          const row: UsageRow = { at: new Date().toISOString(), traceId: null, step: "jev_comparison", service: "jev", endpoint: "systemone",
            model: safe(responseModel), promptTokens: inputTokens, completionTokens: outputTokens, cachedTokens: 0, credits: 0,
            costUsd: inputTokens * PRICE_PER_INPUT_TOKEN, latencyMs: Math.max(0, now() - start), status, cacheHit: false };
          usage.push(row);
          try { await (options.logUsage ?? persist)(row); } catch { /* Return rows even if persistence fails. */ }
        }
      }
      await call(QUESTIONS.filter(q => q.id !== "page_type"), JSON.stringify({ EARLIER: input.data.earlier, LATER: input.data.later }));
      await call(QUESTIONS.filter(q => q.id === "page_type"), input.data.page);
      return { answers: QUESTIONS.map(q => answers.find(a => a.questionId === q.id)!), vendorConfidence, usage };
    },
  };
}
