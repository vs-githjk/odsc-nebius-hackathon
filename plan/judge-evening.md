# Judge, evening rerun: Thu Nov 19, 22:17 ET

**JUDGE: 76.5/100 (+5.5 vs the morning's 71) (C0 H1 M3 L2). CONFIDENCE: MEDIUM** (k=1 walk of the live app plus a keyless `make verify` and `make judge` run; nothing new was traced live, so the live path is checked by the status endpoint and the 16:35 smoke log only).

1. Biggest risk: the live cap does not reset each day. $0.23 of $1.50 is spent and every new claim reserves about $0.37, so at the default settings about 3 new claims from anyone pause live for every judge. Vidyut decides the judging-window budget; Rishit makes the paused state send people to the recorded traces.
2. The gain since this morning comes from the live app and the site, not the engine. All 20 real traces still end cold or with no pages, and the held-out slot is still empty.
3. Fix the README's "daily budget" line and the landing's "It names no wrong origin" headline tonight (Anoop, 20 min). Both overclaim against the repo.
4. The demo video does not exist yet. It is a required part of the submission and gates every score here.

## Score per criterion

| Criterion | Weight | Morning | Evening | Delta | Evidence (one line) |
|---|---|---|---|---|---|
| Sourced and verifiable answers | 30 | 21 | 22 | +1 | `#/t/dev-10` shows each page with how its date was proven, "Open the page" and "Open the capture", and the earliest page is now the WEF report (an alias of the true origin, `eval/dev-claims.json` dev-10). Still 0 of 20 real traces end ORIGIN_FOUND, the gallery got 0 HIT on its 4 findable origins with 1 false origin (G4, `docs/gallery.md`), and the ending "A page it cites could not be opened" never says which page. |
| Works end to end | 25 | 17.5 | 20 | +2.5 | The live app answers `/api/status` 200 `{"live":true,"capUsd":1.5,"spentUsd":0.225459}` (fetched 22:15 ET). Keyless `make verify` exits 0 ("Tests 1222 passed (1222)", "make verify passed in 19 s") and `make judge` exits 0 on 8b165d1. Held at 20 by H1: the cap is lifetime, not daily (`packages/pz/src/live/store.ts:15-25`, only the IP and day keys get EXPIRE). |
| Usefulness | 20 | 10 | 12 | +2 | The landing, `#/answer`, `#/traces` (27 traces, search, filter by ending) and `#/how` read clearly at 1440 and 390 (no horizontal overflow at 390). But the answer a user came for is nearly always "The trail goes cold": 17 of 20 dev traces, and all 3 statistics on the answer page. |
| Agent design | 15 | 13.5 | 13.5 | 0 | Typed questions with logprobs, a code decision table (`packages/pz/src/rules/decide.ts:81-124`), verbatim spans that `pz verify` re-checks ("11 of 11 spans re-verified"), and an MCP server (#294). M2 below is a design flaw no judge will see from the README. |
| Use of Token Factory and Tavily | 10 | 9 | 9 | 0 | Two Token Factory models and Tavily search plus extract are live in every trace, with usage rows per call and a usage report (#289). The cost is almost all Tavily ($0.08 median), and the README says so. |
| **Total** | 100 | **71** | **76.5** | **+5.5** | |

No criterion is capped: there are no CRITICAL findings.

## Findings

| Sev | Finding | Evidence | State |
|---|---|---|---|
| H1 | Live tracing has a lifetime cap of $1.50, not a daily one. About 3 new claims from anyone (at the default $0.37 reservation each) pause live until someone resets Redis. Judges review after Friday, so the first to arrive may use it up. | `store.ts:18-19` checks `spent + amount > cap`. `pz:spent_micros` is never given EXPIRE: only the IP key (7200 s) and the day key (172800 s) are, at `store.ts:22-23`. README line 315: "Reservations and the spend counter have no TTL". Live status says spent $0.225 of $1.50. | VERIFIED (code + status). The exact number of claims left is UNRESOLVED: it depends on `LIVE_TRACE_CREDITS` and `LIVE_TRACE_MODEL_USD` in Vercel, which were not read. |
| M1 | The ending "A page it cites could not be opened" never names the page. On the hero trace dev-10, both unread pages (media.greenpeace.org and cavite.gov.ph) are cited by an off-topic Snopes sperm-whale fact-check, not by the WEF report. | `eval/dev-traces/dev-10.json` candidateParents on the second snopes.com node. `decide.ts:83` sums unread parents over all nodes, meta pages included. | VERIFIED |
| M2 | The unread-parent rule works as a blunt safety net. Changing it is NOT a free win. Clearing the meta pages' candidateParents and replaying the decision on dev-10 gives ORIGIN_FOUND on the WEF report, and on dev-09 on the true Science Advances paper, but it also gives false origins on dev-03 (Scientific American, a cold claim), dev-06 (a PubMed paper, a cold claim) and dev-11 (CNBC instead of CDP). | Simulation in the scratchpad (`sim2.ts`, a replay of `decideStopState` on the recorded traces). | VERIFIED. Do not ship a rule change before the freeze: 2 true origins against 3 false ones breaks the 0 false origins headline. |
| M3 | The held-out slot is still empty in the README, `docs/submission.md` and `make judge` ("held-out not run yet"). | `make judge` summary line; `docs/submission.md` "[SLOT: held-out origin hits X of 10 ...]" | VERIFIED |
| L1 | The landing's "Try these" shows "Americans check their phones 96 times a day." with the label "Another page gives a different number", while its trace ends TRAIL_GOES_COLD. The other three cards show their ending. | Landing innerText; `eval/dev-traces/dev-14.json` decision.state TRAIL_GOES_COLD. | VERIFIED as shown. The cause is UNCONFIRMED: it is probably the boundary reason shown in place of the ending. |
| L2 | README "Where it stands" is one paragraph of about 400 words that walks through four superseded runs before the final numbers. | README.md line 36 | VERIFIED |

## Claims audit (README, landing, `#/how`, `#/answer`, `docs/submission.md`)

| Claim | Where | Status | Evidence |
|---|---|---|---|
| "live traces share a small daily budget" | README line 5 | **MISMATCH** | The spend counter never expires (`store.ts:22-23`). README line 315 contradicts it: "the spend counter have no TTL". |
| "It names no wrong origin" (headline of point 1) | landing | **MISMATCH** (the headline overclaims) | The body scopes it to the 20-claim tuning set (0, which matches `eval/dev-score.md`). But the gallery run of the same day named a false origin: G4, beyondgreenspace.net, `docs/gallery.md`. |
| 0 false origins, target cited 4 of 10, earliest 2 / 0 / 8, cold stops 6/9 | README, landing, submission | MATCH | `eval/dev-score.md` row 2026-11-19 13:32, 41deabe |
| Median 44 s and $0.08, both targets missed | landing, submission | MATCH | `eval/perf.md` |
| "8 pages, 6 roots, 2 copies" for dev-10 | landing, trace | MATCH | dev-10 decision.counts: pages 8, clusters 6 |
| "two pages the trace cites could not be opened" | README step 5 | MATCH, misleading by omission | Both are cited by an off-topic Snopes page, not the report (M1). |
| "3 statistics: 3 went cold" | landing, `#/answer` | MATCH | `#/answer` innerText; `fixtures/answers/s7-answer.json` |
| "takes about 40 seconds" | `#/how` | MATCH (approximate) | perf.md median 44 s |
| Keyless `make judge` and `make verify` work | README | MATCH | Both exit 0 in a fresh clone of 8b165d1 with provider keys unset |
| Gallery: 2 HIT, 1 PARTIAL, 4 MISS, 1 not graded | submission | MATCH | `docs/gallery.md` totals |
| "It runs in CI on every push" (verify) | submission | UNVERIFIABLE here | CI runs were not checked (`gh run list` not run) |
| Rematch "not completed ... we claim none" | submission | MATCH | decision 176 |

## Top 5 fixes, ranked by points per hour (all before the Fri 14:00 ET freeze)

| # | Fix | Owner | Time | Points | Why |
|---|---|---|---|---|---|
| 1 | Fix the two overclaims. README line 5: "live traces share a small fixed budget". Landing point 1 headline: "No wrong origin on our tuning set", plus one line: "In the 8-claim gallery it named one (G4), linked." | Anoop | 20 min | +1 (protects Sourced and the credibility of every other number) | Both MISMATCHes are one click from the repo for a judge. |
| 2 | **Protect live for the judges (H1).** (a) Vidyut decides: raise `LIVE_USD_CAP` for the judging window, or keep $1.50 and pause live until after submission. Both are spend decisions, so the team does not make either one. (b) Rishit: when status says paused, the claim box says "Live tracing is paused; these recorded traces open free" and shows Try these, instead of a dead end. | Vidyut (decision), Rishit (b) | 45 min | +1.5 to +2.5 (Works end to end) | A judge who types a claim and hits "budget reached" sees the app as broken. |
| 3 | Name the unread page in the ending: "A page it cites could not be opened: media.greenpeace.org (cited by snopes.com)", with the link. The data is already in `nodes[].candidateParents`. | Rishit | 1 h | +1 (Sourced) | "Checkable" is the whole pitch, and today the reason a trace went cold can't be checked from the UI. |
| 4 | Run the held-out set once on the frozen engine (10 claims, about $0.80, needs Vidyut's go and Rohan's own approval), and fill the slot whatever the result. | Rohan | 1 h | +1 to +2 (Sourced, Works end to end) | An empty held-out slot shows in three places and reads as unfinished. An honest held-out number is the strongest proof here that does not depend on the engine changing. |
| 5 | Cut README "Where it stands" to 4 lines (the final numbers, what is not measured, a link to the run history), and make the landing's "Try these" show each trace's ending (L1). | Anoop (README), Rishit (L1) | 40 min | +0.5 (Usefulness) | The first screen a judge reads after the hero is a wall of superseded runs. |

Not a fix, a gate: the demo video (script and storyboard approved) is a required part of the submission. Without it, every criterion above drops.

Not recommended before the freeze: changing the unread-parent rule (M2). The replay shows 2 true origins and 3 false ones. A safe version needs a page-type fix (CNBC and Scientific American typed as "report") and an E3 check, which the time left does not allow.

BOARD: [22:17 ET] master-auditor judge-evening: 76.5/100 (+5.5); H1 the live cap is lifetime, about 3 new claims left; README "daily budget" and landing "no wrong origin" overclaim; plan/judge-evening.md | @Anoop fix 1 | @Rishit fixes 2b, 3 | @Rohan held-out | @Vidyut live cap decision

```
CHECKED_AT: Thu Nov 19 22:17:14 EST 2026
SUBJECT: vs-githjk/odsc-nebius-hackathon@8b165d1 (clean) | https://patient-0.vercel.app (build not pinned: no plan/live.json)
CHECKED: README.md, docs/submission.md, eval/dev-score.md, eval/perf.md, docs/gallery.md, plan/decisions.md, plan/morning-report.md, packages/pz/src/rules/decide.ts:70-124, packages/pz/src/live/store.ts:15-30, all 20 eval/dev-traces decisions; make verify and make judge in a fresh scratchpad clone with keys unset (both exit 0, 1222 tests); live app #/, #/t/dev-10, #/answer, #/traces, #/how at 1440 and 390, GET /api/status; decision replay simulation on dev-03/06/09/10/11
NOT CHECKED: a new live trace (forbidden, the cap is shared); which deployment or SHA is serving (no plan/live.json; content matches #301); CI runs; the Vercel env values; the video (not made)
UNRESOLVED: how many live claims are left (needs the Vercel LIVE_TRACE_* values); whether live results stream correctly today (only the 16:35 ET smoke log in plan/github-log.md:155 and spentUsd > 0 support it)
```
