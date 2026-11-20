import { loadRules } from "../rules/index.ts";
import { USD_PER_CREDIT } from "../usage/pricing.ts";

const limit = (value: string | undefined, fallback: number, cap: number) =>
  Math.min(cap, value === undefined ? fallback : Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0);

export function liveBudget(env: Record<string, string | undefined>) {
  const { caps } = loadRules();
  const credits = limit(env.LIVE_TRACE_CREDITS, 40, caps.credits);
  const usd = limit(env.LIVE_TRACE_MODEL_USD, 0.05, caps.usd);
  return { credits, usd, reservation: usd + credits * USD_PER_CREDIT };
}
