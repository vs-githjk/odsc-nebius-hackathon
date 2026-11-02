import { z } from "zod";

const probability = z.number().min(0).max(1);
const Option = z.object({ id: z.string().regex(/^[a-z][a-z0-9_]*$/).max(12), label: z.string() }).strict();
export const Question = z.object({
  id: z.enum(["scope_widened", "attribution_shifted", "context_stripped", "page_type"]),
  kind: z.enum(["yesno", "choice"]), options: z.array(Option).min(1), instructions: z.string(),
}).strict().refine(q => new Set(q.options.map(o => o.id)).size === q.options.length, { message: "Option ids must be unique" });
export type Question = z.infer<typeof Question>;
export const TypedAnswer = z.object({
  questionId: z.string(), optionId: z.string(), probability: probability.nullable(),
  top: z.array(z.object({ optionId: z.string(), p: probability }).strict()),
  model: z.string(), threshold: probability.nullable(),
}).strict();
export type TypedAnswer = z.infer<typeof TypedAnswer>;

// T2b owns all wording. Rohan supplies only the fixed ids and placeholders.
export const QUESTIONS: Question[] = [
  ...(["scope_widened", "attribution_shifted", "context_stripped"] as const).map(id => ({
    id, kind: "yesno" as const, options: ["yes", "no"].map(id => ({ id, label: "PENDING" })), instructions: "PENDING",
  })),
  { id: "page_type", kind: "choice", options: ["study", "dataset", "report", "speaker", "news", "blog", "social", "other"].map(id => ({ id, label: "PENDING" })), instructions: "PENDING" },
];

export function questionsToJsonSchema(questions: Question[]) {
  const fields: Record<string, z.ZodEnum<Record<string, string>>> = {};
  for (const question of z.array(Question).parse(questions)) {
    if (Object.hasOwn(fields, question.id)) throw new Error("Duplicate question id: " + question.id);
    const ids = question.options.map(option => option.id);
    const first = ids[0];
    if (first === undefined) throw new Error("Question must have an option");
    fields[question.id] = z.enum([first, ...ids.slice(1)]);
  }
  return z.toJSONSchema(z.object(fields).strict());
}
