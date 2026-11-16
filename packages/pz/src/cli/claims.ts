import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export type Claim = { id: string; state: string; text: string; proof: string };
export type Tally = { passed: number; failed: number };
type VitestJson = { testResults: { assertionResults: { title: string; status: string }[] }[] };

// Reads the `- Cn | state | text | proof: ...` lines under "## Claims we will make".
export function parseClaims(plan: string): Claim[] {
  const section = plan.split(/^## Claims we will make\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  return [...section.matchAll(/^- (C\d+) \| (\w+) \| (.+?) \| proof: (.*)$/gm)]
    .map((m) => ({ id: m[1]!, state: m[2]!, text: m[3]!, proof: m[4]!.trim() }));
}

export function tallyTags(results: VitestJson): Map<string, Tally> {
  const tally = new Map<string, Tally>();
  for (const a of results.testResults.flatMap((r) => r.assertionResults))
    for (const [, id] of a.title.matchAll(/\[(C\d+)\]/g)) {
      const t = tally.get(id!) ?? { passed: 0, failed: 0 };
      if (a.status === "passed") t.passed++; else t.failed++;
      tally.set(id!, t);
    }
  return tally;
}

// A claim is only "built" when plan.md says so. Tagged tests decide PASS or FAIL only when its proof is a test;
// a proof such as a CI link, screenshot or session table stays "no proof yet" until someone checks it.
// T55: the repo files a proof names, as `path` or `path:line`, that exist (and whose line exists). A claim marked
// built must name at least one, so every built row can be checked from the repo.
export function proofFiles(proof: string, root: string): { found: string[]; missing: string[] } {
  const refs = [...proof.matchAll(/(?<![\w/.-])((?:[\w.-]+\/)*[\w.-]+\.(?:ts|tsx|json|jsonl|md|txt|yml|png|gif|sha256|lock))(?::(\d+))?/g)];
  const found: string[] = [], missing: string[] = [];
  for (const [, path, line] of refs) {
    const full = join(root, path!);
    const ok = existsSync(full) && (!line || readFileSync(full, "utf8").split("\n").length >= Number(line));
    (ok ? found : missing).push(line ? `${path}:${line}` : path!);
  }
  return { found, missing };
}

export function claimRow(claim: Claim, tally: Tally | undefined, root?: string): string {
  const tests = tally ? `${tally.passed} of ${tally.passed + tally.failed} tagged tests pass` : "no tagged tests";
  const files = root && claim.state === "built" ? proofFiles(claim.proof, root) : null;
  const status = claim.state !== "built" ? "planned"
    : files && (!files.found.length || files.missing.length) ? "proof missing"
    : !/\btests?\b/i.test(claim.proof) ? "no proof yet"
    : !tally ? "no test yet" : tally.failed > 0 ? "built FAIL" : "built PASS";
  const missing = files?.missing.length ? `; missing ${files.missing.join(", ")}` : files && !files.found.length ? "; names no proof file" : "";
  return `${claim.id.padEnd(4)} ${status.padEnd(12)} ${tests}${missing}`;
}

export function claimsTable(root: string): { code: number; lines: string[] } {
  const claims = parseClaims(readFileSync(join(root, "plan/plan.md"), "utf8"));
  const resultsPath = join(root, "runs/vitest.json");
  const tally = existsSync(resultsPath) ? tallyTags(JSON.parse(readFileSync(resultsPath, "utf8"))) : new Map<string, Tally>();
  const rows = claims.map((c) => claimRow(c, tally.get(c.id), root));
  return { code: rows.some((r) => r.includes("built FAIL") || r.includes("proof missing")) ? 1 : 0, lines: ["claims table:", ...rows] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { code, lines } = claimsTable(process.cwd());
  for (const l of lines) console.log(l);
  process.exitCode = code;
}
