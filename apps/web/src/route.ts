export type Route = { name: "start" } | { name: "trace"; id: string };

export function parseRoute(hash: string): Route {
  const match = /^#\/t\/([^/]+)$/.exec(hash);
  if (!match?.[1]) return { name: "start" };
  try {
    return { name: "trace", id: decodeURIComponent(match[1]) };
  } catch {
    // A malformed escape such as %E0 is not a trace id; show the start page rather than a blank one.
    return { name: "start" };
  }
}
