import { ENDING_NAMES } from "../model/sampleRow.ts";
const explanations = {
  ORIGIN_FOUND: "The earliest page we found meets the origin rules. This does not establish the first use anywhere.",
  CONFLICTING: "The earliest pages disagree, so the trace cannot name one origin.",
  TRAIL_GOES_COLD: "We found the claim, but could not link it further back. A source may be in print, behind a paywall, missing or uncited.",
  PARTIAL: "A time, search or spending limit stopped the trace before it finished.",
  TOOL_FAILED: "A needed search service failed. The trace keeps the evidence gathered so far.",
  NO_PAGES_FOUND: "The searches found no usable pages for this claim.",
};
export function HowItWorks() {
  return <main className="wrap section stack">
    <h1>How it works</h1>
    <p>Patient Zero walks a claim back through time to the earliest page it can find. It searches, reads pages, checks dates and compares quoted wording. Each ending follows rules applied to the evidence.</p>
    <p>A live trace runs real searches and model calls. It usually costs a few cents and takes about 40 seconds, but can take nearly five minutes. Its result shows the recorded cost. Recorded traces open free.</p>
    <p>The earliest page we find is limited by what is available on the web. Missing citations, circular references, inaccessible pages and search limits can stop a trail cold.</p>
    <dl>{Object.entries(explanations).map(([state, text]) => <div key={state}><dt><strong>{ENDING_NAMES[state as keyof typeof ENDING_NAMES]}</strong></dt><dd>{text}</dd></div>)}</dl>
    <a href="#/">Try a claim</a>
  </main>;
}
