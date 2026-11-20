import { datePhrase, type Node, type Span, type Trace } from "pz/schema";
import { hopInto, type Chip } from "./hop.ts";
import type { Stop } from "./scrubber.ts";

export function dateEvidence(node: Node, span?: Span, short = false): { label: string; url: string | null } {
  const date = node.date;
  if (!date.value) return { label: "Undated", url: null };
  const sources: Record<Node["date"]["source"], string> = {
    metadata: "the page's own metadata", byline: "the page's byline",
    wayback_first_capture: "the first Wayback Machine capture",
    tavily: "the search result", registry_pubmed: "PubMed", registry_pmc: "PubMed Central", registry_crossref: "Crossref",
  };
  const qualifier = date.kind === "unconfirmed" ? "Unconfirmed date from" : "Dated by";
  const archive = date.source === "wayback_first_capture";
  // A day alone is not a capture timestamp. Never manufacture a target from it.
  const storedUrl = span?.waybackUrl;
  const captureUrl = storedUrl && /^https:\/\/web\.archive\.org\/web\/\d{14}(?:[a-z_]+)?\//.test(storedUrl) ? storedUrl : null;
  const timestamp = date.firstCapture && /^\d{14}$/.test(date.firstCapture) ? date.firstCapture : null;
  const url = archive ? captureUrl ?? (timestamp ? `https://web.archive.org/web/${timestamp}/${node.url}` : null) : null;
  const caveat = date.conflictingDate ? " Date evidence conflicts." : "";
  if (short) {
    const labels: Record<Node["date"]["source"], string> = {
      metadata: "Dated by the page's own metadata", byline: "Dated by the page's byline",
      wayback_first_capture: "Online by this date: first Wayback Machine capture",
      tavily: "Date from the search result", registry_pubmed: "Dated by PubMed", registry_pmc: "Dated by PubMed Central", registry_crossref: "Dated by Crossref",
    };
    return { label: `${labels[date.source]}${date.kind === "unconfirmed" ? " (unconfirmed)" : ""}${caveat}`, url };
  }
  return { label: `${qualifier} ${sources[date.source]}, ${datePhrase(date.value, date.precision)}.${archive ? " Archived by this date; publication date is not established." : ""}${caveat}`, url };
}

export type ReceiptChange = { text: string; earlierWords: string; laterWords: string; chips: Chip[] };
export function whatChanged(trace: Trace, stops: Stop[], index: number): ReceiptChange {
  const empty = { earlierWords: "", laterWords: "", chips: [] };
  if (index === 0) return { ...empty, text: "This is the latest page in the walk. Step back to compare it with an earlier page." };
  const current = stops[index];
  const later = stops[index - 1];
  const edge = trace.edges.find(e => e.id === current?.edgeId && e.parentSpanId === current.spanId && e.childSpanId === later?.spanId);
  if (!edge) return { ...empty, text: "No recorded hop connects this page to the later stop." };
  const hop = trace.hops.find(h => h.edgeId === edge.id);
  if (!hop) return { ...empty, text: "No wording comparison was recorded for this hop." };
  const earlierWords = hop.wordDiff.filter(w => w.op === "del").map(w => w.text).join(" ");
  const laterWords = hop.wordDiff.filter(w => w.op === "add").map(w => w.text).join(" ");
  const chips = hopInto(trace, stops, index - 1)?.chips ?? [];
  const text = earlierWords || laterWords ? "Wording differs from the later page." : hop.wordDiff.length ? "The recorded wording is unchanged." : "No word difference was recorded.";
  return { text: `${text}${edge.kind === "inferred" ? " The connection is inferred by date; no link was found." : " The later page links to this page."}`, earlierWords, laterWords, chips };
}

// Candidates outside the walk do not prove a change between linked pages.
export function possibleVariants(trace: Trace) {
  return (trace.otherNumbers ?? []).map(other => ({ url: other.url, sentence: other.sentence, label: `Possible variant on ${other.domain}: ${other.number}` }));
}
