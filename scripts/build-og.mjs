// Regenerates public/og.png, the 1200x630 link-preview card. Run after changing the palette,
// the display type or the hero line so the card and the page keep saying the same thing:
//   node scripts/build-og.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const font = (path) => readFileSync(resolve(root, 'node_modules', path)).toString('base64');
const display = font('@fontsource-variable/chivo/files/chivo-latin-wght-normal.woff2');
const mono = font('@fontsource-variable/chivo-mono/files/chivo-mono-latin-wght-normal.woff2');

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Chivo;font-weight:100 900;src:url(data:font/woff2;base64,${display}) format('woff2-variations')}
@font-face{font-family:'Chivo Mono';font-weight:100 900;src:url(data:font/woff2;base64,${mono}) format('woff2-variations')}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#F5F7FA;color:#0F1A2E;font-family:Chivo,sans-serif;
     padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between}
.eyebrow{font:500 20px/1 'Chivo Mono',monospace;letter-spacing:.2em;color:#1B4FD8;text-transform:uppercase}
h1{font:900 128px/.9 Chivo,sans-serif;letter-spacing:-.035em;margin-top:34px}
.line{font:400 34px/1.35 Chivo,sans-serif;margin-top:34px}
.line b{font-weight:400;color:#1B4FD8}
footer{display:flex;justify-content:space-between;align-items:baseline;padding-top:26px;
       border-top:1px solid #D5DBE4;font:500 19px/1 'Chivo Mono',monospace;letter-spacing:.14em;
       color:#5A6678;text-transform:uppercase}
</style>
<div>
  <p class="eyebrow">Hello, I'm</p>
  <h1>Bartosz<br>Burda</h1>
  <p class="line"><b>Embedded Software Architect.</b><br>I build the diagnostic and recovery layer for robots.</p>
</div>
<footer><span>bburda.github.io</span><span>SOVD &middot; ROS 2 &middot; AUTOSAR</span></footer>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: resolve(root, 'public/og.png') });
await browser.close();
console.log('Wrote public/og.png (1200x630).');
