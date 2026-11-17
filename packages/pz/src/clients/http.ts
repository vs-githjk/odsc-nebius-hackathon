import type { UsageLog } from "../usage/log.ts";
import type { UsageRow } from "pz/schema";
import type { Budget } from "./budget.ts";
import { cacheKey, type Cache } from "./cache.ts";
import { ClientError } from "./errors.ts";

export { ClientError } from "./errors.ts";

// Polite and honest about who is asking. No email, no key.
export const USER_AGENT = "patient-zero-trace/1.0 (research tool for tracing a claim to its first source; github.com/vs-githjk/odsc-nebius-hackathon)";

export type ClientDeps = {
  fetch?: typeof fetch;
  usage: UsageLog;
  cache: Cache;
  budget?: Budget;
  traceId?: string | null;
  // Waits between a request and its retry; tests inject a no-op.
  sleep?: (ms: number) => Promise<void>;
  tavilyAttempts?: {
    reserve(maxCredits: number): string;
    settle(id: string, credits: number): void;
  };
};

export type Result<T> = { data: T; usage: UsageRow };

export type ClientRequest<T> = {
  service: UsageRow["service"];
  endpoint: string;
  step: string;
  url: string;
  init?: RequestInit;
  // Everything that identifies the request, without its auth header.
  cacheInput: unknown;
  maxCredits: number;
  timeoutMs: number;
  retryTimeouts?: boolean;
  // Statuses beyond 429 and 5xx that are worth one more try (a rate-limited archive answers 403), and how long to wait first.
  retryStatuses?: number[];
  retryDelayMs?: number;
  usdPerCredit?: number;
  parse(body: string): { data: T; credits: number };
  secrets?: string[];
};

const PAGE_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 2;

const isRetryable = (status: number) => status === 429 || status >= 500;
const scrub = (text: string, secrets: string[] = []) => secrets.reduce((out, s) => out.replaceAll(s, "[redacted]"), text);

// A spend guard supplied by the caller (the shared ledger, a deadline) may throw its own errors. Anything that means
// "the budget is spent" or "time is up" becomes a ClientError here, so the walk ends with a cap or a named failure and a
// card, instead of the whole trace failing and the spend so far being lost.
function reserveAttempt(deps: ClientDeps, maxCredits: number): string | undefined {
  try {
    return deps.tavilyAttempts?.reserve(maxCredits);
  } catch (err) {
    if (err instanceof ClientError) throw err;
    const code = err && typeof err === "object" && "code" in err ? err.code : undefined;
    if (code === "budget_exceeded") throw new ClientError("budget_exceeded", "tavily search: budget spent");
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new ClientError("network_error", "tavily search: time limit reached", { timedOut: true });
    }
    throw err;
  }
}

export async function send<T>(deps: ClientDeps, req: ClientRequest<T>): Promise<Result<T>> {
  const fetchImpl = deps.fetch ?? fetch;
  const row = (fields: Pick<UsageRow, "credits" | "latencyMs" | "status" | "cacheHit">): UsageRow => {
    const logged: UsageRow = {
      at: new Date().toISOString(),
      traceId: deps.traceId ?? null,
      step: req.step,
      service: req.service,
      endpoint: req.endpoint,
      model: null,
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      costUsd: fields.credits * (req.usdPerCredit ?? 0),
      ...fields,
    };
    deps.usage.append(logged);
    return logged;
  };

  const key = cacheKey(req.cacheInput);
  const cached = deps.cache.get(key);
  if (cached) {
    const { data } = req.parse(cached.body);
    return { data, usage: row({ credits: 0, latencyMs: 0, status: "200", cacheHit: true }) };
  }

  for (let attempt = 1; ; attempt += 1) {
    deps.budget?.beforeCall(req.maxCredits);
    const reservation = req.service === "tavily" ? reserveAttempt(deps, req.maxCredits) : undefined;
    const last = attempt === MAX_ATTEMPTS;
    const started = performance.now();
    const latency = () => Math.round(performance.now() - started);
    let response: Response;
    let body: string;
    try {
      response = await fetchImpl(req.url, { ...req.init, signal: AbortSignal.timeout(req.timeoutMs) });
      body = await response.text();
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      row({ credits: 0, latencyMs: latency(), status: timedOut ? "timeout" : "network_error", cacheHit: false });
      if (timedOut && req.retryTimeouts && !last) continue;
      throw new ClientError("network_error", `${req.service} ${req.endpoint}: ${timedOut ? "timed out" : "network error"}`, {
        timedOut,
      });
    }
    if (!response.ok) {
      row({ credits: 0, latencyMs: latency(), status: String(response.status), cacheHit: false });
      if ((isRetryable(response.status) || req.retryStatuses?.includes(response.status)) && !last) {
        if (req.retryDelayMs) await (deps.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(req.retryDelayMs);
        continue;
      }
      throw new ClientError("http_error", `${req.service} ${req.endpoint}: HTTP ${response.status}`, {
        status: response.status,
      });
    }
    let parsed: { data: T; credits: number };
    try {
      parsed = req.parse(body);
    } catch {
      row({ credits: 0, latencyMs: latency(), status: "bad_response", cacheHit: false });
      throw new ClientError("bad_response", `${req.service} ${req.endpoint}: unexpected response body`);
    }
    if (reservation !== undefined) deps.tavilyAttempts!.settle(reservation, parsed.credits);
    deps.budget?.spend(parsed.credits);
    deps.cache.set(key, { credits: parsed.credits, body: scrub(body, req.secrets), contentType: response.headers.get("content-type") });
    return {
      data: parsed.data,
      usage: row({ credits: parsed.credits, latencyMs: latency(), status: String(response.status), cacheHit: false }),
    };
  }
}

export type Page = { url: string; text: string; contentType: string | null };

export function createPageFetcher(deps: ClientDeps) {
  return async (url: string, { step = "fetch" }: { step?: string } = {}): Promise<Result<Page>> => {
    // The content type is part of the stored body so a cache hit returns the same Page.
    const result = await send<Page>(
      { ...deps, fetch: wrapPageBody(deps.fetch ?? fetch) },
      {
        service: "fetch",
        endpoint: "page",
        step,
        url,
        cacheInput: { service: "fetch", url },
        maxCredits: 0,
        timeoutMs: PAGE_TIMEOUT_MS,
        parse: (body) => {
          const stored = JSON.parse(body) as { text: string; contentType: string | null };
          return { data: { url, ...stored }, credits: 0 };
        },
      },
    );
    return result;
  };
}

function wrapPageBody(fetchImpl: typeof fetch): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const res = await fetchImpl(input, init);
    if (!res.ok) return res;
    const body = JSON.stringify({ text: await res.text(), contentType: res.headers.get("content-type") });
    return new Response(body, { status: res.status, headers: res.headers });
  }) as typeof fetch;
}
