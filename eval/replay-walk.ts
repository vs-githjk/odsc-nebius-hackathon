// make replay-walk SET=E2: re-runs the whole pipeline, walk included, for each dev claim against recorded responses
// only, at $0. Every Tavily, Token Factory, Wayback and page request is answered from the HTTP cache a live run wrote
// (PZ_CACHE_DIR, default .cache/http; `pz trace` records Token Factory answers there too since #192's harness PR).
// A request the recording does not have is never sent: it is listed as a miss and fails like a network error, so a
// claim with misses is a changed walk whose score is not a $0 measurement. A claim with no misses is an exact replay,
// and its score shows what a code change (F1, F6, F7, ...) does to that walk.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { createFileCache, type Cache } from "../packages/pz/src/clients/cache.ts";
import { createPipeline } from "../packages/pz/src/engine/pipeline.ts";
import { runTrace } from "../packages/pz/src/engine/run.ts";
import { Trace } from "../packages/pz/src/schema/index.ts";
import { devSetsToScore, headline, perClaimLines, scoreClaim, summarise, type ClaimScore, type DevClaim } from "./dev-score.ts";

export type Replayed = { trace: Trace | null; misses: string[]; error: string | null };

// Names a request without its body or headers (which may carry a key): the service and the endpoint or host.
function describe(input: string | URL | Request): string {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname.includes("tavily")) return `tavily ${url.pathname}`;
  if (url.hostname.includes("tokenfactory")) return `tokenfactory ${url.pathname.replace(/^\/v1/, "")}`;
  if (url.hostname === "web.archive.org") return "wayback cdx";
  return `page ${url.hostname}`;
}

// One claim through the real pipeline with the network replaced by the recording.
export async function replayClaim(text: string, opts: { cache: Cache; workDir: string }): Promise<Replayed> {
  const misses: string[] = [];
  const offline = (async (input: string | URL | Request, init?: RequestInit) => {
    // PZ_REPLAY_DEBUG=1 shows the start of a missed model request's user message (already key-redacted by the pipeline),
    // to find which input changed. Tavily and page bodies are not printed.
    if (process.env.PZ_REPLAY_DEBUG && describe(input).startsWith("tokenfactory ")) {
      let user = "";
      try { user = JSON.stringify(JSON.parse(String(init?.body ?? "{}")).messages?.[1]?.content ?? "").slice(0, 400); } catch { /* not JSON */ }
      console.error("miss", describe(input), user);
    }
    misses.push(describe(input));
    throw new TypeError("not in the recording (offline replay)");
  }) as typeof fetch;
  mkdirSync(opts.workDir, { recursive: true });
  const { pipeline, wayback } = createPipeline({
    tokenFactoryFetch: offline, embeddingFetch: offline, tavilyFetch: offline, archiveFetch: offline, pageFetch: offline,
    // Placeholders: a recorded answer is found by its request, never by a key, and a miss never leaves the machine.
    nebiusKey: "replay-offline", tavilyKey: "replay-offline",
    resolveHost: async () => ["93.184.216.34"], sleep: async () => {},
    cache: opts.cache, pagesDir: join(opts.workDir, "pages"), usagePath: join(opts.workDir, "usage.jsonl"),
  });
  try {
    return { trace: await runTrace(text, pipeline, { wayback }), misses, error: null };
  } catch (err) {
    return { trace: null, misses, error: err instanceof Error ? err.message : String(err) };
  }
}

const paid = (m: string) => m.startsWith("tavily ") || m.startsWith("tokenfactory ");
const counted = (ms: string[]) => {
  const byKind = new Map<string, number>();
  for (const m of ms) byKind.set(m, (byKind.get(m) ?? 0) + 1);
  return [...byKind].map(([k, n]) => `${k} x${n}`).join(", ");
};

// What a replayed claim says beside its score. A paid request (Tavily, Token Factory) missing from the recording means
// the walk itself changed. A free lookup (a page or Wayback) is recorded only when it succeeded, so a miss there is
// usually one that failed live as well, and it fails the same way here.
export function fidelity(r: Replayed): string {
  if (r.error) return r.misses.length ? `failed: ${r.error}, after ${r.misses.length} request(s) not recorded (${counted(r.misses)})` : `failed: ${r.error}`;
  const changed = r.misses.filter(paid);
  const free = r.misses.filter((m) => !paid(m));
  if (changed.length > 0) return `walk changed: ${changed.length} paid request(s) not recorded (${counted(changed)})`;
  return free.length === 0 ? "exact replay, $0" : `exact replay, $0 (${free.length} free lookup(s) not recorded: ${counted(free)})`;
}

export const exactReplay = (r: Replayed) => !r.error && !r.misses.some(paid);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { set: { type: "string" }, cache: { type: "string" }, out: { type: "string" } } });
  const cacheDir = values.cache ?? process.env.PZ_CACHE_DIR ?? ".cache/http";
  if (!existsSync(cacheDir)) {
    console.error(`No recording at ${cacheDir}. Point --cache (or PZ_CACHE_DIR) at the HTTP cache a live run wrote.`);
    process.exit(1);
  }
  const cache = createFileCache(cacheDir);
  const outDir = values.out ?? "runs/replay-walk";
  for (const { set, file } of devSetsToScore(values.set)) {
    const claims: DevClaim[] = JSON.parse(readFileSync(file, "utf8"));
    const scores: ClaimScore[] = [];
    let exact = 0;
    for (const claim of claims) {
      if (claim.outOfScope) {
        scores.push(scoreClaim(claim, null));
        continue;
      }
      const r = await replayClaim(claim.text, { cache, workDir: join(outDir, set, claim.id) });
      if (r.trace) writeFileSync(join(outDir, set, claim.id, "trace.json"), JSON.stringify(r.trace, null, 2));
      if (exactReplay(r)) exact += 1;
      scores.push(scoreClaim(claim, r.trace));
      console.error(`${claim.id}  ${fidelity(r)}`);
    }
    for (const line of perClaimLines(scores)) console.log(line);
    console.log(`${set} replay-walk: ${headline(summarise(scores))} | ${exact} of ${claims.filter((c) => !c.outOfScope).length} exact replays`);
  }
}
