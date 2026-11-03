.PHONY: verify replay live

# Re-checks everything with no API keys: typecheck, tests, every committed trace, the trap set,
# the copy lint, the leakage test and the claims table.
verify:
	@start=$$(date +%s); \
	npm run -s typecheck && \
	mkdir -p runs && npx vitest run --reporter=default --reporter=json --outputFile.json=runs/vitest.json && \
	npm run -s pz -- verify fixtures/traces/*.json && \
	if ls spike/traces/*.json >/dev/null 2>&1; then npm run -s pz -- verify spike/traces/*.json; fi && \
	npm run -s pz -- traps && \
	node --import tsx packages/pz/src/cli/lint-copy.ts && \
	node --import tsx packages/pz/src/cli/leakage.ts && \
	node --import tsx packages/pz/src/cli/claims.ts && \
	echo "make verify passed in $$(( $$(date +%s) - start )) s"

replay live:
	@echo "not built yet"
	@exit 1
