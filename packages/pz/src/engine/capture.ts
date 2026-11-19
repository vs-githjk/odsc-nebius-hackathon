import { ClientError } from "../clients/errors.ts";
import type { CaptureBody, CaptureVersions, FirstCapture } from "../clients/wayback.ts";
import type { Result } from "../clients/http.ts";
import { normalise } from "../rules/index.ts";

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
export function wordsOf(source: string, markup = true): string {
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
  return ` ${normalise(stripped).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
}

// Whole-word containment of one span's words in the page's words, in order and next to each other. No fuzzy match.
export function pageHoldsSpan(pageWords: string, span: string): boolean {
  const words = wordsOf(span, false).trim();
  return words.length > 0 && pageWords.includes(` ${words} `);
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
    const words = wordsOf(body.text, body.kind === "html");
    if (spans.some((s) => pageHoldsSpan(words, s))) return { holds: true, why: "the first capture holds the claim's sentence", usage };
    // Web pages stop here: a page that changes can say anything later. A PDF's text is read crudely (ligatures and
    // some fonts come out wrong), so a PDF the sentence was not found in gets the file check below.
    if (body.kind !== "pdf") return { holds: false, why: `the first capture (${capture.firstCapture}) does not hold the claim's sentence`, usage };
  }
  // A file whose text we cannot search, or a PDF the sentence was not found in: the date stands only when the archive
  // holds one version of the file, so the file the walk read is the file the first capture held.
  const what = body.kind === "pdf" ? "the sentence was not found in the PDF's text and" : "the capture is a file we cannot read and";
  if (!checker.captureVersions) return { holds: false, why: `${what} its versions cannot be compared`, usage };
  try {
    const got = await checker.captureVersions(url, { step });
    usage.push(got.usage);
    return got.data.versions === "one"
      ? { holds: true, why: `${what} the archive holds one version only, so it is the file the walk read`, usage }
      : { holds: false, why: `${what} the archive holds more than one version of it`, usage };
  } catch (err) {
    if (!(err instanceof ClientError)) throw err;
    return { holds: false, why: `${what} its versions could not be compared (${reason(err)})`, usage };
  }
}
