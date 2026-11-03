# Patient Zero

For a reporter or fact-checker with one viral number and a deadline: paste a number, a quote or an AI answer, and Patient Zero will walk each claim backwards through time to the earliest source it can find, count how many separate roots the copies trace back to, and mark the earliest page where the wording changed.

Team **Says Who**, ODSC x Nebius Hackathon 2026. Built on Nebius Token Factory and Tavily.

**Trace GIF:** coming with the first real trace.

## Run it

| Command | What it does | Status |
|---|---|---|
| `make verify` | Re-checks every committed trace, the trap set, the copy lint and the leakage test, then prints the claims table. No API keys needed. | works now |
| `make replay` | Will replay a recorded trace with its original usage rows | not built yet |
| `make live CLAIM="..."` | Will run a live trace with your own keys | not built yet |

## Eval

| Claim set | Origin hit rate | Full trace vs baseline ladder | Full trace vs consumer tools | Cost p50 / p90 | Time to stop state p50 / p90 |
|---|---|---|---|---|---|
| Held-out (10 claims) | not run yet | not run yet | not run yet | not run yet | not run yet |

## For judges

| Rubric line | Where it will be shown | Status |
|---|---|---|
| Sourced (30) | Every edge rests on two verbatim spans; `make verify` re-checks spans, edges and the stop state of every committed trace ([packages/pz/src/verify/checks.ts](packages/pz/src/verify/checks.ts)) | built on synthetic fixtures; real traces planned |
| Works (25) | `make replay` and `make live CLAIM="..."`; public CI running `make verify` ([.github/workflows/ci.yml](.github/workflows/ci.yml)) | `make verify` and CI built; replay and live planned |
| Usefulness (20) | Two outside-user sessions timed against their usual method; demo video | planned |
| Agent design (15) | Code decides how a trace ends ([packages/pz/src/rules/decide.ts](packages/pz/src/rules/decide.ts), [packages/pz/rules/rules.json](packages/pz/rules/rules.json)); planted trap set ([traps/README.md](traps/README.md)) | built |
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
3. `make verify` needs no keys.

## Models (Nebius Token Factory)

- `Qwen/Qwen3-30B-A3B-Instruct-2507`: typed readouts, fingerprint, card sentence.
- `Qwen/Qwen3-Embedding-8B`: clustering copies (replaced `BAAI/bge-en-icl`, which returned 404).
