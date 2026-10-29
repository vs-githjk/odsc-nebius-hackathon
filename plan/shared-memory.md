# Shared memory: Says Who, ODSC x Nebius Hackathon 2026
Every agent and teammate reads this first. Owner: Master XO. Keep under about 150 lines; old items go to plan/shared-memory-archive.md. No secrets, no emails.

## Decisions (mirror of plan/decisions.md; Vidyut decides)
- 2026-10-28 LOCKED: enter ODSC x Nebius Hackathon (online, Oct 28 to Nov 20) (Vidyut)
- 2026-10-28 LOCKED: team of 4, about 2 h/day each, coordinate through GitHub via master-xo (Vidyut)
- 2026-10-28 LOCKED: team name "Says Who" (conductor proposed, Vidyut accepted)
- 2026-10-28 LOCKED: teammates rohanrastogi311, AnoopIbrampur; 4th TBD (Vidyut)
- 2026-10-28 LOCKED: Vidyut's registration state is Pennsylvania (Vidyut)
- 2026-10-28 LOCKED: set up GitHub now, in parallel with registration (Vidyut)
- 2026-10-28 REJECTED: ideas r2 (A Receipts, B Says Who as a product): too simple, not ambitious (Vidyut)
- 2026-10-29 LOCKED: full usage transparency: plan/tools/usage.py builds plan/usage.md after every agent run; the app logs every Token Factory and Tavily call (Vidyut)
- 2026-10-28 PREFERENCE: ideas must be ambitious and creative; show him only 1 or 2 (Vidyut)

## Who is doing what
| Who | Task | Where | Due (PT) | Status |
|---|---|---|---|---|
| Vidyut (vs-githjk) | week-0 onboarding; pick idea; confirm 4th teammate; visibility at end | issue #2 | Oct 29 21:00 | open |
| Rohan (rohanrastogi311) | week-0 onboarding (register, keys, reply, read AGENTS.md) | issue #3 | Oct 29 21:00 / keys Oct 30 21:00 | invited, not yet accepted |
| Anoop (AnoopIbrampur) | week-0 onboarding | issue #4 | same | invited, not yet accepted |
| Teammate 4 (TBD) | week-0 onboarding (placeholder) | issue #1 | after confirmed | unassigned |
| Conductor + planner | new ambitious ideas round | plan/ideas.md | NOT CHECKED | running |
Lanes (lane:agent-core, lane:verification, lane:ui, lane:eval-demo-repo) get assigned after the idea pick.

## Open questions
- 2026-10-28 Which idea? (Vidyut, after the ideas round)
- 2026-10-28 Who is teammate 4? (Vidyut)
- 2026-10-28 Repo visibility: private now; must be public by submission (Vidyut, at the end)
- 2026-10-28 Exact deadline time and timezone (settled by the ODSC submission email)

## Live facts
- 2026-10-28 23:54 Repo https://github.com/vs-githjk/odsc-nebius-hackathon PRIVATE, default branch main (gh repo view)
- 2026-10-28 23:56 main branch protection: force-push and deletion blocked; admins not enforced; no required reviews or checks
- Nothing deployed. No CI. Keys: none in repo; .env.example lists NEBIUS_API_KEY, TAVILY_API_KEY
- Repo watch loop: NOT started (starts after idea and plan are approved)

## Gotchas
- 2026-10-28 Commits on main must not carry Co-Authored-By or AI attribution (Vidyut's rule); c329ef4 already does and cannot be fixed without a force-push, so leave it.
- 2026-10-28 Pending invitees cannot be assigned to issues until they accept; XO assigns #3 and #4 on the first watch pass after acceptance.
- 2026-10-28 Branch protection on a personal repo cannot restrict who pushes to main: "PRs only" for teammates is a convention, not enforced.
- 2026-10-28 Use `Refs #<focus issue>` in PRs, never `Closes`, or the inbox closes.
- 2026-10-28 ODSC form "Team Name" is required and saved verbatim (stored in a reused field): type exactly "Says Who".
- 2026-10-28 Token Factory onboarding needs a bank card; set a low auto-charge threshold.
