UNKNOWN (hero 0/3 live, replay routes walked k=1 on Mac Chrome) | JUDGE /100 rubric points (5 quoted criteria at their stated weights, same scale as judge-evening.md): now 81.5 (was 76.5 at Thu 22:17 ET, change +5) | potential 85.5 (if fixes 1 to 3 land) | C0 H1 M5 L5

# Judge, morning pass: Fri Nov 20, 07:57 ET

**JUDGE: 81.5/100 (+5 vs last night's 76.5) (C0 H1 M5 L5). CONFIDENCE: MEDIUM** (k=1 walk of the live app at 1440 and 390, plus a keyless `make verify` and `make judge` in a fresh clone of f655061; no new live trace, as the brief forbids, so the live claim path is checked by `/api/status` only).

**The video.** It is not made yet, so it is scored as pending, the same way as last night: 81.5 does not count it. With the approved script recorded well: about 83.5 (Opinion: +1 Works end to end, +1 Usefulness, because judges see a run instead of reading about one). Without any video at submission: about 73.5 (Opinion: a required part is missing, about -8).

1. The gain since last night comes from honesty work that landed: the held-out result is filled in, dev-10 and dev-09 now end on their expected origins on replay with 0 false origins, the unread pages are named, the paused-live fallback is in, and the cap is $2.50.
2. New HIGH: the same claim shows two endings on the landing. The hero says "By 2050 there will be more plastic than fish" ends **Origin found**, and two screens lower the answer check says the same sentence **went cold** ("no page it came from could be confirmed"). Nothing on the page says why. Rishit, 15 min.
3. The trace view says "Replayed from the recorded run of Nov 19" above "Origin found", but that live run ended cold; the origin comes from the Nov 20 replay re-decision. The README and dev-score.md say so; the app does not. Rishit, 30 min, with naming the origin first.
4. `make judge`, the README's two-minute keyless path, still shows two cold traces (dev-11, dev-04), not dev-10. `packages/pz/src/cli/judge.ts:18-23` says dev-10 joins once the archive fix lands; it has.

## Score per criterion

Weights are the event's, as quoted in `plan/intel.md` section 4 and `plan/HANDOFF.md` ("sourced and verifiable 30, works end to end 25, usefulness 20, agent design 15, use of Token Factory and Tavily 10"). The total is the sum of the per-criterion points on that stated 100-point split, the same scale as last night.

| Criterion | Weight | Evening | Morning | Delta | Evidence (one line) |
|---|---|---|---|---|---|
| Sourced and verifiable answers | 30 | 22 | 24 | +2 | `#/t/dev-10` ends Origin found on the WEF report with the quote, the Wayback date link and "Not counted against this origin: media.greenpeace.org, cavite.gov.ph (cited by www.snopes.com)"; `#/t/dev-02` lists "www.theguardian.com cited by www.snopes.com" as the unopened page. 2 of 20 committed dev traces end ORIGIN_FOUND, both on the expected page, 0 false origins (`eval/dev-score.md` row 2026-11-20 03:40). Held-out filled: 0 false origins, 0 of 6 targets cited (`eval/heldout-readout.md`). Held below 25 by H2 (two endings for one claim on one page) and M3 (the re-decided ending is not labelled in the app). |
| Works end to end | 25 | 20 | 21.5 | +1.5 | Keyless `make verify` exit 0: "Tests 1262 passed (1262)", "make verify passed in 18 s". `make judge` exit 0, summary "dev score E2: false origins 0 (+0), target cited 4/10, earliest 2/10 pass, held-out 0/6". CI and the clean-clone judge check both success on f655061 (`gh run list`). `/api/status` 07:52 ET: `{"live":true,"capUsd":2.5,"spentUsd":0.225459}`. Held at 21.5: 2 of 10 held-out traces failed outright, and the live claim path was not run today. |
| Usefulness | 20 | 12 | 13 | +1 | Try these now shows each real ending ("The trail goes cold · Back to 2021"); README "Where it stands" is four bullets; all six routes have no horizontal overflow at 390 (scrollWidth 390). Still, 18 of 20 recorded runs end without an origin (`#/traces`: cold 15, no pages 3, origin 2). |
| Agent design | 15 | 13.5 | 14 | +0.5 | The earliest-dated-page guard (#316, 6147a56) plus a replay gate over all 46 recorded traces caught the S7 false origin before it shipped, and the narrow unread exemption avoided last night's 3 replay false origins (dev-03, dev-06, dev-11 stay cold). |
| Use of Token Factory and Tavily | 10 | 9 | 9 | 0 | Unchanged: two Token Factory models and Tavily search plus extract per trace, usage rows per call. |
| **Total** | 100 | **76.5** | **81.5** | **+5** | |

No criterion is capped: there are no CRITICAL findings.

## Prize ranks

FIELD main prize: rank not judged (no gallery pasted, no `plan/rivals.md`; pairwise not run) | base rate not known (entrant count not published) | vs any rival: AB none, BA none, flips 0 -> no verdict | same-pick n/a vs 86%: UNSURE

## Evidence, opinion, uncertainty

**Evidence** (observed this morning)
- `make verify` and `make judge` exit 0 in a fresh clone of f655061 with an empty env (`env -i`), 1262 tests.
- Live app text at 1440: the hero says Origin found for the plastic claim; the landing's section 4 and `#/answer` say "3 statistics: 3 went cold" for an answer holding the same sentence (`fixtures/answers/s7-answer.json`, 3 x TRAIL_GOES_COLD, row 6).
- `#/t/dev-10`: the first page under "Earliest pages we found" is environmentaljusticetv.wordpress.com (January 2016, metadata), above www3.weforum.org; the ending line never names the origin.
- `#/traces`: "20 recorded runs and 7 examples. Counts are recorded runs only."; Origin found 2.
- `/api/status` at 07:52 ET: live, cap $2.50, spent $0.225.

**Opinion**
- Judges reading the landing top to bottom will notice the plastic claim's two endings; basis: both sit on the first page, about two screens apart.
- A good video adds about 2 points and its absence costs about 8; basis: the video is a required part and the judges cannot see the live walk any other way without spending the cap.

**Uncertainty**
- Whether a live claim works today: not run (forbidden). About 6 claims of headroom at the $0.37 reservation of last night's estimate; the Vercel `LIVE_TRACE_*` values were not read.
- Rivals' final builds and the judges' taste; this pass has no field.
- Which deployment is serving: no `plan/live.json`; page content matches #317 (the traces count note).

## Findings

| Sev | Finding | Evidence | State |
|---|---|---|---|
| H2 | One claim, two endings, one page. The landing hero shows "By 2050 there will be more plastic than fish in the ocean" ending Origin found (dev-10, 8 pages); the landing's section 4 and `#/answer` show the same sentence ending cold, "no page it came from could be confirmed" (S7, 5 pages, a different live run). Nothing explains the difference. | Landing innerText at 1440; `fixtures/answers/s7-answer.json` (all 3 TRAIL_GOES_COLD, row 6); `eval/dev-traces/dev-10.json` ORIGIN_FOUND | VERIFIED. Refutation tried: the sentences differ only by ", according to widely cited projections"; the S7 trace found 5 pages, dev-10 found 8, so the difference is real and explainable, which is why the fix is a note, not a rerun. |
| M3 | The app presents a re-decided ending as the run's own. `#/t/dev-10` reads "Replayed from the recorded run of Nov 19, 2026" over "Origin found"; that live run ended cold, and the origin comes from the Nov 20 replay re-decision. | `apps/web/src/components/TraceView.tsx:42`; `eval/dev-score.md` 03:40 row "REPLAY RE-DECISION (#307), not a live run"; `docs/limits.md:9` "No live run ended on an origin" | VERIFIED |
| M4 | The Origin found ending never names the origin, and the first "earliest page" listed is a WordPress blog (environmentaljusticetv.wordpress.com, same date), above the WEF report. | `#/t/dev-10` screenshot at 1440 (scratchpad `pw/dev10-1440.png`); `apps/web/src/model/ending.ts:24` | VERIFIED |
| M5 | `make judge` shows dev-11 and dev-04 (both cold), not the hero. The code comment's own condition for adding dev-10 is met. | `packages/pz/src/cli/judge.ts:18-23` `JUDGE_DEV_TRACES = ["dev-11", "dev-04"]`; judge.log lines 11 to 53 | VERIFIED |
| M6 | The CLI card still says "A page it cites could not be opened" without the page (the web fix #308 is web only), and the same card says "7 independent roots" and then "Traced to 0 roots we could link (7 clusters unlinked)". | `make judge` output for dev-11 | VERIFIED |
| M7 | 2 of 10 held-out traces failed outright (one bad model response at the fingerprint stage, one at verification). Disclosed; not fixable before the freeze. | `eval/heldout-readout.md` | VERIFIED |
| L3 | README decision table row 5 still says "no page it cites is left unread"; the rule now exempts pages cited only by an off-topic fact-check (`apps/web/src/model/stopCard.ts:19` says so). | README.md row 5 of the endings table | VERIFIED |
| L4 | `docs/limits.md:9` still gives dev-10 as a case where a listing ranks earlier than the report it quotes; dev-10 now ends on the report. | `docs/limits.md:9` | VERIFIED |
| L5 | README line 5: "live traces share a small shared budget" (repeated word). | README.md:5 | VERIFIED |
| L6 | `#/t/dev-02` says "No dated page with the claim" and "back to before November 2026" while Copies and roots lists scientificamerican.com dated 2014-04-15. It reads like a bug, though the SciAm page is a discussing page and the only search window is 2026-11-19. | `#/t/dev-02` innerText; `eval/dev-traces/dev-02.json` endDate 2026-11-19 only | VERIFIED as shown |
| L7 | "a primary source with a confirmed date" for a date that is "Online by this date: first Wayback Machine capture", while the README says "publication date not established". | `ending.ts:24`; README caption under the screenshots | VERIFIED |

### Carried from last night

| Id | Sev | Status | Proof |
|---|---|---|---|
| H1 (lifetime $1.50 cap) | H | FIXED | Cap raised: `/api/status` 07:52 ET `capUsd 2.5`; fallback d327310 (#308) with `apps/web/src/components/ClaimBox.test.tsx` passing in the 1262. The cap is still lifetime, now with headroom and a non-dead-end paused state. |
| M1 (unread page not named) | M | FIXED on the web (d327310, `apps/web/src/model/unread.test.ts`; seen on `#/t/dev-02` and `#/t/dev-10`); OPEN in the CLI as M6 | |
| M2 (rule change unsafe) | M | FIXED | 6147a56 (#316) guard and the replay gate test over 46 traces; dev-score 03:40 row: false origins 0, cold stops 6/9 |
| M3 (held-out slot empty) | M | FIXED | ea58e74 (#318); `make judge` prints "held-out 0/6" |
| L1 (Try these label) | L | FIXED | b9fcbb7 (#306); landing shows "The trail goes cold · Back to 2021" |
| L2 (README wall of runs) | L | FIXED | 001ac42 (#305); four bullets observed |

## Claims audit (README, landing, `#/how`, `#/answer`, `docs/submission.md`)

| Claim | Where | Status | Evidence |
|---|---|---|---|
| "live traces share a small shared budget" | README:5 | MATCH (wording L5) | Not daily any more; `/api/status` cap 2.5 |
| "0 wrong origins on our 20-claim tuning set" | landing point 1 | MATCH | dev-score rows 2026-11-19 13:32 and 2026-11-20 03:40; G4 named in the body |
| dev-10 ends on WEF, dev-09 on Science Advances, "on replay, no new live calls" | README, landing, submission | MATCH | committed dev-09/dev-10 decision.state ORIGIN_FOUND; dev-score 03:40 row |
| Held-out: 0 false origins, 0/6 cited, 2 of 10 failed, 94 credits | README, submission | MATCH | `eval/heldout-readout.md` |
| Held-out hash "committed before most engine stages" | submission | MATCH | `eval/heldout.sha256` first commit 637f166, 2026-11-08 |
| Caps: 150 credits, $0.50, 8 hops, 5 pages a round | submission, README | MATCH (credits, usd checked) | `packages/pz/rules/rules.json` credits 150, usd 0.5; hops and pages not re-read |
| "It runs in CI on every push" | submission | MATCH | `gh run list`: CI and Clean-clone judge check success on f655061 |
| "Recorded traces ... filtered by ending" | submission, `#/traces` | MATCH | 6 ending filters, counts 15/3/2 |
| "3 statistics: 3 went cold" | landing, `#/answer` | MATCH, but conflicts with the hero (H2) | s7-answer.json |
| "8 pages, 6 roots, 2 copies" for dev-10 | landing, `#/how`, trace | MATCH | dev-10 counts pages 8, clusters 6 |
| "The earliest page is a primary source with a confirmed date" | trace, `#/how` | MISMATCH in spirit (L7) | the date is a first Wayback capture, "publication date not established" |
| "no page it cites is left unread" (row 5) | README | MISMATCH (L3) | stopCard.ts:19 states the exemption |
| A false origin the gate caught (S7, #316) | submission | MATCH | 6147a56 |
| "Replayed from the recorded run of Nov 19" over Origin found | trace view | MISMATCH by omission (M3) | that live run ended cold |

## Top 5 fixes, ranked by points per hour (all before the Fri 14:00 ET freeze)

| # | Fix | Owner | Time | Points | Why |
|---|---|---|---|---|---|
| 1 | Record and link the demo video on the approved script; fill the video slot in README:7 and `docs/submission.md`. | Vidyut and XO | about 3 h | +2 with it; avoids about -8 without it | A required part of the submission; the largest swing left. |
| 2 | Explain the plastic claim's two endings (H2): under the answer check's plastic card, one line: "Same claim as the trace above, a different run: this one found 5 pages and not the WEF report, so it stops cold. Each run is judged on its own evidence." Link `#/t/dev-10`. | Rishit | 15 min | +1 (protects Sourced) | Both endings sit on the landing a judge reads first. |
| 3 | In the trace view, name the origin and label the re-decision (M3, M4): ending line "Origin found: World Economic Forum report, www3.weforum.org, online by January 20, 2016"; list the origin first among the earliest pages; under the replay line add "Ending re-decided on Nov 20 from this recording by the refined origin rule (#316); the live run ended cold." | Rishit | 40 min | +1 (Sourced) | Honesty is the pitch; a judge who reads `docs/limits.md:9` after the trace should not feel misled. |
| 4 | `make judge` shows dev-10 (add it to `JUDGE_DEV_TRACES`, update `doctor-judge.test.ts`) and the CLI card names the unread page and drops the "0 roots we could link" contradiction (M5, M6). | Rohan | 45 min | +0.5 to +1 (Works end to end) | The README sends every judge to `make judge` first, and it never shows an origin. |
| 5 | Copy sweep: README row 5 exemption (L3), `docs/limits.md:9` dev-10 line (L4), README:5 "small shared budget" (L5), "confirmed date" to "a dated primary source" or "online by a confirmed date" (L7). | Anoop (Rishit if Anoop is out of usage) | 20 min | +0.5 | One-click contradictions between repo files. |

Not a fix: M7 (2 of 10 held-out traces failed) stays disclosed; no engine change before the freeze.

BOARD: [07:57 ET] master-auditor judge-morning: 81.5/100 (+5); H2 the plastic claim shows Origin found and cold on the same landing; trace view hides the re-decision; make judge skips dev-10 | @Rishit fixes 2, 3 | @Rohan fix 4 | @Anoop fix 5 | @Vidyut video

```
CHECKED_AT: Fri Nov 20 07:57 EST 2026
SUBJECT: vs-githjk/odsc-nebius-hackathon@f655061 (only plan/heartbeat.jsonl untracked) | https://patient-0.vercel.app (build not pinned: no plan/live.json; content matches #317)
CHECKED: README.md, docs/submission.md, docs/limits.md:9, eval/heldout-readout.md, eval/dev-score.md, all 20 eval/dev-traces decisions, fixtures/answers/s7-answer.json, packages/pz/src/cli/judge.ts, apps/web/src/model/ending.ts, stopCard.ts, TraceView.tsx:42, rules.json caps; make verify and make judge in a fresh scratchpad clone with an empty env (both exit 0, 1262 tests); gh run list; live app #/, #/t/dev-10, #/t/dev-02, #/answer, #/traces, #/how at 1440 and 390 (overflow probe on all six); GET /api/status
NOT CHECKED: a new live trace (forbidden, the cap is shared); the paused state on prod (needs the cap spent); the Vercel env values; dark mode; a non-Claude judge panel (not run this pass, so k=1 and one model); the video (not made)
UNRESOLVED: how many live claims are left (needs LIVE_TRACE_* in Vercel); which deployment serves (needs master-guardian to write plan/live.json)
```
