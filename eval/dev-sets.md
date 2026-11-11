# Dev sets

Two dev sets, both public, both separate from the private held-out set (E1).

| Set | File | Claims | Use |
|---|---|---|---|
| E2 | `eval/dev-claims.json` | 20 (11 origin, 9 cold) | Tuning. Rules, cutoffs and prompts may be set on it. |
| E3 | `eval/dev-claims-e3.json` | 40 (18 origin, 22 cold) | Check only. Nothing is tuned on it. |

Rules (T47, #98):
- Tune on E2, report on both. Any change that helps E2 and hurts E3 is flagged in its PR.
- Nothing is ever tuned on spike claims or held-out claims.
- E3 shares no claim text or target with E2 and none of the six spike claims (`dev-claims.test.ts` checks both). The held-out exclusion check is Rohan's, since only the hash of `heldout.jsonl` is in the repo.

## How E3 was built

- Each claim has `seenAt` (a live page where it circulates), and either `tracedOrigin` (the page that first published it, for `origin`) or `tracedBy` (the fact-check or provenance page that traced it, for `cold`).
- `origin` claims are statistics introduced by one report, paper or press release: WHO, IPBES, ITU, FAO, UNESCO, the UN, Pew, the IEA, GitHub, PLOS papers, the 2014 AMR review and the GPT-3 paper.
- `cold` claims have no web origin to find:
  - Misattributed quotes that Quote Investigator traced to print, or found no source for.
  - Myths that Snopes or Full Fact could not trace.
- On Nov 9 every URL was fetched, and its page text was checked for the claim's key figure or words. All 80 passed. The AMR review is a PDF, so for it only the status was checked; its "10 million a year by 2050" figure was confirmed from coverage of the report.

## Known soft spots

- e3-34 ("suicides up 200% since lockdown"): Full Fact found no evidence for it. The figure began as a charity's report of a 200% rise in helpline calls, a different claim. It is marked `cold`, and a trace that stops at the helpline page as the origin is a false origin.
- e3-09 (95% of teens, Pew 2018): Pew repeated the same 95% in its 2023 and 2024 surveys. The registered origin is the earliest, 2018.
- e3-14 (52% more concerned than excited, Pew 2023): the same 52% appears again in Pew's 2026 survey. The registered origin is the 2023 page.
- e3-17 (871,000 loneliness deaths): WHO writes the figure as "871 000" with a space, a real test of the number parser.
- E3 has 13 quote claims, more quote-heavy than E2. The scorecard reports E3 per topic once traces exist.
