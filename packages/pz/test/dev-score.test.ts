import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendRow, headline, scoreClaim, scoreDir, summarise, urlKey, type DevClaim } from "../../../eval/dev-score.ts";
import type { Trace } from "../src/schema/index.ts";

const load = (id: string): Trace => JSON.parse(readFileSync(new URL(`../../../fixtures/traces/${id}.json`, import.meta.url), "utf8"));
const claims: DevClaim[] = JSON.parse(readFileSync(new URL("../../../eval/dev-claims.json", import.meta.url), "utf8"));
const originClaim = claims.find((c) => c.id === "dev-14")!;
const coldClaim = claims.find((c) => c.id === "dev-05")!;
// A SAMPLE fixture standing in for a dev trace: bound to the dev claim, with page URLs set as given. URLs are not hashed.
function asDev(fixture: string, id: string, urls: Record<string, string> = {}): Trace {
  const t = load(fixture);
  t.id = id;
  t.claim.text = claims.find(claim => claim.id === id)!.text;
  for (const n of t.nodes) if (urls[n.id]) n.url = urls[n.id]!;
  return t;
}

describe("dev score", () => {
  it("unwraps archive captures and ignores scheme, www, port, fragment, tracking and trailing slash", () => {
    expect(urlKey("https://web.archive.org/web/2010/http://www.worldwatch.org/node/6294")).toBe("worldwatch.org/node/6294");
    expect(urlKey("http://WWW.Asurion.com/about/press-releases/x/?utm_source=a#top")).toBe("asurion.com/about/press-releases/x");
    expect(urlKey("https://web.archive.org/web/20120208152927/http://www.science.org:80/doi/10.1126/sciadv.1700782/")).toBe("science.org/doi/10.1126/sciadv.1700782");
  });

  it("keeps the query string, so two pages that differ only in the query never match", () => {
    const wwf = claims.find((c) => c.id === "dev-12")!.tracedOrigin!;
    expect(urlKey(wwf)).toBe("wwf.panda.org/wwf_news?348337/Revealed-plastic-ingestion-by-people-could-be-equating-to-a-credit-card-a-week");
    expect(urlKey("https://wwf.panda.org/wwf_news/?999999/Another-press-release")).not.toBe(urlKey(wwf));
    const otherRelease = scoreClaim(claims.find((c) => c.id === "dev-12")!, asDev("sample-origin", "dev-12", { "keeper-log": "https://wwf.panda.org/wwf_news/?999999/Another-press-release" }));
    expect(otherRelease).toMatchObject({ falseOrigin: true, earliest: "Partial" });
  });

  it("every real dev target keeps its own key", () => {
    const targets = claims.flatMap((c) => (c.tracedOrigin ? [c.tracedOrigin] : []));
    expect(new Set(targets.map(urlKey)).size).toBe(targets.length);
  });

  it("an ORIGIN_FOUND on the registered target is a Pass, not a false origin", () => {
    const s = scoreClaim(originClaim, asDev("sample-origin", "dev-14", { "keeper-log": originClaim.tracedOrigin! }));
    expect(s).toMatchObject({ status: "scored", state: "ORIGIN_FOUND", falseOrigin: false, targetCited: true, earliest: "Pass" });
  });

  it("an ORIGIN_FOUND anywhere else is a false origin, and the same site is only Partial", () => {
    expect(scoreClaim(originClaim, asDev("sample-origin", "dev-14"))).toMatchObject({ falseOrigin: true, targetCited: false, earliest: "Fail" });
    const sameSite = scoreClaim(originClaim, asDev("sample-origin", "dev-14", { "keeper-log": "https://www.asurion.com/blog/phones/" }));
    expect(sameSite).toMatchObject({ falseOrigin: true, earliest: "Partial" });
    const citedLater = scoreClaim(originClaim, asDev("sample-origin", "dev-14", { "coast-news": originClaim.tracedOrigin! }));
    expect(citedLater).toMatchObject({ falseOrigin: true, targetCited: true, earliest: "Fail" });
  });

  it("a cold claim is correct only when it ends TRAIL_GOES_COLD, and any ORIGIN_FOUND on it is a false origin", () => {
    expect(scoreClaim(coldClaim, asDev("sample-rich", "dev-05"))).toMatchObject({ coldCorrect: true, falseOrigin: false, earliest: null });
    expect(scoreClaim(coldClaim, asDev("sample-origin", "dev-05"))).toMatchObject({ coldCorrect: false, falseOrigin: true });
    expect(scoreClaim(coldClaim, asDev("sample-partial", "dev-05"))).toMatchObject({ coldCorrect: false, falseOrigin: false });
  });

  it("an alias of the target (the same work at another URL) counts as the target, and only exactly", () => {
    const alias = originClaim.originAliases![0]!;
    expect(scoreClaim(originClaim, asDev("sample-origin", "dev-14", { "keeper-log": alias }))).toMatchObject({ falseOrigin: false, targetCited: true, earliest: "Pass" });
    // An alias's site is not the target's site: another PubMed record is a Fail on dev-09, not a Partial.
    const paper = claims.find((c) => c.id === "dev-09")!;
    expect(paper.originAliases).toEqual(["https://pubmed.ncbi.nlm.nih.gov/28776036"]);
    expect(scoreClaim(paper, asDev("sample-origin", "dev-09", { "keeper-log": "https://pubmed.ncbi.nlm.nih.gov/11111111" }))).toMatchObject({ falseOrigin: true, targetCited: false, earliest: "Fail" });
  });

  it("every alias is a different key from its target and from every other claim's target", () => {
    const keys = new Map(claims.flatMap((c) => (c.tracedOrigin ? [[urlKey(c.tracedOrigin), c.id] as const] : [])));
    const aliased = claims.filter((c) => c.originAliases?.length);
    expect(aliased.map((c) => c.id)).toEqual(["dev-09", "dev-10", "dev-11", "dev-14"]);
    for (const c of aliased) for (const a of c.originAliases!) expect(keys.get(urlKey(a))).toBeUndefined();
  });

  it("an out-of-scope claim is shown apart and left out of every headline count", () => {
    const audio = claims.find((c) => c.id === "dev-19")!;
    expect(audio.outOfScope).toMatch(/audio/);
    const apart = scoreClaim(audio, asDev("sample-origin", "dev-19"));
    expect(apart).toMatchObject({ status: "out of scope", falseOrigin: false, targetCited: null });
    const s = summarise([apart, scoreClaim(originClaim, asDev("sample-origin", "dev-14", { "keeper-log": originClaim.tracedOrigin! }))]);
    expect(s).toMatchObject({ claims: 1, originClaims: 1, scored: 1, targetCited: 1, falseOrigins: 0, unverifiedOrigins: 0, outOfScope: 1 });
    expect(headline(s)).toContain("| 1 out of scope, scored apart |");
    expect(summarise([scoreClaim(audio, null)])).toMatchObject({ claims: 0, outOfScope: 1 });
  });

  it("decides out of scope before anything else, so a bad or unverified trace of it is still scored apart (XO on #192)", () => {
    const audio = claims.find((c) => c.id === "dev-19")!;
    const unverified = asDev("sample-origin", "dev-19");
    unverified.spans[0]!.text = unverified.spans[0]!.text.replace("14", "15");
    expect(scoreClaim(audio, unverified)).toMatchObject({ status: "out of scope", reason: audio.outOfScope });
    expect(scoreClaim(audio, asDev("sample-origin", "dev-03"))).toMatchObject({ status: "out of scope" });
  });

  it("never scores a trace that fails pz verify, or one filed under the wrong claim", () => {
    const bad = asDev("sample-origin", "dev-14", { "keeper-log": originClaim.tracedOrigin! });
    bad.spans[0]!.text = bad.spans[0]!.text.replace("14", "15");
    expect(scoreClaim(originClaim, bad)).toMatchObject({ status: "unverified", state: "ORIGIN_FOUND", falseOrigin: false, earliest: null });
    expect(summarise([scoreClaim(originClaim, bad)])).toMatchObject({ falseOrigins: 0, unverifiedOrigins: 1 });
    expect(headline(summarise([scoreClaim(originClaim, bad)]))).toMatch(/^false origins 0 \(\+1 unverified ORIGIN_FOUND\) \|/);
    expect(scoreClaim(originClaim, asDev("sample-origin", "dev-13"))).toMatchObject({ status: "bad trace" });
  });

  it("reads a folder of traces, prints false origins first, and appends a dated row", () => {
    const dir = mkdtempSync(join(tmpdir(), "dev-traces-"));
    writeFileSync(join(dir, "dev-14.json"), JSON.stringify(asDev("sample-origin", "dev-14", { "keeper-log": originClaim.tracedOrigin! })));
    writeFileSync(join(dir, "dev-05.json"), JSON.stringify(asDev("sample-rich", "dev-05")));
    writeFileSync(join(dir, "dev-09.json"), JSON.stringify(asDev("sample-origin", "dev-09")));
    writeFileSync(join(dir, "dev-10.json"), "{\"not\": \"a trace\"}");
    const scores = scoreDir(dir, claims);
    const s = summarise(scores);
    expect(s).toMatchObject({ traces: 4, claims: 19, scored: 3, unverified: 1, falseOrigins: 1, unverifiedOrigins: 0, targetCited: 1, originClaims: 10, outOfScope: 1, pass: 1, fail: 1, coldCorrect: 1, coldClaims: 9, modes: ["SAMPLE"] });
    expect(headline(s)).toMatch(/^false origins 1 \(\+0 unverified ORIGIN_FOUND\) \| target cited 1\/10 \| earliest 1 Pass, 0 Partial, 1 Fail \| cold stops 1\/9 \| 3 of 19 claims scored \(1 unverified\) \| 1 out of scope, scored apart \|/);
    const md = join(dir, "dev-score.md");
    appendRow(md, s, "2026-11-09 12:00", "abc1234", "E2");
    appendRow(md, s, "2026-11-10 12:00", "def5678", "E3");
    const rows = readFileSync(md, "utf8").trim().split("\n").filter((l) => l.startsWith("| 2026"));
    expect(rows).toEqual([
      "| 2026-11-09 12:00 | abc1234 | E2 | 1 (+0) | 1/10 | 1 / 0 / 1 | 1/9 | 3 of 19 (+1 out of scope) | 90 | 137 | SAMPLE |",
      "| 2026-11-10 12:00 | def5678 | E3 | 1 (+0) | 1/10 | 1 / 0 / 1 | 1/9 | 3 of 19 (+1 out of scope) | 90 | 137 | SAMPLE |",
    ]);
  });
});
