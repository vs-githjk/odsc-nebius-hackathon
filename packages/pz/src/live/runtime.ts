import { mkdtempSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import prices from "../../config/prices.json" with { type: "json" };
import { createFileCache } from "../clients/cache.ts";
import { send, type ClientDeps } from "../clients/http.ts";
import { createPipeline } from "../engine/pipeline.ts";
import { runTrace } from "../engine/run.ts";
import { USD_PER_CREDIT } from "../usage/pricing.ts";
import { liveBudget } from "./budget.ts";
import { type Runner, liveService } from "./service.ts";
import { redisStore } from "./store.ts";

export function pipelineRunner(env: Record<string, string | undefined>, transport: typeof fetch, clock = () => new Date()): Runner {
  return async (claim, signal, emit, charge) => {
    const dir = mkdtempSync(join(tmpdir(), "pz-live-"));
    const caps = liveBudget(env);
    let capHit: "credits" | "usd" | null = null;
    let modelSpent = 0, creditsSpent = 0;
    const report = () => charge(modelSpent + creditsSpent * USD_PER_CREDIT);
    const exhausted = (kind: "credits" | "usd" = "credits") => {
      capHit ??= kind;
      return Object.assign(new Error("budget_exceeded"), { code: "budget_exceeded" });
    };
    const deadlineFetch: typeof fetch = (url, init) => {
      signal.throwIfAborted();
      return transport(url, { ...init, signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal });
    };
    const paidFetch: typeof fetch = async (url, init) => {
      signal.throwIfAborted();
      const body = JSON.parse(String(init?.body)) as { model: string; max_tokens?: number; messages?: unknown; input?: unknown };
      const price = (prices.models as Record<string, { input: number; output: number; cachedInput: number }>)[body.model];
      if (!price) throw exhausted("usd");
      // UTF-8 bytes upper-bound text tokens, with room for message framing. Output is bounded by max_tokens.
      const upper = (Buffer.byteLength(JSON.stringify(body.messages ?? body.input)) + 4096) * price.input + (body.max_tokens ?? 0) * price.output;
      if (modelSpent + upper > caps.usd) throw exhausted("usd");
      modelSpent += upper; report();
      const response = await deadlineFetch(url, { ...init, redirect: "error" });
      try {
        const data = await response.clone().json() as { usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } };
        const u = data.usage, input = u?.prompt_tokens, output = u?.completion_tokens ?? (body.max_tokens === undefined ? 0 : NaN), cached = u?.prompt_tokens_details?.cached_tokens ?? 0;
        if (typeof input === "number" && [input, output, cached].every(n => Number.isSafeInteger(n) && n >= 0) && cached <= input) {
          const actual = (input - cached) * price.input + cached * price.cachedInput + output * price.output;
          if (!signal.aborted) { modelSpent += actual - upper; report(); }
          if (actual > upper) throw exhausted("usd");
        }
      } catch (error) { if (error && typeof error === "object" && "code" in error) throw error; }
      return response;
    };
    const pending = new Map<string, number>(); let sequence = 0;
    const tavilyAttempts: NonNullable<ClientDeps["tavilyAttempts"]> = {
      reserve(max) {
        signal.throwIfAborted();
        if (!Number.isInteger(max) || max < 0 || creditsSpent + max > caps.credits) throw exhausted();
        creditsSpent += max; report(); const id = String(++sequence); pending.set(id, max); return id;
      },
      settle(id, actual) {
        const reserved = pending.get(id);
        if (signal.aborted || reserved === undefined) return;
        if (!Number.isFinite(actual) || actual < 0) throw exhausted();
        creditsSpent += actual - reserved; pending.delete(id); report();
        if (actual > reserved) throw exhausted();
      },
    };
    try {
      const adapter = createPipeline({
        tokenFactoryFetch: paidFetch, embeddingFetch: paidFetch,
        tavilySender: (deps, request) => send({ ...deps, tavilyAttempts, fetch: (url, init) => deadlineFetch(url, { ...init, redirect: "error" }) }, request),
        archiveFetch: deadlineFetch, pageFetch: deadlineFetch,
        nebiusKey: env.NEBIUS_API_KEY, tavilyKey: env.TAVILY_API_KEY,
        cache: createFileCache(join(dir, "http")), pagesDir: join(dir, "pages"), usagePath: join(dir, "usage.jsonl"),
        logUsage: row => appendFileSync(join(dir, "usage.jsonl"), JSON.stringify(row) + "\n"), record: false, clock,
        sleep: ms => new Promise((resolve, reject) => {
          signal.throwIfAborted();
          const timer = setTimeout(resolve, ms);
          signal.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("aborted")); }, { once: true });
        }),
      });
      // Fingerprinting precedes the walk's graceful cap handling.
      const fingerprint = adapter.pipeline.fingerprint;
      adapter.pipeline.fingerprint = async (trace, context) => {
        try { return await fingerprint(trace, context); }
        catch (error) {
          if (!capHit) throw error;
          return { ...trace, budget: { ...trace.budget, capHit } };
        }
      };
      const walk = adapter.pipeline.walk;
      adapter.pipeline.walk = (trace, context) => capHit
        ? { ...trace, budget: { ...trace.budget, capHit } }
        : walk(trace, context);
      const card = adapter.pipeline.card;
      adapter.pipeline.card = async (trace, context) => {
        const result = await card(trace, context);
        return capHit ? { ...result, budget: { ...result.budget, capHit } } : result;
      };
      return await runTrace(claim, adapter.pipeline, { wayback: adapter.wayback, emit });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
}
export function configuredService(env: NodeJS.ProcessEnv, transport: typeof fetch = globalThis.fetch) {
  const url = env.UPSTASH_REDIS_REST_URL, token = env.UPSTASH_REDIS_REST_TOKEN;
  return liveService({ env, store: url && token ? redisStore(url, token, transport) : null, run: pipelineRunner(env, transport) });
}
