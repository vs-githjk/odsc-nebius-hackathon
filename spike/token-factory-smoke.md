# Token Factory smoke test — 2026-10-30

Refs #6, #3. These are capability smoke calls, not spike or head-to-head runs. No evaluation output was opened.

## Findings

- Token Factory key: authenticated; model catalogue HTTP 200 with 30 models. Tavily key: authenticated with GET /usage (HTTP 200); no search request made or account details saved.
- Qwen: plain chat works; strict JSON schema and logprobs work in the same call, with five top alternatives on every generated token.
- DeepSeek: plain chat returned `hello`.
- GLM: HTTP 200 but empty visible content and `finish_reason: length` at both 20 and 128 max_tokens. Endpoint access is proven; useful text generation is NOT yet proven. Stop further retries here rather than hiding the failure.
- BAAI/bge-en-icl is absent from the catalogue and returns HTTP 404 model_not_found. Qwen/Qwen3-Embedding-8B succeeds: three embeddings, each 4096 dimensions. Changing the model changes vector dimensions and similarity distributions; do not reuse existing clustering thresholds without dev validation.

## Measured calls

Base URL: `https://api.tokenfactory.nebius.com/v1`. Plain chat prompt: `Reply with exactly: hello`. Embedding input: three short, non-evaluation sentences. See the adjacent JSON for request bodies and sanitized response evidence.

| Call | Endpoint | Model | HTTP | Latency ms | Input tokens | Output tokens | Estimated USD |
|---|---|---|---:|---:|---:|---:|---:|
| Catalogue | GET /models?verbose=true | — | 200 | 6804 | — | — | 0 |
| bge-embeddings | POST /embeddings | BAAI/bge-en-icl | 404 | 2638 | — | — | unknown (no successful usage) |
| deepseek-chat | POST /chat/completions | deepseek-ai/DeepSeek-V4-Pro-0813 | 200 | 4534 | 9 | 13 | 0.00006336 |
| glm-chat-128 | POST /chat/completions | zai-org/GLM-5.2 | 200 | 4381 | 17 | 128 | 0.00058700 |
| glm-chat | POST /chat/completions | zai-org/GLM-5.2 | 200 | 4795 | 17 | 20 | 0.00011180 |
| qwen-chat | POST /chat/completions | Qwen/Qwen3-30B-A3B-Instruct-2507 | 200 | 4275 | 13 | 2 | 0.00000190 |
| qwen-embeddings | POST /embeddings | Qwen/Qwen3-Embedding-8B | 200 | 11191 | 24 | 0 | 0.00000024 |
| qwen-schema-logprobs | POST /chat/completions | Qwen/Qwen3-30B-A3B-Instruct-2507 | 200 | 3526 | 45 | 10 | 0.00000750 |

**Total estimated successful-call cost: $0.00077180**, below the $2 budget. This is an estimate from API-reported prompt/completion token counts multiplied by the dated catalogue prices, not a billing receipt. No usage was returned for the 404; its charge cannot be independently determined here. GLM reports reasoning-token counts higher than its completion counts; these are recorded verbatim rather than reconciled by guessing.

## Prices checked on 2026-10-30

Source: authenticated `GET https://api.tokenfactory.nebius.com/v1/models?verbose=true`; prompt/completion prices are USD per token.

| Model | Input USD / million | Output USD / million |
|---|---:|---:|
| Qwen/Qwen3-30B-A3B-Instruct-2507 | 0.1 | 0.3 |
| zai-org/GLM-5.2 | 1.4 | 4.4 |
| deepseek-ai/DeepSeek-V4-Pro-0813 | 1.32 | 3.96 |
| Qwen/Qwen3-Embedding-8B | 0.01 | 0 |

## Strict schema plus logprobs

Request: the exact hop_label schema and sentence pair from the #6 addition, with `temperature: 0`, `max_tokens: 20`, `logprobs: true`, `top_logprobs: 5`.

Schema match: **yes**. Returned content: `{"label": "new_wording"}`. Per-token logprobs with five alternatives: **yes**. No schema-only/logprobs-only retries were needed. The label occupies four tokens (`new`, `_`, `word`, `ing`); the first-token probability is not a calibrated whole-option probability. Unmatched probability mass must remain `other` in T19.

Label-value token evidence:

```json
[
  {
    "token": "new",
    "bytes": [
      110,
      101,
      119
    ],
    "logprob": -9.536738616588991e-07,
    "top_logprobs": [
      {
        "token": "new",
        "bytes": [
          110,
          101,
          119
        ],
        "logprob": -9.536738616588991e-07
      },
      {
        "token": "copy",
        "bytes": [
          99,
          111,
          112,
          121
        ],
        "logprob": -13.875000953674316
      },
      {
        "token": "c",
        "bytes": [
          99
        ],
        "logprob": -17.875
      },
      {
        "token": "n",
        "bytes": [
          110
        ],
        "logprob": -18.125
      },
      {
        "token": "cop",
        "bytes": [
          99,
          111,
          112
        ],
        "logprob": -18.75
      }
    ]
  },
  {
    "token": "_",
    "bytes": [
      95
    ],
    "logprob": -0.5376251935958862,
    "top_logprobs": [
      {
        "token": "_",
        "bytes": [
          95
        ],
        "logprob": -0.5376251935958862
      },
      {
        "token": "_w",
        "bytes": [
          95,
          119
        ],
        "logprob": -1.0376251935958862
      },
      {
        "token": "_word",
        "bytes": [
          95,
          119,
          111,
          114,
          100
        ],
        "logprob": -2.787625312805176
      },
      {
        "token": "_wo",
        "bytes": [
          95,
          119,
          111
        ],
        "logprob": -12.475125312805176
      },
      {
        "token": "!",
        "bytes": [
          33
        ],
        "logprob": -9999.0
      }
    ]
  },
  {
    "token": "word",
    "bytes": [
      119,
      111,
      114,
      100
    ],
    "logprob": -0.07531972229480743,
    "top_logprobs": [
      {
        "token": "word",
        "bytes": [
          119,
          111,
          114,
          100
        ],
        "logprob": -0.07531972229480743
      },
      {
        "token": "wo",
        "bytes": [
          119,
          111
        ],
        "logprob": -2.887819766998291
      },
      {
        "token": "w",
        "bytes": [
          119
        ],
        "logprob": -4.262819766998291
      },
      {
        "token": "wor",
        "bytes": [
          119,
          111,
          114
        ],
        "logprob": -5.887819766998291
      },
      {
        "token": "!",
        "bytes": [
          33
        ],
        "logprob": -9999.0
      }
    ]
  },
  {
    "token": "ing",
    "bytes": [
      105,
      110,
      103
    ],
    "logprob": 0.0,
    "top_logprobs": [
      {
        "token": "ing",
        "bytes": [
          105,
          110,
          103
        ],
        "logprob": 0.0
      },
      {
        "token": "in",
        "bytes": [
          105,
          110
        ],
        "logprob": -19.125
      },
      {
        "token": "i",
        "bytes": [
          105
        ],
        "logprob": -23.625
      },
      {
        "token": "\"",
        "bytes": [
          34
        ],
        "logprob": -9999.0
      },
      {
        "token": "!",
        "bytes": [
          33
        ],
        "logprob": -9999.0
      }
    ]
  }
]
```

## November 9 removals

Source: https://docs.tokenfactory.nebius.com/model-deprecations-november-2026.md (read 2026-10-30). All 11 listed retiring IDs are present in the current catalogue. All replacement IDs below are also present. Dedicated endpoints are outside this smoke test.

| Retiring serverless ID on Nov 9 | Documented replacement |
|---|---|
| zai-org/GLM-5.1 | zai-org/GLM-5.2 |
| nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B | nvidia/Nemotron-3_5-Lightning |
| nvidia/nemotron-3-super-120b-a12b | nvidia/Nemotron-3.5-Super-VL |
| deepseek-ai/DeepSeek-V4-Pro | deepseek-ai/DeepSeek-V4-Pro-0813 |
| deepseek-ai/DeepSeek-V4-Flash-0731 | deepseek-ai/DeepSeek-V4.1-Flash-1017 |
| deepseek-ai/DeepSeek-V4.1-Flash | deepseek-ai/DeepSeek-V4.1-Flash-1017 |
| Qwen/Qwen3.5-397B-A17B | Qwen/Qwen3.8-27B |
| Qwen/Qwen3-235B-A22B-Instruct-2507 | Qwen/Qwen3-30B-A3B-Instruct-2507 |
| moonshotai/Kimi-K2.6 | moonshotai/Kimi-K3 |
| moonshotai/Kimi-K2.7-Code | moonshotai/Kimi-K3 |
| openbmb/MiniCPM-V-4_5 | nvidia/Nemotron-3.5-Super-VL |

None of the three planned chat IDs is on that removal list. BAAI/bge-en-icl is already unavailable, independently of the Nov 9 announcement.

Recommended pinned IDs from this smoke:

- Main chat/structured labels: `Qwen/Qwen3-30B-A3B-Instruct-2507`.
- Optional second opinion: `deepseek-ai/DeepSeek-V4-Pro-0813`. Keep GLM unverified for useful text until a bounded follow-up resolves its reasoning/token budget.
- Embeddings: propose `Qwen/Qwen3-Embedding-8B` to the coordinator; schema/threshold owners must account for its 4096-dimensional vectors. Do not silently change rules.

## Validation and limits

- Python JSON checks: all seven response records parse; schema enum matches; ten generated tokens each have five alternatives; three embedding rows have 4096 dimensions.
- Secrets scan: neither supplied key occurs in any deliverable; no account or billing details included.
- Targets were frozen before smoke calls; hash verification repeated without opening evaluated runs.
- This is a one-run smoke test, not a latency benchmark, confidence calibration, or a claim of production reliability.
- Registration, Builder Program membership, and billing auto-charge settings are not confirmed by API authentication.
- T18 (#26) still depends on #6 being merged and T2 (#12). T19 (#27) follows T18. T20 (#28) waits for completed runs and anonymised forms.
