import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { renderCard } from "../card/terminal.ts";
import { recordTrace, replayTrace, runTrace, type Pipeline, type RunEvent, type Wayback } from "../engine/run.ts";

export async function traceCommand(args: string[], io: { write(line: string): void; error(line: string): void; color?: boolean } = {
  write: (line: string) => console.log(line), error: (line: string) => console.error(line),
  color: !!process.stdout.isTTY && !process.env.NO_COLOR,
}, env: NodeJS.ProcessEnv = process.env, transport: typeof fetch = globalThis.fetch): Promise<number> {
  try {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
      "replay-of": { type: "string" }, pipeline: { type: "string" }, out: { type: "string" },
      pages: { type: "string" }, events: { type: "boolean" }, json: { type: "boolean" },
    } });
    const emit = (event: RunEvent) => io.write(JSON.stringify(event));
    let trace;
    if (values["replay-of"]) {
      if (positionals.length || values.pipeline) throw new Error("Replay cannot run a live adapter");
      trace = replayTrace(JSON.parse(readFileSync(values["replay-of"], "utf8")), values.pages);
    } else {
      if (!positionals.length || values.pages) throw new Error("Invalid live trace arguments");
      let adapter: { pipeline: Pipeline; wayback: Wayback };
      if (!values.pipeline) {
        const missing = ["NEBIUS_API_KEY", "TAVILY_API_KEY"].filter(key => !env[key]?.trim());
        if (missing.length) {
          io.error("not_configured: " + missing.join(", "));
          return 1;
        }
        if (!env.DEV_LEDGER?.trim()) {
          io.error("not_configured: DEV_LEDGER");
          return 1;
        }
        const [{ createPipeline }, { loadRules }, { openBudget }, { traceTransports }] = await Promise.all([
          import("../engine/pipeline.ts"), import("../rules/index.ts"),
          import("../../../../eval/recordings/budget.ts"), import("../../../../eval/recordings/trace-transports.ts"),
        ]);
        const { caps } = loadRules();
        const signal = AbortSignal.timeout(caps.ms);
        const deadlineFetch: typeof fetch = (url, init) =>
          transport(url, { ...init, redirect: "error", signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal });
        const ledger = openBudget(env.DEV_LEDGER);
        ledger.check(caps.usd);
        adapter = createPipeline({
          ...traceTransports(ledger, caps.usd, deadlineFetch, () => signal.throwIfAborted()),
          archiveFetch: deadlineFetch,
          nebiusKey: env.NEBIUS_API_KEY,
          tavilyKey: env.TAVILY_API_KEY?.trim(),
        });
      } else {
        adapter = await import(pathToFileURL(resolve(values.pipeline)).href) as typeof adapter;
      }
      trace = await runTrace(positionals.join(" "), adapter.pipeline, { wayback: adapter.wayback, emit: values.events ? emit : undefined });
    }
    if (values.out) recordTrace(values.out, trace);
    if (values.events) {
      if (values["replay-of"]) emit({ sequence: 0, type: "trace", trace });
    } else if (values.json) io.write(JSON.stringify(trace));
    // The default is the readable card (T77); --json gives the raw trace for scripts and pz verify.
    else io.write(renderCard(trace, { color: io.color ?? false }));
    return 0;
  } catch (error) {
    // Only known code literals may leave this boundary, never provider messages.
    const codes = new Set(["not_configured", "http_error", "network_error", "bad_response", "budget_exceeded", "budget_bound_exceeded"]);
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
      && codes.has(error.code) ? error.code : "trace_failed";
    io.error(code);
    return 1;
  }
}
