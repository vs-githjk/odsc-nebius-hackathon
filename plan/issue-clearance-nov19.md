# Issue clearance audit

Snapshot: main `8a9804d`, 59 open issues and 6 open PRs. This is a disposition ledger, not a claim that all work is complete.

Validation on this main: `make verify` passed 1037 tests in 32 seconds. No paid/private-data calls were made for this audit.

Completed rows can be closed with this evidence. Partial/missing/blocked rows stay open. The four inboxes and standing reference issues stay open. Merges remain with XO.

| Issue | Owner | Disposition | Evidence / remaining action |
| --- | --- | --- | --- |
| [#1](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/1) Rishit (RishitRai)'s agent: everything until Nov 20 | RishitRai | Keep open | Team inbox; current app work is tracked in #259. |
| [#2](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/2) Vidyut: conductor inbox until Nov 20 | vs-githjk | Keep open | Conductor inbox; final review, deploy and submission remain with XO/Vidyut. |
| [#3](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/3) Rohan's agent: everything until Nov 20 | rohanrastogi311 | Keep open | Rohan inbox; held-out approval and #257 handoff remain. |
| [#4](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/4) Anoop's agent: everything until Nov 20 | AnoopIbrampur | Keep open | Anoop inbox; #222 continuation and #257 copy remain. |
| [#6](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/6) Kickoff task (Rohan): get up to speed + Token Factory smoke test | rohanrastogi311 | Partial | spike/token-factory-smoke.md exists and #30 merged; registration/Builder Program and billing settings are not verified by this pass. |
| [#8](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/8) Start here: Says Who kickoff | XO/team | Keep open | Pinned kickoff/reference; not a finite implementation task. |
| [#24](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/24) [T16] Blame popover, distortion readouts, roots counter | RishitRai | Partial | Blame/readout/roots code is present; original interaction/screenshot acceptance needs owner sign-off. |
| [#25](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/25) [T17] Stop states, "How this was decided", Rewind scroll story | RishitRai | Partial | StopCard and current ending UI are present; all-state/story screenshot acceptance not independently established. |
| [#69](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/69) [UI quality] The look we want, and the AI-slop list we never ship | RishitRai | Keep open | Design quality policy; applies to current #257/#259 work. |
| [#71](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/71) [T29] pz trace end to end, REPLAY recording, injection test, event stream | rohanrastogi311 | Partial | run.ts and pipeline replay exist; C10 is still planned in plan/plan.md, so do not close the injection acceptance item. |
| [#73](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/73) [T32] UI on real REPLAY traces and the streamed log rail | RishitRai | Partial | Real dev recordings and TraceView exist; streamed log rail is coupled to unfinished #92. |
| [#88](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/88) [T38] Live dev recordings: intake and fingerprint on real model output | rohanrastogi311 | Partial | Recorder and fixtures exist, but the required live five-intake/twenty-fingerprint capture acceptance and C11 proof are not established. |
| [#89](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/89) [T39] make dev-run: record LIVE traces for all 20 dev claims | rohanrastogi311 | Complete | eval/dev-run.ts, dev-run.test.ts and committed eval/dev-traces implement batch, typed failures, resume, budget and replay. make verify passes on audited main. |
| [#90](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/90) [T40] Held-out rehearsal for Nov 13 | rohanrastogi311 | Partial | Two-claim selection exists in eval/dev-run.ts; no committed completed live two-claim rehearsal was established. |
| [#91](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/91) [T41] Client robustness: retries, timeouts, typed errors, chaos tests | rohanrastogi311 | Partial | HTTP client retry/error tests exist; no full four-service chaos acceptance report was established. |
| [#92](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/92) [T42] pz serve: stream trace events to the web app | rohanrastogi311 | Missing deliverable | No pz serve command/server exists in packages/pz/src; live Vercel API is a separate surface. |
| [#94](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/94) [T45] Archive-first discovery: find the older versions | RishitRai | Partial | Archive/capture checks exist; archive-first discovery acceptance remains unverified. |
| [#95](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/95) [T46] The demo path: paste a claim, watch it walk | RishitRai | Active | Live app work continues in #259; final real-browser demo smoke still required. |
| [#99](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/99) [T48] Calibrate the typed-question confidence on dev | AnoopIbrampur | Partial | Do not equate same-claim numeric cutoff with all typed-question reliability calibration; full E3 reliability table remains unverified. |
| [#103](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/103) [T52] The README section judges grade us on: how we know it works | AnoopIbrampur | Complete | README evaluation section includes dev score, preregistered held-out pending slot, spike loss and source links; lint passes. |
| [#112](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/112) [T54] First dev run: error analysis and fix the top 3 causes | AnoopIbrampur | Partial | eval/dev-errors.md and F1-F6 fixes exist; complete E3 check of each top-cause fix remains unverified. |
| [#113](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/113) [T55] Claims we will make: only what the numbers show | AnoopIbrampur | Partial | Number lint exists and passes; final held-out/submission claims depend on #123/#125 and #280. |
| [#114](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/114) [T56] Second-model check: DeepSeek on the typed questions | AnoopIbrampur | Partial | Second-model harness exists; requested measured four-question agreement/accuracy comparison is not established. |
| [#115](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/115) [T57] Live pz trace with every real adapter, and C10 through them | rohanrastogi311 | Partial | Production pipeline and live dev traces exist; recorded hostile-page C10 acceptance remains planned. |
| [#116](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/116) [T58] Usage report: how we use Token Factory and Tavily | rohanrastogi311 | Missing deliverable | Only the per-trace usage-table script exists. docs/usage-report.md and make usage-report are absent; implementing next. |
| [#117](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/117) [T59] Regression gate: dev score in CI on every PR | rohanrastogi311 | Missing deliverable | CI runs make verify/schema only. No E2/E3 score-delta regression job against main exists. |
| [#118](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/118) [T60] Clean-clone judge check | rohanrastogi311 | Missing deliverable | make judge exists, but scripts/judge-check.sh and Linux/macOS clean-clone CI matrix are absent. |
| [#119](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/119) [T61] Accessibility and reduced motion | RishitRai | Partial | Keyboard/reduced-motion tests exist; AA pair audit and screen-reader findings require recorded evidence. |
| [#120](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/120) [T62] Shareable origin card | RishitRai | Partial | Card/share UI exists; exact 1200x630 PNG and replay-only share acceptance remain unverified. |
| [#121](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/121) [T63] Static demo build on REPLAY traces | RishitRai | Partial | Pages build/deploy exists; requested Lighthouse reports at both widths are not committed. |
| [#122](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/122) [T64] Demo walkthrough capture for the video | RishitRai | Active | Raw captures are now Rohan batch 2 handoff on #257; final capture/video still pending. |
| [#123](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/123) [T65] The held-out run, Mon Nov 16 | rohanrastogi311 | Blocked | Private held-out transmission was rejected by automatic approval review; explicit user approval for Nebius/Tavily remains outstanding. #250 has no score. |
| [#124](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/124) [T66] Release candidate and reproducibility check, Nov 18 freeze | rohanrastogi311 | Blocked | Release tag needs XO go; macOS/byte-identical replay check and final freeze state not established. |
| [#125](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/125) [T67] Held-out readout, told straight | AnoopIbrampur | Blocked | Anoop readout depends on actual one-shot held-out traces from #123/#250. |
| [#126](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/126) [T68] Submission write-up draft | AnoopIbrampur | Active | Submission copy #280 is open; held-out numbers remain pending. |
| [#127](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/127) [T69] Final polish pass on every screen | RishitRai | Active | Final UI pass belongs to #259; do not close ahead of its review. |
| [#128](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/128) [T70] README visuals | RishitRai | Partial | README images exist; complete under-2MB GIF/SVG acceptance remains unverified. |
| [#131](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/131) [T72] Five reviewed live traces as the default replay | rohanrastogi311 | Partial | Reviewed current dev-10 exists; five default traces with per-trace promotion review not established. |
| [#132](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/132) [T73] MCP server: pz_trace and pz_verify for agents | rohanrastogi311 | Missing deliverable | No packages/pz/src/mcp/server.ts or MCP stdio tool implementation exists. |
| [#133](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/133) [T74] Public-repo readiness: LICENSE, secret scan, env example | rohanrastogi311 | Partial | Historical scan was posted on issue; LICENSE/plan-privacy decision and fresh final scan still need owner disposition. |
| [#134](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/134) [T75] README rewrite: architecture, a walked trace, usage table | AnoopIbrampur | Partial | README rewrite is merged, but linked T58 cross-run usage report is explicitly still unwritten. |
| [#137](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/137) [T78] Demo video script and shot list | AnoopIbrampur | Partial | Script/storyboard updated in #277; approved final video/voiceover and held-out shot remain dependent. |
| [#143](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/143) [T84] Source card and evidence drawer | RishitRai | Partial | Source proof UI exists; complete evidence drawer/copy-span acceptance needs owner check. |
| [#146](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/146) [T87] Loading, empty and error states | RishitRai | Partial | Not-found and error improvements merged; all loading/no-page/failure-state acceptance needs final #259 review. |
| [#147](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/147) [T88] CONFLICTING view | RishitRai | Partial | Conflicting view exists; final paired-span and phone screenshot acceptance not independently verified. |
| [#148](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/148) [T89] Motion: autoplay intro, word morph, counter chain | RishitRai | Partial | Motion/reduced-motion code exists; full autoplay/morph/counter acceptance not independently verified. |
| [#149](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/149) [T90] Paste a whole AI answer | RishitRai | Partial | AnswerPage and recorded answer run exist; final multiline/live UI acceptance remains with #259. |
| [#150](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/150) [T91] Keyboard, hover, word blame, dates and phone finish | RishitRai | Active | Phone/nav work and final trace view continue in #259/#276 and Rohan #257 handoff. |
| [#159](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/159) [T92] Showcase gallery: 8 famous viral statistics, traced live | AnoopIbrampur | Partial | Seven gallery traces and honest grading exist. G6 failed intake and has no trace; eight successful verified traces criterion is not met. |
| [#160](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/160) [T93] Rematch: Patient Zero vs ChatGPT, Claude and Perplexity | AnoopIbrampur | Blocked | Only one preserved raw Claude transcript in #248; thirty-chat collection and blinded grading are incomplete. |
| [#161](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/161) [T94] Independence count as the headline: N pages, K independent, 1 origin | AnoopIbrampur | Complete | computeRoots, schema roots, independent verification, terminal/README line and independence tests are merged; current dev traces include counts. |
| [#163](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/163) [T96] Where Patient Zero is wrong: an honest limits page | AnoopIbrampur | Partial | docs/limits.md is linked and tested; rematch-derived misses cannot be complete before #160. |
| [#164](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/164) [T97] Reworded and drifted copies: Token Factory embeddings find what keywords miss | AnoopIbrampur | Complete | eval/drift/README.md reports E2/E3 precision/recall; batched embeddings, cache/budget and possible-variant output are merged. E3 precision loss is disclosed. |
| [#165](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/165) [T98] Speed and cost budget: median trace under 30 s and $0.02 | AnoopIbrampur | Partial | eval/perf.md measures missed targets; live remeasurement after performance fixes remains outstanding. |
| [#175](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/175) Voiceover test read of the demo script (Rohan, by Wed Nov 18) | rohanrastogi311 | Blocked | Only a text pacing estimate is posted; private audio read requires Rohan to record. |
| [#179](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/179) [T99] Case study: one claim's whole life, told as a story | AnoopIbrampur | Partial | Case-story evidence and rematch comparisons are not a completed acceptance package. |
| [#192](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/192) T100: live traces show bad spans (menus, wrong-unit matches) and the UI headlines them | XO/team | Partial | F1-F6 follow-ups landed, but gallery false-origin/date and held-out validation remain separate open evidence. |
| [#257](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/257) Landing page: a real website front for Patient Zero (Anoop, before freeze) | AnoopIbrampur | Active | Anoop #222/submission copy; Rohan Lighthouse, raw capture and 360/390 nav handoff. See latest comment. |
| [#259](https://github.com/vs-githjk/odsc-nebius-hackathon/issues/259) App inside: make the trace view and live run feel like a real app (Rishit, before freeze) | RishitRai | Active | Rishit owns live/trace-view acceptance; #276 open at snapshot. |

## Open PR handoff

- #222: continued by Anoop in his own branch per XO; do not duplicate or merge Rohan’s older version.
- #224: held by XO for the phrase subject/quote ambiguity; not ready to merge.
- #248: draft, one raw transcript only; no rematch score.
- #250: draft, blocked held-out checkpoint; no traces or score, one unsettled reservation.
- #276: Rishit trace-view changes pending review.
- #280: Anoop submission copy pending review.

## Local publication check

All finished changes from this pass must be published as PRs or issue comments. No blanket `git add` of other worktrees, keys, raw provider payloads or private targets.
