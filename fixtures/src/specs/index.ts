import type { FixtureSpec } from "../spec.ts";
import { sampleRich } from "./rich.ts";
import { sampleColdUnread, sampleConflicting, sampleNoPages, sampleOrigin, samplePartial, sampleToolFailed } from "./states.ts";

export const SPECS: FixtureSpec[] = [
  sampleRich, sampleOrigin, sampleConflicting, samplePartial, sampleToolFailed, sampleNoPages, sampleColdUnread,
];
