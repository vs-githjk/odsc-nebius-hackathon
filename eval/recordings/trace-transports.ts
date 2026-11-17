import { z } from "zod";
import prices from "../../packages/pz/config/prices.json" with { type: "json" };
import { send, type ClientDeps, type ClientRequest } from "../../packages/pz/src/clients/http.ts";
import { budgetedFetch, type openBudget } from "./budget.ts";

const MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";

const Count = z.number().int().nonnegative();
const ProviderUsage = z.object({ prompt_tokens: Count, completion_tokens: Count,
  prompt_tokens_details: z.object({ cached_tokens: Count.optional() }).nullish() });
async function tokenFactoryCost(response: Response): Promise<number | null> {
  const body: unknown = await response.json();
  const u = ProviderUsage.safeParse(body && typeof body === "object" && "usage" in body ? body.usage : null);
  if (!u.success) return null;
  const { prompt_tokens: input, completion_tokens: output } = u.data;
  const cached = u.data.prompt_tokens_details?.cached_tokens ?? 0;
  if (cached > input) return null;
  const price = prices.models[MODEL];
  return (input - cached) * price.input + cached * price.cachedInput + output * price.output;
}

function qwenChatFetch(
  budget: ReturnType<typeof openBudget>,
  fetch: typeof globalThis.fetch,
  ceilingUsd = 0.01,
): typeof globalThis.fetch {
  const guarded = budgetedFetch({ budget, ceilingUsd, cost: tokenFactoryCost, fetch });
  return (input, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(input) !== "https://api.tokenfactory.nebius.com/v1/chat/completions" || body.model !== MODEL) {
      throw new Error("Unsupported Qwen chat request");
    }
    return guarded(input, init);
  };
}

type Budget = ReturnType<typeof openBudget>;

function claimBudget(ledger: Budget, capUsd: number): Budget {
  const cap = Math.floor(capUsd * 1e6);
  const reservations = new Map<string, number>();
  let used = 0;
  function amount(usd: number): number {
    const units = Math.ceil(usd * 1e6);
    if (!Number.isSafeInteger(units) || units < 0) throw new Error("invalid_budget");
    return units;
  }
  function check(usd: number) {
    if (used + amount(usd) > cap) {
      throw Object.assign(new Error("Claim budget exceeded"), { code: "budget_exceeded" });
    }
    ledger.check(usd);
  }
  return {
    check,
    reserve(usd) {
      check(usd);
      const id = ledger.reserve(usd);
      const units = amount(usd);
      reservations.set(id, units);
      used += units;
      return id;
    },
    settle(id, usd) {
      const reserved = reservations.get(id);
      if (reserved === undefined) throw new Error("invalid_reservation");
      const units = amount(usd);
      ledger.settle(id, usd);
      reservations.delete(id);
      used += units - reserved;
    },
  };
}

export function traceTransports(ledger: Budget, capUsd: number, fetch: typeof globalThis.fetch, checkTime: () => void) {
  const budget = claimBudget(ledger, capUsd);
  const guardedChat = qwenChatFetch(budget, fetch);
  const tokenFactoryFetch: typeof globalThis.fetch = (url, init) => {
    checkTime();
    return guardedChat(url, init);
  };

  const model = "Qwen/Qwen3-Embedding-8B";
  const guardedEmbeddingFetch = budgetedFetch({
    budget, ceilingUsd: 0.002, fetch,
    cost: async response => {
      const body: unknown = await response.json();
      const result = z.object({ usage: z.object({ prompt_tokens: z.number().int().nonnegative() }) }).safeParse(body);
      return result.success ? result.data.usage.prompt_tokens * prices.models[model].input : null;
    },
  });
  const embeddingFetch: typeof globalThis.fetch = (url, init) => {
    if (String(url) !== "https://api.tokenfactory.nebius.com/v1/embeddings" ||
        JSON.parse(String(init?.body)).model !== model) throw new Error("Unsupported embedding request");
    checkTime();
    return guardedEmbeddingFetch(url, init);
  };

  const tavilyAttempts: NonNullable<ClientDeps["tavilyAttempts"]> = {
    reserve(maxCredits) {
      checkTime();
      if (!Number.isInteger(maxCredits) || maxCredits < 1 || maxCredits > 2) {
        throw Object.assign(new Error("Tavily attempt exceeds the approved ceiling"), { code: "budget_exceeded" });
      }
      return budget.reserve(0.02);
    },
    settle(id, credits) {
      if (Number.isInteger(credits) && credits >= 0) budget.settle(id, credits * 0.008);
    },
  };
  const tavilySender = <T>(deps: ClientDeps, request: ClientRequest<T>) => {
    if (request.service !== "tavily" || new URL(request.url).origin !== "https://api.tavily.com") {
      throw new Error("Unsupported Tavily request");
    }
    return send({ ...deps, tavilyAttempts, fetch: (url, init) => fetch(url, { ...init, redirect: "error" }) }, request);
  };

  return { tokenFactoryFetch, embeddingFetch, tavilySender };
}
