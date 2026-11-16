import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { answerCommand, renderAnswer } from "../src/cli/answer.ts";
import { TokenFactoryError, type ChatInput } from "../src/clients/tokenfactory.ts";
import { answerSummary, MAX_CLAIMS, replayAnswer, traceAnswer } from "../src/engine/answer.ts";
import { intake, type IntakeClaim } from "../src/engine/intake.ts";
import { replayTrace } from "../src/engine/run.ts";
import { lintText } from "../src/cli/lint-copy.ts";
import { normalise } from "../src/rules/index.ts";
import { AnswerRecord, Trace, type AnswerClaim } from "../src/schema/index.ts";

// A hand-written answer with five E2 dev statistics, and one sentence whose figure is not in it.
const ANSWER = [
  "Here is what the research says:",
  "- Americans check their phones 96 times a day.",
  "- It takes 21 days to form a habit.",
  "- Only 9% of all plastic ever made has been recycled.",
  "- Humans use only 10 percent of their brains.",
  "- Just 100 companies are responsible for 71% of global emissions.",
  "Try to put your phone down more often.",
].join("\n");
const LISTED = [
  ["Americans check their phones 96 times a day.", "96"], ["It takes 21 days to form a habit.", "21"],
  ["Only 9% of all plastic ever made has been recycled.", "9%"], ["Humans use only 10 percent of their brains.", "10 percent"],
  ["Just 100 companies are responsible for 71% of global emissions.", "71%"], ["Try to put your phone down more often.", "7"],
].map(([sentence, number]) => ({ sentence, number }));
// Synthetic Token Factory reply shaped like intake's strict schema; written for this test, not recorded.
const intakeClient = () => ({ chat: vi.fn(async (_: ChatInput) => ({ data: { content: JSON.stringify({ claims: LISTED }), logprobs: null, model: "Qwen/Qwen3-30B-A3B-Instruct-2507" }, usage: null as never, attempts: [] })) });

// Sample traces stand in for live ones (each keeps its SAMPLE label); the summary only reads stop states.
const fixture = (name: string) => Trace.parse(JSON.parse(readFileSync(new URL(`../../../fixtures/traces/${name}.json`, import.meta.url), "utf8")));
const ENDINGS = ["sample-origin", "sample-rich", "sample-cold-unread", "sample-partial", "sample-conflicting"];
const tracesInOrder = () => {
  let i = 0;
  return vi.fn(async (_: IntakeClaim) => fixture(ENDINGS[i++]!));
};
const now = () => "2026-11-16T08:00:00.000Z";
const run = (overrides: Partial<Parameters<typeof traceAnswer>[1]> = {}) =>
  traceAnswer(ANSWER, { intake: (a) => intake(a, { client: intakeClient() }), traceClaim: tracesInOrder(), now, ...overrides });

describe("T51 whole-answer mode", () => {
  it("traces each statistic intake accepts and writes the summary from the stop states", async () => {
    const record = await run();
    expect(record.claims.map((c) => c.number.raw)).toEqual(["96", "21", "9%", "10", "71%"]);
    expect(record.claims.map((c) => c.trace?.decision.state)).toEqual(["ORIGIN_FOUND", "TRAIL_GOES_COLD", "TRAIL_GOES_COLD", "PARTIAL", "CONFLICTING"]);
    expect(record.rejected).toEqual([{ sentence: "Try to put your phone down more often.", number: "7", reason: "no_number" }]);
    expect(record.summary).toBe("5 statistics: 1 traced to an earliest primary source, 1 has earliest pages that disagree, 2 went cold and 1 stopped at a cap. "
      + "Set aside by code: 1 sentence whose number code could not match to the text.");
    expect(() => AnswerRecord.parse(record)).not.toThrow();
    // The list marker is not part of the claim, and the offsets still point at the claim in the answer.
    for (const c of record.claims) expect(normalise(ANSWER).slice(c.start, c.end)).toBe(c.text);
    expect(record.claims[0]!.text).toBe("Americans check their phones 96 times a day.");
  });

  it("traces at most MAX_CLAIMS statistics, and says how many it left out", async () => {
    expect(MAX_CLAIMS).toBe(5);
    const traceClaim = tracesInOrder();
    const record = await run({ traceClaim, maxClaims: 3 });
    expect(traceClaim).toHaveBeenCalledTimes(3);
    expect(record.claims.map((c) => c.notTraced)).toEqual([null, null, null, "over_claim_cap", "over_claim_cap"]);
    expect(record.summary).toContain("Not traced: 2 over the 5-statistic limit.");
  });

  it("records a typed error for one statistic and goes on; no key stops the rest; anything else is thrown", async () => {
    let call = 0;
    const flaky = vi.fn(async () => { if (call++ === 1) throw new TokenFactoryError("http_error", 503); return fixture("sample-rich"); });
    const record = await run({ traceClaim: flaky });
    expect(record.claims.map((c) => c.notTraced)).toEqual([null, "http_error", null, null, null]);
    expect(record.summary).toContain("Not traced: 1 could not run.");
    const noKey = vi.fn(async () => { throw new TokenFactoryError("not_configured"); });
    const offline = await run({ traceClaim: noKey });
    expect(noKey).toHaveBeenCalledTimes(1);
    expect(offline.claims.every((c) => c.notTraced === "not_configured")).toBe(true);
    expect(offline.summary).toBe("5 statistics. Not traced: 5 could not run. Set aside by code: 1 sentence whose number code could not match to the text.");
    await expect(run({ traceClaim: vi.fn(async () => { throw new Error("provider said: secret"); }) })).rejects.toThrow("secret");
  });

  it("summary wording: counts and plurals come from the claims, and it never grades a claim true or false", () => {
    const claim = (state: Trace["decision"]["state"] | null, notTraced: AnswerClaim["notTraced"] = null): AnswerClaim => ({
      text: "x", start: 0, end: 1, number: { raw: "1", canonical: "1" }, notTraced: state ? null : notTraced,
      trace: state ? { ...fixture("sample-rich"), decision: { ...fixture("sample-rich").decision, state } } : null,
    });
    const r = (reason: string) => ({ reason });
    expect(answerSummary([], [])).toBe("No statistics found in the answer.");
    expect(answerSummary([], [r("no_number"), r("not_in_text")])).toBe("No statistics passed the checks. Set aside by code: 2 sentences whose number code could not match to the text.");
    expect(answerSummary([claim("ORIGIN_FOUND")], [r("duplicate")])).toBe("1 statistic: 1 traced to an earliest primary source. Set aside by code: 1 repeat of a statistic already listed.");
    expect(answerSummary([], [r("ambiguous"), r("duplicate"), r("duplicate")])).toBe("No statistics passed the checks. Set aside by code: 1 sentence whose number code could not match to the text and 2 repeats of a statistic already listed.");
    expect(answerSummary([claim("NO_PAGES_FOUND"), claim("NO_PAGES_FOUND"), claim("TOOL_FAILED")], []))
      .toBe("3 statistics: 2 turned up no page stating them and 1 stopped when a tool failed.");
    expect(answerSummary([claim("ORIGIN_FOUND")], [])).toBe("1 statistic: 1 traced to an earliest primary source.");
    for (const s of ["ORIGIN_FOUND", "CONFLICTING", "TRAIL_GOES_COLD", "NO_PAGES_FOUND", "PARTIAL", "TOOL_FAILED"] as const) {
      const text = answerSummary([claim(s), claim(s)], [r("duplicate"), r("no_number")]);
      expect(text).not.toMatch(/\b(true|false|debunked|correct|wrong)\b/i);
      expect(lintText(text)).toEqual([]);
    }
  });

  it("replays a recorded answer with no keys, and refuses one whose summary does not match its traces", async () => {
    const record = await run();
    expect(replayAnswer(JSON.parse(JSON.stringify(record)), (t) => replayTrace(t)).summary).toBe(record.summary);
    expect(() => replayAnswer({ ...record, summary: "5 statistics: 5 traced to an earliest primary source." }, (t) => replayTrace(t))).toThrow("summary");
    const bad = { ...record, claims: [{ ...record.claims[0]!, notTraced: "http_error" }] };
    expect(() => AnswerRecord.parse(bad)).toThrow();
  });
});

describe("T51 the CLI", () => {
  it("prints the summary and one line per statistic, or the raw record with --json", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pz-answer-"));
    const path = join(dir, "answer.json");
    writeFileSync(path, JSON.stringify(await run()));
    const lines: string[] = [], errors: string[] = [];
    const io = { write: (s: string) => { lines.push(s); }, error: (s: string) => { errors.push(s); } };
    expect(await answerCommand(["--answer-replay-of", path], io)).toBe(0);
    expect(lines[0]).toContain("Patient Zero  answer mode  SAMPLE");
    expect(lines[0]).toContain("1. Origin found (rule row 5)\n   \"Americans check their phones 96 times a day.\"");
    expect(lines[0]).toContain("\"Try to put your phone down more often.\" (no number)");
    expect(lintText(lines[0]!)).toEqual([]);
    lines.length = 0;
    expect(await answerCommand(["--answer-replay-of", path, "--json"], io)).toBe(0);
    expect(AnswerRecord.parse(JSON.parse(lines[0]!)).claims).toHaveLength(5);
    expect(await answerCommand(["--answer", path], io)).toBe(1);
    expect(errors.at(-1)).toBe("trace_failed");
    expect(renderAnswer(await run({ maxClaims: 4 }))).toContain("5. not traced, over the 5-statistic limit");
  });

  it("pz trace takes --answer-replay-of=<file> as answer mode", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "pz-answer-eq-")), "answer.json");
    writeFileSync(path, JSON.stringify(await run()));
    const cwd = new URL("../../../", import.meta.url).pathname;
    const out = execFileSync(process.execPath, ["--import", "tsx", "packages/pz/src/cli/pz.ts", "trace", `--answer-replay-of=${path}`], { cwd, encoding: "utf8" });
    expect(out).toContain("Patient Zero  answer mode  SAMPLE");
  }, 20_000);
});
