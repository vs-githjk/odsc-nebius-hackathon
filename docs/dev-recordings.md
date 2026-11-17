# T38 dev recordings

T38 prepares five approved intake answers and 20 E2 fingerprints: 21 provider-backed captures and four deterministic outcomes.
No live recordings are included yet. C11 stays planned until the actual captures
pass. Intake PR #75 must merge before live execution. Its prompts remain Anoop's.

## Commands

Run from a normal Git checkout after fetching the current `origin/main`:

```sh
node --import tsx eval/record-dev.ts --plan
node --import tsx eval/record-dev.ts --replay "$CAPTURE_DIR"
```

Plan prints counts and ids, with no model loading or network access. The fixed
manifest reads only the five approved intake fixture `answer` fields and 20 E2
`text` fields. It never uses handwritten responses, target URLs or held-out files.
Plan needs the intake fixture files. Its `fingerprintWithoutNumber` list names
E2 cases that return `no_number` before a provider call. The current list is
`dev-01`, `dev-07`, `dev-08` and `dev-12`. These four cases are stored as `NO_CALL`, with empty calls and usage, and
are replayed against the deterministic fingerprint operation. They do not
count towards C11. Other nonnumeric IDs block capture before ledger access.
Provider-backed replay requires LIVE provenance and consistent usage rows.
It checks all 25 source/id/kind pairs, reruns the unchanged operations using
saved responses and compares exact requests, call count and output. There is no
network fallback. The replay command rejects SYNTHETIC provenance.

Run live capture once #75 merges and the
shared spending ledger is reconciled.

```sh
node --env-file-if-exists=.env --import tsx eval/record-dev.ts --live \
  --ledger "$WEEKLY_LEDGER" \
  --out "$NEW_CAPTURE_DIR"
```

The ledger must already exist. The command never resets it or assumes zero prior
spend. Both operation files and all six input files must match exact bytes in
`origin/main`; no
arbitrary pipeline or prompt path can be supplied. A missing key or invalid budget
fails before network access. The output directory must be new, with an existing
parent. Each recording is staged in the same directory and published atomically
with exclusive creation. The command accepts only
the pinned Qwen chat endpoint/model and uses the repository price table for valid
reported token usage. Unknown or malformed usage retains the full reservation.
The nonnumeric preflight reports `unsupported_fingerprint_claims` and case IDs.
Other errors report `recording_failed`. Neither diagnostic includes provider
messages, command arguments or filesystem paths.

For an interrupted batch, use the same ledger and a new output directory:

```sh
node --env-file-if-exists=.env --import tsx eval/record-dev.ts --live \
  --ledger "$WEEKLY_LEDGER" --resume "$PRIOR_CAPTURE_DIR" --out "$NEW_CAPTURE_DIR"
```

Stop the original runner before resuming. The command validates and replays
completed recordings before any new provider call. It copies the validated
recordings into the new directory and attempts only missing or failed cases.
The original directory retains the failed records and the shared ledger
retains all prior charges. If a completed recording fails validation or
replay, the resume stops before creating output or making a call.

## Budget contract

`budget.ts` initializes a ledger only with explicit combined prior spend, approved
week and cap no higher than $15. The Nov 9 to 15 budget covers Tavily and Token
Factory combined, including the Nov 13 held-out run, as posted on #2. Do not run
the held-out set through this command.

Reservations persist before each HTTP attempt, serialized by an exclusive lock;
each retry reserves again. Known usage settles once and releases only the unused
reservation. Missing usage, transport errors and usage-parsing errors retain the
entire reservation. A violated cost bound is recorded and blocks further calls.
Missing, corrupt, locked, expired or exhausted ledgers fail closed. Amounts round
up to microdollars. A crashed lock requires investigation, not automatic removal.

This coordinates only callers sharing the same ledger file. XO must reconcile
all other machines' Tavily and Token Factory spend and ensure runners use the
same authoritative allowance. The reviewed Qwen ceiling is $0.01 per HTTP attempt
and is pinned in `eval/recordings/config.json`. An optional `--ceiling-usd` can only
lower it. Token Factory preserves a budget refusal as `budget_exceeded` and
retains usage from earlier attempts.

## Capture and validation

`session.ts` captures exact typed requests/responses, original per-attempt usage,
recordedAt and explicit LIVE or SYNTHETIC provenance. Available attempt usage
survives a client failure, with only a safe error code stored. A failed case or
write stops the batch. Save actual captures under test/recorded/live, review them,
and replay all 25 before marking C11 proven. Keep failed captures and usage
visible; do not overwrite the original synthetic fixtures.

The local tests cover the merged fingerprint operation and existing Token
Factory retry path using synthetic provider responses. The command tests
exercise the E2 preflight and replay 25 records built with a test transport. No
provider requests occur in either test.
The merge gate is tested against a temporary Git repository. Full make verify
runs in repository CI because the local source workspace is partial.

T33 scorer PR #97 c126a3b, E2: false origins 0 (+0 unverified ORIGIN_FOUND), target
cited 0/11, earliest 0 Pass / 0 Partial / 0 Fail, cold stops 0/9, **0 of 20 scored**,
0 credits, 0 seconds, modes none. This is missing coverage, not an engine quality
improvement. No paid call or held-out access/run occurred during preparation.
