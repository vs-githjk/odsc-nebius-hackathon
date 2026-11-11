import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import config from "./recordings/config.json" with { type: "json" };
import prices from "../packages/pz/config/prices.json" with { type: "json" };
import { createTokenFactoryClient } from "../packages/pz/src/clients/tokenfactory.ts";
import { budgetedFetch, openBudget } from "./recordings/budget.ts";
import { loadT38Cases, recordCases, replayRecording, writeRecording, type Operations, assertLiveRecording } from "./recordings/session.ts";

const MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const MODULES = ["packages/pz/src/engine/intake.ts", "packages/pz/src/engine/fingerprint.ts"];
export function assertMergedOperations(root: string): void {
  const inputs = ["eval/dev-claims.json", ...["01-plain", "02-paraphrase", "03-invented-number", "04-ranges-and-dupes", "05-injection"]
    .map(name => `packages/pz/test/recorded/intake/${name}.json`)];
  for (const path of [...MODULES, ...inputs]) {
    const merged = execFileSync("git", ["show", "origin/main:" + path], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    if (!merged.equals(readFileSync(join(root, path)))) throw new Error("unmerged_operations");
  }
}
async function loadOperations(root: string): Promise<Operations> {
  const [intake, fingerprint] = await Promise.all(MODULES.map(path => import(pathToFileURL(join(root, path)).href)));
  return { intake: intake.intake, fingerprint: fingerprint.fingerprint };
}
const Count = z.number().int().nonnegative();
const ProviderUsage = z.object({ prompt_tokens: Count, completion_tokens: Count,
  prompt_tokens_details: z.object({ cached_tokens: Count.optional() }).nullish() });
export async function tokenFactoryCost(response: Response): Promise<number | null> {
  const body: unknown = await response.json();
  const u = ProviderUsage.safeParse(body && typeof body === "object" && "usage" in body ? body.usage : null);
  if (!u.success) return null;
  const { prompt_tokens: input, completion_tokens: output } = u.data;
  const cached = u.data.prompt_tokens_details?.cached_tokens ?? 0;
  if (cached > input) return null;
  const price = prices.models[MODEL];
  return (input - cached) * price.input + cached * price.cachedInput + output * price.output;
}

export async function recordDevCommand(args: string[], io = {
  write: (line: string) => console.log(line), error: (line: string) => console.error(line),
}, deps = { root: process.cwd(), loadOperations, assertMergedOperations,
  client: createTokenFactoryClient, fetch: globalThis.fetch }): Promise<number> {
  try {
    const { values, positionals } = parseArgs({ args, options: { plan: { type: "boolean" }, live: { type: "boolean" },
      replay: { type: "string" }, out: { type: "string" }, ledger: { type: "string" }, "ceiling-usd": { type: "string" } } });
    if (positionals.length || [values.plan, values.live, values.replay].filter(Boolean).length !== 1) throw new Error("Choose one mode");
    if (!values.live && (values.out || values.ledger || values["ceiling-usd"])) throw new Error("Live flags in offline mode");
    const cases = loadT38Cases(deps.root);
    if (values.plan) {
      io.write(JSON.stringify({ mode: "PLAN", intake: cases.filter(c => c.kind === "intake").length,
        fingerprint: cases.filter(c => c.kind === "fingerprint").length, ids: cases.map(c => `${c.kind}/${c.id}`) }));
      return 0;
    }
    if (values.replay) {
      const operations = await deps.loadOperations(deps.root);
      for (const item of cases) {
        const record: unknown = JSON.parse(readFileSync(join(values.replay, item.kind, item.id + ".json"), "utf8"));
        assertLiveRecording(record);
        if (record.id !== item.id || record.kind !== item.kind || record.source !== item.source) throw new Error("Recording manifest mismatch");
        await replayRecording(record, operations);
      }
      io.write(JSON.stringify({ mode: "REPLAY", replayed: cases.length })); return 0;
    }
    const ceilingUsd = Number(values["ceiling-usd"] ?? config.tokenFactoryAttemptCeilingUsd);
    if (!values.out || !values.ledger || !Number.isFinite(ceilingUsd) || ceilingUsd <= 0 || ceilingUsd > config.tokenFactoryAttemptCeilingUsd) throw new Error("Missing live configuration");
    // Read and validate the ledger before loading modules or touching the network.
    const budget = openBudget(values.ledger);
    budget.check(ceilingUsd);
    deps.assertMergedOperations(deps.root);
    if (!process.env.NEBIUS_API_KEY?.trim()) throw new Error("not_configured");
    const operations = await deps.loadOperations(deps.root);
    mkdirSync(resolve(values.out), { recursive: false, mode: 0o700 });
    const fetch = budgetedFetch({ budget, ceilingUsd, cost: tokenFactoryCost, fetch: async (input, init) => {
      // The price conversion is pinned to this model and endpoint only.
      const body = JSON.parse(String(init?.body));
      if (String(input) !== "https://api.tokenfactory.nebius.com/v1/chat/completions" || body.model !== MODEL) throw new Error("Unsupported recording request");
      return deps.fetch(input, init);
    } });
    await recordCases(cases, { provenance: "LIVE", operations, beforeCase: () => {},
      clientFor: item => deps.client({ fetch, traceId: `t38-${item.id}`, step: item.kind }),
      write: record => {
        if (record.status === "completed") assertLiveRecording(record);
        writeRecording(values.out!, record);
      } });
    io.write(JSON.stringify({ mode: "LIVE", recorded: cases.length })); return 0;
  } catch {
    // Arguments, git stderr, filenames and provider responses never leave stderr.
    io.error("recording_failed"); return 1;
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await recordDevCommand(process.argv.slice(2));
