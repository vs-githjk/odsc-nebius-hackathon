# Morning report, Thu Nov 19 (07:30 ET)

Code freeze: tonight 23:59 PT (Fri 02:59 ET). Submissions close Fri 11:59 PM ET; you plan to submit Fri morning.

## Merged overnight
- #238: archive dates are only trusted if the archived copy holds the claim (L19, XO). #239: the walk rail says what the model actually recorded. #240, #241: perf measured (median 42 s, $0.08 a trace; both targets missed, written down honestly). #242: tests for saved run reasons. #232: README refresh. #237: Pages workflow.
- This morning: #243 (Rohan, saves the safe stage of a failed live run) and #244 (Anoop, card polish taken over from Rishit's #236, with XO's two fixes). Both PASS; 924 tests green, make verify green.

## Still open
| PR / item | Owner | State |
|---|---|---|
| #222 publication datelines | Rohan | FIX: a new path to a false earlier date (a dateline in a footer is stripped before counting). About 20 min. If not green by 14:00 ET, XO recommends leaving it out. |
| Rematch chats (#160) | Rohan | Not started. Blocks Anoop's blind grading. |
| Live Vercel app | Rishit | His only job today. PR by 16:00 ET. |
| Hero pin and README walkthrough | Anoop | Assigned 07:30 (judge fixes 1 and 2). |
| #158 demo script | Anoop, your approval | Waiting on you, and on the morning run for A or B. |
| #224 phrase claims | XO | Held. |

## Judge: 71/100 (66 last night, target 80)
Sourced 21/30, works end to end 17.5/25, usefulness 10/20, agent design 13.5/15, Token Factory and Tavily 9/10. The main drag: all 20 real traces end "The trail goes cold", and none ends "Origin found".
Top 3 fixes:
1. The home page hero is dev-17 (ChatGPT), which breaks your locked "not dev-17". It dates a 2022 line to April 2019. Pin it to dev-11, which matches script version B. Anoop, 20 min, about +2.
2. README walkthrough and stale submission lines. Anoop, 1 h, about +2.5.
3. The live Vercel app linked from the README. Rishit, today, about +5.
The live run below adds more: one real "Origin found" would add about 4 to 6.

## App screenshots (local, 1440 and 390)
In the scratchpad as am-1440-home.png, am-1440-trace.png, am-390-home.png and am-390-trace.png. The layout is clean on both widths. Defect: the dev-10 (plastic vs fish) quote starts with X's menu text, "Log inSign up United Nations on X:", and the trace still ends on X in 2024, not on the WEF report.

## Your decisions today, in order
1. **Morning live run: go?** It covers the final 20 dev claims, the 8 gallery claims, one answer-check run for S7, and the held-out set. At about $0.08 a trace, that's about $3 to $3.50 of the $6.65 left ($8.35 of $15 spent). The ledger stops it at the cap. It tells us whether dev-10 now ends on WEF (hero A or B) and fills the held-out, gallery and S7 slots.
2. **GitHub Pages:** already ON since last night (replay only). The new decision is the **Vercel deploy** when Rishit's PR passes review (about 16:00 to 18:00 ET). You paste the keys into Vercel. Go when it passes?
3. **Demo script #158:** approve version B now (the cold ending framed as the feature, dev-11, S7 back in), with A only if the run lands dev-10 on WEF?
4. **Submit timing:** approved as Fri morning. Proposed: XO's final judge pass Fri 08:00 ET, you press Submit by 11:00 ET, leaving a 12-hour buffer.
