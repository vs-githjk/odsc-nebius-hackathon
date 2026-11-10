# Week-0 spike report

Run 2026-11-02, about 18:35 PT, by RishitRai with `spike/walk.ts` at commit 83a1e71. That is one run per claim with fixed rules and no reruns. The claims and their atoms were committed in 83a1e71 before any spike call, and Rohan's target hashes were on #10 before the run.

**Total: 63 Tavily credits (about $0.50 at the $0.008 list price), $0 Token Factory, 2.4 minutes of walking.** All 6 traces passed `pz verify` at run time, both on their own and against their saved pages (`--pages .cache/pages/<id>`). Under the T4, T5 and T6 rules reviewed later, two checks now differ; see "Run 1 under the reviewed rules".

**This is the only run.** On #10, XO decided against a rerun: the reviewed T4 fix would not change the false matches below, and choosing a stricter rule is tuning, so it belongs on the dev set (#59).

Whether a trace reached its target is graded blind by Rohan in T20 against the hashed targets. Nothing below grades it.

## Bottom line

The machinery works. Every trace walks back through dated windows, stays far inside every cap, ends in a code-decided state and re-verifies span by span.

The matching rule is too loose for small numbers, and that is the main finding. Under the T4 number rules, a number with fewer than 3 significant digits counts whenever the subject word is anywhere in the same sentence. On claims 1, 2, 4 and 6, the earliest page we report is a sentence that does not state the claim:

| Claim | Earliest page we report | Its span, verbatim (end of it) |
|---|---|---|
| 1 | hotrod.com, 1994 | "...that's why we've invested deeply to make the content available to you in a modern and accessible format." |
| 2 | prsecrets.com, 2005 | "Get The 100-Word Email That Can Get The Media To Call You!" |
| 4 | wired.com, 2013 | "Google X Head on Moonshots: 10X Is Easier Than 10 Percent." |
| 6 | frontiersin.org, captured 2024 | "...predicted their biological functions (8, 9)." |

Claims 3 and 5 look like real matches: each earliest span states the claim's numbers in the claim's context.

A stricter rule is listed under "Candidate rules (not applied)" and is measured on the dev set in #59.

## The five pass-bar lines

| # | Pass line | Result | Evidence |
|---|---|---|---|
| 1 | Target reached on two thirds of the known set, through a path with no meta node | **Not graded here** | Rohan grades in T20. Expect it to fail on claims 1, 2, 4 and 6 (table above). |
| 2 | No wrong origin anywhere | **Yes as stated, with a caveat** | No trace ends ORIGIN FOUND, and none can until page types exist (T19). But the earliest page reported for claims 1, 2, 4 and 6 is a false match, so a grader comparing earliest pages will see wrong earliest pages. |
| 3 | At least 2 traces with 3 or more hops between clusters, and at least one link-verified edge | **Yes on paper, no in substance** | claim-1 has 5 hops and claim-2 has 8, but every hop except one is inferred by date order alone. One link-verified edge in the run: claim-2 `e6`. |
| 4 | At least 1 mutation hop with both spans verbatim and the parent matched on atoms | **Yes** | claim-2 `e6`, explicit: washingtonpost.com (2024-09-18) to techrepublic.com (2024-09-20). Measured readouts are `number_changed` and `comparison_added`; both spans re-verify. |
| 5 | Each trace within 150 credits, $0.50 and 5 minutes | **Yes** | Largest is claim-1: 19 credits, $0, 47 s. |

## Per trace

| Claim | End | Pages (meta) | Hops between clusters | Link-verified edges | Credits | $ | Seconds |
|---|---|---|---|---|---|---|---|
| 1 | TRAIL GOES COLD, row 6 | 8 (1) | 5 | 0 | 19 | 0 | 47 |
| 2 | TRAIL GOES COLD, row 6 | 9 (0) | 8 | 1 | 13 | 0 | 36 |
| 3 | TRAIL GOES COLD, row 6 | 5 (1) | 2 | 0 | 8 | 0 | 16 |
| 4 | TRAIL GOES COLD, row 6 | 2 (0) | 1 | 0 | 8 | 0 | 12 |
| 5 | TRAIL GOES COLD, row 6 | 2 (0) | 1 | 0 | 7 | 0 | 18 |
| 6 | TRAIL GOES COLD, row 6 | 3 (0) | 2 | 0 | 8 | 0 | 16 |

Every trace ends in row 6 for the same first reason: no earliest page has a page type, because T19 is not built. Claims 1, 2 and 4 also have unread candidate parents.

## Extract links (from #7)

Tavily `/extract` with markdown keeps hyperlinks inline, with no links field and no raw HTML. The walker reads links from the markdown, so it does not need its own fetch. Basic-depth links can be relative, so they are resolved against the page URL.

## What failed or is missing

1. **False matches on weak numbers** (bottom line above). The earliest page on claims 1, 2, 4 and 6 does not state the claim; on claims 3 and 5 it does. The reviewed T4 fix (#42, on `main` at 73736dc) does not repair this. An offline check of run 1's spans against it, at no credit cost, gave:

   | Claim | Run-1 earliest page | Passes the reviewed `atomHit`? |
   |---|---|---|
   | 1 | hotrod.com, 1994 (false match) | No, and it is the only span the fix drops |
   | 2 | prsecrets.com, 2005 (false match) | Yes |
   | 3 | psychologytoday.com, 2011 (real match) | Yes |
   | 4 | wired.com, 2013 (false match) | Yes |
   | 5 | boatcoversdirect.com, 2013 (real match) | Yes |
   | 6 | frontiersin.org, captured 2024 (false match) | Yes |

   The fix also checks whether the sentence's own number is weak, but a weak claim number such as 8 or 10 still counts with the subject word anywhere in the sentence. On claim 1, dropping the 1994 page would only move the earliest to the next page, a 2010 journal reference list, which is also a false match.
2. **No page types**, so no ORIGIN FOUND is possible. This waits on T19 (#27).
3. **Written-out numbers never match.** `atomHit` reads digits only, so pages saying "ten times" or "eight seconds" were found and dropped. Claim 4 is the most affected: only 2 of the 9 pages read were kept. XO ruled this out of scope for the spike (#50).
4. **Extract failures leave parents unread.** 17 pages across claims 1, 2, 4 and 5 failed to extract, mostly social and video pages. They stay unread and block ORIGIN FOUND, as designed.
5. **Spans carry page chrome.** Sentences before the first full stop include navigation text, for example "Skip to content", or the end of a WhatsApp share page in claim 1. They are still verbatim.
6. **Inferred edges are date order only**, which inflates line 3.
7. **Dates:** 4 of 27 dated pages are `existed_by` from the Wayback first capture, and 3 of those disagree with Tavily's date. 2 pages have no date at all.

## Run 1 under the reviewed rules

The run used T4, T5 and T6 as they stood at 83a1e71. The traces are kept as recorded: no rerun, and no hand edits. Re-checked strictly against the rules now on `main` (`npx pz verify spike/traces/claim-<n>.json`), two things differ:

- **`stop_state` differs on all 6 traces, in the reasons only.** The state, the row and every count are identical. The reviewed `decideStopState` words row 6's first reason as "...no earlier citation and no negated span", where the stored traces say "...and no earlier citation". `pz verify` compares the whole decision, and its message now names the field that differs, so this no longer prints two identical-looking sides.
- **`atoms` fails on 5 spans:** claim-1 `s7` and `s8`, claim-4 `s1`, claim-6 `s1` and `s3`. The weak-number rule tightened after the run (#61), which is the same finding as the offline check above. Claim-1 `s8` is the 1994 hotrod.com span.

Every other check passes: window hashes, offsets, page hashes and offsets, two spans per edge, edge kinds, the earliest node, and negation.

**How `make verify` treats these traces:** they are historical records, listed in `spike/historical-traces.json` with the rules they were recorded under (83a1e71). `pz verify --historical <manifest>` then skips the atoms re-check and compares the decision on state and row only. It prints a `HISTORICAL` line for each such trace, so the exemption is never silent. Every other check still runs. A trace not in the manifest, including `dry-run.json`, is checked in full.

## Candidate rules (not applied)

These were written after seeing run 1, so applying them here would be tuning on the test claims. Each is measured on the E2 dev set first.

1. **Variant phrase required** (#59). A sentence counts only if it contains one of the claim's variant phrases (for example "8 seconds" or "8-second") as well as passing `atomHit`. The search query already quotes those phrases, so the reading rule would match the search rule.
2. **Written-out numbers.** "ten times" matches 10, and "eight seconds" matches 8. Logged by XO on #50.

## Files

- `spike/traces/claim-1.json` to `claim-6.json`, plus `dry-run.json`
- `spike/logs/<id>.jsonl`: every query, window, kept and dropped page with its reason
- `spike/h2h-forms/ours-claim-<n>.md`: our result in the head-to-head form, for XO to relabel A to D. The file names say "ours", so relabel before Rohan sees them.
- Full page text is only in the git-ignored `.cache/pages/` and `.cache/http/`.
