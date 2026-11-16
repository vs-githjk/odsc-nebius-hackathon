import { computeRoots } from "../engine/cluster.ts";
import type { Trace } from "../schema/index.ts";

// T94: the headline every trace leads with, from code only: how many pages, how many independent roots, which one
// is the origin, and how many copies. "1 origin" appears only on ORIGIN_FOUND; every other ending names no origin.
// Traces from before T94 have no stored counts, so they are derived from the nodes and edges here, the same way.
export function independence(trace: Pick<Trace, "roots" | "nodes" | "edges">): { pages: number; independentRoots: number; copies: number } {
  const r = trace.roots.independentRoots !== undefined && trace.roots.copies !== undefined ? trace.roots : computeRoots(trace.nodes, trace.edges);
  return { pages: r.pages, independentRoots: r.independentRoots!, copies: r.copies! };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function independenceLine(trace: Pick<Trace, "roots" | "nodes" | "edges" | "decision">): string {
  const { pages, independentRoots, copies } = independence(trace);
  if (pages === 0) return "Found on no pages.";
  const origin = trace.decision.state === "ORIGIN_FOUND" ? ", 1 origin" : "";
  const tail = copies === 0 ? "No copies." : copies === 1 ? "1 is a copy." : `${copies} are copies.`;
  return `Found on ${plural(pages, "page")}: ${plural(independentRoots, "independent root")}${origin}. ${tail}`;
}
