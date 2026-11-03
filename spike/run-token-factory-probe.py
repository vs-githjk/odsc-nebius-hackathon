"""T18b only: neutral calls, no claims, capped estimated spend, sanitized evidence."""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import math
import re
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
ENV = dict(line.split("=", 1) for line in (ROOT / ".env").read_text().splitlines() if "=" in line and not line.startswith("#"))
KEY = ENV["NEBIUS_API_KEY"].strip()
BASE = "https://api.tokenfactory.nebius.com/v1"
MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507"
EMBED = "Qwen/Qwen3-Embedding-8B"
OUT = ROOT / "spike/token-factory-probe.json"
report = {"recorded_at": datetime.now(timezone.utc).isoformat(), "budget_usd": 0.25,
          "method": "sequential calls, no warmup exclusion or automatic retries; nearest-rank p50/p90; vectors summarized, never used for grading", "calls": []}
prices = {}
spent = 0.0

def save():
    report["estimated_spend_usd"] = spent
    text = json.dumps(report, indent=2) + "\n"
    if any(value and len(value) > 12 and value in text for value in ENV.values()):
        raise RuntimeError("Credential detected; evidence not saved")
    OUT.write_text(text)

def call(name, endpoint, body=None):
    global spent
    model = body.get("model") if body else None
    price = prices.get(model, {})
    # UTF-8 byte count conservatively bounds tokens for these ASCII requests.
    reserve = ((len(json.dumps(body).encode()) + 1000) * float(price.get("prompt", 0))
               + (body.get("max_tokens", 0) if body else 0) * float(price.get("completion", 0))
               + float(price.get("request", 0)))
    if spent + reserve >= 0.25:
        raise RuntimeError("Probe budget reached")
    at = datetime.now(timezone.utc).isoformat()
    start = time.perf_counter()
    req = urllib.request.Request(BASE + endpoint, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            status, data = response.status, json.load(response)
    except urllib.error.HTTPError as error:
        status, data = error.code, {"error": {"type": "http_error"}}
    except Exception as error:
        status, data = None, {"error": {"type": type(error).__name__}}
    latency = round((time.perf_counter() - start) * 1000)
    usage = data.get("usage") or {}
    cost = (usage.get("prompt_tokens", usage.get("total_tokens", 0)) * float(price.get("prompt", 0))
            + usage.get("completion_tokens", 0) * float(price.get("completion", 0))
            + float(price.get("request", 0))) if usage else None
    # Charge a conservative reservation for any failed/unreported paid call.
    spent += cost if cost is not None else reserve
    safe = {k: data[k] for k in ("choices", "usage", "model", "error", "object", "results") if k in data}
    if endpoint == "/embeddings":
        safe["vectors"] = [{"index": d.get("index"), "dimensions": len(d.get("embedding", [])),
                            "sha256": hashlib.sha256(json.dumps(d.get("embedding", [])).encode()).hexdigest()} for d in data.get("data", [])]
    record = {"name": name, "endpoint": endpoint, "at": at, "request": body, "status": status,
              "latency_ms": latency, "usage": usage, "cost_usd": cost, "reserved_if_unreported_usd": reserve if cost is None else 0,
              "response": safe}
    report["calls"].append(record)
    row = {"at": at, "traceId": None, "step": "T18b:" + name, "service": "tokenfactory", "endpoint": endpoint,
           "model": model, "promptTokens": usage.get("prompt_tokens", usage.get("total_tokens", 0)),
           "completionTokens": usage.get("completion_tokens", 0), "cachedTokens": (usage.get("prompt_tokens_details") or {}).get("cached_tokens", 0),
           "credits": 0, "costUsd": cost or 0, "latencyMs": latency, "status": str(status), "cacheHit": False}
    (ROOT / "runs").mkdir(exist_ok=True)
    with (ROOT / "runs/usage.jsonl").open("a") as f:
        f.write(json.dumps(row) + "\n")
    save()
    print(json.dumps({"name": name, "status": status, "latency_ms": latency, "estimated_spend_usd": spent}), flush=True)
    return record, data

catalogue, data = call("catalogue", "/models?verbose=true")
if catalogue["status"] != 200:
    raise SystemExit("Catalogue unavailable; no inference attempted")
prices = {m["id"]: m.get("pricing", {}) for m in data["data"]}
report["catalogue"] = [{"id": m["id"], "modality": m.get("architecture", {}).get("modality"), "pricing": m.get("pricing", {})} for m in data["data"] if any(s in (m["id"] + " " + str(m.get("architecture", {}))).lower() for s in ["embed", "rerank"])]
for size in [64, 128, 256, 512, 1024, 2048, 4096, 4097]:
    call("dimensions-" + str(size), "/embeddings", {"model": EMBED, "input": ["A neutral blue rectangle."], "dimensions": size})
for group, count in [("single", 1), ("batch20", 20)]:
    for i in range(10):
        call(f"{group}-{i+1}", "/embeddings", {"model": EMBED, "input": [f"Neutral sample {j}: a blue rectangle beside a green circle." for j in range(count)]})

schema = json.loads((ROOT / "schema/questions.schema.json").read_text())
ids = ["study", "dataset", "report", "speaker", "news", "blog", "social", "other"]
report["first_tokens"] = {}
for i in range(10):
    target = ids[i % len(ids)]
    body = {"model": MODEL, "messages": [{"role": "user", "content": f"Neutral serialization test only. Return scope_widened=yes, attribution_shifted=no, context_stripped=no, page_type={target}. This is not a claim classification."}],
            "temperature": 0, "max_tokens": 128, "logprobs": True, "top_logprobs": 5,
            "response_format": {"type": "json_schema", "json_schema": {"name": "neutral_probe", "strict": True, "schema": schema}}}
    record, data = call(f"typed-{i+1}", "/chat/completions", body)
    if i == 0:
        report["top_level_schema_accepted"] = record["status"] == 200
        if record["status"] == 400:
            schema.pop("$schema", None)
            body["response_format"]["json_schema"]["schema"] = schema
            record, data = call("typed-1-without-schema-key", "/chat/completions", body)
    choices = data.get("choices") or []
    if not choices:
        continue
    choice = choices[0]
    text = choice.get("message", {}).get("content", "")
    match = re.search(r'"page_type"\s*:\s*"([^"\\]+)"', text)
    position = 0
    if match:
        for token in (choice.get("logprobs") or {}).get("content", []):
            end = position + len(token["token"])
            if position <= match.start(1) < end:
                report["first_tokens"][match.group(1)] = {"token": token["token"], "bytes": token.get("bytes"), "logprob": token["logprob"]}
                break
            position = end
rerank = [m for m in report["catalogue"] if "rerank" in m["id"].lower() or "rerank" in str(m["modality"]).lower()]
report["rerank"] = "not listed; no call"
if rerank:
    report["rerank"] = call("rerank", "/rerank", {"model": rerank[0]["id"], "query": "blue rectangle", "documents": ["A blue rectangle.", "A green circle."], "top_n": 1})[0]["status"]
report["latency_summary"] = {}
for group in ["single", "batch20", "typed"]:
    calls = [c for c in report["calls"] if c["name"].startswith(group + "-") and c["status"] == 200]
    values = sorted(c["latency_ms"] for c in calls)
    if values:
        report["latency_summary"][group] = {"n": len(values), "p50_ms": values[math.ceil(len(values) * .5)-1], "p90_ms": values[math.ceil(len(values) * .9)-1]}
groups = {}
for option, first in report["first_tokens"].items():
    groups.setdefault(first["token"], []).append(option)
report["first_token_collisions"] = [options for options in groups.values() if len(options) > 1]
save()
print("Probe complete", flush=True)
