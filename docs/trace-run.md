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

`runTrace(input, pipeline, { pages?, emit? })` validates all eight adapters before
calling anything, then calls intake, fingerprint, walk, spans, dating, clusters,
readouts and card in order. Intake receives Context and returns an initial Trace;
the remaining adapters receive the current Trace plus Context and return a Trace.
Context carries the input plus URL/JSON-quoted page data and optional publication
`metadata` and `byline` dates. Page inputs and context are immutable. It contains no executable
page instructions. Each stage result is schema checked. The final decision is
recomputed by the existing rules, and the completed trace must pass verification.
Client errors propagate rather than becoming an invented successful result.

Every stage must return LIVE or synthetic SAMPLE; adapter-produced REPLAY is
rejected. Each output's usage must begin with an unchanged copy of its incoming
usage, checked against a pre-call snapshot even if the adapter mutates its input.
Use `dating: datingStep(wayback)` from engine/run.ts for the production dating
stage. It replaces every node.date via T25 dateEvidence (through dateNode), using
that URL's metadata/byline and a successful Wayback capture. Walk/search hints and
body dates are never used. Missing publication evidence becomes unconfirmed if no
capture exists. Original usage is retained and every dating row is appended. Stage adapters own the specific module argument conversions.
No threshold, question wording, prompt or rule is defined by this orchestrator.

A reviewed local module exporting `pipeline` can be selected explicitly:

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
