import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { formatDoctor, runDoctor } from "../src/cli/doctor.ts";
import { devScore, heldOut, JUDGE_DEV_TRACES, judgeTraces, runJudge } from "../src/cli/judge.ts";
import { lintText } from "../src/cli/lint-copy.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const SECRET = "tf-secret-value-1234";

// A tiny repo root with a package.json, a lock and an installed copy of it.
function fakeRoot(installed: Record<string, { version: string }> | null): string {
  const dir = mkdtempSync(join(tmpdir(), "pz-doctor-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ engines: { node: ">=24" } }));
  const packages = { "": {}, "node_modules/zod": { version: "4.6.7" }, "node_modules/@esbuild/win32-x64": { version: "0.25.0", optional: true } };
  writeFileSync(join(dir, "package-lock.json"), JSON.stringify({ packages }));
  if (installed) {
    mkdirSync(join(dir, "node_modules"));
    writeFileSync(join(dir, "node_modules/.package-lock.json"), JSON.stringify({ packages: installed }));
  }
  return dir;
}

describe("T95 pz doctor", () => {
  it("says whether each key is set and never prints its value", async () => {
    const { lines } = await runDoctor({ root: fakeRoot({ "node_modules/zod": { version: "4.6.7" } }), env: { NEBIUS_API_KEY: SECRET }, nodeVersion: "v24.1.0" });
    const text = formatDoctor(lines).join("\n");
    expect(text).not.toContain(SECRET);
    expect(text).toContain("OK      NEBIUS_API_KEY: set");
    expect(text).toContain("MISSING TAVILY_API_KEY: not set; only live traces need it");
    expect(text).toContain("Fix: copy .env.example to .env and fill TAVILY_API_KEY.");
    expect(text).toContain("OK      Node: v24.1.0");
    expect(lintText(text)).toEqual([]);
  });

  it("makes no network call by default, and with --network only for keys that are set, reporting the status code", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response("", { status: 200 }));
    const off = await runDoctor({ root: fakeRoot({ "node_modules/zod": { version: "4.6.7" } }), env: { NEBIUS_API_KEY: SECRET }, nodeVersion: "v24.1.0", fetch });
    expect(fetch).not.toHaveBeenCalled();
    expect(formatDoctor(off.lines).join("\n")).toContain("SKIPPED Token Factory reachable: no network check by default. Fix: run pz doctor --network");
    const on = await runDoctor({ root: fakeRoot({ "node_modules/zod": { version: "4.6.7" } }), env: { NEBIUS_API_KEY: SECRET }, nodeVersion: "v24.1.0", fetch, network: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]![0])).toBe("https://api.tokenfactory.nebius.com/v1/models");
    const text = formatDoctor(on.lines).join("\n");
    expect(text).toContain("OK      Token Factory reachable: HTTP 200");
    expect(text).toContain("SKIPPED Tavily reachable: TAVILY_API_KEY is not set");
    expect(text).not.toContain(SECRET);
  });

  it("names the fix for a rejected key or no answer", async () => {
    const env = { NEBIUS_API_KEY: SECRET, TAVILY_API_KEY: SECRET };
    const denied = await runDoctor({ root: fakeRoot({ "node_modules/zod": { version: "4.6.7" } }), env, nodeVersion: "v24.1.0", network: true, fetch: async () => new Response("", { status: 401 }) });
    expect(formatDoctor(denied.lines).join("\n")).toContain("MISSING Tavily reachable: HTTP 401. Fix: check TAVILY_API_KEY in .env.");
    const down = await runDoctor({ root: fakeRoot({ "node_modules/zod": { version: "4.6.7" } }), env, nodeVersion: "v24.1.0", network: true, fetch: async () => { throw new TypeError("fetch failed"); } });
    expect(formatDoctor(down.lines).join("\n")).toContain("MISSING Token Factory reachable: no answer (TypeError)");
    expect(formatDoctor(denied.lines.concat(down.lines)).join("\n")).not.toContain(SECRET);
  });

  it("checks npm ci state against the lock, skipping other platforms' optional builds; only a missing install fails", async () => {
    const missing = await runDoctor({ root: fakeRoot(null), env: {}, nodeVersion: "v24.1.0" });
    expect([missing.code, formatDoctor(missing.lines)[1]]).toEqual([1, "MISSING npm ci: node_modules is not installed. Fix: run npm ci in the repo root."]);
    const stale = await runDoctor({ root: fakeRoot({ "node_modules/zod": { version: "4.0.0" } }), env: {}, nodeVersion: "v24.1.0" });
    expect(formatDoctor(stale.lines)[1]).toContain("MISSING npm ci: 1 package(s) differ from package-lock.json, for example node_modules/zod");
    const ok = await runDoctor({ root: fakeRoot({ "node_modules/zod": { version: "4.6.7" } }), env: {}, nodeVersion: "v22.3.0" });
    expect(ok.code).toBe(0);
    expect(formatDoctor(ok.lines)[0]).toContain("MISSING Node: v22.3.0, package.json asks for >=24; the keyless checks still run on 22. Fix: install Node 24");
  });

  it("says which stages run live and which replay", async () => {
    const r = fakeRoot({ "node_modules/zod": { version: "4.6.7" } });
    const keyless = formatDoctor((await runDoctor({ root: r, env: {}, nodeVersion: "v24.1.0" })).lines).at(-1)!;
    expect(keyless).toMatch(/^OK {6}stages: replay only: search and extraction \(Tavily\) and typed questions \(Token Factory\) come from recordings/);
    const live = formatDoctor((await runDoctor({ root: r, env: { NEBIUS_API_KEY: SECRET, TAVILY_API_KEY: SECRET }, nodeVersion: "v24.1.0" })).lines).at(-1)!;
    expect(live).toContain("keys set: search, extraction and typed questions can run live");
  });
});

describe("T95 make judge", () => {
  it("runs doctor, cards, verify and traps on the repo with no keys, and ends with one summary line", async () => {
    const out: string[] = [];
    const code = await runJudge({ root, env: {}, nodeVersion: "v24.1.0", write: (s) => out.push(s) });
    const text = out.join("\n");
    expect(code).toBe(0);
    for (const part of ["== pz doctor", "== pz verify", "== planted traps", "stop state agrees", "Patient Zero  "]) expect(text).toContain(part);
    expect(text).not.toContain("trace_failed");
    expect(text).not.toMatch(/^\s+at .+:\d+:\d+\)?$/m);
    expect(out.at(-1)).toMatch(/^\d+ (SAMPLE )?traces verified, 0 planted origins, dev score (not run yet|E\d: false origins \d+( \(\+\d+\))?, target cited \d+\/\d+, earliest \d+\/\d+ pass), held-out (not run yet|\d+\/\d+)\. make judge passed in \d+ s\.$/);
  });

  it("says plainly when the SAMPLE fixtures stand in for reviewed live traces, and prefers traces/ when they exist", () => {
    const sample = judgeTraces(root);
    if (sample.sample) expect(sample.paths.every((p) => p.includes("fixtures/traces"))).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), "pz-judge-"));
    mkdirSync(join(dir, "traces/gallery"), { recursive: true });
    cpSync(join(root, "fixtures/traces/sample-origin.json"), join(dir, "traces/a.json"));
    cpSync(join(root, "fixtures/traces/sample-rich.json"), join(dir, "traces/gallery/g1.json"));
    expect(judgeTraces(dir)).toEqual({ paths: [join(dir, "traces/a.json"), join(dir, "traces/gallery/g1.json")], sample: false, source: "reviewed" });
  });

  // XO judge pass (#2): with no reviewed traces, a judge sees recorded dev runs as REPLAY cards, not the penguin samples.
  it("with no traces/, shows the picked recorded dev runs, then falls back to the samples only when none is committed", () => {
    const repo = judgeTraces(root);
    expect(repo.source).toBe("dev");
    expect(repo.paths.map((p) => basename(p, ".json"))).toEqual(JUDGE_DEV_TRACES.filter((id) => existsSync(join(root, "eval/dev-traces", `${id}.json`))));
    const dir = mkdtempSync(join(tmpdir(), "pz-judge-"));
    mkdirSync(join(dir, "eval/dev-traces"), { recursive: true });
    cpSync(join(root, "eval/dev-traces/dev-10.json"), join(dir, "eval/dev-traces/dev-10.json"));
    expect(judgeTraces(dir)).toEqual({ paths: [join(dir, "eval/dev-traces/dev-10.json")], sample: false, source: "dev" });
    const empty = mkdtempSync(join(tmpdir(), "pz-judge-"));
    mkdirSync(join(empty, "fixtures/traces"), { recursive: true });
    cpSync(join(root, "fixtures/traces/sample-rich.json"), join(empty, "fixtures/traces/sample-rich.json"));
    expect(judgeTraces(empty)).toMatchObject({ sample: true, source: "sample" });
  });

  it("reads the dev score and held-out result only from their committed files", () => {
    const dir = mkdtempSync(join(tmpdir(), "pz-judge-scores-"));
    mkdirSync(join(dir, "eval"));
    expect([devScore(dir), heldOut(dir)]).toEqual([null, null]);
    // The table eval/dev-score.ts writes: the last dated row wins, read by column.
    const head = "| Date (UTC) | Commit | Set | False origins (+ unverified ORIGIN_FOUND) | Target cited | Earliest Pass / Partial / Fail | Cold stops |\n|---|---|---|---|---|---|---|\n";
    writeFileSync(join(dir, "eval/dev-score.md"), head + "| 2026-11-16 01:40 | aaa | E2 | 1 (+0) | 1/11 | 0 / 0 / 11 | 3/9 |\n| 2026-11-17 18:38 | bbb | E2 | 0 (+1) | 4/10 | 1 / 0 / 8 | 3/9 |\n");
    writeFileSync(join(dir, "eval/heldout-readout.md"), "Origin hits: 6/10 on the held-out set.\n");
    expect([devScore(dir), heldOut(dir)]).toEqual(["E2: false origins 0 (+1), target cited 4/10, earliest 1/10 pass", "6/10"]);
  });

  it("turns any failure into one plain FAIL line, never a stack trace", async () => {
    const dir = fakeRoot({ "node_modules/zod": { version: "4.6.7" } });
    mkdirSync(join(dir, "fixtures/traces"), { recursive: true });
    writeFileSync(join(dir, "fixtures/traces/bad.json"), "{ not json");
    const out: string[] = [];
    expect(await runJudge({ root: dir, env: {}, nodeVersion: "v24.1.0", write: (s) => out.push(s) })).toBe(1);
    expect(out.at(-1)).toMatch(/^FAIL make judge stopped: /);
    expect(out.join("\n")).not.toMatch(/^\s+at /m);
  });

  it("make judge works through the CLI with every key empty, inside the 60 s budget", () => {
    const env = { ...process.env, NEBIUS_API_KEY: "", TAVILY_API_KEY: "", TYPESAFE_API_KEY: "" };
    const out = execFileSync("make", ["--no-print-directory", "judge"], { cwd: root, env, encoding: "utf8" });
    expect(out).toContain("make judge passed in");
    expect(out).not.toContain("trace_failed");
  }, 60_000);
});
