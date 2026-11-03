import type { ChatData } from "../clients/tokenfactory.ts";
import type { Question } from "../schema/questions.ts";

// Cannot collide with a valid lowercase option id, including page_type's "other".
export const OTHER_MASS = "__other__";
export function stringFields(content: string) {
  const matches = [...content.matchAll(/"(?:\\.|[^"\\])*"/g)];
  const fields = [];
  for (let i = 0; i + 1 < matches.length; i += 2) {
    const key = matches[i]!, value = matches[i + 1]!;
    fields.push({ id: JSON.parse(key[0]) as string, value: JSON.parse(value[0]) as string, offset: value.index! + 1 });
  }
  return fields;
}

export function confidenceFor(question: Question, content: string, logprobs: ChatData["logprobs"]) {
  const unavailable = { probability: null, top: [] };
  if (!logprobs?.content.length) return unavailable;
  const joined = logprobs.content.map(t => t.token).join("");
  // The recorded provider emits a terminal control token after the JSON text.
  if (joined !== content && joined !== content + "<|im_end|>") return unavailable;
  let field;
  try { field = stringFields(content).find(f => f.id === question.id); } catch { return unavailable; }
  if (!field) return unavailable;
  let offset = 0;
  for (const token of logprobs.content) {
    const end = offset + token.token.length;
    if (offset <= field.offset && field.offset < end) {
      const prefix = token.token.slice(0, field.offset - offset);
      const mass = new Map(question.options.map(o => [o.id, 0]));
      const seen = new Set<string>();
      const selectedPiece = token.token.slice(prefix.length).split('"')[0]!;
      const ambiguous = question.options.filter(o => selectedPiece && o.id.startsWith(selectedPiece)).length > 1;
      let usable = 0, total = 0;
      for (const alternative of token.top_logprobs) {
        if (alternative.logprob === -9999 || !Number.isFinite(alternative.logprob) || alternative.logprob > 0 || seen.has(alternative.token)) continue;
        seen.add(alternative.token); usable++;
        const p = Math.exp(alternative.logprob);
        total += p;
        const piece = alternative.token.startsWith(prefix) ? alternative.token.slice(prefix.length).split('"')[0]! : "";
        const matches = piece ? question.options.filter(o => o.id.startsWith(piece)) : [];
        if (matches.length === 1) mass.set(matches[0]!.id, mass.get(matches[0]!.id)! + p);
      }
      if (!usable || total > 1 + 1e-6) return unavailable;
      const scale = Math.max(1, total);
      for (const [id, p] of mass) mass.set(id, p / scale);
      const known = [...mass.values()].reduce((a, b) => a + b, 0);
      const top = [...mass].map(([optionId, p]) => ({ optionId, p }));
      top.push({ optionId: OTHER_MASS, p: Math.max(0, 1 - known) });
      return { probability: ambiguous ? null : mass.get(field.value) ?? null, top };
    }
    offset = end;
  }
  return unavailable;
}
