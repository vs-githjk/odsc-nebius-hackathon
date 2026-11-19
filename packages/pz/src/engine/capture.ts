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

// The words of a page as the dating check compares them: tags gone, entities decoded, lower case, letters and digits only.
export function wordsOf(html: string): string {
  const stripped = html
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?(?:a|b|i|u|em|strong|span|small|mark|abbr|cite|font|code)\b[^>]*>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
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
  const words = wordsOf(span).trim();
  return words.length > 0 && pageWords.includes(` ${words} `);
}

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
    return { holds: false, why: `capture ${capture.timestamp} could not be read (${err.code}${err.status ? ` ${err.status}` : ""})`, usage };
  }
  if (body.kind === "binary") {
    // A PDF or other file has no text we can search. It keeps the date only when the archive holds one version of it:
    // the file the walk read is then the file the first capture held.
    if (!checker.captureVersions) return { holds: false, why: "capture is not text and its versions cannot be compared", usage };
    try {
      const got = await checker.captureVersions(url, { step });
      usage.push(got.usage);
      return got.data.versions === "one"
        ? { holds: true, why: "capture is a file the archive holds in one version only, so it is the file the walk read", usage }
        : { holds: false, why: "capture is a file (not text) and the archive holds more than one version of it", usage };
    } catch (err) {
      if (!(err instanceof ClientError)) throw err;
      return { holds: false, why: `file versions could not be compared (${err.code}${err.status ? ` ${err.status}` : ""})`, usage };
    }
  }
  const words = wordsOf(body.text);
  return spans.some((s) => pageHoldsSpan(words, s))
    ? { holds: true, why: "the first capture holds the claim's sentence", usage }
    : { holds: false, why: `the first capture (${capture.firstCapture}) does not hold the claim's sentence`, usage };
}
