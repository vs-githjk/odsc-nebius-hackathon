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

export function createWayback(deps: ClientDeps & { timeoutMs?: number }) {
  return {
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
