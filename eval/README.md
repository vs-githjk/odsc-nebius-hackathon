# Dev evaluation tools

## Walk replay: `make replay-walk SET=E2` (or `npm run replay-walk -- --set E2`)
1. A live run with `PZ_RECORD_DIR=runs/walk-record` (`make dev-run`; a bare `pz trace` records too, but under a random trace id that replay-walk does not look up) writes a recording: every HTTP response, every Token Factory reply and error, and each claim's start time.
2. Replay reruns the real pipeline (walk, dating, clusters, readouts, card) for every claim from that recording. Any request the recording lacks is a counted miss and never a network call.
3. It writes new traces to `runs/replay-walk/<set>/` and prints the replay score line, last night's committed score line, and `misses N (model, http)`. Each claim prints `exact replay, $0` or `walk changed: N paid request(s) not recorded (...)`, and the report ends with a per-claim miss table (claim, state, paid misses, free misses, verdict). Every miss is in `replay-misses.json` beside the traces.
   `make replay-walk SET=E2 CLAIMS=dev-02,dev-05` (or `--claims`) replays only those claims, for example the ones whose recording clocks come from the same run; an unknown id is an error.
4. Read it by the misses: 0 means a faithful rerun; a walk change that asks for pages or queries the recording never saw shows up as misses, and those claims need a live check.
5. The committed `eval/dev-traces` hold counts, not search results, pages or model answers, so they cannot be replayed; a failed live request is not recorded either and also counts as a miss.
