import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Copy rules from plan.md: no em or en dashes, and none of these phrases in reader-facing copy.
const BANNED: [RegExp, string][] = [
  [/—/, "em dash (U+2014)"], [/–/, "en dash (U+2013)"],
  ...["independent sources", "invented by", "this outlet changed", "proves", "introduced by"]
    .map((p): [RegExp, string] => [new RegExp(`\\b${p}\\b`, "i"), `"${p}"`]),
];
export const SCOPE = ["README.md", "llms.txt", "apps/web/src", "packages/pz/src/card"];

export function lintText(text: string): { line: number; issue: string }[] {
  return text.split("\n").flatMap((l, i) => BANNED.filter(([re]) => re.test(l)).map(([, issue]) => ({ line: i + 1, issue })));
}

function files(path: string): string[] {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { recursive: true }).map((f) => join(path, String(f))).filter((f) => statSync(f).isFile()).sort();
}

export function lintCopy(root: string, scope = SCOPE): { code: number; lines: string[] } {
  const checked = scope.flatMap((s) => files(join(root, s)));
  const lines = checked.flatMap((f) => lintText(readFileSync(f, "utf8")).map((h) => `FAIL ${relative(root, f)}:${h.line}: ${h.issue}`));
  lines.push(`copy lint: ${checked.length} files checked, ${lines.length} problems`);
  return { code: lines.length === 1 ? 0 : 1, lines };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { code, lines } = lintCopy(process.cwd());
  for (const l of lines) console.log(l);
  process.exitCode = code;
}
