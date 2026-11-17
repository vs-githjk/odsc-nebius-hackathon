import type { Trace } from "pz/schema";
import { endingSentence } from "./ending.ts";

// The six rows of the stop-state table (decide.ts), in plain words for the rule sheet. Checked in order; the first
// row that holds decides how the trace ends.
export const RULES: { row: Trace["decision"]["row"]; text: string }[] = [
  { row: 1, text: "A search service failed, so the trace stops where it got to." },
  { row: 2, text: "The search hit a credit, time, step or page limit before it finished." },
  { row: 3, text: "No page stated the claim, apart from pages that discuss it as a claim." },
  { row: 4, text: "The earliest pages give the claim different numbers, beyond rounding or percent." },
  { row: 5, text: "The earliest page is a primary source with a confirmed date, it cites nothing earlier, and two more searches found nothing older." },
  { row: 6, text: "None of the rows above held, so the trace stops without naming an origin." },
];

const TITLES: Record<Trace["decision"]["state"], string> = {
  TOOL_FAILED: "A search service failed",
  PARTIAL: "Stopped at a limit",
  NO_PAGES_FOUND: "No pages found",
  CONFLICTING: "The earliest pages disagree",
  ORIGIN_FOUND: "Origin found",
  TRAIL_GOES_COLD: "The trail goes cold",
};

const TONES: Record<Trace["decision"]["state"], "found" | "cold" | "caution"> = {
  TOOL_FAILED: "caution",
  PARTIAL: "caution",
  NO_PAGES_FOUND: "cold",
  CONFLICTING: "caution",
  ORIGIN_FOUND: "found",
  TRAIL_GOES_COLD: "cold",
};

const monthYear = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
export const month = (iso: string) => monthYear.format(new Date(iso));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export type StopCard = {
  title: string;
  sentence: string;
  searched: string;
  ruleRow: Trace["decision"]["row"];
  rules: { row: Trace["decision"]["row"]; text: string; decided: boolean }[];
  tone: "found" | "cold" | "caution";
  origin: { domain: string; when: string; quote: string; url: string } | null;
};

// The one card a trace ends on: what happened, what was searched, and the rule that decided, all from stored data.
export function stopCard(trace: Trace): StopCard {
  const searches = trace.searchLog.filter((s) => s.step !== "follow");
  const dates = searches.map((s) => s.endDate).filter((d): d is string => d !== null).sort();
  const reach = searches.length === 0
    ? "No search finished."
    : `${plural(searches.length, "search", "searches")}, ${dates[0] ? `back to before ${month(dates[0])}` : "with no date limit"}.`;
  const searched = `${reach} ${plural(trace.nodes.length, "page", "pages")} read.`;

  let origin: StopCard["origin"] = null;
  if (trace.decision.state === "ORIGIN_FOUND") {
    const node = trace.nodes.find((n) => trace.earliest.nodeIds.includes(n.id));
    const span = node && trace.spans.find((s) => s.id === node.spanIds[0]);
    if (node && span) origin = { domain: node.domain, when: node.date.value ? month(node.date.value) : "Undated", quote: span.text, url: node.url };
  }

  return {
    title: TITLES[trace.decision.state],
    sentence: endingSentence(trace),
    searched,
    ruleRow: trace.decision.row,
    rules: RULES.map((r) => ({ ...r, decided: r.row === trace.decision.row })),
    tone: TONES[trace.decision.state],
    origin,
  };
}
