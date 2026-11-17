import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { renderCard } from "../card/terminal.ts";
import { Trace } from "../schema/index.ts";
import { runTraps } from "../traps/run.ts";
import { runVerify } from "../verify/index.ts";
import { formatDoctor, runDoctor, type DoctorDeps } from "./doctor.ts";

// T95: `make judge`, everything a judge needs from a clean clone with no keys, in one run under 60 s:
// pz doctor, every reviewed trace as a card, pz verify on all of them, the trap lines, then one summary line.
// It never prints a stack trace: anything that breaks is one plain FAIL line and a non-zero exit.

const BUDGET_S = 60;
const jsonIn = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => join(dir, f)) : []);

// The traces a judge sees: the reviewed live traces under traces/ (#131) and traces/gallery/ (T92). Until those are
// committed, the SAMPLE fixtures stand in, and the output says so.
export function judgeTraces(root: string): { paths: string[]; sample: boolean } {
  const real = [...jsonIn(join(root, "traces")), ...jsonIn(join(root, "traces/gallery"))];
  return real.length ? { paths: real, sample: false } : { paths: jsonIn(join(root, "fixtures/traces")), sample: true };
}

// The latest dated row of eval/dev-score.md (T33), as "X/Y", or null when the dev score has not been run.
export function devScore(root: string): string | null {
  const file = join(root, "eval/dev-score.md");
  if (!existsSync(file)) return null;
  const rows = readFileSync(file, "utf8").split("\n").filter((l) => /^\|\s*\d{4}-\d{2}-\d{2}/.test(l));
  return rows.at(-1)?.match(/(\d+)\s*\/\s*(\d+)/)?.slice(1, 3).join("/") ?? null;
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

    const { paths, sample } = judgeTraces(root);
    section(`${paths.length} trace${paths.length === 1 ? "" : "s"} as cards`);
    if (sample) write("No reviewed live traces are committed yet (traces/), so these are the SAMPLE fixtures, written for the tests.");
    for (const p of paths) {
      write(`\n-- ${relative(root, p)}`);
      write(renderCard(Trace.parse(JSON.parse(readFileSync(p, "utf8")))));
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
    write(`${paths.length} ${sample ? "SAMPLE " : ""}traces ${verified.code ? "checked, some FAILED" : "verified"}, `
      + `${Number.isNaN(planted) ? "planted origins unknown" : `${planted} planted origins`}, `
      + `dev score ${dev ?? "not run yet"}, held-out ${held ?? "not run yet"}. ${code ? "make judge FAILED" : "make judge passed"} in ${took} s.`);
    return code;
  } catch (err) {
    // One plain line, never a stack trace.
    write(`FAIL make judge stopped: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
    return 1;
  }
}
