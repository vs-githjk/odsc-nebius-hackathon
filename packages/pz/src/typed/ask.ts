import { TokenFactoryError, type ChatInput, type ChatData, type Result } from "../clients/tokenfactory.ts";
import { BOUNDARY, Question, SAME_CLAIM, TypedAnswer, questionsToJsonSchema } from "../schema/questions.ts";
import { confidenceFor, stringFields } from "./logprobs.ts";

type Client = { chat(input: ChatInput): Promise<Result<ChatData>> };
type Input = string | { earlier: string; later: string; page?: string };
type Options = { client: Client; threshold: number | null };
const MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";

export async function ask(questions: Question[], input: Input, { client, threshold }: Options): Promise<TypedAnswer[]> {
  if (threshold !== null && (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)) throw new TokenFactoryError("bad_response");
  // Validate every input before any paid call. Page classification is independent.
  questionsToJsonSchema(questions);
  const pairs = questions.filter(q => q.id !== "page_type");
  const pages = questions.filter(q => q.id === "page_type");
  if (pairs.length && (typeof input === "string" || typeof input.earlier !== "string" || typeof input.later !== "string")) throw new TokenFactoryError("bad_response");
  const page = typeof input === "string" ? input : input.page;
  if (pages.length && typeof page !== "string") throw new TokenFactoryError("bad_response");
  const answers: TypedAnswer[] = [];
  if (pairs.length && typeof input !== "string") answers.push(...await askBatch(pairs, JSON.stringify({ EARLIER: input.earlier, LATER: input.later }), { client, threshold }));
  if (pages.length) answers.push(...await askBatch(pages, page!, { client, threshold }));
  return questions.map(q => answers.find(a => a.questionId === q.id)!);
}

// T36: the same_claim question for one sentence, asked on its own. The claim and sentence travel as data in source_text.
export async function askSameClaim(input: { claim: string; sentence: string }, { client, threshold }: Options): Promise<TypedAnswer> {
  if (threshold !== null && (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)) throw new TokenFactoryError("bad_response");
  if (typeof input?.claim !== "string" || typeof input.sentence !== "string") throw new TokenFactoryError("bad_response");
  return (await askBatch([SAME_CLAIM], JSON.stringify({ CLAIM: input.claim, SENTENCE: input.sentence }), { client, threshold }))[0]!;
}

// T37: the boundary question for the earliest page of a cold trace.
export async function askBoundary(input: { claim: string; sentence: string; text: string }, { client, threshold }: Options): Promise<TypedAnswer> {
  if (threshold !== null && (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)) throw new TokenFactoryError("bad_response");
  return (await askBatch([BOUNDARY], JSON.stringify({ CLAIM: input.claim, SENTENCE: input.sentence, TEXT: input.text }), { client, threshold }))[0]!;
}

async function askBatch(questions: Question[], content: string, { client, threshold }: Options): Promise<TypedAnswer[]> {
  // Serialize the owner's questions without rewriting instructions or labels.
  const jsonSchema = questionsToJsonSchema(questions);
  const result = await client.chat({ model: MODEL, messages: [
    { role: "system", content: JSON.stringify(questions) }, { role: "user", content: JSON.stringify({ source_text: content }) },
  ], jsonSchema, logprobs: true, topLogprobs: 5, maxTokens: 512 });
  let parsed: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(result.data.content);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    parsed = value as Record<string, unknown>;
    const fields = stringFields(result.data.content);
    if (fields.length !== questions.length || new Set(fields.map(f => f.id)).size !== fields.length || Object.keys(parsed).length !== questions.length) throw new Error();
    for (const question of questions) if (!question.options.some(o => o.id === parsed[question.id])) throw new Error();
  } catch { throw new TokenFactoryError("bad_response", 200, result.attempts); }
  return questions.map(question => {
    const confidence = confidenceFor(question, result.data.content, result.data.logprobs);
    const optionId = confidence.probability !== null && threshold !== null && confidence.probability < threshold ? "unsure" : parsed[question.id] as string;
    return TypedAnswer.parse({ questionId: question.id, optionId, ...confidence, model: result.data.model, threshold });
  });
}

// Keep the schema's TypedAnswer intact; the readout caller owns disputed.
export function markDisputed(answer: TypedAnswer, codeDiff: boolean | "yes" | "no" | "unsure" | null) {
  const code = typeof codeDiff === "boolean" ? codeDiff ? "yes" : "no" : codeDiff;
  return { answer, disputed: (answer.optionId === "yes" || answer.optionId === "no") && (code === "yes" || code === "no") && answer.optionId !== code };
}
