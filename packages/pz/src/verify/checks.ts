import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { decideStopState, loadRules, normalise, type Rules } from "../rules/index.ts";
import { atomHit } from "../rules/numbers.ts";
import type { Trace } from "../schema/index.ts";

export type Check = "window_hash" | "offsets" | "atoms" | "edge_spans" | "edge_kind" | "stop_state" | "page_hash" | "page_offsets";
export type Failure = { traceId: string; check: Check; detail: string };
export type TraceReport = { spans: number; spansOk: number; edgesWithoutTwoSpans: number; stateAgrees: boolean; failures: Failure[] };

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

// Re-checks a stored trace from its own contents (and, with pagesDir, the saved pages). Never calls the matcher.
export function verifyTrace(trace: Trace, opts: { pagesDir?: string; rules?: Rules } = {}): TraceReport {
  const failures: Failure[] = [];
  const fail = (check: Check, detail: string) => failures.push({ traceId: trace.id, check, detail });
  const onEdge = new Set(trace.edges.flatMap((e) => [e.parentSpanId, e.childSpanId]));
  const lemma = normalise(trace.claim.atoms.subjectLemma).toLowerCase();
  let spansOk = 0;

  for (const s of trace.spans) {
    const before = failures.length;
    if (sha256(s.contextBefore + s.text + s.contextAfter) !== s.windowSha256) fail("window_hash", `span ${s.id}: window hash differs`);
    if (s.end - s.start !== s.text.length) fail("offsets", `span ${s.id}: ${s.start}..${s.end} does not fit ${s.text.length} characters`);
    // Spans that back an edge must carry the claim's number; other spans must at least name the subject.
    const atomsOk = onEdge.has(s.id) ? atomHit(s.text, trace.claim.atoms) : normalise(s.text).toLowerCase().includes(lemma);
    if (!atomsOk) fail("atoms", `span ${s.id}: claim atoms not found under the number rules`);
    if (opts.pagesDir) {
      const page = normalise(readFileSync(`${opts.pagesDir}/${s.nodeId}.txt`, "utf8"));
      if (sha256(page) !== s.extractSha256) fail("page_hash", `span ${s.id}: page hash differs`);
      if (page.slice(s.start, s.end) !== s.text) fail("page_offsets", `span ${s.id}: text not at ${s.start}..${s.end} in the page`);
    }
    if (failures.length === before) spansOk++;
  }

  const spanNode = new Map(trace.spans.map((s) => [s.id, s.nodeId]));
  let edgesWithoutTwoSpans = 0;
  for (const e of trace.edges) {
    if (spanNode.get(e.parentSpanId) !== e.parentId || spanNode.get(e.childSpanId) !== e.childId) {
      edgesWithoutTwoSpans++;
      fail("edge_spans", `edge ${e.id}: needs a parent span on ${e.parentId} and a child span on ${e.childId}`);
    }
    if ((e.kind === "explicit") !== (e.linkHref !== null)) fail("edge_kind", `edge ${e.id}: kind ${e.kind} with linkHref ${e.linkHref ?? "null"}`);
  }

  const recomputed = decideStopState(trace, opts.rules ?? loadRules());
  const stateAgrees = isDeepStrictEqual(recomputed, trace.decision);
  if (!stateAgrees) fail("stop_state", `stored ${trace.decision.state} row ${trace.decision.row}, rules give ${recomputed.state} row ${recomputed.row}`);

  return { spans: trace.spans.length, spansOk, edgesWithoutTwoSpans, stateAgrees, failures };
}
