import { Trace } from "pz/schema";

export type LoadError = { file: string; message: string };
export type Loaded = { traces: Trace[]; errors: LoadError[] };

// A recorded trace in eval/dev-traces was LIVE when it ran; read back from its file in the app it is a replay of that
// recording, so it shows as REPLAY with its recorded date, the same as `pz trace --replay-of` (engine/run.ts).
const asReplay = (t: Trace): Trace => (t.synthetic ? t : { ...t, mode: "REPLAY" });

export function parseTraces(modules: Record<string, unknown>): Loaded {
  const traces: Trace[] = [];
  const errors: LoadError[] = [];
  for (const [path, json] of Object.entries(modules)) {
    const file = path.split("/").at(-1) ?? path;
    const parsed = Trace.safeParse(json);
    if (parsed.success) traces.push(asReplay(parsed.data));
    else errors.push({ file, message: `${file} does not match the trace format, so it is not shown.` });
  }
  // Real recordings first, then the invented samples; by id within each.
  traces.sort((a, b) => Number(a.synthetic) - Number(b.synthetic) || a.id.localeCompare(b.id));
  return { traces, errors };
}

// The invented samples, plus the recorded E2 dev traces from the live runs (eval/dev-traces, dev-NN.json; the
// .error.json files are failed runs with no trace). Real traces show REPLAY with their recorded date, samples SAMPLE.
export function loadTraces(): Loaded {
  return parseTraces({
    ...import.meta.glob("../../../../fixtures/traces/*.json", { eager: true, import: "default" }),
    ...import.meta.glob("../../../../eval/dev-traces/dev-[0-9][0-9].json", { eager: true, import: "default" }),
  });
}
