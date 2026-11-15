# Trace orchestration and keyless replay

T29 wiring, pending production adapter integration. No new live run is represented here.

`make replay` needs no API key. Its default input is the existing synthetic
`fixtures/traces/sample-rich.json`; the returned trace stays SAMPLE. This is a
fixture smoke check, not evidence of a real engine run.

For a real recorded trace, run:

```sh
make replay TRACE=runs/reviewed-trace.json
npm run pz -- trace --replay-of runs/reviewed-trace.json --events
```

Replay parses the Trace schema and runs the existing verifier before returning
anything. `--pages <dir>` also rechecks saved full-page hashes and offsets. A real
LIVE recording becomes REPLAY with its original `recordedAt` and original usage
rows unchanged. Synthetic recordings always remain SAMPLE. Invalid evidence or
an inconsistent synthetic/mode pair fails. No model or search client is called.

`recordTrace(path, trace)` writes only verified traces and refuses to overwrite an
existing file. `--out <new.json>` uses that same recorder. Files under runs remain
local under the existing ignore rule.

## Adapter contract for T21 to T28

`runTrace(input, pipeline, { wayback, pages?, emit? })` checks the adapters and
Wayback client before it starts. It runs intake, fingerprint, walk, spans, dating,
clusters, readouts and card in order. Walk and spans may return `{ trace, pages }`
to add publication metadata and byline to the next immutable context snapshot.
Page text is carried as JSON-quoted data.

The runner owns dating through T25 `dateNode`, using the discovered metadata,
byline and Wayback evidence for each URL. It replaces dates supplied by earlier
stages, appends dating usage and rejects changes to authoritative dates in later
stages. Walk search hints and body dates are outside the dating inputs.

Each stage returns LIVE or synthetic SAMPLE and preserves the incoming usage
prefix. The runner snapshots usage before the call so it can detect in-place
changes. It recomputes the final decision using existing rules and verifies the
completed trace.

A reviewed local module exporting `pipeline` and `wayback` can be selected explicitly:

```sh
npm run pz -- trace "input claim" --pipeline ./reviewed-adapters.ts --events --out runs/new.json
```

There is no fabricated default live adapter. The production adapters for the
modules still landing are the remaining integration work on #71. Do not use this
seam to run the private held-out set before the frozen evaluation.

## Event contract for T32

Events are newline-delimited JSON. `sequence` increases from zero. Stage events
contain `type: "stage"`, `stage` and `status` (started/completed/failed). One final
`type: "trace"` event carries the verified Trace. Replay emits just that final event.
Stage events do not carry page bodies, prompts or provider errors.

C10 remains PLANNED until it runs through real adapters. The current transport
test checks orchestration with deterministic stub adapters: a malicious
page stays JSON-quoted data and the verified result is unchanged. It is not a
claim of model-level injection resistance, a live model test, or a completed
production-engine evaluation. That test must be repeated through the real
adapters when they land.

CLI failures print only an allowlisted typed client error code, or `trace_failed`
for unknown failures. Provider message bodies and arbitrary error.code values
never reach stderr.

## Dev score evidence (2026-11-10 UTC)

T33 scorer from PR #97 head c126a3b, E2 only: false origins 0 (+0 unverified
ORIGIN_FOUND), target cited 0/11, earliest 0 Pass / 0 Partial / 0 Fail, cold stops
0/9, **0 of 20 scored**, 0 credits / 0 seconds, modes none. No dev traces exist
yet; this is missing coverage, not a quality score or improvement. T38/T39 supply
real recordings. No held-out run or paid calls were performed for these fixes.
