import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recordCases, loadT38Cases, replayRecording, writeRecording, type Operations, type Recording, type Case } from "../../../eval/recordings/session.ts";
import { fingerprint } from "../src/engine/fingerprint.ts";
import type { ChatInput, ChatData, Result } from "../src/clients/tokenfactory.ts";

const request: ChatInput = { model: "synthetic-model", messages: [{ role: "user", content: "invented input" }], maxTokens: 64 };
const response: Result<ChatData> = { data: { model: "synthetic-model", content: "{}", logprobs: null },
  usage: { at: "2026-11-10T00:00:00Z", traceId: "invented", step: "intake", service: "tokenfactory", endpoint: "/chat/completions",
    model: "synthetic-model", promptTokens: 9, completionTokens: 2, cachedTokens: 0, costUsd: 0.00001,
    latencyMs: 7, credits: 0, status: "200", cacheHit: false }, attempts: [] };
response.attempts = [response.usage];
const operation: Operations["intake"] = async (_source, { client }) => (await client.chat(structuredClone(request))).data;
const operations = { intake: operation, fingerprint: operation };
const cases: Case[] = [{ kind: "intake", id: "invented-01", source: "There are 12 invented birds." },
  { kind: "fingerprint", id: "dev-example", source: "There are 14 invented pools." }];
const setup = () => {
  const saved: Recording[] = [], order: string[] = [];
  const deps = { provenance: "SYNTHETIC" as const, operations: { ...operations }, now: () => "2026-11-10T00:00:00Z",
    beforeCase: (item: Case) => { order.push("budget:" + item.id); },
    clientFor: (item: Case) => ({ chat: async () => { order.push("chat:" + item.id); return structuredClone(response); } }),
    write: (record: Recording) => { saved.push(structuredClone(record)); } };
  return { saved, order, deps };
};

describe("T38 recording transport, synthetic responses only", () => {
  it("captures exact requests/responses, original usage and timestamps in order and replays keylessly", async () => {
    const { saved, order, deps } = setup();
    await recordCases(cases, deps);
    expect(order).toEqual(["budget:invented-01", "chat:invented-01", "budget:dev-example", "chat:dev-example"]);
    expect(saved).toHaveLength(2);
    for (const record of saved) {
      expect(record).toMatchObject({ provenance: "SYNTHETIC", recordedAt: "2026-11-10T00:00:00Z", usage: response.attempts,
        calls: [{ request, response }], status: "completed" });
      expect(await replayRecording(record, operations)).toEqual(response.data);
    }
  });
  it("validates all cases before any call and refuses duplicate/path-like ids", async () => {
    for (const bad of [{ ...cases[1]!, id: "../escape" }, { ...cases[0]! }, { ...cases[1]!, source: " " }]) {
      const { order, deps } = setup();
      await expect(recordCases([cases[0]!, bad], deps)).rejects.toThrow("Invalid recording manifest");
      expect(order).toEqual([]);
    }
  });
  it("stops before a call when the caller's budget check fails", async () => {
    const { order, saved, deps } = setup();
    deps.beforeCase = () => { throw new Error("budget_exceeded"); };
    await expect(recordCases(cases, deps)).rejects.toThrow("budget_exceeded");
    expect(order).toEqual([]); expect(saved).toEqual([]);
  });
  it("persists failed attempt usage and a safe code, then stops without the next case", async () => {
    const { saved, order, deps } = setup();
    deps.clientFor = item => ({ chat: async () => {
      order.push("chat:" + item.id);
      throw Object.assign(new Error("private provider body"), { code: "http_error", usage: response.attempts });
    } });
    await expect(recordCases(cases, deps)).rejects.toThrow("http_error");
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ status: "failed", errorCode: "http_error", usage: response.attempts });
    expect(JSON.stringify(saved)).not.toContain("private provider body");
    expect(order).toHaveLength(2);
  });
  it("cannot replay with changed prompts, unused calls, extra calls or different outputs", async () => {
    const { saved, deps } = setup(); await recordCases([cases[0]!], deps);
    const record = saved[0]!;
    const changed: Operations = { ...operations, intake: async (_s, { client }) => client.chat({ ...request, maxTokens: 65 }) };
    await expect(replayRecording(record, changed)).rejects.toThrow("request mismatch");
    await expect(replayRecording(record, { ...operations, intake: async () => response.data })).rejects.toThrow("output mismatch");
    await expect(replayRecording(record, { ...operations, intake: async (_s, { client }) => {
      await client.chat(request); return client.chat(request);
    } })).rejects.toThrow("request mismatch");
    await expect(replayRecording(record, { ...operations, intake: async (_s, { client }) => {
      await client.chat(request); return "changed";
    } })).rejects.toThrow("output mismatch");
  });
  it("loads only the five approved intake answers and 20 E2 texts, ignoring handwritten responses", () => {
    const root = mkdtempSync(join(tmpdir(), "pz-t38-inputs-"));
    const dir = join(root, "packages/pz/test/recorded/intake"); mkdirSync(dir, { recursive: true });
    mkdirSync(join(root, "eval"));
    const names = ["01-plain", "02-paraphrase", "03-invented-number", "04-ranges-and-dupes", "05-injection"];
    for (const name of names) writeFileSync(join(dir, name + ".json"), JSON.stringify({ answer: name, response: "FAKE MUST NOT BE USED" }));
    const dev = Array.from({ length: 20 }, (_, i) => ({ id: `dev-${i + 1}`, text: `Invented ${i + 1} pools`, tracedOrigin: "unused" }));
    writeFileSync(join(root, "eval/dev-claims.json"), JSON.stringify(dev));
    const loaded = loadT38Cases(root);
    expect(loaded).toHaveLength(25);
    expect(loaded.slice(0, 5).map(c => c.source)).toEqual(names);
    expect(loaded.slice(5).map(c => c.source)).toEqual(dev.map(c => c.text));
    expect(JSON.stringify(loaded)).not.toContain("FAKE MUST NOT BE USED");
    expect(JSON.stringify(loaded)).not.toContain("tracedOrigin");
    writeFileSync(join(root, "eval/dev-claims.json"), "[]");
    expect(() => loadT38Cases(root)).toThrow("20 E2");
  });
  it("captures and replays the real merged fingerprint operation with a synthetic provider response", async () => {
    const { saved, deps } = setup();
    const content = JSON.stringify({ subject: "birds", unit: null, population: null, time: null, hedge: null, namedSource: null });
    deps.operations.fingerprint = fingerprint;
    deps.clientFor = () => ({ chat: async () => ({ ...structuredClone(response), data: { ...response.data, content } }) });
    await recordCases([{ kind: "fingerprint", id: "invented-01", source: "There are 12 birds." }], deps);
    expect(saved[0]).toMatchObject({ provenance: "SYNTHETIC", output: { atoms: { subjectLemma: "bird" }, reason: null } });
    expect(await replayRecording(saved[0]!, deps.operations)).toEqual(saved[0]!.status === "completed" && saved[0]!.output);
  });
  it("records exclusively without overwriting an existing capture; write failure stops the batch", async () => {
    const { saved, deps } = setup(); await recordCases([cases[0]!], deps);
    const root = mkdtempSync(join(tmpdir(), "pz-t38-"));
    writeRecording(root, saved[0]!);
    expect(JSON.parse(readFileSync(join(root, "intake", "invented-01.json"), "utf8"))).toEqual(saved[0]);
    expect(() => writeRecording(root, saved[0]!)).toThrow();
    const next = setup(); next.deps.write = () => { throw new Error("disk full"); };
    await expect(recordCases(cases, next.deps)).rejects.toThrow("disk full");
    expect(next.order).toHaveLength(2);
  });
});
