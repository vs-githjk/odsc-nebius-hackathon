import { useEffect, useState } from "react";
import type { Trace } from "pz/schema";
import { loadTraces } from "../data/loadTraces.ts";
import { recentSession } from "../model/recent.ts";
import { sampleRow } from "../model/sampleRow.ts";

const recorded = loadTraces().traces;
export function RecentTraces({ trace }: { trace: Trace }) {
  const [recent, setRecent] = useState<Trace[]>([]);
  useEffect(() => {
    const session = recentSession();
    session.open(trace);
    setRecent(session.list(recorded, trace.id));
  }, [trace]);
  if (!recent.length) return null;
  return <section className="recent-traces" aria-labelledby="recent-heading">
    <h2 id="recent-heading" className="trace-section-title">Recent traces this session</h2>
    <ul>{recent.map(item => {
      const row = sampleRow(item);
      return <li key={item.id}><a href={`#/t/${encodeURIComponent(item.id)}`}>
        <span className="recent-claim">{item.claim.text}</span>
        <span className="recent-ending"><i className={row.tone ? "ramp-dot" : "ramp-dot empty"} style={{ ["--tone" as string]: row.tone ?? "var(--ink-3)" }} aria-hidden="true" />{row.ending}</span>
      </a></li>;
    })}</ul>
  </section>;
}
