import { mkdirSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { ClientError } from "../clients/errors.ts";
import { dateEvidence, dateNode, type DateEvidence } from "./dating.ts";
import type { createWayback } from "../clients/wayback.ts";
import { dirname } from "node:path";
import { Trace } from "../schema/index.ts";
import { decideStopState, loadRules } from "../rules/index.ts";
import { verifyTrace } from "../verify/checks.ts";

export const STAGES = ["intake", "fingerprint", "walk", "spans", "dating", "clusters", "readouts", "card"] as const;
export type Stage = typeof STAGES[number];
export type PageInput = { url: string; text: string; metadata?: string | null; byline?: string | null; metadataSource?: DateEvidence["metadataSource"]; metadataPrecision?: DateEvidence["metadataPrecision"] };
export type Context = Readonly<{ input: string; pages: readonly Readonly<{
  url: string; quotedText: string; metadata?: string | null; byline?: string | null; metadataSource?: DateEvidence["metadataSource"]; metadataPrecision?: DateEvidence["metadataPrecision"];
}>[] }>;
export type Wayback = Pick<ReturnType<typeof createWayback>, "firstCapture"> & Partial<Pick<ReturnType<typeof createWayback>, "captureBody" | "captureVersions">>;
type Step = (trace: Trace, context: Context) => Trace | Promise<Trace>;
// Adapters are the integration seam while T21 to T28 land. No default fabricates a live result.
type PageStepResult = Trace | { trace: Trace; pages: readonly PageInput[] };
type PageStep = (trace: Trace, context: Context) => PageStepResult | Promise<PageStepResult>;
export type Pipeline = {
  intake: (context: Context) => Trace | Promise<Trace>;
  walk: PageStep;
  spans: PageStep;
} & Record<Exclude<Stage, "intake" | "dating" | "walk" | "spans">, Step>;
export type RunEvent = { sequence: number } & (
  | { type: "stage"; stage: Stage; status: "started" | "completed" | "failed" }
  | { type: "trace"; trace: Trace }
);
type Emit = (event: RunEvent) => void;

// The production dating adapter replaces every date, including Tavily hints.
// Missing publication evidence remains unconfirmed unless Wayback caps it.
export function datingStep(wayback: Wayback): Step {
  return async (trace, context) => {
    const nodes = [], usage = [...trace.usage], searchLog = [...trace.searchLog];
    for (const node of trace.nodes) {
      const page = context.pages.find(page => page.url === node.url);
      const evidence: DateEvidence = { metadata: page?.metadata, byline: page?.byline, metadataSource: page?.metadataSource, metadataPrecision: page?.metadataPrecision };
      try {
        const spanTexts = trace.spans.filter((s) => node.spanIds.includes(s.id)).map((s) => s.text);
        const dated = await dateNode(node, evidence, wayback, spanTexts);
        nodes.push(dated.node); usage.push(dated.usage, ...dated.extraUsage);
        if (dated.note) searchLog.push({ at: new Date().toISOString(), step: "dating", query: dated.note, endDate: null, startDate: null, results: 0, kept: 0, dropped: 0 });
      } catch (error) {
        // One page's archive lookup failing (rate limit, outage, timeout) never ends the trace. With no capture there is
        // nothing to cap the page's own publication evidence with, which is #79's "pending" case: the evidence is kept
        // with no first capture, and a page with none stays unconfirmed.
        if (!(error instanceof ClientError)) throw error;
        const at = new Date().toISOString();
        nodes.push({ ...node, date: dateEvidence(evidence, { status: "pending" }) });
        usage.push({
          at, traceId: trace.id, step: "dating", service: "wayback", endpoint: "cdx", model: null, promptTokens: 0, completionTokens: 0,
          cachedTokens: 0, credits: 0, costUsd: 0, latencyMs: 0, status: error.status ? `${error.code} ${error.status}` : error.code, cacheHit: false,
        });
        searchLog.push({ at, step: "dating", query: `wayback unavailable for ${node.url}: ${error.code}${error.status ? ` ${error.status}` : ""}; date from the page's own evidence only`,
          endDate: null, startDate: null, results: 0, kept: 0, dropped: 0 });
      }
    }
    return { ...trace, nodes, usage, searchLog };
  };
}

function checked(value: unknown): Trace {
  const trace = Trace.parse(value);
  if (trace.synthetic !== (trace.mode === "SAMPLE")) throw new Error("Synthetic/mode mismatch");
  const report = verifyTrace(trace);
  if (report.failures.length) throw new Error("Trace verification failed");
  return trace;
}

export async function runTrace(input: string, pipeline: Pipeline, opts: {
  wayback: Wayback; pages?: readonly PageInput[]; emit?: Emit;
}): Promise<Trace> {
  for (const stage of STAGES) {
    if (stage !== "dating" && typeof pipeline?.[stage] !== "function") throw new Error(`Missing pipeline stage: ${stage}`);
  }
  if (typeof opts?.wayback?.firstCapture !== "function") throw new Error("Missing Wayback client");
  const pages = new Map<string, Context["pages"][number]>();
  const addPages = (inputs: readonly PageInput[]) => {
    for (const page of inputs) {
      const previous = pages.get(page.url);
      pages.set(page.url, Object.freeze({
        url: page.url, quotedText: JSON.stringify(page.text),
        metadata: page.metadata === undefined ? previous?.metadata : page.metadata,
        byline: page.byline === undefined ? previous?.byline : page.byline,
        metadataSource: page.metadataSource === undefined ? previous?.metadataSource : page.metadataSource,
        metadataPrecision: page.metadata === undefined ? previous?.metadataPrecision : page.metadataPrecision,
      }));
    }
  };
  addPages(opts.pages ?? []);
  const date = datingStep(opts.wayback);
  let datedNodes: Map<string, { url: string; date: Trace["nodes"][number]["date"] }> | undefined;
  let trace: Trace | undefined;
  let sequence = 0;
  for (const stage of STAGES) {
    opts.emit?.({ sequence: sequence++, type: "stage", stage, status: "started" });
    try {
      // Snapshot before calling: adapters may mutate their input in place.
      const incomingUsage = structuredClone(trace?.usage ?? []);
      const context: Context = Object.freeze({ input, pages: Object.freeze([...pages.values()]) });
      const result = await (stage === "intake" ? pipeline.intake(context)
        : stage === "dating" ? date(trace!, context) : pipeline[stage](trace!, context));
      const next = Trace.parse("trace" in result ? result.trace : result);
      if ("trace" in result) {
        if (stage !== "walk" && stage !== "spans") throw new Error("Unexpected page output");
        addPages(result.pages);
      }
      if (datedNodes && next.nodes.some(node => {
        const dated = datedNodes!.get(node.id);
        return !dated || dated.url !== node.url || !isDeepStrictEqual(node.date, dated.date);
      })) throw new Error("Pipeline stage changed an authoritative node date");
      if (stage === "dating") {
        datedNodes = new Map(next.nodes.map(node => [node.id, { url: node.url, date: structuredClone(node.date) }]));
      }
      if (next.mode !== "LIVE" && !(next.mode === "SAMPLE" && next.synthetic)) {
        throw new Error("Pipeline adapter must return LIVE or synthetic SAMPLE");
      }
      if (next.synthetic !== (next.mode === "SAMPLE")) throw new Error("Synthetic/mode mismatch");
      if (!isDeepStrictEqual(next.usage.slice(0, incomingUsage.length), incomingUsage)) {
        throw new Error("Pipeline stage must preserve incoming usage prefix");
      }
      trace = next;
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
