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
| 0:20 to 0:40 | S3, the walk | Pages land on the time axis, oldest on the left. A strip beside it names each call: "Tavily search, window ending 2015", "Token Factory: page type, 0.94". | "Every step here is a real call. Tavily searches further and further back. Token Factory answers small, typed questions about each page, and says how sure it is." | Web app on the REPLAY trace, from its usage rows | needs Monday's trace |
| 0:40 to 0:52 | S4, the time machine (hero shot) | Drag the scrubber back. The viral sentence rewrites itself, word by word, into the oldest wording we found, with the page and date at each stop. | "Drag it back and you can watch the sentence change. Each stop is a line quoted straight from a real page." | Web app scrubber, same trace | scrubber works; needs the real trace |
| 0:52 to 1:04 | S5, the citation | Click the earliest page. It opens with the quoted sentence highlighted. | "Click any of them. The words are right there on the page." | Browser, text fragment or the Wayback copy | needs the real trace and the C21 check |
| 1:04 to 1:16 | S6, a trail that goes cold | A second claim ends TRAIL GOES COLD. The card names the check that failed and the rule: "Decision table row 6 of 6". | "Sometimes there's no origin to find. It tells you that, and tells you why. The model never decides how a trace ends; the code does." | CLI card, `make replay` ([#151](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/151)), on a cold dev trace | card works; needs a cold dev trace |
| 1:16 to 1:30 | S7, a whole AI answer | Paste a full chatbot answer. A summary appears ("5 statistics: ...") with a line for each one. | "You can paste a whole AI answer, too. Each statistic gets its own trace, and the code does the counting." | `pz trace --answer` ([#155](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/155)), or Rishit's answer screen ([#149](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/149)) | works; needs one recorded live answer |
| 1:30 to 1:45 | S8, the score | The README eval table: the held-out row with its hits and misses, then the E2 dev row | "Before we built the engine, we set ten claims aside and locked them in with a hash. Here's how it did on them. Misses included." | README eval table and the held-out readout (T67, [#125](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/125)) | needs the held-out run, Mon Nov 16 |
| 1:45 to 1:55 | S9, checking it | `make verify` goes green with no keys. The trap line: "planted origins 0 of 16, planted by us". Then a forced Tavily 503 ends TOOL_FAILED. | "Anyone can check every trace with one command, no keys needed. And when a search breaks, it says the search broke. It doesn't make up an answer." | Terminal: `make verify`, `make replay TRACE=fixtures/failure/...` ([#152](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/152), [#156](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/156)) | ready when those PRs merge |
| 1:55 to 2:05 | S10, who decides | The "How it works" diagram from the README | "The model answers the small questions. The code makes the call. And every link between two pages rests on a sentence quoted from each." | README diagram ([#154](https://github.com/vs-githjk/odsc-nebius-hackathon/pull/154)) | ready when #154 merges |
| 2:05 to 2:15 | S11, close | The origin card for the hero claim, then the repo link | "That's Patient Zero, from team Says Who, built on Nebius Token Factory and Tavily." | Web app card, repo URL | needs the real trace, and the repo public |

## What we can shoot now

S6, S9 and S10 can be shot as soon as the open PRs merge. S1's pick, S2 to S5, S7 and S11 all need a reviewed trace from Monday's live run, replayed. S8 waits for the held-out run. Zero In, the Atlas and researcher mode stay out unless they get built, and even then they'd get ten seconds at most, after S11.

## Decided (Vidyut, Nov 16)

1. Hero claim: XO picks it from Tuesday's live traces. It has to end ORIGIN_FOUND on a page judges can open, and Vidyut sees it before we capture.
2. Cold open: we re-shoot it on the hero claim.
3. Voice: Anoop records it, with Rohan as backup. ElevenLabs is only a fallback, and only with Vidyut's account and OK.
4. Length: it stays at 2:15 and nothing gets cut.
5. If the held-out result is weak, S8 shows it as it is.
