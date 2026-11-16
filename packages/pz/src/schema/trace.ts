import { z } from "zod";
import { TypedAnswer } from "./questions.ts";
import { UsageRow } from "./usage.ts";

export const StopState = z.enum(["ORIGIN_FOUND", "CONFLICTING", "TRAIL_GOES_COLD", "PARTIAL", "TOOL_FAILED", "NO_PAGES_FOUND"]);
export type StopState = z.infer<typeof StopState>;
export const Mode = z.enum(["LIVE", "REPLAY", "SAMPLE"]);
export type Mode = z.infer<typeof Mode>;
export const MatchTier = z.enum(["exact", "normalised"]);
export type MatchTier = z.infer<typeof MatchTier>;
export const Atoms = z.object({
  number: z.object({ raw: z.string(), canonical: z.string() }).strict(), unit: z.string().nullable(),
  subjectLemma: z.string(), population: z.string().nullable(), time: z.string().nullable(),
  hedge: z.string().nullable(), namedSource: z.string().nullable(), variants: z.array(z.string()),
}).strict();
export type Atoms = z.infer<typeof Atoms>;
export const Span = z.object({
  id: z.string(), nodeId: z.string(), text: z.string(), contextBefore: z.string().max(200), contextAfter: z.string().max(200),
  start: z.number(), end: z.number(), extractSha256: z.string(), windowSha256: z.string(),
  fetchedAt: z.string(), waybackUrl: z.string().nullable(), tier: MatchTier,
}).strict();
export type Span = z.infer<typeof Span>;
export const DateInfo = z.object({
  kind: z.enum(["published", "existed_by", "unconfirmed"]), value: z.string().nullable(),
  source: z.enum(["metadata", "byline", "wayback_first_capture", "tavily"]), firstCapture: z.string().nullable(), conflictingDate: z.boolean(),
}).strict();
export type DateInfo = z.infer<typeof DateInfo>;
export const Node = z.object({
  id: z.string(), url: z.string(), domain: z.string(), title: z.string(), date: DateInfo,
  clusterId: z.string(), evidence: z.enum(["observed", "inferred", "conflicting", "unknown"]),
  meta: z.boolean(), read: z.boolean(), versionOf: z.string().nullable(), spanIds: z.array(z.string()),
  citesEarlier: z.boolean(), candidateParents: z.array(z.object({ url: z.string(), read: z.boolean() }).strict()), pageType: TypedAnswer.nullable(),
  // T36: the typed same_claim answer for this page's span. Absent or null means the gate did not run (no model),
  // which counts as unsure: such a page is never an origin.
  sameClaim: TypedAnswer.nullable().optional(),
  // T50: the first instruction-like stretch found anywhere on the page (rules.json injectionPatterns), quoted, or null.
  // Absent on traces recorded before the check. A page with one is never an origin.
  injection: z.string().nullable().optional(),
}).strict();
export type Node = z.infer<typeof Node>;
export const Edge = z.object({
  id: z.string(), parentId: z.string(), childId: z.string(), kind: z.enum(["explicit", "inferred"]),
  parentSpanId: z.string(), childSpanId: z.string(), linkHref: z.string().nullable(),
}).strict();
export type Edge = z.infer<typeof Edge>;
export const Cluster = z.object({
  id: z.string(), nodeIds: z.array(z.string()), rule: z.enum(["near_duplicate", "syndicated", "same_byline", "versions", "single"]),
}).strict();
export type Cluster = z.infer<typeof Cluster>;
export const ReadoutId = z.enum(["number_changed", "unit_changed", "hedge_dropped", "comparison_added", "scope_widened", "attribution_shifted", "context_stripped"]);
export type ReadoutId = z.infer<typeof ReadoutId>;
export const Readout = z.object({
  id: ReadoutId, source: z.enum(["measured", "inferred"]), value: z.enum(["yes", "no", "unsure"]),
  probability: z.number().min(0).max(1).nullable(), disputed: z.boolean(),
}).strict();
export type Readout = z.infer<typeof Readout>;
export const Hop = z.object({
  edgeId: z.string(), readouts: z.array(Readout),
  wordDiff: z.array(z.object({ op: z.enum(["same", "add", "del"]), text: z.string() }).strict()), faithful: z.boolean(),
}).strict();
export type Hop = z.infer<typeof Hop>;
export const Blame = z.object({
  index: z.number(), word: z.string(),
  firstSeen: z.object({ spanId: z.string(), nodeId: z.string(), date: z.string().nullable() }).strict().nullable(), viaInferredHop: z.boolean(),
}).strict();
export type Blame = z.infer<typeof Blame>;
export const Roots = z.object({
  pages: z.number(), clusters: z.number(), rootsLinked: z.number(), clustersUnlinked: z.number(), studiesFound: z.number().nullable(),
}).strict();
export type Roots = z.infer<typeof Roots>;
export const Decision = z.object({
  state: StopState, row: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  reasons: z.array(z.string()), counts: z.record(z.string(), z.number()),
}).strict();
export type Decision = z.infer<typeof Decision>;
export const SearchLogEntry = z.object({
  at: z.string(), step: z.string(), query: z.string(), endDate: z.string().nullable(), startDate: z.string().nullable(),
  results: z.number(), kept: z.number(), dropped: z.number(),
}).strict();
export type SearchLogEntry = z.infer<typeof SearchLogEntry>;
export const Trace = z.object({
  schemaVersion: z.literal("1"), id: z.string(), mode: Mode, synthetic: z.boolean(), recordedAt: z.string(),
  claim: z.object({ text: z.string(), atoms: Atoms }).strict(), viralSentence: z.string(),
  nodes: z.array(Node), edges: z.array(Edge), clusters: z.array(Cluster), spans: z.array(Span),
  hops: z.array(Hop), blame: z.array(Blame), roots: Roots, redHopEdgeId: z.string().nullable(),
  earliest: z.object({ nodeIds: z.array(z.string()), earlierWindowSearches: z.number(), earlierFound: z.number() }).strict(),
  failure: z.object({ service: z.string(), endpoint: z.string(), status: z.string(), kept: z.string() }).strict().nullable(),
  budget: z.object({ credits: z.number(), usd: z.number(), ms: z.number(), capHit: z.enum(["credits", "usd", "ms", "depth", "frontier"]).nullable() }).strict(),
  decision: Decision, searchLog: z.array(SearchLogEntry), usage: z.array(UsageRow), scopeNote: z.string(),
}).strict();
export type Trace = z.infer<typeof Trace>;
