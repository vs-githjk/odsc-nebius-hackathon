import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createTokenFactoryClient } from "../clients/tokenfactory.ts";
import { MAX_CLAIMS, replayAnswer, traceAnswer } from "../engine/answer.ts";
import { intake } from "../engine/intake.ts";
import { replayTrace, runTrace, type Pipeline, type Wayback } from "../engine/run.ts";
import type { AnswerRecord, Trace } from "../schema/index.ts";

// T51: `pz trace --answer <file> --pipeline <module>` traces every statistic in a pasted answer, and
// `pz trace --answer-replay-of <answer.json>` replays a recorded one with no keys. --json prints the raw record.

const STATE_WORDS: Record<Trace["decision"]["state"], string> = {
  ORIGIN_FOUND: "Origin found", CONFLICTING: "Conflicting earliest pages", TRAIL_GOES_COLD: "Trail goes cold",
  PARTIAL: "Stopped early", TOOL_FAILED: "A tool failed", NO_PAGES_FOUND: "No pages found",
};
const NOT_TRACED: Record<NonNullable<AnswerRecord["claims"][number]["notTraced"]>, string> = {
  over_claim_cap: `not traced, over the ${MAX_CLAIMS}-statistic limit`, not_configured: "not traced, no API key",
  http_error: "not traced, a service returned an error", network_error: "not traced, a network error",
  bad_response: "not traced, a service sent an unexpected reply", budget_exceeded: "not traced, the budget ran out",
  trace_failed: "not traced, the trace failed",
};

// The answer as plain text: the code-built summary, then one line per statistic with how its trace ended.
export function renderAnswer(record: AnswerRecord): string {
  const modes = [...new Set(record.claims.flatMap((c) => (c.trace ? [c.trace.mode] : [])))];
  const lines = [`Patient Zero  answer mode${modes.length ? `  ${modes.join(", ")}` : ""}`, "", record.summary, ""];
  record.claims.forEach((c, i) => {
    const ending = c.trace ? `${STATE_WORDS[c.trace.decision.state]} (rule row ${c.trace.decision.row})` : NOT_TRACED[c.notTraced!];
    lines.push(`${i + 1}. ${ending}`, `   "${c.text}"`);
  });
  if (record.rejected.length) {
    lines.push("", "Set aside by code:");
    for (const r of record.rejected) lines.push(`   "${r.sentence}" (${r.reason.replace(/_/g, " ")})`);
  }
  lines.push("", "Raw record: add --json.");
  return lines.join("\n");
}

export async function answerCommand(args: string[], io: { write(line: string): void; error(line: string): void } = {
  write: (line) => console.log(line), error: (line) => console.error(line),
}): Promise<number> {
  try {
    const { values } = parseArgs({ args, options: {
      answer: { type: "string" }, "answer-replay-of": { type: "string" }, pipeline: { type: "string" },
      out: { type: "string" }, json: { type: "boolean" },
    } });
    let record: AnswerRecord;
    if (values["answer-replay-of"]) {
      if (values.answer || values.pipeline) throw new Error("Replay cannot run a live adapter");
      record = replayAnswer(JSON.parse(readFileSync(values["answer-replay-of"], "utf8")), (t) => replayTrace(t));
    } else {
      // The live path needs a reviewed adapter module until engine/pipeline.ts (T71, #130) is the default.
      if (!values.answer || !values.pipeline) throw new Error("Live adapters pending");
      const module = await import(pathToFileURL(resolve(values.pipeline)).href) as { pipeline: Pipeline; wayback: Wayback };
      const client = createTokenFactoryClient();
      record = await traceAnswer(readFileSync(values.answer, "utf8"), {
        intake: (text) => intake(text, { client }),
        traceClaim: (claim) => runTrace(claim.text, module.pipeline, { wayback: module.wayback }),
        now: () => new Date().toISOString(),
      });
    }
    if (values.out) writeFileSync(values.out, JSON.stringify(record, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    io.write(values.json ? JSON.stringify(record) : renderAnswer(record));
    return 0;
  } catch (error) {
    // Only known code literals may leave this boundary, never provider messages.
    const codes = new Set(["not_configured", "http_error", "network_error", "bad_response", "budget_exceeded"]);
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" && codes.has(error.code) ? error.code : "trace_failed";
    io.error(code);
    return 1;
  }
}
