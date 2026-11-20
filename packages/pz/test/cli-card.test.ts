import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dateWords, endingSentence, money, renderCard } from "../src/card/terminal.ts";
import { lintText } from "../src/cli/lint-copy.ts";
import { Trace } from "../src/schema/index.ts";

const dir = new URL("../../../fixtures/traces/", import.meta.url);
const failureDir = new URL("../../../fixtures/failure/traces/", import.meta.url);
const load = (name: string): Trace => Trace.parse(JSON.parse(readFileSync(new URL(`${name}.json`, dir), "utf8")));
const loadFailure = (name: string): Trace => Trace.parse(JSON.parse(readFileSync(new URL(`${name}.json`, failureDir), "utf8")));
const names = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
const failureNames = readdirSync(failureDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();

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

  it.each(failureNames)("failure trace %s renders a card that matches its snapshot", async (name) => {
    const card = renderCard(loadFailure(name));
    await expect(card).toMatchFileSnapshot(`__snapshots__/cli-card/${name}.txt`);
    expect(Math.max(...card.split("\n").map((l) => l.length))).toBeLessThanOrEqual(78);
    expect(lintText(card)).toEqual([]);
  });

  it("shows every field the issue lists, from the trace's own data", () => {
    const t = load("sample-rich");
    const card = renderCard(t);
    for (const part of [t.claim.text.slice(0, 40), "Trail goes cold", "It stopped before searching further back.", "Decision table row 6 of 6",
      "Harbor Zoo annual report 2019", "page says published 2019-12-15", t.spans.find((s) => s.nodeId === "zoo-report")!.text.slice(0, 30),
      "https://harborzoo.example/annual-report-2019", "5 pages read, in 4 groups", "$0.34 (42 Tavily credits, $0.00 model), 61 s", "SAMPLE"])
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
    // A replay says when its recording was made (XO on #235).
    expect(card).toMatch(/REPLAY replayed from a recording, no network calls, recorded [A-Z][a-z]{2} \d{1,2}, \d{4}/);
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
    expect(dateWords({ ...n, date: { ...n.date, conflictingDate: true } })).toBe("page says published 2019-12-15 (other dates disagree)");
    // The kind of evidence is always visible: the page's own claim, a registry's record, or only an archive capture.
    const dated = (source: string, kind: "published" | "existed_by" = "published") => dateWords({ ...n, date: { ...n.date, kind, value: "2004-01-20", source, conflictingDate: false } as never });
    expect(dated("metadata")).toBe("page says published 2004-01-20");
    expect(dated("registry_pubmed")).toBe("published 2004-01-20 (PubMed)");
    expect(dated("registry_pmc")).toBe("published 2004-01-20 (PubMed Central)");
    expect(dated("registry_crossref")).toBe("published 2004-01-20 (Crossref)");
    // A partial registry date is worded at the precision it has, never as a full day.
    const partial = (source: string, value: string, precision: "month" | "year") => dateWords({ ...n, date: { ...n.date, kind: "published", value, source, precision, conflictingDate: false } as never });
    expect(partial("registry_pubmed", "2020-12-31", "year")).toBe("published 2020 (PubMed)");
    expect(partial("registry_crossref", "2020-06-30", "month")).toBe("published June 2020 (Crossref)");
    expect(dated("wayback_first_capture", "existed_by")).toBe("online by 2004-01-20 (first archive capture)");
    expect([money(0.12), money(0.0042), money(0)]).toEqual(["$0.12", "$0.0042", "$0.00"]);
    const cold = load("sample-rich");
    expect(endingSentence({ ...cold, earliest: { ...cold.earliest, earlierWindowSearches: 2 } })).toBe("No earlier page and no primary source turned up.");
    expect(endingSentence(load("sample-cold-unread"))).toBe("A page it cites could not be opened.");
    for (const name of names) expect(renderCard(load(name))).not.toContain(load(name).decision.reasons[0] ?? "\u0000");
  });
});

describe("judge card polish (XO on #235)", () => {
  it("says the recorded day in US Eastern time, so a late-evening ET run is not shown as the next day", () => {
    const t = { ...load("sample-origin"), mode: "REPLAY" as const, synthetic: false, recordedAt: "2026-11-18T03:02:00Z" };
    expect(renderCard(t)).toContain("recorded Nov 17, 2026 ET");
  });

  it("shows one earliest page in full, preferring a sentence over page furniture, and names the others on one line", () => {
    const base = load("sample-origin");
    const keeper = base.nodes.find((n) => n.id === base.earliest.nodeIds[0])!;
    const span = base.spans.find((s) => s.nodeId === keeper.id)!;
    const nav = { ...keeper, id: "nav", url: "https://fortune.example/nav", domain: "fortune.example", spanIds: ["s-nav"] };
    const t: Trace = {
      ...base, nodes: [nav, ...base.nodes],
      spans: [{ ...span, id: "s-nav", nodeId: "nav", text: "Home | News | Absurd: CEO says | Markets | 14 times a day" }, ...base.spans],
      earliest: { ...base.earliest, nodeIds: ["nav", ...base.earliest.nodeIds] },
    };
    const card = renderCard(t);
    expect(card).toContain(span.text.slice(0, 40));
    expect(card).not.toContain("Absurd: CEO says");
    expect(card).toMatch(/Also earliest, same date: fortune\.example\./);
  });

  it("on ORIGIN_FOUND shows the page decide picked in full, even when a tied news page is listed first (XO on #236)", () => {
    const base = load("sample-origin");
    expect(base.decision.state).toBe("ORIGIN_FOUND");
    const keeper = base.nodes.find((n) => n.id === base.earliest.nodeIds[0])!;
    const span = base.spans.find((s) => s.nodeId === keeper.id)!;
    const news = {
      ...keeper, id: "tied-news", url: "https://dailynews.example/naps", domain: "dailynews.example", title: "Penguins nap a lot",
      spanIds: ["s-news"], pageType: { ...keeper.pageType!, optionId: "news" },
    };
    const t: Trace = {
      ...base, nodes: [news, ...base.nodes],
      spans: [{ ...span, id: "s-news", nodeId: "tied-news", text: "Reporters were told the penguins nap 14 times a day at the zoo." }, ...base.spans],
      earliest: { ...base.earliest, nodeIds: ["tied-news", ...base.earliest.nodeIds] },
    };
    const card = renderCard(t);
    expect(card).toContain(keeper.url);
    expect(card).toContain(span.text.slice(0, 40));
    expect(card).not.toContain("Reporters were told");
    expect(card).toMatch(/Also earliest, same date: dailynews\.example\./);
  });

  it("on a tie with no origin shows a primary page (dev-10: the WEF report) before a news repeat", () => {
    const t = Trace.parse(JSON.parse(readFileSync(new URL("../../../eval/dev-traces/dev-10.json", import.meta.url), "utf8")));
    const card = renderCard(t);
    const earliest = card.slice(card.indexOf("Earliest"), card.indexOf("Roots"));
    expect(earliest).toContain("www3.weforum.org");
    expect(earliest).toMatch(/Also earliest, same date: environmentaljusticetv\.wordpress\.com\./);
  });

  it("drops the recorded day instead of throwing when recordedAt is not a date (XO on #236)", () => {
    const t = { ...load("sample-origin"), mode: "REPLAY" as const, synthetic: false, recordedAt: "not a date" };
    let card = "";
    expect(() => { card = renderCard(t); }).not.toThrow();
    expect(card).not.toContain("recorded ");
    expect(card.split("\n")[0]).toMatch(/^Patient Zero {2}REPLAY /);
  });
});
