import type { Node, Trace } from "../schema/index.ts";
import { independenceLine } from "./headline.ts";

// T77: one readable screen for `pz trace` and `make replay`, built only from the trace's own fields.
// The raw trace stays one flag away (--json). Nothing here calls a model or the network.

const WIDTH = 78;
const LABEL = 9;

const STATE_WORDS: Record<Trace["decision"]["state"], string> = {
  ORIGIN_FOUND: "Origin found",
  CONFLICTING: "Conflicting earliest pages",
  TRAIL_GOES_COLD: "Trail goes cold",
  PARTIAL: "Stopped early",
  TOOL_FAILED: "A tool failed",
  NO_PAGES_FOUND: "No pages found",
};

const CAPS: Record<NonNullable<Trace["budget"]["capHit"]>, string> = {
  credits: "credit cap", usd: "spending cap", ms: "time limit", depth: "step limit", frontier: "page limit",
};

const MODE_NOTE: Record<Trace["mode"], string> = {
  LIVE: "recorded from live calls",
  REPLAY: "replayed from a recording, no network calls",
  SAMPLE: "an invented example, not a real search",
};

const PAGE_TYPES: Record<string, string> = {
  study: "study", dataset: "dataset", report: "report", speaker: "a person's own words", news: "news article",
  blog: "blog post", social: "social post", other: "other page",
};

const SERVICES: Record<Trace["usage"][number]["service"], string> = {
  tokenfactory: "Token Factory", tavily: "Tavily", wayback: "Wayback", fetch: "page fetch", jev: "Jev",
};

// How a trace ended, as one plain sentence. Built from the trace's own data, never from decision reason strings,
// which carry ids and codes. Same wording as the web app's first screen (apps/web/src/model/ending.ts).
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

// A page's date in words, saying where it came from.
export function dateWords(node: Node): string {
  const d = node.date;
  if (d.kind === "unconfirmed" || !d.value) return "date not confirmed";
  const from = { metadata: "page metadata", byline: "byline", wayback_first_capture: "first archive capture", tavily: "search result" }[d.source];
  const what = d.kind === "published" ? `published ${d.value}` : `online by ${d.value}`;
  return `${what} (${from}${d.conflictingDate ? ", other dates disagree" : ""})`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function money(usd: number): string {
  return usd > 0 && usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

// Word-wraps text to the card width, with every line after the first indented under the label.
function wrap(text: string, indent: number, width = WIDTH): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && indent + line.length + 1 + word.length > width) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

type Style = { bold(s: string): string; dim(s: string): string; tone(s: string, tone: "good" | "warn" | "bad" | "info"): string };
const PLAIN: Style = { bold: (s) => s, dim: (s) => s, tone: (s) => s };
const ANSI: Style = {
  bold: (s) => `\u001b[1m${s}\u001b[22m`,
  dim: (s) => `\u001b[2m${s}\u001b[22m`,
  tone: (s, tone) => `\u001b[${{ good: 32, warn: 33, bad: 31, info: 36 }[tone]}m${s}\u001b[39m`,
};
const TONE: Record<Trace["decision"]["state"], "good" | "warn" | "bad"> = {
  ORIGIN_FOUND: "good", CONFLICTING: "warn", TRAIL_GOES_COLD: "warn", PARTIAL: "warn", TOOL_FAILED: "bad", NO_PAGES_FOUND: "bad",
};

// The card as text. `color` adds ANSI styling for a terminal; tests and pipes get plain text.
export function renderCard(trace: Trace, { color = false }: { color?: boolean } = {}): string {
  const s = color ? ANSI : PLAIN;
  const out: string[] = [];
  const pad = " ".repeat(LABEL);
  const field = (label: string, text: string, style: (x: string) => string = (x) => x) => {
    wrap(text, LABEL).forEach((l, i) => out.push(`${i ? pad : s.bold(label.padEnd(LABEL))}${style(l)}`));
  };
  const more = (text: string, style: (x: string) => string = (x) => x) => wrap(text, LABEL).forEach((l) => out.push(pad + style(l)));

  const badge = trace.mode === "SAMPLE" ? s.tone(trace.mode, "warn") : s.tone(trace.mode, trace.mode === "LIVE" ? "good" : "info");
  out.push(`${s.bold("Patient Zero")}  ${badge} ${s.dim(MODE_NOTE[trace.mode])}`);
  out.push("");
  // T94: the independence count leads the card.
  for (const l of wrap(independenceLine(trace), 0)) out.push(s.bold(l));
  out.push("");
  field("Claim", trace.claim.text);
  out.push("");
  field("Ending", STATE_WORDS[trace.decision.state], (x) => s.bold(s.tone(x, TONE[trace.decision.state])));
  more(endingSentence(trace));
  more(`Decision table row ${trace.decision.row} of 6.`, s.dim);
  if (trace.failure) {
    const f = trace.failure;
    more(`${SERVICES[f.service as keyof typeof SERVICES] ?? f.service} ${f.endpoint} returned ${f.status}. Kept: ${f.kept}.`);
  }

  const earliest = trace.earliest.nodeIds.map((id) => trace.nodes.find((n) => n.id === id)).filter((n): n is Node => !!n);
  out.push("");
  if (!earliest.length) field("Earliest", "No page to show.");
  earliest.forEach((node, i) => {
    field(i ? "" : "Earliest", node.title || node.domain, s.bold);
    const type = node.pageType ? `, ${PAGE_TYPES[node.pageType.optionId] ?? node.pageType.optionId}` : "";
    more(`${node.domain}${type}, ${dateWords(node)}`);
    const span = trace.spans.find((sp) => sp.nodeId === node.id);
    if (span) more(`"${span.text}"`);
    more(node.url, s.dim);
    if (i < earliest.length - 1) out.push("");
  });

  out.push("");
  const r = trace.roots;
  field("Roots", r.pages
    ? `${plural(r.pages, "page")} read, in ${plural(r.clusters, "group")} of copies. Traced to ${plural(r.rootsLinked, "root")} we could link (${plural(r.clustersUnlinked, "cluster")} unlinked).`
    : "No pages read.");

  // T97: pages that state the claim with another number, worded from the fields only. "Instead of", not "became":
  // which number came first is the dates' job, and a page with another number may be the earlier one.
  const others = trace.otherNumbers ?? [];
  if (others.length) {
    out.push("");
    const claimNumber = trace.claim.atoms.number?.raw ?? "";
    others.slice(0, 2).forEach((o, i) => field(i ? "" : "Numbers", `${o.number} instead of ${claimNumber} on ${o.domain}${o.date ? ` (${o.date})` : ""}: "${o.sentence}"`));
    if (others.length > 2) more(`and ${others.length - 2} more page${others.length - 2 === 1 ? "" : "s"} with another number`, s.dim);
  }

  out.push("");
  field("Cost", `${plural(trace.budget.credits, "credit")}, ${money(trace.budget.usd)}, ${Math.round(trace.budget.ms / 1000)} s`);
  const calls = new Map<string, number>();
  for (const u of trace.usage) if (!u.cacheHit) calls.set(SERVICES[u.service], (calls.get(SERVICES[u.service]) ?? 0) + 1);
  if (calls.size) more([...calls].map(([name, n]) => `${name} ${plural(n, "call")}`).join(", "), s.dim);

  out.push("");
  if (trace.scopeNote) for (const l of wrap(trace.scopeNote, 0)) out.push(s.dim(l));
  out.push(s.dim("Raw trace: add --json (make replay ARGS=--json)."));
  return out.join("\n");
}
