import { normalise } from "../rules/normalise.ts";
import { parseNumbers, sameNumber, type ParsedNumber } from "../rules/numbers.ts";
import type { Rules } from "../rules/rules.ts";
import { QUESTIONS, type Question, type TypedAnswer } from "../schema/questions.ts";
import type { Atoms, Edge, Hop, Node, Readout, Span } from "../schema/index.ts";
import { markDisputed } from "../typed/ask.ts";

// T19's ask with the client and threshold already bound. Tests inject the real ask over a recorded client.
export type Ask = (questions: Question[], input: { earlier: string; later: string }) => Promise<TypedAnswer[]>;

const TYPED = QUESTIONS.filter((q) => q.id !== "page_type");
const lower = (text: string) => normalise(text).toLowerCase();
// Word lists match whole words, ignoring case, except "may": only the lowercase modal counts, never the month.
const has = (text: string, phrase: string) => {
  const word = lower(phrase);
  const body = word === "may" ? text : lower(text);
  return new RegExp(String.raw`(?<![\p{L}\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\p{L}\p{N}])`, "u").test(body);
};
const measured = (id: Readout["id"], value: Readout["value"]): Readout => ({ id, source: "measured", value, probability: null, disputed: false });

// The claim's number in this span, or the span's first number when the claim's number is absent.
function numberIn(text: string, atoms: Atoms): ParsedNumber | null {
  const claim = atoms.number ? parseNumbers(atoms.number.canonical).numbers[0] : undefined;
  const numbers = parseNumbers(text).numbers;
  return numbers.find((n) => claim && sameNumber(n, claim).equal) ?? numbers[0] ?? null;
}

// The words right after the number: as many as the claim's unit has, or one when the claim has no unit.
function unitAfter(text: string, n: ParsedNumber, atoms: Atoms): string {
  const count = atoms.unit ? lower(atoms.unit).split(" ").length : 1;
  return text.slice(n.end).replace(/[^\p{L}\p{N}' ]+/gu, " ").trim().split(/\s+/).slice(0, count).join(" ");
}

// Readouts measured by code from the two spans of one hop. A span with no number leaves the number and unit unsure.
export function measuredReadouts(earlier: string, later: string, atoms: Atoms, rules: Rules): Readout[] {
  const [a, b] = [lower(earlier), lower(later)];
  const [na, nb] = [numberIn(a, atoms), numberIn(b, atoms)];
  const [ra, rb] = [normalise(earlier), normalise(later)];
  const both = na && nb ? [na, nb] as const : null;
  const hedged = (t: string) => rules.hedgeWords.some((w) => has(t, w));
  const compares = (t: string) => rules.comparisonWords.some((w) => has(t, w));
  return [
    measured("number_changed", !both ? "unsure" : sameNumber(both[0], both[1]).equal ? "no" : "yes"),
    measured("unit_changed", !both ? "unsure" : unitAfter(a, both[0], atoms) === unitAfter(b, both[1], atoms) ? "no" : "yes"),
    measured("hedge_dropped", hedged(ra) && !hedged(rb) ? "yes" : "no"),
    measured("comparison_added", !compares(ra) && compares(rb) ? "yes" : "no"),
  ];
}

// The three comparison questions, asked once per hop with the passages labelled EARLIER and LATER.
// No plan text pairs a typed question with a code diff, so nothing is marked disputed here.
export async function typedReadouts(earlier: string, later: string, ask: Ask): Promise<Readout[]> {
  const answers = await ask(TYPED, { earlier, later });
  return answers.map((answer) => {
    const { disputed } = markDisputed(answer, null);
    const value = answer.optionId === "yes" || answer.optionId === "no" ? answer.optionId : "unsure";
    return { id: answer.questionId as Readout["id"], source: "inferred", value, probability: answer.probability, disputed };
  });
}

// Word-level LCS diff from the parent span to the child span.
export function wordDiff(a: string[], b: string[]): Hop["wordDiff"] {
  const lcs = a.map(() => b.map(() => 0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    lcs[i]![j] = a[i] === b[j] ? 1 + (lcs[i + 1]?.[j + 1] ?? 0) : Math.max(lcs[i + 1]?.[j] ?? 0, lcs[i]![j + 1] ?? 0);
  const out: Hop["wordDiff"] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { out.push({ op: "same", text: a[i]! }); i++; j++; }
    else if (j < b.length && (i >= a.length || (lcs[i]?.[j + 1] ?? 0) >= (lcs[i + 1]?.[j] ?? 0))) out.push({ op: "add", text: b[j++]! });
    else out.push({ op: "del", text: a[i++]! });
  }
  return out;
}

export const words = (text: string) =>
  lower(text).split(" ").map((w) => w.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "")).filter(Boolean);

// One hop: measured readouts, then typed ones, the word diff, and faithful only when every readout is a plain no.
export async function hopFor(edge: Edge, spans: Span[], atoms: Atoms, rules: Rules, ask: Ask): Promise<Hop> {
  const text = (id: string) => spans.find((s) => s.id === id)?.text ?? "";
  const [earlier, later] = [text(edge.parentSpanId), text(edge.childSpanId)];
  const readouts = [...measuredReadouts(earlier, later, atoms, rules), ...await typedReadouts(earlier, later, ask)];
  return { edgeId: edge.id, readouts, wordDiff: wordDiff(words(earlier), words(later)), faithful: readouts.every((r) => r.value === "no") };
}

// The red hop is the earliest hop, by the child's date, where any readout says yes. Unsure never fires, and neither
// does a disputed yes, because code and model disagree on it. Hops touching a meta page are skipped; ties go by edge id.
export function redHop(hops: Hop[], edges: Edge[], nodes: Node[]): string | null {
  const node = new Map(nodes.map((n) => [n.id, n]));
  const fires = (h: Hop) => h.readouts.some((r) => r.value === "yes" && !r.disputed);
  const candidates = edges.filter((e) => !node.get(e.parentId)?.meta && !node.get(e.childId)?.meta)
    .filter((e) => { const h = hops.find((h) => h.edgeId === e.id); return !!h && fires(h); })
    .map((e) => ({ id: e.id, date: node.get(e.childId)?.date.value ?? "9999" }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return candidates[0]?.id ?? null;
}
