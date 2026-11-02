#!/usr/bin/env -S node --import tsx
import { PZ_VERSION } from "../index.ts";

if (process.argv[2] === "--version") {
  console.log(PZ_VERSION);
} else {
  console.error("not built yet");
  process.exitCode = 1;
}
