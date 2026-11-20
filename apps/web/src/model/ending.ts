import type { Trace } from "pz/schema";

const CAPS: Record<NonNullable<Trace["budget"]["capHit"]>, string> = {
  credits: "credit cap",
  usd: "spending cap",
  ms: "time limit",
  depth: "step limit",
  frontier: "page limit",
};

// How a trace ended, as one plain sentence for the first screen. Built from the trace's own data, never from the
// raw decision strings: translate known reasons without exposing ids and codes.
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
      const reasons = trace.decision.reasons;
      // #307: a page dated earlier than the would-be origin was not ruled out, so no origin is named.
      if (reasons.some(r => r.startsWith("An earlier page on the trail was not ruled out"))) return "An earlier page on the trail was not ruled out, so no origin is named.";
      if (reasons.some(r => r.startsWith("boundary print:"))) return "The earliest page credits a print source, with no web copy to open.";
      if (reasons.some(r => r.startsWith("boundary unsourced:"))) return "The earliest page is editable and gives no source for the claim.";
      if (reasons.some(r => r.startsWith("boundary circular:"))) return "The earliest pages only cite each other or later pages.";
      if (trace.nodes.some((n) => n.candidateParents.some((p) => !p.read))) return "A page it cites could not be opened.";
      if (reasons.some(r => r.includes("presents the claim as already said"))) return "The earliest page presents the claim as something already said.";
      if (reasons.some(r => r.includes("cites an earlier source in words"))) return "The earliest page mentions an earlier source.";
      if (reasons.some(r => r.includes("same_claim") || r.includes("same claim"))) return "The earliest page could not be confirmed as stating the same claim.";
      if (reasons.some(r => r.includes("instruction-like text"))) return "Instructions aimed at a model prevent naming the earliest page as an origin.";
      // 2 is rules.json earlierWindowSearches: fewer empty earlier searches than that is a stop before looking far enough.
      if (trace.earliest.earlierWindowSearches < 2) return "It stopped before searching further back.";
      if (trace.earliest.earlierFound > 0) return "The searches found earlier pages, so the trail is not resolved.";
      return "The earliest page did not meet the checks needed to name an origin.";
    }
  }
}
