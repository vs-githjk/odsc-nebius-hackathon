import type { Decision, Node, Trace, TypedAnswer } from "../schema/index.ts";
import { isNegated } from "./negation.ts";
import { normalise } from "./normalise.ts";
import { claimHit } from "./claim-hit.ts";
import { atomHit, parseNumbers, sameNumber } from "./numbers.ts";
import type { Rules } from "./rules.ts";

// A typed answer counts only if it is not "unsure" and, once a threshold is frozen, clears it.
function confident(answer: TypedAnswer | null, rules: Rules): answer is TypedAnswer {
  if (!answer || answer.optionId === "unsure") return false;
  return rules.confidenceThreshold === null || (answer.probability ?? 0) >= rules.confidenceThreshold;
}

// T36: a same_claim "yes" counts only with a known confidence that clears the threshold. Absent, null ("no_model"),
// "no", "unsure" and a "yes" whose confidence could not be read all block an origin.
function confidentYes(answer: TypedAnswer | null | undefined, rules: Rules): boolean {
  return !!answer && answer.optionId === "yes" && answer.probability !== null && confident(answer, rules);
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

  const candidates = pages.filter((n) =>
    trace.earliest.nodeIds.includes(n.id) && confident(n.pageType, rules) && rules.primaryPageTypes.includes(n.pageType.optionId)
    && n.date.kind !== "unconfirmed" && !n.citesEarlier
    && !trace.spans.some((s) => s.nodeId === n.id && isNegated(s, rules.negationPrefixes)));
  // T36 same-claim check: a span on the page carries the claim's atoms (code) and the typed same_claim says yes.
  const statesClaim = (n: Node) => confidentYes(n.sameClaim, rules) && secondAgrees(n, rules)
    && trace.spans.some((s) => s.nodeId === n.id && claimHit(s.text, trace.claim.atoms, rules));
  const origin = candidates.find(statesClaim);
  // The gate's reasons appear only when the gate is what blocks: some earliest page passes every other check.
  const notAsked = candidates.filter((n) => !n.sameClaim).length;
  // T79: pages the first model says yes on that the second model does not.
  const vetoed = candidates.filter((n) => confidentYes(n.sameClaim, rules) && !secondAgrees(n, rules)).length;
  const blockers = [
    candidates.length === 0 && "no earliest page with a confirmed date, a primary page type, no earlier citation and no negated span",
    candidates.length > 0 && !origin && (notAsked > 0
      ? `same_claim not asked on ${notAsked} earliest page(s) (no model), which counts as unsure`
      : vetoed > 0
        ? `the second model (${rules.secondSameClaimModel}) did not say yes on same_claim for ${vetoed} earliest page(s), which counts as unsure`
        : "no earliest page states the same claim: the claim's atoms in a span and a confident same_claim yes"),
    unreadParents > 0 && `${unreadParents} unread candidate parent(s)`,
    trace.earliest.earlierWindowSearches < rules.earlierWindowSearches && `fewer than ${rules.earlierWindowSearches} earlier-window searches`,
    trace.earliest.earlierFound > 0 && "earlier-window searches found earlier pages",
  ].filter((b): b is string => typeof b === "string");
  if (blockers.length === 0) return decide("ORIGIN_FOUND", 5, [`earliest page ${origin!.id} is a ${origin!.pageType!.optionId} with a confirmed date`]);
  return decide("TRAIL_GOES_COLD", 6, blockers);
}
