import { decideStopState, loadRules, normalise, parseNumbers, sameNumber, type Rules } from "../rules/index.ts";
import type { Trace } from "../schema/index.ts";

export type FalseCertainty = { originOnCold: number; typedWithoutInferred: number; sentenceStrongerThanSpans: number; undatedShownDated: number };

const TYPED = new Set(["scope_widened", "attribution_shifted", "context_stripped"]);

// Things the card sentence says that no span backs: numbers, quoted text and capitalised names (after the first word).
export function unbacked(sentence: string, spans: string[]): { numbers: string[]; quotes: string[]; names: string[] } {
  const text = spans.map((s) => normalise(s)).join("\n");
  const spanNumbers = parseNumbers(text).numbers;
  const numbers = parseNumbers(sentence).numbers.filter((n) => !spanNumbers.some((m) => sameNumber(n, m).equal)).map((n) => n.raw);
  const quotes = [...normalise(sentence).matchAll(/"([^"]+)"/g)].filter((m) => !text.includes(m[1]!)).map((m) => m[1]!);
  const names = normalise(sentence).split(" ").slice(1).map((w) => w.replace(/[^\p{L}']/gu, ""))
    .filter((w) => /^\p{Lu}/u.test(w) && !text.includes(w));
  return { numbers, quotes, names };
}

// Each counter must be 0. The trace has no card sentence until T28, so it is passed in when there is one.
export function falseCertainty(trace: Trace, opts: { cardSentence?: string; rules?: Rules } = {}): FalseCertainty {
  const recomputed = decideStopState(trace, opts.rules ?? loadRules());
  return {
    originOnCold: trace.decision.state === "ORIGIN_FOUND" && recomputed.state !== "ORIGIN_FOUND" ? 1 : 0,
    typedWithoutInferred: trace.hops.flatMap((h) => h.readouts).filter((r) => TYPED.has(r.id) && r.source !== "inferred").length,
    sentenceStrongerThanSpans: opts.cardSentence ? Object.values(unbacked(opts.cardSentence, trace.spans.map((s) => s.text))).flat().length : 0,
    undatedShownDated: trace.nodes.filter((n) => n.date.kind === "unconfirmed" && n.date.value !== null).length,
  };
}
