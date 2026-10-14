// Offline renderer: drives index.html?render in headless Chromium and writes frames.
//
//   node render.mjs --out frames [--workers 4] [--samples 12] [--from 0] [--to 1800]
//   node render.mjs --out shots --times 0.5,2.25,4.1 --samples 1 --jpg     (stills by time)
//
// Each worker is its own browser process so frames render in parallel.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
const FPS = 60, total = 30 * FPS;
const out = path.resolve(args.out || 'frames');
const workers = +(args.workers || 4);
const samples = +(args.samples || 12);
const jpg = !!args.jpg;
const jobs = args.times
  ? String(args.times).split(',').map(s => ({ f: Math.round(+s * FPS), name: `t${(+s).toFixed(2).padStart(5, '0')}` }))
  : (args.frames ? String(args.frames).split(',').map(Number)
    : Array.from({ length: (+(args.to ?? total)) - (+(args.from ?? 0)) }, (_, i) => i + +(args.from ?? 0)))
    .map(f => ({ f, name: `f${String(f).padStart(4, '0')}` }));
fs.mkdirSync(out, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html?render`;

let next = 0, done = 0;
const t0 = Date.now();
async function worker(id) {
  const browser = await chromium.launch({ args: ['--disable-gpu', '--force-color-profile=srgb'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => { console.error(`[w${id}] page error:`, e.message); process.exitCode = 1; });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error(`[w${id}]`, m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.REEL_READY === true);
  while (next < jobs.length) {
    const { f, name } = jobs[next++];
    const data = await page.evaluate(([f, s, j]) => window.REEL_CAPTURE(f, s, j ? 'image/jpeg' : 'image/png', .9), [f, samples, jpg]);
    fs.writeFileSync(path.join(out, `${name}.${jpg ? 'jpg' : 'png'}`), Buffer.from(data.split(',')[1], 'base64'));
    if (++done % 60 === 0 || done === jobs.length) {
      const el = (Date.now() - t0) / 1000;
      process.stdout.write(`\r${done}/${jobs.length} frames  ${el.toFixed(0)}s  eta ${(el / done * (jobs.length - done)).toFixed(0)}s   `);
    }
  }
  await browser.close();
}
await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, (_, i) => worker(i)));
process.stdout.write('\n');
server.close();
