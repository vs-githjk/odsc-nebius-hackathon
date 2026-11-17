import { buildPipeline } from "../packages/pz/src/engine/pipeline.ts";
import type { createTavily } from "../packages/pz/src/clients/tavily.ts";
import type { createTokenFactoryClient } from "../packages/pz/src/clients/tokenfactory.ts";

// The dev runner's default pipeline (DEV_PIPELINE): exactly the stages `pz trace` runs, built on the runner's
// ledger-guarded Token Factory, embedding and Tavily clients. The runner passes `embeddingClient` and `createTavily`
// already capped per attempt and per claim, so this module adds no transport of its own.
export function createPipeline(input: { id: string }, options: {
  chatClient: Pick<ReturnType<typeof createTokenFactoryClient>, "chat">;
  embeddingClient: Pick<ReturnType<typeof createTokenFactoryClient>, "embed">;
  pageFetch?: typeof fetch;
  createTavily: (deps: Parameters<typeof createTavily>[0]) => ReturnType<typeof createTavily>;
}) {
  return buildPipeline({ chat: options.chatClient, embed: options.embeddingClient, tavily: options.createTavily, traceId: input.id, pageFetch: options.pageFetch });
}
