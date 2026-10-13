// Offline renderer for index.html?render (headless Chromium via Playwright).
//
//   node render.mjs events  [--out audio/events.json]          UI sound events + loop length, for the mixer
//   node render.mjs stills  [--offset 0.3] [--out stills]      one frame per beat (b01-1.1.png …)
//   node render.mjs frames  --t 0,6.5,13.99 [--out shots]      frames at given times
//   node render.mjs video   [--out frames] [--workers 3]       60 fps, 4 subframes per frame blended by ffmpeg tmix
//   node render.mjs check                                      loop seam check (positions + speeds)
//
// Every mode accepts --beat 0.5 --title … --artist … --dur 178 (passed to the page).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs')); }

const [mode = 'stills', ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) args[rest[i].slice(2)] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;

const FPS = 60, SUB = 4, SHUTTER = 0.5;      // 4 subframes spread over half a frame (180° shutter), centred on the frame time
const query = new URLSearchParams({ render: '' });
for (const k of ['beat', 'title', 'artist', 'dur']) if (args[k]) query.set(k, args[k]);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html?${query}`;

async function openPage() {
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--disable-gpu', '--font-render-hinting=none', '--disable-lcd-text'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1440 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('page error:', e.message); process.exitCode = 1; });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error('[page]', m.text()); });
  await page.goto(url);
  await page.evaluate(() => window.MORPH.ready);
  const cdp = await page.context().newCDPSession(page);
  const shot = async t => {
    await page.evaluate(t => window.MORPH.seek(t), t);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    return Buffer.from(data, 'base64');
  };
  return { browser, page, shot };
}

const outDir = d => { const o = path.resolve(root, args.out || d); fs.mkdirSync(o, { recursive: true }); return o; };

if (mode === 'events' || mode === 'check') {
  const { browser, page } = await openPage();
  const info = await page.evaluate(() => ({ T: MORPH.T, B: MORPH.B, events: MORPH.E, sounds: MORPH.sounds, track: MORPH.track, loop: MORPH.loopCheck() }));
  if (mode === 'events') {
    const out = path.resolve(root, args.out || 'audio/events.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(info, null, 2));
    console.log(`${info.sounds.length} sound events, loop ${info.T}s → ${path.relative(root, out)}`);
  } else console.log(JSON.stringify(info.loop, null, 2));
  await browser.close();
}

if (mode === 'stills' || mode === 'frames') {
  const { browser, page, shot } = await openPage();
  const { T, B } = await page.evaluate(() => ({ T: MORPH.T, B: MORPH.B }));
  const out = outDir(mode === 'stills' ? 'stills' : 'shots');
  const times = mode === 'stills'
    ? Array.from({ length: Math.round(T / B) }, (_, b) => [b * B + +(args.offset ?? 0.3), `b${String(b + 1).padStart(2, '0')}-${Math.floor(b / 4) + 1}.${b % 4 + 1}`])
    : String(args.t).split(',').map(Number).map(t => [t, `t${t.toFixed(3)}`]);
  for (const [t, name] of times) fs.writeFileSync(path.join(out, `${name}.png`), await shot(t));
  console.log(`${times.length} frames → ${path.relative(root, out)}`);
  await browser.close();
}

if (mode === 'video') {
  const out = outDir('frames');
  const workers = +(args.workers || 3);
  const probe = await openPage();
  const T = await probe.page.evaluate(() => MORPH.T);
  await probe.browser.close();
  // N whole frames span exactly one loop: frame f shows page time f*T/N (the encode stretches the audio to match)
  const N = Math.round(T * FPS), DT = T / N;
  const from = +(args.from || 0), to = Math.min(N, +(args.to || N));
  const chunk = Math.ceil((to - from) / workers);
  let done = 0;
  const t0 = Date.now();
  async function work(a, b) {
    if (a >= b) return;
    const { browser, shot } = await openPage();
    // Subframes go into ffmpeg in order; tmix averages each group of 4 and select keeps one frame per group.
    const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS * SUB), '-i', '-',
      '-vf', `tmix=frames=${SUB}:weights=${Array(SUB).fill(1).join(' ')},select=eq(mod(n\\,${SUB})\\,${SUB - 1})`, '-fps_mode', 'passthrough',
      '-start_number', String(a), path.join(out, 'f%05d.png')], { stdio: ['pipe', 'inherit', 'inherit'] });
    const closed = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exited ' + c))));
    for (let f = a; f < b; f++) {
      for (let j = 0; j < SUB; j++) {
        const t = (f + ((j + 0.5) / SUB - 0.5) * SHUTTER) * DT;
        if (!ff.stdin.write(await shot(t))) await new Promise(r => ff.stdin.once('drain', r));
      }
      if (++done % 30 === 0 || done === to - from) {
        const el = (Date.now() - t0) / 1000;
        process.stdout.write(`\r${done}/${to - from} frames  ${el.toFixed(0)}s  eta ${(el / done * (to - from - done)).toFixed(0)}s   `);
      }
    }
    ff.stdin.end();
    await closed;
    await browser.close();
  }
  await Promise.all(Array.from({ length: workers }, (_, i) => work(from + i * chunk, Math.min(to, from + (i + 1) * chunk))));
  process.stdout.write('\n');
  fs.writeFileSync(path.join(out, 'timing.json'), JSON.stringify({ frames: N, fps: FPS, loop: T, stretch: N / FPS / T }));
  console.log(`${to - from} frames (${SUB} subframes each) → ${path.relative(root, out)}`);
}

server.close();
