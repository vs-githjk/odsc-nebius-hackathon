import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { initializeBudget } from "../../../eval/recordings/budget.ts";
import { loadT38Cases, recordCases, writeRecording } from "../../../eval/recordings/session.ts";
import { assertMergedOperations, recordDevCommand, tokenFactoryCost } from "../../../eval/record-dev.ts";

function project() {
  const root = mkdtempSync(join(tmpdir(), "pz-command-"));
  const dir = join(root, "packages/pz/test/recorded/intake"); mkdirSync(dir, { recursive: true });
  for (const name of ["01-plain", "02-paraphrase", "03-invented-number", "04-ranges-and-dupes", "05-injection"])
    writeFileSync(join(dir, name + ".json"), JSON.stringify({ answer: "Invented 12 birds." }));
  mkdirSync(join(root, "eval"));
  writeFileSync(join(root, "eval/dev-claims.json"), JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ id: `dev-${i + 1}`, text: "Invented 12 birds." }))));
  return root;
}
const setup = () => {
  const root = project(), lines: string[] = [], errors: string[] = [];
  let calls = 0, loads = 0;
  const deps = { root, loadOperations: async () => { loads++; throw new Error("must not load"); },
    assertMergedOperations, client: () => { throw new Error("must not construct client"); },
    fetch: async () => { calls++; throw new Error("must not call network"); } };
  return { root, lines, errors, deps, io: { write: (s: string) => { lines.push(s); }, error: (s: string) => { errors.push(s); } },
    counts: () => ({ calls, loads }) };
};
describe("T38 recording command", () => {
  it("plans exactly five intake and 20 E2 cases with no module loading, key or network", async () => {
    const t = setup(); expect(await recordDevCommand(["--plan"], t.io, t.deps)).toBe(0);
    expect(JSON.parse(t.lines[0]!)).toMatchObject({ mode: "PLAN", intake: 5, fingerprint: 20 });
    expect(t.counts()).toEqual({ calls: 0, loads: 0 });
    expect(t.lines.join()).not.toContain("Invented 12 birds");
  });
  it("rejects ambiguous modes and incomplete live config before loading modules or network", async () => {
    for (const args of [[], ["--plan", "--live"], ["--live"], ["--plan", "--ledger", "secret-path"],
      ["--live", "--out", "x", "--ledger", "secret-path", "--ceiling-usd", "NaN"],
      ["--live", "--out", "x", "--ledger", "secret-path", "--ceiling-usd", "0.010001"]]) {
      const t = setup(); expect(await recordDevCommand(args, t.io, t.deps)).toBe(1);
      expect(t.errors).toEqual(["recording_failed"]); expect(t.counts()).toEqual({ calls: 0, loads: 0 });
    }
  });
  it("refuses a missing ledger before module loading, and refuses unmerged operations before any network", async () => {
    const t = setup(), ledger = join(t.root, "ledger.json"), out = join(t.root, "new");
    const args = ["--live", "--out", out, "--ledger", ledger, "--ceiling-usd", "0.01"];
    expect(await recordDevCommand(args, t.io, t.deps)).toBe(1);
    initializeBudget(ledger, { capUsd: 15, priorSpendUsd: 0, start: "2020-01-01T00:00:00Z", end: "2100-01-01T00:00:00Z" });
    expect(await recordDevCommand(args, t.io, t.deps)).toBe(1);
    expect(t.counts()).toEqual({ calls: 0, loads: 0 }); expect(t.errors).toEqual(["recording_failed", "recording_failed"]);
  });
  it("replays all 25 saved cases without a provider and refuses a changed source", async () => {
    const t = setup(), out = join(t.root, "saved");
    const usage = { at: "2026-11-10T00:00:00Z", traceId: null, step: "fixture", service: "tokenfactory" as const,
      endpoint: "/chat/completions", model: "fixture", promptTokens: 2, completionTokens: 1, cachedTokens: 0,
      credits: 0, costUsd: 0.000001, latencyMs: 1, status: "200", cacheHit: false };
    const operation = async (source: string, { client }: Parameters<import("../../../eval/recordings/session.ts").Operations["intake"]>[1]) =>
      (await client.chat({ model: "fixture", messages: [{ role: "user", content: source }], maxTokens: 1 })).data.content;
    const operations = { intake: operation, fingerprint: operation };
    // In-memory stand-in for the LIVE file contract. No provider request occurs.
    await recordCases(loadT38Cases(t.root), { provenance: "LIVE", operations,
      beforeCase: () => {}, clientFor: () => ({ chat: async () => ({
        data: { model: "fixture", logprobs: null, content: "answer" }, usage, attempts: [usage],
      }) }), write: record => writeRecording(out, record) });
    const deps = { ...t.deps, loadOperations: async () => operations };
    expect(await recordDevCommand(["--replay", out], t.io, deps)).toBe(0);
    expect(JSON.parse(t.lines[0]!)).toEqual({ mode: "REPLAY", replayed: 25 });
    const file = join(out, "intake/01-plain.json");
    const valid = JSON.parse(readFileSync(file, "utf8"));
    for (const invalid of [
      { ...valid, source: "changed" }, { ...valid, provenance: "SYNTHETIC" },
      { ...valid, calls: [] }, { ...valid, usage: [] },
      { ...valid, calls: [{ ...valid.calls[0], response: { ...valid.calls[0].response, attempts: [] } }] },
    ]) {
      writeFileSync(file, JSON.stringify(invalid));
      expect(await recordDevCommand(["--replay", out], t.io, deps)).toBe(1);
    }
    expect(t.counts().calls).toBe(0);
  });
  it("checks exact merged operation and input bytes against origin/main", () => {
    const root = project(); const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
    git("init"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    const dir = join(root, "packages/pz/src/engine"); mkdirSync(dir, { recursive: true });
    for (const name of ["intake", "fingerprint"]) writeFileSync(join(dir, name + ".ts"), "export {};\n");
    git("add", "."); git("commit", "-m", "Synthetic module fixture"); git("update-ref", "refs/remotes/origin/main", "HEAD");
    expect(() => assertMergedOperations(root)).not.toThrow();
    writeFileSync(join(root, "eval/dev-claims.json"), "changed");
    expect(() => assertMergedOperations(root)).toThrow("unmerged_operations");
    git("checkout", "--", "eval/dev-claims.json");
    writeFileSync(join(dir, "intake.ts"), "changed"); expect(() => assertMergedOperations(root)).toThrow("unmerged_operations");
  });
  it("converts only complete valid token usage; missing or impossible usage stays unknown", async () => {
    expect(await tokenFactoryCost(new Response(JSON.stringify({ usage: { prompt_tokens: 100, completion_tokens: 10 } })))).toBeCloseTo(0.000013);
    for (const usage of [null, {}, { prompt_tokens: -1, completion_tokens: 1 }, { prompt_tokens: 1, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 2 } }])
      expect(await tokenFactoryCost(new Response(JSON.stringify({ usage })))).toBeNull();
  });
});
