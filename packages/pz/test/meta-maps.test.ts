import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBudget } from "../src/clients/budget.ts";
import { createFileCache } from "../src/clients/cache.ts";
import { createTavily } from "../src/clients/tavily.ts";
import { createWayback } from "../src/clients/wayback.ts";
import { renderCard } from "../src/card/terminal.ts";
import { lintText } from "../src/cli/lint-copy.ts";
import { walkClaim, type SpikeClaim } from "../src/engine/walk.ts";
import { decideStopState, loadRules } from "../src/rules/index.ts";
import type { Trace } from "../src/schema/index.ts";
import { verifyTrace } from "../src/verify/checks.ts";

const rules = loadRules();
const claim: SpikeClaim = {
  id: "meta-maps", text: "Harbor Zoo penguins nap 14 times a day.",
  atoms: { number: { raw: "14", canonical: "14" }, unit: "times", subjectLemma: "penguin", population: null, time: null, hedge: null, namedSource: null, variants: ["14 times"] },
};

// A web where the origin dataset is never returned by an ordinary search: only a fact-check page links to it.
type Page = { url: string; date: string | null; text: string; searchable: boolean; factCheck?: boolean };
const blog: Page = { url: "https://blog.example/penguins", date: "2021-03-01", text: "Wow: penguins nap 14 times a day!", searchable: true };
const check: Page = { url: "https://www.snopes.com/fact-check/penguin-naps", date: "2022-01-01", searchable: true, factCheck: true,
  text: "Claim: penguins nap 14 times a day. The figure traces to the [Harbor Zoo keeper dataset](https://zoo.example/dataset), which counted 14 naps.\n\nAbout this site: we rate viral content every day, with a small team of editors and reporters who answer reader questions and publish corrections openly when we get things wrong. Follow us on [social media](https://social.example/post) or browse [our other checks](https://www.snopes.com/archive)." };
const dataset: Page = { url: "https://zoo.example/dataset", date: "2019-04-30", text: "Over 90 days the keepers recorded that the adult penguins nap 14 times a day.", searchable: false };

function world(pages: Page[]) {
  const calls: { endpoint: string; body: Record<string, unknown> }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    // A page reached by a link has no search date, so its date comes from its first archive capture.
    if (url.includes("/cdx/")) {
      const target = new URL(url).searchParams.get("url") ?? "";
      return new Response(JSON.stringify(target.includes("zoo.example/dataset") ? [["timestamp", "original"], ["20190501000000", target]] : [["timestamp", "original"]]));
    }
    const body = JSON.parse(String(init?.body));
    calls.push({ endpoint: url.split("/").at(-1)!, body });
    if (url.endsWith("/search")) {
      const only = body.include_domains as string[] | undefined;
      const results = pages.filter((p) => p.searchable && (only ? p.factCheck : !p.factCheck) && (!body.end_date || (p.date !== null && p.date <= body.end_date)))
        .map((p) => ({ url: p.url, title: "A page", content: p.text.slice(0, 80), score: 0.5, published_date: p.date }));
      return new Response(JSON.stringify({ query: body.query, results, usage: { credits: 1 } }));
    }
    const results = pages.filter((p) => (body.urls as string[]).some((u) => p.url.replace("www.", "") === u.replace("www.", ""))).map((p) => ({ url: p.url, title: "A page", raw_content: p.text }));
    return new Response(JSON.stringify({ results, failed_results: [], usage: { credits: 1 } }));
  }) as typeof fetch;
  return { impl, calls };
}
function walk(pages: Page[], ruleSet = rules) {
  const dir = mkdtempSync(join(tmpdir(), "pz-meta-"));
  const w = world(pages);
  const deps = { fetch: w.impl, cache: createFileCache(join(dir, "http")), budget: createBudget(150), traceId: claim.id };
  const usage = { rows: [] as Trace["usage"], append(r: Trace["usage"][number]) { this.rows.push(r); } };
  return walkClaim(claim, { tavily: createTavily({ ...deps, usage, apiKey: "test-key" }), wayback: createWayback({ ...deps, usage }), usage, budget: deps.budget, rules: ruleSet,
    today: "2026-11-02", now: () => "2026-11-02T00:00:00.000Z", pagesDir: join(dir, "pages") }).then((r) => ({ ...r, calls: w.calls }));
}
// The typed answers a pipeline would add: the dataset is a dataset, every page states the claim.
const typed = (t: Trace): Trace => ({ ...t, nodes: t.nodes.map((n) => ({ ...n,
  pageType: { questionId: "page_type", optionId: n.url.includes("zoo.example") ? "dataset" : "news", probability: 0.97, top: [], model: "stub", threshold: null },
  sameClaim: { questionId: "same_claim", optionId: "yes", probability: 0.97, top: [], model: "stub", threshold: null } })) });

describe("T49 meta pages as maps", () => {
  it("one extra search, limited to the fact-check domains, finds the map", async () => {
    const { calls } = await walk([blog, check, dataset]);
    const meta = calls.filter((c) => c.endpoint === "search" && c.body.include_domains);
    expect(meta).toHaveLength(1);
    expect(meta[0]!.body.include_domains).toEqual(rules.factCheckDomains);
  });

  it("reads the fact-check page as a meta node, follows what it cites first, and the origin stands on its own span", async () => {
    const { trace } = await walk([blog, check, dataset]);
    const map = trace.nodes.find((n) => n.domain === "snopes.com")!;
    expect([map.meta, map.spanIds, map.candidateParents.map((p) => p.url)]).toEqual([true, [], ["https://zoo.example/dataset"]]);
    const origin = trace.nodes.find((n) => n.url === "https://zoo.example/dataset")!;
    expect(origin.foundViaMeta).toBe(map.url);
    expect(trace.spans.find((s) => s.nodeId === origin.id)?.text).toBe("Over 90 days the keepers recorded that the adult penguins nap 14 times a day.");
    expect(trace.earliest.nodeIds).toEqual([origin.id]);
    const decided = typed(trace);
    expect(decideStopState(decided, rules).state).toBe("ORIGIN_FOUND");
    expect(verifyTrace({ ...decided, decision: decideStopState(decided, rules) }).failures).toEqual([]);
  });

  it("without the map, the dataset is never found", async () => {
    const { trace } = await walk([blog, check, dataset], { ...rules, metaMaps: false });
    expect(trace.nodes.map((n) => n.url)).not.toContain("https://zoo.example/dataset");
    expect(trace.nodes.some((n) => n.domain === "snopes.com")).toBe(false);
  });

  it("a meta page alone never makes an origin, however the typed answers read", async () => {
    const noDataset = { ...check, text: "Claim: penguins nap 14 times a day. We found no source for it." };
    const { trace } = await walk([noDataset]);
    const confident = { ...typed(trace), nodes: typed(trace).nodes.map((n) => ({ ...n, pageType: { ...n.pageType!, optionId: "study" } })) };
    expect(decideStopState(confident, rules).state).toBe("NO_PAGES_FOUND");
  });

  it("a cited page that is itself meta (it says myth) is off the path and never carries foundViaMeta, so pz verify passes", async () => {
    const mythy = { ...dataset, text: "Keepers tested the myth and found that the adult penguins nap 14 times a day." };
    const { trace } = await walk([blog, check, mythy]);
    const node = trace.nodes.find((n) => n.url === "https://zoo.example/dataset");
    expect(node).toBeDefined();
    expect([node!.meta, node!.foundViaMeta]).toEqual([true, null]);
    const decided = typed(trace);
    expect(verifyTrace({ ...decided, decision: decideStopState(decided, rules) }).failures).toEqual([]);
  });

  it("the card says a fact-check page pointed the way, and pz verify checks the map really cites the page", async () => {
    const { trace } = await walk([blog, check, dataset]);
    const decided = typed(trace);
    const full = { ...decided, decision: decideStopState(decided, rules) };
    const card = renderCard(full);
    expect(card.replace(/\n {9}/g, " ")).toContain("Found through snopes.com, a page about the claim; that page is a map, never the origin.");
    expect(lintText(card)).toEqual([]);
    const origin = full.nodes.find((n) => n.url === "https://zoo.example/dataset")!;
    const forged = { ...full, nodes: full.nodes.map((n) => (n.id === origin.id ? { ...n, foundViaMeta: "https://blog.example/penguins" } : n)) };
    expect(verifyTrace(forged).failures.map((f) => f.check)).toContain("via_meta");
  });
});
