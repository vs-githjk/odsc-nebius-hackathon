import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { recordTrace, replayTrace, runTrace, type Pipeline, type RunEvent } from "../engine/run.ts";

export async function traceCommand(args: string[], io = {
  write: (line: string) => console.log(line), error: (line: string) => console.error(line),
}): Promise<number> {
  try {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
      "replay-of": { type: "string" }, pipeline: { type: "string" }, out: { type: "string" },
      pages: { type: "string" }, events: { type: "boolean" },
    } });
    const emit = (event: RunEvent) => io.write(JSON.stringify(event));
    let trace;
    if (values["replay-of"]) {
      if (positionals.length || values.pipeline) throw new Error("Replay cannot run a live adapter");
      trace = replayTrace(JSON.parse(readFileSync(values["replay-of"], "utf8")), values.pages);
    } else {
      if (!values.pipeline || !positionals.length || values.pages) throw new Error("Live adapters pending");
      // An explicitly selected, reviewed local adapter module. Never loaded from page content.
      const module = await import(pathToFileURL(resolve(values.pipeline)).href) as { pipeline: Pipeline };
      trace = await runTrace(positionals.join(" "), module.pipeline, { emit: values.events ? emit : undefined });
    }
    if (values.out) recordTrace(values.out, trace);
    if (values.events) {
      if (values["replay-of"]) emit({ sequence: 0, type: "trace", trace });
    } else io.write(JSON.stringify(trace));
    return 0;
  } catch {
    io.error("Trace command failed: use verified --replay-of <trace.json> or a reviewed --pipeline <module> and input. Check evidence and output path.");
    return 1;
  }
}
