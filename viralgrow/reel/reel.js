/*
 * VIRALGROW — MOTION CASE 2026
 * ------------------------------------------------------------
 * A 15-second launch film for ViralGrow, built as a motion design portfolio piece.
 * Every frame is a pure function of time:
 *
 *     REEL.renderFrame(ctx, t, { samples })
 *
 * No keyframes, footage or image assets; only the two brand fonts. The same code
 * drives the live player (index.html) and the offline renderer (render.mjs).
 *
 * 128 BPM, 32 beats, 8 bars. Each scene is exactly one bar, and each shows a skill:
 *   0.000  01 IGNIÇÃO      particles: one post divides 1 → 2 → 4 … 1.048.576
 *   1.875  02 LOGO         the swarm draws the V-curve mark, the dot pops, lockup
 *   3.750  03 TIPOGRAFIA   kinetic type, then a heat-coloured counter 0° → 97°
 *   5.625  04 PRODUTO      the ° becomes the gauge; UI cards, cursor, click
 *   7.500  05 DADOS        exponential chart whose axis rescales ×10 every beat
 *   9.375  06 GLOBO        3D dot globe; the heat front spreads city to city
 *  11.250  07 RITMO        six cuts that accelerate into the end card
 *  13.125  08 ASSINATURA   lockup, call to action, credits
 */
(function (global) {
  'use strict';

  const W = 1920, H = 1080, FPS = 60, DUR = 15, BPM = 128, TAU = Math.PI * 2;
  const BEAT = 60 / BPM, BAR = BEAT * 4;
  const bt = n => n * BEAT;
  const SC = Array.from({ length: 9 }, (_, i) => i * BAR);

  // ---------------------------------------------------------------- brand
  const COL = {
    night: '#0C0E2A', deep: '#07081C', paper: '#F3F4FA', cobalt: '#2D3CFF', magenta: '#FF2E88',
    flame: '#FF6A1A', solar: '#FFD60A', white: '#FFFFFF', surface2: '#E8EAF6', muted: '#565A80', mutedD: '#A4A8D0',
    window: '#DFE2F1',
  };
  const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const RGB = Object.fromEntries(Object.entries(COL).map(([k, v]) => [k, hex(v)]));
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const HEAT = [[0, RGB.cobalt], [.5, RGB.magenta], [.78, RGB.flame], [1, RGB.solar]];
  function heat(t) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    for (let i = 1; i < HEAT.length; i++) if (t <= HEAT[i][0]) {
      const [a, ca] = HEAT[i - 1], [b, cb] = HEAT[i];
      return mix(ca, cb, (t - a) / (b - a));
    }
    return HEAT[HEAT.length - 1][1];
  }
  const heatCss = (t, a = 1) => rgba(heat(t), a);
  function heatGrad(ctx, x0, y0, x1, y1, lo = 0, hi = 1, a = 1) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (let k = 0; k <= 8; k++) g.addColorStop(k / 8, heatCss(lo + (hi - lo) * k / 8, a));
    return g;
  }
  const lum = c => (.2126 * c[0] + .7152 * c[1] + .0722 * c[2]) / 255;

  const FD = '"Bricolage Grotesque", "Arial Narrow", sans-serif';
  const FM = '"Geist Mono", "DejaVu Sans Mono", monospace';
  const fd = (px, wt = 800, st = '') => `${st} ${wt} ${px}px ${FD}`;
  const fm = (px, wt = 500) => `${wt} ${px}px ${FM}`;

  // ---------------------------------------------------------------- math
  const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, x) => clamp((x - a) / (b - a));
  const E = {
    lin: t => t,
    inQuad: t => t * t,
    outQuad: t => 1 - (1 - t) * (1 - t),
    inCubic: t => t * t * t,
    outCubic: t => 1 - (1 - t) ** 3,
    inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
    outQuart: t => 1 - (1 - t) ** 4,
    inOutQuart: t => t < .5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2,
    inExpo: t => t <= 0 ? 0 : 2 ** (10 * t - 10),
    outExpo: t => t >= 1 ? 1 : 1 - 2 ** (-10 * t),
    inOutExpo: t => t <= 0 ? 0 : t >= 1 ? 1 : t < .5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2,
    outBack: (t, s = 1.70158) => t <= 0 ? 0 : 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
    outElastic: t => t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - .75) * TAU / 3) + 1,
    spring: t => t <= 0 ? 0 : 1 - Math.exp(-6 * t) * Math.cos(11 * t),
    inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  };
  const hash = (i, s = 0) => { const x = Math.sin(i * 127.1 + s * 311.7 + .123) * 43758.5453; return x - Math.floor(x); };
  const noise = (x, s = 0) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (hash(i, s) * (1 - u) + hash(i + 1, s) * u) * 2 - 1; };
  const fmtInt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  // ---------------------------------------------------------------- text
  const _lay = new Map();
  function setFont(ctx, font, ls = 0) { ctx.font = font; ctx.letterSpacing = ls + 'px'; ctx._ls = ls; }
  function layout(ctx, str) {
    const key = ctx.font + '|' + ctx.letterSpacing + '|' + str;
    let v = _lay.get(key);
    if (!v) {
      const xs = [];
      for (let i = 0; i <= str.length; i++) xs.push(ctx.measureText(str.slice(0, i)).width);
      const m = ctx.measureText(str);
      v = { xs, w: xs[str.length] - (ctx._ls || 0), asc: m.actualBoundingBoxAscent, desc: m.actualBoundingBoxDescent };
      _lay.set(key, v);
    }
    return v;
  }
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>°';
  function scramble(str, t, t0, per = .022, settle = .16) {
    let out = '';
    for (let i = 0; i < str.length; i++) {
      const ts = t0 + i * per * .5, tr = t0 + i * per + settle;
      if (t < ts) out += ' ';
      else if (t >= tr || str[i] === ' ') out += str[i];
      else out += GLYPHS[Math.floor(hash(i * 13 + 1, Math.floor(t * 40)) * GLYPHS.length)];
    }
    return out;
  }
  // Draw a string letter by letter around a centre x. fn(i, n) returns a transform for that glyph.
  function drawRow(ctx, str, cx, base, pivotY, fn, mode = 'fill') {
    const L = layout(ctx, str), x0 = cx - L.w / 2;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === ' ') continue;
      const tr = fn(i, str.length);
      if (!tr || tr.alpha === 0 || tr.sy === 0 || tr.sx === 0) continue;
      const lw = L.xs[i + 1] - L.xs[i] - (ctx._ls || 0);
      ctx.save();
      ctx.translate(x0 + L.xs[i] + lw / 2 + (tr.dx || 0), base + (tr.dy || 0) - pivotY);
      if (tr.rot) ctx.rotate(tr.rot);
      if (tr.skew) ctx.transform(1, 0, tr.skew, 1, 0, 0);
      ctx.scale(tr.sx ?? 1, tr.sy ?? 1);
      if (tr.alpha != null) ctx.globalAlpha *= tr.alpha;
      if (tr.fill) ctx.fillStyle = tr.fill;
      if (mode === 'stroke') ctx.strokeText(str[i], -lw / 2, pivotY); else ctx.fillText(str[i], -lw / 2, pivotY);
      ctx.restore();
    }
    return L;
  }
  function bg(ctx, c) { ctx.fillStyle = c; ctx.fillRect(-400, -400, W + 800, H + 800); }
  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function callout(ctx, ax, ay, lx, ly, text, t, t0, t1, c, right = false, size = 15) {
    const a = inv(t0, t0 + .08, t) * (1 - inv(t1, t1 + .12, t));
    if (a <= 0) return;
    const pl = E.outExpo(inv(t0, t0 + .3, t));
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.strokeStyle = ctx.fillStyle = rgba(c);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(ax, ay, 4.5 * E.outBack(inv(t0, t0 + .15, t), 3), 0, TAU); ctx.fill();
    const ex = lerp(ax, lx, pl), ey = lerp(ay, ly, pl);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    setFont(ctx, fm(size, 500), 1.8);
    const w = layout(ctx, text).w;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + (right ? -1 : 1) * (w + 8) * pl, ey); ctx.stroke();
    ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
    ctx.fillText(scramble(text, t, t0 + .06, .016, .1), right ? lx - w - 4 : lx + 4, ly - 7);
    ctx.restore();
  }

  // ---------------------------------------------------------------- buffers & sprites
  const BUF = {};
  function buf(name, w, h) {
    let b = BUF[name];
    if (!b || b.w !== w || b.h !== h) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      b = BUF[name] = { c, x: c.getContext('2d'), w, h };
    }
    return b;
  }
  const GLOW = [];
  function glow(h) {
    const k = Math.round(clamp(h) * 23);
    if (!GLOW[k]) {
      const s = buf('glow' + k, 128, 128), g = s.x.createRadialGradient(64, 64, 0, 64, 64, 64), c = heat(k / 23);
      g.addColorStop(0, rgba(mix(c, [255, 255, 255], .35), 1)); g.addColorStop(.18, rgba(c, .55)); g.addColorStop(1, rgba(c, 0));
      s.x.fillStyle = g; s.x.fillRect(0, 0, 128, 128);
      GLOW[k] = s.c;
    }
    return GLOW[k];
  }

  // ---------------------------------------------------------------- the mark
  // The ViralGrow mark: a V whose right arm is a growth curve, ending in a spark.
  // Same geometry as the landing page SVG (100-unit box), resampled by arc length.
  const LOGO = (() => {
    const raw = [], P0 = [14, 22], P1 = [38, 80], C1 = [52, 78], C2 = [66, 64], P2 = [76, 30];
    for (let i = 0; i <= 200; i++) { const u = i / 200; raw.push([lerp(P0[0], P1[0], u), lerp(P0[1], P1[1], u)]); }
    for (let i = 1; i <= 400; i++) {
      const u = i / 400, a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
      raw.push([a * P1[0] + b * C1[0] + c * C2[0] + d * P2[0], a * P1[1] + b * C1[1] + c * C2[1] + d * P2[1]]);
    }
    const L = [0];
    for (let i = 1; i < raw.length; i++) L.push(L[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
    const total = L[L.length - 1], N = 240, pts = [];
    let j = 0;
    for (let k = 0; k <= N; k++) {
      const s = total * k / N;
      while (j < L.length - 2 && L[j + 1] < s) j++;
      const f = (s - L[j]) / (L[j + 1] - L[j] || 1);
      pts.push([lerp(raw[j][0], raw[j + 1][0], f), lerp(raw[j][1], raw[j + 1][1], f)]);
    }
    return { pts, N, dot: [83, 13], dotR: 9.5, sw: 14, cx: 50, cy: 45 };
  })();
  const logoHeat = u => .04 + .76 * u;
  function markAt(u, x, y, s) {
    const f = clamp(u) * LOGO.N, k = Math.min(Math.floor(f), LOGO.N - 1), r = f - k;
    const a = LOGO.pts[k], b = LOGO.pts[k + 1];
    return [x + (lerp(a[0], b[0], r) - LOGO.cx) * s, y + (lerp(a[1], b[1], r) - LOGO.cy) * s];
  }
  const markDot = (x, y, s) => [x + (LOGO.dot[0] - LOGO.cx) * s, y + (LOGO.dot[1] - LOGO.cy) * s];
  // opts: p0/p1 trim, dot (scale of the spark), mono (single colour instead of heat), width (stroke multiplier)
  function drawMark(ctx, x, y, s, o = {}) {
    const p0 = o.p0 ?? 0, p1 = o.p1 ?? 1, dot = o.dot ?? 1;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = LOGO.sw * s * (o.width ?? 1);
    if (p1 > p0) {
      const steps = Math.max(2, Math.ceil((p1 - p0) * 60));
      if (o.mono) {
        ctx.strokeStyle = o.mono; ctx.beginPath();
        for (let k = 0; k <= steps * 4; k++) { const [px, py] = markAt(lerp(p0, p1, k / (steps * 4)), x, y, s); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.stroke();
      } else {
        for (let k = 0; k < steps; k++) {
          const ua = lerp(p0, p1, k / steps), ub = lerp(p0, p1, (k + 1) / steps);
          ctx.strokeStyle = heatCss(logoHeat((ua + ub) / 2));
          ctx.beginPath();
          for (let q = 0; q <= 4; q++) { const [px, py] = markAt(lerp(ua, ub, q / 4), x, y, s); q ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
          ctx.stroke();
        }
      }
    }
    if (dot > 0) {
      const [dx, dy] = markDot(x, y, s);
      ctx.fillStyle = o.dotColor || o.mono || COL.solar;
      ctx.beginPath(); ctx.arc(dx, dy, LOGO.dotR * s * dot, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // Classic metaball bridge between two circles (after the paper.js example).
  function metaball(ctx, x1, y1, r1, x2, y2, r2, v, handle, maxD) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    if (d > maxD || d <= Math.abs(r1 - r2) || d < 1e-3) return;
    let u1 = 0, u2 = 0;
    if (d < r1 + r2) {
      u1 = Math.acos(clamp((r1 * r1 + d * d - r2 * r2) / (2 * r1 * d), -1, 1));
      u2 = Math.acos(clamp((r2 * r2 + d * d - r1 * r1) / (2 * r2 * d), -1, 1));
    }
    const a1 = Math.atan2(y2 - y1, x2 - x1), a2 = Math.acos(clamp((r1 - r2) / d, -1, 1));
    const a1a = a1 + u1 + (a2 - u1) * v, a1b = a1 - u1 - (a2 - u1) * v;
    const a2a = a1 + Math.PI - u2 - (Math.PI - u2 - a2) * v, a2b = a1 - Math.PI + u2 + (Math.PI - u2 - a2) * v;
    const P = (cx, cy, a, r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    const p1a = P(x1, y1, a1a, r1), p1b = P(x1, y1, a1b, r1), p2a = P(x2, y2, a2a, r2), p2b = P(x2, y2, a2b, r2);
    let d2 = Math.min(v * handle, Math.hypot(p1a[0] - p2a[0], p1a[1] - p2a[1]) / (r1 + r2));
    d2 *= Math.min(1, d * 2 / (r1 + r2));
    const h1 = r1 * d2, h2 = r2 * d2, hp = Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(p1a[0], p1a[1]);
    ctx.bezierCurveTo(p1a[0] + Math.cos(a1a - hp) * h1, p1a[1] + Math.sin(a1a - hp) * h1, p2a[0] + Math.cos(a2a + hp) * h2, p2a[1] + Math.sin(a2a + hp) * h2, p2a[0], p2a[1]);
    ctx.lineTo(p2b[0], p2b[1]);
    ctx.bezierCurveTo(p2b[0] + Math.cos(a2b - hp) * h2, p2b[1] + Math.sin(a2b - hp) * h2, p1b[0] + Math.cos(a1b + hp) * h1, p1b[1] + Math.sin(a1b + hp) * h1, p1b[0], p1b[1]);
    ctx.closePath(); ctx.fill();
  }

  // ---------------------------------------------------------------- camera fx
  const HITS = [
    [bt(1), 6], [bt(2), 7], [bt(2.5), 4], [bt(3), 5], [SC[1], 34], [bt(5), 16], [bt(6), 7],
    [SC[2], 26], [bt(9), 12], [bt(10), 16], [bt(11), 14], [SC[3], 12], [bt(15), 7],
    [SC[4], 16], [bt(17), 7], [bt(18), 7], [bt(19), 7], [SC[5], 14], [bt(21), 5], [bt(22), 5], [bt(23), 5],
    [SC[6], 30], [bt(25), 18], [bt(26), 16], [bt(26.5), 14], [bt(27), 14], [bt(27.5), 14], [bt(27.75), 12],
    [SC[7], 38], [bt(31), 6],
  ];
  function shake(t) {
    let x = 0, y = 0, r = 0;
    for (const [h, a] of HITS) {
      const d = t - h; if (d < 0 || d > .45) continue;
      const env = a * Math.exp(-d * 13);
      x += env * noise(d * 40, h * 7); y += env * noise(d * 40, h * 7 + 3); r += env * .0009 * noise(d * 31, h * 5 + 1);
    }
    return { x, y, r };
  }
  const SPLITS = [SC[1], SC[2], bt(11), SC[3], SC[4], SC[5], SC[6], bt(25), bt(26), bt(26.5), bt(27), bt(27.5), bt(27.75), SC[7]];
  function splitAmt(t) {
    let a = 0;
    for (const h of SPLITS) { const d = t - h; if (d >= 0 && d < .25) a = Math.max(a, 14 * Math.exp(-d * 20)); }
    return a;
  }
  function flash(ctx, t, t0, c = RGB.white, a0 = .8, k = 22) {
    const d = t - t0; if (d < 0 || d > .3) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = rgba(c, a0 * Math.exp(-d * k)); ctx.fillRect(0, 0, W, H); ctx.restore();
  }

  // ================================================================ 01 + 02 IGNIÇÃO → LOGO
  // A radial "spread tree": every node divides in two, generations arrive faster and faster.
  const TREE = (() => {
    const G = 10, nodes = [{ g: 0, a0: 0, a1: TAU, x: 0, y: 0, p: -1 }];
    const T = [0, bt(1), bt(2), bt(2.5), bt(2.875), bt(3.125), bt(3.375), bt(3.56), bt(3.72), bt(3.86), SC[1] - .012];
    const R = g => g === 0 ? 0 : 66 * Math.pow(g, 1.13);
    const off = -Math.PI / 2;
    let cur = [0];
    for (let g = 1; g <= G; g++) {
      const nxt = [];
      for (const pi of cur) {
        const P = nodes[pi], span = (P.a1 - P.a0) / 2;
        for (let c = 0; c < 2; c++) {
          const a0 = P.a0 + c * span, a1 = a0 + span, id = nodes.length;
          const jit = Math.min(1, (g - 1) / 3);
          const ang = (a0 + a1) / 2 + (hash(id, 1) - .5) * span * .7 * jit + off;
          const r = R(g) * (1 + (hash(id, 2) - .5) * (g > 5 ? .55 : .3) * jit);
          nodes.push({ g, a0, a1, x: r * Math.cos(ang), y: r * Math.sin(ang), p: pi, ang });
          nxt.push(id);
        }
      }
      cur = nxt;
    }
    const first = [0]; for (let g = 1; g <= G; g++) first.push(first[g - 1] + 2 ** (g - 1));
    return { G, nodes, T, R, first };
  })();
  const nodeR = g => 30 * .79 ** g;
  const genDur = g => Math.max(.1, .34 * .78 ** g);
  const treePos = new Float32Array(TREE.nodes.length * 2);
  function treeLayout(t) {
    const N = TREE.nodes;
    for (let i = 0; i < N.length; i++) {
      const n = N[i];
      if (n.p < 0) { treePos[0] = 0; treePos[1] = 0; continue; }
      const k = E.outBack(inv(TREE.T[n.g], TREE.T[n.g] + genDur(n.g), t), 1.5);
      treePos[i * 2] = lerp(treePos[n.p * 2], n.x, k);
      treePos[i * 2 + 1] = lerp(treePos[n.p * 2 + 1], n.y, k);
    }
  }
  const genAt = t => { let g = 0; for (let k = 0; k <= TREE.G; k++) if (t >= TREE.T[k]) g = k; return g; };
  function treeZoom(t) {
    const g = genAt(t), next = Math.min(TREE.G, g + 1);
    const p = g === TREE.G ? 1 : E.outCubic(inv(TREE.T[next] - .05, TREE.T[next] + genDur(next), t));
    const rr = lerp(TREE.R(g), TREE.R(next), g === TREE.G ? 0 : p) + 40;
    return 1 / Math.max(1, rr / 360);
  }

  // Swarm → mark. Leaves sorted by angle; each flies to its slot along the stroke.
  const LEAVES = (() => {
    const g = TREE.G, f = TREE.first[g], n = 2 ** g, list = [];
    for (let i = 0; i < n; i++) list.push(f + i);
    const a0 = -2.2;
    list.sort((a, b) => ((TREE.nodes[a].ang - a0 + 10 * TAU) % TAU) - ((TREE.nodes[b].ang - a0 + 10 * TAU) % TAU));
    return list.map((id, k) => ({ id, u: k / (n - 1), off: (hash(id, 9) - .5) * .8, jt: hash(id, 4) * .03 }));
  })();
  const MARK_A = { x: 960, y: 500, s: 5.4 };
  const flyStart = l => SC[1] + .02 + l.u * .2 + l.jt;
  const FLY = .27;
  const strokeHead = t => clamp((t - (SC[1] + .02 + FLY + .015)) / .2);
  const LOCK = { s: 2.55, gap: 46, y: 470, font: fd(236, 800, 'semi-condensed'), ls: -5 };

  function S1(ctx, t) {
    bg(ctx, COL.night);
    const z = treeZoom(t), g = genAt(t);
    treeLayout(t);
    const N = TREE.nodes;
    const prog = clamp((g + E.outCubic(inv(TREE.T[g], TREE.T[g] + .2, t)) - 1) / TREE.G);

    // the dial: a 0–100° thermometer ring that fills as the post spreads
    const dial = E.outExpo(inv(.05, .9, t)), DR = 452;
    ctx.save();
    ctx.translate(960, 540);
    setFont(ctx, fm(13, 500), 1.6);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let k = 0; k < 100; k++) {
      const a = -Math.PI / 2 + k / 100 * TAU;
      if (k / 100 > dial) continue;
      const lit = k / 100 < prog, long = k % 25 === 0;
      ctx.strokeStyle = lit ? heatCss(k / 100) : rgba(RGB.paper, .16);
      ctx.lineWidth = lit ? 3 : 1.5;
      const r1 = DR, r2 = DR + (long ? 26 : lit ? 16 : 10);
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); ctx.stroke();
      if (long) { ctx.fillStyle = rgba(RGB.paper, .45); ctx.fillText(k + '°', Math.cos(a) * (DR + 50), Math.sin(a) * (DR + 50)); }
    }
    ctx.restore();

    ctx.save();
    ctx.translate(960, 540); ctx.scale(z, z);
    // edges
    ctx.lineCap = 'round';
    for (let gg = 2; gg <= g; gg++) {
      ctx.strokeStyle = heatCss(gg / TREE.G * .95, .32 + .2 * (gg < 5));
      ctx.lineWidth = Math.max(1.4, 4.5 * .85 ** gg) / z;
      ctx.beginPath();
      for (let i = TREE.first[gg]; i < TREE.first[gg] + 2 ** gg; i++) {
        const n = N[i];
        ctx.moveTo(N[n.p].x, N[n.p].y); ctx.lineTo(treePos[i * 2], treePos[i * 2 + 1]);
      }
      ctx.stroke();
    }
    // live cells (the newest generation), with a metaball neck while siblings separate
    const r = nodeR(g), col = heatCss(g / TREE.G * .95);
    ctx.fillStyle = col;
    const f = TREE.first[g], n = 2 ** g;
    if (g <= 4) {
      for (let i = f; i < f + n; i += 2) {
        const x1 = treePos[i * 2], y1 = treePos[i * 2 + 1], x2 = treePos[i * 2 + 2], y2 = treePos[i * 2 + 3];
        if (g > 0) metaball(ctx, x1, y1, r, x2, y2, r, .5, 2.4, r * 5.2);
      }
    }
    // glow
    ctx.globalCompositeOperation = 'lighter';
    const gs = glow(g / TREE.G * .95), gr = Math.max(r * 3.2, (g > 6 ? 8 : 14) / z);
    for (let i = f; i < f + n; i++) ctx.drawImage(gs, treePos[i * 2] - gr, treePos[i * 2 + 1] - gr, gr * 2, gr * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    const rr = Math.max(r, 2.2 / z);
    for (let i = f; i < f + n; i++) { ctx.moveTo(treePos[i * 2] + rr, treePos[i * 2 + 1]); ctx.arc(treePos[i * 2], treePos[i * 2 + 1], rr, 0, TAU); }
    if (g === 0) {
      // first post: breathe on the beat, ring pulse
      const br = 1 + .06 * Math.sin(t * TAU * 2) * inv(.15, .3, t);
      ctx.save(); ctx.translate(0, 0); ctx.scale(br, br); ctx.fill(); ctx.restore();
      for (const p0 of [.08, .32]) {
        const d = inv(p0, p0 + .5, t); if (d <= 0 || d >= 1) continue;
        ctx.strokeStyle = heatCss(0, 1 - d); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, r + 90 * E.outExpo(d), 0, TAU); ctx.stroke();
      }
    } else ctx.fill();
    ctx.restore();

    // labels
    callout(ctx, 960 + 34, 540 - 22, 1100, 410, '1 POST · 0 VIEWS', t, .12, bt(1) - .1, RGB.paper);
    callout(ctx, 960 - 120 * z - 20, 540, 700, 690, 'DIVISÃO CELULAR · ×2 POR GERAÇÃO', t, bt(1) + .1, bt(2) + .1, RGB.paper, true);

    // reach counter
    const views = 4 ** g;
    const roll = E.outCubic(inv(TREE.T[g], TREE.T[g] + Math.min(.12, (TREE.T[g + 1] ?? TREE.T[g] + .01) - TREE.T[g]), t));
    const shown = g === 0 ? 0 : Math.round(lerp(4 ** (g - 1), views, roll));
    const ca = E.outExpo(inv(.2, .6, t));
    ctx.save();
    ctx.globalAlpha = ca;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    setFont(ctx, fm(15, 500), 3);
    ctx.fillStyle = rgba(RGB.paper, .6);
    ctx.fillText(scramble('VIEWS', t, .2, .03, .12), 960, 905);
    setFont(ctx, fd(84, 800, 'condensed'), -1);
    ctx.fillStyle = g >= 7 ? heatCss(.6 + .4 * inv(7, 10, g)) : COL.paper;
    const s = fmtInt(shown);
    ctx.fillText(s, 960, 990);
    ctx.restore();
  }

  function S2(ctx, t) {
    const lt = t - SC[1];
    bg(ctx, COL.night);
    // phase C: push into the spark until it fills the frame
    const zp = inv(bt(7) - .2, SC[2], t);
    const zc = Math.exp(Math.log(90) * E.inExpo(zp));

    // lockup geometry
    setFont(ctx, LOCK.font, LOCK.ls);
    const WL = layout(ctx, 'ViralGrow');
    const markW = 86 * LOCK.s, total = markW + LOCK.gap + WL.w;
    const left = 960 - total / 2;
    const B = { x: left + markW / 2, y: LOCK.y, s: LOCK.s };
    const mv = E.inOutExpo(inv(bt(5.35), bt(6.1), t));
    const mx = lerp(MARK_A.x, B.x, mv), my = lerp(MARK_A.y, B.y, mv), ms = lerp(MARK_A.s, B.s, mv);
    const [dX, dY] = markDot(mx, my, ms);

    ctx.save();
    ctx.translate(dX, dY); ctx.scale(zc, zc); ctx.translate(-dX, -dY);

    // fading tree residue + burst
    if (lt < .45) {
      const z0 = treeZoom(SC[1]);
      treeLayout(SC[1]);
      ctx.save(); ctx.translate(960, 540); ctx.scale(z0 * (1 + .5 * E.outExpo(inv(0, .5, lt))), z0 * (1 + .5 * E.outExpo(inv(0, .5, lt))));
      ctx.globalAlpha = 1 - inv(0, .3, lt);
      ctx.strokeStyle = heatCss(.8, .35); ctx.lineWidth = 1.4 / z0; ctx.beginPath();
      const N = TREE.nodes;
      for (let i = 1; i < N.length; i++) { const n = N[i]; ctx.moveTo(N[n.p].x, N[n.p].y); ctx.lineTo(n.x, n.y); }
      ctx.stroke();
      ctx.restore();
      // shockwave
      const d = inv(0, .5, lt);
      ctx.strokeStyle = rgba(RGB.solar, 1 - d); ctx.lineWidth = 50 * (1 - d) + 1;
      ctx.beginPath(); ctx.arc(960, 540, 40 + 1100 * E.outExpo(d), 0, TAU); ctx.stroke();
    }

    // the stroke, drawn behind the arriving swarm
    const head = strokeHead(t);
    const dotP = E.outBack(inv(bt(5) - .02, bt(5) + .26, t), 3.2);
    drawMark(ctx, mx, my, ms, { p1: head, dot: dotP });

    // swarm
    if (lt < .6) {
      const z0 = treeZoom(SC[1]);
      treeLayout(SC[1]);
      ctx.globalCompositeOperation = 'lighter';
      const pts = [];
      for (const l of LEAVES) {
        const ts = flyStart(l), p = inv(ts, ts + FLY, t);
        if (p >= 1) continue;
        const sx = 960 + treePos[l.id * 2] * z0, sy = 540 + treePos[l.id * 2 + 1] * z0;
        const dx = sx - 960, dy = sy - 540, dl = Math.hypot(dx, dy) || 1;
        const burst = 170 * E.outExpo(inv(SC[1], SC[1] + .25, t));
        const bx = sx + dx / dl * burst * (p <= 0 ? 1 : 1), by = sy + dy / dl * burst;
        if (p <= 0) { pts.push([bx, by, .9]); continue; }
        // stroke slot, spread across the stroke width
        const [tx0, ty0] = markAt(l.u, mx, my, ms);
        const [nx0, ny0] = markAt(Math.min(1, l.u + .01), mx, my, ms);
        const tl = Math.hypot(nx0 - tx0, ny0 - ty0) || 1;
        const tx = tx0 - (ny0 - ty0) / tl * l.off * LOGO.sw * ms * .5, ty = ty0 + (nx0 - tx0) / tl * l.off * LOGO.sw * ms * .5;
        const e = E.inOutCubic(p), c1x = bx + dx / dl * 260, c1y = by + dy / dl * 260;
        const c2x = tx - (tx - 960) * .5, c2y = ty - 260;
        const u = 1 - e;
        const x = u * u * u * bx + 3 * u * u * e * c1x + 3 * u * e * e * c2x + e * e * e * tx;
        const y = u * u * u * by + 3 * u * u * e * c1y + 3 * u * e * e * c2y + e * e * e * ty;
        pts.push([x, y, lerp(.95, logoHeat(l.u), e)]);
      }
      for (const [x, y, h] of pts) { const gr = 16; ctx.drawImage(glow(h), x - gr, y - gr, gr * 2, gr * 2); }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = COL.paper;
      ctx.beginPath();
      for (const [x, y] of pts) { ctx.moveTo(x + 2.4, y); ctx.arc(x, y, 2.4, 0, TAU); }
      ctx.fill();
    }

    // spark pop: rings + sparks
    const pd = inv(bt(5), bt(5) + .6, t);
    if (pd > 0 && pd < 1) {
      ctx.strokeStyle = rgba(RGB.solar, 1 - pd); ctx.lineWidth = 16 * (1 - pd) + 1;
      ctx.beginPath(); ctx.arc(dX, dY, LOGO.dotR * ms + 260 * E.outExpo(pd), 0, TAU); ctx.stroke();
      ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * TAU + .2, r0 = LOGO.dotR * ms + 30 + 120 * E.outExpo(pd), r1 = r0 + 60 * (1 - pd);
        ctx.strokeStyle = heatCss(.6 + .4 * hash(k, 3), 1 - pd);
        ctx.beginPath(); ctx.moveTo(dX + Math.cos(a) * r0, dY + Math.sin(a) * r0); ctx.lineTo(dX + Math.cos(a) * r1, dY + Math.sin(a) * r1); ctx.stroke();
      }
    }

    // wordmark: rises out of a mask line to the right of the mark
    const wx = left + markW + LOCK.gap, base = B.y + 86;
    ctx.save();
    ctx.beginPath(); ctx.rect(wx - 20, base - 280, WL.w + 80, 340); ctx.clip();
    setFont(ctx, LOCK.font, LOCK.ls);
    ctx.fillStyle = COL.paper; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const word = 'ViralGrow';
    for (let i = 0; i < word.length; i++) {
      const st = bt(5.6) + i * .028, p = E.outExpo(inv(st, st + .5, t));
      if (p <= 0) continue;
      ctx.save();
      ctx.translate(wx + WL.xs[i], base + (1 - p) * 300);
      ctx.rotate((1 - p) * .25);
      ctx.fillText(word[i], 0, 0);
      ctx.restore();
    }
    ctx.restore();

    // tagline
    setFont(ctx, fd(50, 500, 'semi-condensed'), 0);
    const words = ['Saiba', 'se', 'vai', 'viralizar', 'antes', 'de', 'postar.'];
    const full = words.join(' '), TL = layout(ctx, full);
    let x = 960 - TL.w / 2;
    ctx.textAlign = 'left';
    words.forEach((wd, k) => {
      const ww = layout(ctx, wd).w;
      const p = E.outExpo(inv(bt(6.3) + k * .04, bt(6.3) + .5 + k * .04, t));
      if (p > 0) {
        ctx.save(); ctx.globalAlpha = p;
        ctx.fillStyle = wd === 'viralizar' ? heatGrad(ctx, x, 0, x + ww, 0, .1, 1) : COL.paper;
        ctx.fillText(wd, x, 690 + (1 - p) * 40);
        ctx.restore();
      }
      x += layout(ctx, wd + ' ').w;
    });
    ctx.restore();

    // spec labels (designer annotations)
    callout(ctx, markAt(.25, MARK_A.x, MARK_A.y, MARK_A.s)[0] - 40, markAt(.25, MARK_A.x, MARK_A.y, MARK_A.s)[1], 420, 330, 'TRIM PATH 0 → 100%', t, SC[1] + .1, bt(5.2), RGB.paper, true);
    callout(ctx, markAt(.75, MARK_A.x, MARK_A.y, MARK_A.s)[0] + 40, markAt(.75, MARK_A.x, MARK_A.y, MARK_A.s)[1] + 10, 1450, 760, 'GRADIENTE TÉRMICO AO LONGO DO TRAÇO', t, SC[1] + .25, bt(5.2), RGB.paper);
    flash(ctx, t, SC[1], RGB.solar, .5, 34);
  }

  // ================================================================ 03 TIPOGRAFIA
  function S3(ctx, t) {
    const lt = t - SC[2];
    bg(ctx, COL.solar);
    const b3 = bt(3);

    let s = 1.62, fy = 250;
    for (const [pt, ps, pf] of [[bt(1), 1.2, 400], [bt(2), .96, 552]]) {
      const k = E.outExpo(inv(pt - .03, pt + .5, lt)); s = lerp(s, ps, k); fy = lerp(fy, pf, k);
    }
    s *= 1 + .02 * lt;
    ctx.save();
    ctx.translate(960, 540); ctx.scale(s, s); ctx.translate(-960, -fy);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const F1 = fd(300, 800, 'condensed');
    const B1 = 360, B2 = 640, B3 = 920;
    const out = i => E.inExpo(inv(b3 - .06 + i * .012, b3 + .2 + i * .012, lt));

    // row 1 — masked rise, cobalt highlight with knocked-out type
    setFont(ctx, F1, -4);
    const r1 = 'SEU VÍDEO', L1 = layout(ctx, r1), x1 = 960 - L1.w / 2;
    const vx0 = x1 + L1.xs[4] - 18, vw = L1.xs[9] - L1.xs[4] + 30;
    const bar = E.outExpo(inv(.12, .5, lt));
    const fn1 = i => { const p = E.outExpo(inv(i * .03, .5 + i * .03, lt)); return { dy: (1 - p) * 330 - out(i) * 1500, rot: (1 - p) * .1 }; };
    ctx.save(); ctx.beginPath(); ctx.rect(-2000, B1 - 1800, 6000, 1860); ctx.clip();
    if (bar > 0) { ctx.fillStyle = COL.cobalt; ctx.fillRect(vx0, B1 - 238 - out(4) * 1500, vw * bar, 262); }
    ctx.fillStyle = COL.night;
    drawRow(ctx, r1, 960, B1, 110, fn1);
    if (bar > 0) {
      ctx.save(); ctx.beginPath(); ctx.rect(vx0, B1 - 238 - out(4) * 1500, vw * bar, 262); ctx.clip();
      ctx.fillStyle = COL.paper; drawRow(ctx, r1, 960, B1, 110, fn1);
      ctx.restore();
    }
    ctx.restore();

    // row 2 — outline, flips down
    const r2 = 'TEM UMA';
    ctx.strokeStyle = COL.night; ctx.lineWidth = 10; ctx.lineJoin = 'round';
    const fn2 = (i, n) => {
      const st = bt(1) - .03 + i * .03, p = inv(st, st + .45, lt);
      if (p <= 0) return null;
      return { sy: Math.max(0, E.outBack(p, 2.6)), dy: (1 - E.outExpo(p)) * -60 - out(i + 3) * 1500, dx: (i - (n - 1) / 2) * 40 * (1 - E.outExpo(p)) };
    };
    // stroke at double width, then fill with the ground: a clean outside outline, no inner contour overlaps
    drawRow(ctx, r2, 960, B2, 110, fn2, 'stroke');
    ctx.fillStyle = COL.solar; drawRow(ctx, r2, 960, B2, 110, fn2);

    // row 3 — heat-filled, pops with overshoot
    const r3 = 'TEMPERATURA', L3 = layout(ctx, r3);
    const shimmer = (lt * .35) % 1;
    const g = ctx.createLinearGradient(960 - L3.w / 2, 0, 960 + L3.w / 2, 0);
    for (let k = 0; k <= 10; k++) { const u = k / 10; g.addColorStop(u, heatCss(clamp(.02 + .8 * ((u + shimmer * .3) % 1.0001)))); }
    ctx.fillStyle = g;
    drawRow(ctx, r3, 960, B3, 110, (i) => {
      const st = bt(2) - .03 + i * .025, p = inv(st, st + .42, lt);
      if (p <= 0) return null;
      const k = E.outBack(p, 2.2);
      return { sx: k, sy: k, rot: (1 - E.outExpo(p)) * (i % 2 ? .3 : -.3), dy: -out(i + 5) * 1500 };
    });
    ctx.fillStyle = COL.night;
    setFont(ctx, fm(20, 600), 3);
    const lab = (txt, x, y, t0) => { const a = inv(t0, t0 + .1, lt) * (1 - inv(b3 - .1, b3, lt)); if (a > 0) { ctx.globalAlpha = a; ctx.fillText(scramble(txt, lt, t0, .014, .1), x, y); ctx.globalAlpha = 1; } };
    lab('BRICOLAGE GROTESQUE · 800 · WDTH 75', x1 + 4, B1 - 270, .3);
    lab('CONTORNO 5 PX', 960 - layout(ctx, 'CONTORNO 5 PX').w / 2, B2 + 50, bt(1) + .25);
    lab('PREENCHIMENTO TÉRMICO', 960 - L3.w / 2 + 4, B3 + 52, bt(2) + .25);
    ctx.restore();

    // counter: heat liquid rises, 0° → 97°
    if (lt >= b3 - .02) {
      const c = lt - b3;
      const n = Math.round(97 * E.outCubic(inv(.07, .42, c)));
      const h = n / 100, col = heat(h);
      const lvl = lerp(H + 80, -120, E.inOutCubic(inv(-.02, .1, c)));
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      const sh = shake(t); ctx.translate(sh.x, sh.y);
      ctx.fillStyle = rgba(col);
      ctx.beginPath(); ctx.moveTo(-50, H + 100);
      for (let x = -50; x <= W + 50; x += 40) ctx.lineTo(x, lvl + Math.sin(x * .008 + c * 18) * 26 * (1 - inv(0, .25, c)));
      ctx.lineTo(W + 50, H + 100); ctx.closePath(); ctx.fill();
      drawCounter(ctx, n, col, inv(.05, .09, c), c);
      ctx.restore();
    }
  }
  // the counter is shared with scene 04 so the match cut lines up exactly
  const CNT = { right: 1180, base: 760, font: fd(560, 800, 'condensed'), ringR: 56, ringW: 32 };
  CNT.ring = () => [CNT.right + CNT.ringR + 34, CNT.base - 392 + CNT.ringR];
  function drawCounter(ctx, n, col, a, c) {
    const ink = lum(col) > .55 ? COL.night : COL.paper;
    ctx.save();
    ctx.globalAlpha = a;
    setFont(ctx, CNT.font, -8);
    ctx.fillStyle = ink; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    const sc = 1 + .25 * (1 - E.outExpo(inv(0, .3, c)));
    ctx.translate(960, 540); ctx.scale(sc, sc); ctx.translate(-960, -540);
    ctx.fillText(String(n), CNT.right, CNT.base);
    const [rx, ry] = CNT.ring();
    ctx.strokeStyle = ink; ctx.lineWidth = CNT.ringW;
    ctx.beginPath(); ctx.arc(rx, ry, CNT.ringR, 0, TAU); ctx.stroke();
    setFont(ctx, fm(22, 600), 5); ctx.textAlign = 'center';
    ctx.fillText(scramble('TEMPERATURA VIRAL', c, .02, .014, .1), 960, 238);
    ctx.restore();
  }

  // ================================================================ 04 PRODUTO
  const GA = { x: 560, y: 560, r: 240, w: 46, a0: Math.PI * .75, sweep: Math.PI * 1.5 };
  const RET = [96, 94, 91, 88, 84, 82, 80, 79, 74, 70, 66, 63, 61, 64, 69, 73, 71, 66, 60, 57, 55, 58, 62, 67, 72, 78, 85];
  const HOOK = [100, 98, 97, 95, 94, 93, 91, 90, 89, 87, 86, 84];
  const BTN = { x: 1010, y: 742, w: 720, h: 104 };
  const CLICK = bt(15);
  function card(ctx, x, y, w, h, lt, st) {
    const p = E.outBack(inv(st, st + .5, lt), 1.5), a = inv(st, st + .1, lt);
    if (a <= 0) return null;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate((1 - p) * 160, 0);
    ctx.shadowColor = 'rgba(12,14,42,.14)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
    ctx.fillStyle = COL.white; rrect(ctx, x, y, w, h, 26); ctx.fill();
    ctx.shadowColor = 'transparent';
    return p;
  }
  function S4(ctx, t) {
    const lt = t - SC[3];
    bg(ctx, COL.window);
    // slow push toward the button
    const push = E.inOutCubic(inv(.6, CLICK - SC[3], lt));
    const ps = 1 + .05 * push;
    ctx.save();
    ctx.translate(BTN.x + BTN.w / 2, BTN.y + BTN.h / 2); ctx.scale(ps, ps); ctx.translate(-(BTN.x + BTN.w / 2), -(BTN.y + BTN.h / 2));

    // app window
    const wa = E.outExpo(inv(0, .35, lt));
    ctx.save();
    ctx.globalAlpha = wa;
    ctx.translate(960, 540); ctx.scale(lerp(.94, 1, wa), lerp(.94, 1, wa)); ctx.translate(-960, -540);
    ctx.shadowColor = 'rgba(12,14,42,.18)'; ctx.shadowBlur = 80; ctx.shadowOffsetY = 30;
    ctx.fillStyle = COL.paper; rrect(ctx, 130, 130, 1660, 830, 34); ctx.fill();
    ctx.shadowColor = 'transparent';
    // header
    drawMark(ctx, 196, 186, .36, {});
    setFont(ctx, fd(30, 800, 'semi-condensed'), -.5); ctx.fillStyle = COL.night; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('ViralGrow', 232, 188);
    setFont(ctx, fm(16, 500), 1.4); ctx.fillStyle = COL.muted;
    ctx.fillText('ANÁLISE  /  rascunho_final_v3.mp4', 400, 189);
    const chip = (txt, xr, fill, ink) => {
      setFont(ctx, fm(15, 600), 1.2); const w = layout(ctx, txt).w + 32;
      ctx.fillStyle = fill; rrect(ctx, xr - w, 168, w, 40, 20); ctx.fill();
      ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.fillText(txt, xr - w + 16, 189); return w;
    };
    const w1 = chip('0:27 · 9:16', 1730, COL.surface2, COL.night);
    chip('LIDO EM 20 S', 1730 - w1 - 12, rgba(mix(RGB.flame, RGB.white, .82)), rgba(mix(RGB.flame, RGB.night, .25)));
    ctx.fillStyle = rgba(RGB.night, .08); ctx.fillRect(130, 236, 1660, 2);
    ctx.restore();

    // gauge — grows out of the ° ring from scene 03
    const m = E.outExpo(inv(0, .42, lt));
    const [rx, ry] = CNT.ring();
    const gx = lerp(rx, GA.x, m), gy = lerp(ry, GA.y, m), gr = lerp(CNT.ringR, GA.r, m), gw = lerp(CNT.ringW, GA.w, m);
    const startA = lerp(-Math.PI / 2, GA.a0, m), arcLen = lerp(TAU, GA.sweep, m);
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(mix(RGB.night, RGB.surface2, inv(.05, .35, lt)));
    ctx.lineWidth = gw;
    ctx.beginPath(); ctx.arc(gx, gy, gr, startA, startA + arcLen); ctx.stroke();
    const val = .97 * E.outQuart(inv(.18, .8, lt));
    const segs = 90;
    for (let k = 0; k < segs; k++) {
      const u0 = k / segs, u1 = (k + 1) / segs;
      if (u0 >= val) break;
      ctx.strokeStyle = heatCss(u0 * 1.02);
      ctx.lineCap = k === 0 ? 'round' : 'butt';
      ctx.beginPath(); ctx.arc(gx, gy, gr, startA + arcLen * u0, startA + arcLen * Math.min(u1 + .004, val)); ctx.stroke();
    }
    if (val > 0) {
      const ea = startA + arcLen * val;
      ctx.fillStyle = COL.white; ctx.beginPath(); ctx.arc(gx + Math.cos(ea) * gr, gy + Math.sin(ea) * gr, gw * .36, 0, TAU); ctx.fill();
      ctx.fillStyle = heatCss(val); ctx.beginPath(); ctx.arc(gx + Math.cos(ea) * gr, gy + Math.sin(ea) * gr, gw * .2, 0, TAU); ctx.fill();
    }
    // ticks
    const ta = inv(.25, .5, lt);
    if (ta > 0) {
      ctx.strokeStyle = rgba(RGB.muted, .5 * ta); ctx.lineWidth = 2;
      setFont(ctx, fm(15, 500), 1); ctx.fillStyle = rgba(RGB.muted, ta); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let d = 0; d <= 100; d += 5) {
        const a = GA.a0 + GA.sweep * d / 100, r1 = GA.r + 40, r2 = r1 + (d % 25 ? 8 : 16);
        ctx.beginPath(); ctx.moveTo(GA.x + Math.cos(a) * r1, GA.y + Math.sin(a) * r1); ctx.lineTo(GA.x + Math.cos(a) * r2, GA.y + Math.sin(a) * r2); ctx.stroke();
        if (d % 25 === 0) ctx.fillText(d + '°', GA.x + Math.cos(a) * (r2 + 26), GA.y + Math.sin(a) * (r2 + 26));
      }
    }
    // the number travels from the counter into the gauge
    ctx.save();
    const nx = lerp(CNT.right, GA.x + 92, m), nb = lerp(CNT.base, GA.y + 54, m), ns = lerp(1, .4, m);
    ctx.translate(nx, nb); ctx.scale(ns, ns);
    setFont(ctx, CNT.font, -8); ctx.fillStyle = COL.night; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('97', 0, 0);
    ctx.restore();
    ctx.save();
    const ra = inv(.2, .4, lt);
    ctx.globalAlpha = ra;
    ctx.strokeStyle = COL.night; ctx.lineWidth = 13;
    ctx.beginPath(); ctx.arc(GA.x + 118, GA.y - 100, 22, 0, TAU); ctx.stroke();
    setFont(ctx, fm(20, 600), 6); ctx.fillStyle = COL.flame; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(scramble('VIRAL', lt, .3, .03, .1), GA.x, GA.y + 112);
    setFont(ctx, fd(32, 500, 'semi-condensed'), 0); ctx.fillStyle = COL.muted;
    ctx.fillText('Poste hoje às 19:42', GA.x, GA.y + 158);
    ctx.restore();

    // right column cards
    const CX = 1010, CW = 720;
    let p;
    if ((p = card(ctx, CX, 270, CW, 170, lt, .16)) != null) {
      setFont(ctx, fm(16, 600), 2.4); ctx.fillStyle = COL.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('GANCHO · 0–3 S', CX + 32, 312);
      setFont(ctx, fd(76, 800, 'condensed'), -1); ctx.fillStyle = COL.night; ctx.textAlign = 'right';
      ctx.fillText(Math.round(96 * E.outCubic(inv(.2, .7, lt))) + '°', CX + CW - 32, 340);
      const bw = 38, bg0 = 10;
      HOOK.forEach((v, k) => {
        const hp = E.outBack(inv(.3 + k * .025, .6 + k * .025, lt), 2);
        const h = (v - 70) * 2.6 * hp;
        ctx.fillStyle = heatCss(k / 11 * .95 + .05);
        rrect(ctx, CX + 32 + k * (bw + bg0), 412 - h, bw, Math.max(1, h), 6); ctx.fill();
      });
      ctx.restore();
    }
    if ((p = card(ctx, CX, 460, CW, 136, lt, .28)) != null) {
      setFont(ctx, fm(16, 600), 2.4); ctx.fillStyle = COL.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('MAPA DE RETENÇÃO', CX + 32, 502);
      ctx.textAlign = 'right'; ctx.fillText('0:00 → 0:27', CX + CW - 32, 502);
      const cw = (CW - 64 - 26 * 4) / 27;
      RET.forEach((v, k) => {
        const a = inv(.36 + k * .012, .44 + k * .012, lt);
        if (a <= 0) return;
        ctx.fillStyle = heatCss((v - 50) / 50, a);
        rrect(ctx, CX + 32 + k * (cw + 4), 524, cw, 46, 5); ctx.fill();
      });
      const ph = CX + 32 + (CW - 64) * clamp((lt - .5) / 1.1);
      if (lt > .5) { ctx.fillStyle = COL.night; ctx.fillRect(ph - 1.5, 516, 3, 62); ctx.beginPath(); ctx.arc(ph, 514, 6, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    if ((p = card(ctx, CX, 616, CW, 106, lt, .4)) != null) {
      setFont(ctx, fm(16, 600), 2.4); ctx.fillStyle = COL.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('ÁUDIO EM ALTA', CX + 32, 656);
      setFont(ctx, fd(30, 600, 'semi-condensed'), 0); ctx.fillStyle = COL.night;
      ctx.fillText('Batida lo-fi “café 7am”', CX + 32, 696);
      setFont(ctx, fm(24, 600), 0); ctx.fillStyle = COL.flame; ctx.textAlign = 'right';
      ctx.fillText('↑ 212%', CX + CW - 32, 690);
      for (let k = 0; k < 6; k++) {
        const h = 10 + 26 * Math.abs(Math.sin(lt * 9 + k * 1.7)) * inv(.45, .6, lt);
        ctx.fillStyle = heatCss(.6 + k * .07);
        rrect(ctx, CX + CW - 250 + k * 14, 690 - h, 8, h, 3); ctx.fill();
      }
      ctx.restore();
    }
    // button
    const ba = inv(.55, .65, lt);
    if (ba > 0) {
      const bp = E.outBack(inv(.55, 1.0, lt), 1.6);
      const press = lt >= CLICK - SC[3] ? 1 - .06 * Math.sin(Math.PI * inv(CLICK - SC[3], CLICK - SC[3] + .14, lt)) : 1;
      const done = lt >= CLICK - SC[3] + .05;
      ctx.save();
      ctx.globalAlpha = ba;
      ctx.translate(BTN.x + BTN.w / 2, BTN.y + BTN.h / 2); ctx.scale(press * lerp(.9, 1, bp), press * lerp(.9, 1, bp)); ctx.translate(-(BTN.x + BTN.w / 2), -(BTN.y + BTN.h / 2));
      ctx.fillStyle = done ? COL.solar : COL.cobalt;
      rrect(ctx, BTN.x, BTN.y, BTN.w, BTN.h, 52); ctx.fill();
      setFont(ctx, fd(36, 700, 'semi-condensed'), 0); ctx.fillStyle = done ? COL.night : COL.white; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(done ? '✓ Agendado para 19:42' : 'Agendar para hoje, 19:42  →', BTN.x + BTN.w / 2, BTN.y + BTN.h / 2 + 2);
      ctx.restore();
    }
    // annotations
    callout(ctx, GA.x - GA.r - 26, GA.y + 90, 250, 880, 'ARCO 270° · EASE OUT QUART', t, SC[3] + .45, CLICK + .12, RGB.night, false);
    callout(ctx, BTN.x + 30, BTN.y + BTN.h, 920, 900, 'SPRING · STAGGER 120 MS', t, SC[3] + .6, CLICK + .12, RGB.night, true);
    ctx.restore();

    // cursor
    const cx0 = 1560, cy0 = 1060, cx1 = BTN.x + BTN.w * .62, cy1 = BTN.y + BTN.h * .58;
    const cm = E.inOutCubic(inv(.72, CLICK - SC[3] - .05, lt));
    if (lt > .72) {
      const cx = lerp(cx0, cx1, cm) + (1 - cm) * 60 * Math.sin(cm * Math.PI), cy = lerp(cy0, cy1, cm);
      const cs = 1.4 * (lt >= CLICK - SC[3] && lt < CLICK - SC[3] + .12 ? .85 : 1);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(cs, cs);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 34); ctx.lineTo(9, 26); ctx.lineTo(15, 40); ctx.lineTo(21, 37); ctx.lineTo(15, 24); ctx.lineTo(27, 24); ctx.closePath();
      ctx.fillStyle = COL.night; ctx.fill(); ctx.strokeStyle = COL.white; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.restore();
    }
    // click: confetti, then a night ripple that becomes scene 05
    const cd = lt - (CLICK - SC[3]);
    if (cd > 0) {
      const ox = cx1, oy = cy1;
      for (let k = 0; k < 28; k++) {
        const a = hash(k, 7) * TAU, sp = 300 + 600 * hash(k, 8), p = clamp(cd / .5);
        const x = ox + Math.cos(a) * sp * E.outCubic(p), y = oy + Math.sin(a) * sp * E.outCubic(p) + 300 * p * p;
        ctx.fillStyle = heatCss(.4 + .6 * hash(k, 9), 1 - p);
        ctx.save(); ctx.translate(x, y); ctx.rotate(p * 8 * (hash(k, 3) - .5)); ctx.fillRect(-7, -4, 14, 8); ctx.restore();
      }
      const rr = 2400 * E.inOutExpo(inv(.06, SC[4] - CLICK, cd));
      if (rr > 0) { ctx.fillStyle = COL.night; ctx.beginPath(); ctx.arc(ox, oy, rr, 0, TAU); ctx.fill(); }
      const ra = inv(0, .4, cd);
      ctx.strokeStyle = rgba(RGB.cobalt, 1 - ra); ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(ox, oy, 20 + 160 * E.outExpo(ra), 0, TAU); ctx.stroke();
    }
  }

  // ================================================================ 05 DADOS
  const CH = { x0: 250, x1: 1540, yb: 880, yt: 250 };
  const vLog = lt => 3 + 4 * clamp(lt / BAR);
  const tipX = lt => CH.x0 + (CH.x1 - CH.x0) * clamp(lt / BAR);
  const ymaxLog = lt => 4 + [1, 2, 3].reduce((s, n) => s + E.outExpo(inv(bt(n) - .02, bt(n) + .3, lt)), 0);
  const yOf = (v, ym) => CH.yb - (v / ym) * (CH.yb - CH.yt);
  function fmtAxis(v) {
    if (v >= 1e6) return (v / 1e6).toFixed(v % 1e6 ? 1 : 0).replace('.', ',') + ' mi';
    if (v >= 1e3) return (v / 1e3).toFixed(v % 1e3 ? 1 : 0).replace('.', ',') + ' mil';
    return String(v);
  }
  function S5(ctx, t) {
    const lt = t - SC[4];
    bg(ctx, COL.night);
    const ym = 10 ** ymaxLog(lt), lv = vLog(lt), v = 10 ** lv, tx = tipX(lt), ty = yOf(v, ym);
    // exit: zoom into the tip; the tip lands on screen centre for the globe
    const zp = inv(BAR - .3, BAR, lt), zz = Math.exp(Math.log(9) * E.inExpo(zp)), ze = E.inOutCubic(zp);
    ctx.save();
    ctx.translate(lerp(tx, 960, ze), lerp(ty, 540, ze)); ctx.scale(zz, zz); ctx.translate(-tx, -ty);

    // heading
    const ha = E.outExpo(inv(0, .4, lt));
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    setFont(ctx, fm(16, 600), 3); ctx.fillStyle = rgba(RGB.mutedD, ha);
    ctx.fillText(scramble('VIEWS · PRIMEIROS 30 DIAS', lt, .02, .012, .1), CH.x0, 156);
    ctx.save(); ctx.beginPath(); ctx.rect(CH.x0 - 10, 160, 1200, 90); ctx.clip();
    setFont(ctx, fd(78, 800, 'condensed'), -1); ctx.fillStyle = COL.paper;
    ctx.fillText('Do rascunho ao milhão.', CH.x0, 236 + (1 - ha) * 90);
    ctx.restore();

    // grid: every decade fades in from above and slides away as the axis grows
    const ga = E.outExpo(inv(0, .3, lt));
    setFont(ctx, fm(16, 500), 1); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let k = 3; k <= 7; k++) for (const f of [.25, .5, .75, 1]) {
      const val = f * 10 ** k, r = val / ym;
      if (r > 1.25 || r < .02) continue;
      const a = ga * clamp((r - .02) / .12) * clamp((1.25 - r) / .25);
      const y = yOf(val, ym);
      ctx.fillStyle = rgba(RGB.paper, .07 * a); ctx.fillRect(CH.x0, y - .75, CH.x1 - CH.x0 + 40, 1.5);
      ctx.fillStyle = rgba(RGB.mutedD, .8 * a); ctx.fillText(fmtAxis(val), CH.x0 - 18, y);
    }
    ctx.fillStyle = rgba(RGB.paper, .4 * ga); ctx.fillRect(CH.x0, CH.yb - 1, (CH.x1 - CH.x0 + 40) * ga, 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = rgba(RGB.mutedD, .8 * ga);
    for (const d of [1, 5, 10, 15, 20, 25, 30]) ctx.fillText('D' + d, CH.x0 + (CH.x1 - CH.x0) * (d - 1) / 29, CH.yb + 18);
    ctx.fillStyle = rgba(RGB.paper, .4 * ga); ctx.fillText('0', CH.x0 - 26, CH.yb - 8);

    // curve + area
    const n = 220, pts = [];
    for (let k = 0; k <= n; k++) {
      const q = k / n * clamp(lt / BAR);
      pts.push([CH.x0 + (CH.x1 - CH.x0) * q, yOf(10 ** (3 + 4 * q), ym)]);
    }
    const area = ctx.createLinearGradient(0, CH.yt, 0, CH.yb);
    area.addColorStop(0, heatCss(.55, .32)); area.addColorStop(1, heatCss(.2, 0));
    ctx.fillStyle = area;
    ctx.beginPath(); ctx.moveTo(CH.x0, CH.yb);
    for (const [x, y] of pts) ctx.lineTo(x, Math.max(y, CH.yt - 400));
    ctx.lineTo(tx, CH.yb); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = heatGrad(ctx, CH.x0, 0, CH.x1, 0); ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();

    // pins anchored to data points
    const pin = (lt0, label, right) => {
      const q = clamp(lt0 / BAR), px = CH.x0 + (CH.x1 - CH.x0) * q, py = yOf(10 ** (3 + 4 * q), ym);
      callout(ctx, px, py, px + (right ? -40 : 40), py - 110, label, lt, lt0 + .02, BAR + 1, RGB.paper, right, 16);
    };
    pin(.03, 'POSTADO ÀS 19:42', false);
    pin(.98, 'ENTROU NO PARA VOCÊ', true);
    pin(1.42, '1 MILHÃO', true);

    // ×10 stamps on each rescale
    for (const nn of [1, 2, 3]) {
      const d = lt - bt(nn); if (d < -.02 || d > .4) continue;
      const a = inv(-.02, .03, d) * (1 - inv(.25, .4, d)), s = 1 + .5 * (1 - E.outBack(inv(-.02, .2, d), 3));
      ctx.save(); ctx.globalAlpha = a;
      ctx.translate(CH.x0 + 110, CH.yt + 110); ctx.scale(s, s);
      setFont(ctx, fd(110, 800, 'condensed'), -2); ctx.fillStyle = COL.solar; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('×10', 0, 0);
      ctx.restore();
    }

    // tip
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glow(lerp(.6, 1, clamp(lt / BAR))), tx - 70, ty - 70, 140, 140);
    ctx.globalCompositeOperation = 'source-over';
    for (let nn = 0; nn < 4; nn++) {
      const d = inv(bt(nn), bt(nn) + .45, lt); if (d <= 0 || d >= 1) continue;
      ctx.strokeStyle = rgba(RGB.solar, 1 - d); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(tx, ty, 14 + 60 * E.outExpo(d), 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = COL.solar; ctx.beginPath(); ctx.arc(tx, ty, 13, 0, TAU); ctx.fill();
    ctx.fillStyle = COL.night; ctx.beginPath(); ctx.arc(tx, ty, 5, 0, TAU); ctx.fill();
    // readout bubble
    const ra = inv(.05, .2, lt) * (1 - inv(BAR - .3, BAR - .2, lt));
    if (ra > 0) {
      ctx.save(); ctx.globalAlpha = ra;
      const label = fmtInt(v);
      setFont(ctx, fd(50, 800, 'condensed'), 0);
      const lw = layout(ctx, label).w;
      const bx = tx - 34 - lw - 40, by = Math.max(ty - 120, 40);
      ctx.fillStyle = COL.paper; rrect(ctx, bx, by, lw + 40 + 92, 76, 38); ctx.fill();
      ctx.fillStyle = COL.night; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + 22, by + 41);
      setFont(ctx, fm(16, 600), 1.6); ctx.fillStyle = COL.muted;
      ctx.fillText('VIEWS', bx + 32 + lw, by + 40);
      ctx.restore();
    }
    ctx.restore();
  }

  // ================================================================ 06 GLOBO
  const D2R = Math.PI / 180;
  const LAND = [
    [-10, -55, 15], [-25, -60, 10], [-38, -67, 6], [-48, -70, 4], [5, -65, 8], [-5, -76, 6], [-15, -45, 8],
    [45, -100, 15], [57, -110, 13], [35, -90, 9], [50, -78, 10], [65, -150, 8], [66, -120, 10], [20, -101, 7], [14, -88, 4], [30, -82, 4], [60, -95, 8],
    [72, -42, 9], [64, -18, 3],
    [50, 10, 8], [46, 2, 5], [61, 15, 7], [40, -4, 5], [42, 13, 4], [54, -2, 3], [52, 30, 9], [64, 28, 6],
    [12, 18, 13], [2, 22, 11], [-14, 26, 10], [-27, 25, 7], [25, 12, 12], [9, -6, 8], [7, 40, 7], [-19, 47, 4], [28, 30, 7],
    [26, 46, 9], [33, 55, 7],
    [56, 90, 20], [62, 130, 14], [35, 105, 12], [22, 79, 8], [15, 102, 6], [37, 138, 4], [43, 143, 3], [67, 70, 11], [48, 70, 10], [40, 90, 9], [30, 72, 5], [65, 160, 9],
    [-1, 113, 6], [-4, 138, 5], [12, 122, 3], [-7, 107, 3],
    [-24, 134, 12], [-33, 146, 5], [-17, 128, 6], [-42, 172, 3],
  ];
  const isLand = (lat, lon) => {
    for (const [a, b, r] of LAND) {
      const d = Math.acos(clamp(Math.sin(lat * D2R) * Math.sin(a * D2R) + Math.cos(lat * D2R) * Math.cos(a * D2R) * Math.cos((lon - b) * D2R), -1, 1)) / D2R;
      if (d < r * (1 + .25 * (hash(Math.round(lat * 7 + lon * 3), 5) - .5))) return true;
    }
    return false;
  };
  const vec = (lat, lon) => [Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R), Math.cos(lat * D2R) * Math.cos(lon * D2R)];
  const GLOBE = (() => {
    const pts = [], N = 16000, ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i + .5) / N * 2, r = Math.sqrt(1 - y * y), th = ga * i;
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      const lat = Math.asin(y) / D2R, lon = Math.atan2(x, z) / D2R;
      if (isLand(lat, lon)) pts.push({ v: [x, y, z], lat, lon });
    }
    return pts;
  })();
  const CITY = {
    sp: ['SÃO PAULO', -23.5, -46.6], nyc: ['NOVA YORK', 40.7, -74.0], lis: ['LISBOA', 38.7, -9.1], lag: ['LAGOS', 6.5, 3.4],
    lon: ['LONDRES', 51.5, -.1], mex: ['CIDADE DO MÉXICO', 19.4, -99.1], dxb: ['DUBAI', 25.2, 55.3], bom: ['MUMBAI', 19.1, 72.9],
    tyo: ['TÓQUIO', 35.7, 139.7], jkt: ['JACARTA', -6.2, 106.8], syd: ['SYDNEY', -33.9, 151.2], lax: ['LOS ANGELES', 34, -118.2],
  };
  for (const k in CITY) CITY[k].v = vec(CITY[k][1], CITY[k][2]);
  const angD = (a, b) => Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));
  const SPREAD = 2.4; // radians per second of ground spread
  const ARCS = (() => {
    const at = { sp: .08 }, list = [];
    for (const [f, to, l] of [['sp', 'nyc', .2], ['sp', 'lis', .26], ['sp', 'lag', .34], ['sp', 'mex', .42], ['nyc', 'lax', .62], ['lis', 'lon', .66], ['lis', 'dxb', .7], ['dxb', 'bom', .98], ['bom', 'tyo', 1.12], ['bom', 'jkt', 1.08], ['jkt', 'syd', 1.3]]) {
      const d = angD(CITY[f].v, CITY[to].v), t0 = Math.max(l, at[f] + .02), dur = .2 + .14 * d;
      list.push({ f, to, t0, dur, d });
      at[to] = Math.min(at[to] ?? 99, t0 + dur);
    }
    return { list, at };
  })();
  for (const p of GLOBE) { let tl = 99; for (const k in ARCS.at) tl = Math.min(tl, ARCS.at[k] + angD(p.v, CITY[k].v) / SPREAD); p.tl = tl; }
  const COUNTRIES = 94;
  function globeView(lt) {
    const r = E.inOutCubic(inv(.15, BAR, lt));
    return { lon: lerp(-46.6, 52, r), lat: lerp(-23.5, 18, r) };
  }
  function project(v, view) {
    const lo = view.lon * D2R, la = view.lat * D2R;
    const x = v[0] * Math.cos(lo) - v[2] * Math.sin(lo), z0 = v[0] * Math.sin(lo) + v[2] * Math.cos(lo);
    const y = v[1] * Math.cos(la) - z0 * Math.sin(la), z = v[1] * Math.sin(la) + z0 * Math.cos(la);
    return [x, -y, z];
  }
  const slerp = (a, b, u, d) => {
    if (d < 1e-4) return a;
    const s = Math.sin(d), k1 = Math.sin((1 - u) * d) / s, k2 = Math.sin(u * d) / s;
    return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
  };
  function S6(ctx, t) {
    const lt = t - SC[5];
    bg(ctx, COL.deep);
    const view = globeView(lt), R = 350, GC = [1130, 560];
    const e = E.outExpo(inv(0, .75, lt)), z = lerp(7, 1, e);
    const sp = project(CITY.sp.v, view);
    const ox = (1 - e) * (960 - (GC[0] + R * z * sp[0])), oy = (1 - e) * (540 - (GC[1] + R * z * sp[1]));
    const S = (p) => [GC[0] + ox + R * z * p[0], GC[1] + oy + R * z * p[1]];
    const boom = E.inExpo(inv(BAR - .32, BAR, lt));
    const ex = 1 + 2.6 * boom;

    // atmosphere + disc
    const [cx, cy] = S([0, 0, 0]);
    const atm = ctx.createRadialGradient(cx, cy, R * z * .9, cx, cy, R * z * 1.35);
    atm.addColorStop(0, rgba(RGB.cobalt, .28 * (1 - boom))); atm.addColorStop(1, rgba(RGB.cobalt, 0));
    ctx.fillStyle = atm; ctx.beginPath(); ctx.arc(cx, cy, R * z * 1.35, 0, TAU); ctx.fill();
    const disc = ctx.createRadialGradient(cx - R * z * .3, cy - R * z * .35, 0, cx, cy, R * z);
    disc.addColorStop(0, rgba(mix(RGB.night, RGB.cobalt, .22), 1 - boom)); disc.addColorStop(1, rgba(RGB.night, 1 - boom));
    ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(cx, cy, R * z, 0, TAU); ctx.fill();

    // graticule
    ctx.strokeStyle = rgba(RGB.paper, .07 * (1 - boom)); ctx.lineWidth = 1;
    for (let lon = -180; lon < 180; lon += 30) {
      ctx.beginPath(); let pen = false;
      for (let lat = -90; lat <= 90; lat += 5) { const p = project(vec(lat, lon), view); if (p[2] < 0) { pen = false; continue; } const [x, y] = S(p); pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; }
      ctx.stroke();
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath(); let pen = false;
      for (let lon = -180; lon <= 180; lon += 5) { const p = project(vec(lat, lon), view); if (p[2] < 0) { pen = false; continue; } const [x, y] = S(p); pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; }
      ctx.stroke();
    }

    // land dots, bucketed by colour state
    const buckets = new Map();
    const push = (key, x, y, r) => { let b = buckets.get(key); if (!b) buckets.set(key, b = []); b.push(x, y, r); };
    let lit = 0;
    for (const p of GLOBE) {
      const q = project(p.v, view);
      const age = lt - p.tl;
      if (age >= 0) lit++;
      if (q[2] < -.05 && boom === 0) continue;
      const qq = [q[0] * ex, q[1] * ex];
      const [x, y] = S(qq);
      if (x < -50 || x > W + 50 || y < -50 || y > H + 50) continue;
      const limb = clamp(.35 + .65 * q[2]);
      const base = 2.3 * Math.sqrt(z) * (1 + boom * 2);
      if (age < 0) push('d' + Math.round(limb * 4), x, y, base * .8);
      else {
        const h = 1 - .72 * clamp(age / .9);
        push('h' + Math.round(h * 16) + '_' + Math.round(limb * 3), x, y, base * (1 + 1.3 * Math.exp(-age * 9)));
      }
    }
    for (const [key, arr] of buckets) {
      if (key[0] === 'd') ctx.fillStyle = rgba(mix(RGB.cobalt, RGB.paper, .25), .16 + .2 * (+key.slice(1) / 4));
      else { const [hh, ll] = key.slice(1).split('_').map(Number); ctx.fillStyle = heatCss(hh / 16, (.45 + .55 * ll / 3) * (1 - boom * .3)); }
      ctx.beginPath();
      for (let i = 0; i < arr.length; i += 3) { ctx.moveTo(arr[i] + arr[i + 2], arr[i + 1]); ctx.arc(arr[i], arr[i + 1], arr[i + 2], 0, TAU); }
      ctx.fill();
    }

    // arcs between cities
    if (boom < 1) for (const A of ARCS.list) {
      const u = inv(A.t0, A.t0 + A.dur, lt), fade = 1 - inv(A.t0 + A.dur, A.t0 + A.dur + .35, lt);
      if (u <= 0 || fade <= 0) continue;
      const a = CITY[A.f].v, b = CITY[A.to].v, lift = .1 + .22 * A.d / Math.PI;
      const tail = Math.max(0, u - .45), steps = 28;
      ctx.lineCap = 'round';
      let prev = null;
      for (let k = 0; k <= steps; k++) {
        const uu = lerp(tail, u, k / steps), m = slerp(a, b, uu, A.d), h = 1 + lift * Math.sin(Math.PI * uu);
        const q = project([m[0] * h, m[1] * h, m[2] * h], view);
        const vis = q[2] > -.02 || Math.hypot(q[0], q[1]) > 1;
        const pt = S(q);
        if (prev && vis) {
          ctx.strokeStyle = heatCss(.45 + .55 * k / steps, fade * (k / steps));
          ctx.lineWidth = 1.5 + 3 * k / steps;
          ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(pt[0], pt[1]); ctx.stroke();
        }
        prev = vis ? pt : null;
      }
      if (u < 1 && prev) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow(1), prev[0] - 22, prev[1] - 22, 44, 44); ctx.globalCompositeOperation = 'source-over'; }
    }
    // landing rings
    for (const k in ARCS.at) {
      const d = inv(ARCS.at[k], ARCS.at[k] + .6, lt); if (d <= 0 || d >= 1) continue;
      const q = project(CITY[k].v, view); if (q[2] < 0) continue;
      const [x, y] = S([q[0] * ex, q[1] * ex]);
      ctx.strokeStyle = rgba(RGB.solar, 1 - d); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(x, y, (8 + 50 * E.outExpo(d)) * Math.sqrt(z), (8 + 50 * E.outExpo(d)) * Math.sqrt(z) * (.35 + .65 * q[2]), 0, 0, TAU); ctx.stroke();
    }
    // city labels
    if (boom === 0) for (const [k, txt, hrs] of [['sp', 'SÃO PAULO', '0 H'], ['nyc', 'NOVA YORK', '+2 H'], ['lis', 'LISBOA', '+3 H'], ['dxb', 'DUBAI', '+7 H'], ['tyo', 'TÓQUIO', '+11 H']]) {
      const q = project(CITY[k].v, view); if (q[2] < .15) continue;
      const [x, y] = S(q), dx = x - cx, dy = y - cy, dl = Math.hypot(dx, dy) || 1;
      const right = dx < 0;
      callout(ctx, x, y, x + dx / dl * 70 + (right ? -30 : 30), y + dy / dl * 70 - 50, `${txt}  ${hrs}`, lt, ARCS.at[k] + .02, BAR - .35, RGB.paper, right, 15);
    }

    // the chart's tip, carried over the cut and shrinking onto São Paulo
    const ca = 1 - inv(.1, .4, lt);
    if (ca > 0) {
      const [px, py] = S(sp), k = lerp(9, 1, E.outExpo(inv(0, .5, lt)));
      ctx.save(); ctx.globalAlpha = ca;
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow(1), px - 70 * k, py - 70 * k, 140 * k, 140 * k); ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = COL.solar; ctx.beginPath(); ctx.arc(px, py, 13 * k, 0, TAU); ctx.fill();
      ctx.fillStyle = COL.night; ctx.beginPath(); ctx.arc(px, py, 5 * k * (1 - inv(0, .25, lt)), 0, TAU); ctx.fill();
      ctx.restore();
    }

    // stats column
    const sa = E.outExpo(inv(.15, .55, lt)) * (1 - boom);
    if (sa > 0) {
      ctx.save(); ctx.globalAlpha = sa; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      const frac = lit / GLOBE.length;
      setFont(ctx, fm(16, 600), 3); ctx.fillStyle = rgba(RGB.mutedD);
      ctx.fillText(scramble('PAÍSES ALCANÇADOS', lt, .15, .012, .1), 150, 330);
      setFont(ctx, fd(190, 800, 'condensed'), -3); ctx.fillStyle = COL.paper;
      ctx.fillText(String(Math.max(1, Math.round(COUNTRIES * Math.min(1, frac * 1.06)))), 142, 500 + (1 - sa) * 40);
      setFont(ctx, fm(16, 600), 3); ctx.fillStyle = rgba(RGB.mutedD);
      ctx.fillText(scramble('VIEWS EM 24 H', lt, .25, .012, .1), 150, 600);
      setFont(ctx, fd(96, 800, 'condensed'), -1); ctx.fillStyle = heatGrad(ctx, 150, 0, 520, 0, .45, 1);
      ctx.fillText((12.8 * frac).toFixed(1).replace('.', ',') + ' mi', 146, 700);
      ctx.restore();
    }
    flash(ctx, t, SC[6] - .04, RGB.solar, .0);
  }

  // ================================================================ 07 RITMO
  const CUTS = [[SC[6], bt(2)], [bt(26), bt(1)], [bt(26.5), bt(.5)], [bt(27), bt(.5)], [bt(27.5), bt(.25)], [bt(27.75), bt(.25)]];
  // 6 cuts: 0.94 s, 0.47, 0.23, 0.23, 0.12, 0.12 — accelerating into the end card
  function bigStat(ctx, txt, u, fill, x, base, size, mode) {
    setFont(ctx, fd(size, 800, 'condensed'), -size * .02);
    ctx.fillStyle = fill; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    drawRow(ctx, txt, x, base, size * .36, (i, n) => {
      const p = inv(i * .018, .22 + i * .018, u);
      if (p <= 0) return null;
      if (mode === 'slam') { const k = E.outBack(p, 2.4); return { sx: lerp(2.4, 1, E.outExpo(p)), sy: lerp(2.4, 1, E.outExpo(p)) * k, alpha: clamp(p * 4) }; }
      if (mode === 'whip') { const k = E.outExpo(p); return { dx: (1 - k) * 900, skew: -(1 - k) * .8 }; }
      if (mode === 'drop') { const k = E.outBack(p, 1.8); return { dy: (1 - k) * -400, rot: (1 - E.outExpo(p)) * (i % 2 ? .5 : -.5) }; }
      return {};
    });
  }
  function heart(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 100, s / 100);
    ctx.beginPath(); ctx.moveTo(0, 35);
    ctx.bezierCurveTo(-55, -5, -60, -55, -28, -62); ctx.bezierCurveTo(-12, -66, -2, -55, 0, -42);
    ctx.bezierCurveTo(2, -55, 12, -66, 28, -62); ctx.bezierCurveTo(60, -55, 55, -5, 0, 35);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function S7(ctx, t) {
    let c = 0; for (let i = 0; i < CUTS.length; i++) if (t >= CUTS[i][0]) c = i;
    const u = t - CUTS[c][0];
    if (c === 0) {
      // +340% with a growing bar chart
      bg(ctx, COL.solar);
      const bars = [.22, .34, .5, .72, 1];
      bars.forEach((h, k) => {
        const p = E.outBack(inv(.05 + k * .05, .4 + k * .05, u), 1.4);
        const bh = 560 * h * p, x = 1180 + k * 128;
        ctx.fillStyle = k === 4 ? COL.night : rgba(RGB.night, .14 + k * .08);
        rrect(ctx, x, 880 - bh, 96, bh, 14); ctx.fill();
      });
      bigStat(ctx, '+340%', u, COL.night, 640, 700, 400, 'slam');
      setFont(ctx, fm(24, 600), 5); ctx.fillStyle = COL.night; ctx.textAlign = 'left';
      ctx.fillText(scramble('ALCANCE MÉDIO EM 30 DIAS', u, .15, .012, .1), 180, 790);
      setFont(ctx, fd(44, 600, 'semi-condensed'), 0);
      const wa = E.outExpo(inv(.45, .7, u)); ctx.globalAlpha = wa;
      ctx.fillText('para quem posta acima de 70°', 180, 860 + (1 - wa) * 20); ctx.globalAlpha = 1;
    } else if (c === 1) {
      // likes: a heart pops, hearts spray, notifications stack
      bg(ctx, COL.cobalt);
      const p = E.outElastic(inv(0, .5, u));
      for (let k = 0; k < 26; k++) {
        const a = hash(k, 11) * TAU, sp = 260 + 520 * hash(k, 12), q = clamp(u / .45);
        const x = 620 + Math.cos(a) * sp * E.outCubic(q), y = 520 + Math.sin(a) * sp * E.outCubic(q) - 120 * q;
        ctx.fillStyle = heatCss(.45 + .55 * hash(k, 13), 1 - q * .6);
        heart(ctx, x, y, (24 + 40 * hash(k, 14)) * (1 - q * .4));
      }
      ctx.fillStyle = COL.magenta; heart(ctx, 620, 540, 420 * p);
      ctx.fillStyle = COL.white; heart(ctx, 620, 540, 140 * p);
      const notes = [['♥', 'marina.ux curtiu seu vídeo', RGB.magenta], ['+', '1.204 novos seguidores', RGB.cobalt], ['↻', '3,2 mil compartilhamentos', RGB.flame], ['★', 'Seu vídeo está em alta', RGB.solar]];
      notes.forEach(([ic, tx2, cc], k) => {
        const q = E.outBack(inv(.06 + k * .06, .36 + k * .06, u), 1.6), a = inv(.06 + k * .06, .1 + k * .06, u);
        if (a <= 0) return;
        const y = 300 + k * 128, x = 1080 + (1 - q) * 300;
        ctx.save(); ctx.globalAlpha = a;
        ctx.fillStyle = COL.white; rrect(ctx, x, y, 660, 100, 50); ctx.fill();
        ctx.fillStyle = rgba(cc); ctx.beginPath(); ctx.arc(x + 50, y + 50, 30, 0, TAU); ctx.fill();
        setFont(ctx, fd(34, 800), 0); ctx.fillStyle = cc === RGB.solar ? COL.night : COL.white; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(ic, x + 50, y + 52);
        setFont(ctx, fd(34, 600, 'semi-condensed'), 0); ctx.fillStyle = COL.night; ctx.textAlign = 'left';
        ctx.fillText(tx2, x + 100, y + 52);
        ctx.restore();
      });
    } else if (c === 2) {
      bg(ctx, COL.magenta);
      bigStat(ctx, '2,1 bi', u, COL.paper, 960, 690, 480, 'whip');
      setFont(ctx, fm(26, 600), 6); ctx.fillStyle = COL.paper; ctx.textAlign = 'center';
      ctx.fillText(scramble('VIEWS GERADAS', u, .03, .01, .06), 960, 800);
    } else if (c === 3) {
      bg(ctx, COL.paper);
      bigStat(ctx, '48 mil', u, COL.night, 960, 690, 480, 'drop');
      setFont(ctx, fm(26, 600), 6); ctx.fillStyle = COL.night; ctx.textAlign = 'center';
      ctx.fillText(scramble('CRIADORES MEDINDO', u, .03, .01, .06), 960, 800);
    } else if (c === 4) {
      bg(ctx, COL.night);
      for (let k = 0; k < 9; k++) {
        const r = 80 + k * 110 + 260 * E.outExpo(clamp(u / .2));
        ctx.strokeStyle = heatCss(1 - k / 9); ctx.lineWidth = 34;
        ctx.beginPath(); ctx.arc(960, 540, r, 0, TAU); ctx.stroke();
      }
      setFont(ctx, fd(360, 800, 'condensed'), -6); ctx.fillStyle = COL.paper; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('97°', 960, 560);
    } else {
      bg(ctx, COL.flame);
      const s = lerp(7.5, 6.6, E.outExpo(clamp(u / .12)));
      drawMark(ctx, 960, 560, s, { mono: COL.night, dotColor: COL.paper });
    }
    // every cut opens with a white frame
    flash(ctx, t, CUTS[c][0], RGB.white, c ? .55 : .9, 30);
  }

  // ================================================================ 08 ASSINATURA
  const SKILLS = ['PARTÍCULAS', 'LOGO', 'TIPOGRAFIA', 'UI', 'DATA VIZ', '3D', 'RITMO'];
  function S8(ctx, t) {
    const lt = t - SC[7];
    bg(ctx, COL.night);
    // heat bloom under the lockup
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const br = 1 + .04 * Math.sin(lt * TAU * BPM / 60 / 2);
    for (const [hx, h, r, a] of [[-420, .1, 420, .16], [0, .5, 460, .16], [420, .85, 420, .16]]) {
      const g = ctx.createRadialGradient(960 + hx, 760, 0, 960 + hx, 760, r * br);
      const ap = a * E.outCubic(inv(0, .8, lt));
      g.addColorStop(0, heatCss(h, ap)); g.addColorStop(1, heatCss(h, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();

    // lockup
    setFont(ctx, LOCK.font, LOCK.ls);
    const WL = layout(ctx, 'ViralGrow');
    const markW = 86 * LOCK.s, total = markW + LOCK.gap + WL.w, left = 960 - total / 2;
    const mx = left + markW / 2, my = LOCK.y - 40;
    const sIn = 1 + .35 * (1 - E.outExpo(inv(0, .5, lt)));
    ctx.save();
    ctx.translate(960, my); ctx.scale(sIn, sIn); ctx.translate(-960, -my);
    const pulse = 1 + .25 * Math.exp(-Math.max(0, lt - (bt(31) - SC[7])) * 10) * (lt >= bt(31) - SC[7] ? 1 : 0);
    drawMark(ctx, mx, my, LOCK.s, { p1: E.inOutCubic(inv(0, .32, lt)), dot: E.outBack(inv(.26, .5, lt), 3) * pulse });
    const wx = left + markW + LOCK.gap, base = my + 86;
    ctx.save();
    const rev = E.outExpo(inv(.18, .7, lt));
    ctx.beginPath(); ctx.rect(wx - 10, base - 280, (WL.w + 40) * rev, 340); ctx.clip();
    setFont(ctx, LOCK.font, LOCK.ls); ctx.fillStyle = COL.paper; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('ViralGrow', wx - (1 - rev) * 160, base);
    ctx.restore();
    ctx.restore();

    // tagline
    setFont(ctx, fd(52, 500, 'semi-condensed'), 0);
    const words = ['Saiba', 'se', 'vai', 'viralizar', 'antes', 'de', 'postar.'];
    const full = words.join(' '), TL = layout(ctx, full);
    let x = 960 - TL.w / 2;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    words.forEach((wd, k) => {
      const ww = layout(ctx, wd).w, p = E.outExpo(inv(.5 + k * .035, 1.0 + k * .035, lt));
      if (p > 0) {
        ctx.save(); ctx.globalAlpha = p;
        ctx.fillStyle = wd === 'viralizar' ? heatGrad(ctx, x, 0, x + ww, 0, .1, 1) : COL.paper;
        ctx.fillText(wd, x, 640 + (1 - p) * 36);
        ctx.restore();
      }
      x += layout(ctx, wd + ' ').w;
    });

    // call to action
    const cp = E.outBack(inv(.75, 1.15, lt), 2), ca = inv(.75, .82, lt);
    if (ca > 0) {
      setFont(ctx, fd(36, 700, 'semi-condensed'), 0);
      const label = 'Teste grátis em viralgrow.app  →', lw = layout(ctx, label).w + 84;
      ctx.save(); ctx.globalAlpha = ca;
      ctx.translate(960, 752); ctx.scale(cp, cp);
      ctx.fillStyle = COL.cobalt; rrect(ctx, -lw / 2, -46, lw, 92, 46); ctx.fill();
      ctx.fillStyle = COL.white; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 2);
      ctx.restore();
    }

    // the landing page's 0–100° scale, with the marker settling on 97°
    const sp2 = E.outExpo(inv(.9, 1.4, lt));
    if (sp2 > 0) {
      const RX = 960 - 420, RW = 840, RY = 850;
      ctx.save();
      ctx.fillStyle = heatGrad(ctx, RX, 0, RX + RW, 0);
      rrect(ctx, RX, RY, RW * sp2, 8, 4); ctx.fill();
      setFont(ctx, fm(13, 500), 1.2); ctx.fillStyle = rgba(RGB.mutedD, sp2); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let d = 0; d <= 100; d += 25) ctx.fillText(d + '°', RX + RW * d / 100, RY + 18);
      const mk = RX + RW * .97 * E.outBack(inv(1.0, 1.5, lt), 1.4);
      ctx.fillStyle = COL.paper; ctx.beginPath(); ctx.arc(mk, RY + 4, 11 * sp2, 0, TAU); ctx.fill();
      ctx.fillStyle = COL.solar; ctx.beginPath(); ctx.arc(mk, RY + 4, 6 * sp2, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // credits: the reel's résumé
    setFont(ctx, fm(16, 500), 2.6);
    const a = inv(1.0, 1.2, lt);
    if (a > 0) {
      ctx.save(); ctx.globalAlpha = a; ctx.textBaseline = 'alphabetic';
      const head = 'MOTION DESIGN · CLAUDE', sep = '   ·   ';
      const parts = [head, ...SKILLS];
      const widths = parts.map(s => layout(ctx, s).w), sw = layout(ctx, sep).w;
      let xx = 960 - (widths.reduce((s, w) => s + w, 0) + sw * (parts.length - 1)) / 2;
      parts.forEach((s, k) => {
        const t0 = 1.0 + k * .05;
        ctx.fillStyle = k === 0 ? COL.paper : rgba(RGB.mutedD);
        ctx.textAlign = 'left';
        ctx.fillText(scramble(s, lt, t0, .012, .08), xx, 950);
        xx += widths[k];
        if (k < parts.length - 1) { ctx.fillStyle = heatCss(k / (parts.length - 1)); ctx.fillText(sep, xx, 950); xx += sw; }
      });
      ctx.restore();
    }
    flash(ctx, t, SC[7], RGB.white, .55, 40);
  }

  // ================================================================ HUD
  const HUD_SCENES = [[SC[0], '01', 'SISTEMAS DE PARTÍCULAS'], [SC[1], '02', 'ANIMAÇÃO DE LOGO'], [SC[2], '03', 'TIPOGRAFIA CINÉTICA'], [SC[3], '04', 'UI MOTION'],
    [SC[4], '05', 'DATA VIZ'], [SC[5], '06', '3D GENERATIVO'], [SC[6], '07', 'EDIÇÃO NO RITMO'], [SC[7], '08', 'ASSINATURA']];
  const HUD_COLOR = [[0, 'paper'], [SC[2], 'night'], [bt(11), 'paper'], [bt(11) + .2, 'night'], [SC[3], 'night'], [CLICK + .3, 'paper'],
    [SC[6], 'night'], [bt(26), 'paper'], [bt(26.5), 'paper'], [bt(27), 'night'], [bt(27.5), 'paper'], [bt(27.75), 'night'], [SC[7], 'paper']];
  const hudColor = t => { let c = 'paper'; for (const [tt, cc] of HUD_COLOR) if (t >= tt) c = cc; return RGB[c]; };
  function timecode(t) {
    const f = Math.round(t * FPS), s = Math.floor(f / FPS), ff = f % FPS;
    return `00:00:${String(s).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;
  }
  function drawHUD(ctx, t) {
    const c = hudColor(t), m = 56, ap = inv(.05, .5, t);
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = rgba(c);
    const L = 26 * E.outExpo(ap);
    ctx.lineWidth = 2; ctx.lineCap = 'square'; ctx.beginPath();
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
      ctx.moveTo(x + sx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * L);
    }
    ctx.stroke();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';

    setFont(ctx, fm(15, 700), 2.4);
    const tl = 'CLAUDE', tl2 = ' / MOTION DESIGN — CASE VIRALGROW';
    ctx.fillText(scramble(tl, t, .1, .03, .12), m + 40, m + 1);
    const w1 = layout(ctx, tl).w + 2.4;
    setFont(ctx, fm(15, 400), 2.4);
    ctx.fillText(scramble(tl2, t, .2, .012, .12), m + 40 + w1, m + 1);
    const tlEnd = m + 40 + w1 + layout(ctx, tl2).w;

    const tc = timecode(t), tcw = layout(ctx, tc).w, tcx = W - m - 40 - tcw;
    ctx.globalAlpha = inv(.2, .4, t);
    ctx.fillText(tc, tcx, m + 1);
    const rec = 'REC', rw = layout(ctx, rec).w;
    ctx.fillText(rec, tcx - 26 - rw, m + 1);
    if (Math.floor(t * BPM / 60) % 2 === 0) { ctx.fillStyle = COL.magenta; ctx.beginPath(); ctx.arc(tcx - 26 - rw - 14, m + 1, 5, 0, TAU); ctx.fill(); ctx.fillStyle = rgba(c); }
    ctx.globalAlpha = 1;

    const x0 = tlEnd + 34, x1 = tcx - 26 - rw - 40, tlw = (x1 - x0) * E.outExpo(inv(.15, .8, t));
    ctx.globalAlpha = .25; ctx.fillRect(x0, m, tlw, 2); ctx.globalAlpha = 1;
    const prog = Math.min(tlw, (x1 - x0) * t / DUR);
    ctx.fillStyle = heatGrad(ctx, x0, 0, x1, 0); ctx.fillRect(x0, m - 1, prog, 4); ctx.fillStyle = rgba(c);
    for (const [st] of HUD_SCENES) { const x = x0 + (x1 - x0) * st / DUR; if (x - x0 <= tlw) ctx.fillRect(x - 1, m - (t >= st ? 6 : 4), 2, t >= st ? 14 : 10); }

    ctx.save();
    ctx.beginPath(); ctx.rect(m + 30, H - m - 16, 700, 34); ctx.clip();
    HUD_SCENES.forEach(([st, num, name], k) => {
      const next = HUD_SCENES[k + 1];
      const pin = E.outExpo(inv(st, st + .4, t)), pout = next ? E.outExpo(inv(next[0], next[0] + .4, t)) : 0;
      if (pin <= 0 || pout >= 1) return;
      const y = H - m + 1 + (1 - pin) * 30 - pout * 30;
      setFont(ctx, fm(15, 700), 2.4);
      ctx.fillText(num + ' / 08', m + 40, y);
      const nw = layout(ctx, num + ' / 08  ').w;
      setFont(ctx, fm(15, 400), 2.4);
      ctx.fillText('—  ' + name, m + 40 + nw, y);
    });
    ctx.restore();

    const bt0 = Math.floor(t * BPM / 60) % 4, sq = 11, gap = 7;
    let bx = W - m - 40 - (4 * sq + 3 * gap);
    setFont(ctx, fm(15, 400), 2.4);
    const bl = '128 BPM  ·  60 FPS', blw = layout(ctx, bl).w;
    ctx.globalAlpha = inv(.25, .45, t);
    ctx.fillText(bl, bx - 24 - blw, H - m + 1);
    for (let k = 0; k < 4; k++) {
      ctx.lineWidth = 1.5;
      if (k === bt0) ctx.fillRect(bx, H - m + 1 - sq / 2, sq, sq); else ctx.strokeRect(bx + .75, H - m + 1 - sq / 2 + .75, sq - 1.5, sq - 1.5);
      bx += sq + gap;
    }
    ctx.restore();
  }

  // ================================================================ compositor
  function renderScene(ctx, t) {
    ctx.save();
    const sh = shake(t);
    ctx.translate(960 + sh.x, 540 + sh.y); ctx.rotate(sh.r); ctx.translate(-960, -540);
    if (t < SC[1]) S1(ctx, t);
    else if (t < SC[2]) S2(ctx, t);
    else if (t < SC[3]) S3(ctx, t);
    else if (t < SC[4]) S4(ctx, t);
    else if (t < SC[5]) S5(ctx, t);
    else if (t < SC[6]) S6(ctx, t);
    else if (t < SC[7]) S7(ctx, t);
    else S8(ctx, t);
    ctx.restore();
  }
  function rgbSplit(ctx, amt) {
    if (amt < .6) return;
    const src = buf('split_src', W, H), ch = ['#f00', '#0f0', '#00f'].map((c, i) => [buf('split_' + i, W, H), c]);
    src.x.globalCompositeOperation = 'copy'; src.x.drawImage(ctx.canvas, 0, 0);
    for (const [b, c] of ch) {
      b.x.globalCompositeOperation = 'copy'; b.x.drawImage(src.c, 0, 0);
      b.x.globalCompositeOperation = 'multiply'; b.x.fillStyle = c; b.x.fillRect(0, 0, W, H);
    }
    const sc = k => { const s = 1 + k * amt / (W / 2), w = W * s, h = H * s; return [(W - w) / 2, (H - h) / 2, w, h]; };
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'copy'; ctx.drawImage(ch[1][0].c, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(ch[0][0].c, ...sc(1));
    ctx.drawImage(ch[2][0].c, ...sc(2));
    ctx.restore();
  }
  // samples > 1 gives true motion blur: a 180° shutter integrated over sub-frames.
  function renderFrame(ctx, t, opts = {}) {
    const N = opts.samples || 1, shutter = (opts.shutter ?? .5) / FPS;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (N === 1) renderScene(ctx, t);
    else {
      const S = buf('sub', W, H);
      for (let k = 0; k < N; k++) {
        // never integrate across a cut
        let ts = t + (k / N) * shutter;
        for (const c of SC.concat(CUTS.map(c => c[0]))) if (t < c && ts >= c) ts = c - 1e-4;
        S.x.setTransform(1, 0, 0, 1, 0, 0);
        renderScene(S.x, ts);
        ctx.globalAlpha = 1 / (k + 1);
        ctx.drawImage(S.c, 0, 0);
      }
      ctx.globalAlpha = 1;
    }
    if (opts.fx !== false) rgbSplit(ctx, splitAmt(t));
    drawHUD(ctx, t);
    ctx.restore();
  }

  global.REEL = { W, H, FPS, DUR, BPM, BEAT, BAR, SC, renderFrame, COL };
})(typeof window !== 'undefined' ? window : globalThis);
