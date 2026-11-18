import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { renderCard } from "../card/terminal.ts";
import { replayTrace } from "../engine/run.ts";
import { Trace } from "../schema/index.ts";
import { runTraps } from "../traps/run.ts";
import { runVerify } from "../verify/index.ts";
import { formatDoctor, runDoctor, type DoctorDeps } from "./doctor.ts";

// T95: `make judge`, everything a judge needs from a clean clone with no keys, in one run under 60 s:
// pz doctor, every reviewed trace as a card, pz verify on all of them, the trap lines, then one summary line.
// It never prints a stack trace: anything that breaks is one plain FAIL line and a non-zero exit.

const BUDGET_S = 60;
const jsonIn = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => join(dir, f)) : []);

// Recorded E2 dev runs a judge sees when no reviewed traces are committed under traces/ (XO judge pass, #2). Both end
// cold on an earliest page a judge cannot contradict in one search: dev-11, CNBC on 2017-07-10, the day the CDP report
// it quotes came out; dev-04, the Valtin paper on PubMed, dated November 2002 by the registry, quoting the "eight
// 8-oz glasses" admonition. dev-10 (the hero) joins once Rohan's archive-date fix ends it on the WEF report
// (decisions.md); dev-06's earliest span is a menu row and dev-14's ranks 2021 reprints over the 2019 release, so
// neither is shown. A missing file is skipped.
export const JUDGE_DEV_TRACES = ["dev-11", "dev-04"];

// The traces a judge sees: the reviewed live traces under traces/ (#131) and traces/gallery/ (T92); else the recorded
// dev runs above, replayed with no network; else the SAMPLE fixtures. The output says which.
export function judgeTraces(root: string): { paths: string[]; sample: boolean; source: "reviewed" | "dev" | "sample" } {
  const real = [...jsonIn(join(root, "traces")), ...jsonIn(join(root, "traces/gallery"))];
  if (real.length) return { paths: real, sample: false, source: "reviewed" };
  const dev = JUDGE_DEV_TRACES.map((id) => join(root, "eval/dev-traces", `${id}.json`)).filter((f) => existsSync(f));
  if (dev.length) return { paths: dev, sample: false, source: "dev" };
  return { paths: jsonIn(join(root, "fixtures/traces")), sample: true, source: "sample" };
}

// The latest dated row of eval/dev-score.md (T33), as "X/Y", or null when the dev score has not been run.
export function devScore(root: string): string | null {
  const file = join(root, "eval/dev-score.md");
  if (!existsSync(file)) return null;
  const rows = readFileSync(file, "utf8").split("\n").filter((l) => /^\|\s*\d{4}-\d{2}-\d{2}/.test(l));
  // Columns: date, commit, set, false origins, target cited, earliest Pass / Partial / Fail, ...
  const cells = rows.at(-1)?.split("|").map((c) => c.trim()).filter(Boolean) ?? [];
  const earliest = cells[5]?.match(/^(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)$/);
  if (!cells[4]?.match(/^\d+\/\d+$/) || !earliest) return null;
  // Same denominator as target cited: every origin claim, the unverified one included.
  const origins = cells[4].split("/")[1];
  return `${cells[2]}: false origins ${cells[3]}, target cited ${cells[4]}, earliest ${earliest[1]}/${origins} pass`;
}

// The held-out result (T67, #125), once its readout is committed.
export function heldOut(root: string): string | null {
  const file = join(root, "eval/heldout-readout.md");
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8").match(/origin hits?\D{0,20}(\d+)\s*\/\s*(\d+)/i)?.slice(1, 3).join("/") ?? null;
}

export async function runJudge(deps: Omit<DoctorDeps, "network"> & { write?: (s: string) => void; now?: () => number }): Promise<number> {
  const write = deps.write ?? ((s: string) => console.log(s));
  const now = deps.now ?? Date.now;
  const started = now();
  const root = deps.root;
  let code = 0;
  const section = (title: string) => write(`\n== ${title}`);

  try {
    section("pz doctor");
    const doctor = await runDoctor({ ...deps, network: false });
    formatDoctor(doctor.lines).forEach(write);
    if (doctor.code) return 1;

    const { paths, sample, source } = judgeTraces(root);
    section(`${paths.length} trace${paths.length === 1 ? "" : "s"} as cards`);
    if (source === "dev") write(`Recorded live runs on our E2 dev claims, replayed with no network calls and no keys: ${paths.map((p) => relative(root, p)).join(", ")}.`);
    if (sample) write("No recorded traces are committed, so these are the SAMPLE fixtures, written for the tests.");
    for (const p of paths) {
      write(`\n-- ${relative(root, p)}`);
      // A real trace replays exactly as `pz trace --replay-of` does: checked, shown as REPLAY, and the card says when it was
      // recorded.
      const raw: unknown = JSON.parse(readFileSync(p, "utf8"));
      write(renderCard(sample ? Trace.parse(raw) : replayTrace(raw)));
    }

    section("pz verify");
    const verified = runVerify(paths);
    verified.lines.forEach(write);
    if (verified.code) code = 1;

    section("planted traps");
    const traps = runTraps({ root, casesDir: join(root, "traps/cases"), lockPath: join(root, "traps/traps.lock") });
    traps.lines.forEach(write);
    if (traps.code) code = 1;
    let planted = Number(traps.lines.at(-1)?.match(/wrong origins (\d+)/)?.[1] ?? NaN);
    // The adversarial set (T50) joins when it is in the tree.
    const adversarialModule = join(root, "packages/pz/src/traps/adversarial.ts");
    if (existsSync(adversarialModule) && existsSync(join(root, "traps/adversarial"))) {
      const { runAdversarial } = (await import(adversarialModule)) as { runAdversarial: (p: { casesDir: string; lockPath: string }) => Promise<{ code: number; lines: string[] }> };
      const adv = await runAdversarial({ casesDir: join(root, "traps/adversarial"), lockPath: join(root, "traps/adversarial.lock") });
      adv.lines.forEach(write);
      if (adv.code) code = 1;
      planted += Number(adv.lines.at(-1)?.match(/planted origins (\d+)/)?.[1] ?? NaN);
    }

    const took = Math.round((now() - started) / 1000);
    if (took > BUDGET_S) { write(`FAIL make judge took ${took} s, over the ${BUDGET_S} s budget`); code = 1; }
    const dev = devScore(root), held = heldOut(root);
    section("summary");
    write(`${paths.length} ${sample ? "SAMPLE " : source === "dev" ? "REPLAY " : ""}traces ${verified.code ? "checked, some FAILED" : "verified"}, `
      + `${Number.isNaN(planted) ? "planted origins unknown" : `${planted} planted origins`}, `
      + `dev score ${dev ?? "not run yet"}, held-out ${held ?? "not run yet"}. ${code ? "make judge FAILED" : "make judge passed"} in ${took} s.`);
    return code;
  } catch (err) {
    // One plain line, never a stack trace.
    write(`FAIL make judge stopped: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
    return 1;
  }
}
