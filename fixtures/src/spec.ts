import type { Cluster, Readout, StopState, Trace } from "../../packages/pz/src/schema/index.ts";

export type NodeSpec = {
  page: string; cluster: string; meta?: boolean; versionOf?: string; citesEarlier?: boolean;
  unreadParents?: string[]; evidence?: "observed" | "inferred" | "conflicting" | "unknown"; dateKind?: "unconfirmed";
};

export type FixtureSpec = {
  id: string;
  expect: StopState;                      // the builder fails if decideStopState disagrees
  nodes: NodeSpec[];
  clusters: { id: string; rule: Cluster["rule"] }[];
  edges: { id: string; parent: string; child: string; kind: "explicit" | "inferred"; readouts?: Readout[] }[];
  redHop?: string;
  earliest: { nodeIds: string[]; searches: number; found: number };
  failure?: NonNullable<Trace["failure"]>;
  budget?: Trace["budget"];
};

export const CLAIM = "Harbor Zoo penguins nap 14 times a day, twice as often as the zoo's seals";

const measured = (id: Readout["id"], value: Readout["value"]): Readout => ({ id, source: "measured", value, probability: null, disputed: false });
const inferred = (id: Readout["id"], value: Readout["value"], probability: number, disputed = false): Readout =>
  ({ id, source: "inferred", value, probability, disputed });
export const readout = { measured, inferred };

// The usual three-page chain: keeper log, then the zoo's report, then a news story.
export const CHAIN: Pick<FixtureSpec, "nodes" | "clusters" | "edges"> = {
  nodes: [{ page: "keeper-log", cluster: "c-log" }, { page: "zoo-report", cluster: "c-report" }, { page: "coast-news", cluster: "c-news" }],
  clusters: [{ id: "c-log", rule: "single" }, { id: "c-report", rule: "single" }, { id: "c-news", rule: "single" }],
  edges: [
    { id: "e1", parent: "keeper-log", child: "zoo-report", kind: "explicit", readouts: [measured("hedge_dropped", "no")] },
    { id: "e2", parent: "zoo-report", child: "coast-news", kind: "explicit", readouts: [measured("hedge_dropped", "no")] },
  ],
};
