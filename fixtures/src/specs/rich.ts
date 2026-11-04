import { readout, type FixtureSpec } from "../spec.ts";

const { measured, inferred } = readout;

// TRAIL_GOES_COLD with everything the UI shows: 4 clusters, 5 hops between them, one red hop,
// one disputed readout, one inferred edge, one version pair and one meta page.
export const sampleRich: FixtureSpec = {
  id: "sample-rich",
  expect: "TRAIL_GOES_COLD",
  nodes: [
    { page: "zoo-report", cluster: "c-report" },
    { page: "coast-news", cluster: "c-news" },
    { page: "coast-news-v2", cluster: "c-news", versionOf: "coast-news" },
    { page: "trivia-blog", cluster: "c-blog", evidence: "inferred" },
    { page: "social-post", cluster: "c-social" },
    { page: "myth-page", cluster: "c-meta", meta: true },
  ],
  clusters: [
    { id: "c-report", rule: "single" }, { id: "c-news", rule: "versions" }, { id: "c-blog", rule: "single" },
    { id: "c-social", rule: "single" }, { id: "c-meta", rule: "single" },
  ],
  edges: [
    { id: "e1", parent: "zoo-report", child: "coast-news", kind: "explicit", readouts: [measured("hedge_dropped", "yes")] },
    {
      id: "e2", parent: "zoo-report", child: "trivia-blog", kind: "inferred", readouts: [
        measured("hedge_dropped", "yes"), measured("comparison_added", "yes"), inferred("scope_widened", "yes", 0.81),
        inferred("attribution_shifted", "unsure", 0.55), inferred("context_stripped", "yes", 0.62, true),
      ],
    },
    { id: "e3", parent: "coast-news-v2", child: "social-post", kind: "explicit", readouts: [measured("comparison_added", "no")] },
    { id: "e4", parent: "trivia-blog", child: "social-post", kind: "explicit", readouts: [inferred("attribution_shifted", "yes", 0.74)] },
    { id: "e5", parent: "coast-news-v2", child: "trivia-blog", kind: "explicit", readouts: [inferred("attribution_shifted", "yes", 0.77)] },
  ],
  redHop: "e2",
  earliest: { nodeIds: ["zoo-report"], searches: 1, found: 0 },
  budget: { credits: 42, usd: 0.12, ms: 61000, capHit: null },
};
