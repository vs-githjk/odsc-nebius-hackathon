import { USD_PER_CREDIT } from "../clients/tavily.ts";
import type { Trace } from "../schema/index.ts";

// #165: what a trace cost and how long it took, from its own fields. budget.usd on a live trace sums Token Factory only
// (walk.ts), so the Tavily side is its credits at the list price (clients/tavily.ts), and the model side is the
// usage rows' recorded cost. Cache hits cost nothing and were not billed again.
export type TraceCost = { credits: number; tavilyUsd: number; modelUsd: number; totalUsd: number; seconds: number };

export function traceCost(trace: Pick<Trace, "budget" | "usage">): TraceCost {
  const credits = trace.budget.credits;
  const tavilyUsd = credits * USD_PER_CREDIT;
  const modelUsd = trace.usage.filter((r) => r.service === "tokenfactory" && !r.cacheHit).reduce((n, r) => n + r.costUsd, 0);
  return { credits, tavilyUsd, modelUsd, totalUsd: tavilyUsd + modelUsd, seconds: trace.budget.ms / 1000 };
}
