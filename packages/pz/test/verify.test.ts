import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadRules } from "../src/rules/index.ts";
import type { Trace } from "../src/schema/index.ts";
import { runVerify, traceHash, verifyTrace } from "../src/verify/index.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const tracesDir = join(root, "fixtures/traces");
const pagesDir = join(root, "fixtures/pages");
const fixtures = readdirSync(tracesDir).filter((f) => f.endsWith(".json")).map((f) => join(tracesDir, f));
const rich = (): Trace => JSON.parse(readFileSync(join(tracesDir, "sample-rich.json"), "utf8"));
const origin = (): Trace => JSON.parse(readFileSync(join(tracesDir, "sample-origin.json"), "utf8"));
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
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

  it("[C16] fails a stored earliest node that has an incoming edge", () => {
    const t = origin();
    t.earliest.nodeIds = ["zoo-report"];
    expect(checks(t)).toContain("earliest");
  });

  it("[C16] fails an earliest node with an incoming edge even when no page is older", () => {
    const t = origin();
    t.earliest.nodeIds = ["zoo-report"];
    t.nodes.find((n) => n.id === "zoo-report")!.date.value = "2019-01-01";
    expect(verifyTrace(t).failures.filter((f) => f.check === "earliest").map((f) => f.detail)).toEqual([expect.stringContaining("incoming edge e1")]);
  });

  it("[C16] fails when a page outside the earliest clusters is older", () => {
    const t = origin();
    t.nodes[2]!.date.value = "2018-01-01";
    // Since #307 the older page also demotes the stored origin (the earliest-dated-page guard), so the stop state
    // fails too.
    expect(checks(t)).toEqual(["earliest", "stop_state"]);
  });

  it("[C20] passes weakNumberMaxCommas from rules.json into the atom check", () => {
    const t = origin();
    const s = t.spans[0]!;
    s.text = "Our penguins, the adults, nap 14 times a day.";
    s.end = s.start + s.text.length;
    s.windowSha256 = sha(s.contextBefore + s.text + s.contextAfter);
    const atoms = (rules = loadRules()) => verifyTrace(t, { rules }).failures.filter((f) => f.check === "atoms");
    expect(atoms()).toEqual([]);
    expect(atoms({ ...loadRules(), weakNumberMaxCommas: 0 })).toHaveLength(1);
  });

  it("[C2] rejects a span preceded by a negation on a non-meta page", () => {
    const t = origin();
    const s = t.spans[0]!;
    s.contextBefore = "It is a myth that";
    s.windowSha256 = sha(s.contextBefore + s.text + s.contextAfter);
    const found = verifyTrace(t).failures.map((f) => f.check);
    expect(found).toContain("negated");
  });

  it("fails a page hash mismatch with --pages", () => {
    const t = rich();
    t.spans[0]!.extractSha256 = "0".repeat(64);
    expect(checks(t)).toEqual(["page_hash"]);
  });

  it("exits 2 when --pages has no directory", () => {
    let status = 0;
    try { execFileSync("node", ["--import", "tsx", join(root, "packages/pz/src/cli/pz.ts"), "verify", fixtures[0]!, "--pages"], { cwd: root, stdio: "pipe" }); }
    catch (e) { status = (e as { status: number }).status; }
    expect(status).toBe(2);
  });

  it("never imports the matcher", () => {
    const dir = fileURLToPath(new URL("../src/verify/", import.meta.url));
    for (const f of readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith(".ts")))
      expect(readFileSync(join(dir, f), "utf8")).not.toMatch(/from\s+["'][^"']*\/match\//);
  });
});

describe("pz verify on historical records", () => {
  // A stored decision whose state and row still agree but whose reason text was written by older rules.
  const olderWording = (): Trace => {
    const t = origin();
    t.decision = { ...t.decision, reasons: ["reason text from an older version of the rules"] };
    return t;
  };
  // An edge span that no longer passes the current number rules.
  const olderAtoms = (): Trace => {
    const t = rich();
    t.claim = { ...t.claim, atoms: { ...t.claim.atoms, number: { raw: "15", canonical: "15" } } };
    return t;
  };

  it("[C16] a stop-state failure names the field that differs, so equal states and rows are never a puzzle", () => {
    const failure = verifyTrace(olderWording()).failures.find((f) => f.check === "stop_state");
    expect(failure?.detail).toMatch(/differs in reasons/);
    expect(failure?.detail).toContain("reason text from an older version of the rules");
  });

  it("[C16] a current trace stays strict: older reason text and older atoms both fail", () => {
    expect(verifyTrace(olderWording()).failures.map((f) => f.check)).toContain("stop_state");
    expect(verifyTrace(olderAtoms()).failures.map((f) => f.check)).toContain("atoms");
  });

  it("[C16] a historical record skips the atoms re-check and compares the decision on state and row only", () => {
    expect(verifyTrace(olderWording(), { historical: true }).failures).toEqual([]);
    expect(verifyTrace(olderAtoms(), { historical: true }).failures.map((f) => f.check)).not.toContain("atoms");
    const moved = olderWording();
    moved.decision = { ...moved.decision, row: 6, state: "TRAIL_GOES_COLD" };
    expect(verifyTrace(moved, { historical: true }).failures.map((f) => f.check)).toContain("stop_state");
  });

  it("[C16] historical records are listed in a manifest and announced in the output, never silently", () => {
    const dir = mkdtempSync(join(tmpdir(), "pz-historical-"));
    const path = join(dir, "sample-origin.json");
    writeFileSync(path, JSON.stringify(olderWording()));
    const manifest = { rulesAt: "abc1234", note: "recorded before a rules change", traces: [{ id: "sample-origin", sha256: traceHash(olderWording()) }] };
    const { code, lines } = runVerify([path], { historical: manifest });
    expect(code).toBe(0);
    expect(lines[0]).toBe("HISTORICAL sample-origin: recorded under the rules at abc1234 (recorded before a rules change); atoms re-check skipped, stop state compared on state and row");
    expect(runVerify([path]).code).toBe(1);
  });

  it("[C16] a re-run with the same id but different content is not historical: it is checked in full", () => {
    const dir = mkdtempSync(join(tmpdir(), "pz-historical-"));
    const path = join(dir, "sample-origin.json");
    const manifest = { rulesAt: "abc1234", note: "recorded before a rules change", traces: [{ id: "sample-origin", sha256: traceHash(olderWording()) }] };
    const rerun = olderWording();
    rerun.recordedAt = "2026-11-10T00:00:00.000Z";
    writeFileSync(path, JSON.stringify(rerun));
    const { code, lines } = runVerify([path], { historical: manifest });
    expect(code).toBe(1);
    expect(lines.some((l) => l.startsWith("HISTORICAL"))).toBe(false);
    expect(lines.some((l) => l.startsWith("FAIL sample-origin stop_state"))).toBe(true);
  });

  it("the hash is of the trace's content, so line endings or key spacing in the file never change it", () => {
    const t = olderWording();
    expect(traceHash(JSON.parse(JSON.stringify(t, null, 2).replace(/\n/g, "\r\n")))).toBe(traceHash(t));
    expect(traceHash(t)).toMatch(/^[0-9a-f]{64}$/);
  });
});
