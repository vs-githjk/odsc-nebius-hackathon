import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ChatInput } from "../src/clients/tokenfactory.ts";
import { INTAKE_PROMPT, intake } from "../src/engine/intake.ts";

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
