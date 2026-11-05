import type { Trace } from "pz/schema";
import { dateToX, edgeStyle } from "../model/scrubber.ts";

const W = 1000;
const ROW = 46;
const PAD = 28;

// Pages on a time axis, past on the left; one row per cluster, with a count badge; edges labelled by kind.
export function TraceGraph({ trace, activeSpanId }: { trace: Trace; activeSpanId: string | null }) {
  const clusters = trace.clusters.filter((c) => c.nodeIds.some((id) => !trace.nodes.find((n) => n.id === id)?.meta));
  const row = new Map(clusters.map((c, i) => [c.id, i]));
  const placed = trace.nodes
    .filter((n) => !n.meta && n.date.value && row.has(n.clusterId))
    .map((n) => ({ node: n, x: PAD + dateToX(trace, n.date.value!) * (W - 2 * PAD), y: PAD + row.get(n.clusterId)! * ROW }));
  const at = new Map(placed.map((p) => [p.node.id, p]));
  const height = PAD * 2 + Math.max(0, clusters.length - 1) * ROW;
  const active = trace.spans.find((s) => s.id === activeSpanId)?.nodeId;

  return (
    <figure className="graph">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`${placed.length} dated pages in ${clusters.length} clusters, past on the left`}>
        {trace.edges.map((e) => {
          const a = at.get(e.parentId);
          const b = at.get(e.childId);
          if (!a || !b) return null;
          const style = edgeStyle(e.kind);
          return (
            <g key={e.id} className={`edge ${e.kind}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeDasharray={style.dash === "none" ? undefined : style.dash} />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle">{e.kind === "explicit" ? "link" : "inferred"}</text>
              <title>{style.label}</title>
            </g>
          );
        })}
        {clusters.map((c) => {
          const first = placed.filter((p) => p.node.clusterId === c.id).sort((p, q) => p.x - q.x)[0];
          return first && c.nodeIds.length > 1 ? (
            <text key={c.id} className="badge" x={first.x - 14} y={first.y + 4} textAnchor="end">{`${c.nodeIds.length} copies`}</text>
          ) : null;
        })}
        {placed.map(({ node, x, y }) => (
          <g key={node.id} className={`node${node.id === active ? " active" : ""}`}>
            <circle cx={x} cy={y} r={node.id === active ? 9 : 6} />
            <title>{`${node.domain}, ${node.date.value}`}</title>
          </g>
        ))}
      </svg>
      <figcaption className="meta legend">
        <span><svg width="28" height="8" aria-hidden="true"><line x1="0" y1="4" x2="28" y2="4" className="legend-line" /></svg> link-verified</span>
        <span><svg width="28" height="8" aria-hidden="true"><line x1="0" y1="4" x2="28" y2="4" className="legend-line" strokeDasharray="6 5" /></svg> inferred, no link</span>
      </figcaption>
    </figure>
  );
}
