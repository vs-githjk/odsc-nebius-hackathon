import { datePhrase, type Node, type Trace } from "../schema/index.ts";
import { menuLike } from "../engine/walk.ts";
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

// The team records on US Eastern time; a 22:02 ET run is "Nov 17 ET", not the UTC day after (XO on #235).
const recordedDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

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
  tokenfactory: "Token Factory", tavily: "Tavily", wayback: "Wayback", fetch: "page fetch", jev: "Jev", ncbi: "NCBI", crossref: "Crossref",
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
      // T37: a boundary code found comes first, worded from the reason code wrote, never from a model.
      const boundary = trace.decision.reasons[0]?.match(/^boundary (print|unsourced|circular):/)?.[1];
      if (boundary === "print") return "The trail ends at a print source the earliest page credits. There is no web copy to open.";
      if (boundary === "unsourced") return "The earliest page is one anyone can edit, and it gives no source for the claim.";
      if (boundary === "circular") return "The earliest pages only cite each other or later copies, so there is nothing earlier to follow.";
      if (trace.nodes.some((n) => n.candidateParents.some((p) => !p.read))) return "A page it cites could not be opened.";
      // 2 is rules.json earlierWindowSearches: fewer empty earlier searches than that is a stop before looking far enough.
      if (trace.earliest.earlierWindowSearches < 2) return "It stopped before searching further back.";
      return "No earlier page and no primary source turned up.";
    }
  }
}

// A page's date in words, saying where it came from and how far to trust it: the page's own claim of when it was
// published, a scholarly registry's record, or only the first time an archive saw the page.
const REGISTRY = { registry_pubmed: "PubMed", registry_pmc: "PubMed Central", registry_crossref: "Crossref" } as const;
export function dateWords(node: Node): string {
  const d = node.date;
  if (d.kind === "unconfirmed" || !d.value) return "date not confirmed";
  const day = datePhrase(d.value, d.precision);
  const disagree = d.conflictingDate ? ", other dates disagree" : "";
  if (d.kind === "published" && d.source === "metadata") return `page says published ${day}${d.conflictingDate ? " (other dates disagree)" : ""}`;
  if (d.kind === "published" && d.source in REGISTRY) return `published ${day} (${REGISTRY[d.source as keyof typeof REGISTRY]}${disagree})`;
  const from = { metadata: "page metadata", byline: "byline", wayback_first_capture: "first archive capture", tavily: "search result", ...REGISTRY }[d.source];
  const what = d.kind === "published" ? `published ${day}` : `online by ${day}`;
  return `${what} (${from}${disagree})`;
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
  // A replay says when its recording was made (XO on #235): the card is not today's search.
  const note = trace.mode === "REPLAY" ? `${MODE_NOTE.REPLAY}, recorded ${recordedDay.format(new Date(trace.recordedAt))} ET` : MODE_NOTE[trace.mode];
  out.push(`${s.bold("Patient Zero")}  ${badge} ${s.dim(note)}`);
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

  const all = trace.earliest.nodeIds.map((id) => trace.nodes.find((n) => n.id === id)).filter((n): n is Node => !!n);
  // One earliest page in full, preferring one whose sentence is not menu or page furniture; the others on the same date
  // are named on one line (XO on #235: dev-11's Fortune nav row). CONFLICTING shows every earliest page, because the
  // disagreement between them is the point.
  const spanOf = (n: Node) => trace.spans.find((sp) => sp.nodeId === n.id)?.text ?? "";
  const ordered = [...all].sort((a, b) => Number(menuLike(spanOf(a))) - Number(menuLike(spanOf(b))));
  const earliest = trace.decision.state === "CONFLICTING" ? all : ordered.slice(0, 1);
  const sameDate = trace.decision.state === "CONFLICTING" ? [] : ordered.slice(1);
  out.push("");
  if (!earliest.length) field("Earliest", "No page to show.");
  earliest.forEach((node, i) => {
    field(i ? "" : "Earliest", node.title || node.domain, s.bold);
    const type = node.pageType ? `, ${PAGE_TYPES[node.pageType.optionId] ?? node.pageType.optionId}` : "";
    more(`${node.domain}${type}, ${dateWords(node)}`);
    const span = trace.spans.find((sp) => sp.nodeId === node.id);
    if (span) more(`"${span.text}"`);
    // T49: say when a fact-check page pointed the way. It is a map; the page above stands on its own sentence.
    if (node.foundViaMeta) more(`Found through ${new URL(node.foundViaMeta).hostname.replace(/^www\./, "")}, a page about the claim; that page is a map, never the origin.`, s.dim);
    more(node.url, s.dim);
    if (i < earliest.length - 1) out.push("");
  });
  if (sameDate.length) more(`Also earliest, same date: ${sameDate.map((n) => n.domain).join(", ")}.`, s.dim);

  out.push("");
  const r = trace.roots;
  field("Roots", r.pages
    ? `${plural(r.pages, "page")} read, in ${plural(r.clusters, "group")} of copies. Traced to ${plural(r.rootsLinked, "root")} we could link (${plural(r.clustersUnlinked, "cluster")} unlinked).`
    : "No pages read.");

  // T97: pages with a similar sentence that uses another number, worded from the fields only. Never "became": which
  // number came first is the dates' job, and on E3 only 0.37 of these hits were the same claim (eval/drift/README.md),
  // so each is shown as a possible variant (Vidyut, Nov 17). The label is wider than the column, so it gets its own line.
  // E3 check of otherNumberSimilarity 0.75 (eval/drift/README.md): 14 of 38 hits were the same claim.
  const E3_VARIANT_PRECISION = "0.37";
  const others = trace.otherNumbers ?? [];
  if (others.length) {
    out.push("");
    const claimNumber = trace.claim.atoms.number?.raw ?? "";
    out.push(`${s.bold("Possible variant")} ${s.dim(`(right about 1 in 3 times on held-apart claims, E3 precision ${E3_VARIANT_PRECISION})`)}`);
    others.slice(0, 2).forEach((o) => more(`A similar sentence on ${o.domain}${o.date ? ` (${o.date})` : ""} uses ${o.number}, not ${claimNumber}: "${o.sentence}"`));
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
