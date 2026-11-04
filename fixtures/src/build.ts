import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Trace, type Blame, type Hop, type Node, type Span } from "../../packages/pz/src/schema/index.ts";
import { decideStopState, loadRules, normalise } from "../../packages/pz/src/rules/index.ts";
import { PAGES } from "./pages.ts";
import { CLAIM, readout, type FixtureSpec } from "./spec.ts";
import { SPECS } from "./specs/index.ts";

const ROOT = new URL("../", import.meta.url);
const AT = "2026-11-01T08:00:00Z";
const MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const CONTEXT = 200;

export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
export const readPage = (id: string) => normalise(readFileSync(new URL(`pages/${id}.txt`, ROOT), "utf8"));
const words = (text: string) => normalise(text).toLowerCase().split(" ").map((w) => w.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "")).filter(Boolean);

function span(nodeId: string): Span {
  const page = readPage(nodeId);
  const text = normalise(PAGES[nodeId]!.span);
  const start = page.indexOf(text);
  if (start < 0) throw new Error(`span for ${nodeId} is not found verbatim in its page`);
  const end = start + text.length;
  const contextBefore = page.slice(Math.max(0, start - CONTEXT), start);
  const contextAfter = page.slice(end, end + CONTEXT);
  return {
    id: `s-${nodeId}`, nodeId, text, contextBefore, contextAfter, start, end,
    extractSha256: sha256(page), windowSha256: sha256(contextBefore + text + contextAfter),
    fetchedAt: AT, waybackUrl: `https://web.archive.org/web/2026/${PAGES[nodeId]!.url}`, tier: "exact",
  };
}

// Word-level LCS diff from the parent span to the child span.
function wordDiff(a: string[], b: string[]): Hop["wordDiff"] {
  const lcs = a.map(() => b.map(() => 0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    lcs[i]![j] = a[i] === b[j] ? 1 + (lcs[i + 1]?.[j + 1] ?? 0) : Math.max(lcs[i + 1]?.[j] ?? 0, lcs[i]![j + 1] ?? 0);
  const out: Hop["wordDiff"] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { out.push({ op: "same", text: a[i]! }); i++; j++; }
    else if (j < b.length && (i >= a.length || (lcs[i]?.[j + 1] ?? 0) >= (lcs[i + 1]?.[j] ?? 0))) out.push({ op: "add", text: b[j++]! });
    else out.push({ op: "del", text: a[i++]! });
  }
  return out;
}

export function buildTrace(spec: FixtureSpec): Trace {
  const spans = spec.nodes.map((n) => span(n.page));
  const nodes: Node[] = spec.nodes.map((n) => {
    const page = PAGES[n.page]!;
    return {
      id: n.page, url: page.url, domain: new URL(page.url).hostname, title: page.title,
      date: { kind: n.dateKind ?? page.dateKind, value: page.date, source: "metadata", firstCapture: page.date, conflictingDate: false },
      clusterId: n.cluster, evidence: n.evidence ?? "observed", meta: n.meta ?? false, read: true, versionOf: n.versionOf ?? null,
      spanIds: [`s-${n.page}`], citesEarlier: n.citesEarlier ?? false,
      candidateParents: (n.unreadParents ?? []).map((url) => ({ url, read: false })),
      pageType: { questionId: "page_type", optionId: page.pageType, probability: 0.9, top: [{ optionId: page.pageType, p: 0.9 }], model: MODEL, threshold: null },
    };
  });
  const textOf = (id: string) => words(PAGES[id]!.span);
  const hops: Hop[] = spec.edges.map((e) => {
    const readouts = [readout.measured("number_changed", "no"), ...(e.readouts ?? [])];
    return { edgeId: e.id, readouts, wordDiff: wordDiff(textOf(e.parent), textOf(e.child)), faithful: readouts.every((r) => r.value === "no") };
  });
  // Each word of the viral sentence is blamed on the earliest non-meta page whose span has it.
  const byDate = nodes.filter((n) => !n.meta).sort((a, b) => (a.date.value ?? "").localeCompare(b.date.value ?? "") || a.id.localeCompare(b.id));
  const blame: Blame[] = words(CLAIM).map((word, index) => {
    const first = byDate.find((n) => textOf(n.id).includes(word));
    const viaInferredHop = !!first && spec.edges.some((e) => e.child === first.id && e.kind === "inferred")
      && !spec.edges.some((e) => e.child === first.id && e.kind === "explicit");
    return { index, word, firstSeen: first ? { spanId: `s-${first.id}`, nodeId: first.id, date: first.date.value } : null, viaInferredHop };
  });
  const pageClusters = new Set(nodes.filter((n) => !n.meta).map((n) => n.clusterId));
  const clusterOf = (id: string) => nodes.find((n) => n.id === id)!.clusterId;
  const linked = spec.edges.filter((e) => clusterOf(e.parent) !== clusterOf(e.child));
  const roots = [...pageClusters].filter((c) => linked.some((e) => clusterOf(e.parent) === c) && !linked.some((e) => clusterOf(e.child) === c));
  const earliestDate = nodes.find((n) => n.id === spec.earliest.nodeIds[0])?.date.value ?? null;

  const draft = Trace.parse({
    schemaVersion: "1", id: spec.id, mode: "SAMPLE", synthetic: true, recordedAt: AT,
    claim: { text: CLAIM, atoms: {
      number: { raw: "14", canonical: "14" }, unit: "times a day", subjectLemma: "penguin", population: "Harbor Zoo penguins",
      time: null, hedge: null, namedSource: null, variants: ["fourteen"] } },
    viralSentence: CLAIM, nodes,
    edges: spec.edges.map((e) => ({
      id: e.id, parentId: e.parent, childId: e.child, kind: e.kind, parentSpanId: `s-${e.parent}`, childSpanId: `s-${e.child}`,
      linkHref: e.kind === "explicit" ? PAGES[e.parent]!.url : null,
    })),
    clusters: spec.clusters.map((c) => ({ ...c, nodeIds: nodes.filter((n) => n.clusterId === c.id).map((n) => n.id) })),
    spans, hops, blame,
    roots: { pages: nodes.filter((n) => !n.meta).length, clusters: pageClusters.size, rootsLinked: roots.length,
      clustersUnlinked: [...pageClusters].filter((c) => !linked.some((e) => clusterOf(e.parent) === c || clusterOf(e.child) === c)).length, studiesFound: null },
    redHopEdgeId: spec.redHop ?? null,
    earliest: { nodeIds: spec.earliest.nodeIds, earlierWindowSearches: spec.earliest.searches, earlierFound: spec.earliest.found },
    failure: spec.failure ?? null,
    budget: spec.budget ?? { credits: 24, usd: 0.06, ms: 38000, capHit: null },
    decision: { state: "TRAIL_GOES_COLD", row: 6, reasons: [], counts: {} },
    searchLog: Array.from({ length: spec.earliest.searches }, (_, i) => ({
      at: AT, step: `earlier_window_${i + 1}`, query: CLAIM, endDate: earliestDate, startDate: null,
      results: spec.earliest.found, kept: spec.earliest.found, dropped: 0 })),
    usage: [], scopeNote: "Synthetic: an invented claim on invented pages.",
  });
  const decision = decideStopState(draft, loadRules());
  if (decision.state !== spec.expect) throw new Error(`${spec.id}: expected ${spec.expect}, rules give ${decision.state}`);
  return { ...draft, decision };
}

export function buildAll(): Record<string, string> {
  return Object.fromEntries(SPECS.map((s) => [`${s.id}.json`, JSON.stringify(buildTrace(s), null, 2) + "\n"]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = new URL("traces/", ROOT);
  mkdirSync(dir, { recursive: true });
  for (const [name, json] of Object.entries(buildAll())) writeFileSync(new URL(name, dir), json);
  console.log(`wrote ${SPECS.length} fixture traces`);
}
