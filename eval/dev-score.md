# Dev score

One row per set per `make dev-score` run, newest last. E2 is the tuning set and E3 the check set: a change that helps E2 and hurts E3 is flagged. See `eval/dev-score.ts` for the rules.

| Date (UTC) | Commit | Set | False origins (+ unverified ORIGIN_FOUND) | Target cited | Earliest Pass / Partial / Fail | Cold stops | Scored | Credits | Seconds | Modes |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-17 18:38 | dab5a01 | E2 | 0 (+1) | 4/10 | 1 / 0 / 8 | 3/9 | 15 of 19 (+1 out of scope) | 297 | 1824 | LIVE |
| 2026-11-17 23:30 | 5cb6fd8 | E2 | 1 (+0) | 2/10 | 0 / 0 / 10 | 6/9 | 17 of 19 (+1 out of scope) | 254 | 1567 | LIVE |
| 2026-11-18 03:14 | ca430cc | E2 | 1 (+0) | 3/10 | 1 / 0 / 9 | 7/9 | 18 of 19 (+1 out of scope) | 217 | 1080 | LIVE |
| 2026-11-18 17:09 | 4c4b361 | E2 | 0 (+0) | 3/10 | 1 / 0 / 9 | 8/9 | 18 of 19 (+1 out of scope) | 224 | 1110 | LIVE |
| 2026-11-19 13:32 | 41deabe | E2 | 0 (+0) | 4/10 | 2 / 0 / 8 | 6/9 | 18 of 19 (+1 out of scope) | 234 | 1100 | LIVE |
| 2026-11-20 03:40 | 26caf73 | E2 | 0 (+0) | 4/10 | 2 / 0 / 8 | 6/9 | 18 of 19 (+1 out of scope) | 249 | 1176 | REPLAY RE-DECISION (#307), not a live run |

**The 2026-11-20 03:40 row is a replay re-decision, not a new live run** (origin experiment A, #307). The same recorded E2 traces were re-decided with the refined row 5: an unread cited page blocks an origin only when it bears on the claim (cited by the candidate origin, a page joined to it by an edge, or a fact-check whose address is about this claim), and a primary page needs a confident page type and a document address (not a dated article path or a list page). No search, fetch or model call was made; credits and seconds are the recordings' own. Two traces now end ORIGIN_FOUND, both on their expected origin: dev-10 on the World Economic Forum report (an alias of the Ellen MacArthur Foundation report) and dev-09 on the Science Advances paper. False origins stay 0, and the cold claims stay cold. The full per-trace replay table, including the gallery (where G4's earlier false origin no longer passes), is printed by the test in `packages/pz/test/origin-experiment.test.ts` and posted on #307.
