export type Route = { name: "start" } | { name: "how" } | { name: "traces" } | { name: "answer"; n: number | null } | { name: "trace"; id: string } | { name: "notFound"; hash: string };

// "", "#" and "#/" are the start page. Any other address the app doesn't know is a not-found page with a way back,
// never a silent jump to the start page (#257 item 9).
export function parseRoute(hash: string): Route {
  if (hash === "" || hash === "#" || hash === "#/") return { name: "start" };
  if (hash === "#/how") return { name: "how" };
  if (hash === "#/traces") return { name: "traces" };
  if (hash === "#/answer") return { name: "answer", n: null };
  const stat = /^#\/answer\/([1-9][0-9]?)$/.exec(hash);
  if (stat?.[1]) return { name: "answer", n: Number(stat[1]) };
  const match = /^#\/t\/([^/]+)$/.exec(hash);
  if (!match?.[1]) return { name: "notFound", hash };
  try {
    return { name: "trace", id: decodeURIComponent(match[1]) };
  } catch {
    // A malformed escape such as %E0 is not a trace id; say so rather than show a blank page.
    return { name: "notFound", hash };
  }
}
