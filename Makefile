.PHONY: verify replay live dev-score

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
