import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { devClusterStep } from "./dev-clusters.ts";
import { openBudget } from "./recordings/budget.ts";
import { qwenChatFetch } from "./record-dev.ts";
import { createTokenFactoryClient } from "../packages/pz/src/clients/tokenfactory.ts";
import type { ClientDeps } from "../packages/pz/src/clients/http.ts";
import { runTrace, type Pipeline, type Wayback } from "../packages/pz/src/engine/run.ts";
import { loadRules } from "../packages/pz/src/rules/index.ts";
import { Trace } from "../packages/pz/src/schema/index.ts";
import { traceCommand } from "../packages/pz/src/cli/trace.ts";
import { verifyTrace } from "../packages/pz/src/verify/checks.ts";

const Input = z.object({ id: z.string().regex(/^dev-\d{2}$/), text: z.string().trim().min(1) });
type Input = z.infer<typeof Input>;

const errorCodes = new Set(["budget_exceeded", "not_configured", "http_error", "network_error", "bad_response", "trace_failed"]);

function codeOf(error: unknown): string {
  if (error && typeof error === "object" && "code" in error &&
      typeof error.code === "string" && errorCodes.has(error.code)) return error.code;
  return "trace_failed";
}

function save(path: string, value: unknown): void {
  const temp = path + "." + randomUUID() + ".tmp";
  try {
    writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
}

export async function runDevBatch(
  rows: unknown,
  opts: {
    dir: string;
    mode: "LIVE" | "REPLAY";
    force?: boolean;
    checkBudget: (usd: number) => void;
    run: (input: Input, caps: ReturnType<typeof loadRules>["caps"]) => Promise<unknown>;
    report: (line: string) => void;
  },
) {
  // Strip scoring answers before passing a claim to the engine.
  const inputs = z.array(Input).min(1).parse(rows);
  if (new Set(inputs.map(input => input.id)).size !== inputs.length) throw new Error("Duplicate dev claim id");
  const rules = loadRules();
  function verified(value: unknown, input: Input, acceptLive = false): Trace {
    const trace = Trace.parse(value);
    if (trace.synthetic || (trace.mode !== opts.mode && !(acceptLive && trace.mode === "LIVE")) || trace.id !== input.id ||
        trace.claim.text !== input.text || verifyTrace(trace, { rules }).failures.length) {
      throw new Error("Invalid dev trace");
    }
    return trace;
  }
  function existing(input: Input): Trace | undefined {
    if (opts.force) return;
    try {
      return verified(JSON.parse(readFileSync(join(opts.dir, input.id + ".json"), "utf8")), input, opts.mode === "REPLAY");
    } catch {
      return;
    }
  }
  const work = inputs.map(input => ({ input, trace: existing(input) }));
  const pending = work.filter(entry => !entry.trace).length;
  if (opts.mode === "LIVE" && pending) opts.checkBudget(pending * rules.caps.usd);
  mkdirSync(opts.dir, { recursive: true });

  let recorded = 0, skipped = 0, failed = 0;
  for (const { input, trace } of work) {
    if (trace) {
      opts.report(JSON.stringify({ id: input.id, status: "skipped" }));
      skipped++;
      continue;
    }
    const path = join(opts.dir, input.id + ".json");
    const errorPath = join(opts.dir, input.id + ".error.json");
    try {
      // The live adapter must enforce these caps at the transport boundary.
      if (opts.mode === "LIVE") opts.checkBudget(rules.caps.usd);
      const result = verified(await opts.run(input, rules.caps), input);
      save(path, result);
      rmSync(errorPath, { force: true });
      const tokens = result.usage.reduce((sum, row) => sum + row.promptTokens + row.completionTokens, 0);
      opts.report(JSON.stringify({ id: input.id, status: "recorded", tokens,
        credits: result.budget.credits, seconds: result.budget.ms / 1000 }));
      recorded++;
    } catch (error) {
      const code = codeOf(error);
      save(errorPath, { id: input.id, code });
      opts.report(JSON.stringify({ id: input.id, status: "failed", code }));
      failed++;
      if (code === "budget_exceeded") break;
    }
  }
  return { recorded, skipped, failed, unattempted: inputs.length - recorded - skipped - failed };
}


export async function replayDevBatch(
  rows: unknown,
  opts: { source: string; dir: string; force?: boolean; report: (line: string) => void },
) {
  return runDevBatch(rows, {
    ...opts,
    mode: "REPLAY",
    checkBudget: () => {},
    run: async input => {
      const lines: string[] = [];
      let code = "trace_failed";
      const status = await traceCommand(["--replay-of", join(opts.source, input.id + ".json")], {
        write: line => lines.push(line),
        error: value => { code = value; },
      });
      if (status !== 0 || lines.length !== 1) throw Object.assign(new Error("Replay failed"), { code });
      return JSON.parse(lines[0]!);
    },
  });
}

type Budget = ReturnType<typeof openBudget>;
type Caps = ReturnType<typeof loadRules>["caps"];
type DevPipeline = {
  pipeline: Omit<Pipeline, "clusters">;
  wayback: Wayback;
  embeddingClient: Parameters<typeof devClusterStep>[0];
};
type DevPipelineFactory = (input: Input, options: {
  caps: Caps;
  budget: Budget;
  chatClient: Pick<ReturnType<typeof createTokenFactoryClient>, "chat">;
  tavilyAttempts: NonNullable<ClientDeps["tavilyAttempts"]>;
}) =>
  Promise<DevPipeline> | DevPipeline;

function claimBudget(ledger: Budget, capUsd: number): Budget {
  const cap = Math.floor(capUsd * 1e6);
  const reservations = new Map<string, number>();
  let used = 0;
  function amount(usd: number): number {
    const units = Math.ceil(usd * 1e6);
    if (!Number.isSafeInteger(units) || units < 0) throw new Error("invalid_budget");
    return units;
  }
  function check(usd: number) {
    if (used + amount(usd) > cap) {
      throw Object.assign(new Error("Claim budget exceeded"), { code: "budget_exceeded" });
    }
    ledger.check(usd);
  }
  return {
    check,
    reserve(usd) {
      check(usd);
      const id = ledger.reserve(usd);
      const units = amount(usd);
      reservations.set(id, units);
      used += units;
      return id;
    },
    settle(id, usd) {
      const reserved = reservations.get(id);
      if (reserved === undefined) throw new Error("invalid_reservation");
      const units = amount(usd);
      ledger.settle(id, usd);
      reservations.delete(id);
      used += units - reserved;
    },
  };
}

export async function runLiveDevBatch(
  rows: unknown,
  opts: {
    dir: string;
    ledger: Budget;
    loadFactory: () => Promise<DevPipelineFactory>;
    force?: boolean;
    report: (line: string) => void;
  },
) {
  let createPipeline: DevPipelineFactory | undefined;
  return runDevBatch(rows, {
    ...opts,
    mode: "LIVE",
    checkBudget: usd => opts.ledger.check(usd),
    run: async (input, caps) => {
      createPipeline ??= await opts.loadFactory();
      const budget = claimBudget(opts.ledger, caps.usd);
      const chatClient = createTokenFactoryClient({
        traceId: input.id,
        fetch: qwenChatFetch(budget, globalThis.fetch),
      });
      const tavilyAttempts: NonNullable<ClientDeps["tavilyAttempts"]> = {
        reserve(maxCredits) {
          if (!Number.isInteger(maxCredits) || maxCredits < 1 || maxCredits > 2) {
            throw Object.assign(new Error("Tavily attempt exceeds the approved ceiling"), { code: "budget_exceeded" });
          }
          return budget.reserve(0.02);
        },
        settle(id, credits) {
          if (Number.isInteger(credits) && credits >= 0) budget.settle(id, credits * 0.008);
        },
      };
      const { pipeline, wayback, embeddingClient } = await createPipeline(input, { caps, budget, chatClient, tavilyAttempts });
      const trace = await runTrace(input.text, { ...pipeline, clusters: devClusterStep(embeddingClient, loadRules()) }, { wayback });
      if (trace.budget.usd > caps.usd || trace.budget.credits > caps.credits) {
        throw Object.assign(new Error("Trace exceeded claim cap"), { code: "budget_exceeded" });
      }
      return trace;
    },
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      "replay-from": { type: "string" }, pipeline: { type: "string" },
      ledger: { type: "string" }, force: { type: "boolean" },
      rehearse: { type: "string", multiple: true },
    } });
    const source = values["replay-from"] ?? process.env.DEV_REPLAY_DIR;
    const pipeline = values.pipeline ?? process.env.DEV_PIPELINE;
    const ledger = values.ledger ?? process.env.DEV_LEDGER;
    if ((source && (pipeline || ledger)) || (!source && (!pipeline || !ledger))) {
      console.error("Use DEV_REPLAY_DIR for replay, or DEV_PIPELINE and DEV_LEDGER for live evaluation.");
      process.exitCode = 1;
    } else {
      const rows: unknown = JSON.parse(readFileSync("eval/dev-claims.json", "utf8"));
      const allClaims = z.array(Input).length(20).parse(rows);
      const rehearsal = values.rehearse;
      if (rehearsal && (rehearsal.length !== 2 || new Set(rehearsal).size !== 2 ||
          rehearsal.some(id => !allClaims.some(claim => claim.id === id)))) {
        console.error("Pass --rehearse twice with two distinct E2 claim IDs.");
        process.exitCode = 1;
      } else {
        const claims = rehearsal ? allClaims.filter(claim => rehearsal.includes(claim.id)) : allClaims;
        const common = { dir: rehearsal ? "runs/dev-rehearsal" : "eval/dev-traces",
          force: values.force, report: (line: string) => console.log(line) };
        const result = source ? await replayDevBatch(claims, { ...common, source }) : await runLiveDevBatch(claims, {
          ...common,
          ledger: openBudget(ledger!),
          loadFactory: async () => {
            const module = await import(pathToFileURL(resolve(pipeline!)).href);
            if (typeof module.createPipeline !== "function") throw new Error("Missing createPipeline");
            return module.createPipeline;
          },
        });
        console.log(JSON.stringify(result));
        if (result.failed || result.unattempted) process.exitCode = 1;
        else if (!rehearsal) execFileSync("make", ["dev-score"], { stdio: "inherit" });
      }
    }
  } catch (error) {
    console.error(codeOf(error) === "budget_exceeded" ? "budget_exceeded" : "dev_run_failed");
    process.exitCode = 1;
  }
}
