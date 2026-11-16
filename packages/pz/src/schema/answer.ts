import { z } from "zod";
import { Trace } from "./trace.ts";
import { UsageRow } from "./usage.ts";

// T51: one pasted answer, every statistic intake accepted, and one trace (or a named reason for none) per statistic.
// The summary is built by code from the stop states (engine/answer.ts) and re-checked on replay.
export const AnswerClaim = z.object({
  text: z.string(), start: z.number(), end: z.number(), number: z.object({ raw: z.string(), canonical: z.string() }).strict(),
  trace: Trace.nullable(),
  // Why there is no trace: a typed error code from the run, or the per-answer claim cap.
  notTraced: z.enum(["over_claim_cap", "not_configured", "http_error", "network_error", "bad_response", "budget_exceeded", "trace_failed"]).nullable(),
}).strict().refine((c) => (c.trace === null) !== (c.notTraced === null), { message: "a claim has a trace or a reason for none, not both" });
export type AnswerClaim = z.infer<typeof AnswerClaim>;

export const AnswerRecord = z.object({
  schemaVersion: z.literal("1"), recordedAt: z.string(), answer: z.string(),
  claims: z.array(AnswerClaim),
  rejected: z.array(z.object({ sentence: z.string(), number: z.string(), reason: z.string() }).strict()),
  intakeUsage: z.array(UsageRow),
  summary: z.string(),
}).strict();
export type AnswerRecord = z.infer<typeof AnswerRecord>;
