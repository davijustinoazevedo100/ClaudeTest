/*
 * CASE 02 — MUNCH (food delivery)   10 → 14 s
 * Mark: a smiling plate with a bite out of it. Character-led, bouncy, loud.
 *   10.00  plate lands (from FLOWPAY's check), eyes pop, CHOMP + crumbs
 *   10.80  the letters fall in and bounce with squash & stretch, sticker tagline
 *   11.75  camera pans down to the city: route, scooter, ETA, stickers
 *   13.45  cartoon iris closes on the delivery → a single dot
 */
(function () {
  'use strict';
  const { W, H, TAU, T, C, F, rgba, mix, clamp, lerp, inv, E, keys, hash, bg, rrect, circle,
    setFont, tw, drawRow, resample, polyline, polySeg } = V;
  const M = C.munch;

  // ---------------------------------------------------------------- the face
  const BITES = [[-1.02, 1.0, .2], [-.66, 1.04, .19], [-.3, 1.02, .17]];
  function face(ctx, x, y, R, o = {}) {
    const sq = o.squash || 0, bite = o.bite ?? 1, blink = o.blink || 0, eyes = o.eyes ?? 1, grin = o.grin || 0;
    ctx.save();
    ctx.translate(x, y + R * sq * .5); ctx.scale(1 + sq, 1 - sq);
    ctx.fillStyle = o.plate || rgba(M.cream);
    circle(ctx, 0, 0, R); ctx.fill();
    if (bite > 0) {
      ctx.fillStyle = o.ground || rgba(M.red);
      for (const [a, d, r] of BITES) { circle(ctx, R * d * Math.cos(a), R * d * Math.sin(a), R * r * bite); ctx.fill(); }
    }
    ctx.fillStyle = ctx.strokeStyle = o.ink || rgba(M.brown);
    if (eyes > 0) for (const sx of [-1, 1]) {
      ctx.save(); ctx.translate(sx * R * .2, -R * .13); ctx.scale(eyes, eyes * (1 - .88 * blink));
      ctx.beginPath(); ctx.ellipse(0, 0, R * .075, R * .105, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.lineWidth = R * .085; ctx.lineCap = 'round';
    const a0 = Math.PI * (.84 + .05 * grin), a1 = Math.PI * (.16 - .05 * grin);
    ctx.beginPath(); ctx.arc(0, .02 * R - grin * .05 * R, R * .44, a0, a1, true); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- city
  const BW = 230, BH = 170, ST = 50, PX = BW + ST, PY = BH + ST;
  const SX = i => i * PX - ST / 2, SY = j => j * PY - ST / 2;
  const ROUTE = resample([[SX(1), SY(2)], [SX(4), SY(2)], [SX(4), SY(4)], [SX(6), SY(4)], [SX(6), SY(5)]], 400);
  const A = ROUTE[0], B = ROUTE[ROUTE.length - 1];
  const at = p => { const f = clamp(p) * (ROUTE.length - 1), i = Math.min(ROUTE.length - 2, Math.floor(f)), u = f - i; return [lerp(ROUTE[i][0], ROUTE[i + 1][0], u), lerp(ROUTE[i][1], ROUTE[i + 1][1], u), Math.atan2(ROUTE[i + 1][1] - ROUTE[i][1], ROUTE[i + 1][0] - ROUTE[i][0])]; };
  const rideP = lt => E.inOutCubic(inv(2.05, 3.25, lt));

  function city(ctx, lt) {
    for (let j = -3; j < 9; j++) for (let i = -4; i < 12; i++) {
      const x = i * PX, y = j * PY, h = hash(i * 31 + j * 7, 5);
      const pop = E.outBack(inv(1.85 + (i + j) * .018, 2.2 + (i + j) * .018, lt), 1.6);
      if (pop <= 0) continue;
      ctx.save(); ctx.translate(x + BW / 2, y + BH / 2); ctx.scale(pop, pop);
      const park = (i === 2 && j === 3) || (i === 5 && j === 1) || (i === 7 && j === 5);
      rrect(ctx, -BW / 2, -BH / 2, BW, BH, 26);
      ctx.fillStyle = park ? rgba(M.green) : h < .18 ? rgba(M.pink) : rgba(M.dark); ctx.fill();
      if (park) {
        ctx.fillStyle = rgba(mix(M.green, M.brown, .25));
        for (let k = 0; k < 5; k++) { circle(ctx, -70 + k * 35, -20 + 30 * Math.sin(k * 2.1), 20 + 6 * hash(k, i)); ctx.fill(); }
      } else if (h > .8) {
        ctx.fillStyle = rgba(M.cream, .9); circle(ctx, 0, 0, 14); ctx.fill();
      }
      ctx.restore();
    }
  }
  function scooter(ctx, x, y, s, ang, lt) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    // speed lines
    const v = Math.abs(rideP(lt + .01) - rideP(lt - .01));
    if (v > .002) {
      ctx.save(); ctx.rotate(ang); ctx.strokeStyle = rgba(M.cream, clamp(v * 60)); ctx.lineWidth = 6; ctx.lineCap = 'round';
      for (const k of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(-54, k * 16); ctx.lineTo(-54 - 40 * clamp(v * 80), k * 16); ctx.stroke(); }
      ctx.restore();
    }
    const bob = Math.sin(lt * 30) * 2 * clamp(v * 100);
    circle(ctx, 0, bob, 38); ctx.fillStyle = rgba(M.yellow); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = rgba(M.brown); ctx.stroke();
    rrect(ctx, -15, -12 + bob, 30, 26, 5); ctx.fillStyle = rgba(M.brown); ctx.fill();
    ctx.strokeStyle = rgba(M.yellow); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-15, -3 + bob); ctx.lineTo(15, -3 + bob); ctx.stroke();
    ctx.strokeStyle = rgba(M.brown); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, -12 + bob, 7, Math.PI, 0); ctx.stroke();
    ctx.restore();
  }
  function pin(ctx, x, y, s, fill, icon) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = rgba(M.brown, .25); ctx.beginPath(); ctx.ellipse(0, 4, 22, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-14, -26, -44, -46, -44, -80); ctx.arc(0, -80, 44, Math.PI, 0); ctx.bezierCurveTo(44, -46, 14, -26, 0, 0); ctx.fill();
    icon(ctx);
    ctx.restore();
  }
  const house = ctx => {
    ctx.fillStyle = rgba(M.red);
    ctx.beginPath(); ctx.moveTo(-22, -74); ctx.lineTo(0, -98); ctx.lineTo(22, -74); ctx.lineTo(22, -58); ctx.lineTo(-22, -58); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgba(M.cream); rrect(ctx, -6, -72, 12, 14, 3); ctx.fill();
  };

  function sticker(ctx, x, y, s, rot, kind) {
    if (s <= 0) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    ctx.shadowColor = 'rgba(42,22,15,.25)'; ctx.shadowOffsetY = 8; ctx.shadowBlur = 0;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (kind === 'hot') {
      ctx.beginPath();
      for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, r = i % 2 ? 78 : 96; ctx.lineTo(r * Math.cos(a), r * Math.sin(a)); }
      ctx.closePath(); ctx.fillStyle = rgba(M.yellow); ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.strokeStyle = rgba(M.brown); ctx.lineWidth = 5; ctx.stroke();
      setFont(ctx, `700 44px ${F.munch}`, 0); ctx.fillStyle = rgba(M.brown); ctx.fillText('HOT!', 0, 2);
    } else if (kind === 'fast') {
      rrect(ctx, -120, -46, 240, 92, 46); ctx.fillStyle = rgba(M.pink); ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.strokeStyle = rgba(M.brown); ctx.lineWidth = 5; ctx.stroke();
      setFont(ctx, `700 46px ${F.munch}`, 0); ctx.fillStyle = rgba(M.brown); ctx.fillText('15 min', 0, 2);
    } else {
      circle(ctx, 0, 0, 82); ctx.fillStyle = rgba(M.green); ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.strokeStyle = rgba(M.brown); ctx.lineWidth = 5; ctx.stroke();
      setFont(ctx, `700 46px ${F.munch}`, 0); ctx.fillStyle = rgba(M.cream); ctx.fillText('YUM', 0, 2);
    }
    ctx.restore();
  }

  // Bounce of a dropped letter: returns [dy, squash]. Lands at t0 + fall.
  function drop(lt, t0, h = 520, fall = .3) {
    const u = lt - t0;
    if (u < 0) return null;
    if (u < fall) { const p = u / fall; return [-(1 - p * p) * h, -.18 * p * p]; }        // falling, stretched
    const b = u - fall;
    const hops = [[.2, 70], [.12, 18]];
    let s = 0, k0 = 0;
    for (const [d, hh] of hops) {
      if (b < k0 + d) { const q = (b - k0) / d; return [-4 * hh * q * (1 - q), q < .3 ? .24 * (1 - q / .3) * (hh / 70) : 0]; }
      k0 += d; s++;
    }
    return [0, .04 * Math.exp(-(b - k0) * 20)];
  }

  function munch(ctx, t) {
    const lt = t - T.munch;
    bg(ctx, M.red);

    // camera pan from the lockup down to the city
    const pan = E.snappy(inv(1.72, 2.2, lt));

    // ---- city (drawn under the lockup layer, revealed by the pan)
    if (lt > 1.7) {
      const rp = rideP(lt), [sx, sy, sa] = at(rp);
      const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2 + 40];
      const follow = E.inOutCubic(inv(2.2, 3.35, lt));
      const zoom = lerp(.88, 1.55, E.inOutCubic(inv(2.6, 3.6, lt)));
      const cx = lerp(mid[0], sx, follow), cy = lerp(mid[1], sy, follow);
      ctx.save();
      ctx.translate(960, 540 + (1 - pan) * 1100); ctx.rotate(-.1 + .05 * follow); ctx.scale(zoom, zoom); ctx.translate(-cx, -cy);
      city(ctx, lt);
      // route
      const dp = E.inOutCubic(inv(1.95, 2.35, lt));
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = rgba(M.cream, .7); ctx.lineWidth = 10; ctx.setLineDash([1, 24]);
      polySeg(ctx, ROUTE, rp, Math.max(rp, dp)); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = rgba(M.cream); ctx.lineWidth = 14;
      polySeg(ctx, ROUTE, 0, rp); ctx.stroke();
      // restaurant + home pins
      const pa = E.outBack(inv(1.95, 2.2, lt), 2.5);
      if (pa > 0) {
        ctx.save(); ctx.translate(A[0], A[1]); ctx.rotate(.1 - .05 * follow);
        pin(ctx, 0, 0, pa * 1.3, rgba(M.brown), c => face(c, 0, -80, 32, { plate: rgba(M.cream), ground: rgba(M.brown) }));
        ctx.restore();
      }
      const d = drop(lt, 2.0, 380, .25);
      if (d) {
        ctx.save(); ctx.translate(B[0], B[1]); ctx.rotate(.1 - .05 * follow); ctx.translate(0, d[0]); ctx.scale(1 + d[1], 1 - d[1]);
        pin(ctx, 0, 0, 1.35, rgba(M.cream), house);
        ctx.restore();
      }
      // delivered ring + confetti
      const dl = inv(3.25, 3.9, lt);
      if (dl > 0) {
        ctx.strokeStyle = rgba(M.cream, 1 - dl); ctx.lineWidth = 6;
        circle(ctx, B[0], B[1], 40 + 180 * E.outExpo(dl)); ctx.stroke();
        const cols = [M.yellow, M.pink, M.green, M.cream];
        for (let k = 0; k < 26; k++) {
          const a = hash(k, 1) * TAU, v = 260 + hash(k, 2) * 420, u = lt - 3.25;
          const px = B[0] + Math.cos(a) * v * u, py = B[1] - 60 + Math.sin(a) * v * u - 300 * u + 900 * u * u;
          ctx.save(); ctx.translate(px, py); ctx.rotate(u * 12 * (hash(k, 3) - .5) * 2);
          ctx.fillStyle = rgba(cols[k % 4], 1 - dl); ctx.fillRect(-7, -4, 14, 8); ctx.restore();
        }
      }
      // scooter + ETA badge
      const sp = E.outBack(inv(2.0, 2.25, lt), 2.5);
      if (sp > 0) {
        scooter(ctx, sx, sy, sp * 1.25, sa, lt);
        ctx.save(); ctx.translate(sx, sy - 88); ctx.rotate(.1 - .05 * follow);
        const done = lt >= 3.25, label = done ? 'Delivered!' : `${Math.max(1, Math.ceil(12 * (1 - rp)))} min`;
        setFont(ctx, `700 30px ${F.munch}`, 0);
        const w = tw(ctx, label) + 40, bp = E.outBack(inv(2.1, 2.3, lt), 2) * (done ? E.outBack(inv(3.25, 3.45, lt), 3) * .25 + .75 : 1);
        ctx.scale(bp, bp);
        rrect(ctx, -w / 2, -26, w, 52, 26); ctx.fillStyle = rgba(M.brown); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-10, 25); ctx.lineTo(0, 37); ctx.lineTo(10, 25); ctx.fill();
        ctx.fillStyle = rgba(done ? M.yellow : M.cream); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, 2);
        ctx.restore();
      }
      ctx.restore();

      // stickers slap onto the screen
      const off = E.inBack(inv(3.3, 3.55, lt), 2);
      sticker(ctx, 250, 600 - off * 900, E.outBack(inv(2.3, 2.48, lt), 3), -.2 + .05 * Math.sin(lt * 5), 'hot');
      sticker(ctx, 1600, 230 - off * 600, E.outBack(inv(2.5, 2.68, lt), 3), .14, 'fast');
      sticker(ctx, 1640, 860 + off * 600, E.outBack(inv(2.7, 2.88, lt), 3), -.1 + .05 * Math.sin(lt * 4 + 1), 'yum');
    }

    // ---- face + wordmark lockup (pans away upward)
    if (pan < 1) {
      ctx.save();
      ctx.translate(0, -pan * 1100);
      setFont(ctx, `700 270px ${F.munch}`, -4);
      const wW = tw(ctx, 'munch');
      const R1 = 168, gap = 46, total = 2 * R1 + gap + wW;
      const mv = E.snappy(inv(.72, 1.08, lt));
      const fx = lerp(960, 960 - total / 2 + R1, mv), fy = lerp(540, 520, mv);
      const R = lerp(330 - 100 * E.spring(inv(0, .6, lt) * 1.2, 6, 14), R1, mv);
      const chomp = lt - .45;
      const sq = (chomp > 0 ? .1 * Math.exp(-chomp * 9) * Math.cos(chomp * 30) : 0)
        + (lt < .4 ? -.06 * Math.sin(Math.PI * inv(0, .4, lt)) : 0);
      const blink = Math.sin(Math.PI * inv(1.0, 1.12, lt));
      face(ctx, fx, fy, R, {
        bite: E.outBack(inv(.45, .53, lt), 3), eyes: E.outBack(inv(.12, .32, lt), 3), blink,
        squash: sq, grin: E.outBack(inv(.5, .7, lt), 2),
      });
      // crumbs
      if (chomp > 0 && chomp < 1.2) {
        for (let k = 0; k < 16; k++) {
          const [a, d] = BITES[k % 3], bx = fx + R * d * Math.cos(a), by = fy + R * d * Math.sin(a);
          const ang = -Math.PI / 2 + (hash(k, 7) - .3) * 2.2, v = 300 + hash(k, 8) * 500;
          const px = bx + Math.cos(ang) * v * chomp, py = by + Math.sin(ang) * v * chomp + 1400 * chomp * chomp;
          ctx.fillStyle = rgba(M.cream, 1 - chomp / 1.2);
          ctx.save(); ctx.translate(px, py); ctx.rotate(chomp * 8 + k);
          const s = 8 + hash(k, 9) * 12; rrect(ctx, -s / 2, -s / 2, s, s, s * .3); ctx.fill(); ctx.restore();
        }
      }
      // letters fall in
      const wx = 960 - total / 2 + 2 * R1 + gap, base = 520 + 92;
      ctx.fillStyle = rgba(M.cream);
      drawRow(ctx, 'munch', wx, base, (i) => {
        const d = drop(lt, .82 + i * .07, 620, .26);
        if (!d) return null;
        const [dy, s] = d;
        return { dy, sx: 1 + s, sy: 1 - s };
      });
      // sticker tagline
      const tp = E.outBack(inv(1.38, 1.6, lt), 2.6);
      if (tp > 0) {
        ctx.save(); ctx.translate(wx + wW - 150, base + 105); ctx.rotate(-.07 + .03 * Math.sin(lt * 6)); ctx.scale(tp, tp);
        setFont(ctx, `700 52px ${F.munch}`, 0);
        const label = 'Hungry? Sorted.', w = tw(ctx, label) + 60;
        rrect(ctx, -w / 2, -44, w, 88, 44); ctx.fillStyle = rgba(M.yellow); ctx.fill();
        ctx.strokeStyle = rgba(M.brown); ctx.lineWidth = 5; ctx.stroke();
        ctx.fillStyle = rgba(M.brown); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, 3);
        ctx.restore();
      }
      ctx.restore();
    }

    // ---- iris out onto a single dot (hands over to NIMBUS)
    const ir = inv(3.42, 3.9, lt);
    if (ir > 0) {
      const r = lerp(1300, 70, E.inOutCubic(ir));
      const r2 = lt > 3.9 ? lerp(70, 13, E.inOutCubic(inv(3.9, 4.0, lt))) : r;
      const wob = 1 + .06 * Math.sin(lt * 40) * (1 - ir);
      ctx.save();
      ctx.fillStyle = rgba(C.nimbus.black);
      ctx.beginPath(); ctx.rect(-200, -200, W + 400, H + 400);
      ctx.ellipse(960, 540, r2 * wob, r2 / wob, 0, 0, TAU, true);
      ctx.fill('evenodd');
      const wd = inv(3.86, 4.0, lt);
      if (wd > 0) { ctx.fillStyle = rgba(C.nimbus.white, wd); circle(ctx, 960, 540, r2 + 1); ctx.fill(); }
      ctx.restore();
    }
  }

  V.scenes.munch = munch;
  V.munch = { face };
})();
