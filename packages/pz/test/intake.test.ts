import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ChatInput } from "../src/clients/tokenfactory.ts";
import { INTAKE_PROMPT, intake, sentences } from "../src/engine/intake.ts";
import { normalise } from "../src/rules/index.ts";

type Recorded = { note: string; answer: string; response: { model: string; content: string } };
const dir = new URL("./recorded/intake/", import.meta.url);
const recorded: Record<string, Recorded> = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".json"))
  .map((f) => [f.replace(".json", ""), JSON.parse(readFileSync(new URL(f, dir), "utf8"))]));
const clientFor = (content: string) => ({ chat: vi.fn(async (_: ChatInput) => ({ data: { content, logprobs: null, model: "Qwen/Qwen3-30B-A3B-Instruct-2507" }, usage: null as never, attempts: [] })) });
const run = (name: string) => { const r = recorded[name]!; const client = clientFor(r.response.content); return intake(r.answer, { client }).then((out) => ({ ...out, client })); };
const accepted = (out: Awaited<ReturnType<typeof run>>) => out.claims.map((c) => [c.text, c.number.raw]);
const reasons = (out: Awaited<ReturnType<typeof run>>) => out.rejected.map((r) => [r.number, r.reason]);

describe("intake", () => {
  it("[C11] keeps every listed statistic that is in the pasted text, one per number", async () => {
    expect(Object.keys(recorded)).toHaveLength(5);
    const out = await run("01-plain");
    expect(accepted(out)).toEqual([
      ["Keepers counted 14 naps a day for the adult birds.", "14"],
      ["The colony has 212 penguins, and 38% of them are chicks this year.", "212"],
      ["The colony has 212 penguins, and 38% of them are chicks this year.", "38%"],
    ]);
    expect(out.rejected).toEqual([]);
    for (const c of out.claims) expect(c.text).toBe(recorded["01-plain"]!.answer.slice(c.start, c.end));
  });

  it("[C11] rejects a sentence the model reworded, with the reason not_in_text", async () => {
    const out = await run("02-paraphrase");
    expect(reasons(out)).toEqual([["3,400", "not_in_text"]]);
    expect(accepted(out)).toEqual([
      ["According to the Larkfield survey, about 3,400 residents cycle to work.", "3,400"],
      ["Only 1 in 8 of them wears a helmet.", "8"],
    ]);
  });

  it("[C11] takes the number from the sentence, never from the model", async () => {
    const out = await run("03-invented-number");
    expect(reasons(out)).toEqual([["4.5", "number_not_in_sentence"], ["0.61", "number_not_in_sentence"]]);
    expect(accepted(out)).toEqual([["Last summer it fell to 61% of capacity.", "61%"]]);
    expect(out.claims[0]!.number.canonical).toBe("61%");
    // The model wrote "3400"; the claim carries the sentence's own "3,400".
    expect((await run("02-paraphrase")).claims[0]!.number).toEqual({ raw: "3,400", canonical: "3400" });
  });

  it("[C11] names ranges, duplicates and missing sentences", async () => {
    const out = await run("04-ranges-and-dupes");
    expect(reasons(out)).toEqual([["900-1,100", "range"], ["25", "duplicate"], ["7", "not_in_text"]]);
    expect(accepted(out).map(([, n]) => n)).toEqual(["12", "25"]);
  });

  it("[C11] an instruction inside the pasted answer cannot add a claim", async () => {
    const out = await run("05-injection");
    expect(reasons(out)).toEqual([["400", "not_in_text"]]);
    expect(accepted(out)).toEqual([["Meanwhile, the Quill Street bakery sells 1,250 loaves a week.", "1,250"]]);
  });

  it("[C11] a listed sentence with no number is rejected as no_number", async () => {
    const answer = "The colony is large. Keepers counted 14 naps a day.";
    const out = await intake(answer, { client: clientFor(JSON.stringify({ claims: [{ sentence: "The colony is large.", number: "14" }] })) });
    expect(out.rejected).toEqual([{ sentence: "The colony is large.", number: "14", reason: "no_number" }]);
  });

  it("[C11] snaps a cut pointer to its whole sentence, so a negation is never dropped", async () => {
    const answer = "Keepers say penguins do not nap 14 times a day. They nap less.";
    const list = (items: [string, string][]) => clientFor(JSON.stringify({ claims: items.map(([sentence, number]) => ({ sentence, number })) }));
    const cut = await intake(answer, { client: list([["nap 14 times a day.", "14"]]) });
    expect(cut.claims.map((c) => c.text)).toEqual(["Keepers say penguins do not nap 14 times a day."]);
    expect(answer.slice(cut.claims[0]!.start, cut.claims[0]!.end)).toBe("Keepers say penguins do not nap 14 times a day.");
    const bare = await intake(answer, { client: list([["14", "14"]]) });
    expect(bare.claims.map((c) => [c.text, c.number.raw])).toEqual([["Keepers say penguins do not nap 14 times a day.", "14"]]);
  });

  it("[C11] an abbreviation or a mid-sentence line break never cuts the negation off", async () => {
    const list = (sentence: string, number: string) => clientFor(JSON.stringify({ claims: [{ sentence, number }] }));
    const approx = "Penguins do not sleep more than approx. 14 hours a day.";
    expect((await intake(approx, { client: list("14 hours a day.", "14") })).claims.map((c) => c.text)).toEqual([approx]);
    const dr = "Dr. Smith said 40% of keepers never saw a nap.";
    expect((await intake(dr, { client: list("Smith said 40% of keepers never saw a nap.", "40%") })).claims.map((c) => c.text)).toEqual([dr]);
    const wrapped = "It is false that\n14 penguins nap at once.";
    const out = await intake(wrapped, { client: list("14 penguins nap at once.", "14") });
    expect(out.claims.map((c) => c.text)).toEqual(["It is false that 14 penguins nap at once."]);
    expect(normalise(wrapped).slice(out.claims[0]!.start, out.claims[0]!.end)).toBe("It is false that 14 penguins nap at once.");
  });

  it("still ends a sentence at a line that ends with punctuation, a blank line or a list item", () => {
    expect(sentences("Penguins nap.\n14 of them sleep.\n\nThe colony\n\n212 penguins live here").map((s) => s.text))
      .toEqual(["Penguins nap.", "14 of them sleep.", "The colony", "212 penguins live here"]);
    expect(sentences("Key figures\n- 14 naps a day\n- 212 penguins\n1. 40% sleep").map((s) => s.text))
      .toEqual(["Key figures", "- 14 naps a day", "- 212 penguins", "1. 40% sleep"]);
    expect(sentences("Penguins nap.\nmost sleep 14 hours.\n# Figures\n- It is false that\n  14 penguins nap at once.").map((s) => s.text))
      .toEqual(["Penguins nap.", "most sleep 14 hours.", "# Figures", "- It is false that 14 penguins nap at once."]);
    expect(sentences("The zoo counted 212 penguins. Dr. Lee counted 14.").map((s) => s.text))
      .toEqual(["The zoo counted 212 penguins.", "Dr. Lee counted 14."]);
  });

  it("[C11] a pointer found in two different sentences, or only inside a word, is rejected", async () => {
    const answer = "The colony has 3 pools. Keepers count 3 feeds a day. It opened in 1935.";
    const list = (sentence: string, number: string) => clientFor(JSON.stringify({ claims: [{ sentence, number }] }));
    expect((await intake(answer, { client: list("3", "3") })).rejected.map((r) => r.reason)).toEqual(["ambiguous"]);
    expect((await intake(answer, { client: list("93", "93") })).rejected.map((r) => r.reason)).toEqual(["not_in_text"]);
  });

  it("splits sentences per line, and keeps decimals and list items whole", () => {
    expect(sentences("The reservoir holds 4.2 billion litres. It fell to 61%!\n- 14 naps a day\n- 212 penguins").map((s) => s.text))
      .toEqual(["The reservoir holds 4.2 billion litres.", "It fell to 61%!", "- 14 naps a day", "- 212 penguins"]);
  });

  it("sends one strict-schema request with the pinned model and the answer as data", async () => {
    const { client } = await run("01-plain");
    expect(client.chat).toHaveBeenCalledTimes(1);
    const [request] = client.chat.mock.calls[0]!;
    expect(request.model).toBe("Qwen/Qwen3-30B-A3B-Instruct-2507");
    expect(request.messages[0]).toEqual({ role: "system", content: INTAKE_PROMPT });
    expect(JSON.parse(request.messages[1]!.content)).toEqual({ source_text: recorded["01-plain"]!.answer });
    expect(request.jsonSchema).toMatchObject({ additionalProperties: false, required: ["claims"] });
  });

  it("a response that is not the schema is a typed bad_response", async () => {
    for (const content of ["not json", JSON.stringify({ claims: [{ sentence: "x" }] }), JSON.stringify({ claims: [], extra: 1 })])
      await expect(intake("Text 14.", { client: clientFor(content) })).rejects.toMatchObject({ code: "bad_response" });
  });
});
