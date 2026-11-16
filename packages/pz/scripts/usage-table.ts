// T75: the per-call table for the README's walked trace, built only from a trace file's own usage rows.
// Run from the repo root: node --import tsx packages/pz/scripts/usage-table.ts <trace.json>
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Trace } from "../src/schema/index.ts";

const SERVICE: Record<Trace["usage"][number]["service"], string> = {
  tokenfactory: "Token Factory", tavily: "Tavily", wayback: "Wayback", fetch: "fetch", jev: "Jev",
};
const usd = (n: number) => (n === 0 ? "$0" : `$${n.toFixed(4)}`);

// One markdown row per call, in order, then a totals row. A cache hit is shown and is left out of the totals.
export function usageTable(trace: Trace): string {
  const rows = trace.usage.map((u, i) => [
    String(i + 1), u.step, `${SERVICE[u.service]} ${u.endpoint}`, u.model ?? "",
    u.service === "tokenfactory" ? `${u.promptTokens} / ${u.completionTokens}` : "",
    u.service === "tavily" ? String(u.credits) : "", usd(u.costUsd), `${u.latencyMs} ms`, u.cacheHit ? `${u.status}, cache hit` : u.status,
  ]);
  const paid = trace.usage.filter((u) => !u.cacheHit);
  const sum = (f: (u: Trace["usage"][number]) => number) => paid.reduce((s, u) => s + f(u), 0);
  const total = ["", "**total**", `${paid.length} calls`, "", `${sum((u) => u.promptTokens)} / ${sum((u) => u.completionTokens)}`,
    String(sum((u) => (u.service === "tavily" ? u.credits : 0))), usd(sum((u) => u.costUsd)), `${sum((u) => u.latencyMs)} ms`, ""];
  const head = ["#", "Step", "Call", "Model", "Tokens in / out", "Tavily credits", "Cost", "Latency", "Status"];
  return [head, head.map(() => "---"), ...rows, total].map((r) => `| ${r.join(" | ")} |`).join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: usage-table.ts <trace.json>");
    process.exitCode = 1;
  } else console.log(usageTable(Trace.parse(JSON.parse(readFileSync(path, "utf8")))));
}
