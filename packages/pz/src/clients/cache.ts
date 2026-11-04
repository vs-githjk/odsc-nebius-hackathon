import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_CACHE_DIR = ".cache/http";

export type CachedResponse = { credits: number; body: string; contentType: string | null };

export type Cache = {
  get(key: string): CachedResponse | null;
  set(key: string, value: CachedResponse): void;
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
