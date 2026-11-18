import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_CACHE_DIR = ".cache/http";

// failure: only a walk recording stores one (recordingCache), so a replay meets a lookup that failed live as the same
// failure instead of a miss. A plain cache never holds one, so a live run retries a transient error.
export type CachedFailure = { code: "http_error" | "network_error" | "bad_response"; status?: number; timedOut?: boolean };
export type CachedResponse = { credits: number; body: string; contentType: string | null; failure?: CachedFailure };

export type Cache = {
  get(key: string): CachedResponse | null;
  set(key: string, value: CachedResponse): void;
  // Present only on a recording: keeps a request's final failure for replay.
  recordFailure?(key: string, failure: CachedFailure): void;
};

// Callers pass the request without its auth header, so the key never depends on an API key.
export function cacheKey(request: unknown): string {
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

export function createFileCache(dir: string = DEFAULT_CACHE_DIR): Cache {
  mkdirSync(dir, { recursive: true });
  return {
    get(key) {
      try {
        return JSON.parse(readFileSync(join(dir, `${key}.json`), "utf8")) as CachedResponse;
      } catch {
        return null;
      }
    },
    set(key, value) {
      writeFileSync(join(dir, `${key}.json`), JSON.stringify(value));
    },
  };
}
