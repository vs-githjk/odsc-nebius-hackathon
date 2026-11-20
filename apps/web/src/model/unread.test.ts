import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Trace } from "pz/schema";
import { unreadParents, unreadSplit } from "./unread.ts";

const trace = Trace.parse(JSON.parse(readFileSync("eval/dev-traces/dev-10.json", "utf8")));

describe("unreadParents", () => {
  it("finds both dev-10 citations on a node that only discusses the claim", () => {
    const entries = unreadParents(trace);
    expect(entries).toHaveLength(2);
    expect(entries.map(entry => entry.host)).toEqual(["media.greenpeace.org", "cavite.gov.ph"]);
    expect(entries.map(entry => entry.url)).toEqual([
      "https://media.greenpeace.org/archive/Whale-Art-Installation-in-the-Philippines-27MZIFJJULTID.html",
      "https://cavite.gov.ph/home/cities-and-municipalities/municipality-of-naic",
    ]);
    expect(entries.every(entry => entry.citedBy.join() === "www.snopes.com")).toBe(true);
    expect(trace.nodes.filter(node => node.meta).some(node => node.candidateParents.some(parent => !parent.read))).toBe(true);
    if (trace.decision.counts) expect(entries.length).toBe(trace.decision.counts.unreadParents);
  });
  it("deduplicates URLs across all nodes and keeps the citing hosts", () => {
    const original = trace.nodes.find(node => node.candidateParents.some(parent => !parent.read))!;
    const repeated = { ...original, id: "duplicate", url: "https://another.example/article" };
    const entries = unreadParents({ ...trace, nodes: [...trace.nodes, repeated, repeated] });
    expect(entries).toHaveLength(2);
    expect(entries.every(entry => entry.citedBy.join() === "www.snopes.com,another.example")).toBe(true);
  });
  it("omits read parents and handles an empty trace", () => {
    expect(unreadParents({ ...trace, nodes: [] })).toEqual([]);
    expect(unreadParents({ ...trace, nodes: trace.nodes.map(node => ({ ...node, candidateParents: node.candidateParents.map(parent => ({ ...parent, read: true })) })) })).toEqual([]);
  });
});

describe("unreadSplit (the decision's own bearingNodes)", () => {
  it("sets aside both dev-10 citations under Origin found: they come from an off-topic fact-check", () => {
    expect(trace.decision.state).toBe("ORIGIN_FOUND");
    const { counted, setAside } = unreadSplit(trace);
    expect(counted).toEqual([]);
    expect(setAside.map(p => p.host).sort()).toEqual(["cavite.gov.ph", "media.greenpeace.org"]);
    expect(setAside.every(p => p.citedBy.includes("www.snopes.com"))).toBe(true);
  });
  it("counts an unread citation from a non-meta page", () => {
    const nodes = trace.nodes;
    const page = nodes.find(n => !n.meta)!;
    const withUnread = { ...trace, nodes: nodes.map(n => n.id === page.id ? { ...n, candidateParents: [...n.candidateParents, { url: "https://older.example/report", read: false }] } : n) };
    expect(unreadSplit(withUnread).counted.map(p => p.url)).toContain("https://older.example/report");
  });
});
