import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { createBudget } from "../clients/budget.ts";
import { createFileCache } from "../clients/cache.ts";
import { createTavily } from "../clients/tavily.ts";
import type { ChatData, ChatInput, Result } from "../clients/tokenfactory.ts";
import { createWayback } from "../clients/wayback.ts";
import { toPlain, walkClaim, type SpikeClaim } from "../engine/walk.ts";
import { sameClaim } from "../match/same-claim.ts";
import { decideStopState, loadRules, normalise, type Rules } from "../rules/index.ts";
import { QUESTIONS, StopState, type Trace } from "../schema/index.ts";
import { ask } from "../typed/ask.ts";
import { createUsageLog } from "../usage/log.ts";
import { bound } from "./bound.ts";

// T50: adversarial pages. Each case is a small invented web: one genuine earliest page and one planted page built to
// fake an origin (an injected instruction, a fake date, a fake byline, a wrong number in a quote, a meta page dressed
// as a study). It runs through the engine's own code with no network: the walker (search, read, verbatim spans,
// negation, meta and fact-check filters), Wayback-capped dating, the typed layer (`ask` for page_type and `sameClaim`)
// on written logprob replies, and decideStopState. On the planted page the replies are written as if the model was
// fooled, so every case checks that code, not the model's good sense, keeps the planted page from being the origin.

const Page = z.object({
  url: z.string().url(), title: z.string(), text: z.string(),
  // The date the search API reports (page metadata, which the page's author controls), and the first Wayback capture.
  date: z.string().nullable(), capture: z.string().nullable(),
}).strict();
// Each answer with the probability its answer token carries; null means the reply came with no logprobs.
const Reply = z.object({ pageType: z.tuple([z.string(), z.number().nullable()]), sameClaim: z.tuple([z.enum(["yes", "no"]), z.number().nullable()]) }).strict();
export const AdversarialCase = z.object({
  id: z.string(), kind: z.literal("adversarial"), note: z.string(),
  planted: z.string().url(),
  pages: z.array(Page).min(1),
  // Written model replies per page. Pages not listed answer as a careful model would: page_type news, same_claim yes.
  replies: z.record(z.string(), Reply),
  expect: z.object({ state: StopState, origin: z.string().url().nullable() }).strict(),
}).strict();
export type AdversarialCase = z.infer<typeof AdversarialCase>;

// The invented claim the fixtures use. No dev, spike or held-out claim is used here.
export const CLAIM: SpikeClaim = {
  id: "adversarial", text: "Harbor Zoo penguins nap 14 times a day.",
  atoms: { number: { raw: "14", canonical: "14" }, unit: "times a day", subjectLemma: "penguin", population: null, time: null, hedge: null, namedSource: null, variants: ["fourteen"] },
};
// A fooled model: sure the planted page is a study and states the claim.
export const FOOLED = { pageType: ["study", 0.99], sameClaim: ["yes", 0.99] } as const;

// The world: search serves pages dated inside the window (undated pages always); extract serves page text; CDX serves
// each page's first capture. Anything else is refused.
function world(pages: z.infer<typeof Page>[]): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/cdx/")) {
      const target = new URL(url).searchParams.get("url");
      const page = pages.find((p) => p.url === target);
      const rows = page?.capture ? [["timestamp", "original"], [`${page.capture.replace(/-/g, "")}000000`, page.url]] : [["timestamp", "original"]];
      return new Response(JSON.stringify(rows));
    }
    const body = JSON.parse(String(init?.body));
    if (url.endsWith("/search")) {
      const results = pages.filter((p) => !body.end_date || p.date === null || p.date <= body.end_date)
        .map((p) => ({ url: p.url, title: p.title, content: p.text.slice(0, 80), score: 0.5, published_date: p.date }));
      return new Response(JSON.stringify({ query: body.query, results, usage: { credits: 1 } }));
    }
    if (url.endsWith("/extract")) {
      const results = pages.filter((p) => body.urls.includes(p.url)).map((p) => ({ url: p.url, title: p.title, raw_content: p.text }));
      return new Response(JSON.stringify({ results, failed_results: [], usage: { credits: 1 } }));
    }
    throw new Error(`no page for ${url}`);
  }) as typeof fetch;
}

// A Token Factory reply shaped like the recorded ones: the JSON answer, with the answer token's logprob set to p.
function reply(field: string, answer: string, p: number | null): ChatData {
  const content = `{"${field}":"${answer}"}`;
  if (p === null) return { content, model: "Qwen/Qwen3-30B-A3B-Instruct-2507", logprobs: null };
  return { content, model: "Qwen/Qwen3-30B-A3B-Instruct-2507", logprobs: { content: [
    { token: `{"${field}":"`, logprob: 0, top_logprobs: [] },
    { token: answer, logprob: Math.log(p), top_logprobs: [{ token: answer, logprob: Math.log(p) }] },
    { token: "\"}", logprob: 0, top_logprobs: [] },
  ] } };
}

// The typed layer's client: it finds which page a request is about from its source_text and answers from the case.
function typedClient(c: AdversarialCase) {
  const answerFor = (url: string | undefined): z.infer<typeof Reply> => (url && c.replies[url]) || { pageType: ["news", 0.95], sameClaim: ["yes", 0.95] };
  return {
    async chat(input: ChatInput): Promise<Result<ChatData>> {
      const source = JSON.parse(input.messages[1]!.content).source_text as string;
      const isPageType = input.messages[0]!.content.includes("\"page_type\"");
      let url: string | undefined;
      if (isPageType) url = c.pages.find((p) => toPlain(p.text).text === source)?.url;
      else {
        const sentence = normalise(JSON.parse(source).SENTENCE as string);
        url = c.pages.find((p) => toPlain(p.text).text.includes(sentence))?.url;
      }
      const a = answerFor(url);
      const data = isPageType ? reply("page_type", a.pageType[0], a.pageType[1]) : reply("same_claim", a.sameClaim[0], a.sameClaim[1]);
      return { data, usage: null as never, attempts: [] };
    },
  };
}

export type AdversarialResult = { trace: Trace; state: Trace["decision"]["state"]; originUrl: string | null };

// One case through the engine's code. Returns the trace with typed answers filled in and the code's decision.
export async function runAdversarialCase(c: AdversarialCase, rules: Rules = loadRules()): Promise<AdversarialResult> {
  const dir = mkdtempSync(join(tmpdir(), `pz-adv-${c.id}-`));
  const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
  const deps = { fetch: world(c.pages), usage, cache: createFileCache(join(dir, "http")), budget: createBudget(150), traceId: c.id };
  const { trace: walked } = await walkClaim(CLAIM, {
    tavily: createTavily({ ...deps, apiKey: "offline" }), wayback: createWayback(deps), usage, budget: deps.budget, rules,
    today: "2026-11-16", now: () => "2026-11-16T00:00:00.000Z", pagesDir: join(dir, "pages"),
  });
  const client = typedClient(c);
  const nodes = [];
  for (const node of walked.nodes) {
    if (node.meta) { nodes.push(node); continue; }
    const page = c.pages.find((p) => p.url === node.url);
    const [pageType] = await ask(QUESTIONS.filter((q) => q.id === "page_type"), toPlain(page?.text ?? "").text, { client, threshold: rules.confidenceThreshold });
    const span = walked.spans.find((s) => s.nodeId === node.id)!;
    const same = await sameClaim({ claim: CLAIM.text, sentence: span.text, atoms: CLAIM.atoms }, { client, rules });
    nodes.push({ ...node, pageType: pageType!, sameClaim: same.typed });
  }
  const typed: Trace = { ...walked, mode: "SAMPLE", synthetic: true, nodes };
  const decision = decideStopState(typed, rules);
  const originId = decision.state === "ORIGIN_FOUND" ? /earliest page (\S+) is/.exec(decision.reasons[0] ?? "")?.[1] : undefined;
  return { trace: { ...typed, decision }, state: decision.state, originUrl: nodes.find((n) => n.id === originId)?.url ?? null };
}

export type AdversarialPaths = { casesDir: string; lockPath: string };
export function adversarialLock(casesDir: string): string {
  return readdirSync(casesDir).filter((f) => f.endsWith(".json")).sort()
    .map((f) => `${createHash("sha256").update(readFileSync(join(casesDir, f))).digest("hex")}  ${f}\n`).join("");
}
export function relockAdversarial(paths: AdversarialPaths): void { writeFileSync(paths.lockPath, adversarialLock(paths.casesDir)); }

// `pz traps` second block: no planted page may ever be the origin, and each case's stop state must match.
export async function runAdversarial(paths: AdversarialPaths): Promise<{ code: number; lines: string[] }> {
  if (adversarialLock(paths.casesDir) !== readFileSync(paths.lockPath, "utf8"))
    return { code: 1, lines: ["FAIL lock check: traps/adversarial changed since adversarial.lock; review the change, then run pz traps --relock"] };
  const rules = loadRules();
  const files = readdirSync(paths.casesDir).filter((f) => f.endsWith(".json")).sort();
  const lines: string[] = [];
  let plantedOrigins = 0;
  for (const f of files) {
    const c = AdversarialCase.parse(JSON.parse(readFileSync(join(paths.casesDir, f), "utf8")));
    const r = await runAdversarialCase(c, rules);
    if (r.originUrl === c.planted) { plantedOrigins++; lines.push(`FAIL ${c.id}: the planted page ${c.planted} ended as ORIGIN_FOUND`); }
    if (r.state !== c.expect.state) lines.push(`FAIL ${c.id}: state ${r.state}, case expects ${c.expect.state}`);
    if (r.originUrl !== c.expect.origin) lines.push(`FAIL ${c.id}: origin ${r.originUrl ?? "none"}, case expects ${c.expect.origin ?? "none"}`);
  }
  const n = files.length;
  lines.push(`adversarial: planted origins ${plantedOrigins} of ${n} (95% upper bound ${plantedOrigins === 0 ? (bound(0, n) * 100).toFixed(1) + "%" : "n/a"}), `
    + "model replies written as fooled on every planted page, planted by us");
  return { code: lines.length === 1 ? 0 : 1, lines };
}
