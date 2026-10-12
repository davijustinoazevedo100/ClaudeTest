/*
 * CLAUDE — MOTION REEL 2026
 * ------------------------------------------------------------
 * A 15 second showreel where every frame is a pure function of time:
 *
 *     REEL.renderFrame(ctx, t, { samples })
 *
 * No keyframes, no timeline files, no assets besides fonts. The same code
 * drives the live player (index.html) and the offline renderer (render.mjs).
 *
 * Structure — 120 BPM, one scene per bar-ish, every cut lands on a beat:
 *   0.00  01 PRINCIPLES   bouncing ball, spacing chart, squash & stretch
 *   1.50  02 TYPOGRAPHY   kinetic type, camera reframes, marquee rows
 *   3.50  03 SYSTEMS      91-tile grid, polar shape morphs in staggered waves
 *   5.50  04 DIMENSION    1600-point cloud morphing through 3D forms
 *   7.50  05 FLUID        metaball field shaded as topographic bands
 *   9.50  06 TIMING       graph editor + easing race
 *  11.50  07 ENERGY       six quarter-beat cuts
 *  13.00  08 HELLO        end card
 */
(function (global) {
  'use strict';

  const W = 1920, H = 1080, FPS = 60, DUR = 15, BPM = 120, TAU = Math.PI * 2;

  // ---------------------------------------------------------------- palette
  const COL = { ink: '#0B0B0F', paper: '#F2EDE4', orange: '#FF5B1F', blue: '#2B2BFF', lime: '#C8FF2E' };
  const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const RGB = Object.fromEntries(Object.entries(COL).map(([k, v]) => [k, hex(v)]));
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  const F = {
    sans: '"Inter Display", "ReelSans", "Inter", sans-serif',
    serif: '"Instrument Serif", Georgia, serif',
    mono: '"JetBrains Mono", "DejaVu Sans Mono", monospace',
  };

  // ---------------------------------------------------------------- math
  const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, x) => clamp((x - a) / (b - a));
  const smooth = t => t * t * (3 - 2 * t);

  const E = {
    lin: t => t,
    inQuad: t => t * t,
    outQuad: t => 1 - (1 - t) * (1 - t),
    inCubic: t => t * t * t,
    outCubic: t => 1 - (1 - t) ** 3,
    inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
    inQuart: t => t ** 4,
    outQuart: t => 1 - (1 - t) ** 4,
    inOutQuart: t => t < .5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2,
    inExpo: t => t <= 0 ? 0 : 2 ** (10 * t - 10),
    outExpo: t => t >= 1 ? 1 : 1 - 2 ** (-10 * t),
    inOutExpo: t => t <= 0 ? 0 : t >= 1 ? 1 : t < .5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2,
    outBack: (t, s = 1.70158) => t <= 0 ? 0 : 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
    inBack: (t, s = 1.70158) => (s + 1) * t ** 3 - s * t * t,
    outElastic: t => t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - .75) * TAU / 3) + 1,
    spring: t => t <= 0 ? 0 : 1 - Math.exp(-6 * t) * Math.cos(11 * t),
  };

  function bezier(x1, y1, x2, y2) {
    const bx = u => 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
    const by = u => 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
    return t => {
      if (t <= 0) return 0; if (t >= 1) return 1;
      let lo = 0, hi = 1, u = t;
      for (let i = 0; i < 32; i++) { u = (lo + hi) / 2; if (bx(u) < t) lo = u; else hi = u; }
      return by(u);
    };
  }
  E.easy = bezier(.86, 0, .07, 1);

  const hash = (i, s = 0) => { const x = Math.sin(i * 127.1 + s * 311.7 + .123) * 43758.5453; return x - Math.floor(x); };
  const noise = (x, s = 0) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (hash(i, s) * (1 - u) + hash(i + 1, s) * u) * 2 - 1; };

  // ---------------------------------------------------------------- text
  const _lay = new Map();
  function setFont(ctx, font, ls = 0) { ctx.font = font; ctx.letterSpacing = ls + 'px'; ctx._ls = ls; }
  function layout(ctx, str) {
    const key = ctx.font + '|' + ctx.letterSpacing + '|' + str;
    let v = _lay.get(key);
    if (!v) {
      const xs = [];
      for (let i = 0; i <= str.length; i++) xs.push(ctx.measureText(str.slice(0, i)).width);
      v = { xs, w: xs[str.length] - (ctx._ls || 0) };
      _lay.set(key, v);
    }
    return v;
  }
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
  const typed = (str, p) => str.slice(0, Math.round(str.length * clamp(p)));

  // Draw a string letter by letter. fn(i, n) returns a transform for that glyph.
  function drawRow(ctx, str, cx, base, pivotY, fn, stroke = false) {
    const L = layout(ctx, str), x0 = cx - L.w / 2;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === ' ') continue;
      const tr = fn(i, str.length);
      if (!tr || tr.alpha === 0 || tr.sy === 0) continue;
      const lw = L.xs[i + 1] - L.xs[i] - (ctx._ls || 0);
      ctx.save();
      ctx.translate(x0 + L.xs[i] + lw / 2 + (tr.dx || 0), base + (tr.dy || 0) - pivotY);
      if (tr.rot) ctx.rotate(tr.rot);
      if (tr.skew) ctx.transform(1, 0, tr.skew, 1, 0, 0);
      ctx.scale(tr.sx ?? 1, tr.sy ?? 1);
      if (tr.alpha != null) ctx.globalAlpha *= tr.alpha;
      if (tr.fill) ctx.fillStyle = tr.fill;
      stroke ? ctx.strokeText(str[i], -lw / 2, pivotY) : ctx.fillText(str[i], -lw / 2, pivotY);
      ctx.restore();
    }
    return L;
  }

  function bg(ctx, c) { ctx.fillStyle = c; ctx.fillRect(-200, -200, W + 400, H + 400); }

  function callout(ctx, ax, ay, lx, ly, text, t, t0, t1, c, right = false) {
    const a = inv(t0, t0 + .1, t) * (1 - inv(t1, t1 + .12, t));
    if (a <= 0) return;
    const pl = E.outExpo(inv(t0, t0 + .3, t));
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.strokeStyle = ctx.fillStyle = rgba(c);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(ax, ay, 4.5 * E.outBack(inv(t0, t0 + .15, t), 3), 0, TAU); ctx.fill();
    const ex = lerp(ax, lx, pl), ey = lerp(ay, ly, pl);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    setFont(ctx, `500 15px ${F.mono}`, 1.6);
    const w = layout(ctx, text).w;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + (right ? -1 : 1) * (w + 8) * pl, ey); ctx.stroke();
    ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
    ctx.fillText(scramble(text, t, t0 + .08, .018, .1), right ? lx - w - 4 : lx + 4, ly - 7);
    ctx.restore();
  }

  // ---------------------------------------------------------------- polar shapes
  // Every shape is a radius function r(θ) sampled at 1° steps, so any two shapes
  // morph cleanly by blending their radii.
  const NP = 360;
  const mkShape = fn => { const a = new Float32Array(NP); for (let i = 0; i < NP; i++) a[i] = fn(i / NP * TAU); return a; };
  const SH = {
    circle: mkShape(() => 1),
    square: mkShape(th => .86 / Math.max(Math.abs(Math.cos(th)), Math.abs(Math.sin(th)))),
    diamond: mkShape(th => 1.08 / (Math.abs(Math.cos(th)) + Math.abs(Math.sin(th)))),
    plus: mkShape(th => {
      const c = Math.abs(Math.cos(th)) + 1e-9, s = Math.abs(Math.sin(th)) + 1e-9, w = .36, L = 1.06;
      return Math.max(Math.min(L / c, w / s), Math.min(w / c, L / s));
    }),
    tri: mkShape(th => {
      const seg = TAU / 3; let a = (th - Math.PI / 2) % seg; if (a < 0) a += seg;
      return .56 / Math.cos(a - seg / 2);
    }),
  };
  function polarPath(ctx, cx, cy, rad, weights, rot) {
    const names = Object.keys(weights);
    ctx.beginPath();
    for (let i = 0; i < NP; i++) {
      let r = 0;
      for (const n of names) r += weights[n] * SH[n][i];
      r *= rad;
      const th = i / NP * TAU + rot;
      const x = cx + r * Math.cos(th), y = cy + r * Math.sin(th);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  function blendWeights(w, shape, p) {
    for (const k in w) w[k] *= (1 - p);
    w[shape] = (w[shape] || 0) + p;
  }

  // ---------------------------------------------------------------- camera fx
  const HITS = [
    [0.5, 5], [1.0, 7], [1.5, 22], [2.0, 9], [2.5, 11], [3.0, 7], [3.5, 16], [4.0, 5], [4.5, 5], [5.0, 5],
    [5.5, 20], [6.0, 7], [6.5, 7], [7.0, 9], [7.5, 18], [8.0, 6], [8.5, 6], [9.0, 6], [9.5, 15], [10.0, 6],
    [11.5, 18], [11.75, 13], [12.0, 13], [12.25, 13], [12.5, 13], [12.75, 15], [13.0, 30],
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
  const SPLITS = [1.5, 3.5, 5.5, 7.5, 9.5, 11.5, 11.75, 12.0, 12.25, 12.5, 12.75, 13.0];
  function splitAmt(t) {
    let a = 0;
    for (const h of SPLITS) { const d = t - h; if (d >= 0 && d < .25) a = Math.max(a, 12 * Math.exp(-d * 20)); }
    return a;
  }

  // ================================================================ 01 PRINCIPLES
  function S0(ctx, t) {
    bg(ctx, COL.ink);
    const R = 44, FL = 800, X0 = 630, VX = 660, YT = 300, HB = 300;
    const C = .045; // contact time on the first bounce
    const pos = u => {
      u = clamp(u, 0, 1);
      const x = X0 + VX * u;
      if (u < .5) { const k = u / .5; return [x, YT + (FL - R - YT) * k * k]; }
      if (u < .5 + C) return [x, FL - R];
      const k = (u - .5 - C) / (.5 - C); return [x, FL - R - HB * 4 * k * (1 - k)];
    };
    const fade = 1 - inv(1.1, 1.28, t);

    // floor + ruler
    const fw = 680 * E.outExpo(inv(0, .8, t));
    ctx.lineCap = 'butt';
    ctx.strokeStyle = rgba(RGB.paper, .4); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(960 - fw, FL); ctx.lineTo(960 + fw, FL); ctx.stroke();
    ctx.strokeStyle = rgba(RGB.paper, .25); ctx.lineWidth = 1.5; ctx.beginPath();
    for (let n = 0; n <= 40; n++) {
      const x = 280 + n * 34; if (Math.abs(x - 960) > fw) continue;
      ctx.moveTo(x, FL + 10); ctx.lineTo(x, FL + (n % 5 === 0 ? 30 : 18));
    }
    ctx.stroke();
    setFont(ctx, `500 12px ${F.mono}`, 1);
    ctx.fillStyle = rgba(RGB.paper, .35 * fade); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let n = 0; n <= 40; n += 5) { const x = 280 + n * 34; if (Math.abs(x - 960) <= fw) ctx.fillText(String(n * 3).padStart(3, '0'), x, FL + 38); }

    // trajectory + spacing chart (one dot every 1/24 s)
    const tt = Math.min(t, 1);
    ctx.strokeStyle = rgba(RGB.paper, .22 * fade); ctx.lineWidth = 1.5; ctx.setLineDash([2, 8]);
    ctx.beginPath();
    for (let u = 0; u <= tt + 1e-6; u += .004) { const [x, y] = pos(u); u ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = rgba(RGB.paper, .7 * fade);
    for (let n = 1; n / 24 <= tt; n++) { const [x, y] = pos(n / 24); ctx.beginPath(); ctx.arc(x, y, 3.4, 0, TAU); ctx.fill(); }

    // onion skin
    for (let k = 1; k <= 4; k++) {
      const u = t - k * .034; if (u < 0 || u > 1) continue;
      const [x, y] = pos(u);
      ctx.strokeStyle = rgba(RGB.orange, .5 * (1 - k / 5) * fade); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
    }

    // ripples on contact
    for (const ti of [.5, 1.0]) {
      const d = t - ti; if (d < 0 || d > .7) continue;
      const k = d / .7, r = 30 + 260 * E.outExpo(k);
      ctx.strokeStyle = rgba(RGB.orange, (1 - k) * fade); ctx.lineWidth = 3 * (1 - k) + .5;
      ctx.beginPath(); ctx.ellipse(pos(ti)[0], FL, r, r * .16, 0, 0, TAU); ctx.stroke();
    }

    // annotations
    const pa = pos(.3), pb = pos(.75);
    callout(ctx, pa[0] - 4, pa[1], pa[0] - 90, pa[1] - 70, '01  SPACING', t, .18, 1.12, RGB.paper, true);
    callout(ctx, 960, FL, 900, FL + 110, '02  SQUASH & STRETCH', t, .52, 1.12, RGB.paper, true);
    callout(ctx, pb[0], pb[1] - R - 6, pb[0] + 60, pb[1] - R - 90, '03  ARCS', t, .74, 1.12, RGB.paper);
    callout(ctx, 1290 + R + 10, FL - R, 1420, FL - 170, '04  ANTICIPATION', t, 1.0, 1.14, RGB.orange);

    // the ball
    const [bx, by] = pos(t);
    const [px, py] = pos(t - .004), [nx, ny] = pos(t + .004);
    const vx = (nx - px) / .008, vy = (ny - py) / .008, sp = t < 1 ? Math.hypot(vx, vy) : 0;
    let q = 0;
    q = .44 * Math.sin(Math.PI * inv(.494, .5 + C + .012, t));
    if (t >= .988) q = Math.max(q, .52 * E.outQuad(inv(.988, 1.05, t)) * (1 - E.outBack(inv(1.12, 1.24, t), 2)));
    let k = 1 + .32 * clamp(sp / 3400);
    k = lerp(k, 1, clamp(q * 12));
    const pop = E.outBack(inv(0, .14, t), 2.4);
    // anticipation: a slight shrink before release
    const ant = 1 - .14 * Math.sin(Math.PI * inv(1.0, 1.14, t));
    const jit = t > 1.05 && t < 1.14 ? noise(t * 160, 3) * 2.2 : 0;
    ctx.fillStyle = COL.orange;
    ctx.save();
    ctx.translate(bx + jit, by + R * q);
    ctx.scale((1 + q * .95) * pop * ant, (1 - q) * pop * ant);
    ctx.rotate(Math.atan2(vy, vx));
    ctx.scale(k, 1 / k);
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    ctx.restore();

    // release → the ball becomes the next frame
    if (t > 1.12) {
      const r = lerp(R * .9, 1650, E.inExpo(inv(1.12, 1.5, t)) ** .85);
      ctx.beginPath(); ctx.arc(bx, FL - R, r, 0, TAU); ctx.fill();
    }
  }

  // ================================================================ 02 TYPOGRAPHY
  function S1(ctx, t) {
    bg(ctx, COL.orange);
    const lt = t - 1.5;
    let s = 1.55, fy = 262;
    for (const [pt, ps, pf] of [[.5, 1.2, 392], [1.0, 1.0, 532]]) {
      const k = E.outExpo(inv(pt, pt + .55, lt)); s = lerp(s, ps, k); fy = lerp(fy, pf, k);
    }
    // slow drift keeps the frame alive between hits
    s *= 1 + .015 * lt;
    const mq = lt > 1.5 ? 5200 * (lt - 1.5) ** 3 : 0;
    const copiesA = E.outExpo(inv(1.5, 1.62, lt));

    ctx.save();
    ctx.translate(960, 540); ctx.scale(s, s); ctx.translate(-960, -fy);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const B1 = 338, B2 = 612, B3 = 884;

    const row = (str, font, ls, base, dir, fill, letterFn, pivotY, spec, specT) => {
      setFont(ctx, font, ls);
      const L = layout(ctx, str);
      if (mq > 0 || copiesA > 0) {
        const off = dir * mq, step = L.w + 110;
        for (let c = -4; c <= 4; c++) {
          const x = 960 + off + c * step;
          if (x + L.w / 2 < -400 || x - L.w / 2 > W + 400) continue;
          if (c === 0) { ctx.fillStyle = fill; ctx.fillText(str, x - L.w / 2, base); continue; }
          ctx.globalAlpha = copiesA;
          if (c % 2) { ctx.strokeStyle = fill; ctx.lineWidth = 3; ctx.strokeText(str, x - L.w / 2, base); }
          else { ctx.fillStyle = fill; ctx.fillText(str, x - L.w / 2, base); }
          ctx.globalAlpha = 1;
        }
      } else {
        ctx.fillStyle = fill;
        drawRow(ctx, str, 960, base, pivotY, letterFn);
      }
      if (spec) {
        const a = inv(specT, specT + .1, lt) * (1 - inv(1.45, 1.6, lt));
        if (a > 0) {
          const x0 = 960 - L.w / 2;
          ctx.save(); ctx.globalAlpha = a;
          setFont(ctx, `600 15px ${F.mono}`, 2);
          ctx.fillStyle = COL.ink;
          ctx.fillText(scramble(spec, lt, specT, .015, .1), x0 + 6, base - pivotY * 2 - 26);
          ctx.fillRect(x0 + 6, base - pivotY * 2 - 18, 26 * E.outExpo(inv(specT, specT + .3, lt)), 2);
          ctx.restore();
        }
      }
    };

    // row 1 — serif italic, masked rise
    ctx.save();
    ctx.beginPath(); ctx.rect(-2000, B1 - 250, 6000, 330); ctx.clip();
    row('I make', `italic 400 252px ${F.serif}`, 0, B1, 1, COL.ink, (i) => {
      const p = E.outExpo(inv(i * .04, .62 + i * .04, lt));
      return { dy: (1 - p) * 300, rot: (1 - p) * .12 };
    }, 90, 'A — SERIF ITALIC 252', .3);
    ctx.restore();

    // row 2 — grotesk black, flip in
    row('THINGS', `900 312px ${F.sans}`, -6, B2, -1, COL.ink, (i, n) => {
      const st = .5 + i * .03, p = inv(st, st + .5, lt);
      if (p <= 0) return null;
      return { sy: Math.max(0, E.outBack(p, 2.6)), dy: (1 - E.outExpo(p)) * 50, dx: (i - (n - 1) / 2) * 70 * (1 - E.outExpo(p)) };
    }, 113, 'B — GROTESK BLACK 312', .78);

    // row 3 — paper, slides in with speed skew
    row('MOVE.', `900 312px ${F.sans}`, -6, B3, 1, COL.paper, (i) => {
      const st = 1.0 + i * .045;
      const at = x => 1500 * (1 - E.outBack(inv(st, st + .5, x), 1.35));
      const dx = at(lt), v = (at(lt) - at(lt - 1 / 60)) * 60;
      if (inv(st, st + .5, lt) <= 0) return null;
      return { dx, skew: clamp(v / 9000, -.5, .5) };
    }, 113, 'C — #F2EDE4', 1.25);

    ctx.restore();

    // exit: paper bars
    for (let j = 0; j < 6; j++) {
      const p = E.inOutExpo(inv(1.62 + j * .02, 1.62 + j * .02 + .26, lt));
      if (p <= 0) continue;
      ctx.fillStyle = COL.paper;
      const y = j * 180, w = (W + 40) * p;
      if (j % 2) ctx.fillRect(W + 20 - w, y - 1, w, 182); else ctx.fillRect(-20, y - 1, w, 182);
    }
  }

  // ================================================================ 03 SYSTEMS
  const G = { cols: 13, rows: 7, cell: 118 };
  G.x0 = (W - G.cols * G.cell) / 2; G.y0 = (H - G.rows * G.cell) / 2;
  const CI = 6, CJ = 3;
  const isC = (i, j) => i === CI && j === CJ;
  const WAVES = [
    { t: 3.5, o: [6, 3], d: .034, D: .5, ease: p => E.outBack(p, 2.2), shape: () => 'circle', rot: () => 0, col: () => RGB.ink, grow: true, tag: 'WAVE 01  ·  ORIGIN [06,03]  ·  STAGGER 34MS' },
    { t: 4.0, o: [0, 0], d: .028, D: .42, ease: p => E.outBack(p, 1.4), shape: () => 'square', rot: () => Math.PI / 2, col: (i, j) => (i + j) % 2 ? RGB.orange : RGB.ink, tag: 'WAVE 02  ·  ORIGIN [00,00]  ·  STAGGER 28MS' },
    { t: 4.5, o: [12, 6], d: .028, D: .42, ease: p => E.outBack(p, 1.4), shape: () => 'plus', rot: () => Math.PI * .75, col: (i, j) => (i + j) % 4 === 0 ? RGB.blue : ((i - j + 40) % 4 === 0 ? RGB.orange : RGB.ink), tag: 'WAVE 03  ·  ORIGIN [12,06]  ·  STAGGER 28MS' },
    { t: 5.0, o: [6, 3], d: .03, D: .4, ease: p => E.outBack(p, 1.2), fastC: true, shape: (i, j) => isC(i, j) ? 'square' : 'tri', rot: (i, j) => isC(i, j) ? Math.PI : Math.PI * 1.0, col: (i, j) => isC(i, j) ? RGB.ink : (hash(i * 31 + j, 2) < .18 ? RGB.blue : RGB.ink), tag: 'WAVE 04  ·  ORIGIN [06,03]  ·  STAGGER 30MS' },
  ];
  function S2(ctx, t) {
    bg(ctx, COL.paper);
    const zp = inv(5.06, 5.5, t);
    const z = Math.exp(Math.log(60) * E.inQuad(zp));
    ctx.save();
    ctx.translate(960, 540); ctx.scale(z, z); ctx.translate(-960, -540);

    // guides
    const gl = E.outExpo(inv(3.5, 4.0, t));
    ctx.strokeStyle = rgba(RGB.ink, .1); ctx.lineWidth = 1 / Math.sqrt(z);
    ctx.beginPath();
    const gx1 = G.x0 + G.cols * G.cell, gy1 = G.y0 + G.rows * G.cell;
    for (let i = 0; i <= G.cols; i++) { const x = G.x0 + i * G.cell; ctx.moveTo(x, 540 - (540 - G.y0) * gl); ctx.lineTo(x, 540 + (gy1 - 540) * gl); }
    for (let j = 0; j <= G.rows; j++) { const y = G.y0 + j * G.cell; ctx.moveTo(960 - (960 - G.x0) * gl, y); ctx.lineTo(960 + (gx1 - 960) * gl, y); }
    ctx.stroke();

    // tiles
    for (let j = 0; j < G.rows; j++) for (let i = 0; i < G.cols; i++) {
      const cx = G.x0 + (i + .5) * G.cell, cy = G.y0 + (j + .5) * G.cell;
      const w = { circle: 1 };
      let sc = 0, rot = 0, col = RGB.ink, pulse = 0;
      for (const wv of WAVES) {
        const d = Math.hypot(i - wv.o[0], j - wv.o[1]);
        const fast = wv.fastC && isC(i, j);
        const raw = fast ? inv(wv.t - .08, wv.t + .1, t) : inv(wv.t + d * wv.d, wv.t + d * wv.d + wv.D, t);
        if (raw <= 0) continue;
        const p = fast ? E.outCubic(raw) : wv.ease(raw);
        blendWeights(w, wv.shape(i, j), p);
        rot = lerp(rot, wv.rot(i, j), p);
        if (raw > .28) col = wv.col(i, j);
        if (wv.grow) sc = p; else pulse = Math.max(pulse, Math.sin(Math.PI * raw));
      }
      if (sc <= 0) continue;
      ctx.fillStyle = rgba(col);
      polarPath(ctx, cx, cy, 44 * sc * (1 - .22 * pulse), w, rot);
      ctx.fill();
    }

    // wave origin markers
    for (const wv of WAVES) {
      const k = inv(wv.t, wv.t + .55, t); if (k <= 0 || k >= 1) continue;
      const cx = G.x0 + (wv.o[0] + .5) * G.cell, cy = G.y0 + (wv.o[1] + .5) * G.cell;
      ctx.strokeStyle = rgba(RGB.orange, 1 - k); ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(cx, cy, 30 + 110 * E.outExpo(k), 0, TAU); ctx.stroke();
    }
    ctx.restore();

    // spec line (screen space, fades on zoom)
    const a = inv(3.55, 3.7, t) * (1 - inv(5.05, 5.15, t));
    if (a > 0) {
      let cur = WAVES[0]; for (const wv of WAVES) if (t >= wv.t) cur = wv;
      setFont(ctx, `600 14px ${F.mono}`, 2);
      ctx.fillStyle = rgba(RGB.ink, .7 * a); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      const s = scramble(cur.tag, t, cur.t, .012, .08);
      const L = layout(ctx, cur.tag);
      ctx.fillText(s, G.x0 + G.cols * G.cell - L.w, G.y0 - 20);
      ctx.fillText('13 × 7 GRID  ·  91 INSTANCES  ·  1 RULE', G.x0, G.y0 - 20);
    }
  }

  // ================================================================ 04 DIMENSION
  const N3 = 1600;
  const P3 = (() => {
    const mk = f => { const a = new Float32Array(N3 * 3); for (let i = 0; i < N3; i++) { const p = f(i); a[i * 3] = p[0]; a[i * 3 + 1] = p[1]; a[i * 3 + 2] = p[2]; } return a; };
    const sphere = mk(i => { const y = 1 - 2 * (i + .5) / N3, r = Math.sqrt(1 - y * y), ph = i * 2.399963; return [Math.cos(ph) * r * 300, y * 300, Math.sin(ph) * r * 300]; });
    const torus = mk(i => { const a = i % 40, b = Math.floor(i / 40), u = b / 40 * TAU, v = a / 40 * TAU, R = 275, r = 105; return [(R + r * Math.cos(v)) * Math.cos(u), r * Math.sin(v), (R + r * Math.cos(v)) * Math.sin(u)]; });
    const galaxy = mk(i => {
      const arm = i % 3, h = hash(i, 3), rr = 24 + 420 * Math.sqrt(h);
      const ang = arm * TAU / 3 + rr * .0115 + (hash(i, 4) - .5) * .75 * (1 - rr / 600);
      const y = (hash(i, 5) - .5) * 50 * (1 - rr / 460);
      const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr, ct = Math.cos(-.8), st = Math.sin(-.8);
      return [x, y * ct - z * st, y * st + z * ct];
    });
    const cube = mk(i => {
      const face = i % 6, k = Math.floor(i / 6) % 256, a = (k % 16) / 15 * 2 - 1, b = Math.floor(k / 16) / 15 * 2 - 1;
      const ax = face >> 1, p = [0, 0, 0]; p[ax] = face % 2 ? 1 : -1; p[(ax + 1) % 3] = a; p[(ax + 2) % 3] = b;
      return [p[0] * 215, p[1] * 215, p[2] * 215];
    });
    const swirl = mk(i => { const u = hash(i, 11) * TAU, v = Math.acos(2 * hash(i, 12) - 1); return [Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)]; });
    return { sphere, torus, galaxy, cube, swirl };
  })();
  // [shape, start, duration, stagger, swirl]
  const M3 = [['sphere', 5.5, .55, .12, 0], ['torus', 6.0, .36, .13, 90], ['galaxy', 6.5, .36, .13, 90], ['cube', 6.97, .2, .05, 30]];
  const TRACK = (() => { const out = []; for (let i = 200; i < N3 && out.length < 2; i += 1) if (hash(i, 9) < .055 && (out.length === 0 || i > 900)) out.push(i); return out; })();

  function cam3(t) {
    let yaw = (t - 5.5) * .55 - .4;
    for (const bt of [6.0, 6.5, 7.0]) yaw += (Math.PI / 3) * E.outExpo(inv(bt, bt + .7, t));
    const pitch = -.42 + .08 * Math.sin((t - 5.5) * 1.7);
    const D = 1150 - 1350 * E.inCubic(inv(7.18, 7.5, t));
    return { cy: Math.cos(yaw), sy: Math.sin(yaw), cp: Math.cos(pitch), sp: Math.sin(pitch), D, F: 1050, yaw, pitch };
  }
  function points3(t) {
    const cam = cam3(t);
    const out = new Float32Array(N3 * 5); // sx, sy, zc, size, valid
    const blow = 1 + 1.4 * E.inQuad(inv(7.18, 7.5, t));
    for (let i = 0; i < N3; i++) {
      let x = 0, y = 0, z = 0, ox = 0, oy = 0, oz = 0;
      for (let m = 0; m < M3.length; m++) {
        const [name, T, dur, stg, swl] = M3[m];
        const delay = m === 0 ? hash(i, 7) * stg : stg * (.45 * hash(i, 7) + .55 * (y / 300 + 1) / 2);
        const raw = inv(T + delay, T + delay + dur, t);
        if (raw <= 0) break;
        const p = m === 0 ? E.outExpo(raw) : E.outQuart(raw);
        const S = P3[name];
        x = lerp(x, S[i * 3], p); y = lerp(y, S[i * 3 + 1], p); z = lerp(z, S[i * 3 + 2], p);
        const sw = 4 * p * (1 - p) * swl;
        ox += P3.swirl[i * 3] * sw; oy += P3.swirl[i * 3 + 1] * sw; oz += P3.swirl[i * 3 + 2] * sw;
      }
      x = (x + ox) * blow; y = (y + oy) * blow; z = (z + oz) * blow;
      const X1 = x * cam.cy + z * cam.sy, Z1 = -x * cam.sy + z * cam.cy;
      const Y2 = y * cam.cp - Z1 * cam.sp, Z2 = y * cam.sp + Z1 * cam.cp;
      const zc = Z2 + cam.D, o = i * 5;
      if (zc < 40) { out[o + 4] = 0; continue; }
      const sc = cam.F / zc;
      out[o] = 960 + X1 * sc; out[o + 1] = 540 + Y2 * sc; out[o + 2] = zc; out[o + 3] = sc; out[o + 4] = 1;
    }
    return { pts: out, cam };
  }
  const order3 = new Uint16Array(N3).map((_, i) => i);
  function S3(ctx, t) {
    bg(ctx, COL.ink);
    const { pts, cam } = points3(t);
    const warp = inv(7.18, 7.5, t);

    // orbit ring
    const ra = E.outExpo(inv(5.6, 6.1, t)) * (1 - warp);
    if (ra > 0) {
      ctx.strokeStyle = rgba(RGB.paper, .22 * ra); ctx.lineWidth = 1.5; ctx.setLineDash([5, 11]);
      ctx.beginPath();
      for (let k = 0; k <= 128; k++) {
        const a = k / 128 * TAU, x = Math.cos(a) * 500 * ra, z = Math.sin(a) * 500 * ra;
        const X1 = x * cam.cy + z * cam.sy, Z1 = -x * cam.sy + z * cam.cy;
        const Y2 = -Z1 * cam.sp, Z2 = Z1 * cam.cp, sc = cam.F / (Z2 + cam.D);
        k ? ctx.lineTo(960 + X1 * sc, 540 + Y2 * sc) : ctx.moveTo(960 + X1 * sc, 540 + Y2 * sc);
      }
      ctx.stroke(); ctx.setLineDash([]);
    }

    // depth-sorted points
    order3.sort((a, b) => pts[b * 5 + 2] - pts[a * 5 + 2]);
    if (warp > 0) {
      const prev = points3(t - .028).pts;
      ctx.lineCap = 'round';
      for (const i of order3) {
        const o = i * 5; if (!pts[o + 4] || !prev[o + 4]) continue;
        const near = clamp(1 - (pts[o + 2] - 200) / 1200);
        ctx.strokeStyle = hash(i, 9) < .06 ? COL.orange : rgba(mix(RGB.blue, RGB.paper, near));
        ctx.lineWidth = Math.min(9, 2.6 * pts[o + 3]);
        ctx.beginPath(); ctx.moveTo(prev[o], prev[o + 1]); ctx.lineTo(pts[o], pts[o + 1]); ctx.stroke();
      }
    } else {
      for (const i of order3) {
        const o = i * 5; if (!pts[o + 4]) continue;
        const near = clamp(1 - (pts[o + 2] - 850) / 600);
        const acc = hash(i, 9) < .06;
        ctx.fillStyle = acc ? COL.orange : rgba(mix(RGB.blue, RGB.paper, near));
        const r = (acc ? 4.6 : 3.1) * pts[o + 3];
        ctx.beginPath(); ctx.arc(pts[o], pts[o + 1], r, 0, TAU); ctx.fill();
      }
    }

    // tracked callouts
    const ca = inv(5.85, 5.95, t) * (1 - inv(7.0, 7.1, t));
    if (ca > 0) {
      TRACK.forEach((i, n) => {
        const o = i * 5; if (!pts[o + 4]) return;
        const px = pts[o], py = pts[o + 1], lx = px + (n ? -150 : 150), ly = py + (n ? 120 : -110);
        ctx.save(); ctx.globalAlpha = ca;
        ctx.strokeStyle = ctx.fillStyle = COL.paper; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px, py, 11, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px + (n ? -11 : 11) * .7, py + (n ? 11 : -11) * .7); ctx.lineTo(lx, ly); ctx.stroke();
        setFont(ctx, `500 13px ${F.mono}`, 1.2);
        const nx = ((px - 960) / 300).toFixed(2), ny = ((540 - py) / 300).toFixed(2), nz = ((pts[o + 2] - cam.D) / 300).toFixed(2);
        const l1 = `PT.${String(i).padStart(4, '0')}`, l2 = `x ${nx}  y ${ny}  z ${nz}`;
        const bw = 236, bx = n ? lx - bw : lx;
        ctx.fillStyle = rgba(RGB.ink, .85); ctx.fillRect(bx, ly - 22, bw, 44);
        ctx.strokeRect(bx, ly - 22, bw, 44);
        ctx.fillStyle = COL.orange; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillText(l1, bx + 10, ly - 9);
        ctx.fillStyle = COL.paper; ctx.fillText(l2, bx + 10, ly + 10);
        ctx.restore();
      });
    }

    // axis gizmo
    const ga = inv(5.6, 5.8, t) * (1 - warp);
    if (ga > 0) {
      const gx = W - 150, gy = H - 170;
      ctx.save(); ctx.globalAlpha = ga; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      setFont(ctx, `700 12px ${F.mono}`, 0); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const [v, c, l] of [[[1, 0, 0], COL.orange, 'X'], [[0, -1, 0], COL.lime, 'Y'], [[0, 0, 1], '#7F86FF', 'Z']]) {
        const X1 = v[0] * cam.cy + v[2] * cam.sy, Z1 = -v[0] * cam.sy + v[2] * cam.cy, Y2 = v[1] * cam.cp - Z1 * cam.sp;
        ctx.strokeStyle = ctx.fillStyle = c;
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + X1 * 44, gy + Y2 * 44); ctx.stroke();
        ctx.fillText(l, gx + X1 * 60, gy + Y2 * 60);
      }
      ctx.restore();
    }

    // shape label
    const names = ['SPHERE', 'TORUS', 'SPIRAL', 'CUBE'];
    let cur = 0; M3.forEach(([, T], m) => { if (t >= T) cur = m; });
    const la = inv(5.6, 5.75, t) * (1 - warp);
    if (la > 0) {
      setFont(ctx, `600 14px ${F.mono}`, 2);
      ctx.fillStyle = rgba(RGB.paper, .75 * la); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(scramble(`${N3} POINTS  ·  ${names[cur]}`, t, M3[cur][1], .012, .1), 160, 150);
    }

    // exit: blue iris
    const ir = 1180 * E.inCubic(inv(7.22, 7.5, t));
    if (ir > 0) { ctx.fillStyle = COL.blue; ctx.beginPath(); ctx.arc(960, 540, ir, 0, TAU); ctx.fill(); }
  }

  // ================================================================ 05 FLUID
  const BALLS = [
    [150, 470, 230, .83, 1.21, 0.0, .9], [125, 400, 280, 1.13, .77, 2.1, .2], [110, 560, 200, .67, 1.43, 4.0, 2.4],
    [95, 330, 300, 1.37, .97, 1.3, 3.9], [85, 600, 260, .91, 1.09, 5.2, 1.6], [70, 250, 180, 1.71, 1.29, 3.3, 5.1],
    [58, 520, 320, 1.21, .63, .7, 4.4], [44, 700, 150, 1.53, 1.77, 2.8, .5], [36, 380, 340, .59, 1.91, 4.7, 3.2],
  ];
  function ballsAt(t) {
    const sp = E.outExpo(inv(7.5, 8.3, t)) * (1 - .35 * E.inCubic(inv(9.1, 9.5, t)));
    const gr = E.outBack(inv(7.5, 7.92, t), 1.6);
    const grow = 1 + 9 * E.inExpo(inv(9.1, 9.5, t));
    const tau = (t - 7.5) * 2.1 + 1;
    return BALLS.map(([r, ax, ay, fx, fy, px, py], k) => {
      let pr = 1;
      for (const b of [8.0, 8.5, 9.0]) { const d = t - b - k * .012; if (d > 0) pr += .16 * Math.exp(-d * 7) * Math.cos(d * 24); }
      return { x: 960 + sp * ax * Math.sin(fx * tau + px), y: 540 + sp * ay * Math.sin(fy * tau + py), r: r * gr * pr * grow };
    });
  }
  const BUF = {};
  function buf(name, w, h) {
    let b = BUF[name];
    if (!b || b.w !== w || b.h !== h) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      b = BUF[name] = { c, x: c.getContext('2d'), w, h };
    }
    return b;
  }
  const QUALITY = { field: 2 };
  function fluidText(ctx, t, fill) {
    setFont(ctx, `italic 400 430px ${F.serif}`, -4);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = fill;
    const fa = 1 - inv(9.18, 9.4, t);
    drawRow(ctx, 'fluid.', 960, 690, 150, (i) => {
      const st = 7.62 + i * .05, p = E.outExpo(inv(st, st + .7, t));
      return { dy: (1 - p) * 120 + 16 * Math.sin(t * 4.4 + i * .9), rot: .06 * Math.sin(t * 3.1 + i * 1.3), alpha: inv(st, st + .15, t) * fa };
    });
  }
  function S4(ctx, t) {
    bg(ctx, COL.blue);
    const q = QUALITY.field, fw = Math.round(W / q), fh = Math.round(H / q);
    const B = buf('field', fw, fh);
    if (!B.img) { B.img = B.x.createImageData(fw, fh); B.f = new Float32Array(fw * fh); }
    const balls = ballsAt(t), n = balls.length;
    const bx = balls.map(b => b.x / q), by = balls.map(b => b.y / q), br = balls.map(b => (b.r / q) ** 2);

    fluidText(ctx, t, COL.paper);

    const f = B.f;
    for (let y = 0; y < fh; y++) {
      const row = y * fw;
      for (let x = 0; x < fw; x++) {
        let s = 0;
        for (let k = 0; k < n; k++) { const dx = x - bx[k], dy = y - by[k]; s += br[k] / (dx * dx + dy * dy + 1); }
        f[row + x] = s;
      }
    }
    const d = B.img.data, T0 = 1, T1 = 1.75, T2 = 3.0;
    const L = RGB.lime, O = RGB.orange, P = RGB.paper;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const i = y * fw + x, v = f[i];
        const xl = x > 0 ? f[i - 1] : v, xr = x < fw - 1 ? f[i + 1] : v, yu = y > 0 ? f[i - fw] : v, yd = y < fh - 1 ? f[i + fw] : v;
        const g = Math.sqrt((xr - xl) ** 2 + (yd - yu) ** 2) * .5 + 1e-6;
        const a0 = clamp((v - T0) / g + .5);
        const o = i * 4;
        if (a0 <= 0) { d[o + 3] = 0; continue; }
        const a1 = clamp((v - T1) / g + .5), a2 = clamp((v - T2) / g + .5);
        let r = L[0] + (O[0] - L[0]) * a1, gg = L[1] + (O[1] - L[1]) * a1, b = L[2] + (O[2] - L[2]) * a1;
        r += (P[0] - r) * a2; gg += (P[1] - gg) * a2; b += (P[2] - b) * a2;
        // fine contour lines inside each band
        const cl = Math.abs(((Math.log(v) * 9) % 1 + 1) % 1 - .5);
        const lw = clamp((.5 - cl) * 9 / (g / v * 9 + 1e-6) - 2.2);
        const shade = 1 - .1 * clamp(1 - lw) * (1 - a2);
        d[o] = r * shade; d[o + 1] = gg * shade; d[o + 2] = b * shade; d[o + 3] = a0 * 255;
      }
    }
    B.x.putImageData(B.img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(B.c, 0, 0, W, H);

    // knockout: the word turns ink wherever the fluid covers it
    const K = buf('knock', W, H);
    K.x.setTransform(1, 0, 0, 1, 0, 0);
    K.x.globalCompositeOperation = 'source-over';
    K.x.clearRect(0, 0, W, H);
    K.x.setTransform(ctx.getTransform());
    fluidText(K.x, t, COL.ink);
    K.x.setTransform(1, 0, 0, 1, 0, 0);
    K.x.globalCompositeOperation = 'destination-in';
    K.x.drawImage(B.c, 0, 0, W, H);
    K.x.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(K.c, 0, 0); ctx.restore();
  }

  // ================================================================ 06 TIMING
  const GE = { x: 150, y: 236, w: 700, h: 600 };
  GE.px = GE.x + 50; GE.py = GE.y + 40; GE.pw = GE.w - 90; GE.ph = GE.h - 100;
  const gmap = (u, v) => [GE.px + u * GE.pw, GE.py + GE.ph - v * GE.ph];
  const LANES = [
    ['LINEAR', E.lin, RGB.ink], ['EASE IN', E.inCubic, RGB.ink], ['EASE OUT', E.outCubic, RGB.ink],
    ['EASY EASE', E.easy, RGB.orange], ['SPRING', E.spring, RGB.blue],
  ];
  const RACE = [10.42, 11.17];
  function S5(ctx, t) {
    bg(ctx, COL.paper);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    // --- graph editor panel
    const pa = E.outExpo(inv(9.5, 9.9, t));
    ctx.strokeStyle = rgba(RGB.ink, .09); ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k <= 8; k++) {
      const x = GE.px + GE.pw * k / 8, y = GE.py + GE.ph * k / 8;
      ctx.moveTo(x, GE.py + GE.ph); ctx.lineTo(x, GE.py + GE.ph - GE.ph * pa);
      ctx.moveTo(GE.px, y); ctx.lineTo(GE.px + GE.pw * pa, y);
    }
    ctx.stroke();
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(GE.px, GE.py + GE.ph - (GE.ph + 20) * pa); ctx.lineTo(GE.px, GE.py + GE.ph); ctx.lineTo(GE.px + (GE.pw + 20) * pa, GE.py + GE.ph); ctx.stroke();
    setFont(ctx, `700 15px ${F.mono}`, 2.5); ctx.fillStyle = COL.ink;
    ctx.fillText(scramble('GRAPH EDITOR', t, 9.55, .015, .1), GE.x, GE.y - 6);
    setFont(ctx, `500 13px ${F.mono}`, 1.5); ctx.fillStyle = rgba(RGB.ink, .55);
    ctx.save(); ctx.translate(GE.px - 18, GE.py + 60); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'right';
    ctx.fillText(scramble('VALUE →', t, 9.6), 0, 0); ctx.restore();
    ctx.fillText(scramble('TIME →', t, 9.62), GE.px + GE.pw - 40, GE.py + GE.ph + 32);

    // handles
    const hk = E.outBack(inv(10.02, 10.42, t), 1.8);
    const h1 = [lerp(1 / 3, .86, hk), lerp(1 / 3, 0, hk)], h2 = [lerp(2 / 3, .07, hk), lerp(2 / 3, 1, hk)];
    const P0 = gmap(0, 0), P1 = gmap(...h1), P2 = gmap(...h2), P3 = gmap(1, 1);
    const bz = (u, i) => (1 - u) ** 3 * P0[i] + 3 * (1 - u) ** 2 * u * P1[i] + 3 * (1 - u) * u * u * P2[i] + u ** 3 * P3[i];
    const dp = E.inOutCubic(inv(9.62, 9.98, t));
    if (dp > 0) {
      ctx.strokeStyle = COL.orange; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let k = 0; k <= 120 * dp; k++) { const u = k / 120; k ? ctx.lineTo(bz(u, 0), bz(u, 1)) : ctx.moveTo(bz(u, 0), bz(u, 1)); }
      ctx.stroke();
    }
    const ha = E.outBack(inv(9.96, 10.12, t), 2.5);
    if (ha > 0) {
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(...P0); ctx.lineTo(...P1); ctx.moveTo(...P3); ctx.lineTo(...P2); ctx.stroke();
      for (const P of [P1, P2]) {
        ctx.fillStyle = COL.paper; ctx.beginPath(); ctx.arc(P[0], P[1], 9 * ha, 0, TAU); ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = COL.orange; ctx.stroke();
      }
    }
    // keyframe diamonds
    const ka = E.outBack(inv(9.6, 9.8, t), 2.5);
    for (const P of [P0, P3]) {
      ctx.save(); ctx.translate(P[0], P[1]); ctx.rotate(Math.PI / 4); ctx.scale(ka, ka);
      ctx.fillStyle = COL.ink; ctx.fillRect(-9, -9, 18, 18); ctx.restore();
    }
    // curve readout
    setFont(ctx, `500 14px ${F.mono}`, 1);
    ctx.fillStyle = rgba(RGB.ink, .75);
    const label = hk > .02 ? `cubic-bezier(${h1[0].toFixed(2)}, ${h1[1].toFixed(2)}, ${h2[0].toFixed(2)}, ${h2[1].toFixed(2)})` : 'linear';
    if (t > 9.7) { const L = layout(ctx, label); ctx.fillText(label, GE.x + GE.w - L.w - 40, GE.y - 6); }

    // F9 keycap — the oldest shortcut in the book
    const kc = E.outBack(inv(9.98, 10.12, t), 3) * (1 - inv(10.7, 10.85, t));
    if (kc > 0) {
      const kx = GE.px + GE.pw * .62, ky = GE.py + GE.ph * .78;
      const press = t > 10.02 && t < 10.1 ? 4 : 0;
      ctx.save(); ctx.translate(kx, ky + press); ctx.scale(kc, kc);
      ctx.fillStyle = COL.ink; roundRect(ctx, -36, -30 + 6 - press, 72, 60, 10); ctx.fill();
      ctx.fillStyle = COL.paper; roundRect(ctx, -36, -36, 72, 60, 10); ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = COL.ink; ctx.stroke();
      setFont(ctx, `700 24px ${F.mono}`, 0); ctx.fillStyle = COL.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('F9', 0, -6);
      setFont(ctx, `600 12px ${F.mono}`, 2); ctx.textAlign = 'left';
      ctx.fillText('EASY EASE', 50, -6);
      ctx.restore();
    }

    // --- easing race
    const RX0 = 1040, RX1 = 1760;
    const rt = inv(RACE[0], RACE[1], t);
    LANES.forEach(([name, fn, c], k) => {
      const y = 316 + k * 118, st = 9.58 + k * .05;
      const la = E.outExpo(inv(st, st + .4, t));
      ctx.strokeStyle = rgba(RGB.ink, .18); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(RX0, y); ctx.lineTo(lerp(RX0, RX1, la), y); ctx.stroke();
      ctx.fillStyle = COL.ink;
      ctx.fillRect(RX0 - 1, y - 9, 2, 18 * la);
      if (la > .9) ctx.fillRect(RX1 - 1, y - 9, 2, 18);
      setFont(ctx, `600 14px ${F.mono}`, 2);
      ctx.fillStyle = k === 3 ? COL.orange : rgba(RGB.ink, .7);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(scramble(name, t, st + .05, .015, .1), RX0, y - 30);
      // spacing chart
      ctx.fillStyle = rgba(c, .35);
      for (let m = 1; m / 24 <= rt + 1e-6; m++) {
        const x = lerp(RX0, RX1, fn(m / 24));
        ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
      }
      const ba = E.outBack(inv(st + .1, st + .3, t), 2.5);
      const x = lerp(RX0, RX1, fn(rt));
      ctx.fillStyle = rgba(c);
      ctx.beginPath(); ctx.arc(x, y, 19 * ba, 0, TAU); ctx.fill();
    });

    // playhead on the graph, synced to the race
    if (t > RACE[0] - .05) {
      const ph = rt, P = gmap(ph, E.easy(ph));
      ctx.strokeStyle = COL.blue; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(P[0], GE.py - 6); ctx.lineTo(P[0], GE.py + GE.ph + 6); ctx.stroke();
      ctx.fillStyle = COL.blue; ctx.beginPath(); ctx.arc(P[0], P[1], 10, 0, TAU); ctx.fill();
      setFont(ctx, `600 13px ${F.mono}`, 1);
      ctx.fillText(`t ${ph.toFixed(2)}  v ${E.easy(ph).toFixed(2)}`, P[0] + 16, P[1] + (ph < .5 ? -16 : 26));
      ctx.fillStyle = rgba(RGB.blue, .9);
      ctx.fillRect(P[0] - 9, GE.py + GE.ph + 8, 18, 6);
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function sliceOut(ctx, t) {
    const ang = -.36, dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx, L = 3200;
    const sep = 760 * E.inCubic(inv(11.27, 11.5, t)) + 6 * inv(11.25, 11.27, t);
    const slide = 300 * E.inOutCubic(inv(11.25, 11.5, t));
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * (nx * sep + dx * slide), s * (ny * sep + dy * slide));
      ctx.beginPath();
      ctx.moveTo(960 - dx * L, 540 - dy * L); ctx.lineTo(960 + dx * L, 540 + dy * L);
      ctx.lineTo(960 + dx * L + s * nx * L, 540 + dy * L + s * ny * L); ctx.lineTo(960 - dx * L + s * nx * L, 540 - dy * L + s * ny * L);
      ctx.closePath(); ctx.clip();
      S5(ctx, t);
      ctx.restore();
    }
    const bl = 1 - inv(11.25, 11.33, t);
    if (bl > 0) {
      ctx.strokeStyle = rgba(RGB.orange, bl); ctx.lineWidth = 4;
      const k = E.outExpo(inv(11.22, 11.27, t));
      ctx.beginPath(); ctx.moveTo(960 - dx * L * k, 540 - dy * L * k); ctx.lineTo(960 + dx * L * k, 540 + dy * L * k); ctx.stroke();
    }
  }

  // ================================================================ 07 ENERGY
  const CUT = .25, M0 = 11.5;
  function S6(ctx, t) {
    const c = clamp(Math.floor((t - M0) / CUT), 0, 5), u = t - (M0 + c * CUT);
    const punch = 1 + .07 * (1 - E.outExpo(clamp(u / .2)));
    ctx.save();
    ctx.translate(960, 540); ctx.scale(punch, punch); ctx.translate(-960, -540);
    [cutHalftone, cutRings, cutRhythm, cutCubes, cutLissajous, cutImplode][c](ctx, t, u);
    ctx.restore();
  }
  function cutHalftone(ctx, t, u) {
    bg(ctx, COL.ink);
    ctx.fillStyle = COL.paper;
    ctx.beginPath();
    const sp = 40;
    for (let j = -1; j <= 28; j++) for (let i = -1; i <= 49; i++) {
      const x = i * sp + (j % 2 ? sp / 2 : 0), y = j * sp;
      const d1 = Math.hypot(x - 960, y - 540), d2 = Math.hypot(x - 200, y - 1000);
      const v = .5 + .3 * Math.sin(d1 * .016 - t * 15) + .2 * Math.sin(d2 * .021 - t * 11);
      const r = 1.5 + 17 * clamp(v) ** 2;
      ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
    }
    ctx.fill();
  }
  function cutRings(ctx, t, u) {
    bg(ctx, COL.orange);
    ctx.lineCap = 'butt';
    for (let k = 0; k < 8; k++) {
      const r = 80 + k * 66, n = 2 + (k * 3) % 5, span = TAU / n * (.42 + .3 * hash(k, 1));
      const dir = k % 2 ? 1 : -1;
      const a0 = dir * (3.2 * E.outExpo(clamp(u / .24)) + t * (.6 + .3 * k)) + k;
      ctx.strokeStyle = k === 2 ? COL.paper : k === 5 ? COL.blue : COL.ink;
      ctx.lineWidth = 12 + (k % 3) * 9;
      for (let m = 0; m < n; m++) { ctx.beginPath(); ctx.arc(960, 540, r, a0 + m * TAU / n, a0 + m * TAU / n + span); ctx.stroke(); }
    }
    ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(960, 540, 26 + 8 * Math.sin(t * 30), 0, TAU); ctx.fill();
  }
  function cutRhythm(ctx, t, u) {
    bg(ctx, COL.blue);
    setFont(ctx, `900 300px ${F.sans}`, -6);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const L = layout(ctx, 'RHYTHM'), x = 960 - L.w / 2, base = 650;
    ctx.strokeStyle = COL.paper; ctx.lineWidth = 2.5;
    for (let k = 4; k >= 1; k--) {
      const e = E.outBack(clamp((u - k * .012) / .2), 1.8);
      for (const s of [-1, 1]) { ctx.globalAlpha = 1 - k * .18; ctx.strokeText('RHYTHM', x, base + s * k * 124 * e); }
    }
    ctx.globalAlpha = 1;
    const sq = 1 + .5 * (1 - E.outExpo(clamp(u / .18)));
    ctx.save(); ctx.translate(960, base - 110); ctx.scale(sq, 1 / sq); ctx.translate(-960, -(base - 110));
    ctx.fillStyle = COL.lime; ctx.fillText('RHYTHM', x, base);
    ctx.restore();
  }
  function cutCubes(ctx, t, u) {
    bg(ctx, COL.lime);
    ctx.save();
    ctx.strokeStyle = rgba(RGB.ink, .1); ctx.lineWidth = 34;
    ctx.beginPath();
    for (let k = -12; k < 30; k++) { const x = k * 100 + (t * 900) % 100; ctx.moveTo(x, -50); ctx.lineTo(x - 600, H + 50); }
    ctx.stroke(); ctx.restore();
    const V = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
    const Ed = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    [[290, 1, COL.ink, 8], [200, -1.4, COL.ink, 6], [110, 2, COL.orange, 8]].forEach(([s, sp, c, lw], n) => {
      const a = t * 2.6 * sp + n + 2.2 * E.outExpo(clamp(u / .22)) * sp, b = .62 + t * 1.3 * sp;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      const P = V.map(([x, y, z]) => {
        const X = x * ca + z * sa, Z = -x * sa + z * ca, Y = y * cb - Z * sb, Z2 = y * sb + Z * cb;
        const k = 900 / (Z2 * s + 1300); return [960 + X * s * k, 540 + Y * s * k];
      });
      ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath();
      for (const [i, j] of Ed) { ctx.moveTo(...P[i]); ctx.lineTo(...P[j]); }
      ctx.stroke();
    });
  }
  function cutLissajous(ctx, t, u) {
    bg(ctx, COL.paper);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const S = TAU * E.outCubic(clamp(u / .25));
    [[COL.blue, 0, 16], [COL.orange, .5, 16]].forEach(([c, ph, lw]) => {
      ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath();
      let lx = 0, ly = 0;
      for (let s = 0; s <= S; s += .01) {
        lx = 960 + 640 * Math.sin(3 * s + Math.PI / 2 + ph); ly = 540 + 340 * Math.sin(4 * s + ph);
        s ? ctx.lineTo(lx, ly) : ctx.moveTo(lx, ly);
      }
      ctx.stroke();
      ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(lx, ly, 14, 0, TAU); ctx.fill();
    });
  }
  function cutImplode(ctx, t, u) {
    bg(ctx, COL.ink);
    const k = E.inExpo(clamp(u / .25));
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(RGB.paper, .12); ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < 90; i++) {
      const a = i / 90 * TAU, r0 = 140 + 600 * k, r1 = 1300;
      ctx.moveTo(960 + Math.cos(a) * r0, 540 + Math.sin(a) * r0); ctx.lineTo(960 + Math.cos(a) * r1, 540 + Math.sin(a) * r1);
    }
    ctx.stroke();
    for (let i = 0; i < 200; i++) {
      const a = i * 2.39996 + u * 4 * (1 + hash(i, 2)), r = (380 + 760 * hash(i, 1)) * (1 - k);
      const tail = 1 + .1 + .5 * k;
      ctx.strokeStyle = hash(i, 3) < .2 ? COL.orange : COL.paper;
      ctx.lineWidth = 2 + 4 * hash(i, 4);
      ctx.beginPath(); ctx.moveTo(960 + Math.cos(a) * r, 540 + Math.sin(a) * r); ctx.lineTo(960 + Math.cos(a) * r * tail, 540 + Math.sin(a) * r * tail); ctx.stroke();
    }
    const rr = 900 * (1 - E.inCubic(clamp(u / .25)));
    ctx.strokeStyle = COL.orange; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(960, 540, Math.max(1, rr), 0, TAU); ctx.stroke();
    ctx.fillStyle = COL.paper; ctx.beginPath(); ctx.arc(960, 540, 6 + 30 * k, 0, TAU); ctx.fill();
  }

  // ================================================================ 08 HELLO
  const MARK = [
    ['circle', RGB.orange, -1, -1, 0], ['square', RGB.blue, 1, -1, Math.PI / 2],
    ['plus', RGB.lime, -1, 1, Math.PI / 4], ['tri', RGB.paper, 1, 1, Math.PI],
  ];
  function S7(ctx, t) {
    bg(ctx, COL.ink);
    const lt = t - 13.0;
    const MX = 960, MY = 372, step = 50, rad = 38;

    // slow ring around the mark
    const ra = E.outExpo(inv(.25, 1.0, lt));
    if (ra > 0) {
      ctx.save(); ctx.translate(MX, MY); ctx.rotate(lt * .5);
      ctx.strokeStyle = rgba(RGB.paper, .25); ctx.lineWidth = 1.5; ctx.setLineDash([3, 9]);
      ctx.beginPath(); ctx.arc(0, 0, 126 * ra, 0, TAU * ra); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    }
    // the mark: four primitives from the reel, assembled
    MARK.forEach(([shape, col, sx, sy, rot], k) => {
      const st = k * .045, p = inv(st, st + .5, lt);
      if (p <= 0) return;
      const m = E.outExpo(p), s = E.outBack(p, 1.7);
      const x = lerp(960, MX + sx * step, m), y = lerp(540, MY + sy * step, m);
      const w = { circle: 1 }; blendWeights(w, shape, E.outExpo(inv(st + .05, st + .55, lt)));
      let r = lerp(-Math.PI, rot, m);
      for (const b of [1.0, 1.5]) if (k === (b === 1.0 ? 1 : 2)) r += Math.PI / 2 * E.outBack(inv(b, b + .4, lt), 2);
      ctx.fillStyle = rgba(col);
      polarPath(ctx, x, y, rad * s, w, r);
      ctx.fill();
    });

    // wordmark
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    setFont(ctx, `900 196px ${F.sans}`, -3);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 470, W, 200); ctx.clip();
    ctx.fillStyle = COL.paper;
    drawRow(ctx, 'CLAUDE', 960, 650, 70, (i) => {
      const p = E.outExpo(inv(.2 + i * .04, .85 + i * .04, lt));
      return { dy: (1 - p) * 200 };
    });
    ctx.restore();

    // rule
    const rl = E.outExpo(inv(.5, 1.0, lt));
    ctx.fillStyle = COL.orange; ctx.fillRect(960 - 340 * rl, 694, 680 * rl, 3);

    // title — decode
    setFont(ctx, `600 26px ${F.mono}`, 11);
    ctx.fillStyle = COL.paper;
    { const s = 'MOTION DESIGNER', L = layout(ctx, s); ctx.fillText(scramble(s, lt, .62, .03, .18), 960 - L.w / 2, 752); }

    // call to action
    setFont(ctx, `italic 400 66px ${F.serif}`, 0);
    ctx.fillStyle = COL.orange;
    const words = ["Let's", 'make', 'something', 'move.'];
    const full = words.join(' '), L = layout(ctx, full);
    let x = 960 - L.w / 2;
    words.forEach((wd, k) => {
      const p = E.outExpo(inv(1.0 + k * .07, 1.6 + k * .07, lt));
      ctx.save(); ctx.globalAlpha = p; ctx.fillText(wd, x, 862 + (1 - p) * 40); ctx.restore();
      x += layout(ctx, wd + ' ').w;
    });

    // footer
    setFont(ctx, `500 13px ${F.mono}`, 3);
    ctx.fillStyle = rgba(RGB.paper, .5);
    { const s = 'SHOWREEL 2026  ·  EVERY FRAME RENDERED FROM CODE  ·  0 KEYFRAMES', L = layout(ctx, s); ctx.fillText(scramble(s, lt, 1.25, .008, .12), 960 - L.w / 2, 958); }

    // entrance flash
    const sw = inv(0, .55, lt);
    if (sw > 0 && sw < 1) {
      ctx.strokeStyle = rgba(RGB.orange, 1 - sw); ctx.lineWidth = 40 * (1 - sw) + 1;
      ctx.beginPath(); ctx.arc(960, 540, 20 + 1300 * E.outExpo(sw), 0, TAU); ctx.stroke();
      ctx.strokeStyle = rgba(RGB.paper, .6 * (1 - sw)); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(960, 540, 10 + 900 * E.outExpo(sw), 0, TAU); ctx.stroke();
    }
    const fl = 1 - E.outQuad(inv(0, .1, lt));
    if (fl > 0) { ctx.fillStyle = rgba(RGB.paper, .85 * fl); ctx.fillRect(-100, -100, W + 200, H + 200); }
  }

  // ================================================================ HUD
  const HUD_SCENES = [[0, '01', 'PRINCIPLES'], [1.5, '02', 'TYPOGRAPHY'], [3.5, '03', 'SYSTEMS'], [5.5, '04', 'DIMENSION'], [7.5, '05', 'FLUID'], [9.5, '06', 'TIMING'], [11.5, '07', 'ENERGY'], [13.0, '08', 'HELLO']];
  const HUD_COLOR = [[0, 'paper'], [1.5, 'ink'], [3.5, 'ink'], [5.5, 'paper'], [7.5, 'paper'], [9.5, 'ink'], [11.5, 'paper'], [11.75, 'ink'], [12, 'paper'], [12.25, 'ink'], [12.5, 'ink'], [12.75, 'paper'], [13, 'paper']];
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

    // top left
    setFont(ctx, `700 15px ${F.mono}`, 2.4);
    const tl = 'CLAUDE', tl2 = ' / MOTION REEL 2026';
    ctx.fillText(scramble(tl, t, .1, .03, .12), m + 40, m + 1);
    const w1 = layout(ctx, tl).w + 2.4;
    setFont(ctx, `400 15px ${F.mono}`, 2.4);
    ctx.fillText(scramble(tl2, t, .2, .015, .12), m + 40 + w1, m + 1);
    const tlEnd = m + 40 + w1 + layout(ctx, tl2).w;

    // top right: rec + timecode
    const tc = timecode(t), tcw = layout(ctx, tc).w, tcx = W - m - 40 - tcw;
    ctx.globalAlpha = inv(.2, .4, t);
    ctx.fillText(tc, tcx, m + 1);
    const rec = 'REC', rw = layout(ctx, rec).w;
    ctx.fillText(rec, tcx - 26 - rw, m + 1);
    if (Math.floor(t * 2) % 2 === 0) { ctx.beginPath(); ctx.arc(tcx - 26 - rw - 14, m + 1, 5, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;

    // timeline between
    const x0 = tlEnd + 34, x1 = tcx - 26 - rw - 40, tlw = (x1 - x0) * E.outExpo(inv(.15, .8, t));
    ctx.globalAlpha = .25; ctx.fillRect(x0, m, tlw, 2); ctx.globalAlpha = 1;
    ctx.fillRect(x0, m, Math.min(tlw, (x1 - x0) * t / DUR), 2);
    for (const [st] of HUD_SCENES) { const x = x0 + (x1 - x0) * st / DUR; if (x - x0 <= tlw) ctx.fillRect(x - 1, m - (t >= st ? 6 : 4), 2, t >= st ? 14 : 10); }

    // bottom left: scene index
    ctx.save();
    ctx.beginPath(); ctx.rect(m + 30, H - m - 16, 600, 34); ctx.clip();
    HUD_SCENES.forEach(([st, num, name], k) => {
      const next = HUD_SCENES[k + 1];
      const pin = E.outExpo(inv(st, st + .4, t)), pout = next ? E.outExpo(inv(next[0], next[0] + .4, t)) : 0;
      if (pin <= 0 || pout >= 1) return;
      const y = H - m + 1 + (1 - pin) * 30 - pout * 30;
      setFont(ctx, `700 15px ${F.mono}`, 2.4);
      ctx.fillText(num, m + 40, y);
      const nw = layout(ctx, num + '  ').w;
      setFont(ctx, `400 15px ${F.mono}`, 2.4);
      ctx.fillText('—  ' + name, m + 40 + nw, y);
    });
    ctx.restore();

    // bottom right: metronome
    const bt = Math.floor(t * BPM / 60) % 4, sq = 11, gap = 7;
    let bx = W - m - 40 - (4 * sq + 3 * gap);
    setFont(ctx, `400 15px ${F.mono}`, 2.4);
    const bl = '120 BPM  ·  60 FPS', blw = layout(ctx, bl).w;
    ctx.globalAlpha = inv(.25, .45, t);
    ctx.fillText(bl, bx - 24 - blw, H - m + 1);
    for (let k = 0; k < 4; k++) {
      ctx.lineWidth = 1.5;
      if (k === bt) ctx.fillRect(bx, H - m + 1 - sq / 2, sq, sq); else ctx.strokeRect(bx + .75, H - m + 1 - sq / 2 + .75, sq - 1.5, sq - 1.5);
      bx += sq + gap;
    }
    ctx.restore();
  }

  // ================================================================ compositor
  function renderScene(ctx, t) {
    ctx.save();
    const sh = shake(t);
    ctx.translate(960 + sh.x, 540 + sh.y); ctx.rotate(sh.r); ctx.translate(-960, -540);
    if (t < 1.5) S0(ctx, t);
    else if (t < 3.5) S1(ctx, t);
    else if (t < 5.5) S2(ctx, t);
    else if (t < 7.5) S3(ctx, t);
    else if (t < 9.5) S4(ctx, t);
    else if (t < 11.25) S5(ctx, t);
    else if (t < 11.5) { S6(ctx, t); sliceOut(ctx, t); }
    else if (t < 13.0) S6(ctx, t);
    else S7(ctx, t);
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
        S.x.setTransform(1, 0, 0, 1, 0, 0);
        renderScene(S.x, t + (k / N) * shutter);
        ctx.globalAlpha = 1 / (k + 1);
        ctx.drawImage(S.c, 0, 0);
      }
      ctx.globalAlpha = 1;
    }
    if (opts.fx !== false) rgbSplit(ctx, splitAmt(t));
    drawHUD(ctx, t);
    ctx.restore();
  }

  global.REEL = { W, H, FPS, DUR, BPM, renderFrame, QUALITY, COL };
})(typeof window !== 'undefined' ? window : globalThis);
