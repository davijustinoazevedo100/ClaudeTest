/*
 * CASE 03 — NIMBUS (AI infrastructure)   14 → 18 s
 * A 2,400-point cloud: big bang → thinking blob with a live network → the
 * wordmark spelled in particles → a prompt that generates a brand system →
 * the cloud regroups into a planet, which becomes TERRA's globe.
 */
(function () {
  'use strict';
  const { W, H, TAU, T, C, F, rgba, mix, clamp, lerp, inv, E, hash, perlin, fbm, bg, rrect, circle,
    setFont, tw, decode, drawRow, textPoints } = V;
  const N = C.nimbus, TR = C.terra;

  // ---------------------------------------------------------------- shared globe
  const NP = 2400, RS = 300, FOCAL = 1500;
  const FIB = new Float32Array(NP * 3), LAND = new Uint8Array(NP);
  for (let i = 0; i < NP; i++) {
    const y = 1 - 2 * (i + .5) / NP, r = Math.sqrt(1 - y * y), ph = i * 2.399963229728653;
    FIB[i * 3] = Math.cos(ph) * r; FIB[i * 3 + 1] = y; FIB[i * 3 + 2] = Math.sin(ph) * r;
    LAND[i] = fbm(FIB[i * 3] * 1.6 + 7.3, y * 1.6 + 2.1, FIB[i * 3 + 2] * 1.6 + 4.2, 3) > .06 ? 1 : 0;
  }
  const globeRot = t => ({ ry: t * .5, rx: .42 });
  function rot(x, y, z, ry, rx) {
    const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
  }
  const proj = (x, y, z, cx = 960, cy = 540) => { const s = FOCAL / (FOCAL + z); return [cx + x * s, cy + y * s, s]; };
  // Terra dot colours, so the hand-off cut is invisible.
  const terraDot = (i, z) => {
    const front = z < 0;
    return LAND[i] ? [TR.sand, front ? 1 : .22, front ? 3.4 : 2.2] : [TR.moss, front ? .42 : .1, front ? 2.3 : 1.6];
  };
  V.globe = { NP, RS, FIB, LAND, globeRot, rot, proj, terraDot, FOCAL };

  // ---------------------------------------------------------------- network
  const HUBS = Array.from({ length: 170 }, (_, k) => (k * 14 + 3) % NP);
  const PAIRS = [];
  HUBS.forEach((a, ia) => {
    const d = HUBS.map((b, ib) => [ib === ia ? -9 : FIB[a * 3] * FIB[b * 3] + FIB[a * 3 + 1] * FIB[b * 3 + 1] + FIB[a * 3 + 2] * FIB[b * 3 + 2], b]);
    d.sort((p, q) => q[0] - p[0]);
    for (let k = 0; k < 3; k++) if (a < d[k][1]) PAIRS.push([a, d[k][1]]);
  });

  const GRAD = [N.violet, mix(N.violet, N.cyan, .35), mix(N.violet, N.cyan, .7), N.cyan, N.white, N.pink];
  const X = new Float32Array(NP), Y = new Float32Array(NP), S = new Float32Array(NP);

  function nimbus(ctx, t) {
    const lt = t - T.nimbus;
    bg(ctx, N.black);
    const toTerra = inv(3.6, 4.0, lt);
    if (toTerra > 0) { ctx.fillStyle = rgba(TR.forest, E.inOutQuad(toTerra)); ctx.fillRect(-100, -100, W + 200, H + 200); }

    // soft nebula behind the cloud
    const neb = inv(0, .6, lt) * (1 - inv(3.3, 3.8, lt));
    if (neb > 0) {
      const g = ctx.createRadialGradient(960, 540, 0, 960, 540, 900);
      g.addColorStop(0, rgba(N.violet, .2 * neb)); g.addColorStop(.5, rgba(N.cyan, .05 * neb)); g.addColorStop(1, rgba(N.black, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    // the dot handed over by MUNCH's iris, dissolving into the burst
    const hd = 1 - inv(0, .12, lt);
    if (hd > 0) { ctx.fillStyle = rgba(N.white, hd); circle(ctx, 960, 540, 13 * (1 + .6 * (1 - hd))); ctx.fill(); }

    const tp = textPoints('nimbus', `700 300px ${F.nimbus}`, 960, 470, NP, -10);
    const ry = .7 * lt + 1.4 * (1 - Math.exp(-lt * 2.5)), rx = .35;
    const amp = .2 * inv(.35, .9, lt) * (1 - inv(1.0, 1.4, lt));
    const G = globeRot(t);
    const buckets = new Map();
    const add = (key, x, y, r) => { let p = buckets.get(key); if (!p) buckets.set(key, p = new Path2D()); p.moveTo(x + r, y); p.arc(x, y, r, 0, TAU); };

    for (let i = 0; i < NP; i++) {
      const ux = FIB[i * 3], uy = FIB[i * 3 + 1], uz = FIB[i * 3 + 2], h = hash(i, 1);
      // sphere / blob
      const rb = E.outBack(inv(h * .12, .55 + h * .12, lt), 1.5);
      const n = amp ? 1 + amp * perlin(ux * 1.8 + 5, uy * 1.8 + lt * .9, uz * 1.8) * 2.2 : 1;
      let [x, y, z] = rot(ux * RS * rb * n, uy * RS * rb * n, uz * RS * rb * n, ry, rx);
      // → wordmark
      const tx = tp[i][0] - 960, ty = tp[i][1] - 540;
      const st = (tp[i][0] - 560) / 800 * .28 + h * .1;
      const pT = E.inOutCubic(inv(1.0 + st, 1.5 + st, lt));
      if (pT > 0) { x = lerp(x, tx, pT); y = lerp(y, ty, pT); z = lerp(z, 0, pT) - 420 * Math.sin(Math.PI * pT) * (h - .3); }
      // → starfield
      const pS = E.inOutCubic(inv(1.95 + h * .2, 2.6 + h * .2, lt));
      if (pS > 0) {
        const sx = (hash(i, 4) - .5) * 2600, sy = (hash(i, 5) - .5) * 1500, sz = hash(i, 6) * 1600 - 300;
        x = lerp(x, sx + Math.sin(lt * .7 + i) * 30, pS); y = lerp(y, sy + Math.cos(lt * .5 + i) * 20, pS); z = lerp(z, sz, pS);
      }
      // → planet (TERRA's globe)
      const pC = E.inOutCubic(inv(3.25 + h * .12, 3.82 + h * .12, lt));
      let gz = 0;
      if (pC > 0) {
        const g = rot(ux * RS, uy * RS, uz * RS, G.ry, G.rx); gz = g[2];
        x = lerp(x, g[0], pC); y = lerp(y, g[1], pC); z = lerp(z, g[2], pC);
      }
      if (FOCAL + z < 50) continue;
      const [px, py, s] = proj(x, y, z);
      X[i] = px; Y[i] = py; S[i] = s;
      if (px < -20 || px > W + 20 || py < -20 || py > H + 20) continue;

      // colour: gradient by latitude, depth-dimmed; blends to Terra at the end
      const ci = h < .06 ? 5 : Math.min(4, Math.floor((1 - uy) / 2 * 4.99));
      const depth = clamp((z + RS) / (2 * RS));
      let a = pS > 0 ? lerp(1, .35 + .5 * hash(i, 7) * (.6 + .4 * Math.sin(lt * 6 + i)), pS) : 1 - depth * .6;
      let r = (pT > .5 && pS < .5 ? 2.1 : 2.6) * s;
      const tc = inv(3.55, 3.95, lt);
      if (tc > 0) {
        const tr = terraDot(i, gz)[2];
        add(`t|${Math.round(tc * 4) / 4}|${LAND[i]}|${gz < 0 ? 1 : 0}|${ci}`, px, py, lerp(r, tr, tc));
        continue;
      }
      add(`${ci}|${Math.round(clamp(a) * 4)}`, px, py, r);
    }

    // network lines while it's a thinking blob
    const net = inv(.45, .7, lt) * (1 - inv(.95, 1.15, lt));
    if (net > 0) {
      ctx.lineWidth = 1.2;
      for (const [a, b] of PAIRS) {
        const za = S[a], zb = S[b];
        const al = net * clamp((za + zb) / 2 - .85) * 2.2;
        if (al <= .02) continue;
        ctx.strokeStyle = rgba(N.cyan, al * .55);
        ctx.beginPath(); ctx.moveTo(X[a], Y[a]); ctx.lineTo(X[b], Y[b]); ctx.stroke();
      }
      // a few pulses travelling along edges
      for (let k = 0; k < 14; k++) {
        const [a, b] = PAIRS[(k * 37) % PAIRS.length], u = (lt * 2.4 + hash(k, 2)) % 1;
        ctx.fillStyle = rgba(N.white, net * .9);
        circle(ctx, lerp(X[a], X[b], u), lerp(Y[a], Y[b], u), 3.2); ctx.fill();
      }
    }

    for (const [key, path] of buckets) {
      if (key[0] === 't') {
        const [, q, land, front, ci] = key.split('|'), tc = +q;
        const col = land === '1' ? TR.sand : TR.moss, ta = land === '1' ? (front === '1' ? 1 : .22) : (front === '1' ? .42 : .1);
        ctx.fillStyle = rgba(mix(GRAD[+ci], col, tc), lerp(1, ta, tc));
      } else {
        const [ci, a] = key.split('|');
        ctx.fillStyle = rgba(GRAD[+ci], +a / 4);
      }
      ctx.fill(path);
    }

    // solid wordmark resolves out of the particles, then floats up for the UI
    const up = E.snappy(inv(1.9, 2.35, lt));
    const wa = inv(1.6, 1.85, lt) * (1 - inv(3.3, 3.45, lt));
    if (wa > 0) {
      ctx.save();
      ctx.globalAlpha = wa;
      ctx.translate(960, lerp(470, 300, up)); ctx.scale(lerp(1, .56, up), lerp(1, .56, up)); ctx.translate(-960, -470);
      setFont(ctx, `700 300px ${F.nimbus}`, -10);
      const w = tw(ctx, 'nimbus');
      const g = ctx.createLinearGradient(960 - w / 2, 0, 960 + w / 2, 0);
      g.addColorStop(0, rgba(N.cyan)); g.addColorStop(.5, rgba(N.white)); g.addColorStop(1, rgba(N.violet));
      ctx.fillStyle = g; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText('nimbus', 960 - w / 2, 470);
      // sparkle
      const sp = E.outBack(inv(1.8, 2.05, lt), 3);
      if (sp > 0) {
        ctx.save(); ctx.translate(960 + w / 2 + 70, 360); ctx.rotate(lt * 2); ctx.scale(sp, sp);
        ctx.fillStyle = rgba(N.cyan);
        ctx.beginPath();
        for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, r = k % 2 ? 9 : 44; ctx.lineTo(r * Math.cos(a), r * Math.sin(a)); }
        ctx.closePath(); ctx.fill(); ctx.restore();
      }
      ctx.restore();
      ctx.save(); ctx.globalAlpha = wa;
      setFont(ctx, `500 22px ${F.mono}`, 8); ctx.fillStyle = rgba(N.white, .65); ctx.textBaseline = 'middle';
      decode(ctx, 'INTELLIGENCE, ON TAP.', 960, lerp(670, 410, up), lt, 1.75, 'center', .014, .14);
      ctx.restore();
    }

    // ---- prompt → generated brand system
    const ui = inv(1.95, 2.05, lt) * (1 - inv(3.3, 3.45, lt));
    if (ui > 0) {
      ctx.save(); ctx.globalAlpha = ui;
      const bw = 1000 * E.outExpo(inv(1.95, 2.3, lt)), bh = 104, by = 560;
      const grd = ctx.createLinearGradient(960 - bw / 2, 0, 960 + bw / 2, 0);
      grd.addColorStop(0, rgba(N.cyan, .8)); grd.addColorStop(1, rgba(N.violet, .8));
      rrect(ctx, 960 - bw / 2, by - bh / 2, bw, bh, bh / 2);
      ctx.fillStyle = rgba(N.glass, .78); ctx.fill(); ctx.strokeStyle = grd; ctx.lineWidth = 2.5; ctx.stroke();
      if (bw > 900) {
        ctx.save(); rrect(ctx, 960 - bw / 2, by - bh / 2, bw, bh, bh / 2); ctx.clip();
        const q = 'Design a brand for my startup';
        const nch = Math.floor(q.length * inv(2.08, 2.45, lt));
        setFont(ctx, `500 36px ${F.nimbus}`, -.3); ctx.fillStyle = rgba(N.white); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillStyle = rgba(N.cyan); ctx.fillText('✦', 960 - bw / 2 + 44, by + 1);
        ctx.fillStyle = rgba(N.white); ctx.fillText(q.slice(0, nch), 960 - bw / 2 + 96, by + 1);
        if (Math.floor(lt * 4) % 2 === 0 || lt < 2.5) ctx.fillRect(960 - bw / 2 + 100 + tw(ctx, q.slice(0, nch)), by - 22, 3, 44);
        // send
        const press = 1 - .15 * Math.sin(Math.PI * inv(2.5, 2.62, lt));
        ctx.save(); ctx.translate(960 + bw / 2 - 56, by); ctx.scale(press, press);
        const sg = ctx.createLinearGradient(-36, -36, 36, 36); sg.addColorStop(0, rgba(N.cyan)); sg.addColorStop(1, rgba(N.violet));
        circle(ctx, 0, 0, 36); ctx.fillStyle = sg; ctx.fill();
        ctx.strokeStyle = rgba(N.black); ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(0, -14); ctx.moveTo(-12, -2); ctx.lineTo(0, -14); ctx.lineTo(12, -2); ctx.stroke();
        ctx.restore();
        ctx.restore();
        const rp = inv(2.54, 3.0, lt);
        if (rp > 0 && rp < 1) { ctx.strokeStyle = rgba(N.cyan, 1 - rp); ctx.lineWidth = 2; circle(ctx, 960 + bw / 2 - 56, by, 36 + 120 * E.outExpo(rp)); ctx.stroke(); }
      }
      // cards
      const cw = 214, ch = 250, gap = 26, x0 = 960 - (4 * cw + 3 * gap) / 2, cy = 790;
      for (let k = 0; k < 4; k++) {
        const t0 = 2.6 + k * .07, p = E.outBack(inv(t0, t0 + .26, lt), 1.7);
        if (p <= 0) continue;
        const x = x0 + k * (cw + gap);
        ctx.save(); ctx.translate(x + cw / 2, cy); ctx.scale(p, p); ctx.translate(-cw / 2, -ch / 2);
        rrect(ctx, 0, 0, cw, ch, 26); ctx.fillStyle = rgba(N.glass, .9); ctx.fill();
        ctx.strokeStyle = rgba(N.white, .16); ctx.lineWidth = 2; ctx.stroke();
        const ready = inv(t0 + .14, t0 + .24, lt);
        if (ready < 1) {   // skeleton shimmer
          for (let l = 0; l < 3; l++) { rrect(ctx, 24, 40 + l * 50, cw - 48 - l * 30, 26, 13); ctx.fillStyle = rgba(N.white, .08 + .06 * Math.sin(lt * 30 + l)); ctx.fill(); }
        }
        ctx.globalAlpha *= ready;
        ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
        if (k === 0) {
          const cols = [N.violet, N.cyan, N.pink, N.white];
          cols.forEach((c, j) => { rrect(ctx, 24 + j * 43, 26, 38, 150, 12); ctx.fillStyle = rgba(c); ctx.fill(); });
          setFont(ctx, `500 15px ${F.mono}`, 1.5); ctx.fillStyle = rgba(N.white, .7); ctx.fillText('PALETTE', 24, 222);
        } else if (k === 1) {
          setFont(ctx, `700 110px ${F.nimbus}`, -4); ctx.fillStyle = rgba(N.white); ctx.fillText('Aa', 22, 160);
          setFont(ctx, `500 15px ${F.mono}`, 1.5); ctx.fillStyle = rgba(N.white, .7); ctx.fillText('GROTESK 700', 24, 222);
        } else if (k === 2) {
          for (let j = 0; j < 22; j++) {
            const a = j / 22 * TAU + lt * 1.5, rr = 54 + 10 * Math.sin(j * 3 + lt * 4);
            circle(ctx, cw / 2 + rr * Math.cos(a), 104 + rr * Math.sin(a), 5); ctx.fillStyle = rgba(GRAD[j % 4]); ctx.fill();
          }
          circle(ctx, cw / 2, 104, 16); ctx.fillStyle = rgba(N.cyan); ctx.fill();
          setFont(ctx, `500 15px ${F.mono}`, 1.5); ctx.fillStyle = rgba(N.white, .7); ctx.fillText('MARK', 24, 222);
        } else {
          circle(ctx, cw / 2, 102, 52); ctx.fillStyle = rgba(N.cyan); ctx.fill();
          ctx.strokeStyle = rgba(N.black); ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath(); ctx.moveTo(cw / 2 - 22, 104); ctx.lineTo(cw / 2 - 5, 121); ctx.lineTo(cw / 2 + 24, 86); ctx.stroke();
          setFont(ctx, `500 15px ${F.mono}`, 1.5); ctx.fillStyle = rgba(N.white, .7); ctx.fillText('SYSTEM v1.0', 24, 222);
        }
        ctx.restore();
      }
      ctx.restore();
    }
  }

  V.scenes.nimbus = nimbus;
})();
