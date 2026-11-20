import type { Decision, Node, Trace, TypedAnswer } from "../schema/index.ts";
import { BOUNDARY_REASONS, findBoundary } from "./boundary.ts";
import { hasInjection, isInjected, isNegated } from "./negation.ts";
import { normalise } from "./normalise.ts";
import { claimHit } from "./claim-hit.ts";
import { citesInWords, presentsAsPrior } from "./written-citation.ts";
import { atomHit, parseNumbers, sameNumber } from "./numbers.ts";
import type { Rules } from "./rules.ts";

// A typed answer counts only if it is not "unsure" and, once a threshold is frozen, clears it.
function confident(answer: TypedAnswer | null, rules: Rules): answer is TypedAnswer {
  if (!answer || answer.optionId === "unsure") return false;
  return rules.confidenceThreshold === null || (answer.probability ?? 0) >= rules.confidenceThreshold;
}

// T36: a same_claim "yes" counts only with a known confidence that clears the threshold. Absent, null ("no_model"),
// "no", "unsure" and a "yes" whose confidence could not be read all block an origin.
export function confidentYes(answer: TypedAnswer | null | undefined, rules: Rules): boolean {
  return !!answer && answer.optionId === "yes" && answer.probability !== null && confident(answer, rules);
}

// F1 (#192): a confident same_claim "no" rules a page out of the trail. It is still a page we read, but it never becomes
// the earliest page or sets how far back the walk searches. "unsure", absent and below-threshold answers rule nothing out.
export function confidentNo(answer: TypedAnswer | null | undefined, rules: Pick<Rules, "confidenceThreshold">): boolean {
  if (!answer || answer.optionId !== "no") return false;
  return rules.confidenceThreshold === null || (answer.probability !== null && answer.probability >= rules.confidenceThreshold);
}

// T79: with a second model set, its answer must be a plain yes too. Disagreement, or no answer, is unsure. Its
// confidence is not required: the second model is a veto, and some families return no logprobs.
function secondAgrees(n: Node, rules: Rules): boolean {
  return rules.secondSameClaimModel === null || n.sameClaimSecond?.optionId === "yes";
}

// Anchored on the claim's number: the earliest cluster conflicts when one page gives that number for the subject
// and another page gives the subject only other numbers. A shared unrelated number (a year, a count) hides nothing.
function conflicting(trace: Trace, pages: Node[], rules: Rules): boolean {
  const atoms = trace.claim.atoms;
  // A phrase claim (T53) has no number to disagree about.
  if (!atoms.number) return false;
  const target = parseNumbers(atoms.number.canonical).numbers[0];
  if (!target) return false;
  const lemma = normalise(atoms.subjectLemma).toLowerCase();
  const earliestClusters = new Set(pages.filter((n) => trace.earliest.nodeIds.includes(n.id)).map((n) => n.clusterId));
  let agrees = false;
  let differs = false;
  for (const node of pages.filter((n) => earliestClusters.has(n.clusterId))) {
    const spans = trace.spans.filter((s) => s.nodeId === node.id && normalise(s.text).toLowerCase().includes(lemma));
    const numbers = spans.flatMap((s) => parseNumbers(s.text).numbers);
    if (spans.some((s) => atomHit(s.text, atoms, rules.weakNumberMinSigDigits, rules.weakNumberMaxCommas))) agrees = true;
    else if (numbers.length > 0 && !numbers.some((n) => sameNumber(n, target).equal)) differs = true;
  }
  return agrees && differs;
}

// The origin experiment, attempt A (#307). Two code-only refinements, each measured by replaying every recorded trace
// against the answer key (src/eval/origin-replay.ts): 0 false origins is the gate.
//
// 1. A primary page must be typed confidently, and its address must look like a document: a dated article path
//    (/2017/07/10/...) is a news or blog post, and a list page (/publications, /published-papers) lists other works.
//    The model typed a CNBC article and a Scientific American column as "report"; G4's false origin was a list page.
export const PRIMARY_MIN_PROBABILITY = 0.9;
const DATED_PATH = /\/(?:19|20)\d{2}\/\d{1,2}\/(?:\d{1,2}\/)?/;
const LIST_PAGES = new Set(["publications", "published-papers", "papers", "articles", "news", "blog", "archive", "archives", "category",
  "categories", "tag", "tags", "search", "press", "press-releases", "media", "resources", "library", "index", "home", "list"]);
export function primaryUrl(url: string): boolean {
  let path: string;
  try { path = new URL(url).pathname.toLowerCase(); } catch { return false; }
  if (DATED_PATH.test(path)) return false;
  const last = path.replace(/\/+$/, "").split("/").at(-1) ?? "";
  return !LIST_PAGES.has(last);
}

// 2. An unread cited page blocks an origin only when it bears on this claim: cited by the candidate origin, by a page
//    connected to it by an edge, or by a fact-check about this claim. A fact-check page about something else (dev-10's
//    Snopes piece on a sperm whale) says nothing about where this claim began. A fact-check is judged by its address:
//    on-topic if it carries the claim's number as a whole token or two of the claim's words; too few words to judge
//    counts as on-topic, so its unread citations still block.
const STOP = new Set(["that", "there", "their", "they", "this", "with", "will", "would", "more", "than", "have", "from", "only", "just",
  "ever", "been", "into", "about", "your", "what", "when", "which", "need", "stay"]);
const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
export function offTopicMeta(url: string, claim: { number: { canonical: string } | null; subjectLemma: string; text: string }): boolean {
  let path: string;
  try { path = new URL(url).pathname; } catch { return false; }
  const tokens = words(path);
  const alpha = tokens.filter((t) => /[a-z]/.test(t) && t.length >= 3);
  if (alpha.length < 3) return false;
  const number = claim.number?.canonical.replace(/[^0-9.]/g, "");
  if (number && tokens.includes(number)) return false;
  const claimWords = [...new Set(words(claim.text).filter((w) => w.length >= 4 && /[a-z]/.test(w) && !STOP.has(w)))];
  const hits = claimWords.filter((c) => alpha.some((t) => t === c || (t.length >= 4 && (t.startsWith(c) || c.startsWith(t)))));
  return hits.length < 2;
}

// Row 5's page checks, in one place so the stop card quotes the very page decide picked (XO on #180).
function originChecks(trace: Trace, pages: Node[], rules: Rules) {
  const eligible = pages.filter((n) =>
    trace.earliest.nodeIds.includes(n.id) && confident(n.pageType, rules) && rules.primaryPageTypes.includes(n.pageType.optionId)
    && (n.pageType.probability ?? 0) >= PRIMARY_MIN_PROBABILITY && primaryUrl(n.url)
    && n.date.kind !== "unconfirmed" && !n.citesEarlier && citesInWords(trace, n, rules) === null
    && !trace.spans.some((s) => s.nodeId === n.id && isNegated(s, rules.negationPrefixes)));
  // T50: a page with an instruction aimed at a model anywhere on it (the walker quotes it on the node) or in or around
  // its span is never an origin.
  const candidates = eligible.filter((n) => !(n.injection && hasInjection(n.injection, rules.injectionPatterns))
    && !trace.spans.some((s) => s.nodeId === n.id && isInjected(s, rules.injectionPatterns)));
  // T36 same-claim check: a span on the page carries the claim's atoms (code) and the typed same_claim says yes.
  const claimSpan = (n: Node) => trace.spans.find((s) => s.nodeId === n.id && claimHit(s.text, trace.claim.atoms, rules));
  const statesClaim = (n: Node) => confidentYes(n.sameClaim, rules) && secondAgrees(n, rules) && claimSpan(n) !== undefined;
  const origin = candidates.find(statesClaim);
  return { eligible, candidates, origin, originSpan: origin ? claimSpan(origin)! : undefined };
}

// The page row 5 names as the origin and the span on it that states the claim, or null when no page passes. Only
// meaningful on an ORIGIN_FOUND trace; decideStopState runs the same checks.
export function originPick(trace: Trace, rules: Rules): { node: Node; span: Trace["spans"][number] } | null {
  const { origin, originSpan } = originChecks(trace, trace.nodes.filter((n) => !n.meta), rules);
  return origin && originSpan ? { node: origin, span: originSpan } : null;
}

// #307: the pages whose unread citations bear on this claim, so can block an origin (see offTopicMeta). Every non-meta
// page bears; a meta page bears when it is on the origin's path (joined to it by edges, in either direction) or is a
// fact-check about this claim. Only an off-topic fact-check off that path is set aside. The web app shows the same split.
export function bearingNodes(trace: Trace, originId: string | null): Node[] {
  const path = new Set<string>(originId ? [originId] : []);
  for (let grew = true; grew;) {
    grew = false;
    for (const e of trace.edges) {
      if (path.has(e.parentId) !== path.has(e.childId)) { path.add(e.parentId); path.add(e.childId); grew = true; }
    }
  }
  return trace.nodes.filter((n) => !n.meta || path.has(n.id) || !offTopicMeta(n.url, { ...trace.claim.atoms, text: trace.claim.text }));
}

// Rows are checked in order; the first row that holds wins. Pure: reads only the trace and the rules.
export function decideStopState(trace: Trace, rules: Rules): Decision {
  const pages = trace.nodes.filter((n) => !n.meta);
  const unreadParents = trace.nodes.reduce((sum, n) => sum + n.candidateParents.filter((p) => !p.read).length, 0);
  const counts = {
    pages: pages.length, clusters: new Set(pages.map((n) => n.clusterId)).size, unreadParents,
    earlierWindowSearches: trace.earliest.earlierWindowSearches,
  };
  const decide = (state: Decision["state"], row: Decision["row"], reasons: string[]): Decision => ({ state, row, reasons, counts });

  if (trace.failure) return decide("TOOL_FAILED", 1, [`${trace.failure.service} failed: ${trace.failure.status}`]);
  if (trace.budget.capHit) return decide("PARTIAL", 2, [`cap hit: ${trace.budget.capHit}`]);
  if (pages.length === 0) return decide("NO_PAGES_FOUND", 3, ["no pages besides meta pages"]);
  if (conflicting(trace, pages, rules)) return decide("CONFLICTING", 4, ["earliest cluster gives different numbers beyond every transform"]);

  const { eligible, candidates, origin } = originChecks(trace, pages, rules);
  const bearing = bearingNodes(trace, origin?.id ?? null);
  const unreadBlocking = bearing.reduce((sum, n) => sum + n.candidateParents.filter((p) => !p.read).length, 0);
  // The gate's reasons appear only when the gate is what blocks: some earliest page passes every other check.
  const notAsked = candidates.filter((n) => !n.sameClaim).length;
  // T79: pages the first model says yes on that the second model does not.
  const vetoed = candidates.filter((n) => confidentYes(n.sameClaim, rules) && !secondAgrees(n, rules)).length;
  const blockers = [
    eligible.length === 0 && "no earliest page with a confirmed date, a primary page type, no earlier citation and no negated span",
    eligible.length > 0 && candidates.length === 0 && "instruction-like text on every remaining earliest page",
    candidates.length > 0 && !origin && (notAsked > 0
      ? `same_claim not asked on ${notAsked} earliest page(s) (no model), which counts as unsure`
      : vetoed > 0
        ? `the second model (${rules.secondSameClaimModel}) did not say yes on same_claim for ${vetoed} earliest page(s), which counts as unsure`
        : "no earliest page states the same claim: the claim's atoms in a span and a confident same_claim yes"),
    ...pages.filter((n) => trace.earliest.nodeIds.includes(n.id)).flatMap((n) => {
      const year = citesInWords(trace, n, rules);
      return year === null ? [] : [`earliest page ${n.id} cites an earlier source in words (${year})`];
    }),
    ...pages.filter((n) => trace.earliest.nodeIds.includes(n.id)).flatMap((n) => {
      const cue = presentsAsPrior(trace, n, rules);
      return cue === null ? [] : [`earliest page ${n.id} presents the claim as already said ("${cue}")`];
    }),
    unreadParents > 0 && `${unreadParents} unread candidate parent(s)`,
    trace.earliest.earlierWindowSearches < rules.earlierWindowSearches && `fewer than ${rules.earlierWindowSearches} earlier-window searches`,
    trace.earliest.earlierFound > 0 && "earlier-window searches found earlier pages",
  ].filter((b): b is string => typeof b === "string");
  // The unread line is always reported, but it blocks only when an unread parent bears on this claim (#307).
  const unreadLine = `${unreadParents} unread candidate parent(s)`;
  const blocking = blockers.filter((b) => b !== unreadLine || unreadBlocking > 0);
  if (blocking.length === 0) return decide("ORIGIN_FOUND", 5, [`earliest page ${origin!.id} is a ${origin!.pageType!.optionId} with a confirmed date`]);
  // T37: where the trail ends, when code can say so, goes first among the reasons.
  const boundary = findBoundary(trace, rules);
  return decide("TRAIL_GOES_COLD", 6, boundary ? [BOUNDARY_REASONS[boundary], ...blockers] : blockers);
}
