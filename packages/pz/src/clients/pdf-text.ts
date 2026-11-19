import { inflateSync } from "node:zlib";

// A small, honest PDF text reader for the dating check (L19): it inflates the file's streams and reads the strings the
// page content shows (Tj and TJ). It does not read fonts that map glyph codes through a table (hex strings, CID fonts),
// ligature glyphs come out as codes, and it never guesses. Where it reads too little, the caller treats the file as
// unreadable and falls back to "the archive holds one version of it".
export const MIN_PDF_TEXT_CHARS = 500;
const MAX_STREAMS = 4000;
// Caps against a compression bomb: per stream, and in all for one file.
export const MAX_STREAM_BYTES = 4 * 2 ** 20;
export const MAX_INFLATED_BYTES = 32 * 2 ** 20;

const ESCAPES: Record<string, string> = { n: " ", r: " ", t: " ", b: "", f: "", "(": "(", ")": ")", "\\": "\\" };
function unescapePdf(s: string): string {
  return s.replace(/\\(?:([0-7]{1,3})|(\r\n|\n|\r)|(.))/gs, (_, octal?: string, newline?: string, ch?: string) => {
    if (octal) return String.fromCharCode(parseInt(octal, 8) & 0xff);
    if (newline) return "";
    return ESCAPES[ch ?? ""] ?? ch ?? "";
  });
}

export function pdfText(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  const bin = buf.toString("latin1");
  const parts: string[] = [];
  let streams = 0;
  let inflated = 0;
  for (const m of bin.matchAll(/stream\r?\n/g)) {
    if (++streams > MAX_STREAMS) break;
    const start = m.index + m[0].length;
    const end = bin.indexOf("endstream", start);
    if (end < 0) continue;
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
    if (!/\b(?:Tj|TJ)\b/.test(content)) continue;
    for (const op of content.matchAll(/\[((?:[^\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.|\((?:[^()\\]|\\.)*\))*)\)\s*(?:Tj|'|")/gs)) {
      if (op[2] !== undefined) {
        parts.push(unescapePdf(op[2]), " ");
        continue;
      }
      for (const item of (op[1] ?? "").matchAll(/\(((?:[^()\\]|\\.|\((?:[^()\\]|\\.)*\))*)\)|(-?\d+(?:\.\d+)?)/gs)) {
        if (item[1] !== undefined) parts.push(unescapePdf(item[1]));
        else if (Number(item[2]) < -200) parts.push(" ");
      }
      parts.push(" ");
    }
  }
  return parts.join("");
}
