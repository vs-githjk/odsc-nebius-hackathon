# Week-0 spike report

Run 2026-11-02, about 18:35 PT, by RishitRai with `spike/walk.ts` at commit 83a1e71. That is one run per claim with fixed rules and no reruns. The claims and their atoms were committed in 83a1e71 before any spike call, and Rohan's target hashes were on #10 before the run.

**Total: 63 Tavily credits (about $0.50 at the $0.008 list price), $0 Token Factory, 2.4 minutes of walking.** All 6 traces pass `pz verify`, both on their own and against their saved pages (`--pages .cache/pages/<id>`).

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

**Proposed fix, for XO and Vidyut to decide, not applied:** a sentence counts only if it contains one of the claim's variant phrases (for example "8 seconds", "8-second") as well as passing `atomHit`. The search query already quotes those phrases, so this makes the reading rule match the search rule. It would be a logged rerun from scratch at a few credits, since repeat searches come from the cache. It is not applied because changing a rule after seeing spike results is tuning on the test claims, and that is not mine to decide.

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

1. **False matches on weak numbers** (bottom line above), on claims 1, 2, 4 and 6.
2. **No page types**, so no ORIGIN FOUND is possible. This waits on T19 (#27).
3. **Written-out numbers never match.** `atomHit` reads digits only, so pages saying "ten times" or "eight seconds" were found and dropped. Claim 4 is the most affected: only 2 of the 9 pages read were kept.
4. **Extract failures leave parents unread.** 17 pages across claims 1, 2, 4 and 5 failed to extract, mostly social and video pages. They stay unread and block ORIGIN FOUND, as designed.
5. **Spans carry page chrome.** Sentences before the first full stop include navigation text, for example "Skip to content", or the end of a WhatsApp share page in claim 1. They are still verbatim.
6. **Inferred edges are date order only**, which inflates line 3.
7. **Dates:** 4 of 27 dated pages are `existed_by` from the Wayback first capture, and 3 of those disagree with Tavily's date. 2 pages have no date at all.

## Files

- `spike/traces/claim-1.json` to `claim-6.json`, plus `dry-run.json`
- `spike/logs/<id>.jsonl`: every query, window, kept and dropped page with its reason
- `spike/h2h-forms/ours-claim-<n>.md`: our result in the head-to-head form, for XO to relabel A to D. The file names say "ours", so relabel before Rohan sees them.
- Full page text is only in the git-ignored `.cache/pages/` and `.cache/http/`.
