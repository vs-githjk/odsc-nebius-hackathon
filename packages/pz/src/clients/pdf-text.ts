import { inflateSync } from "node:zlib";

// A small, honest PDF text reader for the dating check (L19): it inflates the file's streams and reads the strings the
// page content shows (Tj and TJ). It does not read fonts that map glyph codes through a table (hex strings, CID fonts),
// ligature glyphs come out as control codes, and it never guesses. Where it reads too little, the caller treats the file
// as unreadable and falls back to "the archive holds one version of it".
//
// Every scan is linear and metered: a hostile file costs a bounded amount of work, never a hang.
export const MIN_PDF_TEXT_CHARS = 500;
const MAX_STREAMS = 4000;
// Caps against a compression bomb: per stream, and in all for one file.
export const MAX_STREAM_BYTES = 4 * 2 ** 20;
export const MAX_INFLATED_BYTES = 32 * 2 ** 20;
// Characters looked at in all, across the file's streams and the lookahead from every bracket and parenthesis.
export const MAX_SCAN_CHARS = 64 * 2 ** 20;
const MAX_STRING_CHARS = 50_000;
const NUMBER = /-?\d+(?:\.\d+)?/y;

const ESCAPES: Record<string, string> = { n: " ", r: " ", t: " ", b: "", f: "", "(": "(", ")": ")", "\\": "\\" };
function unescapePdf(s: string): string {
  return s.replace(/\\(?:([0-7]{1,3})|(\r\n|\n|\r)|(.))/gs, (_, octal?: string, newline?: string, ch?: string) => {
    if (octal) return String.fromCharCode(parseInt(octal, 8) & 0xff);
    if (newline) return "";
    return ESCAPES[ch ?? ""] ?? ch ?? "";
  });
}

const isSpace = (c: string | undefined) => c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\f" || c === "\0";

// A literal string starting at `at` (a "("): its raw inner text and the index after it, or null when it does not close
// within MAX_STRING_CHARS. Balanced parentheses nest; a backslash skips the next character.
function literalAt(s: string, at: number): { raw: string; next: number } | null {
  let depth = 1;
  const stop = Math.min(s.length, at + 1 + MAX_STRING_CHARS);
  for (let i = at + 1; i < stop; i++) {
    const c = s[i];
    if (c === "\\") i++;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return { raw: s.slice(at + 1, i), next: i + 1 };
  }
  return null;
}

function skipSpace(s: string, at: number): number {
  let i = at;
  while (i < s.length && isSpace(s[i])) i++;
  return i;
}

// Reads the strings a content stream shows. Returns the characters scanned so the caller can meter the file.
function showText(content: string, out: string[], budget: number): number {
  let used = 0;
  let i = 0;
  while (i < content.length && used < budget) {
    const c = content[i];
    if (c === "(") {
      const lit = literalAt(content, i);
      used += lit ? lit.next - i : MAX_STRING_CHARS;
      if (!lit) { i++; continue; }
      const j = skipSpace(content, lit.next);
      if (content.startsWith("Tj", j) || content[j] === "'" || content[j] === "\"") {
        out.push(unescapePdf(lit.raw), " ");
        i = j + (content[j] === "T" ? 2 : 1);
      } else i = lit.next;
    } else if (c === "[") {
      // An array of strings and numbers; anything else in it means this "[" is not a text array.
      const pieces: string[] = [];
      let j = i + 1;
      let closed = false;
      while (j < content.length && used < budget) {
        j = skipSpace(content, j);
        const d = content[j];
        if (d === "]") { closed = true; j++; break; }
        if (d === "(") {
          const lit = literalAt(content, j);
          if (!lit) break;
          pieces.push(unescapePdf(lit.raw));
          used += lit.next - j;
          j = lit.next;
        } else {
          NUMBER.lastIndex = j;
          const m = NUMBER.exec(content);
          if (!m) break;
          if (Number(m[0]) < -200) pieces.push(" ");
          j += m[0].length;
        }
        used++;
      }
      used += j - i;
      const k = skipSpace(content, j);
      if (closed && content.startsWith("TJ", k)) {
        out.push(...pieces, " ");
        i = k + 2;
      } else i++;
    } else i++;
    used++;
  }
  return used;
}

export function pdfText(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  const bin = buf.toString("latin1");
  const parts: string[] = [];
  let streams = 0;
  let inflated = 0;
  let scanned = 0;
  let from = 0;
  for (;;) {
    const at = bin.indexOf("stream", from);
    if (at < 0 || ++streams > MAX_STREAMS || scanned > MAX_SCAN_CHARS) break;
    from = at + 6;
    // "endstream" holds the word "stream" too, and the keyword is followed by a line end.
    if (bin.startsWith("end", at - 3)) continue;
    const m = /^\r?\n/.exec(bin.slice(from, from + 2));
    if (!m) continue;
    const start = from + m[0].length;
    const end = bin.indexOf("endstream", start);
    // No end marker: nothing after this point is a well-formed stream.
    if (end < 0) break;
    from = end + 9;
    let content: string;
    try {
      const out = inflateSync(buf.subarray(start, end), { maxOutputLength: MAX_STREAM_BYTES });
      inflated += out.length;
      if (inflated > MAX_INFLATED_BYTES) break;
      content = out.toString("latin1");
    } catch {
      // Not deflated, or an output over the cap (a bomb): the raw bytes are read as they are, which yields no text.
      content = end - start <= MAX_STREAM_BYTES ? bin.slice(start, end) : "";
    }
    if (!content.includes("Tj") && !content.includes("TJ")) continue;
    scanned += showText(content, parts, MAX_SCAN_CHARS - scanned);
  }
  return parts.join("");
}
