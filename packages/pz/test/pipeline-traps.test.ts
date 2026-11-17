import { cpSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadRules } from "../src/rules/index.ts";
import { judgeCase, MUTATIONS, nudge, PipelineCase, runPipelineCase, runPipelineTraps } from "../src/traps/pipeline.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const dir = join(root, "traps/pipeline");
const rules = loadRules();
const cases = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => PipelineCase.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))));

describe("T30 pipeline traps", () => {
  it("has 20 to 35 cases covering all eight mutations, built only from committed spike traces", () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(cases.length).toBeLessThanOrEqual(35);
    expect(new Set(cases.map((c) => c.mutation))).toEqual(new Set(MUTATIONS));
    expect(cases.every((c) => c.source.startsWith("spike/traces/"))).toBe(true);
  });

  it("[C18] without its mutation, every source ends ORIGIN_FOUND on the planted page, so each trap is what stops it", async () => {
    for (const source of new Set(cases.map((c) => c.source))) {
      const c = cases.find((x) => x.source === source)!;
      const control = await runPipelineCase(c, root, rules, { mutate: false });
      expect([source, control.state, control.originUrl], source).toEqual([source, "ORIGIN_FOUND", control.planted]);
    }
  }, 60_000);

  it.each(cases.map((c) => [c.id, c] as const))("[C18] %s gives its expected state, with false-certainty 0", async (_, c) => {
    const r = await runPipelineCase(c, root, rules);
    expect(judgeCase(c, r, rules)).toEqual([]);
    if (c.expect.noOrigin) expect(r.originUrl).toBeNull();
  }, 20_000);

  it("a known gap is counted as a wrong origin, and fails the run once it stops being one", async () => {
    const gap = cases.find((c) => c.expect.knownGap)!;
    const r = await runPipelineCase(gap, root, rules);
    expect(r.state).toBe("ORIGIN_FOUND");
    expect(judgeCase(gap, r, rules)).toEqual([]);
    expect(judgeCase(gap, { ...r, state: "TRAIL_GOES_COLD", originUrl: null }, rules)).toEqual([expect.stringMatching(/^known gap closed/)]);
  }, 20_000);

  it("writes the claim's number one higher, the same way", () => {
    expect([nudge("8"), nudge("55%"), nudge("26.2"), nudge("100")]).toEqual(["9", "56%", "27.2", "101"]);
  });

  it("pz traps prints the pipeline line, and fails when a case changes without a relock", async () => {
    const ok = await runPipelineTraps({ root, casesDir: dir, lockPath: join(root, "traps/pipeline.lock"), rules });
    expect(ok.code).toBe(0);
    expect(ok.lines.at(-1)).toMatch(/^pipeline: wrong origins 4 of 16 cases that could end on one; 4 are the known gap \(paraphrased negation, docs\/limits\.md\), and the other 12 give 0 \(95% upper bound 22\.1%\)\. Failure paths end as expected in 12 of 12; planted dates are capped in 3 of 3\./);
    const tmp = mkdtempSync(join(tmpdir(), "pz-pipeline-lock-"));
    cpSync(dir, join(tmp, "cases"), { recursive: true });
    cpSync(join(root, "traps/pipeline.lock"), join(tmp, "lock"));
    const f = readdirSync(join(tmp, "cases"))[0]!;
    writeFileSync(join(tmp, "cases", f), readFileSync(join(tmp, "cases", f), "utf8").replace("\"note\": \"", "\"note\": \"edited "));
    expect((await runPipelineTraps({ root, casesDir: join(tmp, "cases"), lockPath: join(tmp, "lock"), rules })).code).toBe(1);
  }, 60_000);
});
