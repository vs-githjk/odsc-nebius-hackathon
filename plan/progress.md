# Progress: Patient Zero (team Says Who)

Written by the main session after every gate, sprint and build run, so a compacted or new session resumes without redoing work. One line per task, newest state wins. SHAs come from `git rev-parse --short` (first and last commit of the task). Tasks are defined in `plan/plan.md`; issue drafts in `plan/issues-oct29.md`.

## Tasks
Status is one of: done, done_with_concerns, parked, needs_context, skipped, not started.

Kickoff issues (prerequisites, not plan tasks):
- #5 head-to-head (Anoop): not started
- #6 Token Factory smoke (Rohan): PR #30 reviewed, FIX (2 medium, 3 low)
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
- T13: PR #29 reviewed, PASS, merged Oct 31
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
- 2026-11-01 (watch pass): PR #35 T1 FIX at aa79edd, two small items on #3. Vite 7.3.7 pin enforced as the plan says. Nothing merged. Rishit nudged on #1, still silent; Anoop has pushed nothing, #5 due tonight.
- 2026-11-01 (watch pass 2): Rishit active: ODSC registered, dates yes. PR #36 (#7 probe) PASS, merged. PR #37 T10 draft on Rohan's skeleton, not reviewed until #35 and #12 merge. Probe: `exact_match` returns no raw_content and needs a date window to return dates, so T11 extracts separately.
- 2026-11-02 (watch pass 3): #5 delivered as PR #38, 18 transcripts, held off main until T12 report so the spike is not tainted. Anoop's blind period ended by XO on #5. Deviations logged by Anoop: ChatGPT claims 3 to 6 not Deep research, Claude free regular, Perplexity default and possibly one thread. Rohan silent since the #35 fix list; #35 and T2 block T10, T14, T3, T5.
- 2026-11-02 (watch pass 4): T1 #35, T2 #39 and #30 merged. XO applied the executable bit and resolved #39's conflicts at Rohan's request (browser-only git). T2b must replace PENDING asserts and pin option ids. Nebius key in Vidyut's .env now works (200 on /v1/models).

## Gates
- gate1: "yes patient zero im open to exploring more anobt this" (Thu Oct 29 2026, about 01:05 PDT)
- gate2: "Yes, I approve the plan" (Thu Oct 29 2026, about 05:05 PDT)
- design direction: "Yeah, I completely agree. Time machine plus rewind, but somewhat lighter, more vibrant color" (Thu Oct 29 2026, about 05:00 PDT)
