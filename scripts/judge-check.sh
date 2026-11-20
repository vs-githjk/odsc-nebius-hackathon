#!/usr/bin/env bash
# Fresh-checkout, keyless path used by judges and CI. Run with bash; no executable bit required.
set -euo pipefail
repo=${1:-https://github.com/vs-githjk/odsc-nebius-hackathon.git}
ref=${2:-main}
started=$(date +%s)
check_dir=$(mktemp -d "${TMPDIR:-/tmp}/pz-judge.XXXXXXXX")
trap 'rm -rf "$check_dir"' EXIT
git init -q "$check_dir/repo"
git -C "$check_dir/repo" remote add origin "$repo"
git -C "$check_dir/repo" fetch -q --depth=1 origin "$ref"
git -C "$check_dir/repo" checkout -q --detach FETCH_HEAD
cd "$check_dir/repo"
# No source checkout .env is copied, and inherited credentials cannot enable paid clients.
export NEBIUS_API_KEY= TAVILY_API_KEY= TYPESAFE_API_KEY= DEV_LEDGER= DEV_PIPELINE= DEV_REPLAY_DIR=
export PZ_RECORD_DIR= PZ_REPLAY_DIR=
npm ci --no-audit --no-fund
make verify
make judge
make replay ARGS=--json > "$check_dir/replay.json"
npm run -s pz -- verify "$check_dir/replay.json"
elapsed=$(( $(date +%s) - started ))
if [ "$elapsed" -gt 300 ]; then
  echo "judge-check FAILED: ${elapsed}s exceeds the five-minute budget" >&2
  exit 1
fi
echo "judge-check passed: fresh checkout, no API keys, ${elapsed}s"
