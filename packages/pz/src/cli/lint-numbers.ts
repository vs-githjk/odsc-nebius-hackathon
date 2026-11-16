import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// T55: every number a reader sees in README.md and llms.txt must be backed by a file. A number passes when it
// appears in a file that its own section (the text under one heading) links to: the spike table must link the
// grading file, the caps must link rules.json, a dev score must link its results. Not counted as claims:
// - code spans and code blocks, and link targets (issue and PR numbers, paths)
// - dates ("Nov 16", "Monday Nov 16, 2026", "2026-11-16") and four-digit years
// - list numbering at the start of a line, and numbers inside words or identifiers (Qwen3, T72, C17, 1440px)
// - numbers named in a `<!-- numbers ok: 1440, 390 (screenshot sizes) -->` comment in the same section, so every
//   exception is written down where a reviewer sees it.
export const SCOPE = ["README.md", "llms.txt"];

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const DATE = new RegExp(String.raw`\b(?:${MONTHS})\.? \d{1,2}(?:, \d{4})?\b|\b\d{1,2} (?:${MONTHS}) \d{4}\b|\b\d{4}-\d{2}-\d{2}\b`, "giu");
const NUMBER = /(?<![\p{L}\p{N}_.#\/-])\d+(?:[.,]\d+)*(?![\p{L}\p{N}_])/gu;

type Section = { start: number; lines: string[] };

function sections(text: string): Section[] {
  const out: Section[] = [{ start: 1, lines: [] }];
  let fenced = false;
  text.split("\n").forEach((line, i) => {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (!fenced && /^#{1,6}\s/.test(line)) out.push({ start: i + 1, lines: [] });
    out.at(-1)!.lines.push(fenced || /^\s*```/.test(line) ? "" : line);
  });
  return out;
}

// The digits a file would show for a number: "10,000" also matches "10000", and the other way round.
const forms = (n: string) => [...new Set([n, n.replace(/,/g, ""), Number(n.replace(/,/g, "")).toLocaleString("en-US")])];

export function lintNumbers(file: string, text: string, readLinked: (path: string) => string | null): { line: number; issue: string }[] {
  const problems: { line: number; issue: string }[] = [];
  for (const section of sections(text)) {
    const body = section.lines.join("\n");
    const allowed = new Set([...body.matchAll(/<!--\s*numbers ok:([^>]*)-->/giu)].flatMap((m) => m[1]!.replace(/\([^)]*\)/g, "").split(/[\s,]+/).filter(Boolean)));
    const linked = [...body.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)].map((m) => m[1]!).filter((l) => !/^[a-z]+:/i.test(l));
    const sources = linked.map((l) => readLinked(join(dirname(file), l))).filter((t): t is string => t !== null);
    section.lines.forEach((raw, i) => {
      const line = raw
        .replace(/<!--.*?-->/g, " ").replace(/`[^`]*`/g, " ")
        .replace(/\]\([^)]*\)/g, "]").replace(/https?:\/\/\S+/g, " ")
        .replace(DATE, " ").replace(/\b(?:19|20)\d{2}\b/g, " ").replace(/^\s*\d+[.)]\s/, " ");
      for (const m of line.matchAll(NUMBER)) {
        const n = m[0];
        if (allowed.has(n) || sources.some((s) => forms(n).some((f) => new RegExp(String.raw`(?<![\d.,])${f.replace(/[.,]/g, "\\$&")}(?![\d])`).test(s)))) continue;
        problems.push({ line: section.start + i, issue: `"${n}" is not in any file this section links to` });
      }
    });
  }
  return problems;
}

function readLinkedFile(root: string) {
  return (path: string): string | null => {
    const full = join(root, path);
    if (!existsSync(full) || statSync(full).isDirectory()) return null;
    return readFileSync(full, "utf8");
  };
}

export function lintNumbersIn(root: string, scope = SCOPE): { code: number; lines: string[] } {
  const lines = scope.filter((f) => existsSync(join(root, f))).flatMap((f) =>
    lintNumbers(f, readFileSync(join(root, f), "utf8"), readLinkedFile(root)).map((p) => `FAIL ${relative(root, join(root, f))}:${p.line}: ${p.issue}`));
  lines.push(`number lint: ${scope.length} files checked, ${lines.length} unbacked numbers`);
  return { code: lines.length === 1 ? 0 : 1, lines };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { code, lines } = lintNumbersIn(process.cwd(), process.argv.slice(2).length ? process.argv.slice(2) : SCOPE);
  for (const l of lines) console.log(l);
  process.exitCode = code;
}
