#!/usr/bin/env -S node --import tsx
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PZ_VERSION } from "../index.ts";
import { relock, runTraps } from "../traps/run.ts";
import { runPipelineTraps } from "../traps/pipeline.ts";
import { loadRules } from "../rules/index.ts";
import { runVerify, type HistoricalManifest } from "../verify/index.ts";
import { answerCommand } from "./answer.ts";
import { formatDoctor, runDoctor } from "./doctor.ts";
import { runJudge } from "./judge.ts";
import { traceCommand } from "./trace.ts";

const [command, ...args] = process.argv.slice(2);

if (command === "--version") {
  console.log(PZ_VERSION);
} else if (command === "verify") {
  if (args.includes("--refetch")) {
    console.error("not built yet (Run 2)");
    process.exit(2);
  }
  const usage = "usage: pz verify <trace.json...> [--pages <dir>] [--historical <manifest.json>]";
  const option = (name: string) => {
    const at = args.indexOf(name);
    const value = at >= 0 ? args[at + 1] : undefined;
    if (at >= 0 && (!value || value.startsWith("--"))) {
      console.error(usage);
      process.exit(2);
    }
    return { at, value };
  };
  const pages = option("--pages");
  const historical = option("--historical");
  // Every option and its value; what is left are the trace paths.
  const optionSlots = new Set([pages, historical].filter((o) => o.at >= 0).flatMap((o) => [o.at, o.at + 1]));
  const paths = args.filter((_, i) => !optionSlots.has(i));
  if (paths.length === 0) {
    console.error(usage);
    process.exit(2);
  }
  const manifest = historical.value ? (JSON.parse(readFileSync(historical.value, "utf8")) as HistoricalManifest) : undefined;
  const { code, lines } = runVerify(paths, { pagesDir: pages.value, historical: manifest });
  for (const line of lines) console.log(line);
  process.exitCode = code;
} else if (command === "trace") {
  // Whole-answer mode (T51) has its own command so the single-claim path stays as it is.
  const answerMode = args.some((a) => a === "--answer" || a === "--answer-replay-of" || a.startsWith("--answer=") || a.startsWith("--answer-replay-of="));
  process.exitCode = answerMode ? await answerCommand(args) : await traceCommand(args);
} else if (command === "traps") {
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  const paths = { root, casesDir: join(root, "traps/cases"), lockPath: join(root, "traps/traps.lock") };
  if (args.includes("--relock")) relock(paths);
  const { code, lines } = runTraps(paths);
  for (const line of lines) console.log(line);
  // T30: the pipeline cases run the real walk and dating on planted webs built from the spike traces.
  const pipeline = await runPipelineTraps({ root, casesDir: join(root, "traps/pipeline"), lockPath: join(root, "traps/pipeline.lock"), rules: loadRules(), relock: args.includes("--relock") });
  for (const line of pipeline.lines) console.log(line);
  process.exitCode = code || pipeline.code;
} else if (command === "doctor") {
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  const { code, lines } = await runDoctor({ root, env: process.env, nodeVersion: process.version, network: args.includes("--network") });
  for (const line of formatDoctor(lines)) console.log(line);
  process.exitCode = code;
} else if (command === "judge") {
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  process.exitCode = await runJudge({ root, env: process.env, nodeVersion: process.version });
} else {
  console.error("not built yet");
  process.exitCode = 1;
}
