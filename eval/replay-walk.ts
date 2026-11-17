// make replay-walk SET=E2: reruns the whole live pipeline (walk, dating, clusters, readouts, card) for every claim of a
// dev set from a recording, at $0, so a walk change (same_claim filtering, dedupe, depth cap) can be measured without
// spending. See eval/README.md. Needs a recording made by a live run with PZ_RECORD_DIR set; nothing here touches the
// network: a request the recording lacks is a counted miss.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createFileCache, DEFAULT_CACHE_DIR } from "../packages/pz/src/clients/cache.ts";
import { createTavily } from "../packages/pz/src/clients/tavily.ts";
import {
  createFileTape, createMisses, missFetch, readClaimClock, readOnlyCaches, recordPaths, replayClient, type Misses,
} from "../packages/pz/src/clients/tape.ts";
import { buildPipeline } from "../packages/pz/src/engine/pipeline.ts";
import { runTrace } from "../packages/pz/src/engine/run.ts";
import type { Trace } from "../packages/pz/src/schema/index.ts";
import { devSetsToScore, headline, perClaimLines, scoreDir, summarise, type DevClaim } from "./dev-score.ts";

export const DEFAULT_RECORD_DIR = "runs/walk-record";
export const COMMITTED_TRACES = "eval/dev-traces";

type Tavily = ReturnType<typeof createTavily>;
export type ReplayOptions = {
  recordDir: string;
  scratch: string;
  // Older HTTP caches to read after the recording's own (last night's .cache/http, say). Read only.
  extraHttpDirs?: string[];
  misses: Misses;
  // Wraps the Tavily client of each walk. Tests use it to change what the walk sees, as a walk code change would.
  wrapTavily?: (tavily: Tavily) => Tavily;
};

// One claim through the real pipeline, answered only from the recording. Throws if the claim has no recorded clock,
// because the search window ends "today" and a different day is a different request.
export async function replayClaim(claim: { id: string; text: string }, opts: ReplayOptions): Promise<Trace> {
  const recordedAt = readClaimClock(opts.recordDir, claim.id);
  if (!recordedAt) throw new Error(`no recording for ${claim.id}`);
  const paths = recordPaths(opts.recordDir);
  const tape = createFileTape(paths.model);
  const model = replayClient(tape, opts.misses);
  const http = missFetch(opts.misses);
  const caches = [paths.http, ...(opts.extraHttpDirs ?? [])].filter(dir => existsSync(dir)).map(dir => createFileCache(dir));
  const pagesDir = join(opts.scratch, "pages");
  mkdirSync(pagesDir, { recursive: true });
  const { pipeline, wayback } = buildPipeline({
    chat: model, embed: model,
    // The key is a placeholder: no request is ever sent, and Tavily's cache key never contains it.
    tavily: deps => { const tavily = createTavily({ ...deps, apiKey: "replay-placeholder", fetch: http }); return opts.wrapTavily?.(tavily) ?? tavily; },
    archiveFetch: http, pageFetch: http, resolveHost: async () => ["93.184.216.34"], sleep: async () => {},
    cache: readOnlyCaches(...caches), traceId: claim.id, pagesDir, usagePath: join(opts.scratch, "usage.jsonl"),
    clock: () => new Date(recordedAt), record: false,
  });
  return runTrace(claim.text, pipeline, { wayback });
}

export type ReplayReport = { replayed: number; failed: { id: string; reason: string }[]; misses: Misses };

export async function replayWalk(claims: DevClaim[], opts: Omit<ReplayOptions, "misses"> & { outDir: string; report?: (line: string) => void }): Promise<ReplayReport> {
  const misses = createMisses();
  const failed: ReplayReport["failed"] = [];
  mkdirSync(opts.outDir, { recursive: true });
  let replayed = 0;
  for (const claim of claims) {
    const path = join(opts.outDir, `${claim.id}.json`);
    rmSync(path, { force: true });
    const before = misses.count();
    try {
      const trace = await replayClaim(claim, { ...opts, misses });
      writeFileSync(path, JSON.stringify(trace, null, 2) + "\n");
      replayed++;
      opts.report?.(`${claim.id}  ${trace.decision.state}  misses ${misses.count() - before}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "replay failed";
      failed.push({ id: claim.id, reason });
      opts.report?.(`${claim.id}  FAILED (${reason})  misses ${misses.count() - before}`);
    }
  }
  return { replayed, failed, misses };
}

export const missLine = (misses: Misses) =>
  `misses ${misses.count()} (model ${misses.count("chat") + misses.count("embed")}, http ${misses.count("http")})`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { set: { type: "string" }, record: { type: "string" }, out: { type: "string" }, "http-dir": { type: "string", multiple: true } } });
  const [entry] = devSetsToScore(values.set ?? "E2");
  const { set, file } = entry!;
  const claims: DevClaim[] = JSON.parse(readFileSync(file, "utf8"));
  const recordDir = resolve(values.record ?? process.env.PZ_RECORD_DIR ?? DEFAULT_RECORD_DIR);
  const outDir = resolve(values.out ?? join("runs", "replay-walk", set));
  const extra = (values["http-dir"] ?? [DEFAULT_CACHE_DIR]).map(dir => resolve(dir));
  const lacking = claims.filter(claim => !existsSync(join(recordPaths(recordDir).claims, `${claim.id}.json`)));
  if (lacking.length === claims.length) {
    console.log(`No walk recording in ${recordDir}. Run a live batch with PZ_RECORD_DIR=${recordDir} (make dev-run) to record one.`);
    console.log(`The committed traces in ${COMMITTED_TRACES} hold counts, not the search results, pages or model answers a replay needs.`);
    process.exitCode = 1;
  } else {
    const report = await replayWalk(claims.filter(claim => !lacking.includes(claim)), { recordDir, scratch: outDir, outDir, extraHttpDirs: extra, report: line => console.log(line) });
    for (const line of perClaimLines(scoreDir(outDir, claims))) console.log(line);
    console.log(`${set} replay:    ${headline(summarise(scoreDir(outDir, claims)))}`);
    if (existsSync(COMMITTED_TRACES)) console.log(`${set} committed: ${headline(summarise(scoreDir(COMMITTED_TRACES, claims)))}`);
    console.log(`${missLine(report.misses)}; ${report.replayed} of ${claims.length} claims replayed${lacking.length ? `, ${lacking.length} without a recording (${lacking.map(c => c.id).join(", ")})` : ""}${report.failed.length ? `, ${report.failed.length} failed` : ""}`);
    for (const miss of report.misses.list.slice(0, 5)) console.log(`  miss ${miss.kind}: ${miss.detail}`);
    if (report.failed.length) process.exitCode = 1;
  }
}
