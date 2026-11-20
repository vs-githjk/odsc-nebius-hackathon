import type { Trace } from "pz/schema";
import { rootRows, type pageReceipt } from "../model/roots.ts";

type Receipt = ReturnType<typeof pageReceipt>;
export function PageReceipt({ page }: { page: Receipt }) {
  return <><a href={page.node.url} target="_blank" rel="noreferrer">{page.host}</a><span>{page.date}</span>{page.node.date.value && <span className="page-proof">{page.evidence.url ? <a href={page.evidence.url} target="_blank" rel="noreferrer">{page.evidence.label}</a> : page.evidence.label}</span>}</>;
}
export function Roots({ trace }: { trace: Trace }) {
  const { counts, rows, unrooted } = rootRows(trace);
  if (!counts.pages) return <p className="meta">No pages with the claim were recorded.</p>;
  return <>
    <p className="roots-measure"><span><b>{counts.pages}</b> {counts.pages === 1 ? "page" : "pages"},</span>{" "}<span><b>{counts.independentRoots}</b> independent {counts.independentRoots === 1 ? "root" : "roots"},</span>{" "}<span><b>{counts.copies}</b> {counts.copies === 1 ? "copy" : "copies"}</span></p>
    <ul className="root-rows">{rows.map(row => <li key={row.node.id}>
      <div className="root-page"><PageReceipt page={row} /></div>
      {row.inferred.map(text => <p className="root-relation inferred" key={text}>{text}</p>)}
      {row.copies.length > 0 && <ul className="root-copies">{row.copies.map(copy => <li key={copy.node.id}><p className="root-relation">{copy.relation}</p><div className="root-page"><PageReceipt page={copy} /></div></li>)}</ul>}
    </li>)}</ul>
    {unrooted.length > 0 && <div><p>Linked pages with no independent root</p>{unrooted.map(page => <div className="root-page" key={page.node.id}><PageReceipt page={page} /></div>)}</div>}
  </>;
}
