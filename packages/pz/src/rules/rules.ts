import { readFileSync } from "node:fs";
import { z } from "zod";

export const Rules = z.object({
  caps: z.object({ credits: z.number(), usd: z.number(), ms: z.number(), depth: z.number(), frontier: z.number() }).strict(),
  earlierWindowSearches: z.number().int().min(0),
  maxQueriesPerHop: z.number().int().min(1),
  weakNumberMinSigDigits: z.number().int().min(1),
  weakNumberMaxCommas: z.number().int().min(0),
  confidenceThreshold: z.number().min(0).max(1).nullable(),
  primaryPageTypes: z.array(z.string()),
  metaKeywords: z.array(z.string()),
  negationPrefixes: z.array(z.string()),
  injectionPatterns: z.array(z.string()),
  factCheckDomains: z.array(z.string()),
  clusterSimilarityThreshold: z.number().min(0).max(1),
  hedgeWords: z.array(z.string()),
  comparisonWords: z.array(z.string()),
  notes: z.record(z.string(), z.string()).optional(),
}).strict();
export type Rules = z.infer<typeof Rules>;

const RULES_PATH = new URL("../../rules/rules.json", import.meta.url);

export function loadRules(path: string | URL = RULES_PATH): Rules {
  return Rules.parse(JSON.parse(readFileSync(path, "utf8")));
}
