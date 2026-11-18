.PHONY: verify replay live dev-score dev-run replay-walk judge doctor

# Re-checks everything with no API keys: typecheck, tests, every committed trace, the trap set,
# the copy lint, the number lint (every number in README.md and llms.txt backed by a linked file), the leakage test
# and the claims table.
verify:
	@start=$$(date +%s); \
	npm run -s typecheck && \
	mkdir -p runs && npx vitest run --reporter=default --reporter=json --outputFile.json=runs/vitest.json && \
	npm run -s pz -- verify fixtures/traces/*.json fixtures/failure/traces/*.json && \
	if ls spike/traces/*.json >/dev/null 2>&1; then npm run -s pz -- verify spike/traces/*.json --historical spike/historical-traces.json; fi && \
	npm run -s pz -- traps && \
	node --import tsx packages/pz/src/cli/lint-copy.ts && \
	node --import tsx packages/pz/src/cli/lint-numbers.ts && \
	node --import tsx packages/pz/src/cli/leakage.ts && \
	node --import tsx packages/pz/src/cli/claims.ts || exit 1; \
	took=$$(( $$(date +%s) - start )); \
	if [ $$took -gt 60 ]; then echo "make verify FAILED: took $$took s, over the 60 s budget (C17)"; exit 1; fi; \
	echo "make verify passed in $$took s"

# .env only when it exists, so a clean clone gets no warning about a missing file.
ENV_FILE := $(if $(wildcard .env),--env-file=.env,)

# Everything a judge needs from a clean clone with no keys, under 60 s (T95): pz doctor, every reviewed trace as a
# card, pz verify on all of them, the trap lines and a one-line summary.
judge:
	@node $(ENV_FILE) --import tsx packages/pz/src/cli/pz.ts judge

# Explains the setup: Node, npm ci, which keys are set (never their values), which stages run live. ARGS=--network
# adds one free request per service whose key is set.
doctor:
	@node $(ENV_FILE) --import tsx packages/pz/src/cli/pz.ts doctor $(ARGS)

TRACE ?= fixtures/traces/sample-rich.json

# The default is explicitly SAMPLE. Supply TRACE=... for a verified real recording, ARGS=--json for the raw trace.
replay:
	@node --import tsx packages/pz/src/cli/pz.ts trace --replay-of "$(TRACE)" $(ARGS)

live:
	@echo "not built yet"
	@exit 1

# Grades eval/dev-traces/ against the E2 dev claims and appends a dated row to eval/dev-score.md (T33).
dev-score:
	@node --import tsx eval/dev-score.ts

# Reruns the whole pipeline for a dev set from a recording (PZ_RECORD_DIR on a live run), at $0, into runs/replay-walk/.
# Prints the replay score, last night's committed score, "misses N" and a per-claim miss table. PZ_REPLAY_CLAIMS=dev-02,dev-05
# replays only those claims, labelled as a subset (for example the ones recorded in one run). See eval/README.md.
SET ?= E2
replay-walk:
	@node --import tsx eval/replay-walk.ts --set $(SET) $(if $(PZ_REPLAY_CLAIMS),--claims $(PZ_REPLAY_CLAIMS)) $(ARGS)

export DEV_REPLAY_DIR DEV_PIPELINE DEV_LEDGER
dev-run:
	@node --import tsx eval/dev-run.ts
