import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { createBudget } from "../clients/budget.ts";
import { createFileCache } from "../clients/cache.ts";
import { createTavily } from "../clients/tavily.ts";
import { createWayback } from "../clients/wayback.ts";
import { walkClaim, type SpikeClaim } from "../engine/walk.ts";
import { decideStopState, type Rules } from "../rules/index.ts";
import { StopState, Trace } from "../schema/index.ts";
import { falseCertainty } from "../verify/false-certainty.ts";
import { createUsageLog } from "../usage/log.ts";
import { bound } from "./bound.ts";

// T30 (#72): pipeline traps. Each case rebuilds a small web from a committed spike trace (each page is its span with
// the saved context around it, at its recorded date and first capture), plants one of the plan's seven mutations,
// and runs the real pipeline with no network: Tavily search and extract, Wayback dating, verbatim spans, the walk,
// then decideStopState. The typed answers come from a stub that is as generous as it can be: it calls the earliest
// page a study and says "yes, same claim" everywhere, so only code can stop a planted origin. Nothing here is tuned
// on the spike claims; the cases check that the pipeline stops honestly.

export const MUTATIONS = ["nudge-number", "negate", "unread-parent", "cap-hit", "tool-failure", "empty-results", "late-metadata-date"] as const;
export const PipelineCase = z.object({
  id: z.string(), kind: z.literal("pipeline"), note: z.string(),
  source: z.string(),   // a committed spike trace
  mutation: z.enum(MUTATIONS),
  expect: z.object({
    state: StopState.optional(),        // the exact ending, when the mutation fixes it
    noOrigin: z.boolean().optional(),   // the planted page, and every page, must not end as the origin
    dateCapped: z.boolean().optional(), // the planted page's date is capped by its first capture and flagged
    falseCertainty: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  }).strict(),
}).strict();
export type PipelineCase = z.infer<typeof PipelineCase>;

type Page = { url: string; title: string; text: string; date: string | null; capture: string | null };

// The web a spike trace saw: one page per read node, its text the span and its saved context.
export function pagesFrom(trace: Trace): { pages: Page[]; earliest: Page; sentence: string } {
  const pages = trace.nodes.filter((n) => !n.meta && n.read).flatMap((n) => {
    const span = trace.spans.find((s) => s.nodeId === n.id);
    return span ? [{ url: n.url, title: n.title, text: `${span.contextBefore}${span.text}${span.contextAfter}`, date: n.date.value, capture: n.date.firstCapture, sentence: span.text }] : [];
  });
  const earliest = [...pages].filter((p) => p.date).sort((a, b) => a.date!.localeCompare(b.date!))[0]!;
  return { pages: pages.map(({ sentence: _, ...p }) => p), earliest, sentence: pages.find((p) => p.url === earliest.url)!.sentence };
}

// The claim's number, one higher, written the same way ("55%" to "56%", "26.2" to "27.2").
export function nudge(raw: string): string {
  const m = raw.match(/^(\d+)(.*)$/)!;
  return `${Number(m[1]) + 1}${m[2]}`;
}

type WorldOptions = { searchStatus?: number; empty?: boolean; unread?: Set<string> };
function world(pages: Page[], o: WorldOptions): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/cdx/")) {
      const page = pages.find((p) => p.url === new URL(url).searchParams.get("url"));
      const rows = page?.capture ? [["timestamp", "original"], [`${page.capture.replace(/-/g, "")}000000`, page.url]] : [["timestamp", "original"]];
      return new Response(JSON.stringify(rows));
    }
    const body = JSON.parse(String(init?.body));
    if (url.endsWith("/search")) {
      if (o.searchStatus) return new Response("unavailable", { status: o.searchStatus });
      const results = o.empty ? [] : pages.filter((p) => !body.end_date || p.date === null || p.date <= body.end_date)
        .map((p) => ({ url: p.url, title: p.title, content: p.text.slice(0, 80), score: 0.5, published_date: p.date }));
      return new Response(JSON.stringify({ query: body.query, results, usage: { credits: 1 } }));
    }
    if (url.endsWith("/extract")) {
      const urls: string[] = body.urls;
      const results = pages.filter((p) => urls.includes(p.url) && !o.unread?.has(p.url)).map((p) => ({ url: p.url, title: p.title, raw_content: p.text }));
      const failed = urls.filter((u) => !results.some((r) => r.url === u)).map((u) => ({ url: u, error: "not found" }));
      return new Response(JSON.stringify({ results, failed_results: failed, usage: { credits: 1 } }));
    }
    throw new Error(`no page for ${url}`);
  }) as typeof fetch;
}

// Applies one mutation to the web, and says what the walk needs to run it.
function plant(c: PipelineCase, trace: Trace): { pages: Page[]; planted: string; o: WorldOptions; credits: number } {
  const { pages, earliest, sentence } = pagesFrom(trace);
  const swap = (text: string) => pages.map((p) => (p.url === earliest.url ? { ...p, text: p.text.replace(sentence, text) } : p));
  const o: WorldOptions = {};
  let credits = 150, out = pages;
  switch (c.mutation) {
    case "nudge-number": {
      const raw = trace.claim.atoms.number!.raw;
      out = swap(sentence.replace(new RegExp(`(?<![\\d.])${raw.replace(/[.%]/g, "\\$&")}(?![\\d])`), nudge(raw)));
      break;
    }
    case "negate":
      out = swap(`It is a myth that ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`);
      break;
    case "unread-parent": {
      const parent = "https://earlier-source.example/report";
      out = swap(`${sentence} ([source](${parent}))`);
      o.unread = new Set([parent]);
      break;
    }
    case "cap-hit": credits = 1; break;
    case "tool-failure": o.searchStatus = 503; break;
    case "empty-results": o.empty = true; break;
    case "late-metadata-date": {
      // The page's metadata claims a date a year after its first capture.
      const capture = earliest.capture ?? earliest.date!;
      const later = `${Number(capture.slice(0, 4)) + 1}${capture.slice(4)}`;
      out = pages.map((p) => (p.url === earliest.url ? { ...p, capture, date: later } : p));
      break;
    }
  }
  return { pages: out, planted: earliest.url, o, credits };
}

// The generous typed stub: the planted page (the source's earliest page) is a study, every other page is news, and
// every page states the same claim, all at 0.97. Only the planted page can be an origin, so a case passes only if
// code, not the stub, keeps the planted page from ending as one.
function typed(trace: Trace, planted: string): Trace {
  const answer = (questionId: string, optionId: string) => ({ questionId, optionId, probability: 0.97, top: [{ optionId, p: 0.97 }], model: "stub", threshold: null });
  return { ...trace, nodes: trace.nodes.map((n) => ({ ...n, pageType: answer("page_type", n.url === planted ? "study" : "news"), sameClaim: answer("same_claim", "yes") })) };
}

export async function runPipelineCase(c: PipelineCase, root: string, rules: Rules, { mutate = true } = {}): Promise<{ trace: Trace; state: StopState; originUrl: string | null; planted: string }> {
  const source = Trace.parse(JSON.parse(readFileSync(join(root, c.source), "utf8")));
  const { pages, planted, o, credits } = mutate ? plant(c, source) : { pages: pagesFrom(source).pages, planted: pagesFrom(source).earliest.url, o: {}, credits: 150 };
  const dir = mkdtempSync(join(tmpdir(), "pz-pipeline-trap-"));
  const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
  const deps = { fetch: world(pages, o), usage, cache: createFileCache(join(dir, "http")), budget: createBudget(credits), traceId: c.id, sleep: async () => {} };
  const claim: SpikeClaim = { id: c.id, text: source.claim.text, atoms: source.claim.atoms };
  const { trace: walked } = await walkClaim(claim, {
    tavily: createTavily({ ...deps, apiKey: "test-key" }), wayback: createWayback(deps), usage, budget: deps.budget, rules,
    today: "2026-11-02", now: () => "2026-11-02T00:00:00.000Z", pagesDir: join(dir, "pages"),
  });
  const withAnswers = typed(walked, planted);
  const decision = decideStopState(withAnswers, rules);
  const trace = { ...withAnswers, decision };
  const originId = decision.state === "ORIGIN_FOUND" ? trace.earliest.nodeIds[0] : null;
  return { trace, state: decision.state, originUrl: trace.nodes.find((n) => n.id === originId)?.url ?? null, planted };
}

// Every way a case can disagree with what it plants, as plain lines.
export function judgeCase(c: PipelineCase, r: Awaited<ReturnType<typeof runPipelineCase>>, rules: Rules): string[] {
  const out: string[] = [];
  if (c.expect.state && r.state !== c.expect.state) out.push(`state ${r.state}, case expects ${c.expect.state}`);
  if (c.expect.noOrigin && r.state === "ORIGIN_FOUND") out.push(`ended ORIGIN_FOUND on ${r.originUrl}`);
  if (c.expect.dateCapped) {
    const node = r.trace.nodes.find((n) => n.url === r.planted);
    if (!node || node.date.kind !== "existed_by" || !node.date.conflictingDate) out.push(`planted page's date not capped and flagged (${node ? JSON.stringify(node.date) : "no node"})`);
  }
  const fc = Object.values(falseCertainty(r.trace, { rules }));
  fc.forEach((v, i) => { if (v !== c.expect.falseCertainty[i]) out.push(`false-certainty counter ${i + 1} is ${v}, case expects ${c.expect.falseCertainty[i]}`); });
  return out;
}

export function pipelineLockText(dir: string): string {
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    .map((f) => `${createHash("sha256").update(readFileSync(join(dir, f))).digest("hex")}  ${f}\n`).join("");
}

export async function runPipelineTraps(p: { root: string; casesDir: string; lockPath: string; rules: Rules; relock?: boolean }): Promise<{ code: number; lines: string[] }> {
  if (p.relock) writeFileSync(p.lockPath, pipelineLockText(p.casesDir));
  if (pipelineLockText(p.casesDir) !== readFileSync(p.lockPath, "utf8"))
    return { code: 1, lines: ["FAIL lock check: traps/pipeline changed since pipeline.lock; review the change, then run pz traps --relock"] };
  const files = readdirSync(p.casesDir).filter((f) => f.endsWith(".json")).sort();
  const lines: string[] = [];
  let wrong = 0;
  for (const f of files) {
    const c = PipelineCase.parse(JSON.parse(readFileSync(join(p.casesDir, f), "utf8")));
    const r = await runPipelineCase(c, p.root, p.rules);
    if (r.state === "ORIGIN_FOUND" && (c.expect.noOrigin || (c.expect.state && c.expect.state !== "ORIGIN_FOUND"))) wrong++;
    for (const problem of judgeCase(c, r, p.rules)) lines.push(`FAIL ${c.id}: ${problem}`);
  }
  const n = files.length;
  lines.push(`pipeline: wrong origins ${wrong} of ${n} (95% upper bound ${wrong === 0 ? (bound(0, n) * 100).toFixed(1) + "%" : "n/a"}), `
    + `the typed stub calls the planted page a study, real walk and dating with no network, planted by us`);
  return { code: lines.length === 1 ? 0 : 1, lines };
}
