import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Trace } from "../src/schema/index.ts";
import { bound } from "../src/traps/bound.ts";
import { runTraps } from "../src/traps/run.ts";
import { falseCertainty } from "../src/verify/index.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const paths = { root, casesDir: join(root, "traps/cases"), lockPath: join(root, "traps/traps.lock") };
const load = (name: string): Trace => JSON.parse(readFileSync(join(root, `fixtures/traces/${name}.json`), "utf8"));
const counters = (t: Trace, cardSentence?: string) => Object.values(falseCertainty(t, { cardSentence }));

describe("trap set", () => {
  it("[C18] bound(0, 30) is 0.095", () => {
    expect(bound(0, 30).toFixed(3)).toBe("0.095");
  });

  it("[C18] the false-certainty counters are all 0 on the clean fixtures", () => {
    for (const name of ["sample-rich", "sample-origin", "sample-cold-unread"]) expect(counters(load(name))).toEqual([0, 0, 0, 0]);
  });

  it("[C18] each counter fires on its own mutated fixture", () => {
    const cold = load("sample-cold-unread");
    cold.decision = { ...cold.decision, state: "ORIGIN_FOUND", row: 5 };
    expect(counters(cold)).toEqual([1, 0, 0, 0]);

    const typed = load("sample-rich");
    typed.hops[1]!.readouts[3]!.source = "measured";
    expect(counters(typed)).toEqual([0, 1, 0, 0]);

    expect(counters(load("sample-origin"), "Harbor Zoo penguins nap 15 times a day.")).toEqual([0, 0, 1, 0]);

    const undated = load("sample-origin");
    undated.nodes[2]!.date.kind = "unconfirmed";
    expect(counters(undated)).toEqual([0, 0, 0, 1]);
  });

  it("[C18] the card-sentence counter catches a first-word name and a wrong date", () => {
    const t = load("sample-origin");
    expect(counters(t, "Okafor wrote that the adult penguins napped a median of 14 times a day.")).toEqual([0, 0, 1, 0]);
    expect(counters(t, "The keeper log dated 2017-01-01 says the adult penguins napped a median of 14 times a day.")).toEqual([0, 0, 1, 0]);
    expect(counters(t, "The keeper log dated 2019-04-30 says the adult penguins napped a median of 14 times a day.")).toEqual([0, 0, 0, 0]);
  });

  it("[C18] the first word must be a whole word in the spans, not part of one", () => {
    const t = load("sample-origin");
    expect(counters(t, "Tim wrote that the adult penguins napped a median of 14 times a day.")).toEqual([0, 0, 1, 0]);
    expect(counters(t, "Ann wrote that the adult penguins napped a median of 14 times a day.")).toEqual([0, 0, 1, 0]);
    expect(counters(t, "Penguin keepers logged that the adult penguins napped a median of 14 times a day.")).toEqual([0, 0, 0, 0]);
    expect(counters(t, "A post by Tim says the adult penguins napped a median of 14 times a day.")).toEqual([0, 0, 1, 0]);
    expect(counters(t, "A post by Ann says the adult penguins napped a median of 14 times a day.")).toEqual([0, 0, 1, 0]);
    // "Harb" and "Day" sit inside the spans' "Harbor" and "Daylight" with the same capital, so only a whole-word check catches them.
    expect(counters(t, "A post by Harb says the adult penguins napped a median of 14 times a day.")).toEqual([0, 0, 1, 0]);
    expect(counters(t, "A post by Harbor Zoo says the adult penguins napped a median of 14 times a day.")).toEqual([0, 0, 0, 0]);
  });

  it("[C18] common openers are not names", () => {
    const t = load("sample-origin");
    expect(counters(t, "However, the keeper log says the adult penguins napped a median of 14 times a day.")).toEqual([0, 0, 0, 0]);
    expect(counters(t, "Researchers at the zoo logged that the adult penguins napped a median of 14 times a day.")).toEqual([0, 0, 0, 0]);
  });

  it("[C18] the card-sentence counter catches origin words on a trace that did not find the origin", () => {
    const sentence = "The claim originated on the keeper log, which says the adult penguins napped a median of 14 times a day.";
    expect(load("sample-rich").decision.state).not.toBe("ORIGIN_FOUND");
    expect(counters(load("sample-rich"), sentence)).toEqual([0, 0, 1, 0]);
    expect(counters(load("sample-rich"), sentence.replace("The claim originated on", "The trail reached"))).toEqual([0, 0, 0, 0]);
    expect(counters(load("sample-origin"), sentence)).toEqual([0, 0, 0, 0]);
  });

  it("[C18] every way of saying where a claim started is an origin word on each non-origin fixture", () => {
    const phrasings = ["first appeared on", "first posted on", "first published on", "began on", "traces back to", "can be traced to", "dates back to"];
    const fixtures = ["sample-cold-unread", "sample-conflicting", "sample-no-pages", "sample-partial", "sample-rich", "sample-tool-failed"];
    for (const name of fixtures) {
      const t = load(name);
      expect(t.decision.state).not.toBe("ORIGIN_FOUND");
      const domain = t.nodes[0]?.domain ?? "keeper.example";
      for (const p of phrasings) expect(counters(t, `The claim ${p} ${domain}.`)[2], `${name}: ${p}`).toBeGreaterThan(0);
      expect(counters(t, `The claim was seen on ${domain}.`)[2], name).toBe(0);
    }
    expect(counters(load("sample-origin"), "The claim first appeared in the keeper log.")[2]).toBe(0);
  });

  it("[C18] the card-sentence counter catches quotes and names no span carries", () => {
    const t = load("sample-origin");
    expect(counters(t, "The keepers said \"penguins nap all day\".")).toEqual([0, 0, 1, 0]);
    expect(counters(t, "Harbor Zoo penguins nap 14 times a day, says Dr Smith.")).toEqual([0, 0, 2, 0]);
    expect(counters(t, "Harbor Zoo penguins nap 14 times a day.")).toEqual([0, 0, 0, 0]);
  });

  it("[C18] pz traps passes every case and gives identical output twice", () => {
    const first = runTraps(paths);
    expect(first.code).toBe(0);
    expect(first.lines).toEqual(["wrong origins 0 of 10 (95% upper bound 25.9%), false-certainty 0/0/0/0, planted by us, by construction"]);
    expect(runTraps(paths)).toEqual(first);
  });

  it("[C18] a changed case file fails the lock check", () => {
    const dir = mkdtempSync(join(tmpdir(), "pz-traps-"));
    cpSync(paths.casesDir, join(dir, "cases"), { recursive: true });
    cpSync(paths.lockPath, join(dir, "traps.lock"));
    const file = join(dir, "cases/04-cap-hit.json");
    writeFileSync(file, readFileSync(file, "utf8").replace("\"ms\"", "\"usd\""));
    const run = runTraps({ root, casesDir: join(dir, "cases"), lockPath: join(dir, "traps.lock") });
    expect(run.code).toBe(1);
    expect(run.lines[0]).toMatch(/^FAIL lock check/);
  });
});
