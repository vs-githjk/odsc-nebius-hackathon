# Fixtures

Synthetic: an invented claim on invented pages. Shown as SAMPLE, never as REPLAY or LIVE.

The claim ("Harbor Zoo penguins nap 14 times a day, twice as often as the zoo's seals") and every page under `pages/` are made up. Every domain ends in `.example`; no real outlet, study or person appears.

- `pages/*.txt`: the invented pages, one per node id.
- `src/pages.ts`: each page's URL, date, page type and the sentence quoted from it.
- `src/specs/*.ts`: the seven fixtures (`sample-rich`, `sample-origin`, `sample-conflicting`, `sample-partial`, `sample-tool-failed`, `sample-no-pages`, `sample-cold-unread`).
- `src/build.ts`: turns specs into `traces/*.json`, computing offsets and hashes from the normalised pages. It fails if a quoted sentence is not found verbatim, or if `decideStopState` gives a different state than the spec expects.

Rebuild with `npm run fixtures`. The output is deterministic; `packages/pz/test/fixtures.test.ts` checks that a fresh build equals the committed files.
