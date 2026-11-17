import type { DateInfo, Node } from "../schema/trace.ts";
import { ClientError } from "../clients/errors.ts";
import type { createWayback, FirstCapture } from "../clients/wayback.ts";

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
type Wayback = Pick<ReturnType<typeof createWayback>, "firstCapture">;

function isoDay(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
  const day = value.slice(0, 10);
  const midnight = new Date(day + "T00:00:00Z");
  if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== day) return null;
  if (value.length > 10 && !Number.isFinite(Date.parse(value))) return null;
  return day;
}

export function dateEvidence(evidence: DateEvidence, capture: FirstCapture): DateInfo {
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
  if (firstCapture && (!published || published > firstCapture)) {
    return { kind: "existed_by", value: firstCapture, source: "wayback_first_capture", firstCapture,
      conflictingDate: conflictingDate || published !== null };
  }
  const partial = metadata && source !== "byline" ? evidence.metadataPrecision : undefined;
  return { kind: published ? "published" : "unconfirmed", value: published, source, firstCapture, conflictingDate, ...(partial ? { precision: partial } : {}) };
}

// Keep the original usage row available for T29's trace assembly. Client errors propagate.
export async function dateNode(node: Node, evidence: DateEvidence, wayback: Wayback) {
  const result = await wayback.firstCapture(node.url, { step: "dating" });
  return { node: { ...node, date: dateEvidence(evidence, result.data) }, usage: result.usage };
}

// The caller supplies a separately fetched version with its own id, URL and spans.
// Never copy the original's publication date or span ownership into a version.
export async function versionNode(original: Node, version: Node, evidence: DateEvidence, wayback: Wayback) {
  if (version.id === original.id) throw new Error("A version needs a distinct node id");
  const dated = await dateNode(version, evidence, wayback);
  return { ...dated, node: { ...dated.node, versionOf: original.versionOf ?? original.id, clusterId: original.clusterId } };
}
