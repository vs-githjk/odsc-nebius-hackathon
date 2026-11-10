// make dev-score: grades the dev traces in eval/dev-traces/ against eval/dev-claims.json, with the same columns as
// spike/grading.md, and appends one dated row to eval/dev-score.md. Run from the repo root.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRules } from "../packages/pz/src/rules/index.ts";
import { Trace } from "../packages/pz/src/schema/index.ts";
import { verifyTrace } from "../packages/pz/src/verify/index.ts";

export type DevClaim = { id: string; text: string; expected: "origin" | "cold"; tracedOrigin: string | null; tracedBy: string | null };
export type Grade = "Pass" | "Partial" | "Fail";
export type ClaimScore = {
  id: string; expected: DevClaim["expected"]; status: "scored" | "no trace" | "unverified" | "bad trace";
  mode: Trace["mode"] | null; state: Trace["decision"]["state"] | null;
  falseOrigin: boolean; targetCited: boolean | null; earliest: Grade | null; coldCorrect: boolean | null;
  credits: number; seconds: number; reason?: string;
};

// Tracking parameters that never change which page a URL is. Every other query parameter is kept: some sites
// (wwf.panda.org/wwf_news/?348337/...) name the page in the query string.
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src)$/i;

// A URL reduced to host, path and query: no scheme, "www.", port, fragment, tracking parameters or trailing slash,
// and a Wayback capture unwrapped to the page it archives. "https://web.archive.org/web/2010/http://www.x.org/a/"
// becomes "x.org/a"; "https://x.org/news/?123/a" stays "x.org/news?123/a".
export function urlKey(url: string): string {
  const unwrapped = url.replace(/^https?:\/\/web\.archive\.org\/web\/[^/]+\//i, "");
  try {
    const u = new URL(/^https?:\/\//i.test(unwrapped) ? unwrapped : `http://${unwrapped}`);
    const query = u.search.replace(/^\?/, "").split("&").filter((p) => p && !TRACKING.test(p.split("=")[0]!)).join("&");
    return u.hostname.replace(/^www\./i, "").toLowerCase() + u.pathname.replace(/\/+$/, "") + (query ? `?${query}` : "");
  } catch { return unwrapped.toLowerCase(); }
}
const hostOf = (url: string) => urlKey(url).split("/")[0]!;

// One claim. The scoring rules (T33, Anoop):
// - False origin: the trace says ORIGIN_FOUND and no earliest page is the registered target (or the claim is cold).
// - Target cited: any page in the trace is the registered target.
// - Earliest: Pass when an earliest page is the target URL, Partial when one is on the target's site, else Fail.
//   The dev set has no target date yet, so the date half of the spike rule is not checked here.
// - Cold correct: a cold claim ends TRAIL_GOES_COLD. A cold claim that ends anywhere else is not correct.
export function scoreClaim(claim: DevClaim, trace: Trace | null): ClaimScore {
  const base = { id: claim.id, expected: claim.expected, falseOrigin: false, targetCited: null, earliest: null, coldCorrect: null, credits: 0, seconds: 0 };
  if (!trace) return { ...base, status: "no trace", mode: null, state: null };
  const run = { mode: trace.mode, state: trace.decision.state, credits: trace.budget.credits, seconds: Math.round(trace.budget.ms / 1000) };
  if (trace.id !== claim.id) return { ...base, ...run, status: "bad trace", reason: `trace id ${trace.id}` };
  const failures = verifyTrace(trace, { rules: loadRules() }).failures;
  if (failures.length) return { ...base, ...run, status: "unverified", reason: failures.map((f) => f.check).join(", ") };

  const earliest = trace.nodes.filter((n) => trace.earliest.nodeIds.includes(n.id));
  const target = claim.tracedOrigin ? urlKey(claim.tracedOrigin) : null;
  const pass = !!target && earliest.some((n) => urlKey(n.url) === target);
  const scored = { ...base, ...run, status: "scored" as const, falseOrigin: trace.decision.state === "ORIGIN_FOUND" && (claim.expected === "cold" || !pass) };
  if (claim.expected === "cold") return { ...scored, coldCorrect: trace.decision.state === "TRAIL_GOES_COLD" };
  return {
    ...scored,
    targetCited: !!target && trace.nodes.some((n) => urlKey(n.url) === target),
    earliest: pass ? "Pass" : target && earliest.some((n) => hostOf(n.url) === hostOf(claim.tracedOrigin!)) ? "Partial" : "Fail",
  };
}

export type Summary = {
  traces: number; claims: number; scored: number; unverified: number; modes: string[];
  falseOrigins: number; unverifiedOrigins: number; targetCited: number; originClaims: number; pass: number; partial: number; fail: number;
  coldCorrect: number; coldClaims: number; credits: number; seconds: number;
};

export function summarise(scores: ClaimScore[]): Summary {
  const scored = scores.filter((s) => s.status === "scored");
  const origin = scored.filter((s) => s.expected === "origin");
  const cold = scored.filter((s) => s.expected === "cold");
  const count = (list: ClaimScore[], pick: (s: ClaimScore) => boolean) => list.filter(pick).length;
  return {
    traces: count(scores, (s) => s.status !== "no trace"), claims: scores.length, scored: scored.length,
    unverified: count(scores, (s) => s.status === "unverified" || s.status === "bad trace"),
    modes: [...new Set(scored.map((s) => s.mode!))].sort(),
    falseOrigins: count(scored, (s) => s.falseOrigin),
    // A trace that fails verify is not scored, but if it claims an origin that is still worth seeing next to the
    // false origins: it may be one we cannot check.
    unverifiedOrigins: count(scores, (s) => s.status !== "scored" && s.state === "ORIGIN_FOUND"),
    targetCited: count(origin, (s) => !!s.targetCited), originClaims: count(scores, (s) => s.expected === "origin"),
    pass: count(origin, (s) => s.earliest === "Pass"), partial: count(origin, (s) => s.earliest === "Partial"), fail: count(origin, (s) => s.earliest === "Fail"),
    coldCorrect: count(cold, (s) => !!s.coldCorrect), coldClaims: count(scores, (s) => s.expected === "cold"),
    credits: scores.reduce((n, s) => n + s.credits, 0), seconds: scores.reduce((n, s) => n + s.seconds, 0),
  };
}

// The one line every engine PR posts. False origins come first: they are the worst outcome.
export function headline(s: Summary): string {
  return `false origins ${s.falseOrigins} (+${s.unverifiedOrigins} unverified ORIGIN_FOUND) | target cited ${s.targetCited}/${s.originClaims} | earliest ${s.pass} Pass, ${s.partial} Partial, ${s.fail} Fail`
    + ` | cold stops ${s.coldCorrect}/${s.coldClaims} | ${s.scored} of ${s.claims} claims scored (${s.unverified} unverified)`
    + ` | ${s.credits} credits, ${s.seconds} s | modes ${s.modes.join(", ") || "none"}`;
}

export function scoreDir(dir: string, claims: DevClaim[]): ClaimScore[] {
  return claims.map((c) => {
    const path = join(dir, `${c.id}.json`);
    if (!existsSync(path)) return scoreClaim(c, null);
    const parsed = Trace.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (!parsed.success) return { ...scoreClaim(c, null), status: "bad trace" as const, reason: "not a valid Trace" };
    return scoreClaim(c, parsed.data);
  });
}

const HEADER = "# Dev score\n\nOne row per `make dev-score` run, newest last. Graded on the E2 dev claims only; see `eval/dev-score.ts` for the rules.\n\n"
  + "| Date (UTC) | Commit | False origins (+ unverified ORIGIN_FOUND) | Target cited | Earliest Pass / Partial / Fail | Cold stops | Scored | Credits | Seconds | Modes |\n"
  + "|---|---|---|---|---|---|---|---|---|---|\n";

export function appendRow(path: string, s: Summary, at: string, commit: string): void {
  if (!existsSync(path)) writeFileSync(path, HEADER);
  appendFileSync(path, `| ${at} | ${commit} | ${s.falseOrigins} (+${s.unverifiedOrigins}) | ${s.targetCited}/${s.originClaims} | ${s.pass} / ${s.partial} / ${s.fail} | `
    + `${s.coldCorrect}/${s.coldClaims} | ${s.scored} of ${s.claims} | ${s.credits} | ${s.seconds} | ${s.modes.join(", ") || "none"} |\n`);
}

export function perClaimLines(scores: ClaimScore[]): string[] {
  return scores.map((s) => [s.id, s.expected, s.status, s.state ?? "", s.falseOrigin ? "FALSE ORIGIN" : "",
    s.expected === "origin" && s.status === "scored" ? `cited ${s.targetCited ? "yes" : "no"}, earliest ${s.earliest}` : "",
    s.expected === "cold" && s.status === "scored" ? `cold stop ${s.coldCorrect ? "yes" : "no"}` : "", s.reason ?? ""].filter(Boolean).join("  "));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const claims: DevClaim[] = JSON.parse(readFileSync("eval/dev-claims.json", "utf8"));
  const dir = "eval/dev-traces";
  const scores = existsSync(dir) ? scoreDir(dir, claims) : claims.map((c) => scoreClaim(c, null));
  const summary = summarise(scores);
  for (const line of perClaimLines(scores)) console.log(line);
  console.log(headline(summary));
  if (summary.traces > 0) {
    const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
    appendRow("eval/dev-score.md", summary, new Date().toISOString().slice(0, 16).replace("T", " "), commit);
  }
}
