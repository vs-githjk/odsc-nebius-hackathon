# Handoff: ODSC x Nebius Hackathon (team Says Who)

Last updated: Sat Oct 31 2026, by the main session (conductor).
To resume in a new Claude Code chat opened in this folder, Vidyut says: **"I'm back, continue the master playbook"**. The new session reads this file, `plan/state.json` and `plan/decisions.md`, says where we are in three lines, and carries on.

## The event
- ODSC x Nebius Hackathon, online, Oct 28 to Nov 20 2026. Internal deadline: Thu Nov 19, 23:59 PT (the exact official time is not published; the submission link comes by email).
- One challenge: a research agent that "brings its sources", using Nebius Token Factory (open-model inference) and Tavily (web search). Needs a public repo, a README and a short demo. No live demo day: judges read the repo, README and video.
- Rubric: sourced and verifiable 30, works end to end 25, usefulness 20, agent design 15, use of Token Factory and Tavily 10. Details: `plan/intel.md` section 4, `plan/submission.md`.

## The team
| Person | GitHub | Focus issue | Status |
|---|---|---|---|
| Vidyut | vs-githjk | #2 | registered on the ODSC form (Oct 29) |
| Rohan | rohanrastogi311 | #3 | invite pending; holds the Token Factory card and key |
| Anoop | AnoopIbrampur | #4 | invite accepted |
| Rishit | RishitRai | #1 | invite sent Oct 29 |
- Team name: **Says Who** (everyone types it exactly so on the form). Humans talk on a WhatsApp group; tasks and agents run on GitHub.
- Repo (private): https://github.com/vs-githjk/odsc-nebius-hackathon. Teammate rules: `docs/AGENTS.md`.
- Emails are not stored in the repo.

## The idea (GATE 1 passed: "yes patient zero")
- **Patient Zero** (product name under review: it reads as medical; alternatives coming from the auditor). Lead framing: a **zombie stat check**. Paste a stat, a quote or a whole AI answer; every number gets traced backwards through time through every article that repeated it, to its origin or "trail goes cold"; a red ring marks the hop where the wording changed; the headline is "142 pages, 1 independent source, 0 studies"; each trace ends in a shareable origin card.
- Trivia mode **Zero In** (original game-show format) is Layer 2.
- Market check verdict: real but narrow need; fact-checkers and journalists are the demo user but not the payer; nobody else traces backwards or counts independent sources; the paid route later is a stat-origin API for AI answer engines and content tools (unproven). `plan/market.md`, artifact https://claude.ai/artifact/BtjsfsCuEUNYNWuppfJDjE
- Full brief: `plan/idea-brief.md` (refinement round 1).

## Where the playbook is
Stage: **H4.6 refine** (`plan/state.json`). Done: research, ideas r1 to r3, audits, market check, GATE 1, idea brief r1, GitHub setup, team invites.

Done this session (Oct 29, 01:37 to 02:00 PDT):
- Auditor r2 red team: FIX, 82/100 (`plan/audit.md` "Patient Zero brief r2").
- Vidyut decided: keep the name Patient Zero, keep Zero In as planned, apply the cut list, Anoop runs the head-to-head, all teammate work starts as GitHub issues via XO.
- Planner r2: `plan/idea-brief.md` is now round 2 (all auditor fixes, "Why not just ask ChatGPT or Claude?" section, head-to-head in the spike, Layer 1 fits only with a step-reveal tree first; whole build 104 to 129 h vs 128 h).
- XO kickoff: pinned #8 "Start here", kickoff tasks #5 Anoop head-to-head, #6 Rohan Token Factory smoke test, #7 Rishit Tavily probe, all due Sun Nov 1. Rohan and Rishit get assigned once they accept invites. Anoop must not read plan files that discuss claim origins until his PR is open.
- Idea page published (the market artifact turned into the idea page): https://claude.ai/artifact/BtjsfsCuEUNYNWuppfJDjE . It names a test claim origin, so do not share it with Anoop before his head-to-head is done.
- Quick designer look done: direction "Case File" https://claude.ai/artifact/WGJxxr2E2kCM6zdHpa3Niy (paper ground, one ink, forest-green action, red only for the mutation hop; Newsreader + Geist). Idea page restyled to match and links it. Fix pass landed (version 3, 01:57): labels cleared, callout moved, example traces badged REPLAY. The final tree edit was not re-screenshotted, so eyeball the trace once next session. It too names the goldfish origin: not for Anoop yet.

- DONE (02:05): master-planner studied Vidyut's private RerunLab repo (agent reruns a paper's code and checks results against its tables) for patterns to borrow or a stronger combined idea; output plan/rerunlab-inspo.md (goal odsc-pz-rerunlab-inspo). Verdict: borrow, do not combine (about 85 to 92 on the rubric for 7 to 10 h: planted trap set, code-only stop state with a 'How this was decided' panel, number matching rules). 5 questions for Vidyut in the file. Note: RerunLab's real build (branch build/rerunlab, 207 commits) exists only on his laptop at ~/projects/rerunlab, never pushed.

- DONE (02:15): portfolio sweep, plan/portfolio-inspo.md (top 5: code-only stop state, `pz verify`, trap set plus mvr false-certainty metric, README 'what is real' table, baseline ladder; Jev-style typed layer on Token Factory with logprob confidence, 'unsure' below threshold). Rohan's #6 now also checks json_schema + logprobs together.
- DONE (02:27): auditor gap to 96 (plan/audit.md, last section): projects 89 with all borrowings (the planner said 96.5; the auditor does not give Sourced full marks on a median build); 10 gap items reach about 96 (94 to 98) for about 22 h. Biggest single lift: two outside users timed on their own claims (+2.5), which waits for Anoop's head-to-head. Needs Vidyut: a live-trace cap for the judging window, and what happens to plan/ before the repo goes public.
- Lead search (master-leadgen) waits until Anoop's head-to-head is done (LOCKED).

- DONE (04:17): idea brief round 3 (all borrowings, typed decision layer, 10 gap items, 6 cooler features by layer, blind-target hash commit, RerunLab in Why us, judge pass). Projected about 96 (94 to 98), single-judge estimate. Open questions in the planner's report: new private product repo before Rohan's hash commit (rec yes, by Oct 31); judge pass 20 traces a day, $100 cap; researcher mode only if done by Nov 16; spike runner Rishit; Jev ablation skip.
- Organizer email sent by Vidyut (paula.m@odsc.com); watch for the reply and update plan/submission.md.
- DONE (04:28): 3 dynamic directions https://claude.ai/artifact/3of3mtRgffDZzqYuNvsujG : A Case File (microfilm-reel scrubber), B Instrument (seismograph strip chart, mono tiles), C Telephone (poster-size claim, chain of speech cards, tangerine drag pill). Designer picks A with C's giant claim; conductor leans C for the video. Screens in plan/artifacts/pz-directions/. REJECTED by Vidyut at 04:40 (sloppy, not professional league, not dynamic).

- Decided 04:30: keep plan/ public (no separate repo) and make it a strength for judges' agents (README section on plan/, an index, agent-readable entry points: planner adds this to the brief's README plan); Jev runs as an ablation row (Vidyut has a key; it goes in .env as TYPESAFE_API_KEY, he adds it); judge allowance yes; researcher mode stays; Rishit runs the spike. XO is posting Anoop's full do-not-open list on #5 and in docs/AGENTS.md.

- DONE (04:55, each passed one conductor fix round): design redo. d1 Lineage (Linear/Vercel) https://claude.ai/artifact/X1bjEAca217hZYLdvPAk14 ; d2 Rewind (Apple scroll) https://claude.ai/artifact/WMmPQfiHeLxfSXNzxMLUaZ ; d3 Time Machine (Stripe/Arc) https://claude.ai/artifact/G7RBqenpKwmzZLdwj7Bj5z . Waiting on Vidyut's pick (GATE 2), then share with the team. Was: 3 master-designers in parallel, one direction each: d1 Linear/Vercel (goal odsc-pz-redo-d1-linear), d2 Apple cinematic scroll (odsc-pz-redo-d2-apple), d3 Stripe/Arc (odsc-pz-redo-d3-stripe). Fewer screens: hero, the scrubber trace, blame/distortion micro-interactions, 390 px. Each holds itself against reference screenshots. Screens go to plan/artifacts/pz-redo/. Conductor judges them at full size against the references before relaying and sends back anything not pro-level. Then share with the team. Overnight build not before tomorrow (LOCKED).

- GATE 2 PASSED (about 05:05): direction Time Machine + Rewind, lighter and more vibrant, light first; round-3 plan approved. Vidyut does no work Oct 29 to 30; teammates carry it.
- IN FLIGHT: master-designer merges the two into the final design (plan/artifacts/pz-final/, plus DESIGN.md; goal odsc-pz-design-final). master-planner writes plan/PRD.md, plan/plan.md, plan/progress.md and plan/issues-oct29.md (goal odsc-pz-build-plan): Rishit front-end plus the spike, Anoop head-to-head then repo/CI/verify/trap set/README, Rohan agent core plus blind targets and grading.
- THEN: conductor checks both; XO posts the issues from plan/issues-oct29.md, shares the final design with Rohan and Rishit (NOT Anoop until his head-to-head PR is open), and drafts a WhatsApp line for Vidyut.
- Overnight build: tomorrow at the earliest, on Vidyut's own words "use a workflow, start the overnight build".

- DONE (12:28 PDT after a network drop): final design https://claude.ai/artifact/8JXR8hNEhEEk23Zfbjf7To (private to Vidyut; source and DESIGN.md in plan/artifacts/pz-final/). Build plan done: plan/PRD.md, plan/plan.md (20 Run-1 tasks, 12 Run-2), plan/issues-oct29.md, plan/progress.md. XO posting issues; finder picking claims 5 and 6 (plan/spike-claims-5-6.md, Part A postable, Part B never). Open for Vidyut: package allowlist OK, Run 2 owner (rec: his overnight build from Nov 2, Anoop second).

- DONE (12:31 PDT): 20 Run-1 issues posted (#9 to #28) with queues on each focus issue; claims 5 and 6 posted as wording only on #5, #9, #10 (origin notes stay local in git-ignored plan/spike-claims-5-6.md); Anoop's blind period lasts until all 6 transcripts are committed. Rohan's and Rishit's repo invites still pending; assign on accept. WhatsApp kickoff text given to Vidyut.

- PAUSED (12:45 PDT) on Vidyut's word. Package allowlist approved; Run 2 owner = his overnight build (Anoop backup). On "go": check teammates' progress on GitHub (XO watch pass: invites, PRs, #5, #9), then plan the first overnight build (Gate 3 wording "use a workflow, start the overnight build").

- Oct 31: orchestrating until Wed Nov 4 (LOCKED). Rohan finished #6 and T13 (PRs #29, #30). Batch in plan/issues-oct31.md: T1 and T2 moved to Rohan, new tasks T2b, T18b, E1, E2, all queues re-dated to Mon to Wed. Spike report now Tue Nov 3, grading Wed Nov 4, Run 2 after that. Rishit has posted nothing yet. Vidyut's own Nebius key line is still empty; Rohan sends it.

- Oct 31 latest: no background loop (LOCKED). When Vidyut comes back and asks for an update, run one XO watch pass, merge what passes, report in a few lines. PR #29 merged; #30 waiting on Rohan's fix list.

Next, in order (when Vidyut says "go"):
0. Discuss plan/rerunlab-inspo.md with Vidyut first.
1. Conductor picks claims 5 (a Wikipedia citogenesis case) and 6 (a fresh viral stat from the last 60 days) and has a non-runner write blind targets; XO posts the claims on #5 (never the targets).
2. Answered 02:05: Rohan grades the head-to-head blind; Rohan shares the key securely himself; daily cap 5; PaperTrail goes in Why us. XO tells Rohan about grading on #6 or a new issue next session. Still open: Layer 1 takes Nov 14 if the core slips (recommended yes), 2 extra fresh claims in the head-to-head (recommended yes).
3. Add PaperTrail to the brief's Why us (done on the idea page; planner adds it to plan/idea-brief.md).
4. master-designer: the full 3 directions from "How it will look" in the r2 brief.
5. Vidyut approves direction and plan (GATE 2), then the overnight build ("use a workflow, start the overnight build").

## Approved and waiting on a key
- Week-0 spike: live Tavily calls approved; Token Factory once Rohan's key exists (under about $2). It needs `TAVILY_API_KEY` in `.env` (already created from `.env.example`, git-ignored). The spike's pass bar is in `plan/idea-brief.md` "Risks and the week-0 spike".
- Discovery conversations: planning 3 to 5 is approved (master-leadgen finds, master-writer drafts, nothing is sent without Vidyut).

## Open questions for Vidyut
- Product name (after the auditor's alternatives).
- Does Zero In appear in the demo video? (Recommended: about 10 seconds near the end.)
- Team skills for the "Why us" TEAM line (from teammates' replies on their issues).

## Pages
- Decision desk (picks, team checklist): https://claude.ai/artifact/9DkDuMHZrn3BySunuMGsjH
- Market summary (to become the idea page): https://claude.ai/artifact/BtjsfsCuEUNYNWuppfJDjE

## Standing rules (from decisions.md and memory)
- Never add Co-Authored-By or AI attribution to commits or PRs.
- Never print or commit secrets; keys live only in `.env`.
- Facts are the agents' job, decisions are Vidyut's: ask batched questions, each with a recommendation.
- Think big; a safe pick is fine when it clearly works; Vidyut judges ambition.
- Every idea gets a deep market check (who benefits and how, who is affected, who pays, competitors with founders, B2B / B2C / B2B2C, impact).
- After every agent run: `python3 ~/.claude/skills/master-budget/usage.py --project "/Users/vidyutsriram/ODSC x Nebius Hackathon"`, and a line in `plan/telemetry.jsonl`.
- Cross-model: Codex reviews agent or skill changes before `~/master-agents/sync.sh`; save Codex output with `-o <file>`, never pipe it into `head`.
- Push plan updates to the private repo as part of the approved GitHub setup; nothing public, no deploys, no spending beyond what is approved.
