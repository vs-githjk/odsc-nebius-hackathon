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
export const SCOPE = ["README.md", "llms.txt", "docs/submission.md"];

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const DATE = new RegExp(String.raw`\b(?:${MONTHS})\.? \d{1,2}(?:, \d{4})?\b|\b\d{1,2} (?:${MONTHS}) \d{4}\b|\b\d{4}-\d{2}-\d{2}\b`, "giu");
// A fraction ("4/9", our score format) is one number and must appear whole.
const NUMBER = /(?<![\p{L}\p{N}_.#\/])\d+(?:[.,]\d+)*(?:\/\d+(?:[.,]\d+)*)?(?![\p{L}\p{N}_\/])/gu;
// Numbers in a linked file, by value: thousands commas only ("[1,5]" is 1 and 5), so "0.50" backs "0.5".
const SOURCE_NUMBER = /(?<![\d.])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?!\d)/g;
const value = (n: string) => Number(n.replace(/,/g, ""));

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

// Is this number in one of the linked files? A fraction needs the same fraction ("4/9", "4 / 9" or "4 of 9"); any
// other number needs the same value ("10,000" and "10000", "0.5" and "0.50"), never part of a longer one (15 in 150).
function backed(n: string, sources: string[], values: Set<number>): boolean {
  const [top, bottom] = n.split("/");
  if (bottom === undefined) return values.has(value(n));
  const esc = (x: string) => x.replace(/[.,]/g, "\\$&");
  const re = new RegExp(String.raw`(?<![\d.,])${esc(top!)}\s*(?:\/|of)\s*${esc(bottom)}(?![\d])`);
  return sources.some((s) => re.test(s));
}

export function lintNumbers(file: string, text: string, readLinked: (path: string) => string | null): { line: number; issue: string }[] {
  const problems: { line: number; issue: string }[] = [];
  for (const section of sections(text)) {
    const body = section.lines.join("\n");
    const allowed = new Set([...body.matchAll(/<!--\s*numbers ok:([^>]*)-->/giu)].flatMap((m) => m[1]!.replace(/\([^)]*\)/g, "").split(/[\s,]+/).filter(Boolean)));
    const linked = [...body.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)].map((m) => m[1]!).filter((l) => !/^[a-z]+:/i.test(l));
    const sources = linked.map((l) => readLinked(join(dirname(file), l))).filter((t): t is string => t !== null);
    const values = new Set(sources.flatMap((t) => [...t.matchAll(SOURCE_NUMBER)].map((m) => value(m[0]))));
    section.lines.forEach((raw, i) => {
      const line = raw
        .replace(/<!--.*?-->/g, " ").replace(/`[^`]*`/g, " ")
        .replace(/\]\([^)]*\)/g, "]").replace(/https?:\/\/\S+/g, " ")
        .replace(DATE, " ").replace(/\b(?:19|20)\d{2}\b/g, " ").replace(/^\s*\d+[.)]\s/, " ");
      for (const m of line.matchAll(NUMBER)) {
        const n = m[0];
        if (allowed.has(n) || backed(n, sources, values)) continue;
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
  const present = scope.filter((f) => existsSync(join(root, f)));
  const lines = present.flatMap((f) =>
    lintNumbers(f, readFileSync(join(root, f), "utf8"), readLinkedFile(root)).map((p) => `FAIL ${relative(root, join(root, f))}:${p.line}: ${p.issue}`));
  lines.push(`number lint: ${present.length} files checked, ${lines.length} unbacked numbers`);
  return { code: lines.length === 1 ? 0 : 1, lines };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { code, lines } = lintNumbersIn(process.cwd(), process.argv.slice(2).length ? process.argv.slice(2) : SCOPE);
  for (const l of lines) console.log(l);
  process.exitCode = code;
}
