import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Budget } from "../clients/budget.ts";
import { ClientError } from "../clients/errors.ts";
import { TokenFactoryError } from "../clients/tokenfactory.ts";
import { createTavily } from "../clients/tavily.ts";
import { createWayback } from "../clients/wayback.ts";
import { findSpan } from "../match/verbatim.ts";
import { clusterNodes, computeRoots, type Embed } from "./cluster.ts";
import { findOtherNumber } from "./similar.ts";
import { atomHit, claimHit, confidentNo, confidentYes, decideStopState, findInjection, isRange, normalise, parseNumbers, sameNumber, type Rules } from "../rules/index.ts";
import type { Atoms, Cluster, DateInfo, Edge, Hop, Node, Readout, Span, Trace, UsageRow } from "../schema/index.ts";
import type { UsageLog } from "../usage/log.ts";
import { sameClaim, type SameClaimResult } from "../match/same-claim.ts";
import { citationsIn, namedSources, REACH } from "./citations.ts";
import { codeQuery, planQueries, queryKey, whyRejected, type SeenQuery } from "./queries.ts";

export type SpikeClaim = { id: string; text: string; atoms: Atoms };
export type LogLine = { at: string; step: string; url?: string; query?: string; kept?: boolean; reason?: string };

// The query planner's shape, T35's planQueries (#104, #129): queries for one hop. `seen` lists every query already sent
// with the endDate it was planned with, so a repeat is the same pair. The walker owns the window loop and sends the
// earlier of a query's endDate and its own window end.
export type PlannedQuery = { query: string; endDate: string | null; why: string };
export type QueryPlanner = (input: {
  claim: string;
  atoms: Atoms;
  hop: { url: string; date: string | null; span: string } | null;
  seen: SeenQuery[];
}) => Promise<{ queries: PlannedQuery[]; rejected: { query: string; reason: string }[]; usage: UsageRow[]; mode: "model" | "code_only" }>;

type ModelClient = Parameters<typeof planQueries>[1]["client"];

// T35's planner bound to a Token Factory client; with a null client it plans code-only queries.
export const plannerFor = (client: ModelClient, rules: Rules): QueryPlanner => (input) => planQueries(input, { client, rules });

// T36's same_claim question bound to a client, for the walker to ask on each page it reads (XO ruling on #106).
export const sameClaimFor = (client: ModelClient, rules: Rules) => (input: { claim: string; sentence: string; atoms: Atoms }) =>
  sameClaim(input, { client, rules });

// The code-only planner: the claim's variant phrases with its subject, as before T35. It ignores `seen` on purpose,
// because each window repeats these queries with an earlier end date.
// The code query comes first, as the planner's does: the number as the claim writes it and the claim's own subject
// word ("100" companies). queriesFor's variant queries follow; alone they gave dev-11 only "one hundred" compan when
// the planner failed on the Nov 17 live run, and it found no pages.
export const codePlanner: QueryPlanner = async ({ claim, atoms }) => ({
  queries: [...new Set([codeQuery(claim, atoms), ...queriesFor(atoms)])].map((query) => ({ query, endDate: null, why: "variant" as const })),
  rejected: [],
  usage: [],
  mode: "code_only",
});

export type WalkDeps = {
  // T35's planner (plannerFor); the code-only planner when absent.
  planQueries?: QueryPlanner;
  // T36's same_claim question (sameClaimFor); its typed answer is stored on each page read. Absent means not asked,
  // which decide treats as unsure, so no page can become the origin.
  askSameClaim?: (input: { claim: string; sentence: string; atoms: Atoms }) => Promise<SameClaimResult>;
  tavily: ReturnType<typeof createTavily>;
  wayback: ReturnType<typeof createWayback>;
  usage: UsageLog;
  budget: Budget;
  rules: Rules;
  today: string;
  now: () => string;
  // Milliseconds for the time cap; Date.now when absent. Tests pass a stub clock.
  clockMs?: () => number;
  pagesDir: string;
  // The trace this run replays, when every call is served from the cache.
  replayOf?: Trace;
  // "allow" lets a run whose paid calls all came from the cache finish as a normal run (the pipeline replays elsewhere).
  cachedRun?: "refuse" | "allow";
  // T97: Token Factory embeddings (createEmbedder). With it, reworded copies join one cluster and pages that state
  // the claim with another number are listed; without it, the walk is exactly as before.
  embed?: Embed;
};

const CONTEXT_CHARS = 200;
const LINKS_PER_SPAN = 3;
const LINKS_PER_ROUND = 3;
const SOURCE_QUERIES_PER_WINDOW = 2;
// F7 (#192): rounds in a row that only follow citations without reaching an earlier page. After this many the walk
// stops following and ends as it would with no links left: a cold trail, not a cap hit.
export const LINK_ROUNDS_WITHOUT_PROGRESS = 2;
// T49: fact-check pages read as maps per trace, and the citations taken from each.
const META_PAGES = 2;
const META_LINKS = 4;
const MAX_QUERIES = 3;
// One cap for split and fallback sentences (XO on #209): main's 600. The line split and menuLike now catch glued nav
// text, so the cap only has to stop a page section; a long real sentence (dev-13's, or one from a hard-wrapped PDF) stays.
export const MAX_SENTENCE_CHARS = 600;
const SCOPE_NOTE = "Web pages only; print and paywalled origins are out of scope. Earliest source we found, not proof of first use.";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
// One spelling per page: no fragment, no trailing slash.
export const canonUrl = (url: string) => url.replace(/#.*$/, "").replace(/\/$/, "");
const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");
const dayBefore = (iso: string) => new Date(Date.parse(iso) - 86_400_000).toISOString().slice(0, 10);
// Tavily sends RFC dates; undated pages sort last.
const isoDate = (date: string | null) => (date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString().slice(0, 10) : "9999");

// #192 F6: code's extra queries, aimed at the publisher or the original study, used when a window would otherwise send
// the same search twice (dev-12 sent one quoted phrase 8 times): the claim's first quoted search plus "study",
// "report" or "survey". Each must pass the same query rules as the planner's (queries.ts whyRejected).
export function studyQueries(claim: string, atoms: Atoms): string[] {
  const first = codeQuery(claim, atoms);
  if (!first) return [];
  return ["study", "report", "survey"].map((w) => `${first} ${w}`).filter((q) => whyRejected(q, { claim, atoms, hop: null }) === null);
}

export function queriesFor(atoms: Atoms): string[] {
  // A phrase claim (T53) searches for its phrase and its variants, quoted.
  // A range adds the subject word, the same as a number does ("40 to 45 percent" heat).
  if (!atoms.number) {
    const tail = isRange(atoms) ? ` ${atoms.subjectLemma}` : "";
    return [...new Set([atoms.phrase!, ...atoms.variants].map((p) => `"${p}"${tail}`))].slice(0, MAX_QUERIES);
  }
  const phrases = atoms.variants.length > 0 ? atoms.variants : [[atoms.number.raw, atoms.unit].filter(Boolean).join(" ")];
  return [...new Set(phrases.map((p) => `"${p}" ${atoms.subjectLemma}`))].slice(0, MAX_QUERIES);
}

// Markdown to the visible text, with where each link's words landed. Handles one level of parentheses in a url.
// Marks a blank line while the text is cleaned; removed before the text is returned, its places kept as `breaks`.
const PARAGRAPH = "";
// F5 (#192): a single line break before what starts a new item (a capital, a digit, a list marker, a quote) is a
// sentence boundary, so a nav row, a headline or a menu item is never glued to the sentence after it. A line that
// starts in lower case continues the sentence above (a soft wrap). Removed like PARAGRAPH; its places are `lines`.
const LINE = "";

export function toPlain(markdown: string): { text: string; links: { href: string; start: number; end: number }[]; breaks: number[]; lines: number[] } {
  // Headings end like sentences, and emphasis marks are not the page's words.
  // CRLF and lone CR line ends count as plain ones, so a Windows-style blank line still splits paragraphs (XO on #108).
  const unix = markdown.replace(/\r\n?/g, "\n");
  const headed = unix.trim().replace(/^#{1,6}[ \t]+(.*?)[ \t]*$/gm, (_, heading: string) => (/[.!?:]$/.test(heading) ? heading : `${heading}.`));
  // A blank line may hold any whitespace but a newline, a non-breaking space included.
  const paragraphs = headed.replace(/[^\S\n]*\n[^\S\n]*\n\s*/g, ` ${PARAGRAPH}`);
  // A line that ends a sentence ends it whatever comes next ("... Is a Myth." then "by Rebekah Goode").
  const plainer = paragraphs
    .replace(/(?<=[.!?]["')\]]?)[^\S\n]*\n[^\S\n]*/gu, ` ${LINE}`)
    .replace(/[^\S\n]*\n[^\S\n]*(?=[*\u2022+-]\s|[\d"'(\[]|\p{Lu})/gu, ` ${LINE}`);
  const marked = normalise(plainer.replace(/\*\*|__/g, "")).replace(/!\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)\s*/g, "").replace(/\[\s*\]\((?:[^()]|\([^()]*\))*\)\s*/g, "");
  const links: { href: string; start: number; end: number }[] = [];
  let withMarks = "";
  let last = 0;
  for (const m of marked.matchAll(/\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))*)(?:\s+"[^"]*")?\)/g)) {
    withMarks += marked.slice(last, m.index);
    links.push({ href: m[2] ?? "", start: withMarks.length, end: withMarks.length + (m[1] ?? "").length });
    withMarks += m[1] ?? "";
    last = m.index + m[0].length;
  }
  withMarks += marked.slice(last);
  // Take the marks out, shifting each link by the marks before it.
  const breaks: number[] = [];
  const lines: number[] = [];
  let text = "";
  for (const ch of withMarks) {
    if (ch === PARAGRAPH) breaks.push(text.length);
    else if (ch === LINE) lines.push(text.length);
    else text += ch;
  }
  const shift = (at: number) => at - [...withMarks.slice(0, at)].filter((c) => c === PARAGRAPH || c === LINE).length;
  const shifted = links.map((l) => ({ ...l, start: shift(l.start), end: shift(l.end) }));
  const stable = normalise(text);
  return stable === text ? { text, links: shifted, breaks, lines } : { text: stable, links: [], breaks: [], lines: [] };
}

// The paragraph a position sits in, as [start, end) offsets.
export function paragraphAt(breaks: number[], at: number): [number, number] {
  const start = Math.max(0, ...breaks.filter((b) => b <= at));
  const end = Math.min(Number.POSITIVE_INFINITY, ...breaks.filter((b) => b > at));
  return [start, end];
}

// A page's identity for self-link checks: no www, no query, no fragment, no trailing slash.
export const pageKey = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
};

// Sentences, split at sentence ends and at every paragraph and line boundary (F5). A leading list marker is not part
// of a sentence.
export function sentences(text: string, cuts: number[] = []): { text: string; start: number }[] {
  const ends = new Set<number>();
  for (const m of text.matchAll(/(?<=[.!?]["')\]]?)\s+(?=["'(\[]?[\p{Lu}\d])/gu)) ends.add(m.index);
  for (const c of cuts) if (c > 0 && c < text.length) ends.add(c);
  const out: { text: string; start: number }[] = [];
  let start = 0;
  for (const end of [...[...ends].sort((a, b) => a - b), text.length]) {
    const raw = text.slice(start, end);
    const lead = raw.match(/^(?:\s|[*\u2022+|-]\s)*/)![0].length;
    const body = raw.slice(lead).trimEnd();
    if (body) out.push({ text: body, start: start + lead });
    start = end;
  }
  return out;
}

const SCRIPTS = [/\p{Script=Latin}/u, /\p{Script=Arabic}/u, /\p{Script=Han}/u, /[\p{Script=Hiragana}\p{Script=Katakana}]/u, /\p{Script=Cyrillic}/u,
  /\p{Script=Greek}/u, /\p{Script=Hebrew}/u, /\p{Script=Devanagari}/u, /\p{Script=Hangul}/u, /\p{Script=Thai}/u];

// F5: a menu, a share bar or a language list is not a sentence, even when the claim's number sits in it: two or more
// inline list markers, or whole words in more than one script (a language menu: "English \u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u4e2d\u6587"). Only words
// written in a single script count, so lookalike letters inside Latin words ("It \u0456s \u0251lso", a real 1972 page in the
// dry-run trap) are not a menu. Length is capped by MAX_SENTENCE_CHARS.
export function menuLike(sentence: string): boolean {
  if ((sentence.match(/(?:^|\s)[*\u2022|]\s/g) ?? []).length >= 2) return true;
  const scripts = new Set<number>();
  for (const word of sentence.split(/[^\p{L}]+/u)) {
    const found = SCRIPTS.flatMap((s, i) => (s.test(word) ? [i] : []));
    if (found.length === 1) scripts.add(found[0]!);
  }
  return scripts.size >= 2;
}

const STOP = new Set("the a an of to in on at by for and or but is are was were be it its this that with as from than".split(" "));
const claimWords = (text: string) => normalise(text).toLowerCase().split(/[^\p{L}\p{N}%]+/u).filter((w) => w.length > 1 && !STOP.has(w));

// F5: rank every sentence that states the claim, not the first one found: the share of the claim's own words it
// carries, then the shorter sentence. Stable on ties, so page order breaks them.
export function rankSentences<T extends { text: string }>(claimText: string, candidates: T[]): T[] {
  const want = [...new Set(claimWords(claimText))];
  const score = (s: string) => {
    const have = new Set(claimWords(s));
    return want.length === 0 ? 0 : want.filter((w) => have.has(w)).length / want.length;
  };
  return candidates.map((c, i) => ({ c, i, s: score(c.text) }))
    .sort((a, b) => b.s - a.s || a.c.text.length - b.c.text.length || a.i - b.i).map((x) => x.c);
}

// A negation anywhere before the claim's number means the sentence does not assert it.
function assertsNumber(sentence: string, atoms: Atoms, prefixes: string[]): boolean {
  if (!atoms.number) return false;
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

// What failed, read from the client error. Its message is "<service> <endpoint>: ..." (clients/http.ts), and the
// status keeps the HTTP code when there is one: "http_error 503", not just "http_error".
export function failureOf(err: ClientError, pagesRead: number): NonNullable<Trace["failure"]> {
  const [, service = "tavily", endpoint = ""] = /^(\S+) (\S+):/.exec(err.message) ?? [];
  return { service, endpoint, status: err.status ? `${err.code} ${err.status}` : err.code, kept: `${pagesRead} pages read before the failure` };
}

export async function walkClaim(claim: SpikeClaim, deps: WalkDeps): Promise<{ trace: Trace; log: LogLine[] }> {
  if (deps.replayOf && deps.replayOf.id !== claim.id) {
    throw new Error(`--replay-of holds a trace of ${deps.replayOf.id}, not ${claim.id}`);
  }
  const { atoms } = claim;
  const { rules } = deps;
  const lemma = normalise(atoms.subjectLemma).toLowerCase();
  const clock = deps.clockMs ?? Date.now;
  const started = clock();
  const log: LogLine[] = [];
  const nodes: Node[] = [];
  const spans: Span[] = [];
  const clusterKeys = new Map<string, string>();
  const nodeLinks = new Map<string, string[]>();
  const seen = new Set<string>();
  const searchLog: Trace["searchLog"] = [];
  // What read pages cite, best score kept per url, and the sources they name; both feed the next windows.
  const followQueue = new Map<string, number>();
  const pendingSources: string[] = [];
  const sentQueries: SeenQuery[] = [];
  const sentSearches = new Set<string>();
  let studyBarren = false;
  const emptySearches = new Set<{ query: string; end: string; filter: boolean }>();
  // Where each queued citation came from, so a followed page can say why it has no link-verified edge.
  const citedBy = new Map<string, { from: string; near: boolean }>();
  const otherNumbers: NonNullable<Trace["otherNumbers"]> = [];
  // T49: a citation found on a meta page, mapped to that page's url, and the order they were found in. They have
  // their own queue, read before anything in followQueue, so a fact-check page's map always goes first.
  const metaLinks = new Map<string, string>();
  const metaQueue: string[] = [];
  let capHit: Trace["budget"]["capHit"] = null;
  let failure: Trace["failure"] = null;
  let earlierWindowSearches = 0;
  let earlierFound = 0;

  const note = (line: Omit<LogLine, "at">) => log.push({ at: deps.now(), ...line });
  const excluded = (url: string) => rules.factCheckDomains.some((d) => hostOf(url) === d || hostOf(url).endsWith(`.${d}`));
  // F1 (#192): the trail runs through dated, non-meta pages that the model did not confidently call another claim. A
  // confident same_claim "no" page (Nasdaq 100 in 2014 for a 2017 claim) stays on the trace but never becomes the
  // earliest page, the planner's hop or the end of the next search window.
  const onTrail = (n: Node) => !n.meta && n.date.value !== null && !confidentNo(n.sameClaim, rules);
  const earliestDate = () => nodes.filter(onTrail).map((n) => n.date.value!).sort()[0] ?? null;

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
    const { text, links, breaks, lines } = toPlain(raw);
    const all = sentences(text, [...breaks, ...lines]);
    const states = (s: string) => s.length <= MAX_SENTENCE_CHARS && !menuLike(s) && (atoms.number
      ? s.toLowerCase().includes(lemma) && atomHit(s, atoms, rules.weakNumberMinSigDigits) && assertsNumber(s, atoms, rules.negationPrefixes)
      : claimHit(s, atoms, rules));
    // F5 (#192): every sentence that states the claim, best first, each with its verbatim span. Hard-wrapped text (most
    // PDFs) breaks lines mid-sentence, so when no line-split sentence states the claim, the page is read the way it was
    // before F5: split at sentence ends only, still rejecting menus (XO on #209).
    const split = all.filter((s) => states(s.text));
    const pool = split.length > 0 ? split : sentences(text).filter((s) => states(s.text));
    const ranked = rankSentences(claim.text, pool)
      .map((s) => ({ sentence: s, hit: findSpan(text, s.text, rules.negationPrefixes) }));
    if (ranked.length === 0) {
      // T97: the same claim with another number? Listed for the reader only; the page never becomes a node.
      let other: Awaited<ReturnType<typeof findOtherNumber>> = null;
      if (deps.embed && atoms.number) {
        try { other = await findOtherNumber(claim.text, atoms, all.map((x) => x.text), deps.embed, rules); }
        catch (err) { note({ step: "read", url, reason: `embeddings failed (${err instanceof Error ? err.message : "error"})` }); }
      }
      if (other) otherNumbers.push({ url, domain: hostOf(url), title, date: apiDate ? isoDate(apiDate) : null, ...other });
      note({ step: "read", url, kept: false, reason: other ? `same claim with another number (${other.number}, similarity ${other.similarity})` : "no sentence asserts the claim's atoms" });
      return false;
    }
    const usable = ranked.flatMap((r) => ("start" in r.hit ? [{ sentence: r.sentence, hit: r.hit }] : []));
    if (usable.length === 0) {
      const first = ranked[0]!.hit;
      note({ step: "read", url, kept: false, reason: `span ${"rejected" in first ? first.rejected : "not found"}` });
      return false;
    }
    // F5: same_claim about the best sentence, and about the second best when the first gets no confident yes (the
    // wrong sentence on the right page got a "no" on dev-10 and dev-18). The first answer stands when neither says yes.
    let pick = usable[0]!;
    let asked: SameClaimResult | null = null;
    if (deps.askSameClaim) {
      for (const [i, candidate] of usable.slice(0, 2).entries()) {
        let answer: SameClaimResult | null = null;
        try {
          answer = await deps.askSameClaim({ claim: claim.text, sentence: candidate.sentence.text, atoms });
        } catch (err) {
          modelFailed(err, `same_claim on ${url}`, "no answer stored for this sentence");
        }
        if (i === 0) asked = answer;
        if (answer && confidentYes(answer.typed, rules)) {
          pick = candidate;
          asked = answer;
          break;
        }
      }
    }
    const { sentence, hit } = pick;
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
    // Everything the page cites, ranked (T44). Citations beside the span are its candidate parents; every citation that
    // scores high enough is queued to follow. Same-site citations count; self-links, share buttons and fact-checks never.
    const cited = citationsIn({ text, links, breaks, pageUrl: url, span: hit, atoms, rules });
    const parents = cited.filter((c) => c.near).map((c) => c.url).slice(0, LINKS_PER_SPAN);
    nodeLinks.set(id, parents);

    const clusterKey = `${normalise(title).toLowerCase()}|${sentence.text.toLowerCase()}`;
    if (!clusterKeys.has(clusterKey)) clusterKeys.set(clusterKey, `c${clusterKeys.size + 1}`);
    // The typed same_claim answer for the chosen sentence (T36 gate, ruling on #106), asked above (F5).
    nodes.push({
      id, url, domain: hostOf(url), title, date, clusterId: clusterKeys.get(clusterKey)!,
      evidence: "observed", meta, read: true, versionOf: null, spanIds: [spanId], citesEarlier: parents.length > 0,
      candidateParents: parents.map((p) => ({ url: p, read: seen.has(p) })), pageType: null,
      // A page that is itself meta (it says "myth" or "debunk") is off the path, so it is never recorded as found
      // through a meta page: only a page that can stand on its own span carries foundViaMeta.
      ...(rules.metaMaps ? { foundViaMeta: meta ? null : metaLinks.get(url) ?? null } : {}),
      injection: findInjection(title, text, rules.injectionPatterns),
      ...(asked && { sameClaim: asked.typed }),
    });
    // A page reached through a citation that was not beside the citing page's span has no link-verified edge;
    // the trace says so rather than leaving the reader to guess (XO note on #110).
    const via = citedBy.get(url);
    if (via && !via.near) {
      searchLog.push({
        at: deps.now(), step: "follow", query: `${url} cited by ${via.from}, not beside its span: no link-verified edge`,
        endDate: null, startDate: null, results: 1, kept: 1, dropped: 0,
      });
    }
    if (!meta) {
      for (const c of cited) {
        if (seen.has(c.url)) continue;
        followQueue.set(c.url, Math.max(c.score, followQueue.get(c.url) ?? 0));
        const prior = citedBy.get(c.url);
        if (!prior || (c.near && !prior.near)) citedBy.set(c.url, { from: url, near: c.near });
      }
      for (const name of namedSources(sentence.text)) if (!pendingSources.includes(name)) pendingSources.push(name);
    } else if (rules.metaMaps) {
      // T49: a meta page is off the path, but what it cites is a map to the origin: its own queue, not followQueue.
      for (const p of parents) if (!seen.has(p) && !metaLinks.has(p)) { metaLinks.set(p, url); metaQueue.push(p); }
    }
    note({ step: "read", url, kept: true, reason: meta ? "meta page, off the path" : "span found" });
    return !meta;
  }

  // T49: a fact-check page, read as a map. It becomes a meta node (never an origin, no span needed) whose candidate
  // parents are the pages it cites beside the claim's number or subject, those with the number first, at most
  // META_LINKS. They are read before any other link.
  async function readMeta(url: string, title: string, raw: string): Promise<void> {
    const { text, links } = toPlain(raw);
    const lower = text.toLowerCase();
    const number = atoms.number?.raw.toLowerCase() ?? atoms.phrase?.toLowerCase() ?? "";
    const scored = links.flatMap((l, i) => {
      let target: string;
      try { const t = new URL(l.href, url); if (!t.protocol.startsWith("http")) return []; target = canonUrl(t.href); } catch { return []; }
      if (hostOf(target) === hostOf(url) || excluded(target)) return [];
      const around = lower.slice(Math.max(0, l.start - REACH), l.end + REACH);
      const score = (number && around.includes(number) ? 2 : 0) + (around.includes(lemma) ? 1 : 0);
      return [{ target, score, i }];
    });
    // Only citations the page ties to the claim (its number or subject nearby) become leads: an unread lead blocks an
    // origin, so a share button or a "more checks" link must not.
    const cited = [...new Map(scored.filter((c) => c.score > 0).sort((a, b) => b.score - a.score || a.i - b.i).map((c) => [c.target, c])).keys()].slice(0, META_LINKS);
    const id = `n${nodes.length + 1}`;
    const dir = join(deps.pagesDir, claim.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${id}.txt`), text);
    clusterKeys.set(`meta|${url}`, `c${clusterKeys.size + 1}`);
    nodes.push({
      id, url, domain: hostOf(url), title, date: { kind: "unconfirmed", value: null, source: "tavily", firstCapture: null, conflictingDate: false },
      clusterId: clusterKeys.get(`meta|${url}`)!, evidence: "observed", meta: true, read: true, versionOf: null, spanIds: [], citesEarlier: cited.length > 0,
      candidateParents: cited.map((p) => ({ url: p, read: seen.has(p) })), pageType: null, foundViaMeta: null,
    });
    for (const p of cited) if (!seen.has(p) && !metaLinks.has(p)) { metaLinks.set(p, url); metaQueue.push(p); }
    note({ step: "read", url, kept: true, reason: `fact-check page read as a map, ${cited.length} citation(s) to follow` });
  }

  // A Token Factory failure in the planner or the same_claim question must not end the trace (XO on #110): the
  // walk falls back to code-only queries or to no answer, keeps the failed call's usage rows, and says so on the trace.
  function modelFailed(err: unknown, what: string, fallback: string): void {
    if (!(err instanceof TokenFactoryError)) throw err;
    for (const row of err.usage) deps.usage.append(row);
    const reason = `${what} failed (${err.code}${err.status === null ? "" : ` ${err.status}`}): ${fallback}`;
    note({ step: "model", kept: false, reason });
    searchLog.push({ at: deps.now(), step: "model", query: reason, endDate: null, startDate: null, results: 0, kept: 0, dropped: 0 });
  }

  // #192 F2 time reserve: no new round after rules.caps.walkShare of caps.ms, so the card still gets written.
  const outOfTime = () => clock() - started >= rules.caps.ms * rules.caps.walkShare;

  try {
    let endDate = deps.today;
    const plan = deps.planQueries ?? codePlanner;
    // F7: caps.depth counts steps back in time (rounds whose window moved back), not rounds. A round that only follows
    // links and finds nothing earlier counts against LINK_ROUNDS_WITHOUT_PROGRESS instead, so a long citation chain on
    // a cold claim cannot turn it into a depth-capped PARTIAL (dev-05, dev-06, dev-20) or eat the time cap.
    let steps = 0;
    let idleLinkRounds = 0;
    for (let round = 0; ; round++) {
      if (outOfTime()) {
        capHit = "ms";
        break;
      }
      const results = new Map<string, { title: string; date: string | null }>();
      earlierWindowSearches = 0;
      // The hop the planner works back from: the earliest dated page so far, with its span.
      const hopNode = nodes.filter(onTrail).sort((a, b) => a.date.value!.localeCompare(b.date.value!))[0];
      const hopSpan = hopNode && spans.find((s) => s.id === hopNode.spanIds[0]);
      const planInput = {
        claim: claim.text, atoms, seen: [...sentQueries],
        hop: hopNode && hopSpan ? { url: hopNode.url, date: hopNode.date.value, span: hopSpan.text } : null,
      };
      let planned: Awaited<ReturnType<QueryPlanner>>;
      try {
        planned = await plan(planInput);
      } catch (err) {
        modelFailed(err, "query planner", "code-only queries used for this window");
        planned = await codePlanner(planInput);
      }
      for (const row of planned.usage) deps.usage.append(row);
      for (const r of planned.rejected) note({ step: "plan", query: r.query, kept: false, reason: r.reason });
      // A planner that returns nothing still leaves the window searched with the code queries.
      const queries = planned.queries.length > 0 ? planned.queries : (await codePlanner({ claim: claim.text, atoms, hop: null, seen: [] })).queries;
      // Sources the pages named ("according to ..."), searched for by name with the claim's phrase.
      const phrase = atoms.variants[0] ?? atoms.phrase ?? (atoms.number ? [atoms.number.raw, atoms.unit].filter(Boolean).join(" ") : atoms.subjectLemma);
      const bySource = pendingSources
        .map((name) => `"${phrase}" ${name}`)
        .filter((q) => !sentQueries.some((s) => s.query === q))
        .slice(0, SOURCE_QUERIES_PER_WINDOW)
        .map((query) => ({ query, endDate: null, why: "publisher" }));
      const windowEnd = endDate;
      const earlier = (d: string | null) => (d && d < windowEnd ? d : windowEnd);
      // `planned` is the endDate the planner gave, recorded in `seen` as-is so its repeats match (#129).
      // #192 F6: one search per (query, end date, filter). A planned date later than the window collapses to the window
      // end, so two planned copies of one query were the same request. A search already sent in an earlier window with
      // the same end, or one that found nothing with a later end (an earlier end can only find less), is not repeated.
      // A skipped repeat still counts as the search it repeats (XO on #198): after a round that only follows links the
      // end date has not moved, and its searches are already answered for this window, so "nothing earlier" still rests
      // on that many searches and decide's earlier-window check is not starved.
      const key = (query: string, end: string, filter: boolean) => `${queryKey(query)}|${end}|${filter}`;
      const repeat = (query: string, end: string, filter: boolean) => sentSearches.has(key(query, end, filter))
        || [...emptySearches].some((e) => e.query === queryKey(query) && e.end >= end && e.filter === filter);
      const searches: { query: string; planned: string | null; end: string; filter: boolean; study?: boolean }[] = [];
      const answered = new Set<string>();
      const add = (query: string, planned: string | null, filter = false, study = false) => {
        const end = earlier(planned);
        const k = key(query, end, filter);
        if (searches.some((x) => key(x.query, x.end, x.filter) === k)) return;
        if (repeat(query, end, filter)) {
          if (!answered.has(k)) note({ step: "plan", query, kept: false, reason: "duplicate search, already answered for this window" });
          answered.add(k);
          return;
        }
        searches.push({ query, planned, end, filter, study });
      };
      for (const q of [...queries, ...bySource]) add(q.query, q.endDate);
      const counted = () => searches.length + answered.size;
      // Two searches per window at least, so "nothing earlier" never rests on one call. A repeat already answered
      // counts. Short of two, one code study or report query (a new paid request, so at most one per window, and none
      // once one has found nothing new in this trace), then the date-filtered copy of the first query.
      const studies = studyQueries(claim.text, atoms);
      // A study query already sent for this window end is answered too.
      for (const q of studies) if (counted() < rules.earlierWindowSearches && sentSearches.has(key(q, windowEnd, false))) answered.add(key(q, windowEnd, false));
      if (counted() < rules.earlierWindowSearches && !studyBarren) {
        const study = studies.find((q) => !repeat(q, windowEnd, false));
        if (study) add(study, null, false, true);
      }
      const first = searches[0] ?? (queries[0] ? { query: queries[0].query, planned: queries[0].endDate } : undefined);
      if (counted() < rules.earlierWindowSearches && first) add(first.query, first.planned, true);
      earlierWindowSearches += answered.size;
      for (const { query, planned, end: searchEnd, filter, study } of searches) {
        if (!sentQueries.some((s) => s.query === query && s.endDate === planned)) sentQueries.push({ query, endDate: planned });
        const { data } = await deps.tavily.search({
          query, exactMatch: true, endDate: searchEnd, includeRawContent: false, includePublishedDate: true, maxResults: 10,
          excludeDomains: rules.factCheckDomains, ...(filter && { filterByPublishedDate: true }),
        }, { step: "search" });
        earlierWindowSearches += 1;
        const fresh = data.results.filter((r) => !seen.has(canonUrl(r.url)) && !excluded(r.url));
        for (const r of fresh) {
          results.set(canonUrl(r.url), { title: r.title ?? "", date: r.published_date ?? null });
        }
        sentSearches.add(key(query, searchEnd, filter));
        if (study && fresh.length === 0) studyBarren = true;
        if (data.results.length === 0) emptySearches.add({ query: queryKey(query), end: searchEnd, filter });
        searchLog.push({ at: deps.now(), step: "search", query, endDate: searchEnd, startDate: null, results: data.results.length, kept: fresh.length, dropped: data.results.length - fresh.length });
        note({ step: "search", query, reason: `end_date ${searchEnd}${filter ? ", filtered" : ""}, ${data.results.length} results` });
      }

      // T49: once per trace, fact-check pages that discuss the claim, read as maps before anything else.
      if (round === 0 && rules.metaMaps) {
        const { data } = await deps.tavily.search({
          query: queries[0]!.query, exactMatch: true, endDate, includeRawContent: false, includePublishedDate: true, maxResults: 5, includeDomains: rules.factCheckDomains,
        }, { step: "meta-search" });
        const maps = [...new Set(data.results.map((r) => canonUrl(r.url)).filter((u) => excluded(u) && !seen.has(u)))].slice(0, META_PAGES);
        searchLog.push({ at: deps.now(), step: "meta-search", query: queries[0]!.query, endDate, startDate: null, results: data.results.length, kept: maps.length, dropped: data.results.length - maps.length });
        if (maps.length) {
          const read = await deps.tavily.extract({ urls: maps, format: "markdown" }, { step: "meta-extract" });
          for (const u of maps) seen.add(u);
          for (const page of read.data.results) await readMeta(canonUrl(page.url), page.title ?? "", page.raw_content ?? "");
        }
      }

      // Citations from meta pages (T49) go first, in the order they were found; then the best-scored citations, since
      // what pages cite is how the tools reach origins (T44).
      const fromMaps = [...new Set(metaQueue.filter((u) => !seen.has(u)))].slice(0, LINKS_PER_ROUND);
      const links = [...fromMaps, ...[...followQueue.entries()]
        .filter(([u]) => !seen.has(u) && !fromMaps.includes(u))
        .sort(([, a], [, b]) => b - a)
        .slice(0, LINKS_PER_ROUND - fromMaps.length)
        .map(([u]) => u)];
      for (const u of links) { followQueue.delete(u); const i = metaQueue.indexOf(u); if (i >= 0) metaQueue.splice(i, 1); }
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
      const moreLinks = [...followQueue.keys(), ...metaQueue].some((u) => !seen.has(u));
      if (!movedBack && !moreLinks) break;
      if (movedBack) {
        idleLinkRounds = 0;
        steps += 1;
        if (steps >= rules.caps.depth) {
          capHit = "depth";
          break;
        }
      } else if (++idleLinkRounds >= LINK_ROUNDS_WITHOUT_PROGRESS) {
        note({ step: "stop", reason: `followed citations for ${idleLinkRounds} rounds without reaching an earlier page; links left unfollowed` });
        break;
      }
      if (earliestNow) endDate = dayBefore(earliestNow);
    }
  } catch (err) {
    if (!(err instanceof ClientError)) throw err;
    note({ step: "stop", reason: err.code });
    if (err.code === "budget_exceeded") capHit = "credits";
    else failure = failureOf(err, nodes.length);
  }

  // T97: with embeddings, reworded copies (spans at or above clusterSimilarityThreshold) join one cluster before any
  // edge is drawn, so the independence count no longer counts each rewording as its own root. If the embedding call
  // fails, the walk keeps its exact-wording clusters and says so in the log.
  let regrouped: Cluster[] | null = null;
  if (deps.embed && nodes.length > 1) {
    try {
      const grouped = await clusterNodes({ nodes, spans }, deps.embed, rules);
      regrouped = grouped.clusters;
      for (const n of nodes) n.clusterId = grouped.clusterOf[n.id]!;
    } catch (err) {
      note({ step: "cluster", reason: `embeddings failed (${err instanceof Error ? err.message : "error"}); exact-wording clusters kept` });
    }
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

  let clusters: Cluster[] = [...clusterKeys.values()].map((id) => {
    const nodeIds = nodes.filter((n) => n.clusterId === id).map((n) => n.id);
    return { id, nodeIds, rule: nodeIds.length > 1 ? "near_duplicate" : "single" };
  });
  if (regrouped) clusters = regrouped;
  const minDate = earliestDate();
  const usd = deps.usage.rows.reduce((sum, r) => sum + (r.service === "tokenfactory" ? r.costUsd : 0), 0);

  // A run whose paid calls all came from the cache is a replay: it carries the recorded run's date, budget and usage
  // rows, plus rows for any free calls made fresh (for example Wayback lookups after a change to the CDX query).
  const paid = deps.usage.rows.filter((r) => r.service === "tavily" || r.service === "tokenfactory");
  const replayed = paid.length > 0 && paid.every((r) => r.cacheHit);
  if (replayed && !deps.replayOf && deps.cachedRun !== "allow") {
    throw new Error(`${claim.id}: every paid call came from the cache, so this is a replay; pass the recorded trace with --replay-of`);
  }
  const recorded = replayed && deps.replayOf ? deps.replayOf : null;
  const budget: Trace["budget"] = recorded
    ? { credits: recorded.budget.credits, usd: recorded.budget.usd, ms: recorded.budget.ms, capHit }
    : { credits: deps.usage.rows.reduce((sum, r) => sum + r.credits, 0), usd, ms: clock() - started, capHit };

  const draft: Trace = {
    schemaVersion: "1", id: claim.id, mode: recorded ? "REPLAY" : "LIVE", synthetic: false, recordedAt: recorded?.recordedAt ?? deps.now(),
    claim: { text: claim.text, atoms }, viralSentence: claim.text,
    nodes, edges, clusters, spans, hops, blame: [],
    // One counter for the roots line and the T94 headline (the old inline count called linked-into clusters unlinked).
    roots: computeRoots(nodes, edges),
    redHopEdgeId: hops.find((h) => !h.faithful)?.edgeId ?? null,
    earliest: { nodeIds: nodes.filter((n) => onTrail(n) && n.date.value === minDate).map((n) => n.id), earlierWindowSearches, earlierFound },
    failure,
    budget,
    decision: { state: "TRAIL_GOES_COLD", row: 6, reasons: [], counts: {} },
    searchLog, usage: recorded ? [...recorded.usage, ...deps.usage.rows.filter((r) => !r.cacheHit)] : deps.usage.rows, scopeNote: SCOPE_NOTE,
    ...(deps.embed ? { otherNumbers } : {}),
  };
  return { trace: { ...draft, decision: decideStopState(draft, rules) }, log };
}

// A walk with no dates yet: the dating stage (T25) owns node dates, so the walk's Tavily dates are search hints only.
const UNDATED: DateInfo = { kind: "unconfirmed", value: null, source: "tavily", firstCapture: null, conflictingDate: false };

// The pipeline's walk stage (T29). `build` makes the clients, usage log and budget for each run, so one claim's
// spending never counts against another's. Only the search and the pages found come from the walk: dates, edges and
// the earliest pages are decided downstream, never ordered by Tavily dates (C6). Replay is the pipeline's own
// keyless path, so a warm-cache run here is simply a run whose usage rows show cache hits.
export function walkStep<C>(build: (trace: Trace, context: C) => Omit<WalkDeps, "replayOf" | "cachedRun">): (trace: Trace, context: C) => Promise<Trace> {
  return async (trace, context) => {
    const deps = build(trace, context);
    // The credits the earlier stages spent count against this run's cap (XO note on #110).
    deps.budget.spend(trace.usage.reduce((sum, r) => sum + r.credits, 0));
    const { trace: walked } = await walkClaim({ id: trace.id, text: trace.claim.text, atoms: trace.claim.atoms }, { ...deps, cachedRun: "allow" });
    const draft: Trace = {
      ...walked,
      mode: trace.mode,
      recordedAt: trace.recordedAt,
      synthetic: trace.synthetic,
      viralSentence: trace.viralSentence,
      nodes: walked.nodes.map((n) => ({ ...n, date: UNDATED })),
      edges: [],
      hops: [],
      blame: [],
      redHopEdgeId: null,
      earliest: { ...walked.earliest, nodeIds: [] },
      usage: [...trace.usage, ...walked.usage],
    };
    // The budget covers every row the trace carries, the earlier stages' included, and their time.
    draft.budget = {
      ...walked.budget,
      credits: draft.usage.reduce((sum, r) => sum + r.credits, 0),
      usd: draft.usage.reduce((sum, r) => sum + (r.service === "tokenfactory" ? r.costUsd : 0), 0),
      ms: trace.budget.ms + walked.budget.ms,
    };
    return { ...draft, decision: decideStopState(draft, deps.rules) };
  };
}
