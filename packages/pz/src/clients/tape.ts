import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cacheKey, createFileCache, type Cache } from "./cache.ts";
import { TokenFactoryError, type ErrorCode, type createTokenFactoryClient } from "./tokenfactory.ts";
import type { UsageRow } from "../schema/usage.ts";

// Recording and replay of a whole live run, so walk changes can be measured at $0 (eval/replay-walk.ts).
//
// A recording directory holds three things, all content-addressed so the order of calls does not matter:
//   http/<key>.json    every Tavily, page, Wayback and registry response (the same files the HTTP cache writes)
//   model/<key>.json   every Token Factory chat and embedding reply, or the error it ended in
//   claims/<id>.json   the clock the claim started at (the search window ends "today", so replay must use the same day)
// Set PZ_RECORD_DIR on a `make dev-run` batch to write one (a bare `pz trace` keys its clock by a random id). Replay never reaches the network: a
// request the recording lacks is a counted miss.

type TokenFactory = ReturnType<typeof createTokenFactoryClient>;
type Chat = TokenFactory["chat"];
type Embed = TokenFactory["embed"];
type ChatResult = Awaited<ReturnType<Chat>>;
type EmbedResult = Awaited<ReturnType<Embed>>;

export type TapeEntry =
  | { kind: "ok"; result: ChatResult | EmbedResult }
  | { kind: "error"; code: ErrorCode; status: number | null; usage: UsageRow[] };

export type Tape = { get(key: string): TapeEntry | null; set(key: string, entry: TapeEntry): void };

export type Miss = { kind: "chat" | "embed" | "http"; detail: string };
export type Misses = { list: Miss[]; add(kind: Miss["kind"], detail: string): void; count(kind?: Miss["kind"]): number };

export function createMisses(): Misses {
  const list: Miss[] = [];
  return {
    list,
    add(kind, detail) { list.push({ kind, detail }); },
    count(kind) { return kind ? list.filter(miss => miss.kind === kind).length : list.length; },
  };
}

export function createFileTape(dir: string): Tape {
  mkdirSync(dir, { recursive: true });
  return {
    get(key) {
      try { return JSON.parse(readFileSync(join(dir, `${key}.json`), "utf8")) as TapeEntry; } catch { return null; }
    },
    set(key, entry) { writeFileSync(join(dir, `${key}.json`), JSON.stringify(entry)); },
  };
}

// The step is left out of the key: it names the caller, not the question.
type ChatInput = Parameters<Chat>[0];
type EmbedInput = Parameters<Embed>[0];
export const chatKey = (input: ChatInput) => cacheKey({ kind: "chat", model: input.model, messages: input.messages,
  jsonSchema: input.jsonSchema ?? null, logprobs: input.logprobs ?? null, topLogprobs: input.topLogprobs ?? null, maxTokens: input.maxTokens });
export const embedKey = (input: EmbedInput) => cacheKey({ kind: "embed", model: input.model, input: input.input, dimensions: input.dimensions ?? null });

async function recorded<T extends ChatResult | EmbedResult>(tape: Tape, key: string, call: () => Promise<T>): Promise<T> {
  try {
    const result = await call();
    tape.set(key, { kind: "ok", result });
    return result;
  } catch (error) {
    if (error instanceof TokenFactoryError) tape.set(key, { kind: "error", code: error.code, status: error.status, usage: error.usage });
    throw error;
  }
}

// Wraps a live client: every reply (and every Token Factory error) is written to the tape as it passes.
export function recordingClient(client: { chat: Chat; embed: Embed }, tape: Tape) {
  return {
    chat: ((input, context) => recorded(tape, chatKey(input), () => client.chat(input, context))) as Chat,
    embed: ((input, context) => recorded(tape, embedKey(input), () => client.embed(input, context))) as Embed,
  };
}

// A client that answers only from the tape. A call the tape lacks is counted and fails like an unreachable provider,
// so the walk takes the same fallback it takes live (modelFailed) and the miss shows up in the report.
export function replayClient(tape: Tape, misses: Misses) {
  const answer = <T extends ChatResult | EmbedResult>(kind: "chat" | "embed", key: string, detail: string): T => {
    const entry = tape.get(key);
    if (!entry) {
      misses.add(kind, detail);
      // PZ_REPLAY_DEBUG=1 prints the start of a missed model request's last message, to find which input changed.
      if (process.env.PZ_REPLAY_DEBUG) console.error(`replay miss (${kind}): ${detail}`);
      throw new TokenFactoryError("network_error", null, []);
    }
    if (entry.kind === "error") throw new TokenFactoryError(entry.code, entry.status, entry.usage);
    return entry.result as T;
  };
  return {
    chat: (async (input) => answer<ChatResult>("chat", chatKey(input), (input.messages.at(-1)?.content ?? "").slice(0, process.env.PZ_REPLAY_DEBUG ? 400 : 80))) as Chat,
    embed: (async (input) => answer<EmbedResult>("embed", embedKey(input), String(Array.isArray(input.input) ? input.input[0] : input.input).slice(0, 80))) as Embed,
  };
}

// A fetch that never leaves the machine. Anything that reaches it is a request the recording lacks.
export function missFetch(misses: Misses): typeof fetch {
  return (async (input: string | URL | Request) => {
    misses.add("http", String(input instanceof Request ? input.url : input));
    throw new Error("replay miss");
  }) as typeof fetch;
}

// Reads from `base` and mirrors every response (hits included) into `dir`, so a recording is complete even when the
// live run was served from an older cache.
export function recordingCache(base: Cache, dir: string): Cache {
  const mirror = createFileCache(dir);
  return {
    get(key) {
      const hit = base.get(key);
      if (hit) mirror.set(key, hit);
      return hit;
    },
    set(key, value) { base.set(key, value); mirror.set(key, value); },
    // Only the recording keeps a failure; the live cache (base) never does, so the next live run tries again.
    recordFailure(key, failure) { mirror.set(key, { credits: 0, body: "", contentType: null, failure }); },
  };
}

// Reads the first cache that has the key; writes nothing. Replay uses it to read a recording plus older caches.
export function readOnlyCaches(...caches: Cache[]): Cache {
  return { get: key => caches.map(cache => cache.get(key)).find(Boolean) ?? null, set() {} };
}

export const recordDirOf = (env: NodeJS.ProcessEnv = process.env): string | null => env.PZ_RECORD_DIR?.trim() || null;

export const recordPaths = (dir: string) => ({ http: join(dir, "http"), model: join(dir, "model"), claims: join(dir, "claims") });

export function writeClaimClock(dir: string, id: string, recordedAt: string): void {
  const { claims } = recordPaths(dir);
  mkdirSync(claims, { recursive: true });
  writeFileSync(join(claims, `${id}.json`), JSON.stringify({ recordedAt }));
}

export function readClaimClock(dir: string, id: string): string | null {
  try { return (JSON.parse(readFileSync(join(recordPaths(dir).claims, `${id}.json`), "utf8")) as { recordedAt: string }).recordedAt; }
  catch { return null; }
}
