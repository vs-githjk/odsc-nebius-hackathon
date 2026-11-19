# Speed and cost per trace (#165)

Measured from the committed recordings in eval/dev-traces, with no network and no keys: `node --import tsx eval/perf.ts` rewrites this file. Cost is Tavily credits at the list price ($0.008 a credit, packages/pz/src/clients/tavily.ts) plus Token Factory's recorded cost per call; seconds is the trace's own wall time (budget.ms). Cache hits are not counted.

Target: a median trace under 30 s and under $0.02.

- **Median time: 44 s** (not met).
- **Median cost: $0.08** (not met): Tavily $0.08 (10 credits), Token Factory $0.0005.
- 20 traces. Tavily is almost all of the cost.
- Includes dev-19, scored apart as out of scope in eval/dev-claims.json. Without it, the median is 45 s and $0.08.

## Where the time goes

Summed call latency by service across all traces (calls overlap, so this ranks the services; it does not add up to wall time):

| Service | Calls | Latency (s) | Share |
|---|---|---|---|
| tokenfactory | 295 | 515 | 46% |
| tavily | 265 | 444 | 39% |
| wayback | 85 | 125 | 11% |
| fetch | 36 | 42 | 4% |
| ncbi | 2 | 0 | 0% |
| crossref | 1 | 0 | 0% |

## Per trace

| Trace | Ending | Seconds | Tavily credits | Tavily $ | Model $ | Total $ |
|---|---|---|---|---|---|---|
| dev-01 | TRAIL_GOES_COLD | 76 | 15 | $0.12 | $0.0012 | $0.12 |
| dev-02 | TRAIL_GOES_COLD | 34 | 10 | $0.08 | $0.0003 | $0.08 |
| dev-03 | TRAIL_GOES_COLD | 27 | 10 | $0.08 | $0.0004 | $0.08 |
| dev-04 | TRAIL_GOES_COLD | 62 | 9 | $0.07 | $0.0004 | $0.07 |
| dev-05 | TRAIL_GOES_COLD | 89 | 14 | $0.11 | $0.0006 | $0.11 |
| dev-06 | TRAIL_GOES_COLD | 174 | 35 | $0.28 | $0.0012 | $0.28 |
| dev-07 | NO_PAGES_FOUND | 23 | 5 | $0.04 | $0.0001 | $0.04 |
| dev-08 | NO_PAGES_FOUND | 17 | 4 | $0.03 | $0.0001 | $0.03 |
| dev-09 | TRAIL_GOES_COLD | 62 | 9 | $0.07 | $0.0006 | $0.07 |
| dev-10 | TRAIL_GOES_COLD | 103 | 18 | $0.14 | $0.0010 | $0.15 |
| dev-11 | TRAIL_GOES_COLD | 92 | 14 | $0.11 | $0.0009 | $0.11 |
| dev-12 | TRAIL_GOES_COLD | 22 | 6 | $0.05 | $0.0004 | $0.05 |
| dev-13 | TRAIL_GOES_COLD | 34 | 10 | $0.08 | $0.0006 | $0.08 |
| dev-14 | TRAIL_GOES_COLD | 43 | 9 | $0.07 | $0.0004 | $0.07 |
| dev-15 | NO_PAGES_FOUND | 30 | 11 | $0.09 | $0.0002 | $0.09 |
| dev-16 | TRAIL_GOES_COLD | 45 | 14 | $0.11 | $0.0007 | $0.11 |
| dev-17 | TRAIL_GOES_COLD | 123 | 25 | $0.20 | $0.0010 | $0.20 |
| dev-18 | TRAIL_GOES_COLD | 51 | 10 | $0.08 | $0.0006 | $0.08 |
| dev-19 | TRAIL_GOES_COLD | 32 | 10 | $0.08 | $0.0002 | $0.08 |
| dev-20 | TRAIL_GOES_COLD | 37 | 11 | $0.09 | $0.0002 | $0.09 |

Not done yet (#165 steps 2 and 3): cutting the top costs and re-measuring live. Both need a live run, so the before and after numbers come with it.
