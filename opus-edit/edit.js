/*
 * OPUS 5.5 — motion graphics edit
 * ------------------------------------------------------------
 * Every frame is a pure function of the frame number, the footage plate, the person matte and the
 * tracking rig (rig.json). Graphics follow what is said, word for word:
 *
 *   0.0  "A Anthropic acabou de anunciar"        URGENTE badge, ANTHROPIC behind the head, broadcast rings
 *   3.0  "que o Opus 5.5"                          OPUS 5.5 slam + counter, rays, punch-in
 *   4.8  "acaba de ultrapassar o GPT-6"            ranking race panel, overtake, ULTRAPASSOU stamp
 *   8.7  "esse modelo aqui que tá na minha mão"    holographic model tracked to the palm
 *  11.5  "vou até esticar ele aqui"                model stretches between the palm and the pinch
 *  14.4  "e agora vai sumir"                       snaps back, implodes, poof
 *  15.8  "e também, cara, o que acontece?"         snap zoom, manga speed lines, question marks
 *  17.8  "ultrapassou todos os benchmarks"         marquee behind the head, category chips thrown from the hands
 *  21.5  "aqui tá a tela do benchmark"             screen held between the L-shaped hands (hands stay in front)
 *  23.8  "é isso mesmo"                            check stamp
 *  24.6  "agora vamos continuar o vídeo?"          progress bar, play-shaped wipe out
 *
 * Layers: plate → behind graphics → person (plate × matte) → world graphics → screen HUD → captions → post.
 */
(function (global) {
  'use strict';

  const W = 1920, H = 1080, FPS = 30, TAU = Math.PI * 2;
  const C = { orange: '#FF6A2B', cyan: '#5EF2FF', lime: '#C8FF2E', red: '#FF2D46', paper: '#F4EFE6', ink: '#07080C', grey: '#9AA3AD' };
  const F = { anton: 'Anton, Impact, sans-serif', sans: 'InterV, Inter, sans-serif', mono: 'JBM, monospace', serif: 'Serif, Georgia, serif' };

  // ---------------------------------------------------------------- math
  const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, x) => clamp((x - a) / (b - a));
  const smooth = t => t * t * (3 - 2 * t);
  const E = {
    outCubic: t => 1 - (1 - t) ** 3,
    inCubic: t => t * t * t,
    inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
    outQuart: t => 1 - (1 - t) ** 4,
    outExpo: t => t >= 1 ? 1 : 1 - 2 ** (-10 * t),
    inExpo: t => t <= 0 ? 0 : 2 ** (10 * t - 10),
    inOutExpo: t => t <= 0 ? 0 : t >= 1 ? 1 : t < .5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2,
    outBack: (t, s = 1.70158) => t <= 0 ? 0 : 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
    inBack: (t, s = 1.70158) => (s + 1) * t ** 3 - s * t * t,
    outElastic: t => t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - .75) * TAU / 3) + 1,
  };
  const hash = (i, s = 0) => { const x = Math.sin(i * 127.1 + s * 311.7 + .123) * 43758.5453; return x - Math.floor(x); };
  const noise = (x, s = 0) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (hash(i, s) * (1 - u) + hash(i + 1, s) * u) * 2 - 1; };
  // in/out envelope: 0 before a, ramps to 1 by b, holds, ramps down from c to 0 at d
  const env = (t, a, b, c, d, ein = E.outCubic, eout = E.inCubic) => t < a || t > d ? 0 : ein(inv(a, b, t)) * (1 - eout(inv(c, d, t)));

  // ---------------------------------------------------------------- canvas helpers
  const mk = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function setFont(ctx, px, fam = F.sans, weight = 900, ls = 0) { ctx.font = `${weight} ${px}px ${fam}`; ctx.letterSpacing = ls + 'px'; }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const textW = (ctx, s) => ctx.measureText(s).width;
  function glow(ctx, color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
  function noGlow(ctx) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; }
  function checkMark(ctx, x, y, s, color, lw) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x - s * .45, y + s * .02); ctx.lineTo(x - s * .12, y + s * .34); ctx.lineTo(x + s * .5, y - s * .32); ctx.stroke();
    ctx.restore();
  }
  function crown(ctx, x, y, s, color) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(-s, s * .45); ctx.lineTo(-s, -s * .35); ctx.lineTo(-s * .45, s * .05); ctx.lineTo(0, -s * .6);
    ctx.lineTo(s * .45, s * .05); ctx.lineTo(s, -s * .35); ctx.lineTo(s, s * .45); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  // ---------------------------------------------------------------- rig
  let RIG = null;
  function rigAt(name, t) {
    const arr = RIG[name], x = clamp(t * FPS, 0, arr.length - 1), i = Math.floor(x), a = arr[i], b = arr[Math.min(i + 1, arr.length - 1)];
    if (!a && !b) return null;
    if (!a || !b) return a || b;
    const k = x - i;
    if (Array.isArray(a)) return a.map((v, j) => lerp(v, b[j], k));
    return { L: a.L.map((p, j) => [lerp(p[0], b.L[j][0], k), lerp(p[1], b.L[j][1], k)]), R: a.R.map((p, j) => [lerp(p[0], b.R[j][0], k), lerp(p[1], b.R[j][1], k)]) };
  }
  // last valid value of a signal at or before t (used to hold the pinch as it lets go)
  function rigLast(name, t) {
    const arr = RIG[name];
    for (let i = Math.min(arr.length - 1, Math.floor(t * FPS)); i >= 0; i--) if (arr[i]) return arr[i];
    return null;
  }

  // ---------------------------------------------------------------- camera
  // [attack, release start, release end, amount]
  const PUNCH = [
    [3.28, 4.70, 5.05, .13],   // OPUS
    [15.76, 17.62, 17.76, .22], // "e também, cara"
    [16.88, 17.62, 17.76, .08], // "o que acontece?"
    [23.20, 23.45, 23.70, .04], // "entendeu?"
    [23.84, 24.45, 24.90, .12], // "é isso mesmo"
  ];
  const HITS = [[0, 16], [3.28, 16], [3.92, 7], [6.88, 18], [11.62, 5], [14.45, 7], [15.25, 10], [15.76, 9], [17.76, 14],
    [18.32, 8], [19.1, 9], [21.6, 6], [23.84, 12], [25.98, 10]];
  function shake(t) {
    let x = 0, y = 0, r = 0, e = 0;
    HITS.forEach(([ti, amp], i) => {
      if (t < ti) return;
      const k = amp * Math.exp(-(t - ti) * 9);
      x += k * noise(t * 36, i); y += k * noise(t * 36, i + 9); r += k * .0005 * noise(t * 28, i + 3); e += k;
    });
    return { x, y, r, e };
  }
  function camera(t) {
    let z = 1 + .35 * (1 - E.outExpo(inv(0, .55, t)));
    for (const [a, b, c, amt] of PUNCH) z *= 1 + amt * E.outExpo(inv(a, a + .2, t)) * (1 - E.inOutCubic(inv(b, c, t)));
    z *= 1 + .05 * smooth(inv(4.9, 8.3, t)) * (1 - E.inOutCubic(inv(8.3, 8.7, t)));
    const sh = shake(t);
    z *= 1 + Math.min(.03, sh.e * .0015);
    const fc = rigAt('face', t) || [.55, .55, .5];
    const hw = W / (2 * z), hh = H / (2 * z);
    const cx = clamp(fc[0] * W + sh.x, hw, W - hw), cy = clamp((fc[1] - .03) * H + sh.y, hh, H - hh);
    return { z, cx, cy, rot: sh.r };
  }
  function applyCam(ctx, cam) { ctx.translate(W / 2, H / 2); ctx.rotate(cam.rot); ctx.scale(cam.z, cam.z); ctx.translate(-cam.cx, -cam.cy); }

  // ---------------------------------------------------------------- captions
  // [time, word, accent?] — times from the speech recogniser's token timestamps.
  const LINES = [
    [[.48, 'A'], [.72, 'ANTHROPIC', 'o']],
    [[1.6, 'ACABOU'], [2.0, 'DE'], [2.08, 'ANUNCIAR']],
    [[2.8, 'QUE'], [3.04, 'O'], [3.28, 'OPUS', 'o'], [3.92, '5.5', 'o']],
    [[4.8, 'ACABA'], [5.6, 'DE'], [6.0, 'ULTRAPASSAR', 'l']],
    [[6.88, 'O'], [7.12, 'GPT-6', 'g']],
    [[8.64, 'TÁ'], [8.88, 'VENDO'], [9.12, 'ESSE'], [9.28, 'MODELO', 'c'], [9.52, 'AQUI']],
    [[9.68, 'QUE'], [9.84, 'TÁ'], [10.0, 'NA'], [10.08, 'MINHA'], [10.32, 'MÃO', 'c']],
    [[10.56, 'AQUI'], [10.8, 'AGORA?']],
    [[11.2, 'EU'], [11.36, 'VOU'], [11.6, 'ATÉ']],
    [[11.84, 'ESTICAR', 'c'], [12.16, 'ELE'], [12.32, 'AQUI,']],
    [[12.48, 'PORQUE'], [12.56, 'EU'], [12.72, 'GOSTO'], [12.96, 'DE'], [13.12, 'ESTICAR', 'c']],
    [[14.08, 'E'], [14.32, 'AGORA'], [14.72, 'VAI'], [14.96, 'SUMIR', 'o']],
    [[15.76, 'E'], [16.08, 'TAMBÉM,'], [16.48, 'CARA,']],
    [[16.88, 'O'], [16.96, 'QUE'], [17.12, 'ACONTECE?', 'l']],
    [[17.76, 'ESSE'], [18.0, 'MODELO'], [18.32, 'ULTRAPASSOU', 'o']],
    [[18.8, 'TODOS', 'l'], [18.96, 'OS', 'l'], [19.04, 'BENCHMARKS', 'l']],
    [[20.8, 'AQUI'], [21.12, 'TÁ'], [21.28, 'A'], [21.44, 'TELA', 'c']],
    [[21.68, 'DO'], [21.76, 'BENCHMARK,', 'c']],
    [[22.4, 'VOCÊ'], [22.56, 'PODE'], [22.8, 'VER.']],
    [[23.2, 'ENTENDEU?', 'l']],
    [[23.68, 'E'], [23.84, 'É'], [24.0, 'ISSO'], [24.24, 'MESMO', 'l']],
    [[24.64, 'AGORA'], [24.96, 'VAMOS']],
    [[25.2, 'CONTINUAR', 'o'], [25.52, 'O'], [25.6, 'VÍDEO?', 'o']],
  ];
  const ACC = { o: C.orange, l: C.lime, c: C.cyan, g: '#C9CED6' };
  const LINE_END = { 4: 8.5, 15: 20.6, 18: 23.15, 22: 25.9 };

  function captionX(t) {
    // slide left while the hands and the model own the lower right of the frame
    const k = env(t, 8.5, 8.8, 15.5, 15.75, E.inOutCubic, E.inOutCubic), k2 = env(t, 11.1, 11.4, 14.6, 14.9, E.inOutCubic, E.inOutCubic);
    return W / 2 - k * W * .14 - k2 * W * .07;
  }
  function captions(ctx, t) {
    let li = -1;
    for (let i = 0; i < LINES.length; i++) if (t >= LINES[i][0][0] - .04) li = i;
    if (li < 0) return;
    const line = LINES[li], next = LINES[li + 1];
    const end = LINE_END[li] ?? (next ? next[0][0] - .04 : 99);
    if (t > end) return;
    const fade = 1 - inv(end - .08, end, t);
    setFont(ctx, 60, F.sans, 900, -.5);
    const gap = 20, ws = line.map(w => textW(ctx, w[1]));
    const total = ws.reduce((a, b) => a + b, 0) + gap * (line.length - 1);
    const cx = captionX(t), base = H - 104;
    let x = cx - total / 2;
    const xs = ws.map(w => { const v = x; x += w + gap; return v; });
    let ai = 0;
    line.forEach((w, i) => { if (t >= w[0] - .04) ai = i; });
    // highlight box glides from the previous word to the active one
    const ta = line[ai][0] - .04, pk = E.outCubic(inv(ta, ta + .12, t)), pi = Math.max(0, ai - 1);
    const bx = lerp(xs[pi], xs[ai], ai ? pk : 1) - 12, bw = lerp(ws[pi], ws[ai], ai ? pk : 1) + 24;
    const accent = ACC[line[ai][2]] || C.orange;
    ctx.save(); ctx.globalAlpha = fade * clamp(inv(line[0][0] - .04, line[0][0] + .01, t));
    const pop = E.outBack(inv(ta, ta + .16, t), 2.2);
    ctx.save(); ctx.translate(bx + bw / 2, base - 21); ctx.rotate(-.025); ctx.scale(lerp(.7, 1, pop), lerp(.7, 1, pop));
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    ctx.fillStyle = accent; rr(ctx, -bw / 2, -40, bw, 80, 14); ctx.fill(); ctx.restore();
    ctx.globalAlpha = fade;
    line.forEach((w, i) => {
      const t0 = w[0] - .04;
      if (t < t0) return;
      const p = E.outBack(inv(t0, t0 + .16, t), 2), a = clamp(inv(t0, t0 + .05, t));
      ctx.save(); ctx.globalAlpha *= a;
      ctx.translate(xs[i] + ws[i] / 2, base); ctx.scale(lerp(.55, 1, p), lerp(.55, 1, p)); ctx.translate(0, (1 - p) * 20);
      ctx.textAlign = 'center';
      if (i === ai) { ctx.fillStyle = C.ink; ctx.fillText(w[1], 0, 0); }
      else {
        ctx.lineJoin = 'round'; ctx.lineWidth = 11; ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.strokeText(w[1], 0, 0);
        ctx.fillStyle = w[2] ? ACC[w[2]] : '#fff'; ctx.fillText(w[1], 0, 0);
      }
      ctx.restore();
    });
    ctx.restore();
  }

  // ---------------------------------------------------------------- behind-the-person layer
  function dimAmount(t) {
    return Math.max(env(t, .5, .9, 4.72, 5.1) * .55, env(t, 15.76, 15.84, 17.66, 17.76, E.outCubic, E.inCubic) * .5,
      env(t, 17.76, 17.82, 20.45, 20.85) * .58);
  }
  const needsBehind = t => dimAmount(t) > 0;

  function sAnthropic(ctx, t) {
    if (t < .55 || t > 3.3) return;
    const str = 'ANTHROPIC';
    setFont(ctx, 158, F.anton, 400, 4);
    const ws = [...str].map(ch => textW(ctx, ch)), total = ws.reduce((a, b) => a + b, 0);
    const x0 = 64 + 24 * inv(.6, 3.2, t), base = H * .56;
    let x = x0;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, base - 170, W, 182); ctx.clip();
    [...str].forEach((ch, i) => {
      const tin = .64 + i * .032, tout = 2.74 + i * .022;
      const pin = E.outExpo(inv(tin, tin + .55, t)), pout = E.inExpo(inv(tout, tout + .3, t));
      ctx.fillStyle = C.paper;
      ctx.fillText(ch, x, base + (1 - pin) * 180 - pout * 190);
      x += ws[i];
    });
    ctx.restore();
    // kicker above, underline sweep on "anunciar"
    const k = E.outExpo(inv(.7, 1.1, t)) * (1 - E.inExpo(inv(2.7, 2.95, t)));
    if (k > 0) {
      ctx.save(); ctx.globalAlpha = k; setFont(ctx, 30, F.mono, 800, 6); ctx.fillStyle = '#fff';
      ctx.fillText('● ÚLTIMA HORA'.slice(0, Math.round(13 * clamp(inv(.75, 1.2, t)))), x0 + 6, base - 196); ctx.restore();
    }
    const u = E.inOutExpo(inv(2.08, 2.5, t)), uo = E.inExpo(inv(2.7, 2.95, t));
    if (u > 0) { ctx.fillStyle = C.orange; ctx.fillRect(x0 + uo * total, base + 24, total * (u - uo), 12); }
  }

  function sBroadcast(ctx, t, cam) {
    if (t < 2.05 || t > 3.4) return;
    const fc = faceScreen(t, cam); if (!fc) return;
    ctx.save(); ctx.lineWidth = 5;
    for (let k = 0; k < 3; k++) {
      const p = inv(2.08 + k * .2, 2.08 + k * .2 + .9, t);
      if (p <= 0 || p >= 1) continue;
      ctx.strokeStyle = `rgba(255,106,43,${(1 - p) * .9})`;
      ctx.beginPath(); ctx.arc(fc[0] * W, fc[1] * H, 160 + E.outCubic(p) * 900, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  function sOpus(ctx, t, cam) {
    if (t < 3.1 || t > 5.2) return;
    const out = E.inCubic(inv(4.72, 5.08, t));
    const fc = faceScreen(t, cam), cx = fc[0] * W, base = H * .6;
    ctx.save();
    ctx.translate(cx, base - 120); ctx.scale(1 + out * .3, 1 + out * .3); ctx.translate(-cx, -(base - 120));
    ctx.globalAlpha = 1 - out;
    // light rays
    const ra = env(t, 3.28, 3.5, 4.7, 5.0) * .22;
    if (ra > 0) {
      ctx.save(); ctx.translate(cx, base - 120); ctx.rotate(t * .25);
      for (let i = 0; i < 16; i++) {
        ctx.rotate(TAU / 16);
        const g = ctx.createLinearGradient(0, 0, 1100, 0);
        g.addColorStop(0, `rgba(255,106,43,${ra})`); g.addColorStop(1, 'rgba(255,106,43,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1100, -70); ctx.lineTo(1100, 70); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    setFont(ctx, 290, F.anton, 400, 6);
    const word = 'OPUS', num = (5.5 * E.outCubic(inv(3.92, 4.28, t))).toFixed(1);
    const ww = textW(ctx, word), nw = textW(ctx, '5.5');
    // the head sits between the two halves
    let x = Math.max(48, cx - fc[2] * H * .62 - ww - 30);
    const nx = Math.min(W - 48 - nw, cx + fc[2] * H * .62 + 40);
    [...word].forEach((ch, i) => {
      const tin = 3.28 + i * .045, p = E.outExpo(inv(tin, tin + .32, t));
      const cw = textW(ctx, ch);
      if (p > 0) {
        ctx.save(); ctx.translate(x + cw / 2, base - 120); const s = lerp(1.9, 1, p); ctx.scale(s, s);
        ctx.globalAlpha *= clamp(p * 3); ctx.fillStyle = C.paper; ctx.textAlign = 'center'; ctx.fillText(ch, 0, 120); ctx.restore();
      }
      x += cw;
    });
    if (t >= 3.9) {
      const pop = E.outBack(inv(3.9, 4.12, t), 2.5), pulse = 1 + .06 * Math.exp(-(t - 4.28) * 8) * (t > 4.28);
      ctx.save(); ctx.translate(nx + nw / 2, base - 120); ctx.scale(pop * pulse, pop * pulse);
      const g = ctx.createLinearGradient(0, -150, 0, 120); g.addColorStop(0, '#FFB27D'); g.addColorStop(1, C.orange);
      glow(ctx, 'rgba(255,106,43,.8)', 50); ctx.fillStyle = g; ctx.textAlign = 'center'; ctx.fillText(num, 0, 120);
      ctx.restore();
    }
    ctx.restore();
  }

  function sSpeedLines(ctx, t, cam) {
    const a = env(t, 15.76, 15.82, 17.6, 17.76, E.outCubic, E.inCubic);
    if (a <= 0) return;
    const fc = faceScreen(t, cam), cx = fc[0] * W, cy = fc[1] * H, seed = Math.floor(t * 15);
    ctx.save(); ctx.fillStyle = `rgba(255,255,255,${.75 * a})`;
    for (let i = 0; i < 90; i++) {
      const ang = hash(i, seed) * TAU, r0 = 380 + hash(i + 50, seed) * 260, w = 3 + hash(i + 99, seed) * 12;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      ctx.beginPath(); ctx.moveTo(cx + dx * r0, cy + dy * r0);
      ctx.lineTo(cx + dx * 2200 - dy * w, cy + dy * 2200 + dx * w); ctx.lineTo(cx + dx * 2200 + dy * w, cy + dy * 2200 - dx * w);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function sMarquee(ctx, t) {
    if (t < 17.7 || t > 20.9) return;
    const str = 'TODOS OS BENCHMARKS  ✦  ';
    setFont(ctx, 150, F.anton, 400, 4);
    const unit = textW(ctx, str);
    const boost = t > 18.32 ? .9 * Math.exp(-(t - 18.32) * 2.5) : 0;
    const rows = [[H * .22, -1, 'stroke'], [H * .47, 1, 'fill'], [H * .72, -1, 'stroke']];
    rows.forEach(([y, dir, style], r) => {
      const pin = E.outExpo(inv(17.76 + r * .1, 17.76 + r * .1 + .6, t)), pout = E.inExpo(inv(20.45 + r * .06, 20.8 + r * .06, t));
      if (pin <= 0 || pout >= 1) return;
      const travel = (t - 17.76) * 260 + boost * 300 * (t - 18.32);
      let off = (dir * travel) % unit; if (off > 0) off -= unit;
      const slide = (1 - pin) * W * dir * -1 + pout * W * dir;
      ctx.save(); ctx.globalAlpha = 1 - pout;
      for (let x = off - unit + slide; x < W + unit; x += unit) {
        if (style === 'stroke') { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(244,239,230,.85)'; ctx.strokeText(str, x, y + 55); }
        else { ctx.fillStyle = C.orange; ctx.fillText(str, x, y + 55); }
      }
      ctx.restore();
    });
  }

  // face position after the camera, in normalised screen coords ([x, y, size])
  function faceScreen(t, cam) {
    const fc = rigAt('face', t) || [.55, .55, .5];
    return [((fc[0] * W - cam.cx) * cam.z + W / 2) / W, ((fc[1] * H - cam.cy) * cam.z + H / 2) / H, fc[2] * cam.z];
  }

  // drawn in screen space; the person is composited on top afterwards
  function behind(ctx, t, cam) {
    const d = dimAmount(t);
    ctx.fillStyle = `rgba(6,7,12,${d})`; ctx.fillRect(0, 0, W, H);
    sSpeedLines(ctx, t, cam);
    sAnthropic(ctx, t);
    sBroadcast(ctx, t, cam);
    sOpus(ctx, t, cam);
    sMarquee(ctx, t);
  }

  // ---------------------------------------------------------------- hologram model
  const ICO = (() => {
    const p = (1 + Math.sqrt(5)) / 2;
    let v = [[-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0], [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p], [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1]];
    let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const norm = a => { const l = Math.hypot(...a); return a.map(x => x / l); };
    v = v.map(norm);
    const cache = new Map();
    const mid = (a, b) => {
      const k = a < b ? a + '_' + b : b + '_' + a;
      if (!cache.has(k)) { v.push(norm(v[a].map((x, i) => (x + v[b][i]) / 2))); cache.set(k, v.length - 1); }
      return cache.get(k);
    };
    const f2 = [];
    for (const [a, b, c] of f) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); f2.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    const edges = new Set();
    for (const [a, b, c] of f2) for (const [i, j] of [[a, b], [b, c], [c, a]]) edges.add(i < j ? i + '_' + j : j + '_' + i);
    return { v, e: [...edges].map(s => s.split('_').map(Number)) };
  })();

  const R0 = 92;
  // where the model rests: just above the holding palm
  function restPoint(t) {
    const h = rigAt('hold', t); if (!h) return null;
    return { x: h[0] * W - 10, y: Math.min(h[1] * H - R0 * 1.45, H - R0 - 30), palm: { x: h[0] * W, y: h[1] * H } };
  }
  // stretch target: the pinch while it holds, then an elastic snap back
  function topPoint(t, B) {
    if (t < 11.55 || t > 15) return { x: B.x, y: B.y, S: 0 };
    const grab = E.inOutCubic(inv(11.55, 11.95, t));
    let P = t <= 14.28 ? rigAt('pinch', t) : rigLast('pinch', 14.28);
    if (!P) return { x: B.x, y: B.y, S: 0 };
    let px = P[0] * W, py = P[1] * H;
    const rel = inv(14.28, 14.85, t);
    let L = Math.hypot(px - B.x, py - B.y) * grab;
    const ux = (px - B.x) / (Math.hypot(px - B.x, py - B.y) || 1), uy = (py - B.y) / (Math.hypot(px - B.x, py - B.y) || 1);
    if (rel > 0) L *= 1 - E.outElastic(rel);       // can overshoot below zero: that reads as squash
    return { x: B.x + ux * Math.max(L, 0), y: B.y + uy * Math.max(L, 0), S: L / (2 * R0), ux, uy };
  }

  function holo(ctx, t) {
    if (t < 8.72 || t > 15.4) return;
    const B = restPoint(t); if (!B) return;
    const appear = E.outBack(inv(8.76, 9.2, t), 1.6);
    const implode = inv(14.96, 15.24, t);
    let R = R0 * appear * (1 - E.inBack(implode, 2.2));
    if (R <= .5) return;
    const top = topPoint(t, B);
    const S = top.S;
    let ux = top.ux ?? 0, uy = top.uy ?? -1;
    if (S <= .02) { ux = 0; uy = -1; }
    const nx = -uy, ny = ux;
    const k = clamp(S / 2.5), L = Math.max(0, S) * 2 * R0;
    const squash = S < 0 ? Math.min(.45, -S * .3) : 0;
    const wob = 1 + .08 * Math.sin(t * 22) * Math.exp(-Math.max(0, t - 11.6) * 4) * (t > 11.6) + .1 * Math.sin(t * 26) * Math.exp(-Math.max(0, t - 14.5) * 5) * (t > 14.5);
    const along = a => smooth(clamp((a + .7) / 1.4)) * L + a * R * (1 - .2 * k) * (1 - squash * .6);
    const width = a => (1 - .68 * k * Math.exp(-a * a * 5)) * (1 + squash * .7) * wob;
    const P = (a, x) => [B.x + ux * along(a) + nx * x * R * width(a), B.y + uy * along(a) + ny * x * R * width(a)];

    ctx.save();
    // light cone from the palm
    const cone = env(t, 8.8, 9.2, 14.9, 15.2) * (1 - k * .6);
    if (cone > 0 && t < 11.6 || t > 14.6 && cone > 0) {
      const g = ctx.createLinearGradient(B.palm.x, B.palm.y, B.x, B.y - R);
      g.addColorStop(0, `rgba(94,242,255,${.35 * cone})`); g.addColorStop(1, 'rgba(94,242,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(B.palm.x - 40, B.palm.y); ctx.lineTo(B.palm.x + 40, B.palm.y);
      ctx.lineTo(B.x + R * 1.3, B.y - R * .4); ctx.lineTo(B.x - R * 1.3, B.y - R * .4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(94,242,255,${.8 * cone})`; ctx.lineWidth = 3;
      for (let i = 0; i < 2; i++) { const rp = ((t * 1.4 + i * .5) % 1); ctx.globalAlpha = (1 - rp) * cone;
        ctx.beginPath(); ctx.ellipse(B.palm.x, B.palm.y - 10, 50 + rp * 60, 14 + rp * 16, 0, 0, TAU); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'lighter';
    // gooey body silhouette
    const N = 28, left = [], right = [];
    for (let i = 0; i <= N; i++) {
      const a = -1 + 2 * i / N, hw = Math.sqrt(Math.max(0, 1 - a * a));
      left.push(P(a, hw)); right.push(P(a, -hw));
    }
    const mid = P(0, 0);
    const bg = ctx.createRadialGradient(mid[0], mid[1], 0, mid[0], mid[1], R * 1.4 + L * .6);
    bg.addColorStop(0, 'rgba(94,242,255,.30)'); bg.addColorStop(1, 'rgba(40,120,255,.06)');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(...left[0]); left.forEach(p => ctx.lineTo(...p)); for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(...right[i]); ctx.closePath(); ctx.fill();
    // energy strands through the neck
    if (k > .06) {
      ctx.lineWidth = 2;
      for (let s = 0; s < 5; s++) {
        ctx.strokeStyle = s % 2 ? 'rgba(255,255,255,.7)' : 'rgba(94,242,255,.8)'; ctx.beginPath();
        for (let i = 0; i <= 30; i++) {
          const a = -.85 + 1.7 * i / 30, hw = Math.sqrt(1 - a * a) * .8;
          const x = hw * noise(i * .35 + t * 9 + s * 7, s);
          const p = P(a, x); i ? ctx.lineTo(...p) : ctx.moveTo(...p);
        }
        ctx.stroke();
      }
    }
    // wireframe icosphere: spin around the model's own axis
    const ay = t * 1.3 + implode * implode * 14, ax = .35 + .15 * Math.sin(t * .9);
    const cy = Math.cos(ay), sy = Math.sin(ay), cxr = Math.cos(ax), sxr = Math.sin(ax);
    const pts = ICO.v.map(([x, y, z]) => {
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      const y2 = y * cxr - z1 * sxr, z2 = y * sxr + z1 * cxr;
      return { p: P(-y2, x1), z: z2 };
    });
    for (const [i, j] of ICO.e) {
      const z = (pts[i].z + pts[j].z) / 2, a = .25 + .75 * (z + 1) / 2;
      ctx.strokeStyle = `rgba(94,242,255,${.22 * a})`; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(...pts[i].p); ctx.lineTo(...pts[j].p); ctx.stroke();
      ctx.strokeStyle = `rgba(200,250,255,${.85 * a})`; ctx.lineWidth = 1.6; ctx.stroke();
    }
    for (const q of pts) { if (q.z < -.2) continue; ctx.fillStyle = `rgba(255,255,255,${.5 + .5 * q.z})`; ctx.beginPath(); ctx.arc(q.p[0], q.p[1], 2.6, 0, TAU); ctx.fill(); }
    // core
    const cr = R * (.62 + .06 * Math.sin(t * 6)) * (1 - .35 * k);
    for (const c of k > .3 ? [P(-.55, 0), P(.55, 0)] : [mid]) {
      const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], cr);
      g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.25, 'rgba(255,170,110,.75)'); g.addColorStop(.6, 'rgba(255,106,43,.25)'); g.addColorStop(1, 'rgba(255,106,43,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c[0], c[1], cr, 0, TAU); ctx.fill();
    }
    // orbit rings (only while compact)
    const ringA = 1 - clamp(k * 3);
    if (ringA > 0) {
      for (let r = 0; r < 2; r++) {
        const rot = r ? .5 : -.35, rx = R * (1.45 + r * .2), ry = R * (.38 + r * .1);
        ctx.strokeStyle = `rgba(255,140,80,${.55 * ringA})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(mid[0], mid[1], rx, ry, rot, 0, TAU); ctx.stroke();
        const ang = t * (2.2 + r) + r * 2, ex = rx * Math.cos(ang), ey = ry * Math.sin(ang);
        ctx.fillStyle = `rgba(255,220,180,${ringA})`; ctx.beginPath();
        ctx.arc(mid[0] + ex * Math.cos(rot) - ey * Math.sin(rot), mid[1] + ex * Math.sin(rot) + ey * Math.cos(rot), 5, 0, TAU); ctx.fill();
      }
    }
    // materialise scanline
    const sc = inv(8.76, 9.25, t);
    if (sc > 0 && sc < 1) {
      const yy = B.y + R * 1.2 - sc * R * 2.6;
      const g = ctx.createLinearGradient(B.x - R * 1.6, 0, B.x + R * 1.6, 0);
      g.addColorStop(0, 'rgba(94,242,255,0)'); g.addColorStop(.5, 'rgba(220,255,255,.95)'); g.addColorStop(1, 'rgba(94,242,255,0)');
      ctx.fillStyle = g; ctx.fillRect(B.x - R * 1.6, yy - 3, R * 3.2, 6);
    }
    // rising motes
    for (let i = 0; i < 14; i++) {
      const life = (t * .7 + hash(i, 3)) % 1, x = B.x + (hash(i, 4) - .5) * R * 2.4 + Math.sin(t * 2 + i) * 8, y = B.y + R * .9 - life * R * 2.6;
      ctx.fillStyle = `rgba(150,245,255,${Math.sin(life * Math.PI) * .8 * appear * (1 - implode)})`;
      ctx.beginPath(); ctx.arc(x, y, 1.5 + hash(i, 5) * 2.5, 0, TAU); ctx.fill();
    }
    ctx.restore();

    // glitch flicker while imploding
    if (implode > 0 && implode < 1 && hash(Math.floor(t * 60)) > .5) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,45,70,.25)';
      ctx.fillRect(B.x - R * 1.5 + 10, B.y - R * 1.2, R * 3, R * .3 * hash(Math.floor(t * 60), 2)); ctx.restore();
    }

    holoCallout(ctx, t, B, R);
    stretchRuler(ctx, t, B, top, nx, ny, L, k);
  }

  function holoCallout(ctx, t, B, R) {
    const a = env(t, 9.15, 9.55, 11.35, 11.6, E.outCubic, E.inCubic);
    if (a <= 0) return;
    const bw = 300, bh = 104;
    const sx = B.x + R * .35, sy = B.y - R * .95, ex = sx + 50 * a, ey = sy - 120 * a;
    const lx = Math.min(ex + 40 * E.outCubic(inv(9.3, 9.65, t)), W - bw - 30);
    ctx.save();
    ctx.strokeStyle = C.cyan; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(lx, ey); ctx.stroke();
    ctx.fillStyle = C.cyan; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, TAU); ctx.fill();
    const ta = clamp(inv(9.45, 9.7, t)) * a;
    if (ta > 0) {
      ctx.globalAlpha = ta;
      const bx = lx, by = ey - bh - 6;
      ctx.fillStyle = 'rgba(6,14,22,.72)'; rr(ctx, bx, by, bw, bh, 12); ctx.fill();
      ctx.strokeStyle = 'rgba(94,242,255,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      setFont(ctx, 16, F.mono, 600, 2); ctx.fillStyle = C.cyan; ctx.fillText('MODELO // ONLINE', bx + 18, by + 30);
      setFont(ctx, 44, F.sans, 900, -1); ctx.fillStyle = '#fff'; ctx.fillText('OPUS 5.5', bx + 16, by + 78);
      const bar = (t * .9) % 1;
      ctx.fillStyle = 'rgba(94,242,255,.25)'; ctx.fillRect(bx + 18, by + bh - 14, bw - 36, 3);
      ctx.fillStyle = C.cyan; ctx.fillRect(bx + 18, by + bh - 14, (bw - 36) * bar, 3);
    }
    ctx.restore();
  }

  function stretchRuler(ctx, t, B, top, nx, ny, L, k) {
    const a = clamp(k * 4) * env(t, 11.7, 11.9, 14.22, 14.34);
    if (a <= 0) return;
    if (nx > 0) { nx = -nx; ny = -ny; }   // keep the ruler on the screen-left side of the model
    const off = R0 * 1.45, x0 = B.x + nx * off, y0 = B.y + ny * off, x1 = top.x + nx * off, y1 = top.y + ny * off;
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = C.lime; ctx.fillStyle = C.lime; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(len / 28);
    for (let i = 0; i <= n; i++) {
      const p = i / Math.max(1, n), x = lerp(x0, x1, p), y = lerp(y0, y1, p), s = i % 5 ? 10 : 22;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + nx * s, y + ny * s); ctx.stroke();
    }
    const pct = Math.round(100 + L / (2 * R0) * 100);
    const label = `${pct}%`, mx = (x0 + x1) / 2 + nx * 40, my = (y0 + y1) / 2 + ny * 40;
    setFont(ctx, 34, F.mono, 800, 0);
    const tw = textW(ctx, label);
    ctx.fillStyle = 'rgba(8,10,6,.82)'; rr(ctx, mx - tw - 34, my - 30, tw + 34, 58, 10); ctx.fill();
    ctx.fillStyle = C.lime; ctx.textAlign = 'right'; ctx.fillText(label, mx - 17, my + 11);
    setFont(ctx, 15, F.mono, 600, 2); ctx.fillText('ESTICANDO', mx - 17, my - 38);
    ctx.restore();
  }

  function poof(ctx, t) {
    const tb = 15.24;
    if (t < tb || t > tb + 1.2) return;
    const B = restPoint(tb); if (!B) return;
    const age = t - tb;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 56; i++) {
      const life = .55 + hash(i, 11) * .6; if (age > life) continue;
      const ang = hash(i, 12) * TAU, sp = 300 + hash(i, 13) * 1000, d = sp * (1 - Math.exp(-age * 4)) / 4;
      const x = B.x + Math.cos(ang) * d, y = B.y + Math.sin(ang) * d + age * age * 260, s = (2 + hash(i, 14) * 6) * (1 - age / life);
      ctx.fillStyle = [C.cyan, '#ffffff', C.orange][i % 3]; ctx.globalAlpha = 1 - age / life;
      ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const rp = inv(0, .45, age);
    if (rp < 1) { ctx.strokeStyle = `rgba(220,255,255,${1 - rp})`; ctx.lineWidth = 8 * (1 - rp) + 1; ctx.beginPath(); ctx.arc(B.x, B.y, 20 + E.outCubic(rp) * 260, 0, TAU); ctx.stroke(); }
    ctx.restore();
    const ta = env(t, tb + .02, tb + .15, tb + .3, tb + .5);
    if (ta > 0) {
      ctx.save(); ctx.globalAlpha = ta; ctx.translate(B.x - 30, B.y - 130 - age * 50); ctx.rotate(-.12);
      const s = E.outBack(inv(tb, tb + .2, t), 3); ctx.scale(s, s);
      setFont(ctx, 96, F.serif, 400, 0); ctx.textAlign = 'center';
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText('puf!', 0, 0); ctx.fillStyle = '#fff'; ctx.fillText('puf!', 0, 0);
      ctx.restore();
    }
  }

  function questionMarks(ctx, t) {
    if (t < 16.85 || t > 17.8) return;
    const fc = rigAt('face', t), cx = fc[0] * W, cy = fc[1] * H, sz = fc[2] * H;
    const Q = [[16.88, -.62, -.42, 190, C.paper, -.22], [16.98, .66, -.5, 150, C.orange, .25], [17.12, .58, .12, 110, C.lime, .12]];
    const out = E.inBack(inv(17.62, 17.78, t));
    Q.forEach(([t0, dx, dy, s, col, rot], i) => {
      const p = E.outBack(inv(t0, t0 + .22, t), 3); if (p <= 0) return;
      ctx.save(); ctx.translate(cx + dx * sz, cy + dy * sz + Math.sin(t * 7 + i) * 8);
      ctx.rotate(rot + Math.sin(t * 9 + i * 2) * .08); const k = p * (1 - out); ctx.scale(k, k);
      setFont(ctx, s, F.anton, 400, 0); ctx.textAlign = 'center';
      ctx.lineJoin = 'round'; ctx.lineWidth = s * .09; ctx.strokeStyle = C.ink; ctx.strokeText('?', 0, s * .36);
      ctx.fillStyle = col; ctx.fillText('?', 0, s * .36); ctx.restore();
    });
  }

  const CHIPS = ['RACIOCÍNIO', 'CÓDIGO', 'MATEMÁTICA', 'AGENTES', 'VISÃO', 'CIÊNCIA', 'LÓGICA', 'CONTEXTO LONGO'];
  const CHIP_POS = [[.14, .2], [.36, .1], [.8, .12], [.89, .34], [.11, .46], [.9, .58], [.17, .7], [.84, .8]];
  function chips(ctx, t) {
    if (t < 19.0 || t > 20.95) return;
    const ox = .56 * W, oy = .8 * H;
    setFont(ctx, 30, F.sans, 800, 0);
    CHIPS.forEach((label, i) => {
      const t0 = 19.05 + i * .05, p = E.outExpo(inv(t0, t0 + .6, t));
      if (p <= 0) return;
      const pout = E.inBack(inv(20.45 + i * .03, 20.7 + i * .03, t));
      if (pout >= 1) return;
      const [tx, ty] = CHIP_POS[i], X = tx * W, Y = ty * H;
      const cxp = lerp(ox, X, .5) + (X < ox ? -160 : 160), cyp = Math.min(oy, Y) - 160;
      const u = p, x = (1 - u) ** 2 * ox + 2 * (1 - u) * u * cxp + u * u * X, y = (1 - u) ** 2 * oy + 2 * (1 - u) * u * cyp + u * u * Y;
      const tw = textW(ctx, label), w = tw + 96, h = 64, bob = Math.sin(t * 3 + i) * 6;
      ctx.save(); ctx.translate(x, y + bob); ctx.rotate(lerp((hash(i) - .5) * .8, (hash(i, 2) - .5) * .12, p));
      const s = lerp(.3, 1, p) * (1 - pout); ctx.scale(s, s);
      ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
      ctx.fillStyle = 'rgba(10,12,16,.86)'; rr(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fill(); noGlow(ctx); ctx.shadowOffsetY = 0;
      ctx.strokeStyle = 'rgba(200,255,46,.55)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = C.lime; ctx.beginPath(); ctx.arc(-w / 2 + 34, 0, 19, 0, TAU); ctx.fill();
      checkMark(ctx, -w / 2 + 34, 1, 22, C.ink, 5);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(label, -w / 2 + 66, 11);
      ctx.restore();
    });
  }

  // ---------------------------------------------------------------- benchmark screen held between the hands
  const BENCH = [['RACIOCÍNIO', .93, .82], ['CÓDIGO', .96, .85], ['MATEMÁTICA', .91, .83], ['AGENTES', .94, .78], ['VISÃO', .89, .81]];
  const SCREEN = [21.5, 21.82, 23.52, 23.76];
  function screenRect(t) {
    const h = rigAt('hands', clamp(t, 21.55, 23.6)); if (!h) return null;
    const avgx = (P, ids) => ids.reduce((s, i) => s + P[i][0], 0) / ids.length;
    const left = (avgx(h.L, [5, 6, 7, 8]) + .016) * W, right = (avgx(h.R, [5, 6, 7, 8]) - .016) * W;
    const top = Math.min(h.L[8][1], h.R[8][1]) * H + 10, bot = (h.L[4][1] + h.R[4][1]) / 2 * H - 6;
    const ang = Math.atan2(h.R[8][1] * H - h.L[8][1] * H, h.R[8][0] * W - h.L[8][0] * W) * .6;
    return { cx: (left + right) / 2, cy: (top + bot) / 2, w: right - left, h: bot - top, ang, hands: h };
  }
  function benchScreen(ctx, t, plate) {
    const [a, b, c, d] = SCREEN;
    if (t < a || t > d) return null;
    const r = screenRect(t); if (!r) return null;
    const on = E.outExpo(inv(a, b, t)), off = inv(c, d, t);
    let sx = 1, sy = on;
    if (off > 0) { sy = 1 - E.inExpo(inv(0, .55, off)) * .985; sx = off > .5 ? 1 - E.inExpo(inv(.5, 1, off)) : 1; }
    const w = r.w * sx, h = Math.max(4, r.h * sy);
    ctx.save(); ctx.translate(r.cx, r.cy); ctx.rotate(r.ang);
    // glass: blurred plate behind + dark tint
    ctx.save(); rr(ctx, -w / 2, -h / 2, w, h, 18); ctx.clip();
    ctx.rotate(-r.ang); ctx.translate(-r.cx, -r.cy);
    ctx.filter = 'blur(14px) brightness(.55)'; ctx.drawImage(plate, 0, 0, W, H); ctx.filter = 'none';
    ctx.restore();
    ctx.fillStyle = 'rgba(8,10,18,.72)'; rr(ctx, -w / 2, -h / 2, w, h, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(94,242,255,.75)'; ctx.lineWidth = 2; ctx.stroke();
    // power-on line
    if (on < 1 || off > 0) { ctx.fillStyle = `rgba(220,255,255,${off > 0 ? .9 : 1 - on})`; ctx.fillRect(-w / 2, -3, w, 6); }
    const ca = clamp(inv(b - .05, b + .12, t)) * (1 - clamp(off * 3));
    if (ca > 0) {
      ctx.save(); ctx.globalAlpha = ca; ctx.beginPath(); rr(ctx, -w / 2, -h / 2, w, h, 18); ctx.clip();
      const x0 = -w / 2, y0 = -h / 2;
      // scanlines
      ctx.fillStyle = 'rgba(255,255,255,.035)'; for (let y = y0; y < -y0; y += 6) ctx.fillRect(x0, y, w, 2);
      setFont(ctx, 20, F.mono, 700, 3); ctx.fillStyle = C.cyan; ctx.fillText('BENCHMARK // 2026', x0 + 28, y0 + 42);
      setFont(ctx, 18, F.sans, 800, 1); ctx.textAlign = 'right';
      ctx.fillStyle = '#C9CED6'; ctx.fillText('GPT-6', x0 + w - 28, y0 + 42); const gw = textW(ctx, 'GPT-6');
      ctx.fillRect(x0 + w - 28 - gw - 26, y0 + 30, 14, 14);
      ctx.fillStyle = C.orange; const ox = x0 + w - 28 - gw - 52; ctx.fillText('OPUS 5.5', ox, y0 + 42); ctx.fillRect(ox - textW(ctx, 'OPUS 5.5') - 26, y0 + 30, 14, 14);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(94,242,255,.25)'; ctx.fillRect(x0 + 28, y0 + 60, w - 56, 1.5);
      const rowsTop = y0 + 80, rowH = (h - 80 - 34) / BENCH.length, labelW = 210, barMax = w - labelW - 120;
      BENCH.forEach(([name, o, g], i) => {
        const ry = rowsTop + i * rowH, tg = 21.9 + i * .1, p = E.outCubic(inv(tg, tg + .55, t));
        setFont(ctx, 21, F.sans, 800, .5); ctx.fillStyle = '#E8EBF0'; ctx.fillText(name, x0 + 28, ry + rowH * .5 + 4);
        const bx = x0 + 28 + labelW, bh = Math.min(16, rowH * .24);
        ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(bx, ry + rowH * .5 - bh - 3, barMax, bh); ctx.fillRect(bx, ry + rowH * .5 + 3, barMax, bh);
        const pulse = t > 23.2 ? .5 + .5 * Math.sin((t - 23.2) * 18) : 0;
        const og = ctx.createLinearGradient(bx, 0, bx + barMax * o, 0); og.addColorStop(0, '#FF9A5E'); og.addColorStop(1, C.orange);
        ctx.save(); glow(ctx, `rgba(255,106,43,${.6 + .4 * pulse})`, 14 + 14 * pulse); ctx.fillStyle = og;
        ctx.fillRect(bx, ry + rowH * .5 - bh - 3, barMax * o * p, bh); ctx.restore();
        ctx.fillStyle = '#8D949E'; ctx.fillRect(bx, ry + rowH * .5 + 3, barMax * g * E.outCubic(inv(tg + .05, tg + .6, t)), bh);
        const tag = E.outBack(inv(tg + .45, tg + .65, t), 2.5);
        if (tag > 0) {
          ctx.save(); ctx.translate(bx + barMax * o + 34, ry + rowH * .5 - bh / 2 - 3); ctx.scale(tag, tag);
          ctx.fillStyle = C.lime; rr(ctx, -26, -14, 52, 28, 8); ctx.fill();
          setFont(ctx, 17, F.mono, 800, 0); ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.fillText('#1', 0, 6); ctx.restore();
        }
      });
      setFont(ctx, 14, F.mono, 500, 1); ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.textAlign = 'right';
      ctx.fillText('*gráfico ilustrativo', x0 + w - 24, y0 + h - 14);
      ctx.restore();
    }
    // corner brackets
    const bl = 34, bk = E.outBack(inv(a, a + .25, t), 2) * (1 - clamp(off * 4));
    if (bk > 0) {
      ctx.strokeStyle = C.cyan; ctx.lineWidth = 5; ctx.lineCap = 'round';
      for (const [sx2, sy2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x = sx2 * (w / 2 + 8) * lerp(1.4, 1, bk), y = sy2 * (h / 2 + 8) * lerp(1.4, 1, bk);
        ctx.globalAlpha = clamp(bk); ctx.beginPath(); ctx.moveTo(x - sx2 * bl, y); ctx.lineTo(x, y); ctx.lineTo(x, y - sy2 * bl); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    return r;
  }

  // Put the hands back in front of the screen: a skeleton mask from the landmarks, cut by the person matte.
  const BONES = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [0, 17, 18, 19, 20], [5, 9, 13, 17]];
  function handsInFront(ctx, cam, r, img, buf) {
    const b = buf.getContext('2d');
    b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, W, H);
    b.save(); applyCam(b, cam);
    b.filter = 'blur(3px)';
    b.strokeStyle = '#fff'; b.fillStyle = '#fff'; b.lineCap = 'round'; b.lineJoin = 'round';
    for (const hand of [r.hands.L, r.hands.R]) {
      const P = hand.map(([x, y]) => [x * W, y * H]), size = Math.hypot(P[0][0] - P[9][0], P[0][1] - P[9][1]);
      b.lineWidth = size * .2;
      for (const chain of BONES) { b.beginPath(); chain.forEach((i, k) => k ? b.lineTo(...P[i]) : b.moveTo(...P[i])); b.stroke(); }
      b.beginPath(); [0, 1, 5, 9, 13, 17].forEach((i, k) => k ? b.lineTo(...P[i]) : b.moveTo(...P[i])); b.closePath(); b.fill();
    }
    b.filter = 'none';
    b.globalCompositeOperation = 'destination-in'; b.drawImage(img.matte, 0, 0, W, H);
    b.globalCompositeOperation = 'source-in'; b.drawImage(img.plate, 0, 0, W, H);
    b.restore(); b.globalCompositeOperation = 'source-over';
    ctx.drawImage(buf, 0, 0);
  }

  // ---------------------------------------------------------------- screen-space HUD
  function glass(ctx, x, y, w, h, r, src) {
    ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
    ctx.filter = 'blur(16px) brightness(.5)'; ctx.drawImage(src, 0, 0); ctx.filter = 'none';
    ctx.restore();
    ctx.fillStyle = 'rgba(8,10,16,.66)'; rr(ctx, x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  function badge(ctx, t) {
    const a = env(t, .25, .55, 8.2, 8.5, E.outBack, E.inBack);
    if (t < .25 || t > 8.5) return;
    ctx.save(); ctx.translate(lerp(-420, 0, a), 0);
    setFont(ctx, 30, F.sans, 900, 2);
    const w1 = textW(ctx, 'URGENTE') + 78;
    ctx.fillStyle = C.red; rr(ctx, 56, 50, w1, 60, 30); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${.4 + .6 * (Math.sin(t * 9) > 0)})`; ctx.beginPath(); ctx.arc(88, 80, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText('URGENTE', 108, 91);
    const str = 'IA  ·  NOVO ANÚNCIO', n = Math.round(str.length * clamp(inv(.6, 1.3, t)));
    setFont(ctx, 22, F.mono, 700, 2);
    const w2 = textW(ctx, str) + 44;
    ctx.fillStyle = 'rgba(8,10,16,.72)'; rr(ctx, 56 + w1 + 12, 50, w2, 60, 30); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(str.slice(0, n) + (n < str.length && Math.sin(t * 30) > 0 ? '▍' : ''), 56 + w1 + 34, 88);
    ctx.restore();
  }

  function race(ctx, t, src) {
    if (t < 4.8 || t > 8.7) return;
    const pin = E.outExpo(inv(4.82, 5.35, t)), pout = E.inExpo(inv(8.2, 8.6, t));
    const x = lerp(-720, 64, pin) - pout * 800, y = 300, w = 650, h = 340;
    glass(ctx, x, y, w, h, 26, src);
    setFont(ctx, 19, F.mono, 700, 3); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText('RANKING  ·  MODELOS DE IA', x + 30, y + 46);
    ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(x + w - 98, y + 40, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText('LIVE', x + w - 82, y + 46);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 30, y + 66, w - 60, 1.5);
    const swap = E.inOutCubic(inv(6.36, 6.78, t));
    const go = t < 6 ? lerp(.25, .62, inv(4.95, 6, t)) : t < 6.9 ? lerp(.62, .74, inv(6, 6.9, t)) : lerp(.74, .78, inv(6.9, 8.3, t));
    const oo = t < 6 ? lerp(.12, .48, inv(4.95, 6, t)) : lerp(.48, 1, E.inOutCubic(inv(6, 6.9, t)));
    const dimG = clamp(inv(7.1, 7.35, t));
    const lanes = [
      { name: 'GPT-6', col: '#AEB5BF', p: go, slot: swap, rank: swap > .5 ? 2 : 1, dim: dimG },
      { name: 'OPUS 5.5', col: C.orange, p: oo, slot: 1 - swap, rank: swap > .5 ? 1 : 2, dim: 0 },
    ];
    lanes.forEach(L => {
      const ly = y + 128 + L.slot * 110, tx = x + 190, tw = w - 230;
      ctx.save(); ctx.globalAlpha = 1 - L.dim * .55;
      setFont(ctx, 44, F.anton, 400, 0); ctx.fillStyle = L.rank === 1 ? C.lime : 'rgba(255,255,255,.4)'; ctx.fillText(String(L.rank), x + 32, ly + 26);
      setFont(ctx, 26, F.sans, 900, 0); ctx.fillStyle = '#fff'; ctx.fillText(L.name, x + 78, ly - 8);
      ctx.fillStyle = 'rgba(255,255,255,.1)'; rr(ctx, tx - 112, ly + 8, tw + 112, 14, 7); ctx.fill();
      const fw = (tw + 112) * L.p;
      const g = ctx.createLinearGradient(tx - 112, 0, tx - 112 + fw, 0); g.addColorStop(0, 'rgba(255,255,255,.05)'); g.addColorStop(1, L.col);
      ctx.fillStyle = g; rr(ctx, tx - 112, ly + 8, Math.max(14, fw), 14, 7); ctx.fill();
      ctx.save(); glow(ctx, L.col, 22); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(tx - 112 + fw, ly + 15, 11, 0, TAU); ctx.fill(); ctx.restore();
      if (L.name === 'OPUS 5.5' && t > 6 && t < 7.1) {
        ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) { const sx = tx - 112 + fw - 40 - hash(i, Math.floor(t * 30)) * 180, sy = ly + 2 + i * 5; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 60, sy); ctx.stroke(); }
      }
      if (L.name === 'OPUS 5.5') {
        const cp = E.outBack(inv(7.15, 7.4, t), 3);
        if (cp > 0) { ctx.save(); ctx.translate(x + 78 + 150, ly - 18); ctx.scale(cp, cp); crown(ctx, 0, 0, 18, C.lime); ctx.restore(); }
      }
      if (L.name === 'GPT-6' && L.dim > 0) {
        setFont(ctx, 20, F.mono, 700, 1); ctx.fillStyle = C.red; ctx.globalAlpha = L.dim; ctx.fillText('▼ 2º', x + 78 + 100, ly - 8);
      }
      ctx.restore();
    });
    // stamp
    const sp = E.outBack(inv(6.86, 7.08, t), 2.2);
    if (sp > 0) {
      ctx.save(); ctx.translate(x + w - 150, y + h + 6); ctx.rotate(-.12); const s = lerp(2.4, 1, sp); ctx.scale(s, s); ctx.globalAlpha = clamp(sp * 2);
      setFont(ctx, 58, F.anton, 400, 2); const tw = textW(ctx, 'ULTRAPASSOU!');
      ctx.fillStyle = C.lime; rr(ctx, -tw / 2 - 22, -46, tw + 44, 86, 10); ctx.fill();
      ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.fillText('ULTRAPASSOU!', 0, 22); ctx.restore();
    }
  }

  function checkStamp(ctx, t) {
    if (t < 23.82 || t > 24.7) return;
    const fc = rigAt('face', t), x = fc[0] * W + fc[2] * H * .62, y = fc[1] * H - fc[2] * H * .42;
    const p = E.outBack(inv(23.84, 24.06, t), 2.6), out = E.inBack(inv(24.42, 24.62, t));
    const s = lerp(1.8, 1, p) * (1 - out);
    ctx.save(); ctx.translate(x, y); ctx.rotate(-.1);
    const rp = inv(23.86, 24.3, t);
    if (rp > 0 && rp < 1) { ctx.strokeStyle = `rgba(200,255,46,${1 - rp})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, 80 + rp * 140, 0, TAU); ctx.stroke(); }
    ctx.scale(s, s); ctx.globalAlpha = clamp(p * 2);
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 20; ctx.fillStyle = C.lime; ctx.beginPath(); ctx.arc(0, 0, 78, 0, TAU); ctx.fill(); noGlow(ctx);
    checkMark(ctx, 0, 4, 80, C.ink, 15);
    ctx.restore();
  }

  function outro(ctx, t) {
    if (t < 24.6) return;
    const a = env(t, 24.62, 24.9, 25.5, 25.62);
    if (a > 0) {
      ctx.save(); ctx.globalAlpha = a;
      const x0 = 90, x1 = W - 90, y = H - 30, p = E.inOutCubic(inv(24.7, 25.6, t));
      ctx.fillStyle = 'rgba(255,255,255,.25)'; rr(ctx, x0, y - 4, x1 - x0, 8, 4); ctx.fill();
      ctx.fillStyle = C.orange; rr(ctx, x0, y - 4, (x1 - x0) * p, 8, 4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * p, y, 11, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // play-shaped wipe
    const w1 = E.inExpo(inv(25.42, 25.9, t)), w2 = E.inExpo(inv(25.58, 26.02, t));
    const tri = (s, col, rot) => {
      if (s <= 0) return;
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(rot); ctx.scale(s, s); ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(-.8, -1); ctx.lineTo(1.05, 0); ctx.lineTo(-.8, 1); ctx.closePath(); ctx.fill(); ctx.restore();
    };
    tri(w1 * 2600, C.orange, (1 - w1) * .5);
    tri(w2 * 2600, C.ink, (1 - w2) * -.4);
    // tiny play icon on the final frames
    const e = clamp(inv(25.92, 26.02, t));
    if (e > 0) { ctx.save(); ctx.globalAlpha = e; tri(46, C.orange, 0); ctx.restore(); }
    // intro-style badge before the wipe
    const pa = env(t, 24.64, 24.85, 25.35, 25.5, E.outBack, E.inBack);
    if (pa > 0) {
      ctx.save(); ctx.translate(W - 70, 84); ctx.scale(pa * 1.45, pa * 1.45);
      setFont(ctx, 24, F.mono, 800, 3); const label = 'CONTINUA', tw = textW(ctx, label);
      ctx.fillStyle = 'rgba(8,10,16,.75)'; rr(ctx, -tw - 110, -34, tw + 110, 68, 34); ctx.fill();
      ctx.fillStyle = C.orange; ctx.beginPath(); ctx.arc(-tw - 70, 0, 22, 0, TAU); ctx.fill();
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(-tw - 77, -10); ctx.lineTo(-tw - 60, 0); ctx.lineTo(-tw - 77, 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(label, -tw - 32, 9);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- post
  function glitch(ctx, amt, seed, buf) {
    if (amt <= 0) return;
    const b = buf.getContext('2d'); b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'copy'; b.drawImage(ctx.canvas, 0, 0); b.globalCompositeOperation = 'source-over';
    const n = Math.round(4 + amt * 10);
    for (let i = 0; i < n; i++) {
      const y = hash(i, seed) * H, h = 8 + hash(i + 40, seed) * 90 * amt, dx = (hash(i + 80, seed) - .5) * 160 * amt;
      ctx.drawImage(buf, 0, y, W, h, dx, y, W, h);
    }
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i % 2 ? `rgba(94,242,255,${.35 * amt})` : `rgba(255,45,70,${.35 * amt})`;
      ctx.fillRect(hash(i + 7, seed) * W * .7, hash(i + 9, seed) * H, 200 + hash(i, seed + 1) * 500, 6 + hash(i + 3, seed) * 30);
    }
    ctx.restore();
  }
  const FLASH = [[0, .9, .22], [3.28, .3, .18], [6.88, .35, .2], [15.25, .25, .15], [17.76, .55, .22], [23.84, .22, .15]];
  const GLITCH = [[0, .35, 1], [17.7, 17.98, .9], [6.86, 6.98, .5], [21.5, 21.6, .4], [23.52, 23.6, .5]];

  // ---------------------------------------------------------------- frame
  let bufA, bufB, bufC;
  function init(rig) { RIG = rig; bufA = mk(); bufB = mk(); bufC = mk(); }

  function renderFrame(ctx, f, img) {
    const t = f / FPS, cam = camera(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);

    // plate under the camera (kept in bufA so glass panels can blur it)
    const pa = bufA.getContext('2d');
    pa.setTransform(1, 0, 0, 1, 0, 0); pa.clearRect(0, 0, W, H);
    pa.save(); applyCam(pa, cam); pa.drawImage(img.plate, 0, 0, W, H); pa.restore();
    ctx.drawImage(bufA, 0, 0);

    if (needsBehind(t)) {
      behind(ctx, t, cam);
      const pb = bufB.getContext('2d');
      pb.setTransform(1, 0, 0, 1, 0, 0); pb.globalCompositeOperation = 'source-over'; pb.clearRect(0, 0, W, H);
      pb.save(); applyCam(pb, cam); pb.drawImage(img.matte, 0, 0, W, H); pb.restore();
      pb.globalCompositeOperation = 'source-in'; pb.drawImage(bufA, 0, 0); pb.globalCompositeOperation = 'source-over';
      ctx.drawImage(bufB, 0, 0);
    }

    // world-space graphics
    ctx.save(); applyCam(ctx, cam);
    holo(ctx, t); poof(ctx, t); questionMarks(ctx, t); chips(ctx, t); checkStamp(ctx, t);
    ctx.restore();

    // the screen lives in world space but needs the camera-space plate for its glass
    ctx.save(); applyCam(ctx, cam);
    const scr = benchScreen(ctx, t, img.plate);
    ctx.restore();
    if (scr) handsInFront(ctx, cam, scr, img, bufC);

    // screen-space HUD
    // soft floor gradient so captions always read
    const g = ctx.createLinearGradient(0, H - 300, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.42)');
    ctx.fillStyle = g; ctx.fillRect(0, H - 300, W, 300);
    badge(ctx, t);
    race(ctx, t, bufA);
    captions(ctx, t);
    outro(ctx, t);

    // post: glitch, flashes, vignette
    for (const [a, b, amt] of GLITCH) if (t >= a && t <= b) glitch(ctx, amt * (1 - inv(a, b, t)), Math.floor(t * 30), bufC);
    let fl = 0; for (const [ti, amp, dur] of FLASH) if (t >= ti) fl += amp * Math.max(0, 1 - (t - ti) / dur);
    if (fl > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(1, fl)})`; ctx.fillRect(0, 0, W, H); }
    const v = ctx.createRadialGradient(W / 2, H / 2, H * .45, W / 2, H / 2, H * 1.05);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.42)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  global.EDIT = { init, renderFrame, W, H, FPS };
})(window);
