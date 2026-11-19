// #165: speed and cost per trace from the committed dev recordings, $0 and no keys. Writes eval/perf.md.
// node --import tsx eval/perf.ts
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Trace } from "../packages/pz/src/schema/index.ts";
import { traceCost, type TraceCost } from "../packages/pz/src/usage/cost.ts";

export const TARGET = { seconds: 30, usd: 0.02 };
const SERVICES = ["tavily", "tokenfactory", "wayback", "fetch", "ncbi", "crossref"] as const;

export type PerfRow = TraceCost & { id: string; state: Trace["decision"]["state"]; calls: Record<string, number>; latencyS: Record<string, number> };

export function perfRow(t: Trace): PerfRow {
  const calls: Record<string, number> = {};
  const latencyS: Record<string, number> = {};
  for (const r of t.usage.filter((u) => !u.cacheHit)) {
    calls[r.service] = (calls[r.service] ?? 0) + 1;
    latencyS[r.service] = (latencyS[r.service] ?? 0) + r.latencyMs / 1000;
  }
  return { id: t.id, state: t.decision.state, ...traceCost(t), calls, latencyS };
}

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const usd = (n: number) => (n > 0 && n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const sec = (n: number) => `${Math.round(n)}`;

export function report(rows: PerfRow[], source: string): string {
  const med = {
    seconds: median(rows.map((r) => r.seconds)), usd: median(rows.map((r) => r.totalUsd)),
    tavily: median(rows.map((r) => r.tavilyUsd)), model: median(rows.map((r) => r.modelUsd)), credits: median(rows.map((r) => r.credits)),
  };
  const met = (ok: boolean) => (ok ? "met" : "not met");
  const share = (svc: string) => rows.reduce((n, r) => n + (r.latencyS[svc] ?? 0), 0);
  const allLatency = SERVICES.reduce((n, s) => n + share(s), 0);
  return [
    "# Speed and cost per trace (#165)",
    "",
    `Measured from the committed recordings in ${source}, with no network and no keys: \`node --import tsx eval/perf.ts\` rewrites this file. Cost is Tavily credits at the list price ($0.008 a credit, packages/pz/src/clients/tavily.ts) plus Token Factory's recorded cost per call; seconds is the trace's own wall time (budget.ms). Cache hits are not counted.`,
    "",
    `Target: a median trace under ${TARGET.seconds} s and under ${usd(TARGET.usd)}.`,
    "",
    `- **Median time: ${sec(med.seconds)} s** (${met(med.seconds < TARGET.seconds)}).`,
    `- **Median cost: ${usd(med.usd)}** (${met(med.usd < TARGET.usd)}): Tavily ${usd(med.tavily)} (${med.credits} credits), Token Factory ${usd(med.model)}.`,
    `- ${rows.length} traces. Tavily is almost all of the cost.`,
    "",
    "## Where the time goes",
    "",
    "Summed call latency by service across all traces (calls overlap, so this ranks the services; it does not add up to wall time):",
    "",
    "| Service | Calls | Latency (s) | Share |",
    "|---|---|---|---|",
    ...SERVICES.filter((s) => share(s) > 0).sort((a, b) => share(b) - share(a))
      .map((s) => `| ${s} | ${rows.reduce((n, r) => n + (r.calls[s] ?? 0), 0)} | ${sec(share(s))} | ${Math.round((100 * share(s)) / allLatency)}% |`),
    "",
    "## Per trace",
    "",
    "| Trace | Ending | Seconds | Tavily credits | Tavily $ | Model $ | Total $ |",
    "|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.id} | ${r.state} | ${sec(r.seconds)} | ${r.credits} | ${usd(r.tavilyUsd)} | ${usd(r.modelUsd)} | ${usd(r.totalUsd)} |`),
    "",
    "Not done yet (#165 steps 2 and 3): cutting the top costs and re-measuring live. Both need a live run, so the before and after numbers come with it.",
    "",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = "eval/dev-traces";
  const rows = readdirSync(dir).filter((f) => /^dev-\d{2}\.json$/.test(f)).sort()
    .map((f) => perfRow(Trace.parse(JSON.parse(readFileSync(join(dir, f), "utf8")))));
  writeFileSync("eval/perf.md", report(rows, dir));
  console.log(report(rows, dir).split("\n").slice(6, 9).join("\n"));
}
