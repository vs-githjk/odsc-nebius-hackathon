import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { decideStopState, loadRules } from "../rules/index.ts";
import { StopState, Trace } from "../schema/index.ts";
import { verifyTrace } from "../verify/checks.ts";
import { falseCertainty } from "../verify/false-certainty.ts";
import { bound } from "./bound.ts";

export const TrapCase = z.object({
  id: z.string(), kind: z.literal("trace"), note: z.string(),
  input: z.object({
    tracePath: z.string(),
    mutate: z.array(z.object({ set: z.string(), value: z.unknown() }).strict()),
    cardSentence: z.string().optional(),
  }).strict(),
  expect: z.object({
    state: StopState, falseCertainty: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    verify: z.array(z.string()).default([]),   // pz verify checks the planted problem must fire, sorted
  }).strict(),
}).strict();
export type TrapCase = z.infer<typeof TrapCase>;

export type TrapPaths = { root: string; casesDir: string; lockPath: string };

// Sets one value by a dot path such as "nodes.0.candidateParents".
function setPath(target: unknown, path: string, value: unknown): void {
  const keys = path.split(".");
  let node = target as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) node = node[key] as Record<string, unknown>;
  node[keys.at(-1)!] = structuredClone(value);
}

export function lockText(casesDir: string): string {
  return readdirSync(casesDir).filter((f) => f.endsWith(".json")).sort()
    .map((f) => `${createHash("sha256").update(readFileSync(join(casesDir, f))).digest("hex")}  ${f}\n`).join("");
}

export function relock(paths: TrapPaths): void {
  writeFileSync(paths.lockPath, lockText(paths.casesDir));
}

// `pz traps`: every case's recomputed state and false-certainty counters must match what the case plants.
export function runTraps(paths: TrapPaths): { code: number; lines: string[] } {
  if (lockText(paths.casesDir) !== readFileSync(paths.lockPath, "utf8"))
    return { code: 1, lines: ["FAIL lock check: traps/cases changed since traps.lock; review the change, then run pz traps --relock"] };
  const rules = loadRules();
  const files = readdirSync(paths.casesDir).filter((f) => f.endsWith(".json")).sort();
  const lines: string[] = [];
  let wrongOrigins = 0;
  const misses = [0, 0, 0, 0];
  for (const f of files) {
    const c = TrapCase.parse(JSON.parse(readFileSync(join(paths.casesDir, f), "utf8")));
    const raw = JSON.parse(readFileSync(join(paths.root, c.input.tracePath), "utf8"));
    for (const m of c.input.mutate) setPath(raw, m.set, m.value);
    const trace = Trace.parse(raw);
    const recomputed = decideStopState(trace, rules);
    // A case stores the decision a pipeline run would store, unless it plants a stale one on purpose.
    if (!c.input.mutate.some((m) => m.set.startsWith("decision"))) trace.decision = recomputed;
    const state = recomputed.state;
    const fc = Object.values(falseCertainty(trace, { cardSentence: c.input.cardSentence, rules }));
    if ((state === "ORIGIN_FOUND") !== (c.expect.state === "ORIGIN_FOUND")) wrongOrigins++;
    if (state !== c.expect.state) lines.push(`FAIL ${c.id}: state ${state}, case expects ${c.expect.state}`);
    const fired = [...new Set(verifyTrace(trace, { rules }).failures.map((x) => x.check))].sort();
    if (fired.join(",") !== c.expect.verify.join(",")) lines.push(`FAIL ${c.id}: pz verify fired [${fired.join(", ")}], case expects [${c.expect.verify.join(", ")}]`);
    fc.forEach((v, i) => {
      if (v !== c.expect.falseCertainty[i]) { misses[i]!++; lines.push(`FAIL ${c.id}: false-certainty counter ${i + 1} is ${v}, case expects ${c.expect.falseCertainty[i]}`); }
    });
  }
  const n = files.length;
  lines.push(`wrong origins ${wrongOrigins} of ${n} (95% upper bound ${wrongOrigins === 0 ? (bound(0, n) * 100).toFixed(1) + "%" : "n/a"}), `
    + `false-certainty ${misses.join("/")}, planted by us, by construction`);
  return { code: lines.length === 1 ? 0 : 1, lines };
}
