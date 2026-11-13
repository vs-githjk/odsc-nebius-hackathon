import type { Trace } from "pz/schema";

const CAPS: Record<NonNullable<Trace["budget"]["capHit"]>, string> = {
  credits: "credit cap",
  usd: "spending cap",
  ms: "time limit",
  depth: "step limit",
  frontier: "page limit",
};

// How a trace ended, as one plain sentence for the first screen. Built from the trace's own data, never from the
// decision's reason strings, which carry ids and codes.
export function endingSentence(trace: Trace): string {
  switch (trace.decision.state) {
    case "TOOL_FAILED":
      return "A search service failed partway through.";
    case "PARTIAL":
      return `The search hit its ${trace.budget.capHit ? CAPS[trace.budget.capHit] : "limit"} before it finished.`;
    case "NO_PAGES_FOUND":
      return "No page stated the claim, apart from pages discussing it as a claim.";
    case "CONFLICTING":
      return "The earliest pages give different numbers.";
    case "ORIGIN_FOUND":
      return "The earliest page is a primary source with a confirmed date.";
    case "TRAIL_GOES_COLD": {
      if (trace.nodes.some((n) => n.candidateParents.some((p) => !p.read))) return "A page it cites could not be opened.";
      // 2 is rules.json earlierWindowSearches: fewer empty earlier searches than that is a stop before looking far enough.
      if (trace.earliest.earlierWindowSearches < 2) return "It stopped before searching further back.";
      return "No earlier page and no primary source turned up.";
    }
  }
}
