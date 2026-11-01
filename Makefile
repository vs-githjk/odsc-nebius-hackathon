.PHONY: verify replay live

verify:
	npm run typecheck
	npm test

replay live:
	@echo "not built yet"
	@exit 1
