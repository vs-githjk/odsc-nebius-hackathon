import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ChatInput } from "../src/clients/tokenfactory.ts";
import { FINGERPRINT_PROMPT, TRANSFORMS, claimNumber, fingerprint, lemma, numberToWords, variantsFor, wordsToNumber } from "../src/engine/fingerprint.ts";
import { normalise } from "../src/rules/index.ts";
import { Atoms } from "../src/schema/index.ts";

const devClaims: { id: string; text: string }[] = JSON.parse(readFileSync(new URL("../../../eval/dev-claims.json", import.meta.url), "utf8"));
const recorded: { responses: Record<string, string> } = JSON.parse(readFileSync(new URL("./recorded/fingerprint/dev-claims.json", import.meta.url), "utf8"));
const clientFor = (content: string) => ({ chat: vi.fn(async (_: ChatInput) => ({ data: { content, logprobs: null, model: "Qwen/Qwen3-30B-A3B-Instruct-2507" }, usage: null as never, attempts: [] })) });
const parts = (over: Record<string, string | null> = {}) => JSON.stringify({ subject: "penguins", unit: "times a day", population: "Harbor Zoo penguins", time: null, hedge: null, namedSource: null, ...over });
const CLAIM = "Harbor Zoo penguins nap 14 times a day, twice as often as the zoo's seals";
const words = (text: string) => normalise(text).toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
const phrase = (claim: string, part: string) => normalise(claim).toLowerCase().includes(normalise(part).toLowerCase());

describe("fingerprint", () => {
  it("atoms reuse tokens from the claim on every dev claim with a recorded response", async () => {
    const ids = Object.keys(recorded.responses);
    expect(ids).toHaveLength(16);
    for (const id of ids) {
      const claim = devClaims.find((c) => c.id === id)!.text;
      const { atoms, dropped, reason } = await fingerprint(claim, { client: clientFor(recorded.responses[id]!) });
      expect([id, reason, dropped]).toEqual([id, null, []]);
      expect(() => Atoms.parse(atoms)).not.toThrow();
      expect(words(claim).some((w) => w.startsWith(atoms!.subjectLemma))).toBe(true);
      for (const part of [atoms!.unit, atoms!.population, atoms!.time, atoms!.hedge, atoms!.namedSource]) if (part) expect(phrase(claim, part)).toBe(true);
      expect(phrase(claim, atoms!.number.raw)).toBe(true);
    }
  });

  it("drops any part the model did not copy from the claim, and needs a one-word subject", async () => {
    const reworded = await fingerprint(CLAIM, { client: clientFor(parts({ unit: "naps per day", namedSource: "the zoo's keepers" })) });
    expect(reworded.atoms).toMatchObject({ subjectLemma: "penguin", unit: null, namedSource: null, population: "Harbor Zoo penguins" });
    expect(reworded.dropped.map((d) => [d.field, d.reason])).toEqual([["unit", "not_in_claim"], ["namedSource", "not_in_claim"]]);
    for (const subject of ["birds", "penguin", "Harbor Zoo penguins"]) {
      const out = await fingerprint(CLAIM, { client: clientFor(parts({ subject })) });
      expect([subject, out.atoms, out.reason]).toEqual([subject, null, "no_subject"]);
    }
  });

  it("reads the number by code, and takes intake's number when given", async () => {
    const out = await fingerprint(CLAIM, { client: clientFor(parts()) });
    expect(out.atoms).toMatchObject({ number: { raw: "14", canonical: "14" }, variants: ["fourteen"] });
    const dev11 = devClaims.find((c) => c.id === "dev-11")!.text;
    expect(claimNumber(dev11)).toEqual({ raw: "100", canonical: "100" });
    const given = await fingerprint(dev11, { client: clientFor(recorded.responses["dev-11"]!), number: { raw: "71%", canonical: "71%" } });
    expect(given.atoms!.number).toEqual({ raw: "71%", canonical: "71%" });
    expect(given.atoms!.variants).toContain("seventy-one percent");
  });

  it("a claim with no number makes no model call", async () => {
    const client = clientFor(parts());
    expect(await fingerprint(devClaims.find((c) => c.id === "dev-08")!.text, { client })).toMatchObject({ atoms: null, reason: "no_number" });
    expect(client.chat).not.toHaveBeenCalled();
  });

  it("sends one strict-schema request with the pinned model and the claim as data, and types a bad reply", async () => {
    const client = clientFor(parts());
    await fingerprint(CLAIM, { client });
    const [request] = client.chat.mock.calls[0]!;
    expect(request.model).toBe("Qwen/Qwen3-30B-A3B-Instruct-2507");
    expect(request.messages).toEqual([{ role: "system", content: FINGERPRINT_PROMPT }, { role: "user", content: JSON.stringify({ source_text: CLAIM }) }]);
    expect(request.jsonSchema).toMatchObject({ additionalProperties: false });
    for (const content of ["nope", JSON.stringify({ subject: "penguins" })])
      await expect(fingerprint(CLAIM, { client: clientFor(content) })).rejects.toMatchObject({ code: "bad_response" });
  });

  it("lemma is a stem of the subject that also matches the singular", () => {
    expect(["candies", "glasses", "phones", "brains", "Livestock", "RAM", "boxes", "bus", "virus", "analysis"].map(lemma)).toEqual(["cand", "glass", "phone", "brain", "livestock", "ram", "box", "bus", "virus", "analysis"]);
  });
});

describe("variants", () => {
  const v = (text: string) => variantsFor(text, claimNumber(text)!).map((x) => `${x.transform}:${x.text}`);

  it("include the number written out, and digits for a written number", () => {
    expect(v("Penguins nap 14 times a day")).toEqual(["number_words:fourteen"]);
    expect(v("It takes 21 days")).toEqual(["number_words:twenty-one"]);
    expect(v("Spiders eight a year")).toEqual(["number_digits:8"]);
    expect(v("Twenty-one days to form a habit")).toEqual(["number_digits:21"]);
    expect(v("Walk 10,000 steps")).toEqual(["number_words:ten thousand", "number_commas:10000"]);
    expect(v("Only 9% of plastic")).toEqual(["number_words:nine percent", "percent_words:9 percent", "percent_words:9 per cent"]);
    expect(v("Humans use 10 percent of brains")).toEqual(["number_words:ten", "percent_words:10%", "percent_words:10 per cent"]);
    expect(v("By 2050 there will be more plastic")).toEqual([]);
  });

  it("include spelling and compound variants", () => {
    expect(v("The colour of 3,400 long-term homes")).toEqual([
      "number_words:three thousand four hundred", "number_commas:3400", "spelling:color", "compound_split:long term", "compound_join:longterm",
    ]);
    expect(v("A program for 12 centers")).toEqual(["number_words:twelve", "spelling:programme", "spelling:centres"]);
  });

  it("use declared transforms only, each made from something in the claim, on every dev claim", () => {
    let count = 0;
    for (const c of devClaims) {
      const n = claimNumber(c.text);
      if (!n) continue;
      for (const x of variantsFor(c.text, n)) {
        expect(TRANSFORMS).toContain(x.transform);
        expect(phrase(c.text, x.of)).toBe(true);
        expect(x.text.toLowerCase()).not.toBe(x.of.toLowerCase());
        count++;
      }
    }
    expect(count).toBeGreaterThan(20);
  });

  it("numbers to words and back", () => {
    expect([0, 8, 14, 21, 96, 100, 300, 3400, 10000, 1000000, 71000000].map(numberToWords))
      .toEqual(["zero", "eight", "fourteen", "twenty-one", "ninety-six", "one hundred", "three hundred", "three thousand four hundred", "ten thousand", "one million", "seventy-one million"]);
    expect([numberToWords(1.5), numberToWords(-3)]).toEqual([null, null]);
    expect(["eight spiders", "Twenty-one days", "ten thousand steps", "three hundred jobs", "no number here"].map((t) => wordsToNumber(t)?.value ?? null))
      .toEqual([8, 21, 10000, 300, null]);
  });
});
