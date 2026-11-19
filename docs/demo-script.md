# Demo video script (draft for Vidyut's approval)

This is a draft. We don't record the final take until Vidyut writes "approve". It runs about two minutes, 2:15 at the outside. Rishit's capture script for T64 ([#122](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/122)) shoots the footage, and each shot here has an id, S1 to S11, that the capture script uses.

The challenge asks to see four things: a real question, real Token Factory and Tavily calls, an opened citation that matches its quote, and a case where the evidence runs out or a tool fails. The order follows the video plan in the idea brief (`plan/idea-brief.md`, which stays out of the public repo). We open on the contrast, have our own trace on screen by 0:20 and a trail that goes cold by 0:45, and keep the proof for the second half.

## Needs Vidyut's OK (morning, Nov 19)

1. **S7 is cut**, against "it stays at 2:15 and nothing gets cut" (Nov 16). Nothing recorded shows a pasted AI answer. With S7 out the video runs about 2:01.
2. **Version B ends cold**, against "the hero claim has to end ORIGIN_FOUND" (Nov 16). B (dev-11) is the fallback if the morning run doesn't end dev-10 on the WEF report. Use A if it does.

## On every frame

- Each trace carries its REPLAY badge (recorded live runs, replayed from the recording). The one SAMPLE on screen is S9's written Tavily 503 failure fixture, shown with its SAMPLE line.
- If we speed up a wait, the screen says "sped up".
- Every number on screen comes from a file in the repo: a trace, the dev score, the held-out result or the trap output.
- The trap line comes after the held-out row and says "planted by us".
- Keys stay off screen. Terminal shots use replay, or a live run with the usage line showing and `.env` never opened.
- When a Token Factory or Tavily call appears, the screen names it.

## The script

| Time | Shot | On screen | Voice (draft) | Source | Ready? |
|---|---|---|---|---|---|
| 0:00 to 0:12 | S1, the contrast | A chatbot gives a confident statistic with a source link. We click it, and the page doesn't say that. **A:** on dev-10's claim. **B:** on dev-11's claim. | "Ask a chatbot where a number comes from and it'll tell you. Click the source, though, and a lot of the time it says something else." | Captured from a chatbot on the day; the claim follows the version in use | needs the A/B call after the morning run |
| 0:12 to 0:20 | S2, the question | **Start the shot at the claim box, below the hero; crop the hero and the trace list out** (the hero is dev-17, "Back to 2019", a false date; dev-10's row reads "Back to 2013", also false). Paste the claim and press Enter; it opens with "Matched a recorded trace". **A:** dev-10's claim. **B:** dev-11's claim. | "So we built Patient Zero. Give it one claim, and it walks back through time to the earliest page it can find." | Web app, claim box (#184, #228, #233), REPLAY trace (#220) | ready, cropped |
| 0:20 to 0:40 | S3, the walk | The walk replay: each search with its window and result count, and each page read with its date and what the model answered about it. **A:** dev-10. **B:** dev-11. The replay runs about 8 s, so press "Replay the walk" a second time to fill the slot (or slow the capture and mark it "sped up" honestly). **On B, crop or keep the voice off the big headline**: it is the CAI press release text ("10 JULY 2017") but sits at August 2025 on the timeline. | "This is a recorded run, step by step. Each search reaches further back in time, and each page it reads lands on the timeline with its date." | Web app walk replay (#186, #239) | **B** ready, replayed twice; **A** only if dev-10 is re-recorded on the WEF report |
| 0:40 to 0:52 | S4, the time machine (hero shot) | Drag the scrubber back through the stops. **A:** dev-10. **B:** dev-11: the stops are climateaccountability.org (August 2025), twn.my (July 2019) and fortune.com (July 2017); the app follows the chosen path, so CNBC is not a stop. **End the drag on "July 2017, fortune.com, Earliest page we found", with the headline cropped** (each stop's sentence is page furniture). | "Drag it back, and each stop is a page and the date it was online." | Web app scrubber | **B** ready, cropped; **A** as S3 |
| 0:52 to 1:04 | S5, the citation | **B:** the app's "Open the page" on the earliest stop opens Fortune, so instead open the CNBC article directly in the browser (https://www.cnbc.com/2017/07/10/just-100-firms-attributable-for-71-percent-of-global-emissions-report-says.html) and use the browser's find on "100 companies". The on-screen source is CNBC, July 10, 2017, the first page `make judge` shows for dev-11 with its quote. **A:** "Open the page" on dev-10's earliest page, the WEF report, then find. | "Here's the earliest page it found. The words are right there." | Browser on the live page (B: the CNBC URL typed in) | **B** ready; **A** as S3 |
| 1:04 to 1:16 | S6, a trail that goes cold | A second claim ends TRAIL GOES COLD. The card names the check that failed and the rule: "Decision table row 6 of 6". | "Sometimes there's no origin to find. It tells you that, and tells you why. The model never decides how a trace ends; the code does." | CLI card, `make replay TRACE=eval/dev-traces/dev-02.json` (cost now reads $0.0003; the menu-text quote is gone) | ready |
| (cut) | S7, a whole AI answer | **Cut (needs Vidyut's OK, see the top).** No pasted-answer recording exists, and the app has only a single-claim box. The CLI has it (`pz trace --answer`, #155), but showing it needs one recorded answer and a terminal shot. | (cut) | | cut, pending Vidyut |
| 1:16 to 1:31 | S8, the score | The README Evaluation table: the E2 row, then the held-out row. | "Before most of the engine was built, we set ten claims aside and locked them in with a hash." Then, **only after the held-out run:** "Here's how it did on them. Misses included." | README Evaluation table and the held-out readout (T67, #125) | E2 row ready; the held-out line waits for its run |
| 1:31 to 1:41 | S9, checking it | `make verify` goes green with no keys. Then **crop to the "== planted traps" block of `make judge`**: "adversarial: planted origins 0 of 24 ..., planted by us". Crop out the rest of make judge, which prints dev-04's card. Then a forced Tavily 503 ends TOOL_FAILED: this is the one SAMPLE on screen, a written failure fixture, and its "SAMPLE an invented example, not a real search" line stays in frame. | "Anyone can check every trace with one command, no keys needed. And when a search breaks, it says the search broke. It doesn't make up an answer." | Terminal: `make verify`, `make judge` (traps block only), `make replay TRACE=fixtures/failure/traces/failure-tavily-503.json` | ready, cropped |
| 1:41 to 1:51 | S10, who decides | The "How it works" diagram from the README, with Token Factory and Tavily named on it | "The model answers the small questions. The code makes the call. And every link between two pages rests on a sentence quoted from each." | README diagram (#154) | ready |
| 1:51 to 2:01 | S11, close | dev-06, "You need to walk 10,000 steps a day". **Start below the card's headline sentence**, which is pbs.org menu text: the scrubber, then the stop card ("The trail goes cold", back to 2002, pbs.org; the 2002 capture holds the sentence), then "How this was decided" on rule 6. Then the repo link. dev-04 stays out. | "Where the open web runs out, it says so and shows why. That's Patient Zero, from team Says Who, built on Nebius Token Factory and Tavily." | Web app, dev-06 REPLAY; repo URL | ready, cropped; the sponsors are named on screen in S6 and S10 |

### Which version: A or B

- **A (dev-10 hero, "By 2050 there will be more plastic than fish in the ocean"):** use it only if the morning live run, with XO's archive-date fix (#238), ends dev-10 on the WEF January 2016 report. Today's committed dev-10 ranks a 2013 page whose archive copy does not hold the claim, and its scrubber has two stops (an x.com login bar and that page). Don't shoot A from today's recording.
- **B (dev-11, "Just 100 companies are responsible for 71% of global emissions"):** the fallback, and what we shoot if A isn't ready. Its earliest pages are CNBC and Fortune, both dated July 10, 2017, the day the CDP report came out. XO checked that the CNBC July 2017 copy holds the claim. It ends cold (5 unread candidate parents), so S3 to S5 show the walk and the citation, not a found origin. In the app the scrubber ends on Fortune (July 2017), whose quoted line is page furniture ("'Absurd': Delta CEO says..."), so S4 crops the headline and S5 opens the CNBC article directly.

## Checked against main (Tue Nov 17, about 17:30 ET; superseded)

**Superseded by the script table above and XO's walks on #158 (Nov 19). Kept as the record of the earlier checks; some notes here are out of date (S6's cost, S7, S9).**

I walked each shot on main's web app (`npm run dev` in apps/web) and CLI. Steps that no longer match are marked **no**.

| Shot | Matches main? | What main does today |
|---|---|---|
| S1 | not checkable | Needs the hero claim from tonight's run. |
| S2 | **yes** (rechecked Wed Nov 18, about 12:00 ET) | Since #184, #220 and #228: pasting "By 2050 there will be more plastic than fish in the ocean." and pressing Enter opens dev-10 with "Matched a recorded trace, recorded November 18, 2026." and its REPLAY badge. The start page leads with a real trace (dev-17) and lists 18 REPLAY rows, then the samples. |
| S3 | **yes, voice rewritten** (Nov 18) | The voice line now says only what the rail shows: recorded searches going back in time and pages checked against the claim. It no longer mentions Token Factory or confidence. To name the services on screen instead, the rail would need, per line: the service from the trace's usage row ("Tavily search", "Tavily extract", "Token Factory"), and for each typed answer its question and probability ("same_claim: yes, 0.99", "page type: report, 1.00"). Both are already in the trace (`usage`, `nodes[].sameClaim`, `nodes[].pageType`). That is a WalkReplay change for the app's owner, not this script. |
| S4 | yes, on samples | The scrubber, the time field and "Wording changed here" work (sample-rich). It needs a real trace with a wording change. |
| S5 | **partly** (rechecked Nov 18) | "Open the page" now links a real page (dev-10: biologicaldiversity.org), but it is the plain URL, with no highlight of the sentence. dev-10's earliest is that page, dated June 2013 by inference, not the WEF report (Rohan's #3 dating item). The highlight has to come from the browser's find, or the shot changes. |
| S6 | yes | `make replay TRACE=eval/dev-traces/dev-02.json` prints "Trail goes cold ... Decision table row 6 of 6." But its quoted line is page menu text ("Subscribe Sign In Read the November Issue..."). Rishit's F5 spans (#209) should fix that, so re-check after tonight's run. The Cost line reads "11 credits, $0.0004": the dollar figure is Token Factory only (the unowned [M] on #192), so it looks like the whole cost. The web app's stop card also has "How this was decided" with rule 6. |
| S7 | partly | `pz trace --answer` works. The answer screen (#149) is still open, so this is a CLI shot. |
| S8 | **no** | The held-out run hasn't happened. The README eval row shows the E2 replay only. |
| S9 | **check the line** | `make verify` passes with no keys. `pz traps` now prints two lines: "wrong origins 0 of 10 ... planted by us" and "pipeline: wrong origins 3 of 12 ... 3 are the known gap". "planted origins 0 of 24" (the adversarial set, #156) isn't a line `pz traps` prints, so either show the adversarial test or change the voice line. The 3 of 12 line has to stay if that output is on screen. The forced 503 replay (`fixtures/failure/traces/failure-tavily-503.json`) works. |
| S10 | yes | The README has "How it works" with its diagram (#154 merged). |
| S11 | **replaced** (Nov 18) | No recording ends on a correct origin, so S11 is now an honest cold stop: dev-06's stop card (cold, earliest pbs.org 2002, "How this was decided" on rule 6), then the repo link. dev-04 is re-recorded (#231) and ends cold, and stays out of the video. If a later run ends dev-10 on the WEF report, S11 can go back to the origin card. |

**What blocks the most shots now (Nov 18):** no correct ORIGIN_FOUND trace, so S1 and S4 still wait for the hero claim, and S11 is a cold stop for now. dev-04 is re-recorded and no longer shows "Origin found". Real traces and the claim box work (S2).

## What we can shoot now

As of Thu Nov 19, 00:30 ET: S2, S6, S9, S10 and S11 can be shot now (S2, S9 and S11 cropped as noted). S3 to S5 can be shot now in version B (dev-11); version A waits for the morning live run. S1 is captured on the day for whichever version is used. S7 is cut. S8's held-out line waits for the held-out run. Zero In, the Atlas and researcher mode stay out unless they get built, and even then they'd get ten seconds at most, after S11.

## Decided (Vidyut, Nov 16)

1. Hero claim: XO picks it from Tuesday's live traces. It has to end ORIGIN_FOUND on a page judges can open, and Vidyut sees it before we capture.
2. Cold open: we re-shoot it on the hero claim.
3. Voice: Anoop records it, with Rohan as backup. (Changed on Nov 16: Rohan records the voiceover, #175.) ElevenLabs is only a fallback, and only with Vidyut's account and OK.
4. Length: it stays at 2:15 and nothing gets cut.
5. If the held-out result is weak, S8 shows it as it is.
