# Accessibility and phone check (#257 item 7)

Run on Nov 19, 2026 against a production build (`npm run build -w web`, served with `vite preview`), with the
landing, How it works, traces list, trace view and the Check an AI answer pages all in one build.

## Lighthouse accessibility

Lighthouse 13.6.0, accessibility category only. Desktop uses `--preset=desktop`; phone uses the default mobile
emulation. Dark runs launch Chrome with `--blink-settings=preferredColorScheme=0`, which sets
`prefers-color-scheme: dark` (checked with a headless screenshot).

| Page | Light, desktop | Light, phone | Dark, desktop | Dark, phone |
|---|---|---|---|---|
| Landing `#/` | 100 | 100 | 100 | 100 |
| How it works `#/how` | 100 | 100 | 100 | 100 |
| Recorded traces `#/traces` | 100 | 100 | 100 | 100 |
| Trace view `#/t/dev-10` | 100 | 100 | 100 | 100 |
| Check an AI answer `#/answer` | 100 | 100 | 100 | 100 |
| One statistic's trace `#/answer/1` | 100 | 100 | 100 | 100 |

Color contrast passes on every page in both themes. The one note Lighthouse raised, on the landing's recorded trace
link (its `aria-label` did not contain the text shown on it), is fixed in this PR: the link no longer overrides its
name with an `aria-label`, so screen readers read what is on screen. A re-run of the landing then shows no failing
audit.

## Phone (390 px) and dark

Every page was checked at 390 px wide in light and dark: no sideways scroll on any page, and nothing cut off. The
trace view's ending, receipts and copies and roots rows lay out on a phone as intended.

## How to rerun

```sh
npm run build -w web
npx vite preview apps/web --port 4173
npx lighthouse@13.6.0 "http://localhost:4173/#/how" --only-categories=accessibility --preset=desktop
npx lighthouse@13.6.0 "http://localhost:4173/#/how" --only-categories=accessibility --chrome-flags="--blink-settings=preferredColorScheme=0"
```
