#!/usr/bin/env -S node --import tsx
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PZ_VERSION } from "../index.ts";
import { relock, runTraps } from "../traps/run.ts";
import { runVerify } from "../verify/index.ts";

const [command, ...args] = process.argv.slice(2);

if (command === "--version") {
  console.log(PZ_VERSION);
} else if (command === "verify") {
  if (args.includes("--refetch")) {
    console.error("not built yet (Run 2)");
    process.exit(2);
  }
  const pagesAt = args.indexOf("--pages");
  const pagesDir = pagesAt >= 0 ? args[pagesAt + 1] : undefined;
  const paths = args.filter((_, i) => pagesAt < 0 || (i !== pagesAt && i !== pagesAt + 1));
  if (paths.length === 0) {
    console.error("usage: pz verify <trace.json...> [--pages <dir>]");
    process.exit(2);
  }
  const { code, lines } = runVerify(paths, { pagesDir });
  for (const line of lines) console.log(line);
  process.exitCode = code;
} else if (command === "traps") {
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  const paths = { root, casesDir: join(root, "traps/cases"), lockPath: join(root, "traps/traps.lock") };
  if (args.includes("--relock")) relock(paths);
  const { code, lines } = runTraps(paths);
  for (const line of lines) console.log(line);
  process.exitCode = code;
} else {
  console.error("not built yet");
  process.exitCode = 1;
}
