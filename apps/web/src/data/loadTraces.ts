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
  // Real recordings first, then the invented samples; by id within each.
  traces.sort((a, b) => Number(a.synthetic) - Number(b.synthetic) || a.id.localeCompare(b.id));
  return { traces, errors };
}

// The invented samples, plus every recorded real trace in traces/ and traces/gallery/ (XO on #184: fixtures/ stays
// synthetic). A missing folder simply adds nothing.
export function loadTraces(): Loaded {
  return parseTraces({
    ...import.meta.glob("../../../../fixtures/traces/*.json", { eager: true, import: "default" }),
    ...import.meta.glob(["../../../../traces/*.json", "../../../../traces/gallery/*.json"], { eager: true, import: "default" }),
  });
}
