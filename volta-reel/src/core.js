/*
 * VOLTA — SHOWREEL 2026 · core
 * ------------------------------------------------------------
 * Shared toolkit for every scene: timing, easing, noise, colour, type,
 * path morphing, fake-3D card projection, slot-machine numerals.
 *
 * Every frame of the reel is a pure function of time. Nothing here keeps
 * state between frames except caches of things that never change (text
 * layouts, sampled glyph points, offscreen buffers).
 */
(function (global) {
  'use strict';

  const W = 1920, H = 1080, FPS = 60, DUR = 30, BPM = 120, TAU = Math.PI * 2;
  const BEAT = 60 / BPM;

  // Section starts (seconds). Every one lands on a beat.
  const T = { intro: 0, zero: 2, volta: 4, flow: 6, munch: 10, nimbus: 14, terra: 18, montage: 22, stats: 24, end: 26 };

  // ---------------------------------------------------------------- colour
  const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const pal = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, hex(v)]));

  // The studio and its four clients each own a palette.
  const C = {
    volta: pal({ ink: '#0C0C0E', paper: '#F4F1EA', volt: '#D9FF3F', grey: '#8A8A85' }),
    flow: pal({ violet: '#5B2EFF', deep: '#160A52', mint: '#4DF0C0', lilac: '#B9A8FF', white: '#FFFFFF', night: '#0E0638' }),
    munch: pal({ red: '#FF4433', dark: '#E2321F', cream: '#FFF1DA', yellow: '#FFC43B', brown: '#2A160F', pink: '#FF8FB8', green: '#3DBE6B' }),
    nimbus: pal({ black: '#05050A', white: '#F5F5FF', violet: '#8C6CFF', cyan: '#46E5FF', pink: '#FF6BD6', glass: '#1A1A2A' }),
    terra: pal({ forest: '#0E3A2B', deep: '#08281D', sand: '#EFE3C9', sun: '#FF8A3D', moss: '#7DB07A', clay: '#C4562E' }),
  };

  const F = {
    studio: '"Unbounded", sans-serif',
    sans: '"InterV", "Inter", sans-serif',
    serif: '"Instrument Serif", Georgia, serif',
    mono: '"JetBrains Mono", monospace',
    flow: '"Sora", sans-serif',
    munch: '"Fredoka", sans-serif',
    nimbus: '"Space Grotesk", sans-serif',
    terra: '"Fraunces", Georgia, serif',
  };

  // ---------------------------------------------------------------- math
  const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, x) => clamp((x - a) / (b - a));
  const smooth = t => t * t * (3 - 2 * t);
  const win = (t, a, b, fi = .1, fo = .1) => inv(a, a + fi, t) * (1 - inv(b - fo, b, t));

  const E = {
    lin: t => t,
    inQuad: t => t * t,
    outQuad: t => 1 - (1 - t) * (1 - t),
    inOutQuad: t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
    inCubic: t => t * t * t,
    outCubic: t => 1 - (1 - t) ** 3,
    inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
    outQuart: t => 1 - (1 - t) ** 4,
    inOutQuart: t => t < .5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2,
    inQuint: t => t ** 5,
    outQuint: t => 1 - (1 - t) ** 5,
    inExpo: t => t <= 0 ? 0 : 2 ** (10 * t - 10),
    outExpo: t => t >= 1 ? 1 : 1 - 2 ** (-10 * t),
    inOutExpo: t => t <= 0 ? 0 : t >= 1 ? 1 : t < .5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2,
    outBack: (t, s = 1.70158) => t <= 0 ? 0 : 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
    inBack: (t, s = 1.70158) => (s + 1) * t ** 3 - s * t * t,
    outElastic: t => t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - .75) * TAU / 3) + 1,
    // damped spring, t in seconds-ish units (0..1 covers the settle)
    spring: (t, k = 7, f = 12) => t <= 0 ? 0 : 1 - Math.exp(-k * t) * Math.cos(f * t),
  };
  function bezier(x1, y1, x2, y2) {
    const bx = u => 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
    const by = u => 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
    return t => {
      if (t <= 0) return 0; if (t >= 1) return 1;
      let lo = 0, hi = 1, u = t;
      for (let i = 0; i < 30; i++) { u = (lo + hi) / 2; if (bx(u) < t) lo = u; else hi = u; }
      return by(u);
    };
  }
  E.snappy = bezier(.7, 0, .1, 1);
  E.swift = bezier(.2, .9, .1, 1);

  // A value that steps through keys [[t, v], ...] with eased transitions of length d.
  function keys(t, ks, d = .5, ease = E.snappy) {
    let v = ks[0][1];
    for (let i = 1; i < ks.length; i++) {
      const [kt, kv] = ks[i];
      const p = ease(inv(kt, kt + (ks[i][2] ?? d), t));
      if (p <= 0) break;
      v = Array.isArray(v) ? v.map((x, j) => lerp(x, kv[j], p)) : lerp(v, kv, p);
    }
    return v;
  }

  const hash = (i, s = 0) => { const x = Math.sin(i * 127.1 + s * 311.7 + .123) * 43758.5453; return x - Math.floor(x); };
  const noise1 = (x, s = 0) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (hash(i, s) * (1 - u) + hash(i + 1, s) * u) * 2 - 1; };

  // Ken Perlin's improved noise, seeded.
  const PERM = new Uint8Array(512);
  (() => {
    const p = Array.from({ length: 256 }, (_, i) => i);
    let s = 20261014;
    for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
  })();
  const fd = t => t * t * t * (t * (t * 6 - 15) + 10);
  const gr = (h, x, y, z) => {
    h &= 15; const u = h < 8 ? x : y, v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  };
  function perlin(x, y, z = 0) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fd(x), v = fd(y), w = fd(z), P = PERM;
    const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z, B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
    return lerp(
      lerp(lerp(gr(P[AA], x, y, z), gr(P[BA], x - 1, y, z), u), lerp(gr(P[AB], x, y - 1, z), gr(P[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(gr(P[AA + 1], x, y, z - 1), gr(P[BA + 1], x - 1, y, z - 1), u), lerp(gr(P[AB + 1], x, y - 1, z - 1), gr(P[BB + 1], x - 1, y - 1, z - 1), u), v),
      w);
  }
  const fbm = (x, y, z, o = 3) => { let a = 0, s = 1, n = 0; for (let i = 0; i < o; i++) { a += perlin(x * s, y * s, z * s) / s; n += 1 / s; s *= 2; } return a / n; };

  // ---------------------------------------------------------------- canvas helpers
  const _buf = new Map();
  function buf(name, w = W, h = H) {
    let b = _buf.get(name);
    if (!b || b.c.width !== w || b.c.height !== h) {
      const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
      b = { c, x: c.getContext('2d', { willReadFrequently: name.startsWith('read') }) };
      _buf.set(name, b);
    }
    return b;
  }
  function bg(ctx, c) { ctx.fillStyle = Array.isArray(c) ? rgba(c) : c; ctx.fillRect(-400, -400, W + 800, H + 800); }
  function rrect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); }
  function cam(ctx, cx, cy, s = 1, rot = 0, tx = cx, ty = cy) {
    // scale/rotate about (cx, cy), then bring (tx, ty) to the frame centre
    ctx.translate(W / 2, H / 2); ctx.rotate(rot); ctx.scale(s, s); ctx.translate(-tx, -ty);
  }

  // ---------------------------------------------------------------- text
  const _lay = new Map();
  function setFont(ctx, font, ls = 0) { ctx.font = font; ctx.letterSpacing = ls + 'px'; ctx._ls = ls; }
  function layout(ctx, str) {
    const key = ctx.font + '|' + ctx._ls + '|' + str;
    let v = _lay.get(key);
    if (!v) {
      const xs = [];
      for (let i = 0; i <= str.length; i++) xs.push(ctx.measureText(str.slice(0, i)).width);
      v = { xs, w: xs[str.length] - (str.length ? ctx._ls || 0 : 0) };
      _lay.set(key, v);
    }
    return v;
  }
  const tw = (ctx, s) => layout(ctx, s).w;
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>';
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
  // Text with a scramble-decode; align: 'left' | 'center' | 'right'. Width is the final string's.
  function decode(ctx, str, x, y, t, t0, align = 'left', per = .022, settle = .16) {
    const w = tw(ctx, str), s = scramble(str, t, t0, per, settle);
    ctx.textAlign = 'left';
    ctx.fillText(s, align === 'center' ? x - w / 2 : align === 'right' ? x - w : x, y);
    return w;
  }

  // Per-glyph transforms. fn(i, n, ch) → { dx, dy, rot, sx, sy, skew, alpha, fill } | null
  function drawRow(ctx, str, x, base, fn, opts = {}) {
    const L = layout(ctx, str), ls = ctx._ls || 0;
    const x0 = opts.align === 'center' ? x - L.w / 2 : opts.align === 'right' ? x - L.w : x;
    const pivotY = opts.pivotY ?? 0;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === ' ') continue;
      const tr = fn(i, str.length, str[i]);
      if (!tr || tr.alpha === 0 || tr.sy === 0 || tr.sx === 0) continue;
      const lw = L.xs[i + 1] - L.xs[i] - ls;
      ctx.save();
      ctx.translate(x0 + L.xs[i] + lw / 2 + (tr.dx || 0), base + (tr.dy || 0) - pivotY);
      if (tr.rot) ctx.rotate(tr.rot);
      if (tr.skew) ctx.transform(1, 0, tr.skew, 1, 0, 0);
      ctx.scale(tr.sx ?? 1, tr.sy ?? 1);
      if (tr.alpha != null) ctx.globalAlpha *= tr.alpha;
      if (tr.fill) ctx.fillStyle = tr.fill;
      ctx.textAlign = 'left';
      opts.stroke ? ctx.strokeText(str[i], -lw / 2, pivotY) : ctx.fillText(str[i], -lw / 2, pivotY);
      ctx.restore();
    }
    return { x0, w: L.w, xs: L.xs };
  }

  // Masked rise: each glyph slides up from below a clip line.
  function riseText(ctx, str, x, base, t, t0, opts = {}) {
    const per = opts.per ?? .035, dur = opts.dur ?? .55, h = opts.h ?? 200, ease = opts.ease ?? E.outExpo;
    ctx.save();
    if (opts.clip !== false) { ctx.beginPath(); ctx.rect(-4000, base - h * 1.1, 10000, h * 1.1 + (opts.desc ?? h * .32)); ctx.clip(); }
    const r = drawRow(ctx, str, x, base, (i) => {
      const p = ease(inv(t0 + i * per, t0 + i * per + dur, t));
      if (p <= 0) return null;
      const out = opts.out != null ? E.inCubic(inv(opts.out + i * per * .6, opts.out + i * per * .6 + .35, t)) : 0;
      return { dy: (1 - p) * h * 1.05 - out * h * 1.1, rot: (1 - p) * (opts.rot ?? 0) };
    }, opts);
    ctx.restore();
    return r;
  }

  // Slot-machine numerals: digits roll in from above and lock in place, staggered.
  function rollText(ctx, str, x, base, t, t0, opts = {}) {
    const dur = opts.dur ?? .7, per = opts.per ?? .06, spins = opts.spins ?? 2, lh = opts.lh ?? 100;
    const L = layout(ctx, str), ls = ctx._ls || 0;
    const x0 = opts.align === 'center' ? x - L.w / 2 : opts.align === 'right' ? x - L.w : x;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0 - 40, base - lh * (opts.top ?? .86), L.w + 80, lh * ((opts.top ?? .86) + (opts.bot ?? .2))); ctx.clip();
    ctx.textAlign = 'center';
    let di = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i], cw = L.xs[i + 1] - L.xs[i] - ls, cx = x0 + L.xs[i] + cw / 2;
      const k = (str.length - 1 - i);
      const st = t0 + (opts.reverse ? k : i) * per;
      const p = inv(st, st + dur, t);
      if (p <= 0) continue;
      if (ch >= '0' && ch <= '9') {
        const d = +ch, n = spins + (di++ % 2);
        const pos = d + 10 * n * (1 - E.outCubic(p)); // rolls downward
        const f = Math.floor(pos), fr = pos - f;
        for (const [dig, off] of [[f, fr], [f + 1, fr - 1]]) {
          ctx.fillText(String(((dig % 10) + 10) % 10), cx, base + off * lh);
        }
      } else {
        const q = E.outExpo(p);
        ctx.save(); ctx.globalAlpha *= q;
        ctx.fillText(ch, cx, base + (1 - q) * lh * .6);
        ctx.restore();
      }
    }
    ctx.restore();
    return { x0, w: L.w };
  }

  // Small label + leader line, used for construction notes and data callouts.
  function callout(ctx, ax, ay, lx, ly, text, t, t0, t1, col, right = false) {
    const a = inv(t0, t0 + .1, t) * (1 - inv(t1, t1 + .15, t));
    if (a <= 0) return;
    const pl = E.outExpo(inv(t0, t0 + .35, t));
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.strokeStyle = ctx.fillStyle = rgba(col);
    ctx.lineWidth = 1.5;
    circle(ctx, ax, ay, 4.5 * E.outBack(inv(t0, t0 + .15, t), 3)); ctx.fill();
    const ex = lerp(ax, lx, pl), ey = lerp(ay, ly, pl);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    setFont(ctx, `500 15px ${F.mono}`, 1.6);
    const w = tw(ctx, text);
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + (right ? -1 : 1) * (w + 8) * pl, ey); ctx.stroke();
    ctx.textBaseline = 'bottom';
    decode(ctx, text, right ? lx - w - 4 : lx + 4, ly - 7, t, t0 + .08, 'left', .018, .1);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // ---------------------------------------------------------------- paths
  function resample(pts, n, closed = false) {
    const P = closed ? [...pts, pts[0]] : pts;
    const d = [0];
    for (let i = 1; i < P.length; i++) d.push(d[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const L = d[d.length - 1], out = [];
    let j = 1;
    for (let k = 0; k < n; k++) {
      const s = L * k / (n - 1);
      while (j < d.length - 1 && d[j] < s) j++;
      const u = (s - d[j - 1]) / (d[j] - d[j - 1] || 1);
      out.push([lerp(P[j - 1][0], P[j][0], u), lerp(P[j - 1][1], P[j][1], u)]);
    }
    return out;
  }
  const morph = (A, B, p) => A.map((a, i) => [lerp(a[0], B[i][0], p), lerp(a[1], B[i][1], p)]);
  function polyline(ctx, pts, closed = false) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    if (closed) ctx.closePath();
  }
  // Partial polyline from fraction a to b along its (uniformly resampled) length.
  function polySeg(ctx, pts, a, b) {
    const n = pts.length - 1, i0 = a * n, i1 = b * n;
    if (i1 <= i0) { ctx.beginPath(); return; }
    const at = f => { const i = Math.min(n - 1, Math.floor(f)), u = f - i; return [lerp(pts[i][0], pts[i + 1][0], u), lerp(pts[i][1], pts[i + 1][1], u)]; };
    ctx.beginPath();
    const p0 = at(i0); ctx.moveTo(p0[0], p0[1]);
    for (let i = Math.ceil(i0); i < i1; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    const p1 = at(i1); ctx.lineTo(p1[0], p1[1]);
  }
  const arcPts = (cx, cy, r, a0, a1, n = 120) => Array.from({ length: n }, (_, i) => { const a = lerp(a0, a1, i / (n - 1)); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

  // ---------------------------------------------------------------- glyph sampling
  // Rasterise a string once and return points on its filled area (for particles).
  const _pts = new Map();
  function textPoints(str, font, cx, cy, n, ls = 0) {
    const key = str + font + n;
    if (_pts.has(key)) return _pts.get(key);
    const b = buf('read_text', W, H), x = b.x;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H);
    setFont(x, font, ls); x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.textAlign = 'left';
    const w = tw(x, str);
    x.fillText(str, cx - w / 2, cy);
    const d = x.getImageData(0, 0, W, H).data, cand = [];
    for (let y = 0; y < H; y += 3) for (let xx = 0; xx < W; xx += 3) if (d[(y * W + xx) * 4 + 3] > 140) cand.push([xx, y]);
    const out = [];
    for (let i = 0; i < n; i++) {
      const k = Math.floor(hash(i, 9) * cand.length);
      const p = cand[k] || [cx, cy];
      out.push([p[0] + (hash(i, 3) - .5) * 2.5, p[1] + (hash(i, 4) - .5) * 2.5]);
    }
    _pts.set(key, out);
    return out;
  }

  // ---------------------------------------------------------------- fake 3D
  // Draw a flat image as a plane rotated about its vertical axis (ay) with true
  // perspective, by slicing it into vertical strips. rz tilts the whole plane.
  function planeY(ctx, img, cx, cy, w, h, ay, opts = {}) {
    const f = opts.focal ?? 1600, N = opts.strips ?? 90, rz = opts.rz ?? 0;
    const ca = Math.cos(ay), sa = Math.sin(ay);
    const proj = x => { const z = x * sa; const s = f / (f + z); return [x * ca * s, s]; };
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(rz);
    const iw = img.width, ih = img.height;
    for (let i = 0; i < N; i++) {
      const xa = -w / 2 + w * i / N, xb = -w / 2 + w * (i + 1) / N;
      const [Xa, sA] = proj(xa), [Xb, sB] = proj(xb);
      const s = (sA + sB) / 2, x0 = Math.min(Xa, Xb), dw = Math.abs(Xb - Xa);
      const sx = ca >= 0 ? iw * i / N : iw * (N - 1 - i) / N;
      ctx.drawImage(img, sx, 0, iw / N, ih, x0 - .35, -h / 2 * s, dw + .7, h * s);
    }
    ctx.restore();
    // return the projected corner quad (for highlights / shadows)
    const [XL, sL] = proj(-w / 2), [XR, sR] = proj(w / 2);
    return { XL, XR, sL, sR };
  }

  global.V = {
    W, H, FPS, DUR, BPM, BEAT, TAU, T, C, F,
    hex, rgba, mix, clamp, lerp, inv, smooth, win, E, bezier, keys, hash, noise1, perlin, fbm,
    buf, bg, rrect, circle, cam,
    setFont, layout, tw, scramble, decode, drawRow, riseText, rollText, callout,
    resample, morph, polyline, polySeg, arcPts, textPoints, planeY,
    scenes: {},
  };
})(typeof window !== 'undefined' ? window : globalThis);
