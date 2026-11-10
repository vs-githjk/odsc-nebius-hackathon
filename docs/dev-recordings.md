# T38 recording preparation

The transport in `eval/recordings/session.ts` is ready for offline review. No live
recordings are included. C11 stays planned. Intake PR #75 must merge before the
live capture phase of #88; its prompt and implementation remain Anoop's.

`loadT38Cases()` reads only the five approved intake fixture `answer` fields and
the 20 E2 `text` fields, in deterministic order. It never uses the hand-written
model replies or dev target URLs. No held-out path is accepted.

`recordCases(cases, deps)` calls the supplied intake/fingerprint operations in
order with the supplied existing Token Factory clients. It records exact typed
requests and responses, original attempt usage, timestamp, source and explicit
LIVE or SYNTHETIC provenance. Available attempt usage survives a client failure;
only a fixed error code is stored. A failed case or failed write stops the batch.
Completed captures are not silently replaced by retries. `writeRecording` uses
exclusive creation and mode 0600, refusing existing files.

`replayRecording(record, operations)` has no network fallback. It reruns the
operation with saved responses and checks exact requests, call count and output.
Prompt/interface drift therefore fails replay instead of quietly changing the
meaning of a capture. Synthetic tests remain labelled SYNTHETIC.

## Remaining live integration

Once #75 merges, assemble the two merged operations and existing clients, run
`loadT38Cases`, then `recordCases`. This preparation intentionally exposes no live
CLI. Before live execution, add the shared weekly budget integration at the HTTP
attempt boundary (including retries) and obtain the combined weekly spending
ledger. The required `beforeCase` hook is an additional preflight, not proof of a
per-attempt or cross-machine cap. The Nov 9 to 15 budget is $15 for Tavily plus
Token Factory combined, including the held-out run, as posted on #2.

Save actual captures under `packages/pz/test/recorded/live/`, review their outputs,
and replay all 25 through the merged operations before marking C11 proven. Keep
failed captures and their usage visible. Do not overwrite the existing synthetic
fixtures or call a completed transport test a live model evaluation.

## Validation and score coverage

Eight transport/manifest tests cover deterministic capture, failure usage,
preflight, full-manifest validation, exclusive writes, replay drift and the real
merged fingerprint operation using a synthetic provider response. Local typecheck
and 78 tests pass in the partial source workspace; full make verify runs in CI.
No prompt, wording, rule or threshold changes.

T33 scorer PR #97 c126a3b, E2: false origins 0 (+0 unverified ORIGIN_FOUND), target
cited 0/11, earliest 0 Pass / 0 Partial / 0 Fail, cold stops 0/9, **0 of 20 scored**,
0 credits, 0 seconds, modes none. This is missing dev coverage, not an engine
quality improvement. No paid call or held-out access/run occurred in this prep.
