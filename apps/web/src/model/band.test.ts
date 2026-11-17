import { describe, expect, it } from "vitest";
import { loadTraces } from "../data/loadTraces.ts";
import { DOT, sunflower, swarmLabel, swarms } from "./band.ts";

const { traces } = loadTraces();
const byId = (id: string) => traces.find((t) => t.id === id)!;

describe("swarms", () => {
  it("draws every dated page that is not a meta page once, as one dot in its cluster's swarm", () => {
    for (const t of traces) {
      const dots = swarms(t).flatMap((s) => s.copies.map((c) => c.nodeId));
      const pages = t.nodes.filter((n) => !n.meta && n.date.value).map((n) => n.id);
      expect([...dots].sort()).toEqual([...pages].sort());
    }
  });

  it("places a swarm at its earliest page, past on the left, with the oldest page at the centre", () => {
    const rich = swarms(byId("sample-rich"));
    expect(rich.map((s) => s.x)).toEqual([...rich.map((s) => s.x)].sort((a, b) => a - b));
    const news = rich.find((s) => s.id === "c-news")!;
    expect(news.copies.map((c) => c.nodeId)).toEqual(["coast-news", "coast-news-v2"]);
    expect(news.copies[0]).toMatchObject({ dx: 0, dy: 0 });
    expect(news.x).toBe(news.copies[0]!.x);
    expect(news.copies[1]!.x).toBeGreaterThan(news.x);
  });

  it("names the active swarm by the site it was first seen on", () => {
    const news = swarms(byId("sample-rich")).find((s) => s.id === "c-news")!;
    expect(swarmLabel(news, true)).toBe("coastgazette.example, 2 pages");
    expect(swarmLabel(news, false)).toBe("2 pages");
  });
});

describe("sunflower", () => {
  it("never overlaps two dots and grows with the count", () => {
    for (const n of [1, 2, 7, 40]) {
      const p = sunflower(n);
      expect(p).toHaveLength(n);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(Math.hypot(p[i]!.dx - p[j]!.dx, p[i]!.dy - p[j]!.dy)).toBeGreaterThanOrEqual(DOT + 1);
    }
    const reach = (n: number) => Math.max(...sunflower(n).map((q) => Math.hypot(q.dx, q.dy)));
    expect(reach(40)).toBeGreaterThan(reach(7));
  });
});
