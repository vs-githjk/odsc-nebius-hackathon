import { z } from "zod";
import { ClientError, USER_AGENT, send, type ClientDeps } from "./http.ts";

const CDX_URL = "https://web.archive.org/cdx/search/cdx";
export const WAYBACK_TIMEOUT_MS = 20_000;

const CdxRows = z.array(z.array(z.string()));

export type FirstCapture =
  | { status: "found"; firstCapture: string; timestamp: string }
  | { status: "none" }
  | { status: "pending" };

function parseCdx(body: string): FirstCapture {
  // First row is the header; the rest are oldest first.
  const timestamp = CdxRows.parse(JSON.parse(body))[1]?.[0];
  if (!timestamp) return { status: "none" };
  const firstCapture = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
  return { status: "found", firstCapture, timestamp };
}

// What a capture held, as far as the dating check can read it. "binary" (a PDF, an image, a zip) has no text here.
export type CaptureBody = { kind: "html" | "text" | "binary"; text: string };
// Whether the archive holds more than one distinct file for a url (counted only up to two).
export type CaptureVersions = { versions: "one" | "changed" };
const MAX_CAPTURE_CHARS = 3_000_000;
const TEXTUAL = /html|xml|json|^text\//i;
const StoredCapture = z.object({ kind: z.enum(["html", "text", "binary"]), text: z.string() });

// The stored body is JSON so a cache hit returns the same CaptureBody, and a binary file is never stored.
function wrapCaptureBody(fetchImpl: typeof fetch): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const res = await fetchImpl(input, init);
    if (!res.ok) return res;
    const contentType = res.headers.get("content-type");
    const raw = await res.text();
    const head = raw.slice(0, 2000);
    const sniffed = /^\s*%PDF-/.test(head) || /[\u0000�]/.test(head.slice(0, 500));
    const kind: CaptureBody["kind"] = sniffed ? "binary"
      : contentType && !TEXTUAL.test(contentType) ? "binary"
      : /html|xml/i.test(contentType ?? "") || /<(?:html|body|head|!doctype)/i.test(head) ? "html" : "text";
    const body = JSON.stringify({ kind, text: kind === "binary" ? "" : raw.slice(0, MAX_CAPTURE_CHARS) });
    return new Response(body, { status: res.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

export function createWayback(deps: ClientDeps & { timeoutMs?: number }) {
  return {
    // The archive's own copy of a capture, without the replay toolbar or rewritten links (the id_ form).
    async captureBody(url: string, timestamp: string, { step = "dating" }: { step?: string } = {}) {
      const captureUrl = `https://web.archive.org/web/${timestamp}id_/${url}`;
      return send<CaptureBody>({ ...deps, fetch: wrapCaptureBody(deps.fetch ?? fetch) }, {
        service: "wayback",
        endpoint: "capture",
        step,
        url: captureUrl,
        cacheInput: { service: "wayback", url: captureUrl },
        maxCredits: 0,
        timeoutMs: deps.timeoutMs ?? WAYBACK_TIMEOUT_MS,
        retryTimeouts: true,
        retryStatuses: [403, 429],
        retryDelayMs: 1500,
        init: { headers: { "user-agent": USER_AGENT } },
        parse: (body) => ({ data: StoredCapture.parse(JSON.parse(body)), credits: 0 }),
      });
    },
    // One CDX question: does the archive hold more than one distinct file for this url (the digest changed)?
    async captureVersions(url: string, { step = "dating" }: { step?: string } = {}) {
      const params = new URLSearchParams({ url, matchType: "exact", limit: "2", output: "json", fl: "timestamp,digest", filter: "statuscode:200", collapse: "digest" });
      return send<CaptureVersions>(deps, {
        service: "wayback",
        endpoint: "cdx",
        step,
        url: `${CDX_URL}?${params}`,
        cacheInput: { service: "wayback", url, filter: "statuscode:200", fl: "digest", collapse: "digest" },
        maxCredits: 0,
        timeoutMs: deps.timeoutMs ?? WAYBACK_TIMEOUT_MS,
        retryTimeouts: true,
        retryStatuses: [403, 429],
        retryDelayMs: 1500,
        init: { headers: { "user-agent": USER_AGENT } },
        parse: (body) => ({ data: { versions: CdxRows.parse(JSON.parse(body)).length > 2 ? "changed" : "one" }, credits: 0 }),
      });
    },
    async firstCapture(url: string, { step = "dating" }: { step?: string } = {}) {
      const params = new URLSearchParams({ url, matchType: "exact", limit: "1", output: "json", fl: "timestamp,original", filter: "statuscode:200" });
      try {
        return await send<FirstCapture>(deps, {
          service: "wayback",
          endpoint: "cdx",
          step,
          url: `${CDX_URL}?${params}`,
          cacheInput: { service: "wayback", url, filter: "statuscode:200" },
          maxCredits: 0,
          timeoutMs: deps.timeoutMs ?? WAYBACK_TIMEOUT_MS,
          retryTimeouts: true,
          // The archive answers 403 or 429 to a burst: one retry after a short pause, with a named User-Agent.
          retryStatuses: [403, 429],
          retryDelayMs: 1500,
          init: { headers: { "user-agent": USER_AGENT } },
          parse: (body) => ({ data: parseCdx(body), credits: 0 }),
        });
      } catch (err) {
        if (err instanceof ClientError && err.timedOut) {
          const lastRow = deps.usage.rows.at(-1);
          if (lastRow) return { data: { status: "pending" } as FirstCapture, usage: lastRow };
        }
        throw err;
      }
    },
  };
}
