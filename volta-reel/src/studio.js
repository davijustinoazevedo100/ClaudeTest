/*
 * VOLTA — studio scenes: the opening (0 → 6 s) and the end card (26 → 30 s).
 *
 * The studio mark is a ring that makes three quarters of a turn ("volta") and
 * a dot sitting in the gap: the idea every startup begins with. The dot is the
 * thread through the whole reel; it opens the film, becomes the 0, becomes
 * the 1, and closes the film again.
 */
(function () {
  'use strict';
  const { W, H, TAU, T, C, F, rgba, mix, clamp, lerp, inv, E, keys, hash, noise1,
    bg, circle, rrect, setFont, layout, tw, decode, drawRow, riseText, resample, morph, polyline } = V;
  const K = C.volta;

  // ---------------------------------------------------------------- the mark
  // R = outer radius. The ring runs clockwise from 3 o'clock to 12 o'clock;
  // the dot sits in the open quarter.
  const MARK = { sw: .4, dot: .26, a0: .2, sweep: Math.PI * 2 - .2 - Math.PI / 2 - .2 };
  const markDot = (x, y, R) => { const rc = R * (1 - MARK.sw / 2), a = -Math.PI / 4; return [x + rc * Math.cos(a), y + rc * Math.sin(a)]; };
  function drawMark(ctx, x, y, R, o = {}) {
    const sw = R * MARK.sw * (o.swk ?? 1), rc = R - R * MARK.sw / 2;
    const a0 = o.a0 ?? 0, p = o.p ?? 1;
    ctx.save();
    if (p > 0) {
      ctx.strokeStyle = o.ring || rgba(K.paper);
      ctx.lineWidth = sw; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, y, rc, a0 + MARK.a0, a0 + MARK.a0 + MARK.sweep * p); ctx.stroke();
    }
    const ds = o.dotScale ?? 1;
    if (ds > 0) {
      const [dx, dy] = markDot(x, y, R);
      ctx.fillStyle = o.dotCol || rgba(K.volt);
      circle(ctx, dx, dy, R * MARK.dot * ds); ctx.fill();
    }
    ctx.restore();
  }

  // Wordmark "V◯LTA": the mark stands in for the O.
  const WM = { font: s => `800 ${s}px ${F.studio}`, ls: s => -s * .02 };
  const _capH = new Map();
  function capH(ctx, size) {
    if (!_capH.has(size)) { setFont(ctx, WM.font(size), WM.ls(size)); _capH.set(size, ctx.measureText('V').actualBoundingBoxAscent); }
    return _capH.get(size);
  }
  // Geometry of the lockup centred on (cx, cy = optical centre of the caps).
  function lockup(ctx, cx, cy, size) {
    const ch = capH(ctx, size);
    setFont(ctx, WM.font(size), WM.ls(size));
    const wV = tw(ctx, 'V'), wR = tw(ctx, 'LTA');
    const R = ch / 2 * 1.04, g = size * .045;
    const total = wV + g + 2 * R + g + wR;
    const x0 = cx - total / 2;
    return { size, ch, R, base: cy + ch / 2, xV: x0, oX: x0 + wV + g + R, oY: cy, xR: x0 + wV + g + 2 * R + g, wV, wR, total, x0, x1: x0 + total };
  }
  // em: 0..1 how far the letters have emerged from behind the O.
  function drawLockup(ctx, L, em, o = {}) {
    setFont(ctx, WM.font(L.size), WM.ls(L.size));
    ctx.fillStyle = o.fill || rgba(K.paper);
    ctx.textAlign = 'left';
    const out = o.out ?? 0;
    if (em > 0) {
      const sl = (1 - em) * (L.wV + L.R);
      ctx.save(); ctx.beginPath(); ctx.rect(L.x0 - 400, L.oY - L.size, L.oX - L.R * .2 - (L.x0 - 400), L.size * 2); ctx.clip();
      ctx.fillText('V', L.xV + sl, L.base + out * L.size * 1.1);
      ctx.restore();
      const sr = (1 - em) * (L.wR + L.R);
      ctx.save(); ctx.beginPath(); ctx.rect(L.oX + L.R * .2, L.oY - L.size, L.x1 + 400 - L.oX, L.size * 2); ctx.clip();
      drawRow(ctx, 'LTA', L.xR - sr, L.base, (i) => ({ dy: out * L.size * 1.1 * clamp(1 + i * .25 * out) }));
      ctx.restore();
    }
  }

  // ================================================================ 00 INTRO  (0 → 2)
  // "Every startup / starts at 0." — the volt dot is the cursor, then the zero.
  const IN = {
    l1: 'Every startup', l2: 'starts at',
    f1: `600 108px ${F.studio}`, ls1: -3,
    f2: `italic 400 158px ${F.serif}`, ls2: -1,
    y1: 500, y2: 668, ringR: 58, ringSW: 21, dotR: 15,
  };
  function introGeo(ctx) {
    if (IN.g) return IN.g;
    setFont(ctx, IN.f1, IN.ls1); const L1 = layout(ctx, IN.l1);
    setFont(ctx, IN.f2, IN.ls2); const L2 = layout(ctx, IN.l2);
    const ringW = 2 * IN.ringR, gap = 46;
    const bw = Math.max(L1.w, L2.w + gap + ringW);
    const x0 = 960 - bw / 2;
    const ring = [x0 + L2.w + gap + IN.ringR, IN.y2 - IN.ringR - 4];
    return (IN.g = { L1, L2, x0, ring });
  }
  function intro(ctx, t) {
    bg(ctx, K.ink);
    const g = introGeo(ctx);
    const words1 = [['Every', 0, .5], ['startup', 6, .75]], words2 = [['starts', 0, 1.0], ['at', 7, 1.25]];
    const endOf = (L, i, w) => L.xs[i] + layout(ctx, w).w;

    // camera: gentle push, then a dive into the zero
    const zp = E.inOutQuart(inv(1.56, 2.0, t));
    const S = Math.exp(Math.log(300 / IN.ringR) * zp) * (1 + .03 * inv(0, 1.56, t) * (1 - zp));
    const fx = lerp(960, g.ring[0], zp), fy = lerp(540, g.ring[1], zp);
    ctx.save();
    ctx.translate(960, 540); ctx.scale(S, S); ctx.translate(-fx, -fy);

    const wordsA = 1 - inv(1.6, 1.85, t);
    ctx.globalAlpha = wordsA;
    ctx.fillStyle = rgba(K.paper);
    setFont(ctx, IN.f1, IN.ls1);
    for (const [w, i, t0] of words1) riseText(ctx, w, g.x0 + g.L1.xs[i], IN.y1, t, t0, { h: 120, per: .028, dur: .5 });
    setFont(ctx, IN.f2, IN.ls2);
    ctx.fillStyle = rgba(K.paper, .78);
    for (const [w, i, t0] of words2) riseText(ctx, w, g.x0 + g.L2.xs[i], IN.y2, t, t0, { h: 150, per: .03, dur: .5, rot: .06 });
    ctx.globalAlpha = 1;

    // the dot: pops, then rides at the end of each new word like a cursor
    setFont(ctx, IN.f1, IN.ls1);
    const e1 = w => g.x0 + endOf(g.L1, w[1], w[0]) + 30;
    setFont(ctx, IN.f2, IN.ls2);
    const e2 = w => g.x0 + endOf(g.L2, w[1], w[0]) + 26;
    const r = IN.dotR;
    const path = [
      [0, [960, 540]],
      [.5, [e1(words1[0]), IN.y1 - r]],
      [.75, [e1(words1[1]), IN.y1 - r]],
      [1.0, [e2(words2[0]), IN.y2 - r]],
      [1.25, [e2(words2[1]), IN.y2 - r]],
      [1.5, g.ring],
    ];
    const pos = tt => keys(tt, path, .26, E.snappy);
    const [dx, dy] = pos(t), [px, py] = pos(t - 1 / 240);
    const vx = (dx - px) * 240, vy = (dy - py) * 240, sp = Math.hypot(vx, vy);
    const pop = E.outBack(inv(.04, .26, t), 3);
    const st = 1 + clamp(sp / 5200) * .9;

    // inflate into a ring
    const ip = E.outBack(inv(1.5, 1.72, t), 1.6);
    ctx.fillStyle = rgba(K.volt);
    if (ip <= 0) {
      ctx.save();
      ctx.translate(dx, dy); ctx.rotate(Math.atan2(vy, vx)); ctx.scale(st, 1 / st);
      // beat breathing before the words arrive
      const br = t < .5 ? 1 + .12 * Math.exp(-((t - .25) % .25) * 18) * inv(.25, .3, t) : 1;
      circle(ctx, 0, 0, r * pop * br); ctx.fill();
      ctx.restore();
      // ripple on appear
      const rp = inv(.04, .7, t);
      if (rp > 0 && rp < 1) { ctx.strokeStyle = rgba(K.volt, (1 - rp) * .7); ctx.lineWidth = 2; circle(ctx, 960, 540, r + 120 * E.outExpo(rp)); ctx.stroke(); }
    } else {
      const Ro = lerp(r, IN.ringR, ip), Ri = Math.max(0, lerp(0, IN.ringR - IN.ringSW, E.outCubic(inv(1.5, 1.7, t))));
      ctx.beginPath();
      ctx.arc(dx, dy, Ro, 0, TAU); ctx.arc(dx, dy, Math.min(Ri, Ro - 1), 0, TAU, true);
      ctx.fill('evenodd');
    }
    ctx.restore();
  }

  // ================================================================ 01 ZERO → ONE  (2 → 4)
  const Z = { R: 300, sw: 108, N: 260 };
  Z.rc = Z.R - Z.sw / 2;
  function onePath(cx, cy, s) {
    const top = cy - Z.rc * s * 1.02, bot = cy + Z.rc * s * 1.02, sx = cx + 26 * s;
    return [[sx - 150 * s, top + 112 * s], [sx - 75 * s, top + 56 * s], [sx, top], [sx, bot]];
  }
  function ringPath(cx, cy, rc) {
    const a0 = -Math.PI * .78;
    return Array.from({ length: Z.N }, (_, i) => { const a = a0 + TAU * i / (Z.N - 1); return [cx + rc * Math.cos(a), cy + rc * Math.sin(a)]; });
  }
  // The VOLTA dot position used by the next scene (big mark, R 150, centred)
  const VR = 150;
  function zero(ctx, t) {
    bg(ctx, K.ink);
    const lt = t - T.zero;

    // dial
    const dial = E.outExpo(inv(.02, .5, lt)) * (1 - inv(1.45, 1.6, lt));
    if (dial > 0) {
      ctx.save();
      ctx.translate(960, 540); ctx.rotate(-.25 + lt * .12 - .2 * E.outExpo(inv(.5, 1.0, lt)));
      ctx.strokeStyle = rgba(K.paper, .28 * dial); ctx.lineWidth = 2; ctx.lineCap = 'butt';
      ctx.beginPath();
      const n = 90;
      for (let i = 0; i < n * dial; i++) {
        const a = i / n * TAU, l = i % 15 === 0 ? 30 : i % 5 === 0 ? 18 : 9;
        ctx.moveTo(392 * Math.cos(a), 392 * Math.sin(a)); ctx.lineTo((392 + l) * Math.cos(a), (392 + l) * Math.sin(a));
      }
      ctx.stroke();
      setFont(ctx, `500 13px ${F.mono}`, 1.5); ctx.fillStyle = rgba(K.paper, .4 * dial); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU - Math.PI / 2; ctx.save(); ctx.translate(448 * Math.cos(a), 448 * Math.sin(a)); ctx.rotate(a + Math.PI / 2); ctx.fillText(String(i * 60).padStart(3, '0') + '°', 0, 0); ctx.restore(); }
      ctx.restore();
    }

    // shape: ring → "1" → dot
    const wind = .16 * Math.sin(Math.PI * inv(.25, .5, lt));                     // anticipation
    const mp = E.outBack(inv(.5, 1.0, lt), 1.15);
    const slide = E.snappy(inv(1.0, 1.4, lt));
    const ox = lerp(960, 600, slide), sc = lerp(1, .8, slide);
    const ring = ringPath(960, 540, Z.rc).map(([x, y]) => { const a = Math.atan2(y - 540, x - 960) + wind, r = Math.hypot(x - 960, y - 540); return [960 + r * Math.cos(a), 540 + r * Math.sin(a)]; });
    const one = resample(onePath(960, 540, 1), Z.N);
    let pts = morph(ring, one, mp).map(([x, y]) => [ox + (x - 960) * sc, 540 + (y - 540) * sc]);
    let lw = Z.sw * sc;

    // collapse into the dot, which flies to its seat in the studio mark
    const cp = E.inOutExpo(inv(1.5, 1.82, lt));
    const [mdx, mdy] = markDot(960, 540, VR);
    const dotR = VR * MARK.dot;
    if (cp > 0) {
      const bx = ox + 26 * sc, by = 540 + Z.rc * sc;
      const fly = E.snappy(inv(1.66, 2.0, lt));
      const tx = lerp(bx, mdx, fly), ty = lerp(by, mdy, fly);
      pts = pts.map(([x, y]) => [lerp(x, tx, cp), lerp(y, ty, cp)]);
      lw = lerp(lw, dotR * 2, cp);
      if (cp >= 1) pts = pts.map(() => [tx, ty]);
    }
    const hit = Math.exp(-Math.max(0, lt - 1.0) * 9) * (lt >= 1.0 ? 1 : 0);
    ctx.strokeStyle = rgba(mix(K.volt, K.paper, hit * .5));
    ctx.lineWidth = lw * (1 + hit * .06); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    polyline(ctx, pts); ctx.stroke();
    if (cp >= 1) { ctx.fillStyle = rgba(K.volt); circle(ctx, pts[0][0], pts[0][1], lw / 2); ctx.fill(); }

    // shock ring on the 1
    if (lt > 1.0 && lt < 1.6) {
      const k = inv(1.0, 1.6, lt);
      ctx.strokeStyle = rgba(K.volt, (1 - k) * .6); ctx.lineWidth = 3;
      circle(ctx, ox, 540, 340 + 500 * E.outExpo(k)); ctx.stroke();
    }

    // callouts: before (0) and after (1)
    const after = lt >= 1.0;
    const notes = [
      [-1, -.62, 'USERS', '0', '1.2M'],
      [1, -.1, 'MRR', '$0', '$4.8M'],
      [-1, .55, 'BRAND', 'NONE', 'ICONIC'],
    ];
    const na = inv(.12, .3, lt) * (1 - inv(1.0, 1.08, lt)) + inv(1.08, 1.18, lt) * (1 - inv(1.4, 1.5, lt));
    if (na > 0) {
      ctx.save(); ctx.globalAlpha = na;
      notes.forEach(([side, yy, k, v0, v1], j) => {
        const shapeX = after ? ox : 960, rad = after ? 120 : Z.R + 6;
        const ax = shapeX + side * rad * (after ? .5 : Math.sqrt(1 - yy * yy)), ay = 540 + yy * (after ? 260 : Z.R);
        const lx = shapeX + side * (after ? 260 : 470), ly = ay - 44;
        const t0 = after ? 1.08 + j * .05 : .12 + j * .08;
        const pl = E.outExpo(inv(t0, t0 + .35, lt));
        ctx.strokeStyle = ctx.fillStyle = rgba(K.paper, .85);
        ctx.lineWidth = 1.5;
        circle(ctx, ax, ay, 5); ctx.fill();
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(lerp(ax, lx, pl), lerp(ay, ly, pl)); ctx.stroke();
        setFont(ctx, `500 15px ${F.mono}`, 2);
        const label = k + '   ' + (after ? v1 : v0);
        const w = tw(ctx, label);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + side * (w + 10) * pl, ly); ctx.stroke();
        ctx.textBaseline = 'bottom';
        decode(ctx, label, side > 0 ? lx + 4 : lx - w - 4, ly - 8, lt, t0 + .06, 'left', .02, .12);
        ctx.textBaseline = 'alphabetic';
      });
      ctx.restore();
    }

    // "We take startups / from zero to one."
    const tx0 = 900;
    if (lt > 1.0 && lt < 1.8) {
      ctx.fillStyle = rgba(K.paper);
      setFont(ctx, `500 62px ${F.studio}`, -1.5);
      riseText(ctx, 'We take startups', tx0, 470, lt, 1.04, { h: 70, per: .016, dur: .45, out: 1.5 });
      setFont(ctx, `italic 400 150px ${F.serif}`, -1);
      ctx.fillStyle = rgba(K.volt);
      riseText(ctx, 'from zero to one.', tx0 - 6, 640, lt, 1.12, { h: 150, per: .018, dur: .5, out: 1.52 });
    }
  }

  // ================================================================ 02 VOLTA  (4 → 6)
  function volta(ctx, t) {
    bg(ctx, K.ink);
    const lt = t - T.volta;
    const L = lockup(ctx, 960, 470, 196);

    // construction lines
    const cons = E.outExpo(inv(0, .45, lt)) * (1 - inv(.62, .8, lt));
    if (cons > 0) {
      ctx.save();
      ctx.strokeStyle = rgba(K.paper, .22 * cons); ctx.lineWidth = 1.5;
      const ext = 900 * E.outExpo(inv(0, .6, lt));
      ctx.beginPath(); ctx.moveTo(960 - ext, 540); ctx.lineTo(960 + ext, 540); ctx.moveTo(960, 540 - ext * .6); ctx.lineTo(960, 540 + ext * .6); ctx.stroke();
      const [mx, my] = markDot(960, 540, VR);
      ctx.beginPath(); ctx.moveTo(960, 540); ctx.lineTo(960 + (mx - 960) * 2.2 * cons, 540 + (my - 540) * 2.2 * cons); ctx.stroke();
      ctx.setLineDash([3, 7]);
      circle(ctx, 960, 540, VR * (1 - MARK.sw / 2)); ctx.stroke();
      circle(ctx, 960, 540, VR); ctx.stroke();
      circle(ctx, 960, 540, VR * (1 - MARK.sw)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = rgba(K.volt, .8 * cons); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(960, 540, VR + 46, -Math.PI / 2, -Math.PI / 2 + Math.PI / 2 * E.outExpo(inv(.1, .5, lt))); ctx.stroke();
      ctx.restore();
      V.callout(ctx, 960 + (VR + 46) * Math.cos(-Math.PI / 4), 540 + (VR + 46) * Math.sin(-Math.PI / 4), 1290, 300, 'GAP 90°', lt, .12, .62, K.volt);
      V.callout(ctx, 960 - VR, 540, 640, 420, 'R 1.00 · STROKE 0.40', lt, .18, .62, K.paper, true);
      V.callout(ctx, mx, my, 1260, 640, 'THE DOT — 0.29R', lt, .26, .62, K.paper);
    }

    // mark → O of the wordmark
    const fm = E.snappy(inv(.55, 1.0, lt));
    const R = lerp(VR, L.R, fm), mx = lerp(960, L.oX, fm), my = lerp(540, L.oY, fm);
    const draw = E.outExpo(inv(0, .6, lt));
    const swk = E.outBack(inv(0, .3, lt), 2);
    const pulse = 1 + .3 * Math.exp(-lt * 10);

    // exit: everything drops away, the dot swallows the frame
    const ex = inv(1.5, 1.85, lt);
    const zoom = E.inExpo(inv(1.56, 2.0, lt));
    drawLockup(ctx, L, E.outExpo(inv(.62, 1.1, lt)), { out: E.inBack(ex, 1.4) });

    ctx.save();
    if (ex > 0) { ctx.globalAlpha = 1 - inv(1.5, 1.7, lt); }
    drawMark(ctx, mx, my, R, { p: draw, swk, dotScale: 0 });
    ctx.restore();

    // ® + tagline + chips
    const sub = 1 - inv(1.48, 1.62, lt);
    if (sub > 0) {
      ctx.save(); ctx.globalAlpha = sub;
      const rp = E.outBack(inv(.92, 1.1, lt), 3);
      if (rp > 0) {
        ctx.fillStyle = rgba(K.paper);
        setFont(ctx, `500 34px ${F.studio}`, 0);
        ctx.save(); ctx.translate(L.x1 + 26, L.base - L.ch + 16); ctx.scale(rp, rp); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('®', 0, 0); ctx.restore();
      }
      ctx.fillStyle = rgba(K.paper, .7); ctx.textBaseline = 'alphabetic';
      setFont(ctx, `500 22px ${F.mono}`, 7);
      decode(ctx, 'BRAND & MOTION STUDIO FOR STARTUPS', 960, 690, lt, .86, 'center', .012, .14);
      const chips = ['Strategy', 'Identity', 'Motion', 'Product', 'Launch'];
      setFont(ctx, `500 26px ${F.sans}`, 0);
      const pad = 30, gap = 14, ws = chips.map(c => tw(ctx, c) + pad * 2), total = ws.reduce((a, b) => a + b, 0) + gap * (chips.length - 1);
      let x = 960 - total / 2;
      chips.forEach((c, i) => {
        const p = E.outBack(inv(1.0 + i * .06, 1.3 + i * .06, lt), 2.2), w = ws[i];
        if (p > 0) {
          const on = c === 'Motion' && lt > 1.3;
          ctx.save(); ctx.translate(x + w / 2, 790); ctx.scale(p, p);
          rrect(ctx, -w / 2, -30, w, 60, 30);
          if (on) { ctx.fillStyle = rgba(K.volt, E.outExpo(inv(1.3, 1.4, lt))); ctx.fill(); }
          ctx.strokeStyle = rgba(on ? K.volt : K.paper, .5); ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = rgba(on ? K.ink : K.paper, .95); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(c, 0, 1);
          ctx.restore();
        }
        x += w + gap;
      });
      ctx.restore();
    }

    // the dot (drawn last so it can swallow the frame)
    const [ddx, ddy] = markDot(mx, my, R);
    const dr = R * MARK.dot * pulse;
    const big = lerp(dr, 2400, zoom);
    ctx.fillStyle = rgba(mix(K.volt, C.flow.violet, E.inOutQuad(inv(1.7, 1.95, lt))));
    circle(ctx, ddx, ddy, big); ctx.fill();
  }

  // ================================================================ 09 END CARD  (26 → 30)
  function end(ctx, t) {
    bg(ctx, K.ink);
    const lt = t - T.end;
    const L = lockup(ctx, 960, 452, 212);
    const [ddx, ddy] = markDot(L.oX, L.oY, L.R);
    const dr = L.R * MARK.dot;

    // soft beat-synced halo
    const beat = Math.exp(-((lt % .5)) * 7) * inv(.6, 1.2, lt) * (1 - inv(3.2, 3.9, lt));
    const g = ctx.createRadialGradient(L.oX, L.oY, 0, L.oX, L.oY, 760);
    g.addColorStop(0, rgba(K.volt, .07 + .05 * beat)); g.addColorStop(1, rgba(K.volt, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // concentric echoes of the ring
    for (let k = 0; k < 4; k++) {
      const p = inv(.5 + k * .12, 1.7 + k * .12, lt);
      if (p <= 0 || p >= 1) continue;
      ctx.strokeStyle = rgba(K.paper, .14 * (1 - p)); ctx.lineWidth = 1.5;
      circle(ctx, L.oX, L.oY, L.R + 900 * E.outExpo(p)); ctx.stroke();
    }

    // dot falls in and bounces, the ring swings around it, the letters slide out
    const g1 = inv(0, .32, lt);
    let y = ddy - 430 * (1 - g1 * g1), sq = 0;
    if (lt > .32) { const b = inv(.32, .6, lt); y = ddy - 120 * 4 * b * (1 - b); }
    if (lt > .6) { const b = inv(.6, .76, lt); y = ddy - 28 * 4 * b * (1 - b); }
    for (const [ti, a] of [[.32, .5], [.6, .25], [.76, .1]]) sq = Math.max(sq, a * Math.sin(Math.PI * inv(ti - .02, ti + .07, lt)));
    const stretch = lt < .32 ? 1 + .5 * g1 * g1 : 1;
    ctx.fillStyle = rgba(K.volt);
    ctx.save(); ctx.translate(ddx, y + dr * sq); ctx.scale((1 + sq) / Math.sqrt(stretch), (1 - sq) * stretch); circle(ctx, 0, 0, dr); ctx.fill(); ctx.restore();

    const ap = E.outExpo(inv(.62, 1.15, lt));
    drawMark(ctx, L.oX, L.oY, L.R, { p: ap, dotScale: 0, swk: E.outBack(inv(.62, .9, lt), 2) });
    drawLockup(ctx, L, E.outExpo(inv(.9, 1.4, lt)));
    const rp = E.outBack(inv(1.3, 1.5, lt), 3);
    if (rp > 0) {
      ctx.fillStyle = rgba(K.paper); setFont(ctx, `500 36px ${F.studio}`, 0);
      ctx.save(); ctx.translate(L.x1 + 28, L.base - L.ch + 17); ctx.scale(rp, rp); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('®', 0, 0); ctx.restore();
    }

    // lines
    ctx.textBaseline = 'alphabetic';
    setFont(ctx, `italic 400 92px ${F.serif}`, -.5);
    ctx.fillStyle = rgba(K.paper);
    riseText(ctx, 'From zero to one.', 960, 690, lt, 1.45, { align: 'center', h: 92, per: .018, dur: .55 });
    setFont(ctx, `500 21px ${F.mono}`, 7);
    ctx.fillStyle = rgba(K.paper, .62);
    decode(ctx, 'BRAND & MOTION STUDIO FOR STARTUPS', 960, 760, lt, 1.7, 'center', .012, .14);

    // CTA pill
    const cp = E.outBack(inv(2.0, 2.35, lt), 1.8);
    if (cp > 0) {
      setFont(ctx, `600 30px ${F.sans}`, -.2);
      const label = "Let's build yours", w = tw(ctx, label) + 150, h = 78;
      ctx.save(); ctx.translate(960, 870); ctx.scale(cp, cp);
      rrect(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = rgba(K.volt); ctx.fill();
      ctx.fillStyle = rgba(K.ink); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(label, -w / 2 + 44, 2);
      // arrow nudges on the beat
      const nud = 8 * Math.exp(-((Math.max(0, lt - 2.5)) % .5) * 8) * inv(2.5, 2.6, lt);
      const ax = w / 2 - 62 + nud;
      ctx.strokeStyle = rgba(K.ink); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(ax - 22, 2); ctx.lineTo(ax + 12, 2); ctx.moveTo(ax, -11); ctx.lineTo(ax + 13, 2); ctx.lineTo(ax, 15); ctx.stroke();
      ctx.restore();
    }

    // credits
    const ca = inv(2.15, 2.4, lt);
    if (ca > 0) {
      ctx.save(); ctx.globalAlpha = ca * .55; ctx.fillStyle = rgba(K.paper);
      setFont(ctx, `500 15px ${F.mono}`, 3); ctx.textBaseline = 'middle';
      decode(ctx, 'SÃO PAULO  ·  LISBOA  ·  REMOTE', 84, 1012, lt, 2.15, 'left', .006, .1);
      decode(ctx, 'DESIGNED, ANIMATED & SCORED IN CODE BY CLAUDE', W - 84, 1012, lt, 2.2, 'right', .006, .1);
      ctx.restore();
    }

    // fade out
    const fo = inv(3.55, 3.98, lt);
    if (fo > 0) { ctx.fillStyle = rgba([0, 0, 0], fo); ctx.fillRect(-100, -100, W + 200, H + 200); }
  }

  Object.assign(V.scenes, { intro, zero, volta, end });
  V.studio = { drawMark, markDot, lockup, drawLockup, MARK };
})();
