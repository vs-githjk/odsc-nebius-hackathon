# Token Factory neutral probe

Recorded 2026-11-03T00:06:05.910275+00:00 (Nov 2 PT). Refs #32, #3, #26, #27.

## Results

| Workload | Calls | p50 ms | p90 ms |
|---|---:|---:|---:|
| single | 10 | 4593 | 8184 |
| batch20 | 10 | 5503 | 7652 |
| typed | 10 | 3845 | 7240 |

Sequential calls, no warmup exclusion, no automatic retries, nearest-rank percentiles. The timed groups each have ten HTTP 200 responses. This small sample includes network and provider latency and is not a service guarantee. Batch20 maximum was 18267 ms; nearest-rank p90 is 7652 ms and excludes that outlier. Batching 20 texts does not multiply latency by 20; use batching where the algorithm permits. No engine budgets or thresholds changed.

## Catalogue and prices

GET /v1/models?verbose=true returned HTTP 200. Only one embedding model and no rerank model were listed:

| Model | Input USD / million tokens | Output USD / million tokens |
|---|---:|---:|
| Qwen/Qwen3-Embedding-8B | 0.01 | 0 |

The raw per-token prices and modality are in the adjacent JSON catalogue section. No /v1/rerank call was made because no rerank model was listed. This does not assert that an unlisted endpoint can never exist.

## Embedding dimensions

| Requested | HTTP | Returned |
|---:|---:|---:|
| 64 | 200 | 64 |
| 128 | 200 | 128 |
| 256 | 200 | 256 |
| 512 | 200 | 512 |
| 1024 | 200 | 1024 |
| 2048 | 200 | 2048 |
| 4096 | 200 | 4096 |
| 4097 | 200 | 4096 |

The dimensions parameter works for the seven tested sizes up to 4096. Other sizes were not tested. Asking for 4097 succeeds but silently returns 4096 values. The T18 client checks requested versus returned dimensions and rejects mismatches as bad_response. The product model remains pinned to 4096 dimensions.

## Strict schema and token distinction

All ten typed calls accepted the exported questions.schema.json including its top-level $schema, returned valid JSON with all four required enum fields, and finished with stop. No stripping is required for the tested model. Every call combined strict schema with logprobs=true and top_logprobs=5.

| page_type id | First value token observed |
|---|---|
| study | `study` |
| dataset | `dataset` |
| report | `report` |
| speaker | `speaker` |
| news | `news` |
| blog | `blog` |
| social | `social` |
| other | `other` |

All eight option ids have distinct first value tokens in these responses, so no collision or renaming is needed. Evidence includes bytes and per-token top slots. These prompts explicitly request the ids as a neutral serialization test. Their high probabilities do not measure classification quality or calibration. Padding at -9999 must still contribute zero probability in T19.

## Cost, provenance and limits

Estimated successful-call spend: **$0.00019688**, below $0.25. This is usage times the live catalogue prices, not a billing receipt. There were 38 paid POST calls: eight dimension checks, ten single-text, ten batch20, and ten typed calls. The catalogue GET is also recorded. A first preflight returned 401 using the old local key; no inference ran before the working text-file key was loaded locally.

Evidence: spike/token-factory-probe.json. Requests contain neutral text only. Response identifiers and account details are omitted; embedding arrays are represented by index, actual length and SHA256. Full per-token logprobs and usage are retained for chat. Each call also wrote one local runs/usage.jsonl row. Reproduce with python spike/run-token-factory-probe.py using a local .env; this makes paid calls and enforces a conservative $0.25 reservation ceiling.

No spike claims, held-out claims, evaluated transcripts, question wording, prompts used by the product, rules or thresholds were accessed or modified for this probe.
