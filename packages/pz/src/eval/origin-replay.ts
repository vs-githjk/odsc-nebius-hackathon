import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Trace } from "../schema/index.ts";
import { decideStopState, originPick } from "../rules/decide.ts";
import type { Rules } from "../rules/rules.ts";

// The origin experiment's gate (#307): replay the decision over every recorded trace (the 20 E2 dev traces and the
// gallery) and compare the origin it names, if any, with the answer key. A replay re-decision reads only the recorded
// trace: no search, fetch or model call.

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

// How a picked URL is compared: lower case, no scheme, no www, no trailing slash, no query or fragment.
export const bare = (url: string) => url.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\d?\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "");

export type Expected = { kind: "cold" } | { kind: "origin"; urls: string[] } | { kind: "origin-hosts"; hosts: string[] };

// The gallery's answer key is prose in docs/gallery.md (committed before any trace ran); these are its HIT rules.
// "cold" means any ORIGIN_FOUND is a false origin; hosts mean an origin is correct only on one of those sites.
const GALLERY: Record<string, Expected> = {
  g1: { kind: "origin-hosts", hosts: ["europol.europa.eu"] },
  g2: { kind: "origin-hosts", hosts: ["pwc.com"] },
  g3: { kind: "origin-hosts", hosts: ["sintef.no", "ibm.com"] },
  g4: { kind: "origin-hosts", hosts: ["nature.com", "ecehh.org"] },
  g5: { kind: "origin-hosts", hosts: ["noaa.gov"] },
  g7: { kind: "cold" },
  g8: { kind: "cold" },
};

type Claim = { id: string; expected: "cold" | "origin"; tracedOrigin: string | null; originAliases?: string[] };

export function answerKey(): Record<string, Expected> {
  const claims = JSON.parse(readFileSync(join(ROOT, "eval/dev-claims.json"), "utf8")) as Claim[] | { claims: Claim[] };
  const list = Array.isArray(claims) ? claims : claims.claims;
  const key: Record<string, Expected> = { ...GALLERY };
  for (const c of list) {
    key[c.id] = c.expected === "origin" && c.tracedOrigin ? { kind: "origin", urls: [c.tracedOrigin, ...(c.originAliases ?? [])] } : { kind: "cold" };
  }
  return key;
}

// Each recorded trace with the id the answer key uses: its file name (dev-10, g4), since gallery traces carry UUIDs.
export function recordedTraces(): { id: string; trace: Trace }[] {
  const files = [
    ...readdirSync(join(ROOT, "eval/dev-traces")).filter((f) => /^dev-\d\d\.json$/.test(f)).map((f) => join(ROOT, "eval/dev-traces", f)),
    ...readdirSync(join(ROOT, "eval/gallery/traces")).filter((f) => /^g\d+\.json$/.test(f)).map((f) => join(ROOT, "eval/gallery/traces", f)),
  ];
  return files.map((f) => ({ id: f.split("/").at(-1)!.replace(/\.json$/, ""), trace: Trace.parse(JSON.parse(readFileSync(f, "utf8"))) }));
}

export type Verdict = "correct origin" | "false origin" | "no origin";
export type Row = { id: string; oldState: string; newState: string; picked: string | null; expected: string; verdict: Verdict };

export function judge(picked: string | null, expected: Expected | undefined): Verdict {
  if (!picked) return "no origin";
  if (!expected || expected.kind === "cold") return "false origin";
  const p = bare(picked);
  if (expected.kind === "origin") return expected.urls.some((u) => bare(u) === p || p.startsWith(bare(u))) ? "correct origin" : "false origin";
  const host = p.split("/")[0]!;
  return expected.hosts.some((h) => host === h || host.endsWith(`.${h}`)) ? "correct origin" : "false origin";
}

export function replay(rules: Rules): Row[] {
  const key = answerKey();
  return recordedTraces().map(({ id, trace }) => {
    const decision = decideStopState(trace, rules);
    const pick = decision.state === "ORIGIN_FOUND" ? originPick(trace, rules)?.node.url ?? null : null;
    const expected = key[id];
    const label = !expected ? "?" : expected.kind === "cold" ? "cold" : expected.kind === "origin" ? expected.urls[0]! : expected.hosts.join(" or ");
    return { id, oldState: trace.decision.state, newState: decision.state, picked: pick, expected: label, verdict: judge(pick, expected) };
  });
}

export function table(rows: Row[]): string {
  const lines = ["| id | old state | new state | picked URL | expected | verdict |", "|---|---|---|---|---|---|"];
  for (const r of rows) lines.push(`| ${r.id} | ${r.oldState} | ${r.newState} | ${r.picked ?? ""} | ${r.expected} | ${r.verdict} |`);
  const count = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  lines.push("", `${rows.length} traces: ${count("correct origin")} correct origin, ${count("false origin")} false origin, ${count("no origin")} no origin.`);
  return lines.join("\n");
}
