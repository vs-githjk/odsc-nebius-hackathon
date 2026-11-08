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
Context carries the input plus URL/JSON-quoted page data. It contains no executable
page instructions. Each stage result is schema checked. The final decision is
recomputed by the existing rules, and the completed trace must pass verification.
Client errors propagate rather than becoming an invented successful result.

Adapters must carry all original usage rows forward; T25's dateNode returns its
row for this purpose. Stage adapters own the specific module argument conversions.
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

The C10 test checks orchestration with deterministic stub adapters: a malicious
page stays JSON-quoted data and the verified result is unchanged. It is not a
claim of model-level injection resistance, a live model test, or a completed
production-engine evaluation. That test must be repeated through the real
adapters when they land.
