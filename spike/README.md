# Week-0 spike walker

Fixed rules: no person picks the next page. A bug fix means a logged rerun from scratch.

Run one claim from the repo root, with `TAVILY_API_KEY` in `.env`:

```
npx tsx spike/walk.ts --claim dry-run
npx pz verify spike/traces/dry-run.json --pages .cache/pages/dry-run
```

Writes `spike/traces/<id>.json` and `spike/logs/<id>.jsonl`. Full page text stays in the git-ignored `.cache/pages/`. Responses are cached in `.cache/http/`, and usage rows go to `runs/usage.jsonl`.

Do not run `claim-1` to `claim-6` until the target hashes are on #10. Their text and atoms in `claims.json` are committed before any call.

## The rules, in order

1. **Queries:** `"<variant>" <subject>` from the claim's atoms, at most 3, with `exact_match`. Every search carries `end_date`, because the #7 probe found exact searches return no dates without a window. At least 2 searches run per window.
2. **Next pages:** links beside a span first, then search results, earliest date first, up to the frontier cap. Fact-check domains are excluded.
3. **Reading:** page text comes from `/extract`, because `exact_match` returns no `raw_content`. A page is kept only if one sentence names the subject, passes `atomHit`, and has no negation before the number.
4. **Dates:** the Tavily date, capped by the Wayback first capture. An earlier capture makes the date `existed_by`, flagged as conflicting.
5. **Stopping:** when a window moves nothing further back and no links are left, or at a cap.
6. **Ending:** `decideStopState` alone.

## Known limits of this spike script

- **No page types.** The typed layer (T19) is not built, so `pageType` is null and no trace can end `ORIGIN_FOUND`. The earliest page is still what grading compares against the target.
- **Written-out numbers are not matched.** `atomHit` reads digits only, so a page saying "ten times" is found by search but dropped.
- **Clusters are crude.** Pages join a cluster only if title and sentence both match. Clustering proper is T26.
- **The subject must appear in the sentence.** A page spelling or phrasing the subject differently is dropped and logged.
- **Blame is empty.** It arrives with T27.

## Replays

If a claim's paid calls all come from the cache, the walker treats the run as a replay. It then refuses to write the trace unless it gets the recorded trace to carry, through `--replay-of <trace.json>`. A replay is written as `mode: "REPLAY"` with the recorded run's date, budget and usage rows, plus rows for any free calls made fresh, such as Wayback lookups after a change to the CDX query. A run that makes even one paid call is LIVE, and its credits count only that run's new calls.
