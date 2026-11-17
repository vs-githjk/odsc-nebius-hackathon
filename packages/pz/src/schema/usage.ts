import { z } from "zod";

export const UsageRow = z.object({
  at: z.string(), traceId: z.string().nullable(), step: z.string(),
  service: z.enum(["tavily", "tokenfactory", "wayback", "fetch", "jev", "ncbi", "crossref"]),
  endpoint: z.string(), model: z.string().nullable(), promptTokens: z.number(),
  completionTokens: z.number(), cachedTokens: z.number(), credits: z.number(),
  costUsd: z.number(), latencyMs: z.number(), status: z.string(), cacheHit: z.boolean(),
}).strict();
export type UsageRow = z.infer<typeof UsageRow>;
