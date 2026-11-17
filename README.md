# Patient Zero

For a reporter or fact-checker with one viral number and a deadline: paste a number, a quote or an AI answer, and Patient Zero will walk each claim backwards through time to the earliest source it can find, say how many roots we could link the copies to, and mark the earliest page where the wording changed.

Team **Says Who**, ODSC x Nebius Hackathon 2026. Built for Nebius Token Factory and Tavily; today only the spike scripts call them.

**Trace GIF:** coming with the first real trace.

## Quick start (no keys needed)

```sh
git clone https://github.com/vs-githjk/odsc-nebius-hackathon.git && cd odsc-nebius-hackathon
npm ci
make judge
```

`make judge` explains your setup (`pz doctor`), shows every committed trace as a card, re-checks them with `pz verify`, runs the planted traps and ends with one summary line. It needs no API keys and runs in well under a minute. Until the reviewed live traces are committed, the cards are the SAMPLE fixtures, and it says so.

## Run it

| Command | What it does | Status |
|---|---|---|
| `make judge` | The quick start above: setup check, cards, `pz verify`, traps and a summary. No API keys needed. | works now |
| `make doctor` | Says what is installed and which keys are set (never their values), and which stages run live or replay. `ARGS=--network` makes one free request per service whose key is set. | works now |
| `make verify` | Re-checks every committed trace, the trap set and the copy lint, runs the leakage test (a stub until the held-out claims are revealed), then prints the claims table. No API keys needed. | works now |
| `make replay` | Replays a recorded trace as a readable card, with its original usage rows and no network calls. `TRACE=<file>` picks the trace (the default is a SAMPLE); `ARGS=--json` prints the raw trace. | works now |
| `make live CLAIM="..."` | Will run a live trace with your own keys | not built yet |

## When it fails

A search that breaks, or finds nothing, ends in a named state instead of a guess. Both cases run through the engine's own walk, dating, Tavily client and stop-state rules, on a written Tavily response, and replay with no API keys:

| Case | Command | How it ends |
|---|---|---|
| Tavily answers 503 on search | `make replay TRACE=fixtures/failure/traces/failure-tavily-503.json` | `TOOL_FAILED`, rule row 1: "Tavily search returned http_error 503", 0 pages kept. It retried once; both attempts are in the usage rows at 0 credits. It says nothing about the claim. |
| Every search comes back empty | `make replay TRACE=fixtures/failure/traces/failure-empty-search.json` | `NO_PAGES_FOUND`, rule row 3. Not a tool failure. |

These two are labelled synthetic: the claim is the invented Harbor Zoo one, and the responses were written for the test ([fixtures/failure/](fixtures/failure/record.ts)), not captured from a live call. `node --import tsx fixtures/failure/record.ts` rebuilds them byte for byte.

## Eval

| Claim set | Origin hit rate | Full trace vs baseline ladder | Full trace vs consumer tools | Cost p50 / p90 | Time to stop state p50 / p90 |
|---|---|---|---|---|---|
| Held-out (10 claims) | not run yet | not run yet | not run yet | not run yet | not run yet |

## For judges

| Rubric line | Where it will be shown | Status |
|---|---|---|
| Sourced (30) | Every edge rests on two verbatim spans; `make verify` re-checks spans, edges and the stop state of every committed trace ([packages/pz/src/verify/checks.ts](packages/pz/src/verify/checks.ts)) | built on synthetic fixtures; real traces planned |
| Works (25) | `make replay` and `make live CLAIM="..."`; public CI running `make verify` ([.github/workflows/ci.yml](.github/workflows/ci.yml)) | `make verify`, `make replay` and CI built; `make live` planned |
| Usefulness (20) | Two outside-user sessions timed against their usual method; demo video | planned |
| Agent design (15) | Code decides how a trace ends ([packages/pz/src/rules/decide.ts](packages/pz/src/rules/decide.ts), [packages/pz/rules/rules.json](packages/pz/rules/rules.json)); planted trap set ([traps/README.md](traps/README.md)) | built on synthetic fixtures; card and real traces planned |
| Token Factory and Tavily (10) | Every call logged with model, tokens, credits, cost and latency; one line per model below | planned |

## What is real

| Piece | Status |
|---|---|
| `make verify` (typecheck, tests, trace re-check, trap set, copy lint, leakage stub, claims table) | built |
| Tavily search | planned |
| Tavily extract | planned |
| Token Factory `Qwen/Qwen3-30B-A3B-Instruct-2507` | planned |
| Token Factory `Qwen/Qwen3-Embedding-8B` | planned |
| Wayback first capture | planned |
| REPLAY traces | planned |
| Hosted caps and judge pass | planned |
| The eval | planned |
| Outside-user sessions | planned |

The only traces in the repo today are synthetic fixtures: an invented claim on invented pages, shown as SAMPLE ([fixtures/README.md](fixtures/README.md)).

**Where Patient Zero is wrong:** [docs/limits.md](docs/limits.md) lists every failure we know of, each with an example you can run, the rule that should catch it, whether it is caught today and who owns the fix. Rows that name a test are pinned by it, so the page can't say one of those gaps is closed while it is still open. The rest (print origins, search coverage, the roots count) are explained, not tested.

## For agents reading this repo

Start at [llms.txt](llms.txt), then [plan/README.md](plan/README.md), which says what every file in `plan/` holds.

- Decisions live in [plan/decisions.md](plan/decisions.md) (Vidyut's, with his words and dates).
- Rulings made during the build live in [plan/progress.md](plan/progress.md).
- Coordination between agents and teammates lives in [plan/board.md](plan/board.md).
- The claims list in [plan/plan.md](plan/plan.md) ("Claims we will make") is what `make verify` prints, one row per claim.
- The trace format is [schema/trace.schema.json](schema/trace.schema.json), exported from the Zod schema in [packages/pz/src/schema/](packages/pz/src/schema/trace.ts).

Teammates and their agents: read [docs/AGENTS.md](docs/AGENTS.md) first.

## Setup

1. Node 24, then `npm ci`.
2. Copy [.env.example](.env.example) to `.env` and fill it locally (`NEBIUS_API_KEY`, `TAVILY_API_KEY`). `.env` is git-ignored; never paste keys in issues, PRs or chat.
3. `make judge` and `make verify` need no keys. `make doctor` tells you what is missing and the fix for each line.

## Models (Nebius Token Factory)

- `Qwen/Qwen3-30B-A3B-Instruct-2507`: typed readouts, fingerprint, card sentence.
- `Qwen/Qwen3-Embedding-8B`: clustering copies (replaced `BAAI/bge-en-icl`, which returned 404).
