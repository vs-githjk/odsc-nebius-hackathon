import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import { createJevClient, JevInput } from "../../packages/pz/src/clients/jev.ts";
import { QUESTIONS, TypedAnswer } from "../../packages/pz/src/schema/questions.ts";

const Case = JevInput.extend({ baseline: z.object({ answers: z.array(TypedAnswer).length(4), latencyMs: z.number().finite().nonnegative() }).strict() }).strict()
  .refine(c => QUESTIONS.every(q => c.baseline.answers.filter(a => a.questionId === q.id && a.threshold === null &&
    q.options.some(o => o.id === a.optionId)).length === 1), "Baseline must contain each unthresholded owner question once");
type Client = Pick<ReturnType<typeof createJevClient>, "askFour">;
const latency = (values: number[]) => ({ mean: values.reduce((a, b) => a + b, 0) / values.length,
  p50: [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.5) - 1]!,
  p90: [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.9) - 1]! });

export async function compareJev(value: unknown, client: Client, now = () => performance.now()) {
  // Validate the entire private input file before spending anything.
  const cases = z.array(Case).min(1).parse(value);
  const rows: (Awaited<ReturnType<Client["askFour"]>> & { case: number; matches: number;
    jevLatencyMs: number; baselineLatencyMs: number; comparisons: { questionId: string; baseline: string; jev: string }[] })[] = [];
  for (const [index, item] of cases.entries()) {
    const start = now();
    const result = await client.askFour({ earlier: item.earlier, later: item.later, page: item.page });
    const elapsed = Math.max(0, now() - start);
    const comparisons = QUESTIONS.map(q => ({ questionId: q.id,
      baseline: item.baseline.answers.find(a => a.questionId === q.id)!.optionId,
      jev: result.answers.find(a => a.questionId === q.id)!.optionId }));
    // No input text, private case identifier, key, raw response or baseline model string is emitted.
    rows.push({ case: index + 1, comparisons, matches: comparisons.filter(a => a.baseline === a.jev).length,
      jevLatencyMs: elapsed, baselineLatencyMs: item.baseline.latencyMs, answers: result.answers,
      vendorConfidence: result.vendorConfidence, usage: result.usage });
  }
  const matches = rows.reduce((sum, r) => sum + r.matches, 0), questions = rows.length * QUESTIONS.length;
  return { summary: { cases: rows.length, questions, matches, agreement: matches / questions,
    jevLatencyMs: latency(rows.map(r => r.jevLatencyMs)), baselineLatencyMs: latency(rows.map(r => r.baselineLatencyMs)),
    perQuestion: QUESTIONS.map(q => ({ questionId: q.id, matches: rows.filter(r => r.comparisons.some(a => a.questionId === q.id && a.jev === a.baseline)).length, total: rows.length })) }, rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({ options: { inputs: { type: "string" }, model: { type: "string" } } });
    if (!values.inputs) throw new Error();
    const cases: unknown = JSON.parse(readFileSync(values.inputs, "utf8"));
    console.log(JSON.stringify(await compareJev(cases, createJevClient({ model: values.model })), null, 2));
  } catch {
    console.error("Jev comparison failed; check the private input file, credentials and provider status. No input or provider error body is printed.");
    process.exitCode = 1;
  }
}
