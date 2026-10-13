"""Turn raw tracking into the few smoothed signals the graphics need.

    python3 rig.py work/track.json work/rig.json

Signals (normalised 0..1 image coords, one entry per 30 fps frame, null when undefined):
  face   [cx, cy, size]          camera punch-ins aim here
  hold   [x, y, size]            palm that "holds" the model (frame-right hand), 8.7s..15.4s
  pinch  [x, y]                  thumb/index pinch of the raised hand while stretching, 11.6s..14.4s
  hands  {L: 21x2, R: 21x2}      both hands while they frame the benchmark screen, 21.2s..24.0s
The open palm under the stretch is barely visible to the detector, so it is keyed by hand
from the footage (HOLD_KEYS) and blended with whatever detections exist.
"""
import json, sys
import numpy as np

src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src))
T, FPS = d['track'], d['fps']
N = len(T)
t = np.arange(N) / FPS

def palm(h):
    p = np.array(h['pts'])
    c = p[[0, 5, 9, 13, 17]].mean(0)
    size = np.linalg.norm(p[0] - p[9])
    return c, size

def smooth(samples, lo, hi, sigma=1.5, reach=0.4):
    """Gaussian smoothing over sparse samples {frame: vec}, linear fill across gaps, only in [lo, hi] seconds."""
    out = [None] * N
    if not samples:
        return out
    ks = np.array(sorted(samples))
    vs = np.array([samples[k] for k in ks], dtype=float)
    for f in range(N):
        if not (lo <= t[f] <= hi):
            continue
        w = np.exp(-0.5 * ((ks - f) / sigma) ** 2)
        if w.sum() > 0.05:
            out[f] = (w[:, None] * vs).sum(0) / w.sum()
        else:  # gap: interpolate between neighbouring samples (or hold the nearest one)
            j = np.searchsorted(ks, f)
            if j == 0: out[f] = vs[0]
            elif j == len(ks): out[f] = vs[-1]
            else:
                a = (f - ks[j - 1]) / (ks[j] - ks[j - 1])
                out[f] = vs[j - 1] * (1 - a) + vs[j] * a
    return [None if v is None else [round(float(x), 4) for x in v] for v in out]

# face
face = {}
for f, r in enumerate(T):
    if r['face']:
        x0, y0, x1, y1 = r['face']['box']
        face[f] = [(x0 + x1) / 2, (y0 + y1) / 2, y1 - y0]
face = smooth(face, 0, 99, sigma=3)

# holding palm: detected frame-right hand + hand-keyed positions where the detector loses it
HOLD_KEYS = [(11.5, .68, .92), (12.0, .62, .93), (12.5, .58, .93), (13.0, .58, .92), (13.5, .60, .88),
             (14.0, .60, .88), (14.5, .65, .92), (14.75, .74, .94)]
hold = {}
for f, r in enumerate(T):
    if 8.7 <= t[f] <= 11.45 or 14.8 <= t[f] <= 15.6:
        cands = [palm(h) for h in r['hands'] if palm(h)[0][0] > 0.6]
        if cands:
            c, s = max(cands, key=lambda cs: cs[0][0])
            hold[f] = [c[0], c[1], s]
for tk, x, y in HOLD_KEYS:
    hold[int(round(tk * FPS))] = [x, y, 0.16]
hold = smooth(hold, 8.7, 15.6, sigma=2.5)

# pinch of the raised hand
pinch = {}
for f, r in enumerate(T):
    if 11.6 <= t[f] <= 14.45:
        for h in r['hands']:
            p = np.array(h['pts'])
            if p[0][1] < 0.45:
                pinch[f] = list((p[4] + p[8]) / 2)
pinch = smooth(pinch, 11.6, 14.45, sigma=1.5)

# both hands framing the benchmark screen
Ls, Rs = {}, {}
for f, r in enumerate(T):
    if 21.2 <= t[f] <= 24.0:
        for h in r['hands']:
            p = np.array(h['pts'])
            (Ls if p[0][0] < 0.6 else Rs)[f] = p.flatten()
Ls, Rs = smooth(Ls, 21.2, 24.0, sigma=1.2), smooth(Rs, 21.2, 24.0, sigma=1.2)
hands = [None if (a is None or b is None) else {'L': np.reshape(a, (21, 2)).round(4).tolist(),
                                                 'R': np.reshape(b, (21, 2)).round(4).tolist()} for a, b in zip(Ls, Rs)]

json.dump({'fps': FPS, 'frames': N, 'face': face, 'hold': hold, 'pinch': pinch, 'hands': hands}, open(dst, 'w'))
print('rig ok', N, 'frames; hold', sum(v is not None for v in hold), 'pinch', sum(v is not None for v in pinch),
      'hands', sum(v is not None for v in hands))
