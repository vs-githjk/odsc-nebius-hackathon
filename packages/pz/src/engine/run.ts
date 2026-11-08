import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Trace } from "../schema/index.ts";
import { decideStopState, loadRules } from "../rules/index.ts";
import { verifyTrace } from "../verify/checks.ts";

export const STAGES = ["intake", "fingerprint", "walk", "spans", "dating", "clusters", "readouts", "card"] as const;
export type Stage = typeof STAGES[number];
export type Context = Readonly<{ input: string; pages: readonly Readonly<{ url: string; quotedText: string }>[] }>;
type Step = (trace: Trace, context: Context) => Trace | Promise<Trace>;
// Adapters are the integration seam while T21 to T28 land. No default fabricates a live result.
export type Pipeline = { intake: (context: Context) => Trace | Promise<Trace> } & Record<Exclude<Stage, "intake">, Step>;
export type RunEvent = { sequence: number } & (
  | { type: "stage"; stage: Stage; status: "started" | "completed" | "failed" }
  | { type: "trace"; trace: Trace }
);
type Emit = (event: RunEvent) => void;

function checked(value: unknown): Trace {
  const trace = Trace.parse(value);
  if (trace.synthetic !== (trace.mode === "SAMPLE")) throw new Error("Synthetic/mode mismatch");
  const report = verifyTrace(trace);
  if (report.failures.length) throw new Error("Trace verification failed");
  return trace;
}

export async function runTrace(input: string, pipeline: Pipeline, opts: {
  pages?: readonly { url: string; text: string }[]; emit?: Emit;
} = {}): Promise<Trace> {
  for (const stage of STAGES) if (typeof pipeline?.[stage] !== "function") throw new Error(`Missing pipeline stage: ${stage}`);
  const context: Context = Object.freeze({ input, pages: Object.freeze((opts.pages ?? []).map(page =>
    Object.freeze({ url: page.url, quotedText: JSON.stringify(page.text) }))) });
  let trace: Trace | undefined;
  let sequence = 0;
  for (const stage of STAGES) {
    opts.emit?.({ sequence: sequence++, type: "stage", stage, status: "started" });
    try {
      trace = Trace.parse(await (stage === "intake" ? pipeline.intake(context) : pipeline[stage](trace!, context)));
    } catch (error) {
      opts.emit?.({ sequence: sequence++, type: "stage", stage, status: "failed" });
      throw error;
    }
    opts.emit?.({ sequence: sequence++, type: "stage", stage, status: "completed" });
  }
  // Existing code owns the ending. An adapter cannot choose an unsupported stop state.
  const final = checked({ ...trace!, decision: decideStopState(trace!, loadRules()) });
  opts.emit?.({ sequence: sequence++, type: "trace", trace: final });
  return final;
}

export function replayTrace(value: unknown, pagesDir?: string): Trace {
  const trace = checked(value);
  if (pagesDir && verifyTrace(trace, { pagesDir }).failures.length) throw new Error("Saved page verification failed");
  // The original recordedAt and original usage are retained. Synthetic data stays SAMPLE.
  return { ...trace, mode: trace.synthetic ? "SAMPLE" : "REPLAY" };
}

export function recordTrace(path: string, value: unknown): void {
  const trace = checked(value);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(trace, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
