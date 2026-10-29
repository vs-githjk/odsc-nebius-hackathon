# Handoff: ODSC x Nebius Hackathon (team Says Who)

Last updated: Thu Oct 29 2026, about 02:00 PDT, by the main session (conductor).
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
- Idea page published (the market artifact turned into the idea page): https://claude.ai/artifact/BtjsfsCuEUNYNWuppfJDjE . It names the goldfish 2012 origin, so do not share it with Anoop before his head-to-head is done.
- Quick designer look done: direction "Case File" https://claude.ai/artifact/WGJxxr2E2kCM6zdHpa3Niy (paper ground, one ink, forest-green action, red only for the mutation hop; Newsreader + Geist). Idea page restyled to match and links it. Fix pass landed (version 3, 01:57): labels cleared, callout moved, example traces badged REPLAY. The final tree edit was not re-screenshotted, so eyeball the trace once next session. It too names the goldfish origin: not for Anoop yet.

Next, in order (when Vidyut says "go"):
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
