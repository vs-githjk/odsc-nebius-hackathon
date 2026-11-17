// T93 (#160): the rematch. Patient Zero against ChatGPT, Claude and Perplexity on 10 E3 claims, graded blind by
// Rohan with the spike rubric. This file holds the code parts; eval/rematch/README.md is the protocol.
//
//   node --import tsx eval/rematch/rematch.ts draw                      writes eval/rematch/draw.json (seeded)
//   node --import tsx eval/rematch/rematch.ts draft                     raw/patient-zero/<claim>.json to a fact sheet
//   node --import tsx eval/rematch/rematch.ts blind <keyPath>           raw/ to forms/ A to D, key written outside git
//   node --import tsx eval/rematch/rematch.ts unblind <keyPath>         grades.json + key to eval/rematch.md
//
// No model or search call is made here. Rival answers are collected by hand; our traces come from the live run.
import { createHash, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

// Paths come from fileURLToPath, never URL.pathname: the repo folder can have spaces ("ODSC x Nebius Hackathon"), and
// pathname would keep them as %20, so draw would fail and the key guard would miss the repo.
export const dirOf = (url: string) => dirname(fileURLToPath(url));
export const REPO = resolve(dirOf(import.meta.url), "../..");

// Inside the repo and outside the git-ignored .cache/: where git could pick a grading key up.
export function insideGit(path: string, repo = REPO): boolean {
  const at = resolve(path);
  return at.startsWith(repo + "/") && !at.startsWith(join(repo, ".cache") + "/");
}

// The facts of our trace in the spike's form shape. This is a fact sheet, never the form itself: every form, ours
// included, is written by hand (raw/<tool>/<claim>.form.md), so no form can be told apart by code-made sentences.
// The stop statement is left for the writer; the line under it says what the trace ended on.
export const TO_WRITE = "<write";
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
    `- Stop statement: "${TO_WRITE} this in your own words, as you did for the rival forms>"`,
    `  (What the trace ended on: ${stop})`,
    "",
    "## Chain, newest to oldest",
    "",
    ...(pages.length ? pages.flatMap((n, i) => [`${i + 1}. ${n.url} (${n.date.value ?? "date not confirmed"})`, ...(quote(n.id) ? [`   > "${quote(n.id)}"`] : [])]) : ["No pages."]),
  ].join("\n");
}

// Marks that would tell the grader which tool wrote a form. They are dropped, never replaced with a marker, since a
// marker that only rival forms carry would itself give the tool away. Tool names become "the tool".
const DROP = [/\bcite(?:turn|\w*turn)\w*/gi, /https?:\/\/(?:chatgpt\.com|chat\.openai\.com|claude\.ai|www\.perplexity\.ai|perplexity\.ai)\/\S*/gi,
  /\s*\((?:LIVE|REPLAY|SAMPLE)\)/g, /\b(?:LIVE|REPLAY|SAMPLE)\b/g, /,?\s*decision table row \d/gi];
const NAMES = [/chat\s?gpt(?:\s+deep research)?/gi, /open\s?ai/gi, /\bclaude\b/gi, /anthropic/gi, /perplexity/gi, /patient zero/gi, /deep research/gi, /says who/gi];
export function scrub(text: string): string {
  // Query strings and fragments go from every URL: utm_source and the like are added by one tool and not the others.
  let t = text.replace(/(https?:\/\/[^\s?#)\]>"']+)[?#][^\s)\]>"']*/g, "$1");
  t = DROP.reduce((x, re) => x.replace(re, ""), t);
  t = NAMES.reduce((x, re) => x.replace(re, "the tool"), t);
  return t.replace(/[ \t]{2,}/g, " ").replace(/ +([.,;:])/g, "$1");
}

export type Key = { claim: string; letter: (typeof LETTERS)[number]; tool: Tool }[];

// Blinding: for each claim, the four forms get letters A to D in a fresh random order (crypto randomness, per
// claim). Every form, ours included, is the hand-written raw/<tool>/<claim>.form.md. Forms go to
// forms/<claim>-<letter>.md; the key goes to keyPath, which must be outside the repo or git-ignored, and is committed
// only after grading.
export function blind(dir: string, claims: { id: string; text: string }[], keyPath: string, rand: (n: number) => number = randomInt, repo = REPO): { forms: number; missing: string[] } {
  // The key may live outside the repo, or under the git-ignored .cache/, never anywhere git would pick it up.
  if (insideGit(keyPath, repo)) throw new Error("the key must be outside the repo or under .cache/ until grading is done");
  const missing: string[] = [];
  const key: Key = [];
  for (const c of claims) for (const tool of TOOLS) {
    const written = join(dir, "raw", tool, `${c.id}.form.md`);
    if (existsSync(written) && readFileSync(written, "utf8").includes(TO_WRITE)) throw new Error(`${tool}/${c.id}.form.md still has the fact sheet's placeholder; write the stop statement by hand first`);
  }
  mkdirSync(join(dir, "forms"), { recursive: true });
  for (const c of claims) {
    const forms = TOOLS.map((tool) => {
      const written = join(dir, "raw", tool, `${c.id}.form.md`);
      if (existsSync(written)) return { tool, body: readFileSync(written, "utf8").replace(/^\s*\(What the trace ended on:.*\)\s*$/gm, "").trim() };
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
  const here = dirOf(import.meta.url);
  const e3 = JSON.parse(readFileSync(join(here, "../dev-claims-e3.json"), "utf8")) as { id: string; text: string; expected: string }[];
  const [cmd, keyPath] = process.argv.slice(2);
  const drawn = () => (JSON.parse(readFileSync(join(here, "draw.json"), "utf8")) as { claims: string[] }).claims.map((id) => e3.find((c) => c.id === id)!);
  if (cmd === "draw") {
    const claims = draw(e3);
    writeFileSync(join(here, "draw.json"), JSON.stringify({ seed: SEED, method: "rank every E3 claim by sha256(seed, NUL, id), keep the first 10", claims }, null, 2) + "\n");
    console.log(claims.join(", "));
  } else if (cmd === "draft") {
    // A fact sheet for each of our traces, to be rewritten by hand into raw/patient-zero/<claim>.form.md.
    for (const c of drawn()) {
      const trace = join(here, "raw", "patient-zero", `${c.id}.json`), form = join(here, "raw", "patient-zero", `${c.id}.form.md`);
      if (!existsSync(trace) || existsSync(form)) continue;
      writeFileSync(form, formFromTrace(Trace.parse(JSON.parse(readFileSync(trace, "utf8")))) + "\n");
      console.log(`fact sheet: ${form}`);
    }
  } else if (cmd === "blind" && keyPath) {
    const { forms, missing } = blind(here, drawn(), keyPath);
    console.log(`${forms} forms written to eval/rematch/forms; key at ${keyPath}${missing.length ? `; missing: ${missing.join(", ")}` : ""}`);
  } else if (cmd === "unblind" && keyPath) {
    const table = unblind(JSON.parse(readFileSync(join(here, "grades.json"), "utf8")) as Grade[], JSON.parse(readFileSync(keyPath, "utf8")) as Key, drawn());
    writeFileSync(join(here, "../rematch.md"), `# Rematch results (T93, #160)\n\nSee eval/rematch/README.md for the protocol.\n\n${table}\n`);
    console.log("wrote eval/rematch.md");
  } else {
    console.error("usage: rematch.ts draw | draft | blind <keyPath> | unblind <keyPath>");
    process.exitCode = 2;
  }
}
