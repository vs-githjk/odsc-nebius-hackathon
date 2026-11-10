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
// A SAMPLE fixture standing in for a dev trace: renamed, with one page's URL set as given. URLs are not hashed.
function asDev(fixture: string, id: string, urls: Record<string, string> = {}): Trace {
  const t = load(fixture);
  t.id = id;
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
    expect(s).toMatchObject({ traces: 4, claims: 20, scored: 3, unverified: 1, falseOrigins: 1, unverifiedOrigins: 0, targetCited: 1, originClaims: 11, pass: 1, fail: 1, coldCorrect: 1, coldClaims: 9, modes: ["SAMPLE"] });
    expect(headline(s)).toMatch(/^false origins 1 \(\+0 unverified ORIGIN_FOUND\) \| target cited 1\/11 \| earliest 1 Pass, 0 Partial, 1 Fail \| cold stops 1\/9 \| 3 of 20 claims scored \(1 unverified\)/);
    const md = join(dir, "dev-score.md");
    appendRow(md, s, "2026-11-09 12:00", "abc1234", "E2");
    appendRow(md, s, "2026-11-10 12:00", "def5678", "E3");
    const rows = readFileSync(md, "utf8").trim().split("\n").filter((l) => l.startsWith("| 2026"));
    expect(rows).toEqual([
      "| 2026-11-09 12:00 | abc1234 | E2 | 1 (+0) | 1/11 | 1 / 0 / 1 | 1/9 | 3 of 20 | 90 | 137 | SAMPLE |",
      "| 2026-11-10 12:00 | def5678 | E3 | 1 (+0) | 1/11 | 1 / 0 / 1 | 1/9 | 3 of 20 | 90 | 137 | SAMPLE |",
    ]);
  });
});
