/*
 * VOLTA — finale: 22 → 26 s
 *   22.00  MONTAGE — eight quarter-beat cuts through the brand systems:
 *          logo wall · palettes · type · app icons · BRANDS · THAT · MOVE. · spinning mark
 *   24.00  STATS   — slot-machine numerals, "Your startup is next."
 */
(function () {
  'use strict';
  const { W, H, TAU, T, C, F, rgba, mix, clamp, lerp, inv, E, hash, noise1, bg, rrect, circle,
    setFont, tw, layout, decode, drawRow, riseText, rollText } = V;
  const K = C.volta;

  // ---------------------------------------------------------------- client marks, unit-sized
  const MARKS = {
    flow: (ctx, x, y, r, t) => V.flow.coin(ctx, x, y, r, t * 5),
    munch: (ctx, x, y, r) => V.munch.face(ctx, x, y, r),
    nimbus: (ctx, x, y, r, t) => {
      for (let j = 0; j < 20; j++) {
        const a = j / 20 * TAU + t * 1.5, rr = r * (.78 + .1 * Math.sin(j * 3 + t * 6));
        ctx.fillStyle = rgba([C.nimbus.violet, C.nimbus.cyan, C.nimbus.pink, C.nimbus.white][j % 4]);
        circle(ctx, x + rr * Math.cos(a), y + rr * Math.sin(a), r * .085); ctx.fill();
      }
      ctx.fillStyle = rgba(C.nimbus.cyan); circle(ctx, x, y, r * .3); ctx.fill();
    },
    terra: (ctx, x, y, r) => V.terra.sun(ctx, x, y, r),
    volta: (ctx, x, y, r) => V.studio.drawMark(ctx, x, y, r),
  };
  const TILES = [
    ['flow', C.flow.violet, 'flowpay'], ['munch', C.munch.red, 'munch'],
    ['nimbus', C.nimbus.black, 'nimbus'], ['terra', C.terra.forest, 'terra'],
  ];

  const CUT = .25;
  function cut0(ctx, t, u) {           // logo wall
    bg(ctx, K.ink);
    const s = 360, g = 28, x0 = 960 - (4 * s + 3 * g) / 2;
    ctx.save(); ctx.translate(960, 540); ctx.scale(1 + .06 * u, 1 + .06 * u); ctx.translate(-960, -540);
    TILES.forEach(([k, col], i) => {
      const p = E.outBack(inv(i * .016, .085 + i * .016, u * CUT), 1.8);
      if (p <= 0) return;
      const x = x0 + i * (s + g) + s / 2;
      ctx.save(); ctx.translate(x, 540 + (1 - p) * 120); ctx.scale(p, p);
      rrect(ctx, -s / 2, -s / 2, s, s, 44); ctx.fillStyle = rgba(col); ctx.fill();
      if (k === 'nimbus') { ctx.strokeStyle = rgba(K.paper, .2); ctx.lineWidth = 2; ctx.stroke(); }
      MARKS[k](ctx, 0, 0, s * .27, t);
      ctx.restore();
    });
    ctx.restore();
  }
  function cut1(ctx, t, u) {           // palettes
    bg(ctx, K.paper);
    const cols = [
      ['#5B2EFF', '#160A52', '#4DF0C0', '#B9A8FF'], ['#FF4433', '#FFF1DA', '#FFC43B', '#2A160F'],
      ['#05050A', '#8C6CFF', '#46E5FF', '#FF6BD6'], ['#0E3A2B', '#EFE3C9', '#FF8A3D', '#7DB07A'],
    ].flat();
    const sw = W / 16;
    cols.forEach((hx, i) => {
      const p = E.outExpo(inv(i * .004, .08 + i * .004, u * CUT));
      const c = V.hex(hx), lum = .3 * c[0] + .59 * c[1] + .11 * c[2];
      const top = lerp(H + 20, 140 + (i % 4) * 60 + Math.sin(i * 1.7) * 30, p);
      ctx.fillStyle = hx; ctx.fillRect(i * sw - .5, top, sw + 1, H - top + 20);
      setFont(ctx, `600 13px ${F.mono}`, 1); ctx.fillStyle = lum > 140 ? rgba(K.ink, .8) : rgba(K.paper, .85);
      ctx.save(); ctx.translate(i * sw + sw / 2 + 5, top + 30); ctx.rotate(Math.PI / 2); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(hx, 0, 0); ctx.restore();
    });
  }
  const FONTS = [[`700 560px ${F.flow}`, 'SORA 700', C.flow.violet], [`700 560px ${F.munch}`, 'FREDOKA 700', C.munch.red],
    [`700 560px ${F.nimbus}`, 'SPACE GROTESK 700', C.nimbus.cyan], [`600 560px ${F.terra}`, 'FRAUNCES 600', C.terra.sun]];
  function cut2(ctx, t, u) {           // type
    bg(ctx, K.ink);
    const k = Math.floor(u * CUT / .0625) % 4, [font, name, col] = FONTS[k];
    setFont(ctx, font, -10);
    ctx.fillStyle = rgba(col); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const s = 1 + .08 * u;
    ctx.save(); ctx.translate(960, 560); ctx.scale(s, s); ctx.fillText('Aa', 0, 190); ctx.restore();
    setFont(ctx, `500 18px ${F.mono}`, 5); ctx.fillStyle = rgba(K.paper, .75);
    ctx.fillText(name, 960, 930);
    ctx.strokeStyle = rgba(K.paper, .3); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(760, 960); ctx.lineTo(1160, 960); ctx.stroke();
    ctx.fillStyle = rgba(K.volt); circle(ctx, 760 + 400 * ((k + u * 4) % 4) / 4, 960, 8); ctx.fill();
  }
  function cut3(ctx, t, u) {           // app icons
    bg(ctx, K.volt);
    const keysA = ['volta', 'flow', 'munch', 'nimbus', 'terra'];
    const bgs = [K.ink, C.flow.violet, C.munch.red, C.nimbus.black, C.terra.forest];
    const s = 230, g = 46, x0 = 960 - (5 * s + 4 * g) / 2;
    const dp = E.outExpo(inv(0, .06, u * CUT));
    rrect(ctx, x0 - 40, 540 - s / 2 - 40, (5 * s + 4 * g + 80) * dp, s + 80, 80); ctx.fillStyle = rgba(K.ink, .12); ctx.fill();
    keysA.forEach((k, i) => {
      const lt = u * CUT - i * .014, p = E.outBack(inv(0, .09, lt), 2.4);
      if (p <= 0) return;
      const sq = .18 * Math.exp(-Math.max(0, lt - .09) * 30) * Math.sin(Math.max(0, lt - .09) * 60);
      ctx.save(); ctx.translate(x0 + i * (s + g) + s / 2, 540 - (1 - p) * 80); ctx.scale(p * (1 + sq), p * (1 - sq));
      ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowOffsetY = 14; ctx.shadowBlur = 30;
      rrect(ctx, -s / 2, -s / 2, s, s, s * .23); ctx.fillStyle = rgba(bgs[i]); ctx.fill();
      ctx.shadowColor = 'transparent';
      MARKS[k](ctx, 0, 0, s * .3, t);
      ctx.restore();
    });
  }
  function kinetic(ctx, u, word, ground, ink, mode) {
    bg(ctx, ground);
    setFont(ctx, `900 ${mode === 2 ? 400 : 330}px ${F.studio}`, -12);
    const L = layout(ctx, word);
    ctx.textBaseline = 'alphabetic';
    const base = 540 + (mode === 2 ? 145 : 120);
    if (mode === 1) {   // echo outlines
      for (let k = 4; k >= 1; k--) {
        const s = 1 + k * .16 * E.outExpo(u);
        ctx.save(); ctx.translate(960, 540); ctx.scale(s, s); ctx.translate(-960, -540);
        ctx.strokeStyle = rgba(ink, .55 - k * .11); ctx.lineWidth = 3 / s;
        ctx.textAlign = 'center'; ctx.strokeText(word, 960, base); ctx.restore();
      }
      ctx.fillStyle = rgba(ink); ctx.textAlign = 'center'; ctx.fillText(word, 960, base);
      return;
    }
    ctx.fillStyle = rgba(ink);
    drawRow(ctx, word, 960, base, (i, n) => {
      const lt = u * CUT - i * .011;
      const p = E.outExpo(inv(0, .08, lt));
      if (p <= 0) return null;
      if (mode === 2) {
        const st = 1 + .5 * (1 - p);
        return { sx: 1 / st, sy: st, dy: (1 - p) * -220 + noise1(u * 30, i) * 6 };
      }
      return { sx: lerp(1.6, 1, p), sy: lerp(1.6, 1, p), alpha: p, dx: (i - (n - 1) / 2) * 50 * (1 - p) };
    }, { align: 'center', pivotY: 120 });
  }
  function cut7(ctx, t, u) {           // spinning, extruded studio mark
    bg(ctx, K.ink);
    const ang = lerp(-1.9, .0, E.outExpo(u));
    const R = 230 * (1 + .1 * u);
    // speed rays
    ctx.save(); ctx.translate(960, 540);
    for (let k = 0; k < 40; k++) {
      const a = hash(k, 3) * TAU, r0 = 320 + hash(k, 4) * 300 + u * 500, len = 60 + hash(k, 5) * 200;
      ctx.strokeStyle = rgba(K.paper, .25 * (1 - u)); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(r0 * Math.cos(a), r0 * Math.sin(a)); ctx.lineTo((r0 + len) * Math.cos(a), (r0 + len) * Math.sin(a)); ctx.stroke();
    }
    ctx.restore();
    const sx = Math.cos(ang), depth = Math.sin(ang);
    for (let k = 14; k >= 0; k--) {
      ctx.save();
      ctx.translate(960 + depth * k * 3.2, 540); ctx.scale(sx, 1);
      const shade = k === 0 ? null : rgba(mix(K.volt, K.ink, .45 + k / 30));
      V.studio.drawMark(ctx, 0, 0, R, k === 0 ? {} : { ring: shade, dotCol: shade });
      ctx.restore();
    }
  }
  const CUTS = [cut0, cut1, cut2, cut3,
    (ctx, t, u) => kinetic(ctx, u, 'BRANDS', K.paper, K.ink, 0),
    (ctx, t, u) => kinetic(ctx, u, 'THAT', K.ink, K.volt, 1),
    (ctx, t, u) => kinetic(ctx, u, 'MOVE.', K.volt, K.ink, 2),
    cut7];
  function montage(ctx, t) {
    const lt = t - T.montage, k = Math.min(7, Math.floor(lt / CUT)), u = (lt - k * CUT) / CUT;
    CUTS[k](ctx, t, u);
    // a one-frame-ish flash on every cut
    const f = Math.exp(-(lt - k * CUT) * 40);
    if (f > .05) { ctx.fillStyle = rgba(K.paper, f * .16); ctx.fillRect(-100, -100, W + 200, H + 200); }
  }

  // ---------------------------------------------------------------- stats
  const STATS = [['140+', 'startups branded'], ['$3.2B', 'raised by our founders'], ['11', 'unicorns, so far']];
  function stats(ctx, t) {
    const lt = t - T.stats;
    bg(ctx, K.paper);
    const out = E.inOutExpo(inv(1.7, 2.0, lt));
    ctx.save();
    ctx.translate(0, -out * 300);
    ctx.fillStyle = rgba(K.ink);
    setFont(ctx, `500 16px ${F.mono}`, 4); ctx.textBaseline = 'middle';
    decode(ctx, 'IMPACT  ·  2019 — 2026', 120, 230, lt, .02, 'left', .014, .12);
    decode(ctx, 'STUDIO NUMBERS', W - 120, 230, lt, .06, 'right', .014, .12);
    const rl = E.outExpo(inv(0, .5, lt));
    ctx.fillRect(120, 262, (W - 240) * rl, 2);
    STATS.forEach(([num, label], i) => {
      const x = 120 + i * 600, t0 = .12 + i * .14;
      if (i) { const vl = E.outExpo(inv(t0, t0 + .4, lt)); ctx.fillRect(x - 40, 300, 2, 360 * vl); }
      ctx.textBaseline = 'alphabetic';
      setFont(ctx, `700 134px ${F.studio}`, -5);
      rollText(ctx, num, x, 510, lt, t0, { dur: .55, per: .07, spins: 2, lh: 130, top: .9, bot: .25 });
      setFont(ctx, `500 32px ${F.sans}`, -.3);
      ctx.fillStyle = rgba(K.ink, .72);
      riseText(ctx, label, x + 4, 600, lt, t0 + .25, { h: 40, per: .01, dur: .4 });
      ctx.fillStyle = rgba(K.ink);
    });
    // headline with a volt highlighter
    setFont(ctx, `italic 400 138px ${F.serif}`, -1);
    const pre = 'Your startup is ', w0 = tw(ctx, pre), w1 = tw(ctx, 'next.'), x0 = 960 - (w0 + w1) / 2;
    const hl = E.snappy(inv(1.05, 1.3, lt));
    if (hl > 0) { ctx.fillStyle = rgba(K.volt); ctx.fillRect(x0 + w0 - 10, 790, (w1 + 30) * hl, 92); }
    ctx.fillStyle = rgba(K.ink);
    riseText(ctx, pre + 'next.', x0, 860, lt, .78, { h: 140, per: .016, dur: .5 });
    ctx.restore();
    // ink rises to the end card
    if (out > 0) { ctx.fillStyle = rgba(K.ink); ctx.fillRect(-100, H - (H + 200) * out, W + 200, H + 400); }
  }

  Object.assign(V.scenes, { montage, stats });
})();
