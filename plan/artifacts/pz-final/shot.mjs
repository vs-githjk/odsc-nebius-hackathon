import { chromium } from '/Users/vidyutsriram/LA-Hacks-2026/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const SRC = '/Users/vidyutsriram/ODSC x Nebius Hackathon/plan/artifacts/pz-final/patient-zero.html';
const OUT = '/Users/vidyutsriram/ODSC x Nebius Hackathon/plan/artifacts/pz-final';
const TMP = '/private/tmp/claude-501/-Users-vidyutsriram-ODSC-x-Nebius-Hackathon/1e86ea49-58ea-4c7f-b7c9-068104223cb1/scratchpad/final/pzf-wrapped.html';
const mode = process.argv[2] || 'all';
const html = fs.readFileSync(SRC, 'utf8');
fs.writeFileSync(TMP, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + html.replace(/<\/style>/, '</style></head><body>') + '</body></html>');
const exe = '/Users/vidyutsriram/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const browser = await chromium.launch({ executablePath: exe });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
async function run(w, h, scheme, shots) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${w} ${scheme}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${w} ${scheme} console: ${m.text()}`); });
  await page.goto('file://' + TMP, { waitUntil: 'networkidle' });
  await sleep(2200);
  const tag = `${w}-${scheme}`;
  const rwPos = async p => page.evaluate(p => { const s = document.getElementById('rewind'); const top = s.offsetTop; const len = s.offsetHeight - innerHeight; window.scrollTo(0, top + p * len); }, p);
  for (const sh of shots) {
    if (sh.kind === 'hero') { await page.evaluate(() => window.scrollTo(0, 0)); await sleep(500); }
    if (sh.kind === 'rw') { await rwPos(sh.p); await sleep(900); await rwPos(sh.p); await sleep(400); }
    if (sh.kind === 'prod') { await page.evaluate(() => { const s = document.getElementById('stage'); const r = s.getBoundingClientRect(); window.scrollTo(0, scrollY + r.top - Math.max(84, (innerHeight - r.height) / 2)); }); await sleep(900); await page.evaluate(v => window.PZ.setScrub(v), sh.v); await sleep(900); }
    if (sh.kind === 'sel') { await page.evaluate(() => { const s = document.getElementById('any'); window.scrollTo(0, s.offsetTop - 60); }); await sleep(1300); }
    if (sh.kind === 'close') { await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(1300); }
    if (sh.kind === 'full') { await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300); await page.screenshot({ path: `${OUT}/${tag}-full.png`, fullPage: true }); continue; }
    await page.screenshot({ path: `${OUT}/${tag}-${sh.name}.png` });
  }
  const ov = await page.evaluate(() => {
    const out = []; const vw = innerWidth;
    document.querySelectorAll('body *').forEach(el => { const r = el.getBoundingClientRect(); if (r.width && (r.right > vw + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed') out.push(el.tagName + '.' + String(el.className).slice(0, 30) + ' ' + Math.round(r.left) + '..' + Math.round(r.right)); });
    return { sw: document.documentElement.scrollWidth, vw, wide: out.slice(0, 12) };
  });
  console.log(tag, 'scrollWidth', ov.sw, 'vw', ov.vw, ov.wide.length ? ov.wide : 'no wide elements');
  await ctx.close();
}
const desk = [ { kind: 'hero', name: 'hero' }, { kind: 'rw', p: 1/3, name: 'rw33' }, { kind: 'rw', p: .5, name: 'rw50' }, { kind: 'rw', p: 2/3, name: 'rw67' }, { kind: 'rw', p: 1, name: 'rw100' }, { kind: 'prod', v: 1/3, name: 'prod-s33' }, { kind: 'prod', v: .5, name: 'prod-s50' }, { kind: 'prod', v: 1, name: 'prod-s100' }, { kind: 'sel', name: 'select' }, { kind: 'close', name: 'close' } ];
const phone = [ { kind: 'hero', name: 'hero' }, { kind: 'rw', p: .5, name: 'rw50' }, { kind: 'rw', p: 1, name: 'rw100' }, { kind: 'prod', v: 1/3, name: 'prod-s33' }, { kind: 'prod', v: 1, name: 'prod-s100' }, { kind: 'sel', name: 'select' }, { kind: 'close', name: 'close' } ];
if (mode === 'all' || mode === 'light') { await run(1440, 900, 'light', desk.concat([{ kind: 'full' }])); await run(390, 844, 'light', phone); }
if (mode === 'all' || mode === 'dark') { await run(1440, 900, 'dark', [ { kind: 'hero', name: 'hero' }, { kind: 'rw', p: 1, name: 'rw100' }, { kind: 'prod', v: 1/3, name: 'prod-s33' } ]); await run(390, 844, 'dark', [ { kind: 'prod', v: 1, name: 'prod-s100' } ]); }
if (mode === 'refs') {
  for (const [name, url] of [['stripe', 'https://stripe.com'], ['arc', 'https://arc.net'], ['apple-ipad', 'https://www.apple.com/ipad-pro/']]) {
    try { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); await p.goto(url, { waitUntil: 'load', timeout: 25000 }); await sleep(2500); await p.screenshot({ path: `${OUT}/ref-${name}-1440.png` }); await ctx.close(); } catch (e) { console.log('ref failed', name, e.message.slice(0, 80)); }
  }
}
console.log(errors.length ? errors : 'no page errors');
await browser.close();
