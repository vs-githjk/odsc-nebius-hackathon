import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dateWords, endingSentence, money, renderCard } from "../src/card/terminal.ts";
import { lintText } from "../src/cli/lint-copy.ts";
import { Trace } from "../src/schema/index.ts";

const dir = new URL("../../../fixtures/traces/", import.meta.url);
const load = (name: string): Trace => Trace.parse(JSON.parse(readFileSync(new URL(`${name}.json`, dir), "utf8")));
const names = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();

describe("T77 readable CLI card", () => {
  it.each(names)("%s renders one plain screen that matches its snapshot", async (name) => {
    const card = renderCard(load(name));
    await expect(card).toMatchFileSnapshot(`__snapshots__/cli-card/${name}.txt`);
    const lines = card.split("\n");
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(78);
    expect(lines.length).toBeLessThanOrEqual(40);
    expect(card).not.toContain("\u001b[");
    expect(lintText(card)).toEqual([]);
  });

  it("shows every field the issue lists, from the trace's own data", () => {
    const t = load("sample-rich");
    const card = renderCard(t);
    for (const part of [t.claim.text.slice(0, 40), "Trail goes cold", "It stopped before searching further back.", "Decision table row 6 of 6",
      "Harbor Zoo annual report 2019", "published 2019-12-15 (page metadata)", t.spans.find((s) => s.nodeId === "zoo-report")!.text.slice(0, 30),
      "https://harborzoo.example/annual-report-2019", "5 pages read, in 4 groups", "42 credits, $0.12, 61 s", "SAMPLE"])
      expect(card.replace(/\n {9}/g, " "), part).toContain(part);
  });

  it("names the failed tool on TOOL_FAILED and lists both earliest pages on CONFLICTING", () => {
    expect(renderCard(load("sample-tool-failed")).replace(/\n {9}/g, " ")).toContain("Tavily search returned http_error 503. Kept: pages read before the failure.");
    const c = renderCard(load("sample-conflicting"));
    expect(c).toContain("Harbor Zoo keeper log, spring 2019");
    expect(c.match(/^ {9}https:/gm)).toHaveLength(2);
    expect(renderCard(load("sample-no-pages"))).toContain("No page to show.");
  });

  it("labels the mode honestly and counts only calls that were not cache hits", () => {
    const t = load("sample-origin");
    const row = { at: t.recordedAt, traceId: t.id, step: "s", endpoint: "chat", model: null, promptTokens: 0, completionTokens: 0, cachedTokens: 0,
      credits: 0, costUsd: 0, latencyMs: 1, status: "200" };
    const live: Trace = { ...t, mode: "REPLAY", synthetic: false, usage: [
      { ...row, service: "tokenfactory", cacheHit: false }, { ...row, service: "tokenfactory", cacheHit: false },
      { ...row, service: "tavily", cacheHit: false }, { ...row, service: "tavily", cacheHit: true }] };
    const card = renderCard(live);
    expect(card).toContain("REPLAY replayed from a recording, no network calls");
    expect(card).toContain("Token Factory 2 calls, Tavily 1 call");
    expect(renderCard(t)).toContain("SAMPLE an invented example, not a real search");
  });

  it("wraps a long scope note to the card width", () => {
    const t = load("sample-origin");
    const note = "Scope: this trace searched the open web through Tavily and archive copies through the Wayback Machine; pages behind logins, PDFs it could not open, and anything never archived are outside what it can see.";
    const lines = renderCard({ ...t, scopeNote: note }).split("\n");
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(78);
    expect(lines.join(" ")).toContain(note);
  });

  it("adds colour only when asked", () => {
    const t = load("sample-origin");
    const coloured = renderCard(t, { color: true });
    expect(coloured).toContain("\u001b[32m");
    expect(coloured.replace(/\u001b\[\d+m/g, "")).toBe(renderCard(t));
  });

  it("words dates, money and endings from fields, never from reason strings", () => {
    const n = load("sample-rich").nodes[0]!;
    expect(dateWords({ ...n, date: { ...n.date, kind: "existed_by", value: "2020-01-02", source: "wayback_first_capture" } })).toBe("online by 2020-01-02 (first archive capture)");
    expect(dateWords({ ...n, date: { ...n.date, kind: "unconfirmed", value: null } })).toBe("date not confirmed");
    expect(dateWords({ ...n, date: { ...n.date, conflictingDate: true } })).toBe("published 2019-12-15 (page metadata, other dates disagree)");
    expect([money(0.12), money(0.0042), money(0)]).toEqual(["$0.12", "$0.0042", "$0.00"]);
    const cold = load("sample-rich");
    expect(endingSentence({ ...cold, earliest: { ...cold.earliest, earlierWindowSearches: 2 } })).toBe("No earlier page and no primary source turned up.");
    expect(endingSentence(load("sample-cold-unread"))).toBe("A page it cites could not be opened.");
    for (const name of names) expect(renderCard(load(name))).not.toContain(load(name).decision.reasons[0] ?? "\u0000");
  });
});
