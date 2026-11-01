import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { UsageRow } from "./row.ts";

export const DEFAULT_USAGE_PATH = "runs/usage.jsonl";

export type UsageLog = { rows: UsageRow[]; append(row: UsageRow): void };

export function createUsageLog({ path = DEFAULT_USAGE_PATH }: { path?: string } = {}): UsageLog {
  const rows: UsageRow[] = [];
  return {
    rows,
    append(row) {
      rows.push(row);
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, JSON.stringify(row) + "\n");
    },
  };
}
