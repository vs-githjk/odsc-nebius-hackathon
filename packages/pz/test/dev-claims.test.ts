import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const DevClaim = z.object({
  id: z.string().regex(/^dev-\d{2}$/), text: z.string().min(10).max(200), seenAt: z.url(),
  topic: z.string().regex(/^[a-z]+$/), tracedOrigin: z.url().nullable(), tracedBy: z.url().nullable(),
  expected: z.enum(["origin", "cold", "unknown"]),
}).strict();

const claims = z.array(DevClaim).parse(JSON.parse(readFileSync(new URL("../../../eval/dev-claims.json", import.meta.url), "utf8")));

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
