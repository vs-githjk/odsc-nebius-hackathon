# Research (H3): ODSC x Nebius research-agent challenge

Master Finder, 2026-10-28 23:22 PDT. Read with `plan/submission.md` (rules), `plan/registration.md` (accounts) and `plan/intel.md` (sponsors, rubric, winners).

## Plain answer first
- **The stack is two products from one company.** Nebius signed to acquire Tavily on Feb 10, 2026, and now sells it as "Tavily by Nebius". Nebius's own release frames it as Token Factory for reasoning plus Tavily for "real-time web access required for factual accuracy". Our project is literally their pitch. (VERIFIED, nebius.com newsroom, 2026-02-10; nebius.com/solutions/agentic-search)
- **Token Factory is an OpenAI-compatible API** at `https://api.tokenfactory.nebius.com/v1/`, with chat completions, the Responses API, tool calling, JSON-schema output, logprobs, embeddings, **rerank**, batch inference, fine-tuning, and a beta code **Sandbox**. (VERIFIED, OpenAPI spec version 20261022)
- **Tavily has search, extract, crawl, map and research endpoints**, plus a keyless free mode, an MCP server, and a `/feedback` endpoint that accepts the exact snippets you quoted. (VERIFIED, Tavily OpenAPI and docs)
- **Watch out: Nov 9, 2026 Token Factory removes 11 serverless models mid-hackathon** (incl. Kimi-K2.6, DeepSeek-V4-Pro, Qwen3.5-397B, GLM-5.1). Pin a model that is not on that list. (VERIFIED)
- **The generic baseline already exists as Nebius's own cookbook** (Deep Agents + Tavily + MiniMax-M3: decompose, search, 20,000-character report, about $0.07 a run). Building that again scores low on "Sourced and verifiable" and "Agent design". (VERIFIED, dev.nebius.com cookbook, updated Oct 15, 2026)
- **Pain is loud and dated:** 2,231 court cases with AI-hallucinated content (Charlotin database, updated Oct 28, 2026); a Lancet audit found fabricated references grew 12-fold in biomedicine since 2023; CJR found AI search tools wrong on more than 60% of news-citation queries. Users keep saying the same thing: "the sources don't say what the AI says".

---

## 1. Nebius Token Factory (formerly Nebius AI Studio)
`docs.studio.nebius.com/llms.txt` redirects to `docs.tokenfactory.nebius.com/llms.txt` (curl 23:02 PDT), so AI Studio was renamed Token Factory. The console JS bundle is still served from `static.nebius.com/app/ai-studio-ui/`.

| Capability | Detail | Maturity | State and source |
|---|---|---|---|
| API shape | OpenAI-compatible; use the `openai` SDK with `base_url="https://api.tokenfactory.nebius.com/v1/"`, key in `NEBIUS_API_KEY`, `Authorization: Bearer` | proven | VERIFIED docs quickstart.md, switch.md; `GET /v1/models` without a key returns 401 "token is not present" (curl 23:02) |
| Endpoints | `/v1/chat/completions`, `/v1/completions`, `/v1/responses`, `/v1/embeddings`, `/v1/rerank`, `/v1/models`, `/v1/files`, `/v1/fine_tuning/jobs`, `/v1/datasets`, `/v1/operations` (incl. `batch_inference`) | proven (chat), emerging (responses, rerank, batch via operations) | VERIFIED https://api.tokenfactory.nebius.com/openapi.json (public, 282 KB) |
| Chat params | `tools`, `tool_choice` (auto or a named function), `response_format`, `reasoning_effort`, `logprobs`, `top_logprobs`, `stream`, `service_tier`, `extra_body` (vLLM params) | proven | VERIFIED OpenAPI `ChatCompletionRequest` |
| Tool calling | OpenAI function-calling format; you execute the functions; supports MCP-style agents | proven | VERIFIED function-calling.md |
| Structured output | `response_format` `json_schema` (strict) or `json_object`; support varies by model: filter the catalog by the "JSON mode" tag; docs advise putting the schema in the prompt too | proven, model-dependent | VERIFIED json.md |
| Responses API | `/v1/responses` with `tools`, `previous_response_id`, `reasoning`, `max_tool_calls`, MCP tool items in schema | emerging | VERIFIED OpenAPI `CreateResponseRequest` |
| Embeddings | `/v1/embeddings` with `dimensions`; doc example model `BAAI/bge-en-icl` | proven | VERIFIED create-embeddings example |
| Rerank | `/v1/rerank` with `query`, `documents`, `model` | emerging | VERIFIED OpenAPI `RerankRequest` |
| Prompt caching | Automatic prefix caching, cached input billed lower; `usage.prompt_tokens_details.cached_tokens` reported | proven | VERIFIED cached-tokens.md |
| Model flavors | Base vs Fast (append `-fast`): same outputs, lower latency, higher price | proven | VERIFIED ai-models-inference/overview.md |
| Batch | Batch inference via `/v1/operations` type `batch_inference`; "significantly higher limits" | emerging | VERIFIED OpenAPI; rate-limits.md tip |
| Rate limits | Dynamic: example baseline 60 RPM, 400,000 TPM; +20% per 15-min window at 80% use, up to 20x; 429 with `Retry-After`; headers `x-ratelimit-remaining-requests/tokens` | proven | VERIFIED rate-limits.md |
| Sandboxes | Isolated code execution for agents (Python SDK, CLI, REST, MCP); **Beta, request access** | experimental | VERIFIED sandboxes/overview.md |
| Fine-tuning, Data Lab | SFT (full or LoRA), custom speculators; Data Lab stores inference logs, SQL datasets; reinforcement fine-tuning by request only | emerging | VERIFIED post-training/overview.md, data-lab/overview.md |
| Integrations | LangChain, LlamaIndex, LiteLLM, CrewAI, Agno, Google ADK, Pydantic AI, Strands, Camel; "Agentic Search: Tavily" page with a Tavily-as-tool quickstart | proven | VERIFIED integrations/overview.md, integrations/search/tavily.md |
| Public serverless region | "Global", can move without notice; not for region-pinned production | n/a | VERIFIED public-serverless.md |
| Free credit | **$1 trial credit, 30 days; bank card required** at onboarding | VERIFIED | billing-new.md |
| Builder Program | Free; $25 Token Factory + $25 Tavily + $100 LangSmith credit | VERIFIED | dev.nebius.com/builders |

### Models (named in Nebius docs or blog; live availability UNRESOLVED until `GET /v1/models?verbose=true` with a key)
The catalog and price pages (tokenfactory.nebius.com/models/catalog, /organization/prices) are behind the console SPA; Bright Data was refused by robots.txt for the catalog. So this list is what Nebius's own pages name, not the full catalog.

| Model ID | Where named | Note |
|---|---|---|
| `MiniMaxAI/MiniMax-M3` | Deep research cookbook default (Oct 15, 2026); service page "128B ... 1M-token context" | safe pick for long evidence context |
| `moonshotai/Kimi-K3` | Nov deprecation page (replacement); service page | coding-agent focus |
| `deepseek-ai/DeepSeek-V4-Pro-0813` | Nov deprecation page (replacement) | V4-Pro (no date) is removed Nov 9 |
| `deepseek-ai/DeepSeek-V4.1-Flash-1017` | Nov deprecation page (replacement, image2text) | |
| `Qwen/Qwen3.8-27B`, `Qwen/Qwen3-30B-A3B-Instruct-2507` | Nov deprecation page (replacements) | small, cheap verifier candidates |
| `zai-org/GLM-5.2` | Nov deprecation page (replacement) | |
| `nvidia/Nemotron-3.5-Super-VL`, `nvidia/Nemotron-3_5-Lightning` | Nov deprecation page; blog Oct 16 | VL "positioned for ... web research, document understanding" |
| `reflection/beam` | blog Oct 16: 501B MoE, 23B active, up to 1M context, reasoning-effort setting, **$0.25 in / $1.00 out per M tokens** | coding and reasoning |
| Muse Spark Open (Meta) | blog Oct 16: 816B MoE, 42B active, text+image+video input, **$1.25 in / $4.25 out per M** | tool use |
| `BAAI/bge-en-icl` | embeddings example | embeddings |
| `moonshotai/Kimi-K2.5`, `deepseek-ai/DeepSeek-R1-0528`, `meta-llama/Meta-Llama-3.1-8B-Instruct-fast`, `Qwen/Qwen3-235B-A22B` | older doc examples | may be gone; verify before use |

**Removed from serverless on Nov 9, 2026** (do not build on these): `zai-org/GLM-5.1`, `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, `nvidia/nemotron-3-super-120b-a12b`, `deepseek-ai/DeepSeek-V4-Pro`, `deepseek-ai/DeepSeek-V4-Flash-0731`, `deepseek-ai/DeepSeek-V4.1-Flash`, `Qwen/Qwen3.5-397B-A17B`, `Qwen/Qwen3-235B-A22B-Instruct-2507`, `moonshotai/Kimi-K2.6`, `moonshotai/Kimi-K2.7-Code`, `openbmb/MiniCPM-V-4_5`. No auto-rerouting. (VERIFIED https://docs.tokenfactory.nebius.com/model-deprecations-november-2026.md)

gpt-oss and Llama 4: the cookbook "Model cards" mentions GPT-OSS; no current gpt-oss model ID was seen on a 2026 page. NOT FOUND (searched docs llms.txt and the pages above); check `/v1/models`.

## 2. Tavily (Tavily by Nebius)
Base URL `https://api.tavily.com/`, Bearer key `tvly-...`. SDKs: `tavily-python` (`TavilyClient`, async client), JavaScript SDK, `@tavily/ai-sdk` for Vercel AI SDK v5, LangChain `langchain-tavily`, Tavily CLI and Agent Skills. (VERIFIED docs llms.txt index, changelog)

| Endpoint | Key params | Cost | Maturity | Source |
|---|---|---|---|---|
| `POST /search` | `search_depth` basic / advanced / fast / ultra-fast; `chunks_per_source` (default 3); `max_results` (10); `topic` general / news / finance; `time_range`, `start_date`, `end_date`; `include_published_date`, `filter_by_published_date`; **`max_age_hours`** (0 = fetch live, Oct 2026); `include_answer`; **`include_raw_content`**; `include_domains` with `include_domains_mode` restrict / prefer; `exclude_domains`; `country`; `exact_match`; `language`, `filter_by_language`; `safe_search`; `include_usage` | basic, fast, ultra-fast 1 credit; advanced 2 | proven (fast and ultra-fast beta) | VERIFIED Tavily OpenAPI v1.0.0; changelog |
| `POST /extract` | `urls` (up to 20), **`query`** (reranks chunks to intent), `chunks_per_source` 1 to 5, `extract_depth` basic / advanced, `format` markdown / text | 1 credit per 5 URLs (basic), 2 per 5 (advanced); failures free | proven | VERIFIED |
| `POST /crawl` | `url`, `instructions`, `max_depth`, `max_breadth`, `limit`, path and domain filters | map cost + extract cost | proven | VERIFIED |
| `POST /map` | site structure; `instructions` | 1 credit per 10 pages (2 with instructions) | proven | VERIFIED |
| `POST /research` | `input`, `model` mini / pro / auto, `stream` (SSE), `output_schema`, **`citation_format`** numbered / mla / apa / chicago, `include_domains` (soft), `exclude_domains` (hard), `output_length`, `files` (up to 5, 80k words) | mini 4 to 110 credits, pro 15 to 250 | emerging | VERIFIED; 20 RPM limit |
| `POST /feedback` | `request_id`, `session_id`, `agent_score`, `human_score`, `used_urls`, **`used_citations`** ("The specific content snippets you quoted from the results"), `urls_scores` | not stated | emerging | VERIFIED OpenAPI |
| `GET /usage`, `POST /logs` | credit usage; logs (paid) | | proven | VERIFIED |
| Keyless | `X-Tavily-Access-Mode: keyless` on `/search` and `/extract`; free, rate-limited; same schema | free | emerging | VERIFIED keyless.md |
| MCP | Remote `https://mcp.tavily.com/mcp/`: tools `tavily_search`, `tavily_extract`, `tavily_crawl`, `tavily_map`, `tavily_research` | | proven | VERIFIED mcp.md; repo tavily-ai/tavily-mcp 2,462 stars |
| x402 | Agents pay per advanced search in USDC on Base, no key | | experimental | VERIFIED machine-payments/x402.md |
| Session headers | `X-Session-Id`, `X-Human-Id`, `X-Project-ID` for attribution | | proven | VERIFIED changelog May 2026, Jan 2026 |

Free tier: 1,000 credits a month, no card, Development key at 100 RPM. Hackathon-specific Tavily credits: NOT FOUND (searched event bundle, odsc.ai page, web). Builder Program gives $25 Tavily credit (about 3,100 PAYGO credits at $0.008).

## 3. What the generic entry will look like (avoid it)
The baseline every team can ship in an afternoon, because Nebius publishes it:
- Nebius cookbook "Building a Deep Research Agent powered by Tavily and Token Factory" (AbdulMajed Raja, DevRel, updated Oct 15, 2026): `deepagents` + `langchain-nebius` + `langchain-tavily`, `search_depth="advanced"`, `max_results=5`, model `MiniMaxAI/MiniMax-M3`; "6 model requests, about $0.07, a 20,000-character report in under 90 seconds". It even ships a copy-paste prompt for Claude Code or Cursor. (VERIFIED https://dev.nebius.com/cookbook/deep-research-agent-tavily)
- Token Factory doc pattern: Tavily as a function-calling tool on `Kimi-K2.5`. (VERIFIED integrations/search/tavily.md)
- Cookbook repo folders: `crewai-research-agent`, `universal-deep-research-nebius`. (VERIFIED gh api nebius/token-factory-cookbook/contents/agents)
Result of the baseline: a long report with numbered links. The rubric says citations must let "a reader verify the important claims, not just a list of related links", and "Complexity alone is not a benefit". So the baseline is exactly what the rubric marks down.

### Open-source prior art (stars via `gh api`, 2026-10-28 23:11 PDT)
| Repo | Stars | Last push | License | What it does |
|---|---|---|---|---|
| bytedance/deer-flow | 84,614 | 2026-10-29 | MIT | long-horizon research and coding super-agent with sandboxes |
| ItzCrazyKns/Vane (formerly Perplexica) | 37,824 | 2026-09-01 | MIT | open answer engine |
| stanford-oval/storm | 31,738 | 2025-09-30 | MIT | Wikipedia-style cited reports |
| langchain-ai/deepagents | 30,707 | 2026-10-29 | MIT | agent harness behind the Nebius cookbook |
| assafelovic/gpt-researcher | 30,343 | 2026-10-10 | Apache-2.0 | planner and executor research reports (Tavily default) |
| huggingface/smolagents | 30,131 | 2026-10-22 | Apache-2.0 | code agents |
| dzhng/deep-research | 19,849 | 2026-04-11 | MIT | iterative deep research |
| langchain-ai/open_deep_research | 12,676 | 2026-08-10 | MIT | LangGraph deep research |
| zaidmukaddam/scira | 11,910 | 2026-08-12 | AGPL-3.0 (share-alike) | Perplexity-style search |
| miurla/morphic | 9,210 | 2026-10-28 | Apache-2.0 | generative-UI answer engine |
| jina-ai/node-DeepResearch | 5,241 | 2026-05-01 | Apache-2.0 | search, read, reason loop |
| SalesforceAIResearch/enterprise-deep-research | 1,223 | 2026-10-26 | Apache-2.0 | enterprise deep research |
| **Socialpranker/deepdive** | 369 | 2026-10-25 | MIT | 12-phase pipeline with a **claims ledger, triangulation, dissent protection** |
| **lajosdeme/mole** | 317 | 2026-10-28 | Apache-2.0 | **every claim carries a verbatim quote checked against the page; contradiction detection; enforced USD budget**; Show HN 100 points (2026-08-14) |
| JiahongXu88/PaperTeam | 95 | | | evidence-grounded paper agents, citation verification |
Takeaway: verbatim-quote checking and contradiction detection exist in small repos (mole, deepdive) but not in the big ones or in the Nebius cookbook. They are table stakes for a top entry, not the whole differentiator. Differentiation has to come from the user, the domain, and how fast a reader can verify.

## 4. Pain signals (quoted, linked, dated)
Tier noted: P = primary, S = reputable secondary, C = community.
| # | Who | Signal | Date | Link | Tier |
|---|---|---|---|---|---|
| 1 | Lawyers | Database of legal decisions involving AI-hallucinated content: "2231 cases identified so far"; "Last updated: 28 October 2026" | 2026-10-28 | https://www.damiencharlotin.com/hallucinations/ | P |
| 2 | Lawyers | "I use AI extensively in my legal work. But I check every citation myself, manually ... I read the entirety of every case that I plan to cite ... and I check on Westlaw that it hasn't been overridden" (jbstack) | 2026-04-30 | https://news.ycombinator.com/item?id=47963302 | C |
| 3 | Lawyers | "The lawyers I know are very fixated on the problem of hallucinated case citations" (jordanpg, thread on OpenAI "Astra for Law") | 2026-09-17 | https://news.ycombinator.com/item?id=49748390 | C |
| 4 | Law firms | "Law firms are cautious about AI tools, they got burned ... by hallucinated citations ... in one case received a 30-day license suspension" (Legend2440) | 2026-10-19 | https://news.ycombinator.com/item?id=50158310 | C |
| 5 | Clinicians, biomedical researchers | Lancet audit of 2.47M PubMed Central papers: 4,046 fabricated references in 2,810 papers; rate up more than 12-fold since 2023 (1 in 277 papers in early 2026); 98.4% not retracted. Author: "The fix is not to stop using the tools, it's to build verification into the workflow." | 2026-05-24 | https://fortune.com/2026/05/24/ai-hallucinations-scientific-research-authors-medical-journal-treatment/ (study: thelancet.com PIIS0140-6736(26)00603-3) | S (P linked, not opened) |
| 6 | Journalists, news readers | CJR Tow Center: eight AI search tools "provided incorrect answers to more than 60 percent of queries"; "Generative search tools fabricated links" | 2025-03-06 | https://www.cjr.org/tow_center/we-compared-eight-ai-search-engines-theyre-all-bad-at-citing-news.php | P |
| 7 | Authors, journalists | NYT found invented or misattributed quotes in "The Future of Truth" (Steven Rosenbaum), reported by Fortune | 2026-05-19 / 05-24 | Fortune link above (cites nytimes.com/2026/05/19/business/media/future-of-truth-ai-quotes.html) | S |
| 8 | Academics (ML) | NeurIPS desk-rejecting papers over references that don't exist; "ACL desk-rejected 100+ papers and then reversed the policy" (Tughan) | 2026-09-05 | https://news.ycombinator.com/item?id=49580194 | C |
| 9 | Academics | "Sometimes a real paper is attached to a claim it does not support ... it is not sufficient to check whether the meta-data (bibliography) is correct" (jruohonen) | 2026-08-16 | https://news.ycombinator.com/item?id=49318291 | C |
| 10 | Academics, publishers | Grounded AI with Nature: "estimating hundreds of thousands of papers affected in 2025 with hallucinated citation issues" (cyclecycle, vendor) | 2026-04-04 | https://news.ycombinator.com/item?id=47637364 | C (vendor) |
| 11 | Peer reviewers | "Far more prevalent are authors who mis-cite materials, either drawing support from citations that don't actually say those things" (ulrashida) | 2025-12-07 | https://news.ycombinator.com/item?id=46182750 | C |
| 12 | Consumers | "It very, very routinely points at articles in its RAG 'citations' that simply don't support the ... assertions" (dofm) | 2026-10-12 | https://news.ycombinator.com/item?id=50053923 | C |
| 13 | Consumers, researchers | "When I ask an LLM, I trace the sources ... More often than not the sources don't actually say anything about the topic" (dirkt) | 2026-06-29 | https://news.ycombinator.com/item?id=48715075 | C |
| 14 | Consumers | "Now I not only have to check if the cited source actually says what the LLM claims, I should also verify if it made up the source itself." (ano-ther) | 2026-09-17 | https://news.ycombinator.com/item?id=49738184 | C |
| 15 | Consumers (Perplexity users) | "does Perplexity often get references incorrect? I click through, and find nothing on the linked page to support the assertion" (u/TomHale, r/perplexity_ai) | 2024-06-16 | https://www.reddit.com/r/perplexity_ai/comments/1dh3es0/references_incorrect/ | C |
| 16 | Consumers (Google AI Overviews) | "The sources don't always say what Google AI thinks it says. Or, Google will mix up two sources" (nneonneo) | 2025-07-24 | https://news.ycombinator.com/item?id=44666519 | C |
| 17 | Business research (vendor check) | Gemini deep research on a solar vendor; Claude called the report "a bunch of 'hallucinated bullshit'" (josefresco) | 2026-09-17 | https://news.ycombinator.com/item?id=49741488 | C |
| 18 | Analysts | "the deep research are not reliable at all ... the supporting concept just plain hallucinate" (bengkoang) | 2026-09-16 | https://news.ycombinator.com/item?id=49721097 | C |
| 19 | Developers, builders | "folks should be really be spending a lot of time on figuring out how to deterministically check AI outputs ... and to build tools that speed up the checking process" (idopmstuff) | 2026-06-06 | https://news.ycombinator.com/item?id=48427085 | C |
| 20 | Journalism readers | After an Ars Technica AI incident, "I now assume journalists are using AI and things need to be fact-checked" (mymacbook) | 2026-02-28 | https://news.ycombinator.com/item?id=47197736 | C |
| 21 | Consultancy clients, government | Deloitte Canada healthcare workforce report (C$1.6M) with at least four fabricated academic citations | 2026-04-16 | https://vibegraveyard.ai/story/deloitte-canada-ai-healthcare-report-hallucinations/ | REPORTED (tier 4 only; primary not fetched) |
Coverage gaps: procurement, grant writers, policy staff and fact-checkers have no direct quote here (NOT FOUND in this pass: HN queries "journalist AI fact check", "student fake references AI" returned off-topic hits; Reddit search via Bright Data returned mostly non-Reddit pages and Reddit served a bot wall on one thread). A human Reddit or X pass would close it.

Pattern across signals: the failure users name is **claim-to-source mismatch** ("the link doesn't say that"), more than fabricated URLs. Professionals (lawyers, clinicians, reviewers) already verify by hand, so the job to be done is **making verification fast**, not replacing it.

### Rising repos in the space (signals.py, GitHub, 2026-10-28)
- appletea233/OneSearch-VL: 166 stars, 8/day, created 2026-10-08, multimodal deep research agent with open models.
- lajosdeme/mole: 317 stars, created 2026-08-01, verified quotes plus contradictions plus budget.
- Socialpranker/deepdive: 369 stars, created 2026-05-21, claims-ledger triangulation.
- 1612535983/deepresearchagent: 52 stars, created 2026-09-22, recoverable and auditable LangGraph research.
- No research-agent repo appears in the top 15 cross-domain risers of the last 30 days.

## 5. Smoke calls to run once Vidyut says OK (none run yet)
Record status, latency and rate-limit headers; never print keys.
1. Tavily keyless, free, no account: `curl -s -o /dev/null -D - -w 'status=%{http_code} time=%{time_total}s\n' -X POST https://api.tavily.com/search -H 'Content-Type: application/json' -H 'X-Tavily-Access-Mode: keyless' -d '{"query":"Nebius Tavily acquisition date","max_results":3,"include_raw_content":true}'`
2. Token Factory model list (free): `GET https://api.tokenfactory.nebius.com/v1/models?verbose=true` with `Authorization: Bearer $NEBIUS_API_KEY`; save the IDs, JSON-mode and tool tags, context lengths and prices to `data/raw/tokenfactory/models.json`.
3. Token Factory chat with one tool and `response_format` json_schema on the chosen model and one Nov-9-safe fallback (under $0.01).
4. Token Factory `/v1/embeddings` and `/v1/rerank` with 3 short documents (under $0.01).
5. Tavily keyed: `/search` advanced with `include_raw_content` and `include_published_date` (2 credits); `/extract` with `query` on 2 URLs (1 credit); optional `/research` model=mini once (4 to 110 credits) only if the plan uses it.
Until these pass, both APIs are "REPORTED, untested" for our accounts (docs VERIFIED).

## 6. What this means for the planner
- Pin models off the Nov 9 list; prefer one strong long-context model plus one small cheap model for claim checking (Qwen3.8-27B or Qwen3-30B-A3B class). Confirm via smoke call 2.
- Use Tavily features the baseline ignores and that map to rubric lines: `extract` with `query` for quote spans, `include_published_date` plus `max_age_hours=0` for freshness, `include_domains_mode="prefer"` for trusted sources, `exact_match` for names and quotes, `/feedback` with `used_citations` to report what was actually quoted.
- Use Token Factory features the baseline ignores: `/v1/rerank` to pick evidence, `json_schema` for a claim ledger, `logprobs` for a confidence signal, cached prefixes to cut cost. Sandboxes (beta, needs access) could recompute numeric claims: experimental, only if access arrives early.
- Budget: Tavily 4,000 free credits a month across 4 people plus $25 each from the Builder Program; Token Factory has only $1 trial each, so plan on the Builder Program $25 or a promo code. Recommendation depends on UNRESOLVED event credits.
- Not checked: full model catalog and prices (console login), Tavily /feedback pricing, Sandboxes access lead time, any event-specific credit code.

---
CHECKED_AT: Wed Oct 28 23:22 PDT 2026
SUBJECT: docs.tokenfactory.nebius.com (llms.txt + 20 pages), api.tokenfactory.nebius.com/openapi.json (v20261022-1d60f32ca), docs.tavily.com (llms.txt + 15 pages + OpenAPI v1.0.0), nebius.com blog/newsroom/solutions, dev.nebius.com, GitHub API, HN Algolia, Bright Data search and scrape
CHECKED: all URLs above at 23:01 to 23:15 PDT, HTTP 200 unless noted
NOT CHECKED: authenticated endpoints (no keys; none called); model catalog and price pages (login SPA, robots-blocked for Bright Data); the Lancet paper itself; Reddit threads beyond one (bot wall)
UNRESOLVED: live model list and per-model prices; event credits; Tavily feedback cost; whether gpt-oss is served today
