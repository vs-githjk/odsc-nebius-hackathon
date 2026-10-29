# Patient Zero design system (final, 2026-10-29)

Source of truth for the build: `plan/artifacts/pz-final/patient-zero.html` (the page builders copy from) and the screenshots beside it. Direction: Time Machine (d3) plus Rewind's scroll story (d2), light first, vibrant, per decisions.md (LOCKED 2026-10-29). Every value below is read from the page, not from memory.

## 1. Tokens

### Colour, light (default, the designed theme)
| Token | Value | Use |
|---|---|---|
| `--bg` | `#FFFFFF` | page ground |
| `--bg-2` | `#F5F7FC` | band ground, chips, future side of the band |
| `--surface` | `#FFFFFF` | the stage card, the doc, the stop card |
| `--ink` | `#0B1020` | text, big numbers |
| `--ink-2` | `#4B5268` | supporting text |
| `--ink-3` | `#6B7390` | captions, tick labels (4.6:1 on white, computed) |
| `--line` / `--line-2` | `rgba(11,16,32,.08)` / `.14` | hairlines, chip rings |
| `--action` / `--action-hover` | `#1F4BD8` / `#163FC2` | buttons, links; white text 6.9:1 |
| `--hot` / `--hot-ink` | `#FF4F3F` / `#D8321F` | today; changed-word underline and dots; `--hot-ink` is the text form (4.8:1) |
| `--warm` | `#FFB224` | about 2018 on the time ramp |
| `--cool` | `#19B8CC` | about 2015 on the ramp |
| `--cold` / `--deep` | `#2E5BFF` / `#1434A4` | 2012 and the root |
| `--good` / `--caution` | `#118A5C` / `#B8700A` | verified text, inferred readouts |
| `--chg-tint` | `rgba(255,79,63,.13)` | fill behind a changed word |
| `--sel` | `rgba(255,178,36,.34)` | selection and hover highlight |
| `--tip-bg` / `--tip-ink` | `#0B1020` / `#FFFFFF` | blame tooltip and the popover |
| `--shadow` | `0 1px 2px rgba(11,16,32,.05), 0 24px 60px -24px rgba(11,16,32,.22), 0 60px 120px -40px rgba(30,91,255,.16)` | the one lifted card |

The time ramp is one gradient read in this order: `--deep, --cold, --cool, --warm, --hot` (past to today). Everything that encodes time (field, band strip, scrubber track, dots, story fill) samples the same ramp.

### Colour, dark (secondary, auto via `prefers-color-scheme`, navy not black)
`--bg #12162A`, `--bg-2 #171C33`, `--surface #1B2039`, `--ink #F2F3F8`, `--ink-2 #BCC1D4`, `--ink-3 #8E95AF`, `--action #7D97FF` (ink text `#0B1020`), `--hot #FF6655`, `--hot-ink #FF8A7C`, `--warm #FFC24D`, `--cool #36CCDC`, `--cold #5B82FF`, `--deep #2749C9`, `--good #3FC48F`, `--caution #F0B254`, tooltip inverted (`--tip-bg #F2F3F8`, `--tip-ink #0B1020`). Field alpha drops to .6 of light. The three-state pattern (bare `:root`, `prefers-color-scheme: dark` guarded by `:root:not([data-theme="light"])`, `:root[data-theme="dark"]`) is in the file; keep it.

### Type
- UI: `Instrument Sans` (400, 500, 600, 700), fallback `system-ui`. Body 17px / 1.5.
- Quotes (every sentence that is a page's wording): `Newsreader` italic 400, optical size axis on, fallback Georgia. Used for the hero quote, the story morph, the product sentence, the example article.
- Scale: hero quote `clamp(40px, 7.2vw, 108px)` / 1.02 / -.02em; story year `clamp(72px, 11vw, 168px)` / .88 / -.05em, 600, tabular; story morph `clamp(28px, 3.4vw, 48px)` / 1.14; section heading `.k` `clamp(36px, 5vw, 72px)` / 1.02 / -.035em, 600; product sentence `clamp(26px, 3vw, 40px)` / 1.18; lead `clamp(18px, 1.6vw, 23px)` / 1.4; readout page name 17px 600; captions and chips 12 to 14px; chips with uppercase (REPLAY, QUICK LOOK) get `.06em` tracking.
- `font-variant-numeric: tabular-nums` only on digit spans (years, counters), never on a whole serif line.

### Spacing and shape
- Container 1200px, gutter `max(16px, env(safe-area-inset-*))`.
- Vertical rhythm: sections `10vh to 12vh`; inside the stage 22px between blocks, 36px above the sentence; readout grid gap 20px.
- Radius: stage card 24px (20px under 600px), band 16px, doc 20px, buttons 12px (10px small), tooltip and popover 10px and 16px, chips 999px.
- Borders over shadows: 1px `--line` on cards; the stage is the only element with `--shadow`; the nav is the only glass element (`backdrop-filter: blur(14px) saturate(1.4)` over `--bg` at 78%).
- Tap targets: buttons 44px (40px on phone, still 44px with its hit area), scrub handle 44px.

## 2. Motion system

Library: GSAP 3.12.5 plus ScrollTrigger (cdnjs). In the React build use `motion` or GSAP; the timings below are the contract. All motion honours `prefers-reduced-motion`: the story collapses to a static stack resting on 2012, the product rests at the 2013 hop, canvases draw one frame.

| Moment | Driver | Timing |
|---|---|---|
| Hero quote in | load | 900ms `power3.out`, y 28 to 0; lead 800ms delay 250ms; cue 800ms delay 1.1s; count 0 to 142 over 1.3s `power3.out` delay 500ms |
| The rewind | scroll, pinned 460vh (380vh on phone), `scrub: .5` | progress p in [0,1] maps to 3 segments (today to 2015, 2015 to 2013, 2013 to 2012); even thirds |
| Word morph, one segment q in [0,1] | p | words leaving fade and shrink 6 percent over q [0,.38]; kept words travel along one baseline over q [.38,.62] (smoothstep); arriving words fade in over q [.62,1]; no overlap at any q |
| Big year | p | rests on the hop's year; interpolates only over q [.3,.7] |
| Caption and counter | p | switch at q = .5 (`142 pages carry it`, `9 clusters once copies collapse`, `Traced to 1 root we could link, 2 clusters unlinked`, `0 studies found in what we searched`) |
| Story dots | p | 142 dots: wave band to 9 discs over p [.05,.5]; linked discs fold into the root disc over p [.58,.9]; the 2 unlinked discs dim to 45 percent; cluster counts label at a > .85 on desktop; root label after b > .2 |
| Colour field | p, then the handle | hue = ramp(1 - p) in the story; alpha 1 fading to .7 by 2012; while the stage is on screen hue follows the handle (`heat(x)`) at alpha .55; after it, alpha .25; blob drift is a slow sine (speeds .07 to .12 rad/s, amplitude 3 percent of width); drawn at third resolution with a 16px blur |
| Stage entrance | once, `top 70%` | heading and lead 700ms stagger 80ms; card 800ms delay 150ms y 32 to 0 |
| Autoplay intro | once, 1.2s after the card enters | handle to 2012 in 3.6s `power2.inOut`, hold 1.2s, back to 2013 in 1.8s `power3.inOut`; any pointer or key stops it |
| Scrub drag | pointer | 250ms `power2.out` while dragging; on release snap to the nearest hop in 550ms `power3.out`; keyboard arrows step one hop, Home and End jump |
| Band copies | every frame | spring toward target (k .09, damping .72); copies that do not exist yet at the handle's year fade to a ring |
| Readout change | hop change | hop block 300ms y 6 to 0; chips 200ms opacity plus 250ms transform, stagger 60ms |
| Stop state | handle past 94 percent | stop card and unlinked note 250ms fade and rise 8px; root disc pulses 3px on a 3.8s sine (none under reduced motion) |
| Popover | ambient | 6px float over 5s ease-in-out; off under reduced motion |

Easing names: `power2.out` for follow, `power3.out` for settle, `power2.inOut` or `power3.inOut` for self-driven travel, smoothstep for scroll-mapped values. Nothing bounces.

## 3. Components (build list)

1. **Nav**: wordmark (ring with a coral dot) plus one `btn small` link. Sticky, glass.
2. **Opening**: `h1.quote` (Newsreader italic, curly quotes), `.lead` with the live count, scroll cue.
3. **Rewind (pinned story)**: `.year` and `.year-cap`, `.rw-counter`, `Morph` host (story mode: host height follows the current hop), `.rw-src` source line (shows only on the 2012 stop), dots canvas, `.track` with gradient fill and four stops.
4. **Morph engine** (`Morph(host, withTips)`): tokenises each hop's rows, chains words across hops by LCS on normalised tokens (`’s` stripped), lays words out from hidden measure rows, renders by progress. `.w.changed` = tint plus 2px coral underline, applied only to words new at that hop (chain ends there). Product mode keeps the tallest height and attaches the blame tooltip.
5. **Stage (product window)**: `.chip` REPLAY, `.counter` (counter wording at the root exactly: `142 pages -> 9 clusters -> traced to 1 root we could link -> 0 studies found in what we searched`), `.sentence` morph, `.band` canvas with `.stopcard` (TRAIL GOES COLD once on the page, with "How this was decided: rule 6") and `.unlinked` (folds into the stop card under 600px), `.scrub` (gradient track, future dimmed, inferred edge dashed, 44px handle with slider ARIA), `.ticks`, `.readout` (`.hop` with `verified text` and `<tier> match` pills, `.chips` measured or inferred with a confidence), one `.foot-note` (the single example-data note on the page).
6. **Select-a-number scene**: `.scene2` heading plus `.doc` example article with `mark` and the `.pop` quick look (dark popover, ramp mini-bar, `Trace this number`, `about 60 s`).
7. **Close**: `.k` plus lead plus one button; `.foot` wordmark and team line.

### Data shape the UI expects
```
hop = { year: 2015.4, when: 'May 2015', cap: 'where it spread', page: 'Magazine feature',
        rows: ['...'], tier: 'exact' | 'normalised', diff?: true, verified?: true, note: '...' }
cluster = { y: 2015.4, n: 38, link: 'solid' | 'dashed' | null, row: .34 }
```
Hops newest first; the last hop may have two rows (the 2012 table). The copies counter at a scrub position counts pages whose year is at or before the handle's year.

## 4. Honesty rules carried by the design
- Counter wording fixed as above; "earliest page we found with the new wording" on the 2015 hop; REPLAY badge on the stage; exactly one example-data note (the stage foot-note); TRAIL GOES COLD appears once (the stop card), with the rule that decided it.
- Changed words are marked by shape and colour (tint plus underline), and only words that differ from the earlier hop are marked; the chip states the count.
- The 2012 root is statisticbrain.com (Wayback capture Feb 2012); its source line names The Associated Press, where the trail goes cold. Never name the AP as the page.
- Verified rows are the two 2012 rows only; every other page, count and readout is example data until the spike replaces it.

## 5. Checked and not checked
Checked on the real file with Playwright (chromium headless shell 1234): 1440x900 and 390x844, light and dark, hero, story at p = 1/3, 1/2, 2/3, 1, product at s = 1/3, 1/2, 1, the popover scene, the close; scrollWidth equals the viewport at both widths; no console or page errors; contrast ratios computed from the hex values above. Not checked: Safari and Firefox rendering, a real touch drag, screen reader output, Lighthouse.
