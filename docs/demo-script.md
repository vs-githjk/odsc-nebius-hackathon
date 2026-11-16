# Demo video script (draft for Vidyut's approval)

**Status:** draft. Nothing is recorded until Vidyut writes "approve". Length: about 2 minutes, 2:15 at most. Footage is captured by T64 ([#122](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/122)); each shot below has an id (S1 to S11) that the capture script and `docs/demo-shots.md` use.

The video has to show four things the challenge names: a real question, real Token Factory and Tavily calls, an opened citation matched to its quote, and a failure or insufficient-evidence case. It follows the beat order in the idea brief's video plan (`plan/idea-brief.md`, which stays out of the public repo): the contrast first, our trace by 0:20, an honest stop by 0:45, proof after that.

## Rules for every frame

- Every trace on screen shows its badge: LIVE or REPLAY. A SAMPLE trace never appears outside S9's "how it fails" beat, and there it is labelled as written for the test.
- A sped-up wait is labelled "sped up" on screen.
- No number appears unless it comes from a committed file: a trace, the dev score, the held-out result or the trap output.
- The trap-set line is shown only after the held-out row, and says "planted by us".
- Keys never appear. Terminal shots use replay, or a live run with the usage line visible and the `.env` file never opened.
- Token Factory and Tavily are named on screen the moment their calls appear.

## The script

| Time | Shot | On screen | Voice (draft) | Source | Ready? |
|---|---|---|---|---|---|
| 0:00 to 0:12 | **S1 Contrast** | A chatbot answer with a confident statistic and a source link; the link opens on a page that does not say it | "Ask a chatbot where a statistic comes from and you get an answer. Open the source, and often it does not say that." | Saved head-to-head transcripts ([spike/head-to-head/](../spike/grading.md)), re-captured on a dev claim | needs the shot picked from Monday's dev claims |
| 0:12 to 0:20 | **S2 The question** | The start page: a reporter pastes one viral statistic and presses Trace | "Patient Zero takes one claim and walks it backwards through time, to the earliest page that states it." | Web app, REPLAY of a reviewed live trace | needs Monday's live trace and Rishit's start page |
| 0:20 to 0:40 | **S3 The walk** | Nodes stream onto the time axis, oldest to the left. A side strip names each call as it lands: "Tavily search, window ending 2015", "Token Factory: page type, 0.94" | "Each step is a real call: Tavily searches further and further back, and Token Factory answers narrow typed questions, with a confidence." | Web app on the REPLAY trace, its usage rows | needs Monday's live trace |
| 0:40 to 0:52 | **S4 The time machine** (hero shot) | The scrubber drags back; the viral sentence changes word by word into its earliest wording, each stop showing its page and date | "Drag back, and the sentence changes into the earliest wording we found. Every stop is a sentence quoted from its page." | Web app scrubber on the same trace | scrubber built; needs the real trace |
| 0:52 to 1:04 | **S5 The opened citation** | Click the earliest page's link: the source opens and the quoted sentence is highlighted on the page | "Open any citation and the quoted words are there, on the page." | Browser, text fragment or Wayback copy | needs the real trace; C21 citation-open check |
| 1:04 to 1:16 | **S6 The honest stop** | A second claim ends TRAIL GOES COLD. The card says which check failed and the rule row: "Decision table row 6 of 6" | "When the trail ends without an origin, it says so, and says why. Code decides how a trace ends, never the model." | CLI card (`make replay`, [#151](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/151)) on a cold dev trace | card built; needs a cold dev trace |
| 1:16 to 1:30 | **S7 A pasted AI answer** | Paste a whole chatbot answer; the summary appears: "5 statistics: ..." with one line per statistic | "Paste a whole AI answer, and every statistic in it gets its own trace. The summary is counted by code." | `pz trace --answer` ([#155](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/155)), or Rishit's answer screen ([#149](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/149)) | mode built; needs one recorded live answer |
| 1:30 to 1:45 | **S8 How it scored** | The README's eval table: the held-out row with hits and misses, then the E2 dev row | "We set ten claims aside and committed their fingerprint before building the engine. Here is how it did, misses included." | README eval table, held-out readout (T67, [#125](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/125)) | needs the held-out run (Mon Nov 16) |
| 1:45 to 1:55 | **S9 How it fails, and checks itself** | `make verify` going green with no keys; the trap line "planted origins 0 of 16, planted by us"; the forced Tavily 503 ending TOOL_FAILED | "Anyone can re-check every trace with one command and no keys. A failed search is reported as a failed search, not as an answer." | Terminal: `make verify`, `make replay TRACE=fixtures/failure/...` ([#152](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/152), [#156](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/156)) | ready once those PRs merge |
| 1:55 to 2:05 | **S10 Who decides what** | The README diagram: the model answers typed questions, code decides the ending | "The model answers narrow questions. Code picks the ending. Every edge rests on two quoted sentences." | README "How it works" diagram ([#154](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/154)) | ready once #154 merges |
| 2:05 to 2:15 | **S11 Close** | The origin card for the hero claim, the repo link | "Patient Zero, by team Says Who. Built on Nebius Token Factory and Tavily." | Web app card, repo URL | needs the real trace; repo must be public |

## What is ready tonight, and what is not

- **Ready, or ready once open PRs merge:** S6 (the card format), S9 (verify, traps, the failure case), S10 (the diagram).
- **Waiting on Monday's live dev run:** S1's pick, S2, S3, S4, S5, S7 and S11 all need a reviewed live trace replayed as REPLAY.
- **Waiting on the held-out run:** S8.
- **Not shown unless built:** Zero In, the Atlas, researcher mode. If one is built and time allows, about 10 s after S11.

## For Vidyut to decide

1. **The hero claim** for S2 to S5 and S11: pick from Monday's reviewed live traces. A claim that ends ORIGIN_FOUND on a page judges can open is strongest.
2. **The cold open (S1):** the brief wants a consumer tool's citation that fails our verbatim check. Use a saved head-to-head transcript, or re-capture on the hero claim?
3. **Voice:** your voice, a teammate's, or captions only.
4. **Length:** this draft runs 2:15. Cutting S7 or S10 brings it to about 2:00.
5. **If the held-out result is weak:** S8 shows it as it is, misses included. The voice line stays the same.
