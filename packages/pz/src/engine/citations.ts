import type { Rules } from "../rules/index.ts";
import { atomHit, normalise } from "../rules/index.ts";
import type { Atoms } from "../schema/index.ts";

// What a page cites, ranked by how strongly the text around each citation is about the claim (T44).
// The weights are plain and fixed, not tuned on any claim set:
//   beside the span (within REACH characters)                 +3
//   the citation's own context states the claim's atoms       +3
//   otherwise, its context names the subject                  +1
//   a scholarly address (DOI, PubMed, PMC, arXiv)             +2
// A citation is followed only at FOLLOW_MIN_SCORE or above: beside the span, or with the claim stated around it.
export const REACH = 150;
export const FOLLOW_MIN_SCORE = 3;

export type Citation = { url: string; score: number; near: boolean; kind: "link" | "doi" | "pmid" };

const SCHOLARLY = /^(?:dx\.)?doi\.org$|^pubmed\.ncbi\.nlm\.nih\.gov$|^(?:www\.)?ncbi\.nlm\.nih\.gov$|^arxiv\.org$/;
// Buttons that share or mail the page, never sources.
const JUNK = /^(?:twitter\.com|x\.com)\/(?:intent|share)|^(?:www\.)?facebook\.com\/sharer|^(?:www\.)?linkedin\.com\/share|^(?:www\.)?reddit\.com\/submit|^api\.whatsapp\.com\/send|^wa\.me\/|^(?:www\.)?pinterest\.com\/pin\/create/;
const DOI = /\b(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[^\s"<>()\];,]+[^\s"<>()\];,.])/gi;
const PMID = /\bPMID:?\s*(\d{5,9})\b/g;

const canon = (url: string) => url.replace(/#.*$/, "").replace(/\/$/, "");
const hostPath = (u: URL) => `${u.hostname.replace(/^www\./, "")}${u.pathname}`;
// A page's identity for the self-link check: no www, no query, no fragment, no trailing slash.
const pageOf = (u: URL) => `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;

export function citationsIn(input: {
  text: string;
  links: { href: string; start: number; end: number }[];
  // Paragraph breaks from toPlain: a citation beside the span must also share its paragraph.
  breaks?: number[];
  pageUrl: string;
  span: { start: number; end: number };
  atoms: Atoms;
  rules: Rules;
}): Citation[] {
  const { text, pageUrl, span, atoms, rules } = input;
  const lemma = normalise(atoms.subjectLemma).toLowerCase();
  const variants = atoms.variants.map((v) => normalise(v).toLowerCase());
  const factCheck = (host: string) => rules.factCheckDomains.some((d) => host === d || host.endsWith(`.${d}`));
  const breaks = input.breaks ?? [];
  const paraStart = Math.max(0, ...breaks.filter((b) => b <= span.start));
  const paraEnd = Math.min(Number.POSITIVE_INFINITY, ...breaks.filter((b) => b > span.start));
  // Beside the span means within reach and in the same paragraph, so a menu row after a blank line is never near.
  const isNear = (start: number, end: number) =>
    end >= span.start - REACH && start <= span.end + REACH && start >= paraStart && end <= paraEnd;

  // A citation's context stays inside its own paragraph: the claim sentence above a menu row is not the menu's context.
  const paragraphOf = (at: number): [number, number] => [
    Math.max(0, ...breaks.filter((b) => b <= at)),
    Math.min(text.length, ...breaks.filter((b) => b > at)),
  ];
  const score = (start: number, end: number, url: URL) => {
    const [ps, pe] = paragraphOf(start);
    const context = text.slice(Math.max(ps, start - REACH), Math.min(pe, end + REACH));
    const lower = normalise(context).toLowerCase();
    const aboutClaim = atomHit(context, atoms, rules.weakNumberMinSigDigits) || variants.some((v) => v && lower.includes(v));
    return (isNear(start, end) ? 3 : 0) + (aboutClaim ? 3 : lower.includes(lemma) ? 1 : 0) + (SCHOLARLY.test(url.hostname) ? 2 : 0);
  };

  const found = new Map<string, Citation>();
  const add = (href: string, start: number, end: number, kind: Citation["kind"]) => {
    let url: URL;
    try {
      url = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (!url.protocol.startsWith("http") || JUNK.test(hostPath(url)) || factCheck(url.hostname.replace(/^www\./, ""))) return;
    const key = canon(url.href);
    if (pageOf(url) === pageOf(new URL(pageUrl))) return;
    const c: Citation = { url: key, score: score(start, end, url), near: isNear(start, end), kind };
    const prior = found.get(key);
    if (c.score >= FOLLOW_MIN_SCORE && (!prior || c.score > prior.score)) found.set(key, c);
  };

  for (const l of input.links) add(l.href, l.start, l.end, "link");
  // Identifiers written as text, only beside the span: they are how papers cite each other.
  const window = { start: Math.max(0, span.start - REACH), end: span.end + REACH };
  const near = text.slice(window.start, window.end);
  for (const m of near.matchAll(DOI)) add(`https://doi.org/${m[1]}`, window.start + m.index, window.start + m.index + m[0].length, "doi");
  for (const m of near.matchAll(PMID)) add(`https://pubmed.ncbi.nlm.nih.gov/${m[1]}`, window.start + m.index, window.start + m.index + m[0].length, "pmid");

  // Best first; ties keep the order they appear on the page.
  return [...found.values()].sort((a, b) => b.score - a.score);
}

const SOURCE_PHRASE = /\b(?:according to|a study by|a report by|a survey by|research by|researchers at|data from|published by|reported by)\s+/gi;
const CONNECTOR = new Set(["of", "for", "and", "on", "the"]);
const YEAR = /^\d{4}$/;

// Organisations named as a sentence's source ("according to the Harbor Zoo Annual Report"), to search for by name.
export function namedSources(sentence: string): string[] {
  const names: string[] = [];
  for (const m of sentence.matchAll(SOURCE_PHRASE)) {
    const tokens = sentence.slice(m.index + m[0].length).split(/\s+/);
    if (tokens[0]?.toLowerCase() === "the") tokens.shift();
    const name: string[] = [];
    for (const raw of tokens.slice(0, 10)) {
      const word = raw.replace(/[^\p{L}\p{N}'-]/gu, "");
      const capital = /^\p{Lu}/u.test(word);
      if (!word || (!capital && !CONNECTOR.has(word) && !YEAR.test(word))) break;
      if (name.length === 0 && !capital) break;
      name.push(word);
      if (word !== raw) break; // punctuation after the word ends the name
    }
    while (name.length && CONNECTOR.has(name.at(-1)!)) name.pop();
    if (name.length) names.push(name.join(" "));
  }
  return [...new Set(names)];
}
