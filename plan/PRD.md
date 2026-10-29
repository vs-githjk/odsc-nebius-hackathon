# Patient Zero: PRD (short)

Team Says Who · master-planner · 2026-10-29 · goal odsc-pz-build-plan
Source of truth for the idea: `plan/idea-brief.md` round 3 (GATE 2 approved 2026-10-29: "Yes, I approve the plan"). This PRD is the short version builders work from; where they differ, the brief and `plan/decisions.md` win.
**Safe for Anoop:** this file names no claim origins and no spike targets.

## Problem
A statistic online usually has one parent and hundreds of copies. Search engines and chatbots show the copies. Finding the parent, and the point where the wording changed, is slow manual work that fact-checkers describe as "hours of debate for every check".

## User and decision
- **Demo user:** a reporter or fact-checker at a small newsroom with one viral number and a deadline. Decision: "can this number run, and what is the true version?"
- **Second entry:** anyone holding an AI answer with numbers in it (paste the answer, every number gets a quick look).

## What it does (one line)
Paste a number, a quote or an AI answer; Patient Zero walks each claim backwards through time to the earliest source it can find, counts how many separate roots the copies trace back to, and marks the earliest page where the wording changed. Every edge rests on two verbatim spans; code, never the model, decides how the trace ends.

## Goals (judged on the ODSC rubric: Sourced 30, Works 25, Usefulness 20, Agent design 15, Token Factory and Tavily 10; target 96+)
1. Every claim on screen is backed by a stored verbatim span with its page, date, match tier and link.
2. A trace ends in one of six code-decided states (ORIGIN FOUND, CONFLICTING, TRAIL GOES COLD, PARTIAL, TOOL FAILED, NO PAGES FOUND) with "How this was decided".
3. A judge can check everything with one keyless command (`make verify`) and watch it go green in public CI.
4. The time-machine scrubber, word blame and distortion readouts make the mutation obvious in five seconds, and every moving thing is driven by stored evidence.
5. Every Token Factory and Tavily call is logged with model, tokens, credits, cost and latency (LOCKED).

## Non-goals
Print or paywalled origins; "who invented" a claim; a blended "distortion score"; a general fact-checker; posting anywhere (Community Notes is What's next); a share image (cut, LOCKED).

## Scope by layer (from the brief; dates are the plan's runs)
| Layer | Window | Ships |
|---|---|---|
| Run 1: foundations and spike | Oct 29 to Nov 1 | Repo skeleton, shared Zod schema, synthetic fixture traces, number rules, stop-state table, `pz verify`, trap-set harness, `make verify` in CI, README skeleton for judges and their agents, Tavily and Token Factory clients, typed decision layer, the week-0 spike and its blind grading, the light-first app shell with the Time Machine trace view, scrubber, blame, readouts, roots counter, stop states and the Rewind scroll story, all against fixture traces |
| Run 2: core gate | Nov 2 to Nov 8 | The search engine (intake, fingerprint, time-walk search, spans and links, dating, clusters and roots, readouts and blame, page type, card), `pz trace` CLI, REPLAY recording, trap set from the spike cache, Jev ablation harness; re-cut on Nov 1 from the spike report |
| Layer 1 | Nov 9 to Nov 14 | Live trace in the UI, scan mode, origin card permalink, hosted URL with caps and judge pass (deploy waits for Vidyut's go), eval dev tuning, held-out run Nov 13, baseline ladder, README first screen |
| Layer 2 | Nov 15 to Nov 17 | Zero In (LOCKED), two outside users, citation-open check, walkthrough, Zombie Stat Atlas, researcher mode (conditional, first to give) |
| Freeze | Nov 18 to Nov 19 | Video, README numbers, submit by D-3h (internal D Thu Nov 19 23:59 PT) |

## Success metrics (published as measured, misses included)
- Held-out origin-reached on 10 claims with targets pre-registered by hash; wrong origins counted.
- Baseline ladder and consumer head-to-head with per-claim wins, graded blind.
- Trap set: wrong origins and the four false-certainty checks 0 of n, with the 95% upper bound, labelled "planted by us".
- p50 and p90 cost, time to first node (target under 20 s), time to stop state.
- `make verify` green in public CI in under 60 s.

## Stack (planner's pick)
TypeScript end to end on Node 24 LTS, one shared Zod 4 schema for the trace and the typed decision layer, Vite 7 plus React 19 for the front end, Vitest 4 for tests. Why: one schema gives the Token Factory `json_schema`, the stored trace types, the UI types and the CI drift check from a single file, and the front end the designs need is TypeScript anyway; no part of the brief needs Python (no ML training, the APIs are plain HTTPS). Details and exact versions: `plan/plan.md`, Global Constraints.

## Constraints that bind every task
Fresh code only (no copying from Vidyut's other repos); keys only in `.env`; full page text never committed (spans with small context, offsets and hashes only); no em or en dashes in any copy; blinding rules (Rohan never edits prompts, rules files, thresholds or question wording; Anoop stays blind until his head-to-head is complete); any deploy, cap change or env var change waits for Vidyut's explicit go.
