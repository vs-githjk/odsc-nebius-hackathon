export type Route = { name: "start" } | { name: "how" } | { name: "traces" } | { name: "answer"; n: number | null } | { name: "trace"; id: string };

export function parseRoute(hash: string): Route {
  if (hash === "#/how") return { name: "how" };
  if (hash === "#/traces") return { name: "traces" };
  if (hash === "#/answer") return { name: "answer", n: null };
  const stat = /^#\/answer\/([1-9][0-9]?)$/.exec(hash);
  if (stat?.[1]) return { name: "answer", n: Number(stat[1]) };
  const match = /^#\/t\/([^/]+)$/.exec(hash);
  if (!match?.[1]) return { name: "start" };
  try {
    return { name: "trace", id: decodeURIComponent(match[1]) };
  } catch {
    // A malformed escape such as %E0 is not a trace id; show the start page rather than a blank one.
    return { name: "start" };
  }
}
