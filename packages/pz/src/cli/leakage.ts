import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// No held-out claim text may appear in source, prompts or rules. Armed once eval/heldout.claims.txt is revealed.
export function checkLeakage(root: string): { code: number; lines: string[] } {
  const listPath = join(root, "eval/heldout.claims.txt");
  if (!existsSync(listPath)) return { code: 0, lines: ["not armed: held-out claims not revealed"] };
  const claims = readFileSync(listPath, "utf8").split("\n").map((l) => l.trim().toLowerCase()).filter(Boolean);
  const dir = join(root, "packages");
  const lines: string[] = [];
  for (const f of readdirSync(dir, { recursive: true }).map((f) => join(dir, String(f)))) {
    if (f.includes("node_modules") || !statSync(f).isFile()) continue;
    const text = readFileSync(f, "utf8").toLowerCase();
    claims.forEach((c, i) => { if (text.includes(c)) lines.push(`FAIL ${relative(root, f)}: contains held-out claim ${i + 1}`); });
  }
  lines.push(`leakage: ${claims.length} held-out claims, ${lines.length} found in packages/`);
  return { code: lines.length === 1 ? 0 : 1, lines };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { code, lines } = checkLeakage(process.cwd());
  for (const l of lines) console.log(l);
  process.exitCode = code;
}
