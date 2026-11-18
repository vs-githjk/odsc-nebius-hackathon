import { isDeepStrictEqual } from "node:util";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChatData, ChatInput, Result } from "../../packages/pz/src/clients/tokenfactory.ts";
import { z } from "zod";
import { claimNumber } from "../../packages/pz/src/engine/fingerprint.ts";
import { UsageRow } from "../../packages/pz/src/schema/usage.ts";

export type Case = { kind: "intake" | "fingerprint"; id: string; source: string };
type Client = { chat(input: ChatInput): Promise<Result<ChatData>> };
export type Operations = Record<Case["kind"], (source: string, deps: { client: Client }) => Promise<unknown>>;
type Call = { request: ChatInput; response: Result<ChatData> };
export type Recording = Case & {
  provenance: "LIVE" | "SYNTHETIC" | "NO_CALL"; recordedAt: string; calls: Call[]; usage: UsageRow[];
} & ({ status: "completed"; output: unknown } | { status: "failed"; errorCode: string });

const LiveRecording = z.object({
  provenance: z.literal("LIVE"),
  status: z.literal("completed"),
  calls: z.array(z.object({
    response: z.object({ attempts: z.array(UsageRow).min(1), usage: UsageRow }),
  })).min(1),
  usage: z.array(UsageRow).min(1),
});

export function assertLiveRecording(record: unknown): asserts record is Recording {
  const parsed = LiveRecording.parse(record);
  const attempts = parsed.calls.flatMap(call => call.response.attempts);
  if (!isDeepStrictEqual(parsed.usage, attempts) ||
      parsed.calls.some(({ response }) => !isDeepStrictEqual(response.usage, response.attempts.at(-1)))) {
    throw new Error("recording_usage_mismatch");
  }
}

const NO_CALL_IDS = new Set(["dev-01", "dev-07", "dev-08", "dev-12"]);
export function isNoCallCase(item: Case): boolean {
  return item.kind === "fingerprint" && NO_CALL_IDS.has(item.id) && claimNumber(item.source) === null;
}

export function assertCompletedCapture(record: unknown, item: Case): asserts record is Recording {
  if (!isNoCallCase(item)) {
    assertLiveRecording(record);
    return;
  }
  z.object({
    provenance: z.literal("NO_CALL"), status: z.literal("completed"),
    calls: z.tuple([]), usage: z.tuple([]),
    output: z.object({ reason: z.literal("no_number") }),
  }).parse(record);
}

const safeCode = (error: unknown) => {
  const codes = ["not_configured", "http_error", "network_error", "bad_response", "budget_exceeded", "budget_bound_exceeded"];
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    && codes.includes(error.code) ? error.code : "recording_failed";
};

// Fixed E2 and approved intake paths: no arbitrary input/held-out path option.
export function loadT38Cases(root = "."): Case[] {
  const dir = join(root, "packages/pz/test/recorded/intake");
  const files = readdirSync(dir).filter(name => name.endsWith(".json")).sort();
  const expected = ["01-plain.json", "02-paraphrase.json", "03-invented-number.json", "04-ranges-and-dupes.json", "05-injection.json"];
  if (!isDeepStrictEqual(files, expected)) throw new Error("Expected the five approved intake cases");
  const intake = files.map(name => {
    const value: unknown = JSON.parse(readFileSync(join(dir, name), "utf8"));
    if (!value || typeof value !== "object" || !("answer" in value) || typeof value.answer !== "string") throw new Error("Invalid intake input");
    return { kind: "intake" as const, id: name.slice(0, -5), source: value.answer };
  });
  const claims: unknown = JSON.parse(readFileSync(join(root, "eval/dev-claims.json"), "utf8"));
  if (!Array.isArray(claims) || claims.length !== 20) throw new Error("Expected the 20 E2 dev claims");
  const fingerprint = claims.map((value: unknown) => {
    if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string"
      || !("text" in value) || typeof value.text !== "string") throw new Error("Invalid E2 input");
    return { kind: "fingerprint" as const, id: value.id, source: value.text };
  });
  if (fingerprint.some(item => !/^[a-zA-Z0-9_-]+$/.test(item.id) || !item.source.trim())
      || new Set(fingerprint.map(item => item.id)).size !== fingerprint.length) {
    throw new Error("Invalid E2 manifest");
  }
  return [...intake, ...fingerprint];
}

// No provider or prompt is selected here. The caller supplies merged operations
// and the existing client, with the weekly budget enforced on each HTTP attempt.
export async function recordCases(cases: readonly Case[], deps: {
  provenance: Recording["provenance"]; operations: Operations;
  clientFor(item: Case): Client;
  beforeCase(item: Case): void | Promise<void>;
  write(record: Recording): void | Promise<void>;
  now?: () => string;
}): Promise<void> {
  const seen = new Set<string>();
  // Validate the entire manifest before a paid call or a partial output.
  for (const item of cases) {
    const key = `${item.kind}/${item.id}`;
    if (!["intake", "fingerprint"].includes(item.kind) || !/^[a-zA-Z0-9_-]+$/.test(item.id)
      || !item.source.trim() || seen.has(key)) throw new Error("Invalid recording manifest");
    seen.add(key);
  }
  for (const item of cases) {
    await deps.beforeCase(item);
    const client = deps.clientFor(item);
    const calls: Call[] = [], usage: UsageRow[] = [];
    const base = { ...item, provenance: deps.provenance, recordedAt: (deps.now ?? (() => new Date().toISOString()))(), calls, usage };
    let record: Recording;
    try {
      const output = await deps.operations[item.kind](item.source, { client: { chat: async request => {
        const snapshot = structuredClone(request);
        try {
          const response = await client.chat(request);
          calls.push({ request: snapshot, response: structuredClone(response) });
          usage.push(...structuredClone(response.attempts));
          return response;
        } catch (error) {
          if (error && typeof error === "object" && "usage" in error && Array.isArray(error.usage)) {
            usage.push(...structuredClone(error.usage as UsageRow[]));
          }
          throw error;
        }
      } } });
      record = { ...base, status: "completed", output: structuredClone(output) };
    } catch (error) {
      // Preserve available attempt usage on failure, but never provider messages.
      record = { ...base, status: "failed", errorCode: safeCode(error) };
    }
    await deps.write(record);
    if (record.status === "failed") throw new Error(record.errorCode);
  }
}

// Re-run the unchanged operation using its saved responses. No network/client
// fallback exists: changed requests, extra calls and changed output all fail.
export async function replayRecording(record: Recording, operations: Operations): Promise<unknown> {
  if (record.status !== "completed") throw new Error("Cannot replay a failed recording");
  let index = 0;
  const output = await operations[record.kind](record.source, { client: { chat: async request => {
    const saved = record.calls[index++];
    if (!saved || !isDeepStrictEqual(request, saved.request)) throw new Error("Recorded request mismatch");
    return structuredClone(saved.response);
  } } });
  if (index !== record.calls.length || !isDeepStrictEqual(output, record.output)) throw new Error("Recorded output mismatch");
  return output;
}

export function writeRecording(root: string, record: Recording): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(record.id) || !["intake", "fingerprint"].includes(record.kind)) throw new Error("Invalid recording path");
  const dir = join(root, record.kind);
  mkdirSync(dir, { recursive: true });
  const staging = mkdtempSync(join(dir, ".capture-"));
  try {
    const temporary = join(staging, "record.json");
    writeFileSync(temporary, JSON.stringify(record, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    linkSync(temporary, join(dir, record.id + ".json"));
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
