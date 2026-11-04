import { CHAIN, type FixtureSpec } from "../spec.ts";

// One fixture per remaining stop state.
export const sampleOrigin: FixtureSpec = {
  id: "sample-origin", expect: "ORIGIN_FOUND", ...CHAIN,
  earliest: { nodeIds: ["keeper-log"], searches: 2, found: 0 },
};

export const sampleConflicting: FixtureSpec = {
  id: "sample-conflicting", expect: "CONFLICTING",
  nodes: [{ page: "keeper-log", cluster: "c-zoo" }, { page: "zoo-faq", cluster: "c-zoo" }, { page: "zoo-report", cluster: "c-report" }],
  clusters: [{ id: "c-zoo", rule: "same_byline" }, { id: "c-report", rule: "single" }],
  edges: [{ id: "e1", parent: "keeper-log", child: "zoo-report", kind: "explicit" }],
  earliest: { nodeIds: ["keeper-log", "zoo-faq"], searches: 2, found: 0 },
};

export const samplePartial: FixtureSpec = {
  id: "sample-partial", expect: "PARTIAL", ...CHAIN,
  earliest: { nodeIds: ["keeper-log"], searches: 1, found: 0 },
  budget: { credits: 150, usd: 0.21, ms: 140000, capHit: "credits" },
};

export const sampleToolFailed: FixtureSpec = {
  id: "sample-tool-failed", expect: "TOOL_FAILED",
  nodes: [{ page: "zoo-report", cluster: "c-report" }],
  clusters: [{ id: "c-report", rule: "single" }],
  edges: [],
  earliest: { nodeIds: ["zoo-report"], searches: 0, found: 0 },
  failure: { service: "tavily", endpoint: "search", status: "http_error 503", kept: "pages read before the failure" },
};

export const sampleNoPages: FixtureSpec = {
  id: "sample-no-pages", expect: "NO_PAGES_FOUND",
  nodes: [{ page: "myth-page", cluster: "c-meta", meta: true }],
  clusters: [{ id: "c-meta", rule: "single" }],
  edges: [],
  earliest: { nodeIds: [], searches: 2, found: 0 },
};

export const sampleColdUnread: FixtureSpec = {
  id: "sample-cold-unread", expect: "TRAIL_GOES_COLD",
  nodes: [
    { page: "zoo-report", cluster: "c-report", unreadParents: ["https://harborzoo.example/keeper-log-2019"] },
    { page: "coast-news", cluster: "c-news" },
  ],
  clusters: [{ id: "c-report", rule: "single" }, { id: "c-news", rule: "single" }],
  edges: [{ id: "e1", parent: "zoo-report", child: "coast-news", kind: "explicit" }],
  earliest: { nodeIds: ["zoo-report"], searches: 2, found: 0 },
};
