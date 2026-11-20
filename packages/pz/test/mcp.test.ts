import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createMcpSession } from "../src/mcp/server.ts";

const message = (method: string, params?: unknown, id: number | undefined = 1) => JSON.stringify({ jsonrpc: "2.0", id, method, params });
async function session() { const dispatch = createMcpSession({}); await dispatch(message("initialize")); return dispatch; }
describe("MCP stdio tools", () => {
  it("negotiates a supported version, lists tools and ignores notifications", async () => {
    const dispatch = createMcpSession({});
    expect(await dispatch(message("tools/list"))).toMatchObject({ error: { code: -32000 } });
    expect(await dispatch(message("initialize"))).toMatchObject({ result: { protocolVersion: "2025-06-18", capabilities: { tools: {} } } });
    expect(await dispatch(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }))).toBeUndefined();
    expect(await dispatch(message("tools/list"))).toMatchObject({ result: { tools: [{ name: "pz_trace" }, { name: "pz_verify" }] } });
    expect(await dispatch("{")).toMatchObject({ error: { code: -32700 } });
    expect(await dispatch(message("unknown"))).toMatchObject({ error: { code: -32601 } });
  });
  it("replays sample and real recordings keylessly", async () => {
    const dispatch = await session();
    for (const args of [{}, { replayPath: "eval/dev-traces/dev-10.json" }]) {
      const reply = await dispatch(message("tools/call", { name: "pz_trace", arguments: args })) as any;
      expect(reply.result.isError).toBe(false);
      const data = JSON.parse(reply.result.content[0].text);
      expect(data.kind).toBe("trace_data");
      expect(data.trace.mode).toBe("replayPath" in args ? "REPLAY" : "SAMPLE");
    }
  });
  it("verifies JSON and paths, and reports a corrupted window without accepting it", async () => {
    const dispatch = await session();
    const trace = JSON.parse(readFileSync("fixtures/traces/sample-rich.json", "utf8"));
    for (const args of [{ path: "fixtures/traces/sample-rich.json" }, { trace }]) {
      expect(await dispatch(message("tools/call", { name: "pz_verify", arguments: args }))).toMatchObject({ result: { isError: false } });
    }
    trace.spans[0].windowSha256 = "0".repeat(64);
    expect(await dispatch(message("tools/call", { name: "pz_verify", arguments: { trace } }))).toMatchObject({ result: { isError: true } });
  });
  it("does not allow custom pipeline imports or echo arbitrary adapter errors", async () => {
    const run = vi.fn(async (_args, io) => { io.error("private-provider-secret"); return 1; });
    const dispatch = createMcpSession({}, run);
    await dispatch(message("initialize"));
    const invalid = await dispatch(message("tools/call", { name: "pz_trace", arguments: { pipeline: "private.ts" } }));
    expect(invalid).toMatchObject({ result: { isError: true } }); expect(run).not.toHaveBeenCalled();
    const failed = await dispatch(message("tools/call", { name: "pz_trace", arguments: { claim: "--pipeline=private.ts" } }));
    expect(run.mock.calls[0]![0]).toEqual(["--json", "--", "--pipeline=private.ts"]);
    expect(JSON.stringify(failed)).not.toContain("private-provider-secret");
  });
  it("refuses LIVE without keys before any provider request", async () => {
    const dispatch = await session();
    const reply = await dispatch(message("tools/call", { name: "pz_trace", arguments: { claim: "Only nine percent of plastic is recycled." } }));
    expect(reply).toMatchObject({ result: { isError: true, content: [{ text: '{"code":"not_configured"}' }] } });
  });
  it("keeps stdout to newline-delimited protocol messages in the real process", () => {
    const input = [message("initialize"), JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), message("tools/list", {}, 2), message("tools/call", { name: "pz_trace", arguments: {} }, 3)].join("\n") + "\n";
    const result = spawnSync(process.execPath, ["--import", resolve("node_modules/tsx/dist/loader.mjs"), resolve("packages/pz/src/mcp/server.ts")],
      { input, cwd: tmpdir(), encoding: "utf8", timeout: 15000 });
    expect(result.status).toBe(0);
    const replies = result.stdout.trim().split("\n").map(line => JSON.parse(line));
    expect(replies.map(reply => reply.id)).toEqual([1, 2, 3]);
    expect(replies[2].result.isError).toBe(false);
  });
});
