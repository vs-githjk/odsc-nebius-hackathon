import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createBudget } from "../src/clients/budget.ts";
import { createFileCache } from "../src/clients/cache.ts";
import { createTavily } from "../src/clients/tavily.ts";
import { createWayback } from "../src/clients/wayback.ts";
import { renderCard } from "../src/card/terminal.ts";
import { lintText } from "../src/cli/lint-copy.ts";
import type { Embed } from "../src/engine/cluster.ts";
import { createEmbedder, EMBED_MODEL, findOtherNumber, otherNumberCandidate } from "../src/engine/similar.ts";
import { walkClaim, type SpikeClaim } from "../src/engine/walk.ts";
import { loadRules } from "../src/rules/index.ts";
import { createUsageLog } from "../src/usage/log.ts";
import { verifyTrace } from "../src/verify/checks.ts";

const rules = loadRules();
const claim: SpikeClaim = {
  id: "similar", text: "Harbor Zoo penguins nap 14 times a day.",
  atoms: { number: { raw: "14", canonical: "14" }, unit: "times", subjectLemma: "penguins", population: null, time: null, hedge: null, namedSource: null, variants: ["14 times"] },
};

// Hand-made vectors standing in for Qwen3-Embedding-8B: sentences about penguins napping point one way, anything
// else another. Real vectors are measured in eval/drift/measure.ts, live.
const fakeEmbed = (): Embed & { batches: string[][] } => {
  const batches: string[][] = [];
  const embed = async (texts: string[]) => {
    batches.push(texts);
    return texts.map((t) => (/nap/i.test(t) ? [1, /fun fact/i.test(t) ? 0.3 : 0.05, 0] : /fed|feed/i.test(t) ? [0, 1, 0] : [0, 0, 1]));
  };
  return Object.assign(embed, { batches });
};

type Page = { url: string; date: string | null; text: string; title?: string };
function world(pages: Page[]) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/cdx/")) return new Response("[]");
    const body = JSON.parse(String(init?.body));
    if (url.endsWith("/search")) {
      const results = pages.filter((p) => !body.end_date || (p.date !== null && p.date <= body.end_date))
        .map((p) => ({ url: p.url, title: p.title ?? "A page", content: p.text.slice(0, 80), score: 0.5, published_date: p.date }));
      return new Response(JSON.stringify({ query: body.query, results, usage: { credits: 1 } }));
    }
    const results = pages.filter((p) => body.urls.includes(p.url)).map((p) => ({ url: p.url, title: p.title ?? "A page", raw_content: p.text }));
    return new Response(JSON.stringify({ results, failed_results: [], usage: { credits: 1 } }));
  }) as typeof fetch;
}
function walk(pages: Page[], embed?: Embed) {
  const dir = mkdtempSync(join(tmpdir(), "pz-similar-"));
  const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
  const deps = { fetch: world(pages), usage, cache: createFileCache(join(dir, "http")), budget: createBudget(150), traceId: claim.id };
  return walkClaim(claim, {
    tavily: createTavily({ ...deps, apiKey: "test-key" }), wayback: createWayback(deps), usage, budget: deps.budget, rules,
    today: "2026-11-02", now: () => "2026-11-02T00:00:00.000Z", pagesDir: join(dir, "pages"), ...(embed ? { embed } : {}),
  });
}

const pages: Page[] = [
  // Two rewordings of the claim, same number.
  { url: "https://zoo.example/log", date: "2019-04-30", text: "Keepers counted it: the penguins nap 14 times a day." },
  { url: "https://news.example/story", date: "2020-02-01", text: "Penguins nap 14 times a day, the zoo says." },
  // The claim with the number drifted.
  { url: "https://blog.example/drift", date: "2021-06-01", text: "Fun fact: Harbor Zoo penguins nap 15 times a day." },
  // An unrelated sentence with the subject and another number.
  { url: "https://feed.example/meals", date: "2018-01-01", text: "The penguins are fed 3 times a day at the zoo." },
];

describe("T97 embedder", () => {
  it("batches distinct texts, 32 to a request, caches by text hash, and makes no call on a warm cache", async () => {
    const embed = vi.fn(async ({ input }: { model: string; input: string[] }) => ({ data: { embeddings: input.map((t) => [t.length, 1]) }, usage: null as never, attempts: [] }));
    const dir = mkdtempSync(join(tmpdir(), "pz-embed-"));
    const e = createEmbedder({ embed }, { cacheDir: dir });
    const texts = Array.from({ length: 40 }, (_, i) => `sentence ${i}`);
    const first = await e([...texts, texts[0]!]);
    expect(embed).toHaveBeenCalledTimes(2);
    expect(embed.mock.calls[0]![0]).toMatchObject({ model: EMBED_MODEL });
    expect(embed.mock.calls[0]![0].input).toHaveLength(32);
    expect(first.at(-1)).toEqual(first[0]);
    expect(readdirSync(dir)).toHaveLength(40);
    const warm = createEmbedder({ embed }, { cacheDir: dir });
    expect(await warm(texts)).toEqual(first.slice(0, 40));
    expect([embed.mock.calls.length, warm.calls()]).toEqual([2, 0]);
  });
});

describe("T97 code's gate before any embedding", () => {
  it("passes a sentence with the subject and another number, never one with the claim's number, no subject or a negation", () => {
    expect(otherNumberCandidate("Harbor Zoo penguins nap 15 times a day.", claim.atoms, rules)).toBe("15");
    expect(otherNumberCandidate("The penguins nap fifteen times a day.", claim.atoms, rules)).toBe("fifteen");
    expect(otherNumberCandidate("Harbor Zoo penguins nap 14 times a day.", claim.atoms, rules)).toBeNull();
    expect(otherNumberCandidate("Seals nap 15 times a day.", claim.atoms, rules)).toBeNull();
    expect(otherNumberCandidate("It is a myth that penguins nap 15 times a day.", claim.atoms, rules)).toBeNull();
    expect(otherNumberCandidate("In 2019 the penguins moved house.", claim.atoms, rules)).toBeNull();
  });
});

describe("T97 the same claim with another number", () => {
  it("finds a drifted number and ignores an unrelated sentence that shares the subject", async () => {
    const embed = fakeEmbed();
    expect(await findOtherNumber(claim.text, claim.atoms, ["Fun fact: Harbor Zoo penguins nap 15 times a day."], embed, rules))
      .toEqual({ sentence: "Fun fact: Harbor Zoo penguins nap 15 times a day.", number: "15", similarity: 0.971 });
    expect(await findOtherNumber(claim.text, claim.atoms, ["The penguins are fed 3 times a day at the zoo."], embed, rules)).toBeNull();
    // Nothing passes code's gate, so nothing is embedded.
    const quiet = fakeEmbed();
    expect(await findOtherNumber(claim.text, claim.atoms, ["Seals are loud."], quiet, rules)).toBeNull();
    expect(quiet.batches).toEqual([]);
  });

  it("the cutoff is code's: the same vectors under a higher otherNumberSimilarity list nothing", async () => {
    expect(await findOtherNumber(claim.text, claim.atoms, ["Fun fact: Harbor Zoo penguins nap 15 times a day."], fakeEmbed(), { ...rules, otherNumberSimilarity: 0.98 })).toBeNull();
  });
});

describe("T97 in the walk", () => {
  it("without embeddings the walk is unchanged: no otherNumbers field, exact-wording clusters", async () => {
    const { trace } = await walk(pages);
    expect(trace.otherNumbers).toBeUndefined();
    expect(trace.roots.clusters).toBe(2);
  });

  it("with embeddings, reworded copies join one cluster and the drifted page is listed, not made a node", async () => {
    const { trace } = await walk(pages, fakeEmbed());
    expect(trace.roots.clusters).toBe(1);
    expect(trace.clusters.find((c) => c.nodeIds.length === 2)?.rule).toBe("near_duplicate");
    expect(trace.otherNumbers).toEqual([{ url: "https://blog.example/drift", domain: "blog.example", title: "A page", date: "2021-06-01",
      sentence: "Fun fact: Harbor Zoo penguins nap 15 times a day.", number: "15", similarity: 0.971 }]);
    expect(trace.nodes.map((n) => n.url)).not.toContain("https://blog.example/drift");
    expect(trace.nodes.map((n) => n.url)).not.toContain("https://feed.example/meals");
    expect(verifyTrace(trace).failures.filter((f) => f.check === "other_numbers")).toEqual([]);
    const card = renderCard(trace);
    expect(card).toContain("Numbers  15 instead of 14 on blog.example (2021-06-01)");
    expect(lintText(card)).toEqual([]);
  });

  it("pz verify fails a listed page that does not pass code's gate or sits under the cutoff", async () => {
    const { trace } = await walk(pages, fakeEmbed());
    const o = trace.otherNumbers![0]!;
    expect(verifyTrace({ ...trace, otherNumbers: [{ ...o, similarity: 0.5 }] }).failures.map((f) => f.check)).toContain("other_numbers");
    expect(verifyTrace({ ...trace, otherNumbers: [{ ...o, sentence: "Harbor Zoo penguins nap 14 times a day." }] }).failures.map((f) => f.check)).toContain("other_numbers");
  });

  it("an embedding failure keeps the walk going with exact-wording clusters", async () => {
    const broken: Embed = async () => { throw new Error("tokenfactory http_error 503"); };
    const { trace } = await walk(pages, broken);
    expect(trace.roots.clusters).toBe(2);
    expect(trace.otherNumbers).toEqual([]);
  });
});
