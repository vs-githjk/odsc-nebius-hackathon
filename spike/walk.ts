import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Budget } from "../packages/pz/src/clients/budget.ts";
import { createBudget } from "../packages/pz/src/clients/budget.ts";
import { createFileCache } from "../packages/pz/src/clients/cache.ts";
import { ClientError } from "../packages/pz/src/clients/errors.ts";
import { createTavily } from "../packages/pz/src/clients/tavily.ts";
import { createWayback } from "../packages/pz/src/clients/wayback.ts";
import { findSpan } from "../packages/pz/src/match/verbatim.ts";
import { atomHit, decideStopState, loadRules, normalise, parseNumbers, sameNumber, type Rules } from "../packages/pz/src/rules/index.ts";
import { Trace, type Atoms, type Cluster, type DateInfo, type Edge, type Hop, type Node, type Readout, type Span } from "../packages/pz/src/schema/index.ts";
import { createUsageLog, type UsageLog } from "../packages/pz/src/usage/log.ts";

export type SpikeClaim = { id: string; text: string; atoms: Atoms };
export type LogLine = { at: string; step: string; url?: string; query?: string; kept?: boolean; reason?: string };

type Deps = {
  tavily: ReturnType<typeof createTavily>;
  wayback: ReturnType<typeof createWayback>;
  usage: UsageLog;
  budget: Budget;
  rules: Rules;
  today: string;
  now: () => string;
  pagesDir: string;
  // The trace this run replays, when every call is served from the cache.
  replayOf?: Trace;
};

const CONTEXT_CHARS = 200;
const LINK_REACH_CHARS = 150;
const LINKS_PER_SPAN = 3;
const LINKS_PER_ROUND = 2;
const MAX_QUERIES = 3;
const MAX_SENTENCE_CHARS = 600;
const SCOPE_NOTE = "Web pages only; print and paywalled origins are out of scope. Earliest source we found, not proof of first use.";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const canonUrl = (url: string) => url.replace(/#.*$/, "").replace(/\/$/, "");
const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");
const dayBefore = (iso: string) => new Date(Date.parse(iso) - 86_400_000).toISOString().slice(0, 10);
// Tavily sends RFC dates; undated pages sort last.
const isoDate = (date: string | null) => (date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString().slice(0, 10) : "9999");

export function queriesFor(atoms: Atoms): string[] {
  const phrases = atoms.variants.length > 0 ? atoms.variants : [[atoms.number.raw, atoms.unit].filter(Boolean).join(" ")];
  return [...new Set(phrases.map((p) => `"${p}" ${atoms.subjectLemma}`))].slice(0, MAX_QUERIES);
}

// Markdown to the visible text, with where each link's words landed. Handles one level of parentheses in a url.
export function toPlain(markdown: string): { text: string; links: { href: string; start: number; end: number }[] } {
  // Headings end like sentences, and emphasis marks are not the page's words.
  const plainer = markdown.replace(/^#{1,6}[ \t]+(.*?)[ \t]*$/gm, (_, heading: string) => (/[.!?:]$/.test(heading) ? heading : `${heading}.`));
  const cleaned = normalise(plainer.replace(/\*\*|__/g, "")).replace(/!\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)\s*/g, "").replace(/\[\s*\]\((?:[^()]|\([^()]*\))*\)\s*/g, "");
  const links: { href: string; start: number; end: number }[] = [];
  let text = "";
  let last = 0;
  for (const m of cleaned.matchAll(/\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))*)(?:\s+"[^"]*")?\)/g)) {
    text += cleaned.slice(last, m.index);
    links.push({ href: m[2] ?? "", start: text.length, end: text.length + (m[1] ?? "").length });
    text += m[1] ?? "";
    last = m.index + m[0].length;
  }
  text += cleaned.slice(last);
  const stable = normalise(text);
  return stable === text ? { text, links } : { text: stable, links: [] };
}

function sentences(text: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  let start = 0;
  for (const m of text.matchAll(/(?<=[.!?]["')\]]?)\s+(?=["'(\[]?[\p{Lu}\d])/gu)) {
    out.push({ text: text.slice(start, m.index), start });
    start = m.index + m[0].length;
  }
  out.push({ text: text.slice(start), start });
  return out;
}

// A negation anywhere before the claim's number means the sentence does not assert it.
function assertsNumber(sentence: string, atoms: Atoms, prefixes: string[]): boolean {
  const target = parseNumbers(atoms.number.canonical).numbers[0];
  const hit = target && parseNumbers(sentence).numbers.find((n) => sameNumber(n, target).equal);
  if (!hit) return false;
  const before = sentence.slice(0, hit.start).toLowerCase();
  return !prefixes.some((p) => new RegExp(String.raw`(?<![\p{L}\p{N}])${p.toLowerCase()}(?![\p{L}\p{N}])`, "u").test(before));
}

function wordDiff(parent: string, child: string): Hop["wordDiff"] {
  const a = parent.split(" ");
  const b = child.split(" ");
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: Hop["wordDiff"] = [];
  const push = (op: "same" | "add" | "del", word: string) => {
    const tail = out.at(-1);
    if (tail?.op === op) tail.text += ` ${word}`;
    else out.push({ op, text: word });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push("same", a[i]!);
      i++;
      j++;
    } else if (j < b.length && (i === a.length || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) push("add", b[j++]!);
    else push("del", a[i++]!);
  }
  return out;
}

const COMPARISON = /(?<![\p{L}])(?:than|twice|compared|times as)(?![\p{L}])/iu;
const HEDGE = /(?<![\p{L}])(?:about|around|roughly|approximately|estimated|may|might|suggests?)(?![\p{L}])/iu;

function measuredReadouts(parent: string, child: string, atoms: Atoms): Readout[] {
  const measured = (id: Readout["id"], yes: boolean): Readout => ({ id, source: "measured", value: yes ? "yes" : "no", probability: null, disputed: false });
  const childNumbers = parseNumbers(child).numbers;
  const lostNumber = parseNumbers(parent).numbers.some((n) => !childNumbers.some((c) => sameNumber(n, c).equal));
  const unit = atoms.unit?.toLowerCase();
  return [
    measured("number_changed", lostNumber),
    measured("unit_changed", Boolean(unit && parent.toLowerCase().includes(unit) && !child.toLowerCase().includes(unit))),
    measured("hedge_dropped", HEDGE.test(parent) && !HEDGE.test(child)),
    measured("comparison_added", COMPARISON.test(child) && !COMPARISON.test(parent)),
  ];
}

export async function walkClaim(claim: SpikeClaim, deps: Deps): Promise<{ trace: Trace; log: LogLine[] }> {
  const { atoms } = claim;
  const { rules } = deps;
  const lemma = normalise(atoms.subjectLemma).toLowerCase();
  const started = Date.now();
  const log: LogLine[] = [];
  const nodes: Node[] = [];
  const spans: Span[] = [];
  const clusterKeys = new Map<string, string>();
  const nodeLinks = new Map<string, string[]>();
  const seen = new Set<string>();
  const searchLog: Trace["searchLog"] = [];
  let pendingLinks: string[] = [];
  let capHit: Trace["budget"]["capHit"] = null;
  let failure: Trace["failure"] = null;
  let earlierWindowSearches = 0;
  let earlierFound = 0;

  const note = (line: Omit<LogLine, "at">) => log.push({ at: deps.now(), ...line });
  const excluded = (url: string) => rules.factCheckDomains.some((d) => hostOf(url) === d || hostOf(url).endsWith(`.${d}`));
  const earliestDate = () => nodes.filter((n) => !n.meta && n.date.value).map((n) => n.date.value!).sort()[0] ?? null;

  async function dateFor(url: string, apiDate: string | null): Promise<{ date: DateInfo; waybackUrl: string | null }> {
    const api = apiDate && !Number.isNaN(Date.parse(apiDate)) ? new Date(apiDate).toISOString().slice(0, 10) : null;
    let firstCapture: string | null = null;
    let waybackUrl: string | null = null;
    try {
      const { data } = await deps.wayback.firstCapture(url);
      if (data.status === "found") {
        firstCapture = data.firstCapture;
        waybackUrl = `https://web.archive.org/web/${data.timestamp}/${url}`;
      }
    } catch (err) {
      // Wayback being down costs us the cap on a date, never the trace.
      if (!(err instanceof ClientError)) throw err;
      note({ step: "dating", url, reason: `wayback ${err.code}` });
    }
    if (firstCapture && (!api || firstCapture < api)) {
      return { waybackUrl, date: { kind: "existed_by", value: firstCapture, source: "wayback_first_capture", firstCapture, conflictingDate: api !== null } };
    }
    if (api) return { waybackUrl, date: { kind: "published", value: api, source: "tavily", firstCapture, conflictingDate: false } };
    return { waybackUrl, date: { kind: "unconfirmed", value: null, source: "tavily", firstCapture, conflictingDate: false } };
  }

  async function readPage(url: string, title: string, raw: string, apiDate: string | null): Promise<boolean> {
    const { text, links } = toPlain(raw);
    const sentence = sentences(text).find(
      (s) => s.text.length <= MAX_SENTENCE_CHARS && s.text.toLowerCase().includes(lemma) && atomHit(s.text, atoms, rules.weakNumberMinSigDigits) && assertsNumber(s.text, atoms, rules.negationPrefixes),
    );
    if (!sentence) {
      note({ step: "read", url, kept: false, reason: "no sentence asserts the claim's atoms" });
      return false;
    }
    const hit = findSpan(text, sentence.text, rules.negationPrefixes);
    if (!("start" in hit)) {
      note({ step: "read", url, kept: false, reason: `span ${hit.rejected}` });
      return false;
    }
    const id = `n${nodes.length + 1}`;
    const contextBefore = text.slice(Math.max(0, hit.start - CONTEXT_CHARS), hit.start);
    const contextAfter = text.slice(hit.end, hit.end + CONTEXT_CHARS);
    const { date, waybackUrl } = await dateFor(url, apiDate);
    const spanId = `s${spans.length + 1}`;
    spans.push({
      id: spanId, nodeId: id, text: sentence.text, contextBefore, contextAfter, start: hit.start, end: hit.end,
      extractSha256: sha256(text), windowSha256: sha256(contextBefore + sentence.text + contextAfter),
      fetchedAt: deps.now(), waybackUrl, tier: hit.tier,
    });
    const dir = join(deps.pagesDir, claim.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${id}.txt`), text);

    const haystack = `${title} ${sentence.text}`.toLowerCase();
    const meta = rules.metaKeywords.some((k) => haystack.includes(k));
    const nearby = links
      .filter((l) => l.end >= hit.start - LINK_REACH_CHARS && l.start <= hit.end + LINK_REACH_CHARS)
      .flatMap((l) => {
        try {
          const target = new URL(l.href, url);
          return target.protocol.startsWith("http") ? [canonUrl(target.href)] : [];
        } catch {
          return [];
        }
      })
      .filter((u) => hostOf(u) !== hostOf(url) && !excluded(u));
    const parents = [...new Set(nearby)].slice(0, LINKS_PER_SPAN);
    nodeLinks.set(id, parents);

    const clusterKey = `${normalise(title).toLowerCase()}|${sentence.text.toLowerCase()}`;
    if (!clusterKeys.has(clusterKey)) clusterKeys.set(clusterKey, `c${clusterKeys.size + 1}`);
    nodes.push({
      id, url, domain: hostOf(url), title, date, clusterId: clusterKeys.get(clusterKey)!,
      evidence: "observed", meta, read: true, versionOf: null, spanIds: [spanId], citesEarlier: parents.length > 0,
      candidateParents: parents.map((p) => ({ url: p, read: seen.has(p) })), pageType: null,
    });
    if (!meta) pendingLinks.push(...parents.filter((p) => !seen.has(p)));
    note({ step: "read", url, kept: true, reason: meta ? "meta page, off the path" : "span found" });
    return !meta;
  }

  const outOfTime = () => Date.now() - started >= rules.caps.ms;

  try {
    let endDate = deps.today;
    const queries = queriesFor(atoms);
    for (let depth = 0; ; depth++) {
      if (outOfTime()) {
        capHit = "ms";
        break;
      }
      const results = new Map<string, { title: string; date: string | null }>();
      earlierWindowSearches = 0;
      const searches = queries.map((query) => ({ query, filter: false }));
      // Two searches per window at least, so "nothing earlier" never rests on one call.
      while (searches.length < rules.earlierWindowSearches) searches.push({ query: queries[0]!, filter: true });
      for (const { query, filter } of searches) {
        const { data } = await deps.tavily.search({
          query, exactMatch: true, endDate, includeRawContent: false, includePublishedDate: true, maxResults: 10,
          excludeDomains: rules.factCheckDomains, ...(filter && { filterByPublishedDate: true }),
        }, { step: "search" });
        earlierWindowSearches += 1;
        const fresh = data.results.filter((r) => !seen.has(canonUrl(r.url)) && !excluded(r.url));
        for (const r of fresh) {
          results.set(canonUrl(r.url), { title: r.title ?? "", date: r.published_date ?? null });
        }
        searchLog.push({ at: deps.now(), step: "search", query, endDate, startDate: null, results: data.results.length, kept: fresh.length, dropped: data.results.length - fresh.length });
        note({ step: "search", query, reason: `end_date ${endDate}${filter ? ", filtered" : ""}, ${data.results.length} results` });
      }

      // Links beside a span go first: they are the page's own citation of its parent.
      const links = [...new Set(pendingLinks.filter((u) => !seen.has(u)))].slice(0, LINKS_PER_ROUND);
      pendingLinks = pendingLinks.filter((u) => !seen.has(u) && !links.includes(u));
      const dated = [...results.entries()].sort(([ua, a], [ub, b]) => isoDate(a.date).localeCompare(isoDate(b.date)) || ua.localeCompare(ub));
      const fromSearch = dated.map(([u]) => u).filter((u) => !links.includes(u));
      const frontier = [...new Set([...links, ...fromSearch])].slice(0, rules.caps.frontier);
      const earliestBefore = earliestDate();
      let found = 0;

      if (frontier.length > 0) {
        const { data } = await deps.tavily.extract({ urls: frontier, format: "markdown" }, { step: "extract" });
        for (const u of frontier) seen.add(u);
        for (const failed of data.failed_results ?? []) note({ step: "extract", url: failed.url, kept: false, reason: "extract failed, unread" });
        const read = new Set<string>();
        for (const page of data.results) {
          const u = canonUrl(page.url);
          read.add(u);
          const hit = results.get(u);
          const kept = await readPage(u, page.title ?? hit?.title ?? "", page.raw_content ?? "", hit?.date ?? null);
          if (kept) found += 1;
        }
        for (const n of nodes) n.candidateParents = n.candidateParents.map((p) => (read.has(p.url) ? { ...p, read: true } : p));
      }

      const earliestNow = earliestDate();
      const movedBack = earliestNow !== null && (earliestBefore === null || earliestNow < earliestBefore);
      earlierFound = movedBack ? found : 0;
      const moreLinks = pendingLinks.some((u) => !seen.has(u));
      if (!movedBack && !moreLinks) break;
      if (depth + 1 >= rules.caps.depth) {
        capHit = "depth";
        break;
      }
      if (earliestNow) endDate = dayBefore(earliestNow);
    }
  } catch (err) {
    if (!(err instanceof ClientError)) throw err;
    note({ step: "stop", reason: err.code });
    if (err.code === "budget_exceeded") capHit = "credits";
    else failure = { service: "tavily", endpoint: err.message.split(":")[0] ?? "", status: err.code, kept: `${nodes.length} pages read before the failure` };
  }

  // Edges run from each dated page to an earlier one: a link beside the span if it reaches one, else the nearest earlier cluster.
  const path = nodes.filter((n) => !n.meta && n.date.value).sort((a, b) => a.date.value!.localeCompare(b.date.value!));
  const edges: Edge[] = [];
  const hops: Hop[] = [];
  for (const child of path) {
    const earlier = path.filter((n) => n.date.value! < child.date.value!);
    const linked = (nodeLinks.get(child.id) ?? []).map((u) => earlier.find((n) => canonUrl(n.url) === u)).find(Boolean);
    const parent = linked ?? earlier.filter((n) => n.clusterId !== child.clusterId).at(-1);
    if (!parent) continue;
    const parentSpan = spans.find((s) => s.nodeId === parent.id)!;
    const childSpan = spans.find((s) => s.nodeId === child.id)!;
    const edge: Edge = {
      id: `e${edges.length + 1}`, parentId: parent.id, childId: child.id, kind: linked ? "explicit" : "inferred",
      parentSpanId: parentSpan.id, childSpanId: childSpan.id, linkHref: linked ? canonUrl(linked.url) : null,
    };
    edges.push(edge);
    const readouts = measuredReadouts(parentSpan.text, childSpan.text, atoms);
    hops.push({ edgeId: edge.id, readouts, wordDiff: wordDiff(parentSpan.text, childSpan.text), faithful: !readouts.some((r) => r.value === "yes") });
  }

  const clusters: Cluster[] = [...clusterKeys.values()].map((id) => {
    const nodeIds = nodes.filter((n) => n.clusterId === id).map((n) => n.id);
    return { id, nodeIds, rule: nodeIds.length > 1 ? "near_duplicate" : "single" };
  });
  const clusterOf = (nodeId: string) => nodes.find((n) => n.id === nodeId)?.clusterId;
  const explicit = edges.filter((e) => e.kind === "explicit");
  const pageClusters = new Set(nodes.filter((n) => !n.meta).map((n) => n.clusterId));
  const rootsLinked = [...pageClusters].filter(
    (c) => explicit.some((e) => clusterOf(e.parentId) === c) && !explicit.some((e) => clusterOf(e.childId) === c),
  ).length;
  const minDate = earliestDate();
  const usd = deps.usage.rows.reduce((sum, r) => sum + (r.service === "tokenfactory" ? r.costUsd : 0), 0);

  // A run whose paid calls all came from the cache is a replay: it carries the recorded run's date, budget and usage
  // rows, plus rows for any free calls made fresh (for example Wayback lookups after a change to the CDX query).
  const paid = deps.usage.rows.filter((r) => r.service === "tavily" || r.service === "tokenfactory");
  const replayed = paid.length > 0 && paid.every((r) => r.cacheHit);
  if (replayed && !deps.replayOf) {
    throw new Error(`${claim.id}: every paid call came from the cache, so this is a replay; pass the recorded trace with --replay-of`);
  }
  const recorded = replayed ? deps.replayOf! : null;
  const budget: Trace["budget"] = recorded
    ? { credits: recorded.budget.credits, usd: recorded.budget.usd, ms: recorded.budget.ms, capHit }
    : { credits: deps.usage.rows.reduce((sum, r) => sum + r.credits, 0), usd, ms: Date.now() - started, capHit };

  const draft: Trace = {
    schemaVersion: "1", id: claim.id, mode: recorded ? "REPLAY" : "LIVE", synthetic: false, recordedAt: recorded?.recordedAt ?? deps.now(),
    claim: { text: claim.text, atoms }, viralSentence: claim.text,
    nodes, edges, clusters, spans, hops, blame: [],
    roots: { pages: nodes.filter((n) => !n.meta).length, clusters: pageClusters.size, rootsLinked, clustersUnlinked: pageClusters.size - rootsLinked, studiesFound: null },
    redHopEdgeId: hops.find((h) => !h.faithful)?.edgeId ?? null,
    earliest: { nodeIds: nodes.filter((n) => !n.meta && minDate !== null && n.date.value === minDate).map((n) => n.id), earlierWindowSearches, earlierFound },
    failure,
    budget,
    decision: { state: "TRAIL_GOES_COLD", row: 6, reasons: [], counts: {} },
    searchLog, usage: recorded ? [...recorded.usage, ...deps.usage.rows.filter((r) => !r.cacheHit)] : deps.usage.rows, scopeNote: SCOPE_NOTE,
  };
  return { trace: { ...draft, decision: decideStopState(draft, rules) }, log };
}

async function main() {
  const at = process.argv.indexOf("--claim");
  const id = at >= 0 ? process.argv[at + 1] : undefined;
  const here = dirname(fileURLToPath(import.meta.url));
  const claims = JSON.parse(readFileSync(join(here, "claims.json"), "utf8")) as SpikeClaim[];
  const claim = claims.find((c) => c.id === id);
  if (!claim) {
    console.error(`usage: npx tsx spike/walk.ts --claim <${claims.map((c) => c.id).join("|")}> [--replay-of <recorded trace.json>]`);
    process.exit(2);
  }
  const replayAt = process.argv.indexOf("--replay-of");
  const replayOf = replayAt >= 0 ? Trace.parse(JSON.parse(readFileSync(process.argv[replayAt + 1] ?? "", "utf8"))) : undefined;
  if (existsSync(".env")) process.loadEnvFile(".env");
  const rules = loadRules();
  const usage = createUsageLog();
  const budget = createBudget(rules.caps.credits);
  const shared = { usage, cache: createFileCache(), budget, traceId: claim.id };
  const { trace, log } = await walkClaim(claim, {
    tavily: createTavily(shared),
    wayback: createWayback(shared),
    usage,
    budget,
    rules,
    today: new Date().toISOString().slice(0, 10),
    now: () => new Date().toISOString(),
    pagesDir: ".cache/pages",
    replayOf,
  });
  mkdirSync(join(here, "traces"), { recursive: true });
  mkdirSync(join(here, "logs"), { recursive: true });
  writeFileSync(join(here, "traces", `${claim.id}.json`), JSON.stringify(trace, null, 2) + "\n");
  writeFileSync(join(here, "logs", `${claim.id}.jsonl`), log.map((l) => JSON.stringify(l)).join("\n") + "\n");
  console.log(`${claim.id}: ${trace.decision.state} row ${trace.decision.row}, ${trace.nodes.length} pages, ${trace.edges.length} edges, ${trace.budget.credits} credits, ${Math.round(trace.budget.ms / 1000)} s`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
