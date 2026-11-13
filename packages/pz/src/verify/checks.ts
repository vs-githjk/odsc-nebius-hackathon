import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { decideStopState, isNegated, loadRules, normalise, type Rules } from "../rules/index.ts";
import { atomHit } from "../rules/numbers.ts";
import type { Trace } from "../schema/index.ts";

export type Check = "window_hash" | "offsets" | "atoms" | "negated" | "earliest" | "date_cap" | "edge_spans" | "edge_kind" | "stop_state" | "page_hash" | "page_offsets";
export type Failure = { traceId: string; check: Check; detail: string };
export type TraceReport = { spans: number; spansOk: number; edgesWithoutTwoSpans: number; stateAgrees: boolean; failures: Failure[] };

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

// Re-checks a stored trace from its own contents (and, with pagesDir, the saved pages). Never calls the matcher.
// historical: a record made under earlier rules, kept as it was. The atoms re-check is skipped and the decision is
// compared on state and row only; the caller must say so in its output.
export function verifyTrace(trace: Trace, opts: { pagesDir?: string; rules?: Rules; historical?: boolean } = {}): TraceReport {
  const failures: Failure[] = [];
  const fail = (check: Check, detail: string) => failures.push({ traceId: trace.id, check, detail });
  const onEdge = new Set(trace.edges.flatMap((e) => [e.parentSpanId, e.childSpanId]));
  const lemma = normalise(trace.claim.atoms.subjectLemma).toLowerCase();
  const rules = opts.rules ?? loadRules();
  const meta = new Set(trace.nodes.filter((n) => n.meta).map((n) => n.id));
  let spansOk = 0;

  for (const s of trace.spans) {
    const before = failures.length;
    if (sha256(s.contextBefore + s.text + s.contextAfter) !== s.windowSha256) fail("window_hash", `span ${s.id}: window hash differs`);
    if (s.end - s.start !== s.text.length) fail("offsets", `span ${s.id}: ${s.start}..${s.end} does not fit ${s.text.length} characters`);
    // Spans that back an edge must carry the claim's number; other spans must at least name the subject.
    const atomsOk = onEdge.has(s.id) ? atomHit(s.text, trace.claim.atoms, rules.weakNumberMinSigDigits, rules.weakNumberMaxCommas) : normalise(s.text).toLowerCase().includes(lemma);
    if (!atomsOk && !opts.historical) fail("atoms", `span ${s.id}: claim atoms not found under the number rules`);
    // Meta pages deny the claim on purpose; anywhere else a negated span cannot back the trace.
    if (!meta.has(s.nodeId) && isNegated(s, rules.negationPrefixes)) fail("negated", `span ${s.id}: preceded by a negation`);
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

  // The stored earliest nodes must really be earliest: no page feeds into them, and no page outside their clusters is older.
  const earliest = trace.nodes.filter((n) => trace.earliest.nodeIds.includes(n.id));
  const earliestClusters = new Set(earliest.map((n) => n.clusterId));
  for (const n of earliest) {
    const from = trace.edges.find((e) => e.childId === n.id && !meta.has(e.parentId));
    if (from) fail("earliest", `earliest node ${n.id} has an incoming edge ${from.id} from ${from.parentId}`);
  }
  const firstDate = earliest.map((n) => n.date.value).filter((d): d is string => d !== null).sort()[0];
  for (const n of trace.nodes) {
    if (firstDate && !n.meta && !earliestClusters.has(n.clusterId) && n.date.value !== null && n.date.value < firstDate)
      fail("earliest", `node ${n.id} (${n.date.value}) is older than the earliest nodes (${firstDate})`);
  }

  // A metadata date later than the page's first capture must carry the conflict flag (the capture caps the date).
  for (const n of trace.nodes) {
    const { value, firstCapture, conflictingDate } = n.date;
    if (value !== null && firstCapture !== null && value > firstCapture && !conflictingDate)
      fail("date_cap", `node ${n.id}: date ${value} is later than its first capture ${firstCapture} and is not flagged`);
  }

  const recomputed = decideStopState(trace, rules);
  const stateAgrees = opts.historical
    ? recomputed.state === trace.decision.state && recomputed.row === trace.decision.row
    : isDeepStrictEqual(recomputed, trace.decision);
  if (!stateAgrees) {
    // Name every field that differs: state and row can agree while the reasons or counts do not.
    const differing = (["state", "row", "reasons", "counts"] as const)
      .filter((k) => !isDeepStrictEqual(recomputed[k], trace.decision[k]))
      .map((k) => `${k}: stored ${JSON.stringify(trace.decision[k])}, rules give ${JSON.stringify(recomputed[k])}`);
    fail("stop_state", `stored ${trace.decision.state} row ${trace.decision.row}, rules give ${recomputed.state} row ${recomputed.row}; differs in ${differing.join("; ")}`);
  }

  return { spans: trace.spans.length, spansOk, edgesWithoutTwoSpans, stateAgrees, failures };
}
