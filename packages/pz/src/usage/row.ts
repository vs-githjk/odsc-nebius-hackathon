import { z } from "zod";

// Temporary: transcribed from plan.md Interfaces. Replace with the import from schema/ when T2 (#12) merges.
export const UsageRow = z.strictObject({
  at: z.string(),
  traceId: z.string().nullable(),
  step: z.string(),
  service: z.enum(["tavily", "tokenfactory", "wayback", "fetch", "jev"]),
  endpoint: z.string(),
  model: z.string().nullable(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  cachedTokens: z.number(),
  credits: z.number(),
  costUsd: z.number(),
  latencyMs: z.number(),
  status: z.string(),
  cacheHit: z.boolean(),
});
export type UsageRow = z.infer<typeof UsageRow>;
