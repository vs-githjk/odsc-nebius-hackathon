import { TokenFactoryError, type ChatData, type ChatInput, type Result } from "../clients/tokenfactory.ts";
import { claimHit, type Rules } from "../rules/index.ts";
import type { Atoms } from "../schema/index.ts";
import type { TypedAnswer } from "../schema/questions.ts";
import { askSameClaim } from "../typed/ask.ts";

type Client = { chat(input: ChatInput): Promise<Result<ChatData>> };

export type SameClaimReason = "no_atom" | "typed_no" | "typed_unsure" | "no_model" | "second_disagrees";
export type SameClaimResult = {
  candidate: boolean; codeHit: boolean; typed: TypedAnswer | null; mode: "model" | "code_only"; reason: SameClaimReason | null;
  // T79: the second model's answer, when rules.secondSameClaimModel is set and the first model said yes.
  second?: TypedAnswer | null;
};

// T36: may this sentence make its page an origin candidate? Two layers, and both must pass.
// 1. Code: the claim's number, in digits or words, with its subject in the same clause (atomHit), or for a claim
//    with no single number its phrase, verbatim and not negated (T53). A miss costs no call.
// 2. The typed same_claim question: "yes" with a known confidence at or above rules.confidenceThreshold.
//    "no", a low-confidence "yes" (turned into "unsure") and a "yes" with no logprobs never make a candidate.
// With no model (no client, or no key), nothing becomes a candidate: mode "code_only", reason "no_model".
// The variant-phrase rule from the spike post-mortem was measured and not shipped (eval/same-claim/README.md).
export async function sameClaim(
  input: { claim: string; sentence: string; atoms: Atoms },
  deps: { client: Client | null; rules: Rules },
): Promise<SameClaimResult> {
  const { confidenceThreshold } = deps.rules;
  if (!claimHit(input.sentence, input.atoms, deps.rules)) {
    return { candidate: false, codeHit: false, typed: null, mode: deps.client ? "model" : "code_only", reason: "no_atom" };
  }
  const offline = { candidate: false, codeHit: true, typed: null, mode: "code_only" as const, reason: "no_model" as const };
  if (!deps.client) return offline;
  let typed: TypedAnswer;
  try {
    typed = await askSameClaim({ claim: input.claim, sentence: input.sentence }, { client: deps.client, threshold: confidenceThreshold });
  } catch (error) {
    if (error instanceof TokenFactoryError && error.code === "not_configured") return offline;
    throw error;
  }
  // ask turns a "yes" below the threshold into "unsure"; a "yes" whose confidence could not be read is not trusted either.
  const yes = typed.optionId === "yes" && typed.probability !== null;
  const reason = yes ? null : typed.optionId === "no" ? "typed_no" : "typed_unsure";
  const model = deps.rules.secondSameClaimModel;
  if (!yes || model === null) return { candidate: yes, codeHit: true, typed, mode: "model", reason };
  // T79: a second model family must agree. It is asked only when the first said yes, so it can only remove an
  // origin, never add one. If it cannot answer (an error or a reply that fails the schema), that counts as unsure.
  let second: TypedAnswer | null = null;
  try { second = await askSameClaim({ claim: input.claim, sentence: input.sentence }, { client: deps.client, threshold: null, model }); }
  catch (error) { if (!(error instanceof TokenFactoryError)) throw error; }
  const agrees = second?.optionId === "yes";
  return { candidate: agrees, codeHit: true, typed, mode: "model", reason: agrees ? null : "second_disagrees", second };
}
