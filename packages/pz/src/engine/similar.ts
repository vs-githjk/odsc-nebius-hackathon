import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TokenFactoryError } from "../clients/tokenfactory.ts";
import type { Result } from "../clients/tokenfactory.ts";
import { isNegated, normalise, parseNumbers, type Rules } from "../rules/index.ts";
import { parseNumberWords } from "../rules/number-words.ts";
import type { Atoms } from "../schema/index.ts";
import type { Embed } from "./cluster.ts";

// T97 (#164): Token Factory embeddings find the copies that keyword rules miss. The model only gives vectors; code
// owns every cutoff (rules.json) and every decision. Two uses:
// - reworded copies: spans whose vectors sit at or above clusterSimilarityThreshold join one cluster (clusterNodes),
//   so the independence count (T94) stops counting a reworded copy as its own root;
// - the same claim with another number: a page that fails the number rules but has a sentence with the claim's
//   subject, a different number, and a vector at or above otherNumberSimilarity. It is listed on the trace and the
//   card as a possible variant ("uses 15, not 14"), never made a node, so it cannot change how a trace ends.

export const EMBED_MODEL = "Qwen/Qwen3-Embedding-8B";
const BATCH = 32;

type EmbedClient = { embed(input: { model: string; input: string[] }, context?: { traceId?: string; step?: string }): Promise<Result<{ embeddings: number[][] }>> };

// Batched and cached by text hash: each distinct text is sent once per cache, in batches of 32, so a replay with a
// warm cache makes no call at all. Usage rows come from the client, one per HTTP attempt.
export function createEmbedder(client: EmbedClient, { cacheDir, traceId }: { cacheDir?: string; traceId?: string } = {}): Embed & { calls: () => number } {
  const memory = new Map<string, number[]>();
  const key = (text: string) => createHash("sha256").update(`${EMBED_MODEL}\u0000${text}`).digest("hex");
  if (cacheDir) mkdirSync(cacheDir, { recursive: true });
  const read = (k: string): number[] | null => {
    if (memory.has(k)) return memory.get(k)!;
    if (!cacheDir) return null;
    try { const v = JSON.parse(readFileSync(join(cacheDir, `${k}.json`), "utf8")) as number[]; memory.set(k, v); return v; } catch { return null; }
  };
  let calls = 0;
  const embed = async (texts: string[]): Promise<number[][]> => {
    const keys = texts.map(key);
    const missing = [...new Set(texts.filter((_, i) => !read(keys[i]!)))];
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH);
      calls++;
      const { data } = await client.embed({ model: EMBED_MODEL, input: batch }, { traceId, step: "embed" });
      if (data.embeddings.length !== batch.length) throw new TokenFactoryError("bad_response", 200, []);
      batch.forEach((text, j) => {
        const k = key(text);
        memory.set(k, data.embeddings[j]!);
        if (cacheDir) writeFileSync(join(cacheDir, `${k}.json`), JSON.stringify(data.embeddings[j]));
      });
    }
    return keys.map((k) => read(k)!);
  };
  return Object.assign(embed, { calls: () => calls });
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  a.forEach((x, i) => { dot += x * (b[i] ?? 0); na += x * x; nb += (b[i] ?? 0) ** 2; });
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const YEAR = /^(?:1[89]|20)\d{2}$/;
const numbersIn = (s: string) => [...parseNumbers(s).numbers, ...parseNumberWords(s)];

// Code's cheap gate before any embedding: the sentence names the claim's subject, is not negated, and carries a
// number (years aside, unless the claim's own number is a year) none of which has the claim's value.
export function otherNumberCandidate(sentence: string, atoms: Atoms, rules: Pick<Rules, "negationPrefixes">): string | null {
  if (!atoms.number || sentence.length > 600) return null;
  const text = normalise(sentence);
  if (!text.toLowerCase().includes(atoms.subjectLemma.toLowerCase())) return null;
  if (isNegated({ contextBefore: "", text }, rules.negationPrefixes)) return null;
  const claimValue = numbersIn(atoms.number.raw)[0]?.value;
  const claimIsYear = YEAR.test(atoms.number.raw);
  const nums = numbersIn(text).filter((n) => claimIsYear || !YEAR.test(n.raw));
  if (!nums.length || nums.some((n) => n.value === claimValue)) return null;
  return nums[0]!.raw;
}

export type OtherNumber = { sentence: string; number: string; similarity: number };

// The page sentence that states the claim with another number, or null. One embedding batch per page: the claim
// plus every sentence that passed code's gate. The best one must reach rules.otherNumberSimilarity.
export async function findOtherNumber(claim: string, atoms: Atoms, sentences: string[], embed: Embed, rules: Pick<Rules, "negationPrefixes" | "otherNumberSimilarity">): Promise<OtherNumber | null> {
  const gated = sentences.map((s) => ({ s, number: otherNumberCandidate(s, atoms, rules) })).filter((c): c is { s: string; number: string } => c.number !== null);
  if (!gated.length) return null;
  const [claimVector, ...vectors] = await embed([claim, ...gated.map((c) => c.s)]);
  const scored = gated.map((c, i) => ({ sentence: c.s, number: c.number, similarity: Math.round(cosine(claimVector!, vectors[i]!) * 1000) / 1000 }));
  const best = scored.sort((a, b) => b.similarity - a.similarity)[0]!;
  return best.similarity >= rules.otherNumberSimilarity ? best : null;
}
