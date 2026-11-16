# Judge pass, Sun Nov 15 (master-auditor, judge mode)

**JUDGE: 38/100 today (C1 H3 M3 L1). Reachable by Nov 18: about 74 if live traces land, about 50 if not. CONFIDENCE: MEDIUM** (direct evidence, one run per command, no video, no panel).

1. Next: get one machine that reaches Token Factory running live traces today (Vidyut or Anoop with Rohan's #107 capture code). Vidyut picks who.
2. Vidyut decides: no held-out run Mon Nov 16 unless a live E2 dev score exists; otherwise Tue Nov 17.
3. Before submit: make the repo public and add a LICENSE (both missing).

Subject: main @ 5a52762, fresh clone, `npm ci`, Node 26.13.

## 1. Score today

| Criterion | Wt | Today | Why | Nov 18 if it lands |
|---|---|---|---|---|
| Sourced | 30 | 2/5 = 12 | Two-span edges and `pz verify` (48 of 48 spans) are strong, but only on the invented penguin fixture; the real spike traces name false matches as earliest on 4 of 6 claims (`eval/spike-postmortem.md`) | 4/5 = 24 |
| Works end to end | 25 | 1/5 = 5 | `npm run pz -- trace "<dev-01>"` prints `trace_failed`, exit 1; `make live` prints `not built yet`; `make replay` dumps one JSON line of a SAMPLE trace | 4/5 = 20 |
| Usefulness | 20 | 2/5 = 8 | Named user is good; no real trace, no video, no outside-user session | 3/5 = 12 |
| Agent design | 15 | 3/5 = 9 | Code-decided stop states (`rules/decide.ts`), typed logprob gate, adapter boundary; README has no architecture overview or walked trace | 4/5 = 12 |
| Token Factory and Tavily | 10 | 2/5 = 4 | Clients with usage rows and ceilings exist; README: "today only the spike scripts call them"; one Qwen chat plus one embedding | 3/5 = 6 |
| **Total** | 100 | **38** | | **74** |

## 2. Why it reads as simplistic

1. **Nothing real comes out.** `make verify` passes (355 tests, 9 s), then lists C1 to C29 all `planned`. README "What is real": 9 of 10 rows `planned`. The one trace a judge can open is "Harbor Zoo penguins nap 14 times a day".
2. **The engine is islands.** `engine/intake`, `queries`, `cluster`, `blame` and `walk` have no production caller (grep of `packages/`, `apps/`). `pz trace` throws "Live adapters pending" without `--pipeline <module>` (`packages/pz/src/cli/trace.ts:21`), and no such module exists on main. PR #129: "Nothing on main calls planQueries yet."
3. **The only measured result is a loss.** `spike/grading.md:150-153`: Perplexity 4/4 targets cited, ours 1/4, 0/6 earliest. Dev score since: 0/20.
4. **Process outweighs product.** 162 of 470 tracked files are `plan/`; about 7,300 lines of TypeScript; 4 of 6 open PRs are drafts waiting on one live runner (#107 #108 #109 #110).
5. **Thin sponsor use, no citation following.** One chat model; Tavily `extract` exists in the client but is marked planned; citation following, the post-mortem's second cause, sits in draft #110.

## 3. Improvements by points per hour

| # | Change | Line | Gain | h | Owner | Live? |
|---|---|---|---|---|---|---|
| 1 | Second live runner whose network reaches Token Factory runs #107 with the same ledger and ceilings (or Rohan tries another network) | Works, Sourced | unlocks most of +36 | 1 | Rohan, Vidyut decides | blocker |
| 2 | Hold held-out until a live E2 dev score prints | eval (C7, C8) | protects ~10 | 0 | Vidyut | yes |
| 3 | Adapter factory on main (`engine/pipeline.ts`) wiring every stage to the real clients; keyless run says `not_configured`, not `trace_failed` | Works | +8 | 5 | Rohan | proof only |
| 4 | Commit 3 to 5 reviewed LIVE traces as REPLAY (origin found, cold, tool failed); one becomes the `make replay` default and the web view's first trace; GIF in README | Sourced, Works | +7 | 3 | Rohan, Rishit | yes |
| 5 | Readable output: `make replay` and `pz trace` print a card (state, rule row, earliest page, date, checked sentence, link, roots, cost, time); `--json` for raw | Usefulness, Works | +3 | 2 | Rishit | no |
| 6 | README: mermaid architecture, one walked trace with its tool calls, per-call usage table, dev and held-out numbers with the spike loss, stale rows fixed (`make replay` is built) | Design, Works, TF/Tavily | +4 | 2 | Anoop | partly |
| 7 | Forced Tavily failure ends TOOL_FAILED, empty search ends NO_PAGES_FOUND, both replayable keylessly | Works | +2 | 2 | Anoop | no |
| 8 | Merge citation following (#110) plus Wayback reads, behind the dev score | Sourced | +3 | 4 | Rishit, Anoop | yes |
| 9 | Second Token Factory model family cross-checks `same_claim` (disagreement is unsure); check the Nov 9 deprecation list first | TF/Tavily, Sourced | +2 | 3 | Anoop | yes |
| 10 | Multi-claim answer mode: wire `engine/intake` for a pasted AI answer (C11) | Usefulness | +2 | 3 | Anoop | yes |
| 11 | Static deploy of the web view on REPLAY traces (Vidyut's OK) | Usefulness | +2 | 2 | Rishit | after 4 |
| 12 | MCP server exposing `pz_trace`, `pz_verify` | Usefulness | +1 | 3 | Rishit | yes |

## 4. Red flags

| Sev | Flag | Evidence |
|---|---|---|
| C | No live trace path on main and the only live runner is blocked | `cli/trace.ts:21`, no pipeline module, dev 0/20 |
| H | Repo is private; a public repo is a hard requirement | `gh repo view`: `PRIVATE` |
| H | Held-out Monday would be the first run of an unmeasured engine; the set is spent once and becomes the headline | decisions.md Nov 12; board "E2 0/20 scored" |
| H | Every claim `planned`; at freeze with no traces the README and video have nothing real | `make verify` claims table |
| M | `make replay` default shows an invented trace as raw JSON | `Makefile` `TRACE ?=` |
| M | No LICENSE | `git ls-files` |
| M | Spike grading is "Not fully blind"; do not cite it as a clean baseline | `spike/grading.md:11` |
| L | `plan/usage-keys.txt` is tracked; holds a path slug, no key, but the name alarms | 2 lines, 0 key-shaped strings |

## Provenance

CHECKED_AT: Sun Nov 15 20:55 EST 2026
SUBJECT: vs-githjk/odsc-nebius-hackathon main @ 5a52762 (clean, no newer origin commits)
CHECKED: submission.md, intel.md s4, plan.md claims, decisions.md tail, README, spike/grading.md, eval/spike-postmortem.md, HANDOFF, board tail; PRs #77 #107 #108 #109 #110 #129; `make verify`, `make replay`, keyless `pz trace` x2; caller greps; CI on main
NOT CHECKED: video or script; web app in a browser; PR branch code; live calls; non-Claude panel
UNRESOLVED: whether Rohan's block is network or account (a models-endpoint request from another network settles it); whether 74 holds before the first live dev score
