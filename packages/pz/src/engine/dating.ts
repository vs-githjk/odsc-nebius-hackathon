import type { DateInfo, Node } from "../schema/trace.ts";
import { ClientError } from "../clients/errors.ts";
import type { createWayback, FirstCapture } from "../clients/wayback.ts";
import type { UsageRow } from "../schema/usage.ts";
import { captureHoldsClaim, type CaptureChecker } from "./capture.ts";

// Caller supplies structured publication metadata or an extracted byline date.
// Body/search dates are accepted for callers' convenience but never trusted.
export type DateEvidence = {
  metadata?: string | null;
  // Where `metadata` came from when it is not the page's own meta tags: a scholarly registry (same trust, same cap).
  metadataSource?: "registry_pubmed" | "registry_pmc" | "registry_crossref";
  // "month" or "year" when `metadata` is the last day of a partial registry date. Absent means a full day.
  metadataPrecision?: "month" | "year";
  byline?: string | null;
  bodyText?: string;
  tavily?: string | null;
};
// captureBody and captureVersions are optional only so small test fakes can leave them out; the production client has both.
type Wayback = Pick<ReturnType<typeof createWayback>, "firstCapture"> & CaptureChecker;

function isoDay(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
  const day = value.slice(0, 10);
  const midnight = new Date(day + "T00:00:00Z");
  if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== day) return null;
  if (value.length > 10 && !Number.isFinite(Date.parse(value))) return null;
  return day;
}

// captureHolds === false (L19): the first capture was read and does not hold the claim, or could not be read. It then
// dates nothing: a page's own metadata or byline stands, and with none the date is unconfirmed with no value.
export function dateEvidence(evidence: DateEvidence, capture: FirstCapture, opts: { captureHolds?: boolean } = {}): DateInfo {
  const metadata = isoDay(evidence.metadata);
  const byline = isoDay(evidence.byline);
  const published = metadata ?? byline;
  // Metadata has precedence; disagreements stay visible, not silently early-biased.
  const source = metadata ? (evidence.metadataSource ?? "metadata") : byline ? "byline" : "wayback_first_capture";
  const firstCapture = capture.status === "found" ? isoDay(capture.firstCapture) : null;
  if (capture.status === "found" && !firstCapture) {
    throw new ClientError("bad_response", "wayback cdx: invalid first capture date");
  }
  const conflictingDate = Boolean(metadata && byline && metadata !== byline);
  if (firstCapture && (!published || published > firstCapture) && opts.captureHolds === false) {
    // The capture stays on the node for display, unless the page's own later date would then read as "later than its capture".
    const shown = published && published > firstCapture ? null : firstCapture;
    const partial = metadata && source !== "byline" ? evidence.metadataPrecision : undefined;
    return { kind: published ? "published" : "unconfirmed", value: published, source, firstCapture: shown, conflictingDate, ...(partial ? { precision: partial } : {}) };
  }
  if (firstCapture && (!published || published > firstCapture)) {
    return { kind: "existed_by", value: firstCapture, source: "wayback_first_capture", firstCapture,
      conflictingDate: conflictingDate || published !== null };
  }
  const partial = metadata && source !== "byline" ? evidence.metadataPrecision : undefined;
  return { kind: published ? "published" : "unconfirmed", value: published, source, firstCapture, conflictingDate, ...(partial ? { precision: partial } : {}) };
}

// Keep the original usage row available for T29's trace assembly. Client errors propagate.
// `spans` are the node's span texts. When the date would come from the first capture, that capture is read and the date
// is kept only if it holds one of them (L19). A page dated by its own metadata or byline makes no extra request.
export async function dateNode(node: Node, evidence: DateEvidence, wayback: Wayback, spans: readonly string[] = []) {
  const result = await wayback.firstCapture(node.url, { step: "dating" });
  const date = dateEvidence(evidence, result.data);
  const extraUsage: UsageRow[] = [];
  let note: string | null = null;
  if (date.kind === "existed_by" && result.data.status === "found" && wayback.captureBody) {
    const verdict = await captureHoldsClaim(wayback, node.url, result.data, spans);
    extraUsage.push(...verdict.usage);
    if (!verdict.holds) {
      note = `${node.url}: ${verdict.why}; no date from the first capture`;
      return { node: { ...node, date: dateEvidence(evidence, result.data, { captureHolds: false }) }, usage: result.usage, extraUsage, note };
    }
  }
  return { node: { ...node, date }, usage: result.usage, extraUsage, note };
}

// The caller supplies a separately fetched version with its own id, URL and spans.
// Never copy the original's publication date or span ownership into a version.
export async function versionNode(original: Node, version: Node, evidence: DateEvidence, wayback: Wayback, spans: readonly string[] = []) {
  if (version.id === original.id) throw new Error("A version needs a distinct node id");
  const dated = await dateNode(version, evidence, wayback, spans);
  return { ...dated, node: { ...dated.node, versionOf: original.versionOf ?? original.id, clusterId: original.clusterId } };
}
