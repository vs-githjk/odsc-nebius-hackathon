import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Trace, type TypedAnswer } from "pz/schema";
import { createBudget } from "../src/clients/budget.ts";
import { createFileCache } from "../src/clients/cache.ts";
import { createTavily } from "../src/clients/tavily.ts";
import { createWayback } from "../src/clients/wayback.ts";
import { MAX_SENTENCE_CHARS, menuLike, rankSentences, sentences, toPlain, walkStep } from "../src/engine/walk.ts";
import { loadRules } from "../src/rules/index.ts";
import { createUsageLog } from "../src/usage/log.ts";

// F5 (#192): spans are sentences. Every case here is shaped on a recorded E2 page.
const split = (markdown: string) => {
  const { text, breaks, lines } = toPlain(markdown);
  return sentences(text, [...breaks, ...lines]).map((s) => s.text);
};

describe("line breaks end nav rows, headlines and list items", () => {
  it("dev-18 fortune.com: the headline is its own sentence, not glued to the nav row above it", () => {
    const page = "Half of its K-8 students missed the math target\nNewsletters\nCFO Daily\nMIT report: 95% of generative AI pilots at companies are failing.\nBy Sheryl Estrada";
    expect(split(page)).toContain("MIT report: 95% of generative AI pilots at companies are failing.");
  });

  it("dev-06 accolades.utk.edu: a headline line ends at its full stop, even before a lower-case byline", () => {
    const page = "News\nResearch and Discovery\n10,000 Steps a Day to Stay Healthy Is a Myth.\nby Rebekah Goode 0 comments";
    expect(split(page)).toContain("10,000 Steps a Day to Stay Healthy Is a Myth.");
  });

  it("list items are sentences of their own, without their markers", () => {
    expect(split("Our findings:\n* Penguins nap 14 times a day.\n* Seals nap 7 times a day.")).toEqual(["Our findings:", "Penguins nap 14 times a day.", "Seals nap 7 times a day."]);
  });

  it("a soft-wrapped line in lower case still continues its sentence", () => {
    expect(split("Keepers found that penguins nap 14 times\na day during daylight hours.")).toEqual(["Keepers found that penguins nap 14 times a day during daylight hours."]);
  });

  it("keeps the page text itself, and its offsets, exactly as before", () => {
    const page = "Intro line\nPenguins nap 14 times a day, see [the log](https://zoo.example/log).";
    const { text, links } = toPlain(page);
    expect(text).toBe("Intro line Penguins nap 14 times a day, see the log.");
    expect(text.slice(links[0]!.start, links[0]!.end)).toBe("the log");
  });
});

describe("menuLike", () => {
  it("rejects the dev-06 language menu and a share bar", () => {
    expect(menuLike("* English * العربية * 中文 * Italiano * 日本語 What's the big deal about 10,000 steps a day?")).toBe(true);
    expect(menuLike("English العربية 中文 Italiano: 10,000 steps a day")).toBe(true);
    expect(menuLike("Health & Wellbeing 10,000 Steps Team 18 Apr 2017 * Share on Facebook * Share on X.com * Share on LinkedIn")).toBe(true);
  });

  it("keeps a plain sentence, and one with lookalike letters inside its words (the dry-run trap's 1972 page)", () => {
    expect(menuLike("You need to walk 10,000 steps a day to stay healthy.")).toBe(false);
    expect(menuLike("It іs ɑlso an intimate affair, ɑs fewer thɑn twߋ dozen runners tօok paгt in the 42.2 km race.")).toBe(false);
  });
});

describe("rankSentences", () => {
  it("puts the sentence carrying most of the claim's words first, then the shorter one", () => {
    const claim = "You need to walk 10,000 steps a day to stay healthy.";
    const ranked = rankSentences(claim, [
      { text: "10,000 Steps has been developed by CQUniversity Australia." },
      { text: "Experts long said you need to walk 10,000 steps a day to stay healthy." },
      { text: "Walk 10,000 steps a day to stay healthy." },
    ]);
    // All of the claim's words, then 6 of 8, then 2 of 8.
    expect(ranked.map((r) => r.text)).toEqual([
      "Experts long said you need to walk 10,000 steps a day to stay healthy.",
      "Walk 10,000 steps a day to stay healthy.",
      "10,000 Steps has been developed by CQUniversity Australia.",
    ]);
    // On equal word share, the shorter sentence wins.
    expect(rankSentences(claim, [{ text: "Walk 10,000 steps a day to stay healthy, as many say." }, { text: "Walk 10,000 steps a day to stay healthy." }])[0]!.text)
      .toBe("Walk 10,000 steps a day to stay healthy.");
  });
});

// The walk: same_claim is asked about the best sentence, and about the second when the first gets no confident yes.
const rules = loadRules();
const atoms = {
  number: { raw: "14", canonical: "14" }, unit: "times", subjectLemma: "penguins",
  population: null, time: null, hedge: null, namedSource: null, variants: ["14 times"],
};
const answer = (optionId: "yes" | "no", probability: number): TypedAnswer => ({
  questionId: "same_claim", optionId, probability, top: [{ optionId, p: probability }], model: "m", threshold: null,
});
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pz-f5-"));
});

async function walkOne(text: string, reply: (sentence: string) => TypedAnswer) {
  const page = { url: "https://zoo.example/report", date: "2020-05-01", text };
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/cdx/")) return new Response("[]");
    const body = JSON.parse(String(init?.body));
    if (url.endsWith("/search")) {
      const results = [{ url: page.url, title: "A page", content: "penguins nap 14 times a day", score: 0.5, published_date: page.date }];
      return new Response(JSON.stringify({ query: body.query, results, usage: { credits: 1 } }));
    }
    return new Response(JSON.stringify({ results: [{ url: page.url, title: "A page", raw_content: page.text }], failed_results: [], usage: { credits: 1 } }));
  }) as typeof fetch;
  const asked: string[] = [];
  const askSameClaim = async ({ sentence }: { sentence: string }) => {
    asked.push(sentence);
    const typed = reply(sentence);
    return { candidate: typed.optionId === "yes", codeHit: true, typed, mode: "model" as const, reason: null };
  };
  const handed = Trace.parse({
    schemaVersion: "1", id: "f5", mode: "LIVE", synthetic: false, recordedAt: "2026-11-12T00:00:00.000Z",
    claim: { text: "Harbor Zoo penguins nap 14 times a day.", atoms }, viralSentence: "Harbor Zoo penguins nap 14 times a day.",
    nodes: [], edges: [], clusters: [], spans: [], hops: [], blame: [],
    roots: { pages: 0, clusters: 0, rootsLinked: 0, clustersUnlinked: 0, studiesFound: null }, redHopEdgeId: null,
    earliest: { nodeIds: [], earlierWindowSearches: 0, earlierFound: 0 }, failure: null,
    budget: { credits: 0, usd: 0, ms: 0, capHit: null },
    decision: { state: "NO_PAGES_FOUND", row: 3, reasons: [], counts: {} }, searchLog: [], usage: [], scopeNote: "",
  });
  const t = await walkStep(() => {
    const usage = createUsageLog({ path: join(dir, "usage.jsonl") });
    const b = { fetch: impl, usage, cache: createFileCache(join(dir, "http")), budget: createBudget(150), traceId: "f5" };
    return {
      tavily: createTavily({ ...b, apiKey: "test-key" }), wayback: createWayback(b), usage, budget: b.budget, rules,
      today: "2026-11-12", now: () => "2026-11-12T00:00:00.000Z", pagesDir: join(dir, "pages"), askSameClaim,
    };
  })(handed, {});
  const node = t.nodes.find((n) => n.url === page.url)!;
  return { span: t.spans.find((s) => s.nodeId === node.id)!.text, sameClaim: node.sameClaim, asked };
}

const BEST = "Harbor Zoo penguins nap 14 times a day.";
const SECOND = "Visitors at the zoo see the penguins nap 14 times a day, keepers say.";
const page = `${SECOND} Some more words about the zoo shop. ${BEST}`;

describe("same_claim about the top two sentences (dev-10, dev-18)", () => {
  it("asks about the best-ranked sentence first, even when it comes later on the page", async () => {
    const r = await walkOne(page, () => answer("yes", 0.97));
    expect(r.asked).toEqual([BEST]);
    expect(r.span).toBe(BEST);
  });

  it("when the best sentence gets a 'no', asks about the second, and keeps it as the span when it gets a confident yes", async () => {
    const r = await walkOne(page, (s) => (s === BEST ? answer("no", 0.9) : answer("yes", 0.95)));
    expect(r.asked).toEqual([BEST, SECOND]);
    expect(r.span).toBe(SECOND);
    expect(r.sameClaim?.optionId).toBe("yes");
  });

  it("when neither says yes, the best sentence and its own answer stand, and no third question is asked", async () => {
    const third = "Penguins nap 14 times a day in winter, a guide says.";
    const r = await walkOne(`${page} ${third}`, () => answer("no", 0.9));
    expect(r.asked).toHaveLength(2);
    expect(r.span).toBe(BEST);
    expect(r.sameClaim?.optionId).toBe("no");
  });
});

// XO on #209: hard-wrapped text (most PDFs) breaks lines mid-sentence. Each of these pages kept its node on main; with
// only the line split they lost it. When no split sentence states the claim, the page is read by sentence ends alone.
describe("hard-wrapped text falls back to whole sentences", () => {
  const yes = () => answer("yes", 0.97);
  it.each([
    ["a line that ends mid-phrase before the number (dev-09 style)", "Keepers counted naps and found that penguins nap around\n14 times a day in the colony."],
    ["a line that ends before a capitalised word", "Among the zoo penguins\nObserved by keepers, naps came 14 times a day."],
    ["a line that ends on an abbreviation's full stop", "Penguins kept in the U.S.\nhave been seen to nap 14 times a day."],
  ])("%s keeps its page and its whole sentence", async (_, text) => {
    const r = await walkOne(text, yes);
    expect(r.span).toBe(text.replace(/\n/g, " "));
  });

  it("the fallback still rejects menus", () => {
    const { text } = toPlain("* Home * Penguins\n* 14 times a day * Shop");
    expect(sentences(text).filter((s) => !menuLike(s.text)).map((s) => s.text)).toEqual([]);
  });
});

describe("one sentence cap for split and fallback sentences (XO on #209)", () => {
  const long = (n: number) => `Keepers found that penguins nap 14 times a day, ${"and they watched them through every season of the year ".repeat(n).trim()}.`;
  it("is main's 600 characters", () => {
    expect(MAX_SENTENCE_CHARS).toBe(600);
  });

  it("keeps a long real sentence under the cap, split or hard-wrapped, and drops a run over it", async () => {
    const under = long(8);
    expect(under.length).toBeGreaterThan(400);
    expect(under.length).toBeLessThanOrEqual(600);
    expect((await walkOne(under, () => answer("yes", 0.97))).span).toBe(under);
    // Each walk gets its own HTTP cache: the page URL is the same, and a cached page would answer the next walk.
    dir = mkdtempSync(join(tmpdir(), "pz-f5-"));
    const wrapped = under.replace("penguins nap", "penguins\nnap");
    expect((await walkOne(wrapped, () => answer("yes", 0.97))).span).toBe(under);
    dir = mkdtempSync(join(tmpdir(), "pz-f5-"));
    const over = long(12);
    expect(over.length).toBeGreaterThan(600);
    // No sentence under the cap states the claim, so the page gives no node.
    await expect(walkOne(over, () => answer("yes", 0.97))).rejects.toThrow();
  });
});
