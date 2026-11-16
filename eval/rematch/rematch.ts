// T93 (#160): the rematch. Patient Zero against ChatGPT, Claude and Perplexity on 10 E3 claims, graded blind by
// Rohan with the spike rubric. This file holds the code parts; eval/rematch/README.md is the protocol.
//
//   node --import tsx eval/rematch/rematch.ts draw                      writes eval/rematch/draw.json (seeded)
//   node --import tsx eval/rematch/rematch.ts blind <keyPath>           raw/ to forms/ A to D, key written outside git
//   node --import tsx eval/rematch/rematch.ts unblind <keyPath>         grades.json + key to eval/rematch.md
//
// No model or search call is made here. Rival answers are collected by hand; our traces come from the live run.
import { createHash, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Trace } from "../../packages/pz/src/schema/index.ts";

export const SEED = "T93 #160 rematch, drawn 2026-11-16";
export const TOOLS = ["chatgpt", "claude", "perplexity", "patient-zero"] as const;
export type Tool = (typeof TOOLS)[number];
const LETTERS = ["A", "B", "C", "D"] as const;

// The draw: every E3 claim ranked by sha256(seed + id), the first 10 kept. The seed is fixed in this file, so anyone
// can re-run the draw and get the same claims; nobody picked them.
export function draw(claims: { id: string }[], seed = SEED, n = 10): string[] {
  const rank = (id: string) => createHash("sha256").update(`${seed}\u0000${id}`).digest("hex");
  return [...claims].sort((a, b) => rank(a.id).localeCompare(rank(b.id))).slice(0, n).map((c) => c.id).sort();
}

// The common form every answer is graded in, as in the spike's blind forms. Our trace is put into it by code; a
// rival's form is written from its transcript by hand (raw/<tool>/<claim>.form.md), the way XO did for the spike.
export function formFromTrace(trace: Trace): string {
  const byId = new Map(trace.nodes.map((n) => [n.id, n]));
  const earliest = trace.earliest.nodeIds.map((id) => byId.get(id)!).filter(Boolean);
  const pages = trace.nodes.filter((n) => !n.meta).sort((a, b) => (b.date.value ?? "").localeCompare(a.date.value ?? ""));
  const quote = (id: string) => trace.spans.find((s) => s.nodeId === id)?.text;
  const origin = trace.decision.state === "ORIGIN_FOUND";
  const stop = origin ? "This page is the earliest source found, and it states the claim itself."
    : trace.decision.state === "CONFLICTING" ? "The earliest pages found give different numbers, so no single earliest source is named."
    : trace.decision.state === "NO_PAGES_FOUND" ? "No page stating the claim was found."
    : trace.decision.state === "TOOL_FAILED" ? "A search tool failed before the trail could be followed further."
    : "No earlier source could be confirmed; the earliest pages found are listed without naming one as the source.";
  return [
    `- Earliest URL: ${earliest.length ? earliest.map((n) => n.url).join("; ") : "none"}`,
    `- Its date: ${earliest.length ? earliest.map((n) => n.date.value ?? "date not confirmed").join("; ") : "none"}`,
    `- Stop statement: "${stop}"`,
    "",
    "## Chain, newest to oldest",
    "",
    ...(pages.length ? pages.flatMap((n, i) => [`${i + 1}. ${n.url} (${n.date.value ?? "date not confirmed"})`, ...(quote(n.id) ? [`   > "${quote(n.id)}"`] : [])]) : ["No pages."]),
  ].join("\n");
}

// Words and marks that would tell the grader which tool wrote a form.
const IDENTITY = [/chat\s?gpt/gi, /open\s?ai/gi, /\bclaude\b/gi, /anthropic/gi, /perplexity/gi, /patient zero/gi, /deep research/gi,
  /\bcite(?:turn|\w*turn)\w*/gi, /https?:\/\/(?:chatgpt\.com|chat\.openai\.com|claude\.ai|www\.perplexity\.ai|perplexity\.ai)\/\S*/gi,
  /\b(?:LIVE|REPLAY|SAMPLE)\b/g, /decision table row \d/gi, /says who/gi];
export function scrub(text: string): string {
  return IDENTITY.reduce((t, re) => t.replace(re, "[removed]"), text);
}

export type Key = { claim: string; letter: (typeof LETTERS)[number]; tool: Tool }[];

// Blinding: for each claim, the four forms get letters A to D in a fresh random order (crypto randomness, per
// claim). Forms go to forms/<claim>-<letter>.md; the key goes to keyPath, which must be outside the repo or
// git-ignored, and is committed only after grading.
export function blind(dir: string, claims: { id: string; text: string }[], keyPath: string, rand: (n: number) => number = randomInt): { forms: number; missing: string[] } {
  // The key may live outside the repo, or under the git-ignored .cache/, never anywhere git would pick it up.
  const repo = resolve(new URL("../../", import.meta.url).pathname);
  const at = resolve(keyPath);
  if (at.startsWith(repo + "/") && !at.startsWith(join(repo, ".cache") + "/")) throw new Error("the key must be outside the repo or under .cache/ until grading is done");
  const missing: string[] = [];
  const key: Key = [];
  mkdirSync(join(dir, "forms"), { recursive: true });
  for (const c of claims) {
    const forms = TOOLS.map((tool) => {
      const trace = join(dir, "raw", tool, `${c.id}.json`), written = join(dir, "raw", tool, `${c.id}.form.md`);
      if (tool === "patient-zero" && existsSync(trace)) return { tool, body: formFromTrace(Trace.parse(JSON.parse(readFileSync(trace, "utf8")))) };
      if (existsSync(written)) return { tool, body: readFileSync(written, "utf8").trim() };
      missing.push(`${tool}/${c.id}`);
      return null;
    }).filter((f): f is { tool: Tool; body: string } => f !== null);
    const order = [...forms];
    for (let i = order.length - 1; i > 0; i--) { const j = rand(i + 1); [order[i], order[j]] = [order[j]!, order[i]!]; }
    order.forEach((f, i) => {
      const letter = LETTERS[i]!;
      key.push({ claim: c.id, letter, tool: f.tool });
      writeFileSync(join(dir, "forms", `${c.id}-${letter}.md`), `# Form ${letter}: ${c.id}\n\nClaim: "${c.text}"\n\n${scrub(f.body)}\n`);
    });
  }
  mkdirSync(dirname(keyPath), { recursive: true });
  writeFileSync(keyPath, JSON.stringify(key, null, 2) + "\n");
  return { forms: key.length, missing };
}

// Rohan's grades, one row per form, on the spike rubric.
export type Grade = { claim: string; form: (typeof LETTERS)[number]; earliest: "Pass" | "Partial" | "Fail" | "Boundary"; stop: "Pass" | "Partial" | "Fail"; citation: "Pass" | "Fail" | "N/A"; note?: string };

// Unblinding: grades joined to the key, per-tool totals, per-claim rows. Expected is "origin" or "cold" from E3.
export function unblind(grades: Grade[], key: Key, claims: { id: string; text: string; expected: string }[]): string {
  const toolOf = (claim: string, letter: string) => key.find((k) => k.claim === claim && k.letter === letter)?.tool;
  const rows = grades.map((g) => ({ ...g, tool: toolOf(g.claim, g.form) })).filter((r): r is typeof r & { tool: Tool } => !!r.tool);
  const kind = (id: string) => claims.find((c) => c.id === id)?.expected;
  const right = (r: (typeof rows)[number]) => (kind(r.claim) === "cold" ? r.earliest === "Boundary" && r.stop === "Pass" : r.earliest === "Pass");
  const totals = TOOLS.map((tool) => {
    const mine = rows.filter((r) => r.tool === tool);
    const origin = mine.filter((r) => kind(r.claim) === "origin"), cold = mine.filter((r) => kind(r.claim) === "cold");
    return `| ${tool} | ${origin.filter(right).length}/${origin.length} | ${cold.filter(right).length}/${cold.length} | ${mine.filter((r) => r.citation === "Pass").length}/${mine.filter((r) => r.citation !== "N/A").length} | ${mine.filter(right).length}/${mine.length} |`;
  });
  const perClaim = claims.flatMap((c) => TOOLS.map((tool) => {
    const r = rows.find((x) => x.claim === c.id && x.tool === tool);
    return r ? `| ${c.id} | ${c.expected} | ${tool} | ${r.form} | ${r.earliest} | ${r.stop} | ${r.citation} | ${r.note ?? ""} |` : `| ${c.id} | ${c.expected} | ${tool} | none | not graded | | | |`;
  }));
  return [
    "| Tool | Earliest source right (origin claims) | Cold-trail stop right (cold claims) | Citations that open and match | Right overall |",
    "|---|---|---|---|---|",
    ...totals,
    "",
    "| Claim | Expected | Tool | Form | Earliest | Stop | Citation | Grader's note |",
    "|---|---|---|---|---|---|---|---|",
    ...perClaim,
  ].join("\n");
}

const isMain = process.argv[1]?.endsWith("rematch.ts");
if (isMain) {
  const here = dirname(new URL(import.meta.url).pathname);
  const e3 = JSON.parse(readFileSync(join(here, "../dev-claims-e3.json"), "utf8")) as { id: string; text: string; expected: string }[];
  const [cmd, keyPath] = process.argv.slice(2);
  const drawn = () => (JSON.parse(readFileSync(join(here, "draw.json"), "utf8")) as { claims: string[] }).claims.map((id) => e3.find((c) => c.id === id)!);
  if (cmd === "draw") {
    const claims = draw(e3);
    writeFileSync(join(here, "draw.json"), JSON.stringify({ seed: SEED, method: "rank every E3 claim by sha256(seed, NUL, id), keep the first 10", claims }, null, 2) + "\n");
    console.log(claims.join(", "));
  } else if (cmd === "blind" && keyPath) {
    const { forms, missing } = blind(here, drawn(), keyPath);
    console.log(`${forms} forms written to eval/rematch/forms; key at ${keyPath}${missing.length ? `; missing: ${missing.join(", ")}` : ""}`);
  } else if (cmd === "unblind" && keyPath) {
    const table = unblind(JSON.parse(readFileSync(join(here, "grades.json"), "utf8")) as Grade[], JSON.parse(readFileSync(keyPath, "utf8")) as Key, drawn());
    writeFileSync(join(here, "../rematch.md"), `# Rematch results (T93, #160)\n\nSee eval/rematch/README.md for the protocol.\n\n${table}\n`);
    console.log("wrote eval/rematch.md");
  } else {
    console.error("usage: rematch.ts draw | blind <keyPath> | unblind <keyPath>");
    process.exitCode = 2;
  }
}
