/*
 * CASE 04 — TERRA (climate tech)   18 → 22 s
 * Mark: a sun setting into striped ground. It is built out of the globe: the
 * planet tilts edge-on, its latitude lines flatten into the stripes.
 *   18.00  dotted globe with graticule + live callouts
 *   18.75  tilt edge-on → sun disc fills, lower latitudes thicken into stripes
 *   19.40  lockup + tagline over generative topographic contours
 *   20.10  data: roll-up counter, growth bars that sprout leaves, net-zero line
 *   21.45  bar wipe to ink
 */
(function () {
  'use strict';
  const { W, H, TAU, T, C, F, rgba, mix, clamp, lerp, inv, E, hash, fbm, bg, rrect, circle,
    setFont, tw, decode, drawRow, riseText, rollText, callout } = V;
  const R_ = C.terra;
  const G = V.globe;

  // ---------------------------------------------------------------- the sun mark
  const STRIPES = [[.12, .075], [.36, .1], [.58, .125], [.79, .15]];
  function sun(ctx, x, y, R, fill = 1, stripes = [1, 1, 1, 1], ground = R_.forest) {
    ctx.save();
    circle(ctx, x, y, R); ctx.clip();
    ctx.fillStyle = rgba(R_.sun); circle(ctx, x, y, R * fill); ctx.fill();
    ctx.fillStyle = rgba(ground);
    STRIPES.forEach(([yy, hh], k) => { const s = stripes[k]; if (s > 0) ctx.fillRect(x - R - 2, y + yy * R - hh * R * s / 2, 2 * R + 4, hh * R * s); });
    ctx.restore();
  }

  // ---------------------------------------------------------------- topographic contours
  const SEG = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 0], [1, 2]], [[0, 2]], [[3, 2]], [[2, 3]], [[0, 2]], [[0, 1], [2, 3]], [[1, 2]], [[1, 3]], [[0, 1]], [[3, 0]], []];
  const CS = 24, NX = Math.ceil(W / CS) + 1, NY = Math.ceil(H / CS) + 1, FLD = new Float32Array(NX * NY);
  function contours(ctx, lt, a) {
    if (a <= 0) return;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) FLD[j * NX + i] = fbm(i * CS * .0017 + 11, j * CS * .0017 + 3, lt * .16, 2);
    const major = new Path2D(), minor = new Path2D();
    for (let l = -7; l <= 7; l++) {
      const L = l * .045, path = l % 3 === 0 ? major : minor;
      for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
        const A = FLD[j * NX + i], B = FLD[j * NX + i + 1], Cc = FLD[(j + 1) * NX + i + 1], D = FLD[(j + 1) * NX + i];
        const idx = (A > L) | (B > L) << 1 | (Cc > L) << 2 | (D > L) << 3;
        if (idx === 0 || idx === 15) continue;
        const e = k => k === 0 ? [i + (L - A) / (B - A), j] : k === 1 ? [i + 1, j + (L - B) / (Cc - B)] : k === 2 ? [i + (L - D) / (Cc - D), j + 1] : [i, j + (L - A) / (D - A)];
        for (const [p, q] of SEG[idx]) { const [x0, y0] = e(p), [x1, y1] = e(q); path.moveTo(x0 * CS, y0 * CS); path.lineTo(x1 * CS, y1 * CS); }
      }
    }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(R_.moss, .2 * a); ctx.lineWidth = 1.4; ctx.stroke(minor);
    ctx.strokeStyle = rgba(R_.moss, .42 * a); ctx.lineWidth = 2.2; ctx.stroke(major);
    ctx.restore();
  }

  // ---------------------------------------------------------------- globe
  const LATS = [-.79, -.58, -.36, -.12, .12, .36, .58, .79];
  function globe(ctx, t, lt, cx, cy, R, o) {
    const { ry } = G.globeRot(t), rx = o.rx, k = R / G.RS;
    const P = (x, y, z) => { const [a, b, c] = G.rot(x, y, z, ry, rx); return [...G.proj(a * k, b * k, c * k, cx, cy), c]; };
    // dots
    if (o.dots > 0) {
      const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      for (let i = 0; i < G.NP; i++) {
        const [x, y, s, z] = P(G.FIB[i * 3] * G.RS, G.FIB[i * 3 + 1] * G.RS, G.FIB[i * 3 + 2] * G.RS);
        const front = z < 0, land = G.LAND[i], r = (land ? (front ? 3.4 : 2.2) : (front ? 2.3 : 1.6)) * k;
        const p = paths[land * 2 + (front ? 1 : 0)];
        p.moveTo(x + r, y); p.arc(x, y, r, 0, TAU);
      }
      [[R_.moss, .1], [R_.moss, .42], [R_.sand, .22], [R_.sand, 1]].forEach(([c, a], j) => { ctx.fillStyle = rgba(c, a * o.dots); ctx.fill(paths[j]); });
    }
    // graticule
    ctx.lineCap = 'round';
    const line = (pts, wFront, aFront, col = R_.sand) => {
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath(); let pen = false;
        for (const p of pts) { const [x, y, , z] = p; const front = z <= 0; if (front === !!pass) { pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; } else pen = false; }
        ctx.strokeStyle = rgba(col, pass ? aFront : aFront * .25); ctx.lineWidth = wFront; ctx.stroke();
      }
    };
    if (o.mer > 0) for (let m = 0; m < 12; m++) {
      const ph = m / 12 * Math.PI, pts = [];
      for (let s = 0; s <= 64 * o.draw; s++) { const a = s / 64 * TAU; pts.push(P(Math.cos(ph) * Math.cos(a) * G.RS, Math.sin(a) * G.RS, Math.sin(ph) * Math.cos(a) * G.RS)); }
      line(pts, 1.4, .45 * o.mer);
    }
    LATS.forEach((ly, li) => {
      const fade = ly < 0 ? o.lat : Math.max(o.lat, o.keep);
      if (fade <= 0) return;
      const rr = Math.sqrt(1 - ly * ly), pts = [];
      for (let s = 0; s <= 72 * o.draw; s++) { const a = s / 72 * TAU; pts.push(P(rr * Math.cos(a) * G.RS, ly * G.RS, rr * Math.sin(a) * G.RS)); }
      line(pts, 1.6, .55 * fade);
    });
    ctx.strokeStyle = rgba(R_.sand, .5 * o.lat); ctx.lineWidth = 2;
    circle(ctx, cx, cy, R * 1.015); ctx.stroke();
  }

  // ---------------------------------------------------------------- growth bars
  function plantBars(ctx, lt) {
    const x0 = 1150, base = 850, n = 10, step = 66;
    const lp = E.outExpo(inv(2.2, 2.6, lt));
    ctx.strokeStyle = rgba(R_.sand, .5); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0 - 30, base); ctx.lineTo(x0 - 30 + (n * step + 20) * lp, base); ctx.stroke();
    setFont(ctx, `500 14px ${F.mono}`, 1.5); ctx.fillStyle = rgba(R_.sand, .6 * lp); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let k = 0; k < n; k++) {
      const x = x0 + k * step, h = 34 * 1.3 ** k, t0 = 2.3 + k * .045;
      ctx.fillText(`'${17 + k}`, x, base + 14);
      const p = E.outBack(inv(t0, t0 + .4, lt), 1.3);
      if (p <= 0) continue;
      const hh = h * p, last = k === n - 1;
      rrect(ctx, x - 14, base - hh, 28, hh, 14); ctx.fillStyle = rgba(last ? R_.sun : R_.sand); ctx.fill();
      // leaves unfurl at the tip
      const lf = E.outBack(inv(t0 + .25, t0 + .5, lt), 2.2);
      if (lf > 0) for (const sd of [-1, 1]) {
        ctx.save(); ctx.translate(x, base - hh + 10); ctx.rotate(sd * (.9 - .25 * lf)); ctx.scale(lf * sd, lf);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(14, -26, 0, -50); ctx.quadraticCurveTo(-14, -26, 0, 0);
        ctx.fillStyle = rgba(last ? R_.sun : R_.moss); ctx.fill(); ctx.restore();
      }
    }
    // net zero target line
    const zp = E.outExpo(inv(2.75, 3.15, lt));
    if (zp > 0) {
      const y = base - 34 * 1.3 ** 9 - 10;
      ctx.save(); ctx.setLineDash([8, 9]); ctx.strokeStyle = rgba(R_.sun, .9); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0 - 30, y); ctx.lineTo(x0 - 30 + (n * step + 20) * zp, y); ctx.stroke(); ctx.restore();
      setFont(ctx, `600 15px ${F.mono}`, 2); ctx.fillStyle = rgba(R_.sun, zp); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      decode(ctx, 'NET ZERO · 2030', x0 - 28, y - 10, lt, 2.8, 'left', .015, .1);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  function terra(ctx, t) {
    const lt = t - T.terra;
    bg(ctx, R_.forest);
    contours(ctx, lt, inv(.85, 1.4, lt) * (1 - inv(3.5, 3.9, lt)));

    // ---- globe → sun
    const tilt = E.inOutCubic(inv(.65, 1.1, lt));
    const fm = E.snappy(inv(1.25, 1.7, lt));
    setFont(ctx, `600 300px ${F.terra}`, -8);
    const wW = tw(ctx, 'terra');
    const MR = 150, gap = 64, total = 2 * MR + gap + wW, mx = 960 - total / 2 + MR;
    const R = lerp(G.RS, MR, fm), cx = lerp(960, mx, fm), cy = lerp(540, 500, fm);
    const hdr = E.snappy(inv(2.0, 2.4, lt));

    ctx.save();
    // header move: the whole lockup scales into the top-left corner
    const hx = lerp(0, 120 - (960 - total / 2) * .36, hdr), hy = lerp(0, 200 - 500 * .36, hdr), hs = lerp(1, .36, hdr);
    ctx.translate(hx, hy); ctx.scale(hs, hs);

    const dotsA = 1 - inv(.85, 1.1, lt);
    if (lt < 1.3) {
      globe(ctx, t, lt, cx, cy, R, {
        rx: lerp(.42, 0, tilt), dots: dotsA, draw: E.outExpo(inv(0, .5, lt)),
        mer: 1 - inv(.6, .85, lt), lat: 1 - inv(.7, 1.0, lt), keep: 1 - inv(1.1, 1.25, lt),
      });
    }
    const fill = E.outCubic(inv(.9, 1.2, lt));
    const sp = STRIPES.map((_, k) => E.outExpo(inv(1.0 + k * .05, 1.35 + k * .05, lt)));
    if (fill > 0) sun(ctx, cx, cy, R, fill, sp);

    // wordmark + tagline
    const wx = 960 - total / 2 + 2 * MR + gap;
    ctx.fillStyle = rgba(R_.sand);
    setFont(ctx, `600 300px ${F.terra}`, -8);
    riseText(ctx, 'terra', wx, 590, lt, 1.42, { h: 300, per: .045, dur: .6, ease: E.outQuint });
    ctx.fillStyle = rgba(R_.sand, .82);
    setFont(ctx, `italic 300 72px ${F.terra}`, -.5);
    riseText(ctx, 'Carbon, removed.', wx + 10, 720, lt, 1.62, { h: 80, per: .014, dur: .5 });
    ctx.restore();

    // globe callouts
    callout(ctx, 960 - 150, 540 - 190, 560, 300, 'CO₂ · 421 PPM', lt, .15, .7, R_.sand, true);
    callout(ctx, 960 + 210, 540 + 120, 1360, 700, 'Δ TEMP · +1.48 °C', lt, .25, .7, R_.sun);
    // orbit
    const ob = inv(.05, .3, lt) * (1 - inv(.6, .8, lt));
    if (ob > 0) {
      ctx.save(); ctx.strokeStyle = rgba(R_.sand, .35 * ob); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(960, 540, 430, 110, -.25, 0, TAU); ctx.stroke();
      const a = lt * 2.4 + 1;
      const sx = 960 + 430 * Math.cos(a) * Math.cos(-.25) - 110 * Math.sin(a) * Math.sin(-.25), sy = 540 + 430 * Math.cos(a) * Math.sin(-.25) + 110 * Math.sin(a) * Math.cos(-.25);
      ctx.fillStyle = rgba(R_.sun, ob); circle(ctx, sx, sy, 8); ctx.fill();
      ctx.restore();
    }

    // ---- data
    if (lt > 2.0) {
      ctx.fillStyle = rgba(R_.sand);
      setFont(ctx, `600 196px ${F.terra}`, -4);
      ctx.textBaseline = 'alphabetic';
      rollText(ctx, '1,284,091', 112, 610, lt, 2.15, { dur: .85, per: .05, spins: 2, lh: 168, top: .9, bot: .28 });
      setFont(ctx, `500 34px ${F.sans}`, -.3);
      ctx.fillStyle = rgba(R_.sand, .85);
      riseText(ctx, 'tonnes of CO₂ removed — and counting.', 120, 690, lt, 2.4, { h: 40, per: .008, dur: .4 });
      setFont(ctx, `500 15px ${F.mono}`, 3); ctx.fillStyle = rgba(R_.sand, .55);
      decode(ctx, 'VERIFIED ON-CHAIN · UPDATED LIVE', 120, 750, lt, 2.6, 'left', .012, .12);
      plantBars(ctx, lt);
    }

    // ---- bar wipe to ink
    for (let k = 0; k < 8; k++) {
      const p = E.inOutExpo(inv(3.42 + k * .028, 3.74 + k * .028, lt));
      if (p <= 0) continue;
      ctx.fillStyle = rgba(C.volta.ink);
      const y = k * 135, w = (W + 40) * p;
      k % 2 ? ctx.fillRect(W + 20 - w, y - 1, w, 137) : ctx.fillRect(-20, y - 1, w, 137);
    }
  }

  V.scenes.terra = terra;
  V.terra = { sun };
})();
