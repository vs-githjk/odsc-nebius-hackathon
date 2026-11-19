# Speed and cost per trace (#165)

Measured from the committed recordings in eval/dev-traces, with no network and no keys: `node --import tsx eval/perf.ts` rewrites this file. Cost is Tavily credits at the list price ($0.008 a credit, packages/pz/src/clients/tavily.ts) plus Token Factory's recorded cost per call; seconds is the trace's own wall time (budget.ms). Cache hits are not counted.

Target: a median trace under 30 s and under $0.02.

- **Median time: 42 s** (not met).
- **Median cost: $0.08** (not met): Tavily $0.08 (10.5 credits), Token Factory $0.0006.
- 20 traces. Tavily is almost all of the cost.

## Where the time goes

Summed call latency by service across all traces (calls overlap, so this ranks the services; it does not add up to wall time):

| Service | Calls | Latency (s) | Share |
|---|---|---|---|
| tokenfactory | 320 | 532 | 50% |
| tavily | 238 | 433 | 40% |
| wayback | 61 | 58 | 5% |
| fetch | 55 | 48 | 5% |

## Per trace

| Trace | Ending | Seconds | Tavily credits | Tavily $ | Model $ | Total $ |
|---|---|---|---|---|---|---|
| dev-01 | TRAIL_GOES_COLD | 76 | 15 | $0.12 | $0.0012 | $0.12 |
| dev-02 | TRAIL_GOES_COLD | 41 | 9 | $0.07 | $0.0003 | $0.07 |
| dev-03 | TRAIL_GOES_COLD | 31 | 10 | $0.08 | $0.0005 | $0.08 |
| dev-04 | TRAIL_GOES_COLD | 40 | 8 | $0.06 | $0.0007 | $0.06 |
| dev-05 | TRAIL_GOES_COLD | 47 | 11 | $0.09 | $0.0006 | $0.09 |
| dev-06 | TRAIL_GOES_COLD | 68 | 14 | $0.11 | $0.0009 | $0.11 |
| dev-07 | TRAIL_GOES_COLD | 34 | 13 | $0.10 | $0.0005 | $0.10 |
| dev-08 | TRAIL_GOES_COLD | 39 | 6 | $0.05 | $0.0003 | $0.05 |
| dev-09 | TRAIL_GOES_COLD | 58 | 10 | $0.08 | $0.0006 | $0.08 |
| dev-10 | TRAIL_GOES_COLD | 60 | 12 | $0.10 | $0.0008 | $0.10 |
| dev-11 | TRAIL_GOES_COLD | 86 | 12 | $0.10 | $0.0008 | $0.10 |
| dev-12 | TRAIL_GOES_COLD | 42 | 9 | $0.07 | $0.0006 | $0.07 |
| dev-13 | TRAIL_GOES_COLD | 96 | 11 | $0.09 | $0.0008 | $0.09 |
| dev-14 | TRAIL_GOES_COLD | 41 | 7 | $0.06 | $0.0007 | $0.06 |
| dev-15 | NO_PAGES_FOUND | 35 | 11 | $0.09 | $0.0002 | $0.09 |
| dev-16 | TRAIL_GOES_COLD | 98 | 16 | $0.13 | $0.0010 | $0.13 |
| dev-17 | TRAIL_GOES_COLD | 126 | 27 | $0.22 | $0.0012 | $0.22 |
| dev-18 | TRAIL_GOES_COLD | 32 | 10 | $0.08 | $0.0005 | $0.08 |
| dev-19 | TRAIL_GOES_COLD | 28 | 5 | $0.04 | $0.0001 | $0.04 |
| dev-20 | TRAIL_GOES_COLD | 32 | 8 | $0.06 | $0.0003 | $0.06 |

Not done yet (#165 steps 2 and 3): cutting the top costs and re-measuring live. Both need a live run, so the before and after numbers come with it.
