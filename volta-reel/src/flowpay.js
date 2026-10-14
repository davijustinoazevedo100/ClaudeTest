/*
 * CASE 01 — FLOWPAY (fintech)   6 → 10 s
 * Mark: a coin with a current running through it. Money, in motion.
 *   6.00  a wave crosses the frame, a coin closes around it → lockup
 *   7.25  the card swings in with real perspective, sheen pass
 *   8.25  card turns aside, the app rises: balance roll, chart, feed
 *   9.15  "Send" press → success check grows into the next case's plate
 */
(function () {
  'use strict';
  const { W, H, TAU, T, C, F, rgba, mix, clamp, lerp, inv, E, hash, bg, buf, rrect, circle,
    setFont, tw, drawRow, riseText, rollText, decode, resample, morph, polyline, polySeg, planeY } = V;
  const P = C.flow;

  // ---------------------------------------------------------------- the coin
  const waveY = (x, r, ph) => .2 * r * Math.sin(x / (1.53 * r) * TAU + ph);
  function wavePath(ctx, x0, x1, cx, cy, r, ph) {
    ctx.beginPath();
    for (let x = x0; x <= x1 + .1; x += 6) { const y = cy + waveY(x - cx, r, ph); x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  }
  function coin(ctx, cx, cy, r, ph, o = {}) {
    ctx.save();
    ctx.fillStyle = o.coin || rgba(P.white);
    circle(ctx, cx, cy, r); ctx.fill();
    ctx.save(); circle(ctx, cx, cy, r); ctx.clip();
    ctx.strokeStyle = o.wave || rgba(P.violet); ctx.lineWidth = r * .2; ctx.lineCap = 'round';
    wavePath(ctx, cx - r - 20, cx + r + 20, cx, cy, r, ph); ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  // ---------------------------------------------------------------- card texture
  const CW = 860, CH = 540;
  let cardTex = null;
  function card() {
    if (cardTex) return cardTex;
    const b = buf('flow_card', CW, CH), x = b.x;
    x.clearRect(0, 0, CW, CH);
    x.save();
    rrect(x, 0, 0, CW, CH, 42); x.clip();
    const g = x.createLinearGradient(0, 0, CW, CH);
    g.addColorStop(0, rgba(P.deep)); g.addColorStop(.55, rgba(mix(P.deep, P.violet, .7))); g.addColorStop(1, rgba(P.violet));
    x.fillStyle = g; x.fillRect(0, 0, CW, CH);
    // flow lines pattern
    for (let k = 0; k < 9; k++) {
      x.strokeStyle = rgba(k === 4 ? P.mint : P.lilac, k === 4 ? .95 : .18); x.lineWidth = k === 4 ? 16 : 3; x.lineCap = 'round';
      x.beginPath();
      for (let i = 0; i <= 120; i++) {
        const px = -40 + i * (CW + 80) / 120, py = 330 + k * 26 + 46 * Math.sin(px / 210 + k * .3) + (k - 4) * 6 * Math.sin(px / 90);
        i ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.stroke();
    }
    // coin + wordmark
    coin(x, 92, 92, 36, 1.2);
    x.fillStyle = '#fff'; setFont(x, `700 46px ${F.flow}`, -1.4); x.textBaseline = 'middle'; x.fillText('flowpay', 142, 92);
    setFont(x, `500 18px ${F.mono}`, 3); x.fillStyle = rgba(P.lilac); x.textAlign = 'right'; x.fillText('DEBIT', CW - 56, 92); x.textAlign = 'left';
    // chip
    const cg = x.createLinearGradient(72, 190, 172, 270); cg.addColorStop(0, '#E9E4FF'); cg.addColorStop(1, '#9C8BFF');
    rrect(x, 72, 190, 104, 78, 14); x.fillStyle = cg; x.fill();
    x.strokeStyle = 'rgba(40,20,120,.35)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(72, 216); x.lineTo(176, 216); x.moveTo(72, 242); x.lineTo(176, 242); x.moveTo(124, 190); x.lineTo(124, 268); x.stroke();
    // contactless
    x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 4; x.lineCap = 'round';
    for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(206, 229, 14 + k * 11, -.75, .75); x.stroke(); }
    // number + name
    x.fillStyle = '#fff'; setFont(x, `500 40px ${F.flow}`, 5);
    x.fillText('••••  ••••  ••••  2048', 72, 330);
    setFont(x, `500 20px ${F.mono}`, 3); x.fillStyle = 'rgba(255,255,255,.8)';
    x.fillText('ALEX FOUNDER', 72, 470); x.textAlign = 'right'; x.fillText('09 / 29', CW - 56, 470); x.textAlign = 'left';
    x.restore();
    // edge highlight
    x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 2; rrect(x, 1, 1, CW - 2, CH - 2, 41); x.stroke();
    return (cardTex = b.c);
  }
  function drawCard(ctx, cx, cy, s, ay, rz, sheen) {
    const w = CW * s, h = CH * s;
    // contact shadow
    ctx.save();
    const sg = ctx.createRadialGradient(cx, cy + h * .62, 0, cx, cy + h * .62, w * .6);
    sg.addColorStop(0, rgba(P.night, .45)); sg.addColorStop(1, rgba(P.night, 0));
    ctx.fillStyle = sg; ctx.translate(cx, cy + h * .62); ctx.scale(1, .18); ctx.translate(-cx, -(cy + h * .62));
    circle(ctx, cx, cy + h * .62, w * .6); ctx.fill();
    ctx.restore();
    const q = planeY(ctx, card(), cx, cy, w, h, ay, { rz, strips: 110 });
    if (sheen > 0 && sheen < 1) {
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(rz);
      ctx.beginPath();
      ctx.moveTo(q.XL, -h / 2 * q.sL); ctx.lineTo(q.XR, -h / 2 * q.sR); ctx.lineTo(q.XR, h / 2 * q.sR); ctx.lineTo(q.XL, h / 2 * q.sL); ctx.closePath();
      ctx.clip();
      const sx = lerp(-w, w, sheen);
      const g = ctx.createLinearGradient(sx - 160, -200, sx + 160, 200);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,.42)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(-w, -h, w * 2, h * 2);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- phone UI
  const PW = 440, PH = 900;
  const TX = [
    ['M', 'Munch', 'Dinner · 21:04', '−$18.40', C.munch.red, C.munch.cream],
    ['N', 'Nimbus Pro', 'Subscription', '−$20.00', C.nimbus.black, C.nimbus.cyan],
    ['T', 'Terra', 'Carbon offset', '−$12.00', C.terra.forest, C.terra.sand],
  ];
  function phone(lt) {
    const b = buf('flow_phone', PW, PH), x = b.x;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, PW, PH);
    rrect(x, 0, 0, PW, PH, 70); x.fillStyle = rgba(P.night); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.18)'; x.lineWidth = 3; rrect(x, 1.5, 1.5, PW - 3, PH - 3, 68); x.stroke();
    const sx = 16, sy = 16, sw = PW - 32, sh = PH - 32;
    x.save(); rrect(x, sx, sy, sw, sh, 56); x.clip();
    x.fillStyle = '#F6F4FF'; x.fillRect(sx, sy, sw, sh);
    x.translate(sx, sy);
    // status + island
    rrect(x, sw / 2 - 62, 14, 124, 36, 18); x.fillStyle = '#000'; x.fill();
    setFont(x, `600 17px ${F.flow}`, 0); x.fillStyle = rgba(P.deep); x.textBaseline = 'middle'; x.fillText('9:41', 34, 33);
    x.fillRect(sw - 66, 27, 30, 13); x.fillRect(sw - 34, 30, 3, 7);
    // header
    setFont(x, `400 20px ${F.flow}`, 0); x.fillStyle = 'rgba(22,10,82,.55)'; x.fillText('Good morning', 30, 96);
    setFont(x, `700 30px ${F.flow}`, -.6); x.fillStyle = rgba(P.deep); x.fillText('Alex', 30, 128);
    circle(x, sw - 52, 112, 26); x.fillStyle = rgba(P.lilac); x.fill();
    coin(x, sw - 52, 112, 13, lt * 4, { coin: '#fff' });
    // balance card
    const bp = E.outExpo(inv(2.45, 2.85, lt));
    x.save(); x.translate(0, (1 - bp) * 40); x.globalAlpha = bp;
    rrect(x, 22, 164, sw - 44, 200, 30); x.fillStyle = rgba(P.violet); x.fill();
    x.save(); rrect(x, 22, 164, sw - 44, 200, 30); x.clip();
    x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 3;
    for (let k = 0; k < 5; k++) { x.beginPath(); for (let i = 0; i <= 40; i++) { const px = 22 + i * (sw - 44) / 40, py = 320 + k * 18 + 20 * Math.sin(px / 60 + lt * 2 + k); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); }
    x.restore();
    setFont(x, `400 19px ${F.flow}`, 0); x.fillStyle = rgba(P.lilac); x.fillText('Total balance', 48, 206);
    setFont(x, `700 54px ${F.flow}`, -1.5); x.fillStyle = '#fff'; x.textBaseline = 'alphabetic';
    rollText(x, '$12,480.20', 46, 278, lt, 2.55, { dur: .7, per: .045, spins: 1, lh: 60 });
    x.textBaseline = 'middle';
    const pp = E.outBack(inv(3.0, 3.25, lt), 2);
    if (pp > 0) {
      x.save(); x.translate(48, 322); x.scale(pp, pp);
      rrect(x, 0, -17, 182, 34, 17); x.fillStyle = rgba(P.mint); x.fill();
      setFont(x, `600 17px ${F.flow}`, 0); x.fillStyle = rgba(P.deep); x.fillText('▲ 8.2% this month', 14, 1);
      x.restore();
    }
    x.restore();
    // chart
    const cp = E.inOutCubic(inv(2.6, 3.3, lt));
    const pts = Array.from({ length: 60 }, (_, i) => { const u = i / 59; return [36 + u * (sw - 72), 520 - 70 * u - 26 * Math.sin(u * 9) * (1 - u * .5) - 10 * Math.sin(u * 23)]; });
    if (cp > 0) {
      x.strokeStyle = 'rgba(22,10,82,.08)'; x.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(36, 420 + k * 40); x.lineTo(sw - 36, 420 + k * 40); x.stroke(); }
      const n = Math.max(2, Math.round(60 * cp));
      const g = x.createLinearGradient(0, 420, 0, 560); g.addColorStop(0, 'rgba(91,46,255,.28)'); g.addColorStop(1, 'rgba(91,46,255,0)');
      x.beginPath(); pts.slice(0, n).forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py));
      x.lineTo(pts[n - 1][0], 560); x.lineTo(pts[0][0], 560); x.closePath(); x.fillStyle = g; x.fill();
      x.strokeStyle = rgba(P.violet); x.lineWidth = 5; x.lineJoin = 'round'; x.lineCap = 'round';
      polySeg(x, pts, 0, cp); x.stroke();
      const e = pts[n - 1];
      circle(x, e[0], e[1], 9); x.fillStyle = rgba(P.violet); x.fill();
      circle(x, e[0], e[1], 9 + 14 * ((lt * 2) % 1)); x.strokeStyle = rgba(P.violet, .4 * (1 - (lt * 2) % 1)); x.lineWidth = 3; x.stroke();
      setFont(x, `500 15px ${F.mono}`, 1); x.fillStyle = 'rgba(22,10,82,.45)';
      ['JAN', 'MAR', 'MAY', 'JUL', 'SEP'].forEach((m, i) => x.fillText(m, 36 + i * (sw - 100) / 4, 590));
    }
    // feed
    TX.forEach(([l, name, sub, amt, bgc, fg], i) => {
      const p = E.outExpo(inv(2.9 + i * .08, 3.35 + i * .08, lt));
      if (p <= 0) return;
      const y = 640 + i * 76;
      x.save(); x.translate((1 - p) * 300, 0); x.globalAlpha = p;
      circle(x, 56, y, 26); x.fillStyle = rgba(bgc); x.fill();
      setFont(x, `700 22px ${F.flow}`, 0); x.fillStyle = rgba(fg); x.textAlign = 'center'; x.fillText(l, 56, y + 1); x.textAlign = 'left';
      setFont(x, `600 21px ${F.flow}`, -.2); x.fillStyle = rgba(P.deep); x.fillText(name, 96, y - 11);
      setFont(x, `400 16px ${F.flow}`, 0); x.fillStyle = 'rgba(22,10,82,.5)'; x.fillText(sub, 96, y + 15);
      setFont(x, `600 21px ${F.flow}`, -.2); x.fillStyle = rgba(P.deep); x.textAlign = 'right'; x.fillText(amt, sw - 30, y); x.textAlign = 'left';
      x.restore();
    });
    // send button
    const bpop = E.outBack(inv(3.0, 3.3, lt), 1.6);
    const press = 1 - .06 * Math.sin(Math.PI * inv(3.15, 3.3, lt));
    if (bpop > 0) {
      x.save(); x.translate(sw / 2, sh - 70); x.scale(bpop * press, bpop * press);
      rrect(x, -(sw - 60) / 2, -36, sw - 60, 72, 36); x.fillStyle = rgba(P.deep); x.fill();
      const rp = inv(3.17, 3.55, lt);
      if (rp > 0 && rp < 1) { x.save(); rrect(x, -(sw - 60) / 2, -36, sw - 60, 72, 36); x.clip(); circle(x, 60, 0, 380 * E.outCubic(rp)); x.fillStyle = rgba(P.violet, .9 * (1 - rp * .3)); x.fill(); x.restore(); }
      setFont(x, `600 24px ${F.flow}`, -.2); x.fillStyle = '#fff'; x.textAlign = 'center'; x.fillText('Send money', 0, 1); x.textAlign = 'left';
      x.restore();
    }
    // toast
    const tp = E.outBack(inv(3.3, 3.55, lt), 1.5) * (1 - E.inBack(inv(3.7, 3.85, lt)));
    if (tp > 0) {
      x.save(); x.translate(0, -100 + tp * 160);
      rrect(x, 22, 0, sw - 44, 76, 24); x.fillStyle = rgba(P.deep); x.fill();
      circle(x, 64, 38, 20); x.fillStyle = rgba(P.mint); x.fill();
      x.strokeStyle = rgba(P.deep); x.lineWidth = 4; x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath(); x.moveTo(55, 38); x.lineTo(62, 46); x.lineTo(74, 31); x.stroke();
      setFont(x, `600 20px ${F.flow}`, 0); x.fillStyle = '#fff'; x.fillText('$240.00 sent to Maria', 98, 30);
      setFont(x, `400 15px ${F.flow}`, 0); x.fillStyle = rgba(P.lilac); x.fillText('Arrived instantly · 0.4s', 98, 54);
      x.restore();
    }
    x.restore();
    return b.c;
  }

  // ---------------------------------------------------------------- check → smile (handoff to MUNCH)
  const CHECK = resample([[-.36, .02], [-.1, .27], [.4, -.27]], 60);
  const SMILE = resample(Array.from({ length: 40 }, (_, i) => { const a = lerp(Math.PI * .84, Math.PI * .16, i / 39); return [.44 * Math.cos(a), .02 + .44 * Math.sin(a)]; }), 60);

  function flow(ctx, t) {
    const lt = t - T.flow;
    bg(ctx, P.violet);

    // background marquee type (behind everything after the logo)
    const mqA = inv(1.2, 1.5, lt) * (1 - inv(3.5, 3.8, lt));
    if (mqA > 0) {
      ctx.save();
      ctx.globalAlpha = mqA;
      setFont(ctx, `800 230px ${F.flow}`, -6);
      ctx.strokeStyle = rgba(P.lilac, .2); ctx.lineWidth = 2.5; ctx.textBaseline = 'alphabetic';
      const s1 = 'money that moves · ', w1 = tw(ctx, s1);
      for (let r = 0; r < 3; r++) {
        const dir = r % 2 ? 1 : -1, off = ((dir * (lt * 260 + r * 400)) % w1 + w1) % w1;
        for (let k = -2; k < 3; k++) ctx.strokeText(s1, k * w1 - off, 290 + r * 270);
      }
      ctx.restore();
    }

    // ---- A: wave + coin → lockup
    const lockOut = E.inOutExpo(inv(1.2, 1.55, lt));
    if (lockOut < 1) {
      ctx.save();
      ctx.translate(960, 540 - lockOut * 700); ctx.translate(-960, -540);
      const r0 = 170, ph = lt * 5;
      setFont(ctx, `700 196px ${F.flow}`, -7);
      const wW = tw(ctx, 'flowpay');
      const mr = 116, gap = 54, total = 2 * mr + gap + wW;
      const mv = E.snappy(inv(.82, 1.2, lt));
      const cx = lerp(960, 960 - total / 2 + mr, mv), r = lerp(r0, mr, mv) * E.outBack(inv(.28, .6, lt), 2);
      // wave across the frame, shrinking back to the coin edges
      const draw = E.outExpo(inv(0, .5, lt)), ret = E.snappy(inv(.5, .86, lt));
      const xa = lerp(-100, cx - r + 10, ret), xb = lerp(lerp(-100, 2020, draw), cx + r - 10, ret);
      if (ret < 1 && xb > xa) {
        ctx.strokeStyle = rgba(P.mint); ctx.lineWidth = lerp(30, r0 * .2, ret); ctx.lineCap = 'round';
        wavePath(ctx, xa, xb, cx, 540, r0, ph); ctx.stroke();
      }
      if (r > 0) coin(ctx, cx, 540, r, ph);
      // wordmark: letters ride a decaying wave
      const wx = 960 - total / 2 + 2 * mr + gap;
      ctx.fillStyle = '#fff';
      ctx.save(); ctx.beginPath(); ctx.rect(wx - 20, 300, 2000, 360); ctx.clip();
      drawRow(ctx, 'flowpay', wx, 540 + 60, (i) => {
        const p = E.outExpo(inv(.9 + i * .035, 1.4 + i * .035, lt));
        if (p <= 0) return null;
        return { dy: (1 - p) * 170 + Math.sin(i * .9 - lt * 12) * 30 * (1 - p) };
      });
      ctx.restore();
      ctx.fillStyle = rgba(P.lilac);
      setFont(ctx, `400 44px ${F.flow}`, -.5);
      riseText(ctx, 'Money that moves.', wx + 6, 700, lt, 1.05, { h: 50, per: .012, dur: .4 });
      ctx.restore();
    }

    // floating coins for depth
    const fc = inv(1.3, 1.6, lt) * (1 - inv(3.45, 3.6, lt));
    if (fc > 0) {
      for (let k = 0; k < 5; k++) {
        const z = .35 + hash(k, 1) * .7, sp = 1 - E.outExpo(inv(1.25 + k * .05, 2.1 + k * .05, lt));
        const x = 200 + hash(k, 2) * 1520 + Math.sin(lt * 1.3 + k) * 30, y = 140 + hash(k, 3) * 800 + sp * 900 * z + Math.cos(lt * 1.1 + k * 2) * 24;
        ctx.save(); ctx.globalAlpha = fc * (.35 + z * .5);
        coin(ctx, x, y, 34 * z, lt * 4 + k, { coin: rgba(mix(P.white, P.lilac, 1 - z)) });
        ctx.restore();
      }
    }

    // ---- B/C: card
    const cIn = inv(1.25, 2.0, lt);
    if (cIn > 0 && lt < 3.85) {
      const aside = E.snappy(inv(2.2, 2.65, lt));
      const fall = E.inBack(inv(3.45, 3.8, lt), 1.5);
      const cx = lerp(lerp(1500, 960, E.outExpo(cIn)), 610, aside), cy = lerp(lerp(1350, 560, E.outBack(cIn, 1.2)), 560, aside) + fall * 900;
      const ay = lerp(1.45 * (1 - E.outBack(cIn, 1.7)), -.42, aside) + .04 * Math.sin(lt * 2.2);
      const rz = lerp(lerp(.38, -.07, E.outBack(cIn, 1.5)), -.04, aside) + fall * .3;
      const s = lerp(1.05, .82, aside);
      drawCard(ctx, cx, cy, s, ay, rz, inv(1.75, 2.2, lt));
    }

    // phone
    const pIn = inv(2.25, 2.85, lt);
    if (pIn > 0 && lt < 3.85) {
      const fall = E.inBack(inv(3.5, 3.85, lt), 1.5);
      const img = phone(lt);
      const px = 1290, py = lerp(1600, 536, E.outBack(pIn, 1.1)) + fall * 1000;
      const ay = lerp(.55, .14, E.outExpo(pIn)) + .03 * Math.sin(lt * 1.7);
      // shadow
      ctx.save(); ctx.fillStyle = rgba(P.night, .35); ctx.filter = 'blur(30px)';
      rrect(ctx, px - PW * .42 + 40, py - PH * .45 + 60, PW * .84, PH * .9, 60); ctx.fill(); ctx.restore();
      planeY(ctx, img, px, py, PW, PH, ay, { rz: .02 * (1 - E.outExpo(pIn)), strips: 80, focal: 1800 });
    }

    // ---- D: success check grows into MUNCH's plate
    const sp = inv(3.42, 3.62, lt);
    if (sp > 0) {
      const mv = E.snappy(inv(3.42, 3.72, lt)), grow = E.inOutCubic(inv(3.66, 4.0, lt));
      const x = lerp(1290, 960, mv), y = lerp(860, 540, mv);
      const r = lerp(lerp(20, 150, E.outBack(sp, 2)), 330, grow);
      // ground turns red behind the plate
      const wipe = E.inOutCubic(inv(3.68, 3.97, lt));
      if (wipe > 0) { ctx.fillStyle = rgba(C.munch.red); circle(ctx, x, y, lerp(r, 1250, wipe)); ctx.fill(); }
      ctx.fillStyle = rgba(mix(P.mint, C.munch.cream, grow));
      circle(ctx, x, y, r); ctx.fill();
      const cp = E.outCubic(inv(3.5, 3.68, lt)), sm = E.inOutCubic(inv(3.72, 4.0, lt));
      const pts = morph(CHECK, SMILE, sm).map(([u, v]) => [x + u * r, y + v * r]);
      ctx.strokeStyle = rgba(mix(P.deep, C.munch.brown, sm)); ctx.lineWidth = r * lerp(.11, .085, sm); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      polySeg(ctx, pts, 0, cp); ctx.stroke();
    }
  }

  V.scenes.flow = flow;
  V.flow = { coin, SMILE };
})();
