import { Trace } from "pz/schema";

export type LoadError = { file: string; message: string };
export type Loaded = { traces: Trace[]; errors: LoadError[] };

export function parseTraces(modules: Record<string, unknown>): Loaded {
  const traces: Trace[] = [];
  const errors: LoadError[] = [];
  for (const [path, json] of Object.entries(modules)) {
    const file = path.split("/").at(-1) ?? path;
    const parsed = Trace.safeParse(json);
    if (parsed.success) traces.push(parsed.data);
    else errors.push({ file, message: `${file} does not match the trace format, so it is not shown.` });
  }
  traces.sort((a, b) => a.id.localeCompare(b.id));
  return { traces, errors };
}

// Synthetic fixtures for now; real REPLAY traces join this list in T32.
export function loadTraces(): Loaded {
  return parseTraces(import.meta.glob("../../../../fixtures/traces/*.json", { eager: true, import: "default" }));
}
