import { TokenFactoryError, type ChatData, type ChatInput, type Result } from "../clients/tokenfactory.ts";
import { decideStopState, type Rules } from "../rules/index.ts";
import type { Trace } from "../schema/index.ts";
import { askBoundary } from "../typed/ask.ts";

type Client = { chat(input: ChatInput): Promise<Result<ChatData>> };

// T37: for the pipeline. When a finished trace goes cold, ask the boundary question about each earliest page (one
// call each), store the answers on the nodes, and decide again. Code still picks the ending (rules/boundary.ts).
// A trace that does not end TRAIL_GOES_COLD is returned as it is, with no call made; with no key, nothing is asked.
export async function withBoundaries(trace: Trace, { client, rules }: { client: Client | null; rules: Rules }): Promise<Trace> {
  if (!client || decideStopState(trace, rules).state !== "TRAIL_GOES_COLD") return trace;
  const nodes = [...trace.nodes];
  for (const id of trace.earliest.nodeIds) {
    const i = nodes.findIndex((n) => n.id === id);
    const span = trace.spans.find((s) => s.nodeId === id);
    if (i < 0 || !span || nodes[i]!.meta) continue;
    try {
      const boundary = await askBoundary({ claim: trace.claim.text, sentence: span.text, text: `${span.contextBefore}${span.text}${span.contextAfter}` },
        { client, threshold: rules.confidenceThreshold });
      nodes[i] = { ...nodes[i]!, boundary };
    } catch (error) {
      if (error instanceof TokenFactoryError && error.code === "not_configured") return trace;
      throw error;
    }
  }
  const asked = { ...trace, nodes };
  return { ...asked, decision: decideStopState(asked, rules) };
}
