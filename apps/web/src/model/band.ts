import type { Trace } from "pz/schema";
import { dateToX } from "./scrubber.ts";

export const DOT = 16; // px, one page
const SPACING = DOT + 2; // px, sunflower step: the spiral never sets two dots closer than one step

// One page in a cluster's swarm: its offset from the cluster's centre and its own place in time.
export type Copy = { nodeId: string; dx: number; dy: number; x: number };
// A cluster on the band: placed at its earliest page, a swarm of one dot per page, named by its earliest page's site.
export type Swarm = { id: string; x: number; y: number; domain: string; copies: Copy[]; radius: number };

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// Sunflower packing: the first dot at the centre, each next one a little further out, so a swarm grows with its count
// and never overlaps itself.
export function sunflower(n: number): { dx: number; dy: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const r = SPACING * Math.sqrt(i);
    return { dx: Math.round(r * Math.cos(i * GOLDEN) * 10) / 10, dy: Math.round(r * Math.sin(i * GOLDEN) * 10) / 10 };
  });
}

// Every dated cluster as a swarm, past on the left. Rows alternate so neighbours do not collide. Pages in a swarm are
// ordered oldest first, so the centre dot is the cluster's first page and later copies sit outside it.
export function swarms(trace: Trace): Swarm[] {
  const placed = trace.clusters
    .map((c) => {
      const pages = c.nodeIds
        .map((id) => trace.nodes.find((n) => n.id === id))
        .filter((n): n is Trace["nodes"][number] => Boolean(n && !n.meta && n.date.value))
        .sort((a, b) => a.date.value!.localeCompare(b.date.value!) || a.id.localeCompare(b.id));
      if (pages.length === 0) return null;
      const offsets = sunflower(pages.length);
      const copies = pages.map((n, i) => ({ nodeId: n.id, ...offsets[i]!, x: dateToX(trace, n.date.value!) }));
      const radius = Math.max(...copies.map((p) => Math.hypot(p.dx, p.dy))) + DOT / 2;
      return { id: c.id, x: copies[0]!.x, domain: pages[0]!.domain, copies, radius };
    })
    .filter((s): s is Omit<Swarm, "y"> => s !== null)
    .sort((a, b) => a.x - b.x);
  const rows = [0.62, 0.3, 0.78, 0.46];
  return placed.map((s, i) => ({ ...s, y: rows[i % rows.length]! }));
}

// The swarm's label: its page count, and on the active cluster the site it was first seen on.
export function swarmLabel(s: Swarm, active: boolean): string {
  const count = s.copies.length === 1 ? "1 page" : `${s.copies.length} pages`;
  return active ? `${s.domain}, ${count}` : count;
}
