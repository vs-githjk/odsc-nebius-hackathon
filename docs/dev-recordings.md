# T38 dev recordings

T38 prepares five approved intake answers and 20 E2 fingerprints for live capture.
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
Plan needs the intake fixture files, so it becomes available after #75 merges.
Replay checks all 25 source/id/kind pairs, reruns the unchanged operations using
saved responses and compares exact requests, call count and output. There is no
network fallback. SYNTHETIC provenance is retained in the files; a replay success
is not a claim that synthetic captures came from a live provider.

Only after #75 merges and the shared spending ledger is reconciled:

```sh
node --env-file-if-exists=.env --import tsx eval/record-dev.ts --live \
  --ledger "$WEEKLY_LEDGER" --ceiling-usd "$REVIEWED_ATTEMPT_CEILING_USD" \
  --out "$NEW_CAPTURE_DIR"
```

The ledger must already exist. The command never resets it or assumes zero prior
spend. Both operation files and all six input files must match exact bytes in
`origin/main`; no
arbitrary pipeline or prompt path can be supplied. A missing key or invalid budget
fails before network access. The output directory must be new, with an existing
parent, and its recording files use exclusive creation. The command accepts only
the pinned Qwen chat endpoint/model and uses the repository price table for valid
reported token usage. Unknown or malformed usage retains the full reservation.
Command errors print only `recording_failed`, without git stderr, paths, arguments
or provider message bodies.

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
same authoritative allowance. The supplied per-attempt ceiling must be a reviewed
upper bound for the pinned request/model; the command does not infer a safe bound
from a guessed token estimate. Repository prices are dated and require review
before spending. An exceeded bound is detected after the response and prevents
further calls; a correct ceiling is necessary to enforce the intended cap.
The existing Token Factory client maps fetch-level reservation failures to
network_error. The request is still blocked; typed budget propagation is a T41
integration concern.

## Capture and validation

`session.ts` captures exact typed requests/responses, original per-attempt usage,
recordedAt and explicit LIVE or SYNTHETIC provenance. Available attempt usage
survives a client failure, with only a safe error code stored. A failed case or
write stops the batch. Save actual captures under test/recorded/live, review them,
and replay all 25 before marking C11 proven. Keep failed captures and usage
visible; do not overwrite the original synthetic fixtures.

Local typecheck and 94 tests pass, including eight capture/manifest tests, ten
budget tests and six command tests. They include the real merged fingerprint
operation and existing Token Factory retry path with synthetic provider responses.
One command test replays all 25 generated synthetic records with no network.
The merge gate is tested against a temporary Git repository. Full make verify
runs in repository CI because the local source workspace is partial.

T33 scorer PR #97 c126a3b, E2: false origins 0 (+0 unverified ORIGIN_FOUND), target
cited 0/11, earliest 0 Pass / 0 Partial / 0 Fail, cold stops 0/9, **0 of 20 scored**,
0 credits, 0 seconds, modes none. This is missing coverage, not an engine quality
improvement. No paid call or held-out access/run occurred during preparation.
