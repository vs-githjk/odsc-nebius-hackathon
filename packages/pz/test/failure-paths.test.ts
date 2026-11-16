import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CASES, recordCase, type CaseId } from "../../../fixtures/failure/record.ts";
import { replayTrace } from "../src/engine/run.ts";
import { Trace } from "../src/schema/index.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const path = (id: CaseId) => `fixtures/failure/traces/${id}.json`;
const committed = (id: CaseId) => Trace.parse(JSON.parse(readFileSync(root + path(id), "utf8")));
const keyless = { ...process.env, NEBIUS_API_KEY: "", TAVILY_API_KEY: "", TYPESAFE_API_KEY: "" };

describe("T76 failure paths through the engine's stages, replayable with no keys", () => {
  it("a forced Tavily 503 on search ends TOOL_FAILED, naming the service, endpoint and code", async () => {
    const { trace, calls } = await recordCase("failure-tavily-503");
    expect(trace.decision).toMatchObject({ state: "TOOL_FAILED", row: 1 });
    expect(trace.failure).toEqual({ service: "tavily", endpoint: "search", status: "http_error 503", kept: "0 pages read before the failure" });
    // The HTTP layer retried once before giving up, and both attempts are in the usage rows at zero credits.
    expect(trace.usage.map((u) => [u.service, u.endpoint, u.status, u.credits])).toEqual([["tavily", "search", "503", 0], ["tavily", "search", "503", 0]]);
    expect(calls.every((u) => u.endsWith("/search"))).toBe(true);
  });

  it("an empty search ends NO_PAGES_FOUND after the earlier-window searches, not as a tool failure", async () => {
    const { trace } = await recordCase("failure-empty-search");
    expect(trace.decision).toMatchObject({ state: "NO_PAGES_FOUND", row: 3 });
    expect(trace.failure).toBeNull();
    expect(trace.nodes).toEqual([]);
    expect(trace.searchLog.length).toBeGreaterThan(0);
    expect(trace.searchLog.every((s) => s.results === 0)).toBe(true);
  });

  it.each(Object.keys(CASES) as CaseId[])("%s: the committed file is exactly what the engine writes, labelled synthetic", async (id) => {
    const { trace } = await recordCase(id);
    expect(trace).toEqual(committed(id));
    expect(trace).toMatchObject({ mode: "SAMPLE", synthetic: true });
    expect(trace.scopeNote).toContain("not captured from a live call");
    // Replay keeps it SAMPLE: an authored response is never shown as a recording.
    expect(replayTrace(committed(id)).mode).toBe("SAMPLE");
  });

  it.each(Object.keys(CASES) as CaseId[])("%s: make replay and pz verify both work with every key empty", (id) => {
    const shown = execFileSync("make", ["--no-print-directory", "replay", `TRACE=${path(id)}`], { cwd: root, env: keyless, encoding: "utf8" });
    expect(shown).toMatch(id === "failure-tavily-503" ? /http_error 503/ : /NO_PAGES_FOUND|No pages found/);
    const verified = execFileSync(process.execPath, ["--import", "tsx", "packages/pz/src/cli/pz.ts", "verify", path(id)], { cwd: root, env: keyless, encoding: "utf8" });
    expect(verified).toContain("stop state agrees");
  });
});
