import { chromium } from '/Users/vidyutsriram/LA-Hacks-2026/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const SRC = '/Users/vidyutsriram/ODSC x Nebius Hackathon/plan/artifacts/pz-final/patient-zero.html';
const OUT = '/Users/vidyutsriram/ODSC x Nebius Hackathon/plan/artifacts/pz-final';
const TMP = '/private/tmp/claude-501/-Users-vidyutsriram-ODSC-x-Nebius-Hackathon/1e86ea49-58ea-4c7f-b7c9-068104223cb1/scratchpad/final/pzf-wrapped.html';
const html = fs.readFileSync(SRC, 'utf8');
fs.writeFileSync(TMP, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + html.replace(/<\/style>/, '</style></head><body>') + '</body></html>');
const browser = await chromium.launch({ executablePath: '/Users/vidyutsriram/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errs = [];
for (const [w, h, scheme, frames] of [[1440, 900, 'light', [.83, 1]]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
  const page = await ctx.newPage(); page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + TMP, { waitUntil: 'networkidle' }); await sleep(2000);
  const rw = async p => page.evaluate(p => { const s = document.getElementById('rewind'); window.scrollTo(0, s.offsetTop + p * (s.offsetHeight - innerHeight)); }, p);
  for (const p of frames) { await rw(p); await sleep(900); await rw(p); await sleep(900); await page.screenshot({ path: `${OUT}/${w}-${scheme}-rw${Math.round(p*100)}.png` }); }
  console.log(w, scheme, 'story font', await page.evaluate(() => getComputedStyle(document.getElementById('morph')).fontSize));
  await ctx.close();
}
console.log(errs.length ? errs : 'no page errors'); await browser.close();
