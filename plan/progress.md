# Progress: Patient Zero (team Says Who)

Written by the main session after every gate, sprint and build run, so a compacted or new session resumes without redoing work. One line per task, newest state wins. SHAs come from `git rev-parse --short` (first and last commit of the task). Tasks are defined in `plan/plan.md`; issue drafts in `plan/issues-oct29.md`.

## Tasks
Status is one of: done, done_with_concerns, parked, needs_context, skipped, not started.

Kickoff issues (prerequisites, not plan tasks):
- #5 head-to-head (Anoop): not started
- #6 Token Factory smoke (Rohan): PR #30 in review
- #7 Tavily probe (Rishit): not started

Run 1 (Oct 29 to Nov 1):
- T1: not started
- T2: not started
- T3: not started
- T4: not started
- T5: not started
- T6: not started
- T7: not started
- T8: not started
- T9: not started
- T10: not started
- T11: not started
- T12: not started
- T13: PR #29 in review (hashes match the #10 comment)
- T14: not started
- T15: not started
- T16: not started
- T17: not started
- T18: not started
- T19: not started
- T20: not started

Run 2 (Nov 2 to Nov 8, provisional until the spike report): T21 to T32 not started.

## Rulings
Every decision made during the build that the plan did not settle, by Vidyut or by the main session. Mark who decided.
- 2026-10-31 (main session, Vidyut told us to do what Rohan asked): embeddings move to `Qwen/Qwen3-Embedding-8B` because `BAAI/bge-en-icl` returned 404 in #6. Clustering thresholds are set on dev for the new model.
- 2026-10-31 (main session): no GLM follow-up. GLM was only a stretch second opinion, DeepSeek-V4-Pro-0813 already works for that role.
- 2026-10-31 (main session, lanes are the conductor's call per decisions.md): T1 and T2 move from Anoop to Rohan, because Rohan was blocked and Anoop had not started. Question wording stays Anoop's (T2b), so the blinding rule holds.
- 2026-10-31 (main session): spike report moves to Tue Nov 3 and grading to Wed Nov 4, since T1 to T5 had not started. Run 2 cannot start before the grading, so it loses about 2 of its 7 days.
- 2026-10-31 (main session): `usage.py` copied into the repo at `plan/tools/usage.py` so teammates need no access to master-agents. It holds no personal data or keys.

## Gates
- gate1: "yes patient zero im open to exploring more anobt this" (Thu Oct 29 2026, about 01:05 PDT)
- gate2: "Yes, I approve the plan" (Thu Oct 29 2026, about 05:05 PDT)
- design direction: "Yeah, I completely agree. Time machine plus rewind, but somewhat lighter, more vibrant color" (Thu Oct 29 2026, about 05:00 PDT)
