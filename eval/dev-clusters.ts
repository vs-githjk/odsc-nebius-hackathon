import type { createTokenFactoryClient } from "../packages/pz/src/clients/tokenfactory.ts";
import { clusterNodes, computeRoots } from "../packages/pz/src/engine/cluster.ts";
import type { Pipeline } from "../packages/pz/src/engine/run.ts";
import type { Rules } from "../packages/pz/src/rules/rules.ts";
import type { UsageRow } from "../packages/pz/src/schema/index.ts";

type EmbedClient = Pick<ReturnType<typeof createTokenFactoryClient>, "embed">;

export function devClusterStep(client: EmbedClient, rules: Rules): Pipeline["clusters"] {
  return async trace => {
    const usage: UsageRow[] = [];
    const { clusters, clusterOf } = await clusterNodes(
      { nodes: trace.nodes, spans: trace.spans },
      async texts => {
        const result = await client.embed(
          { model: "Qwen/Qwen3-Embedding-8B", input: texts },
          { traceId: trace.id, step: "clusters" },
        );
        usage.push(...result.attempts);
        return result.data.embeddings;
      },
      rules,
    );
    const nodes = trace.nodes.map(node => ({ ...node, clusterId: clusterOf[node.id]! }));
    const dated = nodes.filter(node => !node.meta && node.date.value !== null);
    const earliestDate = dated.map(node => node.date.value!).sort()[0];
    return {
      ...trace,
      nodes,
      clusters,
      roots: computeRoots(nodes, trace.edges),
      earliest: { ...trace.earliest, nodeIds: dated.filter(node => node.date.value === earliestDate).map(node => node.id) },
      usage: [...trace.usage, ...usage],
      budget: { ...trace.budget, usd: trace.budget.usd + usage.reduce((sum, row) => sum + row.costUsd, 0) },
    };
  };
}
