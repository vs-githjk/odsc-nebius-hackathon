# Lighthouse: landing performance, best practices and SEO (#257 batch 2, item 4)

Run on Nov 19, 2026 against a production build of main (`npm run build -w web`, served with `vite preview`), on the
landing (`#/`). Lighthouse 13.6.0, categories performance, best-practices and seo. Desktop uses `--preset=desktop`;
phone uses the default mobile emulation (slow 4G, 4x CPU slowdown). Accessibility is in
[accessibility.md](accessibility.md): 100 on every page.

| Landing | Performance | Best practices | SEO |
|---|---|---|---|
| Desktop, before | 100 | 100 | 91 |
| Phone, before | 95 | 100 | 91 |
| Desktop, after | 100 | 100 | 100 |
| Phone, after | 99 | 100 | 100 |

## What changed

- **`robots.txt`** (`apps/web/public/robots.txt`, allow all). Without it the server answered `/robots.txt` with the app's
  HTML, which Lighthouse read as 35 robots.txt errors and scored SEO 91. With it, SEO is 100.

## What did not need changing

- **The large JS chunk.** The build warns that the main chunk is about 990 kB (225 kB gzipped): it carries every
  recorded trace, eagerly, so the landing's hero and the claim box can open any recorded trace at once. Phone
  performance still scores 95 to 99 across runs (total blocking time 140 to 260 ms), so splitting the trace view off with
  a lazy import is not needed to reach 90. The S7 answer recording already loads only on its own page.
- **Source maps.** Lighthouse lists "valid source maps" as informational; best practices is 100 without them, and the
  build ships none on purpose.

## How to rerun

```sh
npm run build -w web
npx vite preview apps/web --port 4175
npx lighthouse@13.6.0 "http://localhost:4175/#/" --only-categories=performance,best-practices,seo --preset=desktop
npx lighthouse@13.6.0 "http://localhost:4175/#/" --only-categories=performance,best-practices,seo
```
