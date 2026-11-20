import { randomUUID } from "node:crypto";
import { liveBudget } from "./budget.ts";
import { Trace } from "../schema/index.ts";
import type { RunEvent } from "../engine/run.ts";
import { hash, liveEnabled, micros, type LiveStore } from "./store.ts";

export type LiveEvent = Extract<RunEvent, { type: "stage" | "progress" }> | { type: "trace"; trace: Trace } | { type: "error"; code: string; message: string };
export type Runner = (claim: string, signal: AbortSignal, emit: (event: RunEvent) => void, charge: (usd: number) => void) => Promise<Trace>;
export type LiveDeps = { env: Record<string, string | undefined>; store: LiveStore | null; run: Runner; now?: () => number; deadlineMs?: number };
export const RESERVATION = liveBudget({}).reservation;
export const PAUSED = "Live tracing is paused. Here are recorded traces.";
const number = (value: string | undefined, fallback: number) => value === undefined ? fallback : Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
const errorEvent = (code: string): LiveEvent => ({ type: "error", code, message: code === "time_limit" ? "The trace reached its time limit." : code === "rate_limit" ? "Too many traces. Try again later." : code === "invalid_claim" ? "Enter a claim of 1 to 400 characters." : code === "trace_failed" ? "The trace could not finish." : PAUSED });
const headers = { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const fail = (code: string, status: number) => new Response(JSON.stringify(errorEvent(code)) + "\n", { status, headers });
export function liveService(deps: LiveDeps) {
  const now = deps.now ?? Date.now;
  const capUsd = number(deps.env.LIVE_USD_CAP, 2);
  const { reservation } = liveBudget(deps.env);
  async function status() {
    let reason: "disabled" | "cap" | "not_configured" | null = null;
    let spentUsd = 0;
    if (!liveEnabled(deps.env.LIVE_ENABLED)) reason = "disabled";
    else if (!deps.store || !deps.env.NEBIUS_API_KEY?.trim() || !deps.env.TAVILY_API_KEY?.trim()) reason = "not_configured";
    else try {
      spentUsd = Number(await deps.store.get("pz:spent_micros") ?? 0) / 1e6;
      if (!Number.isFinite(spentUsd) || spentUsd < 0) throw new Error("invalid_store");
      if (!liveEnabled(await deps.store.get("pz:live_enabled"))) reason = "disabled";
      else if (micros(spentUsd) + micros(reservation) > micros(capUsd)) reason = "cap";
    } catch { reason = "not_configured"; spentUsd = 0; }
    return { live: reason === null, reason, capUsd, spentUsd };
  }
  async function trace(request: Request): Promise<Response> {
    const started = now();
    if (request.method !== "POST") return fail("method_not_allowed", 405);
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") return fail("invalid_claim", 400);
    let claim: unknown;
    try {
      // Bound streamed request bodies too, including requests without Content-Length.
      const reader = request.body?.getReader(); let text = ""; let bytes = 0; const decoder = new TextDecoder();
      if (!reader) return fail("invalid_claim", 400);
      while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length;
        if (bytes > 8192) { await reader.cancel(); return fail("invalid_claim", 400); } text += decoder.decode(chunk.value, { stream: true }); }
      claim = (JSON.parse(text + decoder.decode()) as { claim?: unknown } | null)?.claim;
    } catch { return fail("invalid_claim", 400); }
    if (typeof claim !== "string" || !claim.trim() || claim.length > 400) return fail("invalid_claim", 400);
    const input = claim.trim();
    try {
      const available = await status();
      if (available.reason && available.reason !== "cap") return fail(available.reason, 503);
      const store = deps.store!;
      const key = `pz:trace:${hash(input.toLowerCase().replace(/\s+/g, " "))}`;
      const cached = await store.get(key);
      if (cached) return new Response(safe({ type: "trace", trace: Trace.parse(JSON.parse(cached)) }) + "\n", { headers });
      if (!available.live) return fail("cap", 503);
      const id = randomUUID(), time = now();
      const ip = request.headers.get("x-real-ip")?.trim() || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const admitted = await store.admit({ id, ip: hash(ip), hour: Math.floor(time / 3600000), day: Math.floor(time / 86400000),
        perIp: Math.floor(number(deps.env.LIVE_PER_IP_PER_HOUR, 2)), perDay: Math.floor(number(deps.env.LIVE_PER_DAY, 30)), cap: micros(capUsd), amount: micros(reservation) });
      if (admitted !== "ok") return fail(admitted, admitted === "rate_limit" ? 429 : 503);
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, request.signal]);
      let cancelled = false, spent = 0, timedOut = false;
      const stream = new ReadableStream<Uint8Array>({
        start(output) {
          const emit = (event: LiveEvent) => { if (!cancelled) output.enqueue(new TextEncoder().encode(safe(event) + "\n")); };
          const timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.max(0, (deps.deadlineMs ?? 285000) - (now() - started)));
          void (async () => {
            let result: Trace | undefined;
            try {
              const stopped = new Promise<never>((_, reject) => {
                if (signal.aborted) reject(new Error("aborted"));
                else signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
              });
              result = await Promise.race([deps.run(input, signal, event => {
                if (signal.aborted) return;
                if (event.type === "stage") emit(event);
                if (event.type === "progress") emit({ type: "progress", sequence: event.sequence,
                  pages: event.pages, hosts: event.hosts.slice(-3).filter(host => /^[a-z0-9.-]+$/i.test(host)) });
              }, usd => { spent = usd; }), stopped]);
              signal.throwIfAborted();
              // The runner tracks all attempts, including uncertain charges omitted from trace usage.
              const serialized = safe({ type: "trace", trace: result });
              if (Buffer.byteLength(serialized) < 900000) {
                try { await store.set(key, JSON.stringify(JSON.parse(serialized).trace), 7 * 86400); } catch { /* Cache is optional. */ }
              }
            } catch { result = undefined; }
            finally {
              clearTimeout(timer); controller.abort();
              try { await store.settle(id, micros(spent)); } catch { /* Retain the reservation on store failure. */ }
              if (!cancelled) {
                emit(timedOut ? errorEvent("time_limit") : result ? { type: "trace", trace: result } : errorEvent("trace_failed"));
                output.close();
              }
            }
          })();
        },
        cancel() { cancelled = true; controller.abort(); },
      });
      return new Response(stream, { headers });
    } catch { return fail("trace_failed", 503); }
  }
  function safe(event: LiveEvent) {
    let serialized = JSON.stringify(event);
    for (const secret of [deps.env.NEBIUS_API_KEY, deps.env.TAVILY_API_KEY, deps.env.UPSTASH_REDIS_REST_TOKEN]) {
      if (secret) serialized = serialized.split(JSON.stringify(secret).slice(1, -1)).join("[redacted]");
    }
    return serialized;
  }
  return { status, trace };
}
