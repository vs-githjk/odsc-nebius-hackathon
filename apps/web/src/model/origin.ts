import type { Trace } from "pz/schema";
import rulesJson from "../../../../packages/pz/rules/rules.json";
import { originPick } from "../../../../packages/pz/src/rules/decide.ts";
import type { Rules } from "../../../../packages/pz/src/rules/rules.ts";

// Reuse the deciding rule's pick for both the named origin and its date wording.
export const pickedOrigin = (trace: Trace) => trace.decision.state === "ORIGIN_FOUND"
  ? originPick(trace, rulesJson as unknown as Rules) : null;

export function originName(title: string, host: string): string {
  // Site suffixes are not document titles. Fall back to the host for page chrome or file names.
  const name = title.split(/\s+\|\s+/)[0]!.replace(/\s+/g, " ").trim();
  if (!name || /^(?:https?:|www\.)/i.test(name) || /\.(?:pdf|html?)$/i.test(name)
    || /^(?:home|untitled|access denied|just a moment|page not found|404)$/i.test(name)) return host;
  return `"${name}"`;
}
