import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const DevClaim = z.object({
  id: z.string().regex(/^dev-\d{2}$/), text: z.string().min(10).max(200), seenAt: z.url(),
  topic: z.string().regex(/^[a-z]+$/), tracedOrigin: z.url().nullable(), tracedBy: z.url().nullable(),
  expected: z.enum(["origin", "cold", "unknown"]),
}).strict();

const load = (file: string) => JSON.parse(readFileSync(new URL(`../../../eval/${file}`, import.meta.url), "utf8"));
const claims = z.array(DevClaim).parse(load("dev-claims.json"));
// E3 (T47): the check set. Same format, its own id prefix. E2 stays the tuning set.
const E3Claim = DevClaim.extend({ id: z.string().regex(/^e3-\d{2}$/), expected: z.enum(["origin", "cold"]) }).strict();
const e3 = z.array(E3Claim).parse(load("dev-claims-e3.json"));

// Words from spike claims 1 to 6 (listed on #5). A dev claim must not be one of them.
const SPIKE = [/goldfish|attention span/i, /bottle of water/i, /body language|tone of voice/i, /google search/i, /water speed record/i, /choline/i];

describe("eval/dev-claims.json (E2)", () => {
  it("holds 20 valid claims with unique ids and texts", () => {
    expect(claims).toHaveLength(20);
    expect(new Set(claims.map((c) => c.id)).size).toBe(20);
    expect(new Set(claims.map((c) => c.text.toLowerCase())).size).toBe(20);
  });
  it("matches none of spike claims 1 to 6", () => {
    for (const c of claims) for (const re of SPIKE) expect(c.text).not.toMatch(re);
  });
  it("uses https URLs only", () => {
    for (const c of claims) for (const u of [c.seenAt, c.tracedOrigin, c.tracedBy]) if (u) expect(u.startsWith("https://")).toBe(true);
  });
  it("has at least 4 claims expected to go cold", () => {
    expect(claims.filter((c) => c.expected === "cold").length).toBeGreaterThanOrEqual(4);
  });
});

describe("eval/dev-claims-e3.json (E3, the check set)", () => {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const urlKey = (u: string) => u.replace(/^https:\/\/(www\.)?/, "").replace(/\/+$/, "").toLowerCase();

  it("holds 40 valid claims with unique ids in order and unique texts", () => {
    expect(e3).toHaveLength(40);
    expect(e3.map((c) => c.id)).toEqual(Array.from({ length: 40 }, (_, i) => `e3-${String(i + 1).padStart(2, "0")}`));
    expect(new Set(e3.map((c) => norm(c.text))).size).toBe(40);
  });
  it("mixes origin and cold claims, about half each", () => {
    const origin = e3.filter((c) => c.expected === "origin").length;
    expect(origin).toBeGreaterThanOrEqual(16);
    expect(40 - origin).toBeGreaterThanOrEqual(16);
  });
  it("gives every origin claim a target and every cold claim the fact-check or provenance page that traced it", () => {
    for (const c of e3) {
      if (c.expected === "origin") expect([c.id, c.tracedOrigin]).not.toEqual([c.id, null]);
      else expect([c.id, c.tracedOrigin, c.tracedBy === null]).toEqual([c.id, null, false]);
    }
  });
  it("never registers the page where a claim circulates as its own origin", () => {
    for (const c of e3) if (c.tracedOrigin) expect(urlKey(c.seenAt)).not.toBe(urlKey(c.tracedOrigin));
  });
  it("shares no claim, origin or wording with E2, and matches none of spike claims 1 to 6", () => {
    const e2Texts = new Set(claims.map((c) => norm(c.text)));
    const e2Origins = new Set(claims.flatMap((c) => (c.tracedOrigin ? [urlKey(c.tracedOrigin)] : [])));
    for (const c of e3) {
      expect(e2Texts.has(norm(c.text))).toBe(false);
      if (c.tracedOrigin) expect(e2Origins.has(urlKey(c.tracedOrigin))).toBe(false);
      for (const re of SPIKE) expect([c.id, c.text]).not.toEqual([c.id, expect.stringMatching(re)]);
    }
  });
  it("uses https URLs only", () => {
    for (const c of e3) for (const u of [c.seenAt, c.tracedOrigin, c.tracedBy]) if (u) expect(u.startsWith("https://")).toBe(true);
  });
});
