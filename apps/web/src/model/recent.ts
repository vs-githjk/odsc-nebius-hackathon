import type { Trace } from "pz/schema";

const KEY = "pz.recent";
type StorageAccess = () => Pick<Storage, "getItem" | "setItem">;

export function createRecent(storage: StorageAccess) {
  let ids: string[] = [];
  const live = new Map<string, Trace>();
  try {
    const value: unknown = JSON.parse(storage().getItem(KEY) ?? "[]");
    if (Array.isArray(value)) ids = [...new Set(value.filter((id): id is string => typeof id === "string" && !!id))].slice(0, 6);
  } catch { /* Storage is optional, including access to sessionStorage itself. */ }
  return {
    open(trace: Trace) {
      if (trace.mode === "LIVE") live.set(trace.id, trace);
      ids = [trace.id, ...ids.filter(id => id !== trace.id)].slice(0, 6);
      for (const id of live.keys()) if (!ids.includes(id)) live.delete(id);
      try { storage().setItem(KEY, JSON.stringify(ids)); } catch { /* Keep working in memory. */ }
    },
    list(recorded: Trace[], current: string): Trace[] {
      return ids.filter(id => id !== current).flatMap(id => {
        const trace = live.get(id) ?? recorded.find(trace => trace.id === id);
        return trace ? [trace] : [];
      }).slice(0, 5);
    },
  };
}

let session: ReturnType<typeof createRecent> | undefined;
export const recentSession = () => session ??= createRecent(() => window.sessionStorage);
