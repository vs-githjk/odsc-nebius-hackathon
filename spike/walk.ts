import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createBudget } from "../packages/pz/src/clients/budget.ts";
import { createFileCache } from "../packages/pz/src/clients/cache.ts";
import { createTavily } from "../packages/pz/src/clients/tavily.ts";
import { createWayback } from "../packages/pz/src/clients/wayback.ts";
import { walkClaim, type SpikeClaim } from "../packages/pz/src/engine/walk.ts";
import { loadRules } from "../packages/pz/src/rules/index.ts";
import { Trace } from "../packages/pz/src/schema/index.ts";
import { createUsageLog } from "../packages/pz/src/usage/log.ts";

// The walker lives in the engine; this script only runs it on the spike claims.
export { queriesFor, toPlain, walkClaim, type LogLine, type SpikeClaim } from "../packages/pz/src/engine/walk.ts";

async function main() {
  const at = process.argv.indexOf("--claim");
  const id = at >= 0 ? process.argv[at + 1] : undefined;
  const here = dirname(fileURLToPath(import.meta.url));
  const claims = JSON.parse(readFileSync(join(here, "claims.json"), "utf8")) as SpikeClaim[];
  const claim = claims.find((c) => c.id === id);
  if (!claim) {
    console.error(`usage: npx tsx spike/walk.ts --claim <${claims.map((c) => c.id).join("|")}> [--replay-of <recorded trace.json>]`);
    process.exit(2);
  }
  const replayAt = process.argv.indexOf("--replay-of");
  const replayOf = replayAt >= 0 ? Trace.parse(JSON.parse(readFileSync(process.argv[replayAt + 1] ?? "", "utf8"))) : undefined;
  if (existsSync(".env")) process.loadEnvFile(".env");
  const rules = loadRules();
  const usage = createUsageLog();
  const budget = createBudget(rules.caps.credits);
  const shared = { usage, cache: createFileCache(), budget, traceId: claim.id };
  const { trace, log } = await walkClaim(claim, {
    tavily: createTavily(shared),
    wayback: createWayback(shared),
    usage,
    budget,
    rules,
    today: new Date().toISOString().slice(0, 10),
    now: () => new Date().toISOString(),
    pagesDir: ".cache/pages",
    replayOf,
  });
  mkdirSync(join(here, "traces"), { recursive: true });
  mkdirSync(join(here, "logs"), { recursive: true });
  writeFileSync(join(here, "traces", `${claim.id}.json`), JSON.stringify(trace, null, 2) + "\n");
  writeFileSync(join(here, "logs", `${claim.id}.jsonl`), log.map((l) => JSON.stringify(l)).join("\n") + "\n");
  console.log(`${claim.id}: ${trace.decision.state} row ${trace.decision.row}, ${trace.nodes.length} pages, ${trace.edges.length} edges, ${trace.budget.credits} credits, ${Math.round(trace.budget.ms / 1000)} s`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
