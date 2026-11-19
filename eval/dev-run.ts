import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { DEV_SETS } from "./dev-score.ts";
import { devClusterStep } from "./dev-clusters.ts";
import prices from "../packages/pz/config/prices.json" with { type: "json" };
import { budgetedFetch, openBudget } from "./recordings/budget.ts";
import { qwenChatFetch } from "./record-dev.ts";
import { createTokenFactoryClient } from "../packages/pz/src/clients/tokenfactory.ts";
import { createTavily } from "../packages/pz/src/clients/tavily.ts";
import { send, type ClientDeps, type ClientRequest } from "../packages/pz/src/clients/http.ts";
import { runTrace, type Pipeline, type Stage, type Wayback } from "../packages/pz/src/engine/run.ts";
import { loadRules } from "../packages/pz/src/rules/index.ts";
import { Trace } from "../packages/pz/src/schema/index.ts";
import { traceCommand } from "../packages/pz/src/cli/trace.ts";
import { verifyTrace } from "../packages/pz/src/verify/checks.ts";

const Input = z.object({ id: z.string().regex(/^(?:dev|e3)-\d{2}$/), text: z.string().trim().min(1) });
type Input = z.infer<typeof Input>;

export function parseDevSet(rows: unknown, set: "E2" | "E3"): Input[] {
  const prefix = set === "E2" ? "dev" : "e3";
  const count = set === "E2" ? 20 : 40;
  const inputs = z.array(Input).length(count).parse(rows);
  const expected = new Set(Array.from({ length: count }, (_, index) =>
    prefix + "-" + String(index + 1).padStart(2, "0")));
  for (const input of inputs) {
    if (!expected.delete(input.id)) throw new Error("Invalid dev set claim ID");
  }
  return inputs;
}

const errorCodes = new Set(["budget_exceeded", "budget_bound_exceeded", "claim_timeout", "not_configured", "http_error", "network_error", "bad_response", "trace_failed"]);

class InvalidDevTrace extends Error {
  constructor(readonly reason: string) {
    super("Invalid dev trace");
  }
}

// Only this runner can attach a stage to a saved failure. Provider-supplied
// messages and arbitrary `stage` properties must never enter the error file.
class DevRunFailure extends Error {
  constructor(readonly code: string, readonly stage: Stage | "setup" | "verify") {
    super("Dev run failed");
  }
}

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
    const parsed = Trace.safeParse(value);
    if (!parsed.success) throw new InvalidDevTrace("schema");
    const trace = parsed.data;
    if (trace.synthetic || (trace.mode !== opts.mode && !(acceptLive && trace.mode === "LIVE"))) {
      throw new InvalidDevTrace("provenance");
    }
    if (trace.id !== input.id || trace.claim.text !== input.text) throw new InvalidDevTrace("claim_mismatch");
    const failures = verifyTrace(trace, { rules }).failures;
    if (failures.length) throw new InvalidDevTrace([...new Set(failures.map(failure => failure.check))].join(", "));
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
  if (opts.mode === "LIVE" && pending) opts.checkBudget(rules.caps.usd);
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
      if (opts.force) {
        try { renameSync(path, path + "." + randomUUID() + ".superseded"); }
        catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        }
      }
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
      const reason = error instanceof InvalidDevTrace ? error.reason : undefined;
      const stage = error instanceof DevRunFailure ? error.stage : undefined;
      save(errorPath, { id: input.id, code, reason, stage });
      opts.report(JSON.stringify({ id: input.id, status: "failed", code, stage }));
      failed++;
      if (code === "budget_exceeded" || code === "budget_bound_exceeded") break;
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
      const status = await traceCommand(["--json", "--replay-of", join(opts.source, input.id + ".json")], {
        write: line => lines.push(line),
        error: value => { code = value; },
      });
      if (status !== 0 || lines.length !== 1) throw Object.assign(new Error("Replay failed"), { code });
      return JSON.parse(lines[0]!);
    },
  });
}

type Budget = ReturnType<typeof openBudget>;
// The production factory: the same stages as `pz trace`, behind the runner's ledger-guarded clients.
const DEFAULT_PIPELINE = "eval/dev-pipeline.ts";
type Caps = ReturnType<typeof loadRules>["caps"];
type DevPipeline = {
  // A factory that leaves out `clusters` gets the dev embedding step; the production factory (dev-pipeline.ts) supplies
  // its own, so embeddings are paid for once.
  pipeline: Omit<Pipeline, "clusters"> & { clusters?: Pipeline["clusters"] };
  wayback: Wayback;
};
type DevPipelineFactory = (input: Input, options: {
  caps: Caps;
  signal: AbortSignal;
  chatClient: Pick<ReturnType<typeof createTokenFactoryClient>, "chat">;
  embeddingClient: Pick<ReturnType<typeof createTokenFactoryClient>, "embed">;
  // Plain GETs for a page's own HTML (publication metadata), bound to the claim's deadline.
  pageFetch: typeof globalThis.fetch;
  createTavily: (deps: Omit<Parameters<typeof createTavily>[0], "fetch" | "tavilyAttempts">) => ReturnType<typeof createTavily>;
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
    fetch?: typeof globalThis.fetch;
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
      const signal = AbortSignal.timeout(caps.ms);
      const timeout = () => Object.assign(new Error("Claim deadline exceeded"), { code: "claim_timeout" });
      const checkTime = () => { if (signal.aborted) throw timeout(); };
      const transport = opts.fetch ?? globalThis.fetch;
      const fetch: typeof globalThis.fetch = (url, init) => {
        checkTime();
        return transport(url, { ...init, signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal });
      };
      const budget = claimBudget(opts.ledger, caps.usd);
      const guardedChat = qwenChatFetch(budget, fetch);
      const chatClient = createTokenFactoryClient({
        traceId: input.id,
        fetch: (url, init) => {
          checkTime();
          return guardedChat(url, init);
        },
      });
      const model = "Qwen/Qwen3-Embedding-8B";
      const guardedEmbeddingFetch = budgetedFetch({
        budget, ceilingUsd: 0.002, fetch,
        cost: async response => {
          const body: unknown = await response.json();
          const result = z.object({ usage: z.object({ prompt_tokens: z.number().int().nonnegative() }) }).safeParse(body);
          return result.success ? result.data.usage.prompt_tokens * prices.models[model].input : null;
        },
      });
      const embeddingClient = createTokenFactoryClient({
        traceId: input.id,
        fetch: (url, init) => {
          if (String(url) !== "https://api.tokenfactory.nebius.com/v1/embeddings" ||
              JSON.parse(String(init?.body)).model !== model) throw new Error("Unsupported embedding request");
          checkTime();
          return guardedEmbeddingFetch(url, init);
        },
      });
      const tavilyAttempts: NonNullable<ClientDeps["tavilyAttempts"]> = {
        reserve(maxCredits) {
          checkTime();
          if (!Number.isInteger(maxCredits) || maxCredits < 1 || maxCredits > 2) {
            throw Object.assign(new Error("Tavily attempt exceeds the approved ceiling"), { code: "budget_exceeded" });
          }
          return budget.reserve(0.02);
        },
        settle(id, credits) {
          if (Number.isInteger(credits) && credits >= 0) budget.settle(id, credits * 0.008);
        },
      };
      const sendTavily = <T>(deps: Omit<ClientDeps, "fetch" | "tavilyAttempts">, request: ClientRequest<T>) => {
        if (request.service !== "tavily" || new URL(request.url).origin !== "https://api.tavily.com") {
          throw new Error("Unsupported Tavily request");
        }
        return send({ ...deps, tavilyAttempts, fetch: (url, init) => fetch(url, { ...init, redirect: "error" }) }, request);
      };
      let stop: () => void = () => {};
      const deadline = new Promise<never>((_, reject) => {
        stop = () => reject(timeout());
        signal.addEventListener("abort", stop, { once: true });
      });
      let stage: Stage | "setup" | "verify" = "setup";
      const execute = async () => {
        createPipeline ??= await opts.loadFactory();
        checkTime();
        const { pipeline, wayback } = await createPipeline(input, {
          caps, signal, chatClient, embeddingClient, pageFetch: fetch, createTavily: deps => createTavily(deps, sendTavily),
        });
        checkTime();
        return runTrace(input.text, { ...pipeline, clusters: pipeline.clusters ?? devClusterStep(embeddingClient, loadRules()) }, {
          wayback,
          emit: event => {
            if (event.type === "stage" && event.status === "started") stage = event.stage;
            else if (event.type === "stage" && event.stage === "card" && event.status === "completed") stage = "verify";
          },
        });
      };
      const trace = await Promise.race([execute(), deadline])
        .catch(error => { throw new DevRunFailure(codeOf(error), stage); })
        .finally(() => signal.removeEventListener("abort", stop));
      checkTime();
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
      rehearse: { type: "string", multiple: true }, set: { type: "string" },
    } });
    const source = values["replay-from"] ?? process.env.DEV_REPLAY_DIR;
    const ledger = values.ledger ?? process.env.DEV_LEDGER;
    const pipeline = values.pipeline ?? process.env.DEV_PIPELINE ?? (ledger ? DEFAULT_PIPELINE : undefined);
    if ((source && (pipeline || ledger)) || (!source && (!pipeline || !ledger))) {
      console.error("Use DEV_REPLAY_DIR for replay, or DEV_PIPELINE and DEV_LEDGER for live evaluation.");
      process.exitCode = 1;
    } else {
      const selected = values.set ?? process.env.DEV_SET ?? "E2";
      const spec = DEV_SETS.find(entry => entry.set === selected);
      if (!spec) throw new Error("Use E2 or E3");
      const rehearsal = values.rehearse;
      if (rehearsal && spec.set !== "E2") throw new Error("Rehearsal requires E2");
      const allClaims = parseDevSet(JSON.parse(readFileSync(spec.file, "utf8")), spec.set);
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
        if (!rehearsal) execFileSync(process.execPath, ["--import", "tsx", "eval/dev-score.ts", "--set", spec.set], { stdio: "inherit" });
      }
    }
  } catch (error) {
    console.error(codeOf(error) === "budget_exceeded" ? "budget_exceeded" : "dev_run_failed");
    process.exitCode = 1;
  }
}
