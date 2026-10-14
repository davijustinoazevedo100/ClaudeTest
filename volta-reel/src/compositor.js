/*
 * VOLTA — compositor: scene dispatch, camera shake, HUD, finishing.
 *
 *     V.renderFrame(ctx, t, { samples })
 *
 * samples > 1 integrates a 180° shutter over sub-frames for real motion blur.
 */
(function () {
  'use strict';
  const { W, H, FPS, DUR, BPM, TAU, T, C, F, rgba, mix, clamp, lerp, inv, E, noise1, buf, setFont, tw, decode, scenes: S } = V;

  // ---------------------------------------------------------------- timeline
  const SEQ = ['intro', 'zero', 'volta', 'flow', 'munch', 'nimbus', 'terra', 'montage', 'stats', 'end'];
  function sceneAt(t) {
    let name = SEQ[0];
    for (const n of SEQ) if (t >= T[n]) name = n;
    return S[name];
  }

  // Impacts: [time, strength]. Drive camera shake and the chromatic split.
  const HITS = [
    [1.5, 6], [2.0, 6], [3.0, 26], [4.0, 18], [6.0, 16], [6.8, 6], [7.25, 10], [8.25, 8], [9.25, 6], [9.5, 8],
    [10.0, 16], [10.5, 20], [10.85, 6], [11.0, 6], [11.15, 6], [11.3, 6], [11.45, 6], [13.0, 8], [14.0, 20], [15.0, 9],
    [15.75, 12], [17.75, 10], [18.0, 14], [19.0, 9], [20.25, 8], [22.0, 18], [22.25, 12], [22.5, 12], [22.75, 12],
    [23.0, 16], [23.25, 16], [23.5, 20], [23.75, 14], [24.0, 18], [24.5, 6], [24.75, 6], [25.0, 8], [26.32, 22], [26.6, 6],
  ];
  function shake(t) {
    let x = 0, y = 0, r = 0;
    for (const [h, a] of HITS) {
      const d = t - h; if (d < 0 || d > .5) continue;
      const env = a * Math.exp(-d * 12);
      x += env * noise1(d * 38, h * 7); y += env * noise1(d * 38, h * 7 + 3); r += env * .0008 * noise1(d * 30, h * 5 + 1);
    }
    return { x, y, r };
  }
  function splitAmt(t) {
    let a = 0;
    for (const [h, s] of HITS) { const d = t - h; if (d >= 0 && d < .3 && s >= 12) a = Math.max(a, s * .55 * Math.exp(-d * 18)); }
    return a;
  }

  // ---------------------------------------------------------------- HUD
  // Studio chrome that frames the case studies: who, what, which one, when.
  const CASES = [
    [T.flow, '01', 'FLOWPAY', 'FINTECH', 'IDENTITY · MOTION · PRODUCT'],
    [T.munch, '02', 'MUNCH', 'FOOD DELIVERY', 'IDENTITY · CHARACTER · ILLUSTRATION'],
    [T.nimbus, '03', 'NIMBUS', 'AI INFRASTRUCTURE', 'IDENTITY · GENERATIVE · 3D'],
    [T.terra, '04', 'TERRA', 'CLIMATE TECH', 'IDENTITY · DATA · SYSTEMS'],
    [T.montage, '05', 'BRAND SYSTEMS', 'ALL CLIENTS', 'GUIDELINES · TOOLKITS · LAUNCH'],
    [T.stats, '06', 'IMPACT', '2019 — 2026', 'BY THE NUMBERS'],
  ];
  // HUD ink per section (light text on dark grounds and vice versa)
  const HUDC = [[0, C.volta.paper], [T.flow, C.flow.white], [T.munch, C.munch.cream], [T.nimbus, C.nimbus.white], [T.terra, C.terra.sand],
    [T.montage, C.volta.paper], [22.25, C.volta.ink], [22.5, C.volta.paper], [22.75, C.volta.ink], [23.0, C.volta.ink], [23.25, C.volta.paper], [23.5, C.volta.ink], [23.75, C.volta.paper], [T.stats, C.volta.ink], [T.end, C.volta.paper]];
  const hudCol = t => { let c = HUDC[0][1]; for (const [tt, cc] of HUDC) if (t >= tt) c = cc; return c; };
  function timecode(t) {
    const f = Math.min(Math.round(t * FPS), DUR * FPS), s = Math.floor(f / FPS), ff = f % FPS;
    return `00:${String(s).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;
  }
  function drawHUD(ctx, t) {
    const a = inv(T.volta + .9, T.volta + 1.2, t) * (1 - inv(T.end - .1, T.end + .05, t));
    if (a <= 0) return;
    const c = hudCol(t), m = 60;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = ctx.strokeStyle = rgba(c);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';

    // top left: studio
    const t0 = T.volta + .9;
    setFont(ctx, `800 17px ${F.studio}`, .5);
    const studio = 'VOLTA®';
    decode(ctx, studio, m, m, t, t0, 'left', .03, .1);
    const sw = tw(ctx, studio);
    setFont(ctx, `500 14px ${F.mono}`, 2.4);
    decode(ctx, 'SHOWREEL 2026', m + sw + 22, m + 1, t, t0 + .05, 'left', .015, .1);

    // top right: section counter
    const k = CASES.reduce((acc, cc, i) => t >= cc[0] ? i : acc, -1);
    const right = k >= 0 ? `SELECTED WORK  ${CASES[k][1]} / 06` : 'SELECTED WORK  — / 06';
    decode(ctx, right, W - m, m + 1, t, t0 + .1, 'right', .012, .1);

    // bottom left: case label, swapped with a vertical roll
    ctx.save();
    ctx.beginPath(); ctx.rect(m - 10, H - m - 40, 1100, 64); ctx.clip();
    CASES.forEach(([st, num, name, sector, disc], i) => {
      const next = CASES[i + 1];
      const pin = E.outExpo(inv(st, st + .45, t)), pout = next ? E.outExpo(inv(next[0], next[0] + .45, t)) : 0;
      if (pin <= 0 || pout >= 1) return;
      const dy = (1 - pin) * 60 - pout * 60;
      setFont(ctx, `700 15px ${F.mono}`, 2.4);
      ctx.fillText(num, m, H - m - 12 + dy);
      setFont(ctx, `800 15px ${F.studio}`, 1);
      ctx.fillText(name, m + 44, H - m - 12 + dy);
      const nw = tw(ctx, name);
      setFont(ctx, `500 14px ${F.mono}`, 2.4);
      ctx.globalAlpha = a * .7;
      ctx.fillText('—  ' + sector, m + 44 + nw + 18, H - m - 12 + dy);
      ctx.fillText(disc, m + 44, H - m + 14 + dy);
      ctx.globalAlpha = a;
    });
    ctx.restore();

    // bottom right: timecode + progress
    setFont(ctx, `500 14px ${F.mono}`, 2.4);
    const tc = timecode(t);
    ctx.textAlign = 'right';
    ctx.fillText(tc, W - m, H - m - 12);
    const bw = 220, bx = W - m - bw, by = H - m + 12;
    ctx.globalAlpha = a * .3; ctx.fillRect(bx, by, bw, 2);
    ctx.globalAlpha = a; ctx.fillRect(bx, by, bw * t / DUR, 2);
    for (const [st] of CASES) { const x = bx + bw * st / DUR; ctx.fillRect(x - 1, by - (t >= st ? 5 : 3), 2, t >= st ? 12 : 8); }
    ctx.restore();
  }

  // ---------------------------------------------------------------- finishing
  function rgbSplit(ctx, amt) {
    if (amt < .6) return;
    const src = buf('split_src'), ch = ['#f00', '#0f0', '#00f'].map((c, i) => [buf('split_' + i), c]);
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
  // Bloom: blurred copy of the bright parts added back on top.
  function bloom(ctx, amt) {
    if (amt <= .01) return;
    const b = buf('bloom', W / 4, H / 4);
    b.x.setTransform(1, 0, 0, 1, 0, 0);
    b.x.globalCompositeOperation = 'copy';
    b.x.filter = 'blur(6px)';
    b.x.drawImage(ctx.canvas, 0, 0, W / 4, H / 4);
    b.x.filter = 'none';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = amt;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(b.c, 0, 0, W, H);
    ctx.restore();
  }
  const bloomAmt = t => .55 * V.win(t, T.nimbus - .05, T.terra + .6, .15, .5) + .18 * V.win(t, T.end, T.end + 4, .5, .5);
  function vignette(ctx) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * .45, W / 2, H / 2, H * 1.05);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function renderScene(ctx, t) {
    ctx.save();
    const sh = shake(t);
    ctx.translate(W / 2 + sh.x, H / 2 + sh.y); ctx.rotate(sh.r); ctx.translate(-W / 2, -H / 2);
    const fn = sceneAt(t);
    if (fn) fn(ctx, t); else { ctx.fillStyle = '#222'; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }
  function renderFrame(ctx, t, opts = {}) {
    const N = opts.samples || 1, shutter = (opts.shutter ?? .5) / FPS;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (N === 1) renderScene(ctx, t);
    else {
      const Sb = buf('sub');
      for (let k = 0; k < N; k++) {
        Sb.x.setTransform(1, 0, 0, 1, 0, 0);
        renderScene(Sb.x, t + (k / N) * shutter);
        ctx.globalAlpha = 1 / (k + 1);
        ctx.drawImage(Sb.c, 0, 0);
      }
      ctx.globalAlpha = 1;
    }
    if (opts.fx !== false) {
      bloom(ctx, bloomAmt(t));
      rgbSplit(ctx, splitAmt(t));
      vignette(ctx);
    }
    drawHUD(ctx, t);
    ctx.restore();
  }

  Object.assign(V, { renderFrame, HITS });
})();
