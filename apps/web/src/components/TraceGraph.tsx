import type { Trace } from "pz/schema";
import { dateToX, edgeStyle, heat } from "../model/scrubber.ts";

type Disc = { id: string; x: number; y: number; pages: number; nodeIds: string[] };

// One disc per cluster on the time axis, past on the left. Rows alternate so neighbours do not collide.
function discs(trace: Trace): Disc[] {
  const placed = trace.clusters
    .map((c) => {
      const dated = c.nodeIds
        .map((id) => trace.nodes.find((n) => n.id === id))
        .filter((n) => n && !n.meta && n.date.value);
      const first = dated.map((n) => n!.date.value!).sort()[0];
      return first ? { id: c.id, x: dateToX(trace, first), pages: dated.length, nodeIds: c.nodeIds } : null;
    })
    .filter((d): d is Omit<Disc, "y"> => d !== null)
    .sort((a, b) => a.x - b.x);
  const rows = [0.62, 0.3, 0.78, 0.46];
  return placed.map((d, i) => ({ ...d, y: rows[i % rows.length]! }));
}

// The band: clusters as discs, the scrubber's position as a hairline, and everything later than it dimmed to a ring.
export function TraceGraph({ trace, activeSpanId, x }: { trace: Trace; activeSpanId: string | null; x: number }) {
  const all = discs(trace);
  const at = new Map(all.map((d) => [d.id, d]));
  const clusterOf = (nodeId: string) => trace.nodes.find((n) => n.id === nodeId)?.clusterId;
  const activeNode = trace.spans.find((s) => s.id === activeSpanId)?.nodeId;
  const active = activeNode ? clusterOf(activeNode) : undefined;
  const links = trace.edges
    .map((e) => ({ e, a: at.get(clusterOf(e.parentId) ?? ""), b: at.get(clusterOf(e.childId) ?? "") }))
    .filter((l): l is { e: (typeof trace.edges)[number]; a: Disc; b: Disc } => Boolean(l.a && l.b && l.a !== l.b));

  return (
    <figure className="band" aria-label={`${all.length} clusters of pages on a time axis, past on the left`}>
      <div className="band-inner">
        <div className="band-future" style={{ ["--x" as string]: x }} />
        <div className="band-now" style={{ ["--x" as string]: x }} />
        <svg className="band-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {links.map(({ e, a, b }) => {
            const style = edgeStyle(e.kind);
            const mid = (a.x + b.x) * 50;
            return (
              <path
                key={e.id}
                className={`band-link ${e.kind}${e.id === trace.redHopEdgeId ? " red" : ""}`}
                d={`M ${a.x * 100} ${a.y * 100} Q ${mid} ${Math.min(a.y, b.y) * 100 - 6} ${b.x * 100} ${b.y * 100}`}
                strokeDasharray={style.dash === "none" ? undefined : style.dash}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        {all.map((d) => {
          const later = d.x > x + 0.001;
          const size = 14 + 6 * Math.sqrt(d.pages);
          const edge = d.x < 0.12 ? "start" : d.x > 0.88 ? "end" : "middle";
          return (
            <div
              key={d.id}
              className={`disc${d.id === active ? " active" : ""}${later ? " later" : ""}`}
              style={{ ["--x" as string]: d.x, top: `${d.y * 100}%`, ["--disc" as string]: `${size}px`, ["--tone" as string]: heat(d.x) }}
            >
              <span className={`disc-label ${edge}`}>{d.pages === 1 ? "1 page" : `${d.pages} copies`}</span>
              <span className="disc-dot" />
            </div>
          );
        })}
      </div>
      <figcaption className="band-legend">
        <span><i className="key solid" aria-hidden="true" />link-verified</span>
        <span><i className="key dashed" aria-hidden="true" />inferred, no link</span>
        {trace.redHopEdgeId && <span><i className="key red" aria-hidden="true" />wording changed</span>}
      </figcaption>
    </figure>
  );
}
