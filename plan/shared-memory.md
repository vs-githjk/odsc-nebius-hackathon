# Shared memory: Says Who, ODSC x Nebius Hackathon 2026
Every agent and teammate reads this first. Owner: Master XO. Keep under about 150 lines; old items go to plan/shared-memory-archive.md. No secrets, no emails.

## Decisions (mirror of plan/decisions.md; Vidyut decides)
- 2026-10-28 LOCKED: enter ODSC x Nebius Hackathon (online, Oct 28 to Nov 20) (Vidyut)
- 2026-10-28 LOCKED: team of 4, about 2 h/day each, coordinate through GitHub via master-xo (Vidyut)
- 2026-10-28 LOCKED: team name "Says Who" (conductor proposed, Vidyut accepted)
- 2026-10-28 LOCKED: teammates rohanrastogi311, AnoopIbrampur; 4th = RishitRai (2026-10-29) (Vidyut)
- 2026-10-28 LOCKED: Vidyut's registration state is Pennsylvania (Vidyut)
- 2026-10-28 LOCKED: set up GitHub now, in parallel with registration (Vidyut)
- 2026-10-28 REJECTED: ideas r2 (A Receipts, B Says Who as a product): too simple, not ambitious (Vidyut)
- 2026-10-29 LOCKED: full usage transparency: plan/tools/usage.py builds plan/usage.md after every agent run; the app logs every Token Factory and Tavily call (Vidyut)
- 2026-10-29 LOCKED: GATE 1 Patient Zero; product name Patient Zero (kept after auditor r2), team Says Who (Vidyut)
- 2026-10-29 LOCKED: lead framing zombie stat check; Zero In trivia stays Layer 2; auditor r2 cut list accepted (Vidyut)
- 2026-10-29 LOCKED: Rohan holds the Token Factory card and team key; week-0 spike approved (Tavily, Token Factory under about $2) (Vidyut)
- 2026-10-29 LOCKED: Anoop runs the consumer deep-research head-to-head (Vidyut)
- 2026-10-29 LOCKED: every teammate's work starts as a GitHub issue; XO does all team comms there; humans on WhatsApp (Vidyut)
- 2026-10-31 LOCKED: until Wed Nov 4 the main session only orchestrates; teammates get tasks through Mon or Tue (Vidyut)
- 2026-10-31 LOCKED: review #29 and #30 and settle Rohan's two open calls (embedding replacement, GLM follow-up) (Vidyut)
- 2026-10-28 PREFERENCE: ideas must be ambitious and creative; show him only 1 or 2 (Vidyut)

## Who is doing what (refreshed 2026-10-31 PT; assignees checked with gh after posting)
Team batch from plan/issues-oct31.md posted Oct 31: new issues #31 T2b, #32 T18b, #33 E1, #34 E2. T1 and T2 moved from Anoop to Rohan. All times PT.
| Who | Queue (in order) | Inbox | Status |
|---|---|---|---|
| Vidyut (vs-githjk) | orchestrating only until Wed Nov 4; add the Nebius key line to his `.env` when Rohan sends it | #2 | decisions only |
| Rohan (rohanrastogi311) | 4 yes or no answers on #3 (today); key to Vidyut privately (Sun Nov 1); #11 T1 (Sat Oct 31 23:59); #12 T2 without wording (Sun Nov 1 23:59); #26 T18 (Mon Nov 2 23:59); #32 T18b (Tue Nov 3 12:00); #27 T19 (Tue Nov 3 23:59); #33 E1 (Wed Nov 4 23:59); #28 T20 (Wed Nov 4 23:59) | #3 | PRs #29 and #30 open, in review; #6 and #9 stay open |
| Anoop (AnoopIbrampur) | #5 head-to-head (Sun Nov 1 23:59); #13 T4, #31 T2b, #14 T3 (Mon Nov 2); #15 T5 (Mon Nov 2 23:59, unblocks the spike); #34 E2 (Tue Nov 3 23:59, only after XO confirms on #5 that his blind period ended); #16 T6 (Tue Nov 3 23:59); then #17 T7, #18 T8, #19 T9 | #4 | blind until all 6 transcripts are committed; not ended |
| Rishit (RishitRai) | reply on #1 today; #7 (Sun Nov 1 23:59); #20 T10 (Mon Nov 2 23:59); #21 T11 (Tue Nov 3 12:00); #10 T12 spike run and report (Tue Nov 3 23:59); #22 T14, then #23, #24, #25 | #1 | nothing from him on GitHub yet as of Oct 31 |

## Open questions
- 2026-10-31 Rohan to answer on #3: durable private backup of the targets; ODSC form as `Says Who`; Builder Program joined; low auto-charge limit set (Rohan)
- 2026-10-31 Rishit to answer on #1: ODSC form as `Says Who`, skills, usual hours, AI plans (Rishit)
- 2026-10-28 Repo visibility: private now; must be public by submission (Vidyut, at the end)
- 2026-10-28 Exact deadline time and timezone (settled by the ODSC submission email)

## Live facts
- 2026-10-28 23:54 Repo https://github.com/vs-githjk/odsc-nebius-hackathon PRIVATE, default branch main (gh repo view)
- 2026-10-28 23:56 main branch protection: force-push and deletion blocked; admins not enforced; no required reviews or checks
- Nothing deployed. No CI. Keys: none in repo; .env.example lists NEBIUS_API_KEY, TAVILY_API_KEY
- Repo watch loop: NOT started (starts after idea and plan are approved)
- 2026-10-31 Open PRs #29 and #30 in review, not merged; merging waits for that verdict and Vidyut
- 2026-10-31 All invites accepted: collaborators vs-githjk, rohanrastogi311, AnoopIbrampur, RishitRai; pending invitations empty (gh api collaborators, invitations)
- 2026-10-31 Rohan's Token Factory key is ready (#3, Oct 30) but not yet delivered to Vidyut; due privately by Sun Nov 1, never on GitHub
- 2026-10-31 Model pins (plan/plan.md): `Qwen/Qwen3-30B-A3B-Instruct-2507` typed answers, fingerprint, card sentence; `Qwen/Qwen3-Embedding-8B` embeddings, 4096 dimensions, replaces `BAAI/bge-en-icl` (404 in #6), clustering thresholds set on dev; `deepseek-ai/DeepSeek-V4-Pro-0813` second opinion, eval stretch only; GLM dropped; temperature 0 for every typed call
- 2026-10-31 `usage.py` is in the repo at plan/tools/usage.py; teammates do not need master-agents access

## Gotchas
- 2026-10-31 #10's title still says due Sun Nov 1; the Oct 31 comment (Tue Nov 3, 23:59 PT) is the current date.
- (2026-10-29) GitHub API gave TLS timeouts and HTTP 499 on issue create: check by title (REST list) before retrying a create, or you get duplicates.
- (2026-10-29) Anoop's blind rule ends only when all 6 transcripts are committed, not when his PR opens (docs/AGENTS.md f977a8d).
- 2026-10-29 plan/idea-brief.md, audit.md, ideas-r3.md, market.md, board.md and artifacts/ discuss the spike claims' origins: Anoop must not read them until his #5 PR is open; keep claim origins out of this file and out of issues.
- 2026-10-28 Commits on main must not carry Co-Authored-By or AI attribution (Vidyut's rule); c329ef4 already does and cannot be fixed without a force-push, so leave it.
- 2026-10-28 Pending invitees cannot be assigned to issues until they accept; XO assigns #3 and #4 on the first watch pass after acceptance.
- 2026-10-28 Branch protection on a personal repo cannot restrict who pushes to main: "PRs only" for teammates is a convention, not enforced.
- 2026-10-28 Use `Refs #<focus issue>` in PRs, never `Closes`, or the inbox closes.
- 2026-10-28 ODSC form "Team Name" is required and saved verbatim (stored in a reused field): type exactly "Says Who".
- 2026-10-28 Token Factory onboarding needs a bank card; set a low auto-charge threshold.
