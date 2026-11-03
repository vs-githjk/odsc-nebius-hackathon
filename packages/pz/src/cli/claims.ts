import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export type Claim = { id: string; state: string; text: string };
export type Tally = { passed: number; failed: number };
type VitestJson = { testResults: { assertionResults: { title: string; status: string }[] }[] };

// Reads the `- Cn | state | text | proof: ...` lines under "## Claims we will make".
export function parseClaims(plan: string): Claim[] {
  const section = plan.split(/^## Claims we will make\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  return [...section.matchAll(/^- (C\d+) \| (\w+) \| (.+?) \| proof:/gm)].map((m) => ({ id: m[1]!, state: m[2]!, text: m[3]! }));
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

// A claim is only "built" when plan.md says so; then its tagged tests decide PASS or FAIL.
export function claimRow(claim: Claim, tally: Tally | undefined): string {
  const tests = tally ? `${tally.passed} of ${tally.passed + tally.failed} tagged tests pass` : "no tagged tests";
  const status = claim.state !== "built" ? "planned" : !tally ? "no test yet" : tally.failed > 0 ? "built FAIL" : "built PASS";
  return `${claim.id.padEnd(4)} ${status.padEnd(12)} ${tests}`;
}

export function claimsTable(root: string): { code: number; lines: string[] } {
  const claims = parseClaims(readFileSync(join(root, "plan/plan.md"), "utf8"));
  const resultsPath = join(root, "runs/vitest.json");
  const tally = existsSync(resultsPath) ? tallyTags(JSON.parse(readFileSync(resultsPath, "utf8"))) : new Map<string, Tally>();
  const rows = claims.map((c) => claimRow(c, tally.get(c.id)));
  return { code: rows.some((r) => r.includes("built FAIL")) ? 1 : 0, lines: ["claims table:", ...rows] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { code, lines } = claimsTable(process.cwd());
  for (const l of lines) console.log(l);
  process.exitCode = code;
}
