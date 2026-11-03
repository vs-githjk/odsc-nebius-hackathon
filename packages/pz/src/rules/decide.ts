import type { Decision, Node, Trace, TypedAnswer } from "../schema/index.ts";
import { normalise } from "./normalise.ts";
import { parseNumbers, sameNumber, type ParsedNumber } from "./numbers.ts";
import type { Rules } from "./rules.ts";

// A typed answer counts only if it is not "unsure" and, once a threshold is frozen, clears it.
function confident(answer: TypedAnswer | null, rules: Rules): answer is TypedAnswer {
  if (!answer || answer.optionId === "unsure") return false;
  return rules.confidenceThreshold === null || (answer.probability ?? 0) >= rules.confidenceThreshold;
}

// Numbers each earliest-cluster page gives for the claim's subject (spans that name the subject lemma).
function subjectNumbers(trace: Trace, node: Node): ParsedNumber[] {
  const lemma = normalise(trace.claim.atoms.subjectLemma).toLowerCase();
  return trace.spans
    .filter((s) => s.nodeId === node.id && normalise(s.text).toLowerCase().includes(lemma))
    .flatMap((s) => parseNumbers(s.text).numbers);
}

function conflicting(trace: Trace, pages: Node[]): boolean {
  const earliestClusters = new Set(pages.filter((n) => trace.earliest.nodeIds.includes(n.id)).map((n) => n.clusterId));
  const sets = pages.filter((n) => earliestClusters.has(n.clusterId)).map((n) => subjectNumbers(trace, n)).filter((s) => s.length > 0);
  return sets.some((a, i) => sets.slice(i + 1).some((b) => !a.some((x) => b.some((y) => sameNumber(x, y).equal))));
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
  if (conflicting(trace, pages)) return decide("CONFLICTING", 4, ["earliest cluster gives different numbers beyond every transform"]);

  const origin = pages.find((n) =>
    trace.earliest.nodeIds.includes(n.id) && confident(n.pageType, rules) && rules.primaryPageTypes.includes(n.pageType.optionId)
    && n.date.kind !== "unconfirmed" && !n.citesEarlier);
  const blockers = [
    !origin && "no earliest page with a confirmed date, a primary page type and no earlier citation",
    unreadParents > 0 && `${unreadParents} unread candidate parent(s)`,
    trace.earliest.earlierWindowSearches < rules.earlierWindowSearches && `fewer than ${rules.earlierWindowSearches} earlier-window searches`,
    trace.earliest.earlierFound > 0 && "earlier-window searches found earlier pages",
  ].filter((b): b is string => typeof b === "string");
  if (blockers.length === 0) return decide("ORIGIN_FOUND", 5, [`earliest page ${origin!.id} is a ${origin!.pageType!.optionId} with a confirmed date`]);
  return decide("TRAIL_GOES_COLD", 6, blockers);
}
