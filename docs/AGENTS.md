# Working in this repo (for teammates and their Claude agents)

Team Says Who, ODSC x Nebius Hackathon 2026. Deadline: Friday Nov 20, 2026 (exact time TBD; we plan to Nov 19 23:59 PT).

## Blind test rule (head-to-head)
Applies to Anoop (@AnoopIbrampur) and his Claude agent until all 6 of his head-to-head claim transcripts are committed (`spike/head-to-head/<tool>/1.md` to `6.md`). Opening the PR does not end it: claims 5 and 6 arrive later as a comment on #5, and XO confirms on #5 when the rule ends. Do not open, read, grep or summarise these, because they name the origins of the test claims:
`plan/idea-brief.md`, `plan/audit.md`, `plan/ideas.md`, `plan/ideas-r3.md`, `plan/market.md`, `plan/rerunlab-inspo.md`, `plan/portfolio-inspo.md`, `plan/board.md`, `plan/shared-memory.md`, `plan/artifacts/`, any other `spike/` or `eval/` files, and any claude.ai idea or design page links shared in chat.
Allowed: this file, `plan/plan.md` and `plan/PRD.md` (written origin-free; do not follow links marked "(blind)"), the kickoff issue #8 and his own issues. Append board lines with `echo ... >> plan/board.md` without opening the file. If any tool output shows claim-origin content, stop and flag it on #5. The rule ends when all 6 transcripts are committed and XO says so on #5. This overrides "Before every task" below for him.

## Before every task
1. Read `plan/shared-memory.md` (decisions, who is doing what, live facts, gotchas). (Anoop: skip until all 6 head-to-head transcripts are committed, see the blind test rule above.)
2. Read `plan/decisions.md` (LOCKED and REJECTED lines win over anything else) and the last 40 lines of `plan/board.md` (Anoop: skip the board until all 6 head-to-head transcripts are committed).
3. Read your focus issue (title "<Name>'s agent: everything until Nov 20"). It is your inbox: tasks, fix lists and answers arrive there. Check it after every task.

## How to work
- **One branch per task**, named `<your-github-login>/<short-task>` (example: `rohanrastogi311/tavily-client`).
- **One PR per task**, against `main`. In the PR body write `Refs #<your focus issue>`. Never write `Closes #<focus issue>` (it would close your inbox). Use `Closes #<n>` only for a separate task issue.
- Keep PRs small (under about 150 changed lines when you can). Tests green before you open the PR; say in the PR body which command you ran and its result.
- **Nobody pushes to `main`** except Vidyut and Master XO on his behalf. Never force-push. Never push to someone else's branch.
- Master XO reviews and merges. Fix lists come back as a comment on your focus issue, not on the PR. Merge `main` into your branch if asked, keep the other side's work, push a new commit.
- Changes to shared infrastructure (deploy config, secrets, live services, database schema, CI with secrets) are held until Vidyut says go.

## Secrets and personal data
- Keys live only in your local `.env` (copy `.env.example`). `.env` is git-ignored. Never commit it, never paste a key in an issue, PR, commit, log or chat.
- No emails, phone numbers or other personal data in the repo.
- If you leak a key by accident: revoke it at the provider first, then tell Vidyut on your focus issue (without the key).

## The board
After each task, append one line to `plan/board.md` in your PR:
`- [HH:MM PT] <your-login> <task>: <what you did, PR number or SHA> | @<who> <ask, if any>`
The board is for coordination and asks. Decisions are only in `plan/decisions.md` (Vidyut).

## Budget
Use the cheapest model that does the job well: Sonnet medium for specified code tasks and tests, Opus only for architecture or a hard bug. No long research sweeps or parallel subagents unless your task says so. Post a one-line usage check on your focus issue every few hours (for example "about 40% of weekly limit left").

## Usage ledger (everyone, after every Claude session)
So the whole team can see which models, tokens and tools (Apify, Bright Data, web search, Tavily, Token Factory) were used:
1. The script is in this repo at `plan/tools/usage.py`; nothing to install.
2. After each session, from the repo folder: `python3 plan/tools/usage.py`. It counts only your own machine's Claude Code sessions for this project and writes `plan/usage/<your GitHub login>.md` and `.jsonl`.
3. Commit those two files in your PR. Never edit `plan/usage.md` by hand: it is the generated summary. If it conflicts in a merge, run the script with `--combine` and commit the result.

## Lanes
Labels `lane:agent-core`, `lane:verification`, `lane:ui`, `lane:eval-demo-repo`. Your focus issue lists your lane, queue and due dates.
