import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Trace } from "../src/schema/index.ts";
import { runVerify, verifyTrace } from "../src/verify/index.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const tracesDir = join(root, "fixtures/traces");
const pagesDir = join(root, "fixtures/pages");
const fixtures = readdirSync(tracesDir).filter((f) => f.endsWith(".json")).map((f) => join(tracesDir, f));
const rich = (): Trace => JSON.parse(readFileSync(join(tracesDir, "sample-rich.json"), "utf8"));
const checks = (t: Trace) => verifyTrace(t, { pagesDir }).failures.map((f) => f.check);

describe("pz verify", () => {
  it("[C16] passes every fixture and prints the summary line", () => {
    const spans = fixtures.reduce((n, f) => n + (JSON.parse(readFileSync(f, "utf8")) as Trace).spans.length, 0);
    const { code, lines } = runVerify(fixtures, { pagesDir });
    expect(fixtures).toHaveLength(7);
    expect(code).toBe(0);
    expect(lines).toEqual([`${spans} of ${spans} spans re-verified, 0 edges without two spans, stop state agrees`]);
  });

  it("[C2] fails a span with one changed digit", () => {
    const t = rich();
    t.spans[0]!.text = t.spans[0]!.text.replace("14", "15");
    expect(checks(t)).toEqual(expect.arrayContaining(["atoms", "window_hash", "page_offsets"]));
  });

  it("[C2] fails an edge missing a span", () => {
    const t = rich();
    t.edges[0]!.childSpanId = "s-missing";
    expect(checks(t)).toContain("edge_spans");
  });

  it("fails an explicit edge with linkHref null", () => {
    const t = rich();
    t.edges[0]!.linkHref = null;
    expect(checks(t)).toEqual(["edge_kind"]);
  });

  it("[C16] fails a stored state that differs from decideStopState", () => {
    const t = rich();
    t.decision = { ...t.decision, state: "ORIGIN_FOUND", row: 5 };
    expect(checks(t)).toEqual(["stop_state"]);
  });

  it("fails a windowSha256 mismatch", () => {
    const t = rich();
    t.spans[0]!.windowSha256 = "0".repeat(64);
    expect(checks(t)).toEqual(["window_hash"]);
  });

  it("exits 1 from the CLI and names the failing check", () => {
    const dir = mkdtempSync(join(tmpdir(), "pz-verify-"));
    const t = rich();
    t.spans[0]!.windowSha256 = "0".repeat(64);
    writeFileSync(join(dir, "bad.json"), JSON.stringify(t));
    let out = "";
    let status = 0;
    try { execFileSync("node", ["--import", "tsx", join(root, "packages/pz/src/cli/pz.ts"), "verify", join(dir, "bad.json")], { cwd: root }); }
    catch (e) { status = (e as { status: number }).status; out = String((e as { stdout: Buffer }).stdout); }
    expect(status).toBe(1);
    expect(out).toContain("FAIL sample-rich window_hash");
  });

  it("never imports the matcher", () => {
    const dir = fileURLToPath(new URL("../src/verify/", import.meta.url));
    for (const f of readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith(".ts")))
      expect(readFileSync(join(dir, f), "utf8")).not.toMatch(/from\s+["'][^"']*\/match\//);
  });
});
