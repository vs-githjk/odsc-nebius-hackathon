# Demo video script (draft for Vidyut's approval)

This is a draft. We don't record the final take until Vidyut writes "approve". It runs about two minutes, 2:15 at the outside. Rishit's capture script for T64 ([#122](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/122)) shoots the footage, and each shot here has an id, S1 to S11, that the capture script and `docs/demo-shots.md` share.

The challenge asks to see four things: a real question, real Token Factory and Tavily calls, an opened citation that matches its quote, and a case where the evidence runs out or a tool fails. The order follows the video plan in the idea brief (`plan/idea-brief.md`, which stays out of the public repo). We open on the contrast, have our own trace on screen by 0:20 and a trail that goes cold by 0:45, and keep the proof for the second half.

## On every frame

- Each trace carries its LIVE or REPLAY badge. A SAMPLE trace shows up once, in S9, labelled as written for the test.
- If we speed up a wait, the screen says "sped up".
- Every number on screen comes from a file in the repo: a trace, the dev score, the held-out result or the trap output.
- The trap line comes after the held-out row and says "planted by us".
- Keys stay off screen. Terminal shots use replay, or a live run with the usage line showing and `.env` never opened.
- When a Token Factory or Tavily call appears, the screen names it.

## The script

| Time | Shot | On screen | Voice (draft) | Source | Ready? |
|---|---|---|---|---|---|
| 0:00 to 0:12 | S1, the contrast | A chatbot gives a confident statistic with a source link. We click it, and the page doesn't say that. | "Ask a chatbot where a number comes from and it'll tell you. Click the source, though, and a lot of the time it says something else." | Re-shot on the hero claim | needs the hero claim from Tuesday's run |
| 0:12 to 0:20 | S2, the question | A reporter pastes one viral statistic into the start page and hits Trace | "So we built Patient Zero. Give it one claim, and it walks back through time to the earliest page that says it." | Web app, REPLAY of a reviewed live trace | needs Monday's trace and Rishit's start page |
| 0:20 to 0:40 | S3, the walk | The walk replay on a recorded trace: the rail lists each search with its window and result count ("Searched for \"2050\" plastic, pages before November 2026: 10 results.") and each page read ("Read snopes.com, March 2025: discusses the claim, kept off the path."). | "This is a recorded run, step by step. Each search reaches further back in time, and every page it reads is checked against the claim before it counts." | Web app walk replay (#186) on a REPLAY trace (#220) | rail works; voice rewritten Nov 18 to match it |
| 0:40 to 0:52 | S4, the time machine (hero shot) | Drag the scrubber back. The viral sentence rewrites itself, word by word, into the oldest wording we found, with the page and date at each stop. | "Drag it back and you can watch the sentence change. Each stop is a line quoted straight from a real page." | Web app scrubber, same trace | scrubber works; needs the real trace |
| 0:52 to 1:04 | S5, the citation | Click the earliest page. It opens with the quoted sentence highlighted. | "Click any of them. The words are right there on the page." | Browser, text fragment or the Wayback copy | needs the real trace and the C21 check |
| 1:04 to 1:16 | S6, a trail that goes cold | A second claim ends TRAIL GOES COLD. The card names the check that failed and the rule: "Decision table row 6 of 6". | "Sometimes there's no origin to find. It tells you that, and tells you why. The model never decides how a trace ends; the code does." | CLI card, `make replay` ([#151](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/151)), on a cold dev trace | card works; needs a cold dev trace |
| 1:16 to 1:30 | S7, a whole AI answer | Paste a full chatbot answer. A summary appears ("5 statistics: ...") with a line for each one. | "You can paste a whole AI answer, too. Each statistic gets its own trace, and the code does the counting." | `pz trace --answer` ([#155](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/155)), or Rishit's answer screen ([#149](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/149)) | works; needs one recorded live answer |
| 1:30 to 1:45 | S8, the score | The README eval table: the held-out row with its hits and misses, then the E2 dev row | "Before we built the engine, we set ten claims aside and locked them in with a hash. Here's how it did on them. Misses included." | README eval table and the held-out readout (T67, [#125](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/125)) | needs the held-out run, Mon Nov 16 |
| 1:45 to 1:55 | S9, checking it | `make verify` goes green with no keys. The trap line: "planted origins 0 of 24, planted by us". Then a forced Tavily 503 ends TOOL_FAILED. | "Anyone can check every trace with one command, no keys needed. And when a search breaks, it says the search broke. It doesn't make up an answer." | Terminal: `make verify`, `make replay TRACE=fixtures/failure/...` ([#152](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/152), [#156](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/156)) | ready (both merged) |
| 1:55 to 2:05 | S10, who decides | The "How it works" diagram from the README | "The model answers the small questions. The code makes the call. And every link between two pages rests on a sentence quoted from each." | README diagram ([#154](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/154)) | ready when #154 merges |
| 2:05 to 2:15 | S11, close | The stop card for dev-06, "You need to walk 10,000 steps a day": "The trail goes cold", back to 2002 (pbs.org), with "How this was decided" open on rule 6. Then the repo link. Not dev-04. | "Where the open web runs out, it says so and shows why. That's Patient Zero, from team Says Who, built on Nebius Token Factory and Tavily." | Web app, dev-06 REPLAY; repo URL | ready on main; replaces the origin card until a run ends on a correct origin |

## Checked against main (Tue Nov 17, about 17:30 ET)

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

S6, S9 and S10 can be shot as soon as the open PRs merge. S1's pick, S2 to S5, S7 and S11 all need a reviewed trace from Monday's live run, replayed. S8 waits for the held-out run. Zero In, the Atlas and researcher mode stay out unless they get built, and even then they'd get ten seconds at most, after S11.

## Decided (Vidyut, Nov 16)

1. Hero claim: XO picks it from Tuesday's live traces. It has to end ORIGIN_FOUND on a page judges can open, and Vidyut sees it before we capture.
2. Cold open: we re-shoot it on the hero claim.
3. Voice: Anoop records it, with Rohan as backup. (Changed on Nov 16: Rohan records the voiceover, #175.) ElevenLabs is only a fallback, and only with Vidyut's account and OK.
4. Length: it stays at 2:15 and nothing gets cut.
5. If the held-out result is weak, S8 shows it as it is.
