import { ClientError } from "../clients/errors.ts";
import type { CaptureBody, CaptureVersions, FirstCapture } from "../clients/wayback.ts";
import type { Result } from "../clients/http.ts";
import { loadRules, normalise } from "../rules/index.ts";
import { isNegated } from "../rules/negation.ts";

// L19: a first archive capture dates a URL, not a sentence. A page may carry the date only if that capture holds the claim.
export type CaptureChecker = {
  captureBody?: (url: string, timestamp: string, opts?: { step?: string }) => Promise<Result<CaptureBody>>;
  captureVersions?: (url: string, opts?: { step?: string }) => Promise<Result<CaptureVersions>>;
};
export type FoundCapture = Extract<FirstCapture, { status: "found" }>;
export type CaptureVerdict = { holds: boolean; why: string; usage: Result<unknown>["usage"][] };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", rdquo: "\"", ldquo: "\"", ndash: "-", mdash: "-", hellip: "..." };

// The words of a page as the dating check compares them: tags gone (for markup), entities decoded, lower case, letters
// and digits only. Plain text (a PDF's, a .txt) keeps its angle brackets.
export function wordsOf(source: string, markup = true, ligatures = false): string {
  const stripped = !markup ? source : source
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?(?:a|b|i|u|em|strong|span|small|mark|abbr|cite|font|code)\b[^>]*>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_m, e: string) => {
      if (e[0] === "#") {
        const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : " ";
      }
      return ENTITIES[e.toLowerCase()] ?? " ";
    });
  // A PDF's ligature glyphs come out as control codes ("bene\u001fts"). In a word that holds such a code, the code goes and
  // the letter pairs fi, fl, ff, ffi, ffl go with it; every other word is left as it is. pageHoldsSpan compares a span's
  // words in both forms, so "benefits" meets the PDF's "benets" while "fiat" never meets a plain "flat".
  const glyphs = ligatures ? stripped.replace(/\S*[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]\S*/g, (token) => foldLigatures(token.replace(CONTROL, "").toLowerCase())) : stripped;
  return ` ${normalise(glyphs).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
}

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const foldLigatures = (word: string) => word.replace(/ffi|ffl|ff|fi|fl/g, "");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A match needs at least this many words: a short phrase can sit in any page.
export const MIN_SPAN_WORDS = 6;
let negations: string[] | null = null;

// Whole-word containment of one span's words in the page's words, in order and next to each other. No fuzzy match.
// A place where the words follow a negation prefix ("it is a myth that ...") does not count.
export function pageHoldsSpan(pageWords: string, span: string, ligatures = false): boolean {
  const words = wordsOf(span, false).trim();
  const list = words.split(" ");
  if (list.length < MIN_SPAN_WORDS) return false;
  negations ??= loadRules().negationPrefixes;
  const pattern = list.map((w) => {
    const folded = ligatures ? foldLigatures(w) : w;
    return folded === w || folded === "" ? escapeRe(w) : `(?:${escapeRe(w)}|${escapeRe(folded)})`;
  }).join(" ");
  const needle = new RegExp(`(?<= )${pattern}(?= )`, "g");
  for (const m of pageWords.matchAll(needle)) {
    const contextBefore = pageWords.slice(Math.max(0, m.index - 120), m.index).trim();
    if (!isNegated({ contextBefore, text: words }, negations)) return true;
  }
  return false;
}

const reason = (err: ClientError) => `${err.code}${err.status ? ` ${err.status}` : ""}`;

// Does the first capture hold at least one of the node's spans? holds=false is a clear "no" or "cannot tell": the date
// is withheld either way, and `why` says which. Failures of the archive never throw; they mean "cannot verify".
export async function captureHoldsClaim(checker: CaptureChecker, url: string, capture: FoundCapture, spans: readonly string[], step = "dating"): Promise<CaptureVerdict> {
  const usage: CaptureVerdict["usage"] = [];
  if (spans.length === 0) return { holds: false, why: "the node has no span to look for in the capture", usage };
  let body: CaptureBody;
  try {
    const got = await checker.captureBody!(url, capture.timestamp, { step });
    usage.push(got.usage);
    body = got.data;
  } catch (err) {
    if (!(err instanceof ClientError)) throw err;
    return { holds: false, why: `capture ${capture.timestamp} could not be read (${reason(err)})`, usage };
  }
  if (body.kind !== "binary") {
    // A web page or a PDF whose text we can read is searched; not found means withheld. A page that changes can say
    // anything later, and a PDF read crudely is tolerated for ligatures only, so there is no fallback for either.
    const words = wordsOf(body.text, body.kind === "html", body.kind === "pdf");
    return spans.some((s) => pageHoldsSpan(words, s, body.kind === "pdf"))
      ? { holds: true, why: "the first capture holds the claim's sentence", usage }
      : { holds: false, why: `the first capture (${capture.firstCapture}) does not hold the claim's sentence`, usage };
  }
  // A file whose text we cannot read: the archive holding one version of it is an assumption, not proof, that it is the
  // file the walk read (a file replaced on the server after its only capture would pass).
  const what = "the capture is a file we cannot read and";
  if (!checker.captureVersions) return { holds: false, why: `${what} its versions cannot be compared`, usage };
  try {
    const got = await checker.captureVersions(url, { step });
    usage.push(got.usage);
    return got.data.versions === "one"
      ? { holds: true, why: `${what} the archive holds one version only, assumed to be the file the walk read`, usage }
      : { holds: false, why: `${what} the archive holds more than one version of it`, usage };
  } catch (err) {
    if (!(err instanceof ClientError)) throw err;
    return { holds: false, why: `${what} its versions could not be compared (${reason(err)})`, usage };
  }
}
