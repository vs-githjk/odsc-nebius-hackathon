import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DateInfo, Trace } from "../src/schema/trace.ts";
import { createWayback } from "../src/clients/wayback.ts";
import { cacheKey, type CachedResponse } from "../src/clients/cache.ts";
import { createUsageLog } from "../src/usage/log.ts";
import { dateEvidence, dateNode, versionNode } from "../src/engine/dating.ts";

const fixture = Trace.parse(JSON.parse(readFileSync(new URL("../../../fixtures/traces/sample-rich.json", import.meta.url), "utf8")));
const original = fixture.nodes.find(n => n.id === "coast-news")!;
const version = fixture.nodes.find(n => n.id === "coast-news-v2")!;
const found = { status: "found" as const, firstCapture: "2001-03-31", timestamp: "20010331090921" };

describe("dating", () => {
  it("[C6] caps later metadata at the first capture and flags the disagreement", () => {
    expect(DateInfo.parse(dateEvidence({ metadata: "2005-01-01" }, found))).toEqual({
      kind: "existed_by", value: "2001-03-31", source: "wayback_first_capture", firstCapture: "2001-03-31", conflictingDate: true,
    });
  });
  it("a partial registry date carries its precision onto the node; a full day and an archive cap do not", () => {
    const none = { status: "none" as const };
    const year = dateEvidence({ metadata: "2020-12-31", metadataSource: "registry_crossref", metadataPrecision: "year" }, none);
    expect(DateInfo.parse(year)).toMatchObject({ kind: "published", value: "2020-12-31", source: "registry_crossref", precision: "year" });
    expect(dateEvidence({ metadata: "2020-06-30", metadataSource: "registry_pubmed", metadataPrecision: "month" }, none).precision).toBe("month");
    expect("precision" in dateEvidence({ metadata: "2020-06-15", metadataSource: "registry_pubmed" }, none)).toBe(false);
    // Capped by an earlier archive capture, the value is a real day again.
    expect("precision" in dateEvidence({ metadata: "2020-12-31", metadataPrecision: "year" }, { status: "found", firstCapture: "2020-03-04", timestamp: "20200304000000" })).toBe(false);
  });
  it("a node date written before the precision field still parses", () => {
    expect(DateInfo.parse({ kind: "published", value: "2005-01-01", source: "metadata", firstCapture: null, conflictingDate: false }).precision).toBeUndefined();
  });
  it("[C6] never uses body-text or Tavily dates to order nodes", () => {
    const a = dateEvidence({ bodyText: "Founded in 1900. Published 1990-01-01", tavily: "1990-01-01" }, { status: "none" });
    expect(a).toMatchObject({ kind: "unconfirmed", value: null });
    expect(dateEvidence({ bodyText: "1900-01-01" }, found)).toMatchObject({ kind: "existed_by", value: "2001-03-31" });
  });
  it("[C6] retains valid publication metadata before or on the capture day", () => {
    for (const metadata of ["2000-02-29", "2001-03-31T23:59:00Z"]) {
      expect(dateEvidence({ metadata }, found)).toMatchObject({ kind: "published", source: "metadata", value: metadata.slice(0, 10), conflictingDate: false });
    }
  });
  it("[C6] uses a byline when metadata is absent or invalid, and caps it too", () => {
    expect(dateEvidence({ metadata: "2001-02-30", byline: "2000-01-01" }, found)).toMatchObject({ kind: "published", source: "byline", value: "2000-01-01" });
    expect(dateEvidence({ byline: "2002-01-01" }, found)).toMatchObject({ kind: "existed_by", conflictingDate: true });
  });
  it("[C6] flags metadata/byline disagreement without choosing the older date", () => {
    expect(dateEvidence({ metadata: "2000-01-01", byline: "1999-01-01" }, found)).toMatchObject({ value: "2000-01-01", source: "metadata", conflictingDate: true });
  });
  it("[C6] treats an archive-only date as an upper bound, never publication", () => {
    expect(dateEvidence({}, found)).toMatchObject({ kind: "existed_by", source: "wayback_first_capture", conflictingDate: false });
    for (const metadata of ["2000", "2000-02", "02/01/2000", "2000-13-01", "2000-01-01 junk", "2000-01-01T99:00:00Z"]) {
      expect(dateEvidence({ metadata }, { status: "none" }).value).toBeNull();
    }
  });
  it("[C6] pending CDX does not invent a capture or discard publication metadata", () => {
    expect(dateEvidence({ metadata: "2000-01-01" }, { status: "pending" })).toMatchObject({ kind: "published", firstCapture: null });
    expect(dateEvidence({}, { status: "pending" })).toMatchObject({ kind: "unconfirmed", value: null, firstCapture: null });
    expect(() => dateEvidence({}, { ...found, firstCapture: "2001-02-30" })).toThrow();
  });
  it("[C6] dates a T3 version from its own evidence, retaining separate spans and one lineage", async () => {
    const before = structuredClone(original);
    const dated = await versionNode(original, version, { metadata: "2021-01-01" }, {
      firstCapture: async () => ({ data: { status: "found", firstCapture: "2020-02-12", timestamp: "20200212000000" }, usage: {} as never }),
    });
    expect(dated.node).toMatchObject({ id: version.id, versionOf: original.id, clusterId: original.clusterId, spanIds: version.spanIds, date: { kind: "existed_by", value: "2020-02-12", conflictingDate: true } });
    expect(original).toEqual(before);
    expect(Trace.parse({ ...fixture, nodes: fixture.nodes.map(n => n.id === version.id ? dated.node : n) }).nodes).toHaveLength(fixture.nodes.length);
    await expect(versionNode(original, original, {}, {} as never)).rejects.toThrow();
  });
  it("[C6] propagates a typed client failure instead of returning an undated success", async () => {
    await expect(dateNode(original, {}, { firstCapture: async () => { throw new Error("network_error"); } })).rejects.toThrow("network_error");
  });
  it("[C6] replays stored CDX through T10 with the successful-capture filter and new cache identity", async () => {
    const rows = new Map<string, CachedResponse>();
    rows.set(cacheKey({ service: "wayback", url: original.url }), { body: '[["timestamp","original"],["19900101000000","https://a.example/x"]]', credits: 0, contentType: null });
    const usage = createUsageLog();
    usage.append = row => { usage.rows.push(row); };
    let calls = 0;
    const wayback = createWayback({ usage, cache: { get: key => rows.get(key) ?? null, set: (key, val) => { rows.set(key, val); } }, fetch: (async input => {
      calls++;
      const url = new URL(String(input));
      expect(url.searchParams.get("filter")).toBe("statuscode:200");
      expect(url.searchParams.get("url")).toBe(original.url);
      return new Response(readFileSync(new URL("./recorded/wayback/first-capture.json", import.meta.url), "utf8"));
    }) as typeof fetch });
    const a = await dateNode(original, { metadata: "2005-01-01" }, wayback);
    const b = await dateNode(original, { metadata: "2005-01-01" }, wayback);
    expect(a.node.date).toMatchObject({ kind: "existed_by", value: "2001-03-31", conflictingDate: true });
    expect(a.usage).toMatchObject({ service: "wayback", step: "dating", cacheHit: false });
    expect(b.usage).toMatchObject({ cacheHit: true });
    expect(calls).toBe(1);
  });
});
