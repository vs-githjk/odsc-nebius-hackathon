import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CARD_PROMPT, buildCard, cardProblems, pageType, type AskPage } from "../src/card/index.ts";
import type { ChatData, ChatInput } from "../src/clients/tokenfactory.ts";
import type { Trace } from "../src/schema/index.ts";
import { ask } from "../src/typed/ask.ts";
import { falseCertainty } from "../src/verify/index.ts";
import { unbacked } from "../src/verify/false-certainty.ts";

const load = (id: string): Trace => JSON.parse(readFileSync(new URL(`../../../fixtures/traces/${id}.json`, import.meta.url), "utf8"));
const origin = load("sample-origin");
const rich = load("sample-rich");
const data = (content: string): ChatData => ({ content, logprobs: null, model: "Qwen/Qwen3-30B-A3B-Instruct-2507" });
const clientFor = (sentence: string) => ({ chat: vi.fn(async (_: ChatInput) => ({ data: data(JSON.stringify({ sentence })), usage: null as never, attempts: [] })) });
const GOOD = "The keeper log dated 2019-04-30 says the adult penguins napped a median of 14 times a day.";

describe("origin card", () => {
  it("keeps a sentence the spans back, with the state, rule row and checked sentence from code", async () => {
    const card = await buildCard(origin, { client: clientFor(GOOD) });
    expect(card).toMatchObject({ state: "ORIGIN_FOUND", row: 5, sentence: GOOD, dropped: null });
    expect(card.earliest).toEqual([{ nodeId: "keeper-log", url: origin.nodes[0]!.url, domain: origin.nodes[0]!.domain, date: "2019-04-30",
      dateKind: origin.nodes[0]!.date.kind, spanId: "s-keeper-log", checkedSentence: origin.spans.find((s) => s.id === "s-keeper-log")!.text }]);
  });

  it("drops a sentence with a number, name or quote that is not in the spans", async () => {
    const cases: [string, string][] = [
      ["The keeper log dated 2019-04-30 says the adult penguins napped a median of 15 times a day.", "number not in the spans: 15"],
      ["The keeper log dated 2019-04-30 says Dr Okafor counted 14 naps a day.", "name not in the spans: Okafor"],
      ["The keeper log dated 2019-04-30 calls them \"the sleepiest birds\" at 14 naps a day.", "quote not in the spans: \"the sleepiest birds\""],
      ["The keeper log dated 2019-04-30 says the adult penguins napped a median of fifteen times a day.", "number not in the spans: fifteen"],
      ["The keeper log dated 2019-04-30 calls them 'the sleepiest birds' at 14 naps a day.", "quote not in the spans: \"the sleepiest birds\""],
      ["The keeper log dated 2019-04-30 says 14 naps a day, according to dr okafor.", "name not in the spans: okafor"],
    ];
    for (const [sentence, reason] of cases) {
      const card = await buildCard(origin, { client: clientFor(sentence) });
      expect(card.sentence).toBeNull();
      expect(card.dropped).toEqual({ sentence, reasons: expect.arrayContaining([reason]) });
      expect(falseCertainty(origin, { cardSentence: sentence }).sentenceStrongerThanSpans).toBeGreaterThan(0);
    }
  });

  it("does not read an ordinary word after a job title as a name, and lets the sentence count the earliest pages", () => {
    const spans = ["The adult penguins napped a median of 14 times a day during daylight hours."];
    expect(unbacked("The zoo's president said the penguins napped 14 times a day.", spans).names).toEqual([]);
    expect(unbacked("Two earliest pages say the adult penguins napped 14 times a day.", spans, [], 2).numbers).toEqual([]);
    expect(unbacked("Two earliest pages say the adult penguins napped 14 times a day.", spans, [], 1).numbers).toEqual(["Two"]);
  });

  it("counts written as words the number parser skips: one time, a dozen, half a dozen", () => {
    const spans = ["The adult penguins napped a median of 14 times a day, twice as often as the seals."];
    expect(unbacked("The keeper log says the penguins napped one time a day.", spans).numbers).toEqual(["one time"]);
    expect(unbacked("The keeper log says the penguins napped a dozen times a day.", spans).numbers).toEqual(["a dozen"]);
    expect(unbacked("The keeper log says the penguins napped half a dozen times a day.", spans).numbers).toEqual(["half a dozen"]);
    expect(unbacked("The keeper log says the penguins napped 14 times a day, twice as often as the seals.", spans).numbers).toEqual([]);
  });

  it("never calls a first-archive-capture date published, and tells the model what each date means", async () => {
    const capped: typeof origin = { ...origin, nodes: origin.nodes.map((n) => origin.earliest.nodeIds.includes(n.id)
      ? { ...n, date: { ...n.date, kind: "existed_by" as const, source: "wayback_first_capture" as const } } : n) };
    const said = "The keeper log, published 2019-04-30, says the adult penguins napped a median of 14 times a day.";
    expect(cardProblems(said, capped)).toEqual(['says "published" but no earliest page has a published date']);
    expect(cardProblems(said, origin)).toEqual([]);
    expect(cardProblems("The keeper log was online by 2019-04-30 and says the adult penguins napped a median of 14 times a day.", capped)).toEqual([]);
    const seen: string[] = [];
    await buildCard(capped, { client: { chat: async (input) => { seen.push(JSON.stringify(input.messages)); return clientFor(said).chat(input); } } });
    expect(seen[0]).toContain("online_by");
  });

  it("drops an invented first-word name and a date that is not an earliest page's date", async () => {
    const name = "Okafor wrote that the adult penguins napped a median of 14 times a day.";
    expect((await buildCard(origin, { client: clientFor(name) })).dropped!.reasons).toEqual(["name not in the spans: Okafor"]);
    const wrong = "The keeper log dated 2017-01-01 says the adult penguins napped a median of 14 times a day.";
    expect((await buildCard(origin, { client: clientFor(wrong) })).dropped!.reasons).toEqual(["date is not an earliest page's date: 2017-01-01"]);
    for (const ok of ["Penguins napped a median of 14 times a day, says a keeper log from April 2019.",
      "The zoo's keeper log from April 2019 says the adult penguins napped a median of fourteen times a day.", "On 30 April 2019 a keeper log said the adult penguins napped 14 times a day."])
      expect([ok, cardProblems(ok, origin)]).toEqual([ok, []]);
    expect(cardProblems("A keeper log from March 2019 says the adult penguins napped 14 times a day.", origin)).toEqual(["date is not an earliest page's date: March 2019"]);
  });

  it("drops a sentence that names a start without ORIGIN_FOUND, or breaks a copy rule", async () => {
    const cold = "The claim originated in a zoo report that says our adult penguins nap about 14 times a day.";
    expect((await buildCard(rich, { client: clientFor(cold) })).dropped!.reasons).toEqual(['says "originated" without ORIGIN_FOUND']);
    for (const [words, sentence] of [["comes from", "The claim comes from a zoo report that says our adult penguins nap about 14 times a day."],
      ["first page to say", "A zoo report is the first page to say our adult penguins nap about 14 times a day."]] as const)
      expect(cardProblems(sentence, rich)).toEqual([`says "${words}" without ORIGIN_FOUND`]);
    expect(cardProblems(cold.replace("zoo report", "keeper log"), origin)).toEqual([]);
    const banned = "The keeper log dated 2019-04-30 proves the adult penguins napped 14 times a day.";
    expect(cardProblems(banned, origin)).toEqual(['copy rule: "proves"']);
  });

  it("shows every earliest page and asks nothing when there is none", async () => {
    const both = await buildCard(load("sample-conflicting"), { client: clientFor("x") });
    expect(both.earliest.map((e) => e.nodeId)).toEqual(["keeper-log", "zoo-faq"]);
    const client = clientFor(GOOD);
    expect(await buildCard(load("sample-no-pages"), { client })).toMatchObject({ state: "NO_PAGES_FOUND", earliest: [], sentence: null, dropped: null });
    expect(client.chat).not.toHaveBeenCalled();
  });

  it("sends the trace as data with the pinned model, and types a bad reply", async () => {
    const client = clientFor(GOOD);
    await buildCard(origin, { client });
    const [request] = client.chat.mock.calls[0]!;
    expect(request.model).toBe("Qwen/Qwen3-30B-A3B-Instruct-2507");
    expect(request.messages[0]).toEqual({ role: "system", content: CARD_PROMPT });
    expect(JSON.parse(JSON.parse(request.messages[1]!.content).source_text)).toEqual({ claim: origin.claim.text, state: "ORIGIN_FOUND",
      earliest: [{ domain: origin.nodes[0]!.domain, date: "2019-04-30", date_kind: "published", sentence: origin.spans[0]!.text }] });
    const bad = { chat: vi.fn(async () => ({ data: data("{}"), usage: null as never, attempts: [] })) };
    await expect(buildCard(origin, { client: bad })).rejects.toMatchObject({ code: "bad_response" });
  });
});

describe("page type", () => {
  it("is its own ask call with the page text only", async () => {
    const content = '{"page_type":"dataset"}';
    const logprobs = { content: [{ token: '{"page_type":"', logprob: 0, top_logprobs: [] },
      { token: "dataset", logprob: Math.log(0.9), top_logprobs: [{ token: "dataset", logprob: Math.log(0.9) }, { token: "report", logprob: Math.log(0.1) }] },
      { token: '"}', logprob: 0, top_logprobs: [] }] };
    const client = { chat: vi.fn(async (_: ChatInput) => ({ data: { ...data(content), logprobs }, usage: null as never, attempts: [] })) };
    const askPage: AskPage = (questions, page) => ask(questions, page, { client, threshold: null });
    const answer = await pageType("Keeper log, April 2019.", askPage);
    expect(answer).toMatchObject({ questionId: "page_type", optionId: "dataset", probability: expect.closeTo(0.9) });
    expect(client.chat).toHaveBeenCalledTimes(1);
    const [request] = client.chat.mock.calls[0]!;
    expect(JSON.parse(request.messages[0]!.content).map((q: { id: string }) => q.id)).toEqual(["page_type"]);
    expect(JSON.parse(request.messages[1]!.content)).toEqual({ source_text: "Keeper log, April 2019." });
  });
});
