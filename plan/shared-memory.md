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
- 2026-10-28 PREFERENCE: ideas must be ambitious and creative; show him only 1 or 2 (Vidyut)

## Who is doing what (refreshed 2026-10-29 01:46)
Stage H4.6 refine round 2 (auditor r2 FIX 82/100). Kickoff issue #8 (pinned). Each teammate has one kickoff task (Part A setup, registration, keys; Part B own), due Sun Nov 1 23:59 PT.
| Who | Task | Where | Due (PT) | Status |
|---|---|---|---|---|
| Vidyut (vs-githjk) | lead: approves brief r2, design direction, plan | #2 | n/a | registered on ODSC form |
| Rohan (rohanrastogi311) | Token Factory team key + smoke test | #6 (inbox #3) | Nov 1 23:59 | invite pending; unassigned until accepted |
| Anoop (AnoopIbrampur) | head-to-head vs ChatGPT, Claude, Perplexity (blind; claims 5, 6 to be posted) | #5 (inbox #4) | Nov 1 23:59 | assigned |
| Rishit (RishitRai) | Tavily capability probe (neutral phrases) | #7 (inbox #1) | Nov 1 23:59 | invite pending; unassigned until accepted |
| master-planner | rewrite plan/idea-brief.md to round 2 | plan/idea-brief.md | NOT CHECKED | running |
Lanes get assigned after Vidyut approves the plan.

## Open questions
- 2026-10-29 Claims 5 (Wikipedia citogenesis case) and 6 (viral stat, last 60 days) for #5, and the blind grading targets (conductor / Vidyut)
- 2026-10-29 How Rohan's Token Factory key reaches the others (Vidyut; never on GitHub)
- 2026-10-28 Repo visibility: private now; must be public by submission (Vidyut, at the end)
- 2026-10-28 Exact deadline time and timezone (settled by the ODSC submission email)

## Live facts
- 2026-10-28 23:54 Repo https://github.com/vs-githjk/odsc-nebius-hackathon PRIVATE, default branch main (gh repo view)
- 2026-10-28 23:56 main branch protection: force-push and deletion blocked; admins not enforced; no required reviews or checks
- Nothing deployed. No CI. Keys: none in repo; .env.example lists NEBIUS_API_KEY, TAVILY_API_KEY
- Repo watch loop: NOT started (starts after idea and plan are approved)
- 2026-10-29 01:46 collaborators: vs-githjk, AnoopIbrampur; pending invites: rohanrastogi311, RishitRai (gh api invitations)

## Gotchas
- 2026-10-29 plan/idea-brief.md, audit.md, ideas-r3.md, market.md, board.md and artifacts/ discuss the spike claims' origins: Anoop must not read them until his #5 PR is open; keep claim origins out of this file and out of issues.
- 2026-10-28 Commits on main must not carry Co-Authored-By or AI attribution (Vidyut's rule); c329ef4 already does and cannot be fixed without a force-push, so leave it.
- 2026-10-28 Pending invitees cannot be assigned to issues until they accept; XO assigns #3 and #4 on the first watch pass after acceptance.
- 2026-10-28 Branch protection on a personal repo cannot restrict who pushes to main: "PRs only" for teammates is a convention, not enforced.
- 2026-10-28 Use `Refs #<focus issue>` in PRs, never `Closes`, or the inbox closes.
- 2026-10-28 ODSC form "Team Name" is required and saved verbatim (stored in a reused field): type exactly "Says Who".
- 2026-10-28 Token Factory onboarding needs a bank card; set a low auto-charge threshold.
