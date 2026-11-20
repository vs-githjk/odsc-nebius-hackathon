import type { Trace } from "pz/schema";
import { independenceLine } from "pz/headline";
import rulesJson from "../../../../packages/pz/rules/rules.json";
// decide.ts takes the rules as a plain object, so the browser can run its origin pick (rules.ts itself reads a file).
import { originPick } from "../../../../packages/pz/src/rules/decide.ts";
import type { Rules } from "../../../../packages/pz/src/rules/rules.ts";
import { endingSentence } from "./ending.ts";

// The six rows of the stop-state table (decide.ts), in plain words for the rule sheet. Checked in order; the first
// row that holds decides how the trace ends.
export const RULES: { row: Trace["decision"]["row"]; text: string }[] = [
  { row: 1, text: "A search service failed, so the trace stops where it got to." },
  { row: 2, text: "The search hit a credit, time, step or page limit before it finished." },
  { row: 3, text: "No page stated the claim, apart from pages that discuss it as a claim." },
  { row: 4, text: "The earliest pages give the claim different numbers, beyond rounding or percent." },
  {
    row: 5,
    text:
      "The earliest page is a primary source with a confirmed date, typed with confidence and at a document address (not a dated article or a list page). Its words carry the claim, and the model said with confidence that it states the same claim (and a second model agreed, when one is set). It cites nothing earlier, does not deny the claim and holds no instructions aimed at a model. No page cites a page that could not be read, except a fact-check about a different claim, and at least two searches further back found nothing older.",
  },
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

const rules = rulesJson as unknown as Rules;

const monthYear = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
// A year-only registry date reads "2020", never a month it does not know.
export const month = (iso: string, precision?: "day" | "month" | "year") => (precision === "year" ? iso.slice(0, 4) : monthYear.format(new Date(iso)));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export type StopCard = {
  title: string;
  sentence: string;
  count: string; // T94: pages, independent roots and copies, from pz/headline
  searched: string;
  ruleRow: Trace["decision"]["row"];
  rules: { row: Trace["decision"]["row"]; text: string; decided: boolean }[];
  tone: "found" | "cold" | "caution";
  origin: { domain: string; when: string; quote: string; url: string } | null;
};

// The one card a trace ends on: what happened, what was searched, and the rule that decided, all from stored data.
export function stopCard(trace: Trace): StopCard {
  // Every entry is a search except a followed citation and a model fallback note (#110).
  const searches = trace.searchLog.filter((s) => s.step !== "follow" && s.step !== "model");
  const dates = searches.map((s) => s.endDate).filter((d): d is string => d !== null).sort();
  const reach = searches.length === 0
    ? "No search finished."
    : `${plural(searches.length, "search", "searches")}, ${dates[0] ? `back to before ${month(dates[0])}` : "with no date limit"}.`;
  // Pages that only discuss the claim are read but not counted in "Found on N pages", so the card says which they are.
  const discussing = trace.nodes.filter((n) => n.meta).length;
  const read = trace.nodes.length;
  const aside =
    discussing === 0 ? ""
    : discussing === read ? (read === 1 ? ", which only discusses the claim" : ", all of them only discussing the claim")
    : `, ${discussing} of them only discussing the claim`;
  const searched = `${reach} ${plural(trace.nodes.length, "page", "pages")} read${aside}.`;

  let origin: StopCard["origin"] = null;
  if (trace.decision.state === "ORIGIN_FOUND") {
    // The page row 5 picked and the span on it that states the claim, never just the first earliest page (XO on #180).
    const pick = originPick(trace, rules);
    if (pick) origin = { domain: pick.node.domain, when: pick.node.date.value ? month(pick.node.date.value, pick.node.date.precision) : "Undated", quote: pick.span.text, url: pick.node.url };
  }

  return {
    title: TITLES[trace.decision.state],
    sentence: endingSentence(trace),
    count: independenceLine(trace),
    searched,
    ruleRow: trace.decision.row,
    rules: RULES.map((r) => ({ ...r, decided: r.row === trace.decision.row })),
    tone: TONES[trace.decision.state],
    origin,
  };
}
