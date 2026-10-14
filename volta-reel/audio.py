"""
Soundtrack for VOLTA — SHOWREEL 2026.

Synthesized from scratch with numpy/scipy, no samples. 120 BPM in D major
(Dmaj9 · Bm9 · Gmaj9 · A6/9). Every sound effect sits on a visual event in
src/*.js: the dot, the 0 → 1 morph, the coin, the chomp, the bouncing
letters, the scooter, the particle bang, the typing, the counters, the cuts.

    python3 audio.py [out.wav]
"""
import sys
import wave
import numpy as np
from scipy import signal

SR = 48000
DUR = 30.0
N = int(SR * DUR)
rng = np.random.default_rng(2026)

BUS = {k: np.zeros((2, N)) for k in ('drums', 'music', 'fx', 'rev')}


# ----------------------------------------------------------------- utilities
def mtof(m):
    return 440.0 * 2 ** ((np.asarray(m, float) - 69) / 12)


def tt(n):
    return np.arange(n) / SR


def add(bus, sig, t0, gain=1.0, pan=0.0, rev=0.0):
    """Mix a mono (or stereo) signal into a bus at time t0 with equal-power pan."""
    sig = np.asarray(sig, float)
    if sig.ndim == 1:
        a = (np.clip(pan, -1, 1) + 1) * np.pi / 4
        sig = np.vstack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)
    i0 = int(round(t0 * SR))
    if i0 < 0:
        sig, i0 = sig[:, -i0:], 0
    n = min(sig.shape[1], N - i0)
    if n <= 0:
        return
    BUS[bus][:, i0:i0 + n] += sig[:, :n] * gain
    if rev:
        BUS['rev'][:, i0:i0 + n] += sig[:, :n] * gain * rev


def env(n, a=0.002, d=0.2, hold=0.0):
    t = tt(n)
    e = np.minimum(1, t / max(a, 1e-6))
    return e * np.where(t < a + hold, 1, np.exp(-(t - a - hold) / max(d, 1e-6)))


def fade(n, fi=0.003, fo=0.01):
    e = np.ones(n)
    k = min(int(fi * SR), n)
    e[:k] = np.linspace(0, 1, k)
    k = min(int(fo * SR), n)
    if k:
        e[-k:] *= np.linspace(1, 0, k)
    return e


def biquad(kind, fc, q):
    fc = float(np.clip(fc, 20, SR * 0.45))
    w0 = 2 * np.pi * fc / SR
    c, s = np.cos(w0), np.sin(w0)
    al = s / (2 * q)
    if kind == 'lp':
        b = [(1 - c) / 2, 1 - c, (1 - c) / 2]
    elif kind == 'hp':
        b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
    else:  # band-pass, 0 dB peak
        b = [al, 0, -al]
    a = [1 + al, -2 * c, 1 - al]
    return np.array(b) / a[0], np.array(a) / a[0]


def filt(x, kind, fc, q=0.707, block=128):
    """Biquad with a cutoff that may vary over time (updated per block)."""
    fc = np.broadcast_to(np.asarray(fc, float), x.shape)
    y = np.empty_like(x)
    zi = np.zeros(2)
    for i in range(0, len(x), block):
        b, a = biquad(kind, fc[i], q)
        y[i:i + block], zi = signal.lfilter(b, a, x[i:i + block], zi=zi)
    return y


def saw(freq, n, phase=None):
    """PolyBLEP band-limited sawtooth; freq may be an array."""
    f = np.broadcast_to(np.asarray(freq, float), (n,))
    dt = f / SR
    ph = (np.cumsum(dt) + (rng.random() if phase is None else phase)) % 1.0
    y = 2 * ph - 1
    m = ph < dt
    x = ph[m] / dt[m]
    y[m] -= x + x - x * x - 1
    m = ph > 1 - dt
    x = (ph[m] - 1) / dt[m]
    y[m] -= x * x + x + x + 1
    return y


def sine(freq, n, phase=0.0):
    f = np.broadcast_to(np.asarray(freq, float), (n,))
    return np.sin(2 * np.pi * np.cumsum(f) / SR + phase)


def noise(n):
    return rng.standard_normal(n)


def reverse(x):
    return x[::-1].copy()


# ----------------------------------------------------------------- instruments
def kick(dur=0.45, f0=150, f1=48, drive=1.7):
    n = int(dur * SR)
    t = tt(n)
    f = f1 + (f0 - f1) * np.exp(-t * 32)
    body = sine(f, n) * np.exp(-t * 7)
    clk = filt(noise(n), 'hp', 2500) * np.exp(-t * 400) * 0.45
    return np.tanh((body + clk) * drive) * fade(n, 0.0005, 0.02)


def clap(dur=0.35):
    n = int(dur * SR)
    t = tt(n)
    nz = filt(noise(n), 'bp', 1500, 0.9)
    e = sum(np.where(t >= o, np.exp(-(t - o) * 250), 0) for o in (0, 0.01, 0.021)) * 0.6
    e += np.where(t >= 0.027, np.exp(-(t - 0.027) * 15), 0)
    return nz * e * 0.4 * fade(n, 0.0005)


def hat(dur=0.06, decay=60, fc=8000):
    n = int(dur * SR)
    t = tt(n)
    return filt(noise(n), 'hp', fc) * np.exp(-t * decay) * fade(n, 0.0005)


def shaker(dur=0.08):
    n = int(dur * SR)
    t = tt(n)
    return filt(noise(n), 'bp', 6500, 1.2) * np.sin(np.pi * np.minimum(1, t / dur)) ** 2


def snare(dur=0.16, pitch=1.0):
    n = int(dur * SR)
    t = tt(n)
    nz = filt(noise(n), 'bp', 3200 * pitch, 0.6) * np.exp(-t * 22)
    tone = sine(190 * pitch, n) * np.exp(-t * 35)
    return (nz * 0.9 + tone * 0.6) * fade(n, 0.0005)


def stab(notes, dur=0.3, bright=7000, dark=600, det=10):
    n = int(dur * SR)
    t = tt(n)
    x = sum(saw(mtof(m) * 2 ** (d / 1200), n) for m in notes for d in (-det, det))
    fc = dark + (bright - dark) * np.exp(-t * 16)
    return filt(x, 'lp', fc, 1.0) * env(n, 0.002, 0.15) * fade(n) / len(notes)


def pluck(note, dur=0.32, bright=5000):
    n = int(dur * SR)
    t = tt(n)
    f = mtof(note)
    x = saw(f, n) * 0.6 + sine(f * 2, n) * 0.3
    return filt(x, 'lp', 300 + bright * np.exp(-t * 28), 1.3) * env(n, 0.001, 0.11) * fade(n)


def marimba(note, dur=0.5):
    n = int(dur * SR)
    t = tt(n)
    f = mtof(note)
    x = sine(f, n) * np.exp(-t * 9) + 0.35 * sine(f * 4, n) * np.exp(-t * 30) + 0.12 * sine(f * 9.8, n) * np.exp(-t * 60)
    return x * env(n, 0.001, 1.0) * fade(n)


def bell(note, dur=1.0):
    n = int(dur * SR)
    t = tt(n)
    f = mtof(note)
    x = sine(f, n) + 0.45 * sine(f * 2.76, n) * np.exp(-t * 6) + 0.25 * sine(f * 5.4, n) * np.exp(-t * 11)
    return x * env(n, 0.002, 0.4) * fade(n)


def pad(notes, dur, fc, attack=0.08, release=0.4, det=(-12, 0, 12)):
    n = int(dur * SR)
    t = tt(n)
    x = sum(saw(mtof(m) * 2 ** (d / 1200), n) for m in notes for d in det)
    x = filt(x, 'lp', fc, 0.8) / (len(det) * len(notes))
    e = np.minimum(1, t / attack) * np.where(t > dur - release, np.maximum(0, (dur - t) / release), 1)
    return x * e


def epiano(notes, dur=0.9):
    n = int(dur * SR)
    t = tt(n)
    x = sum(sine(mtof(m), n) + 0.3 * sine(mtof(m) * 2, n) * np.exp(-t * 9) for m in notes)
    return x * env(n, 0.003, 0.5) * fade(n) / len(notes)


def riser(dur, f0=300, f1=9000, tone=True, curve=2.5):
    n = int(dur * SR)
    t = tt(n)
    p = t / dur
    fc = f0 * (f1 / f0) ** (p ** 1.4)
    x = filt(noise(n), 'bp', fc, 1.4) * 1.6
    if tone:
        x += 0.25 * saw(110 * 2 ** (p * 3.2), n)
        x = filt(x, 'lp', 400 + 9000 * p ** 2)
    return x * p ** curve


def whoosh(dur=0.35, f0=500, f1=4500, q=1.1):
    n = int(dur * SR)
    t = tt(n)
    p = t / dur
    fc = f0 * (f1 / f0) ** np.sin(np.pi * p)
    return filt(noise(n), 'bp', fc, q) * np.sin(np.pi * p) ** 2


def impact(dur=1.6, f0=70, f1=32, body=1.0):
    n = int(dur * SR)
    t = tt(n)
    boom = sine(f1 + (f0 - f1) * np.exp(-t * 7), n) * np.exp(-t * 2.6) * body
    crunch = filt(noise(n), 'lp', 1800 + 6000 * np.exp(-t * 20)) * np.exp(-t * 9) * 0.5
    return np.tanh((boom + crunch) * 1.5) * fade(n, 0.0005, 0.05)


def crash(dur=2.2):
    n = int(dur * SR)
    t = tt(n)
    x = filt(noise(n), 'hp', 4500) + 0.4 * filt(noise(n), 'bp', 9000, 2)
    return x * np.exp(-t * 2.2) * fade(n, 0.0005, 0.05) * 0.5


def bloop(f0=260, f1=900, dur=0.14):
    n = int(dur * SR)
    t = tt(n)
    f = f0 + (f1 - f0) * (1 - np.exp(-t * 40))
    return sine(f, n) * env(n, 0.002, dur / 3.5) * fade(n)


def click(freq=3200, dur=0.02):
    n = int(dur * SR)
    t = tt(n)
    return (sine(freq, n) * 0.7 + filt(noise(n), 'hp', 5000) * 0.3) * np.exp(-t * 300) * fade(n, 0.0002)


def blip(note, dur=0.05):
    n = int(dur * SR)
    t = tt(n)
    return (sine(mtof(note), n) + 0.2 * saw(mtof(note), n)) * np.exp(-t * 60) * fade(n, 0.0005)


def boing(f=420, dur=0.45, depth=0.3, rate=11):
    n = int(dur * SR)
    t = tt(n)
    fr = f * (1 + depth * np.exp(-t * 8) * np.sin(2 * np.pi * rate * t)) * (1 + 0.6 * np.exp(-t * 30))
    return sine(fr, n) * env(n, 0.002, dur / 3) * fade(n)


def pop(f=900, dur=0.06):
    n = int(dur * SR)
    t = tt(n)
    return sine(f * (1 + 1.5 * np.exp(-t * 120)), n) * np.exp(-t * 70) * fade(n, 0.0003)


def chomp():
    n = int(0.28 * SR)
    t = tt(n)
    thud = sine(110 * (1 + np.exp(-t * 40)), n) * np.exp(-t * 22)
    crunch = np.zeros(n)
    for o in (0.0, 0.035, 0.07, 0.11):
        i0 = int(o * SR)
        k = n - i0
        crunch[i0:] += filt(noise(k), 'bp', 2200 + rng.random() * 1500, 0.8) * np.exp(-tt(k) * 70)
    return np.tanh(thud * 1.4 + crunch * 0.9) * fade(n, 0.0005)


def shimmer(dur=0.8, lo=84, hi=108, density=40, decay=12):
    n = int(dur * SR)
    out = np.zeros(n)
    for _ in range(int(density * dur)):
        i0 = int(rng.random() * n * 0.85)
        m = int(rng.integers(lo, hi))
        k = min(int(0.25 * SR), n - i0)
        out[i0:i0 + k] += sine(mtof(m), k) * np.exp(-tt(k) * decay) * (0.5 + 0.5 * rng.random())
    return out / max(1.0, np.sqrt(density * dur) * 0.5)


def chime(notes=(84, 91), gap=0.09):
    n = int(1.0 * SR)
    out = np.zeros(n)
    for k, m in enumerate(notes):
        i0 = int(k * gap * SR)
        out[i0:] += bell(m, 1.0)[:n - i0]
    return out


def ticks(t0, t1, rate0=30, rate1=8, bus='fx', gain=0.05, f=3600, pan=0.0):
    """Ratchet: a run of clicks slowing from rate0 to rate1 per second."""
    t = t0
    while t < t1:
        p = (t - t0) / (t1 - t0)
        add(bus, click(f * (1 + 0.1 * rng.random()), 0.012), t, gain, pan + 0.2 * (rng.random() - 0.5))
        t += 1 / (rate0 + (rate1 - rate0) * p)


# ----------------------------------------------------------------- harmony
CH = {
    'D': ([50, 57, 61, 64, 66], 38), 'Bm': ([47, 54, 57, 61, 62], 35),
    'G': ([43, 50, 54, 57, 59], 31), 'A': ([45, 52, 54, 59, 61], 33),
    'Asus': ([45, 52, 55, 59, 62], 33), 'Em': ([52, 55, 59, 62, 66], 40),
}
PROG = [(0, 'D'), (3.0, 'Bm'), (4.0, 'G'), (5.0, 'A'), (6.0, 'D'), (8.0, 'Bm'), (10.0, 'G'), (12.0, 'A'),
        (14.0, 'Bm'), (16.0, 'G'), (18.0, 'D'), (20.0, 'A'), (22.0, 'Bm'), (23.0, 'G'), (24.0, 'Em'),
        (25.0, 'Asus'), (26.0, 'D')]


def chord_at(t):
    name = PROG[0][1]
    for t0, c in PROG:
        if t >= t0 - 1e-9:
            name = c
    return CH[name]


KICKS = []
B = 0.5  # beat

# ================================================================= 00 INTRO (0 – 2)
add('music', pad(CH['D'][0], 3.1, 520, attack=1.2, release=0.4), 0.0, 0.42, rev=0.4)
add('music', sine(mtof(26), int(3 * SR)) * np.minimum(1, tt(int(3 * SR)) / 2.5) * fade(int(3 * SR), 0.01, 0.3), 0.0, 0.18)
add('fx', bloop(500, 1200, 0.12), 0.04, 0.32, 0.0, rev=0.5)                # dot appears
add('fx', sine(mtof(38), int(.4 * SR)) * env(int(.4 * SR), .002, .12), 0.04, 0.4)
add('fx', bloop(700, 900, 0.08), 0.25, 0.12, 0.0, rev=0.5)                 # breath
for i, (t0, m) in enumerate(((0.5, 74), (0.75, 78), (1.0, 81), (1.25, 85))):  # words
    add('music', pluck(m, 0.4, 4000), t0, 0.32, -0.3 + i * 0.2, rev=0.45)
    add('fx', whoosh(0.18, 1500, 6000), t0 - 0.06, 0.1, -0.3 + i * 0.2)
    add('fx', click(4200, 0.01), t0, 0.08, -0.3 + i * 0.2)
add('fx', bloop(180, 640, 0.25), 1.5, 0.45, 0.0, rev=0.4)                  # dot inflates to "0"
add('music', pluck(90, 0.6, 6000), 1.5, 0.18, 0.2, rev=0.6)
add('fx', riser(0.5, 300, 9000), 1.52, 0.42, 0.0)                         # dive into the zero
add('fx', reverse(crash(0.5)), 1.5, 0.35)

# ================================================================= 01 ZERO → ONE (2 – 4)
add('fx', impact(1.0, 75, 38, 0.6), 2.0, 0.45, rev=0.3)
add('music', pad(CH['D'][0] + [69], 1.0, 900, attack=0.05, release=0.3), 2.0, 0.3, rev=0.5)
ticks(2.02, 2.5, 60, 25, gain=0.035, f=4200, pan=0.3)                     # dial draws
for k, t0 in enumerate((2.12, 2.2, 2.28)):
    add('fx', blip(88 + k * 2, 0.04), t0, 0.08, -0.5 + k * 0.5, rev=0.3)
add('fx', reverse(whoosh(0.3, 300, 1500)), 2.22, 0.3)                      # wind-up
n = int(0.5 * SR)
add('fx', sine(220 * 2 ** (tt(n) / 0.5 * 2), n) * fade(n, 0.02, 0.02) * (tt(n) / 0.5), 2.5, 0.12, 0.0, rev=0.3)  # morph glide
add('fx', riser(0.5, 400, 10000), 2.5, 0.45)
# 0 → 1: the first big hit
add('drums', kick(0.6, 170, 42, 2.2), 3.0, 1.0)
KICKS.append(3.0)
add('fx', impact(1.8, 72, 30, 1.3), 3.0, 0.9, rev=0.35)
add('fx', crash(2.0), 3.0, 0.4)
add('music', stab(CH['Bm'][0] + [69, 73], 0.45, 9000, 900), 3.0, 0.6, rev=0.4)
add('music', pad(CH['Bm'][0], 1.0, 1800, attack=0.01, release=0.5), 3.0, 0.4, rev=0.5)
for i in range(6):
    add('fx', blip(81 + (0, 2, 4, 7, 9, 12)[i], 0.04), 3.04 + i * 0.03, 0.06, -0.6 + i * 0.24, rev=0.3)
add('drums', kick(), 3.5, 0.8)
KICKS.append(3.5)
for k in range(8):                                                         # roll into the drop
    add('drums', snare(0.12, 1 + k * 0.04), 3.5 + k * 0.0625, 0.08 + k * 0.03, 0.1)
add('fx', reverse(whoosh(0.32, 300, 3000)), 3.5, 0.4)                       # "1" collapses
add('fx', riser(0.36, 500, 13000), 3.64, 0.5)
add('fx', reverse(crash(0.4)), 3.6, 0.5)

# ================================================================= groove 4 – 22
for k in range(36):
    t0 = 4.0 + k * B
    if 13.5 <= t0 < 14.0 or 17.5 <= t0 < 18.0:
        continue
    g = 0.9
    if 18.0 <= t0 < 20.0:
        g = 0.65                                                              # Terra breathes
    add('drums', kick(), t0, g)
    KICKS.append(t0)
for k in range(18):                                                         # claps on 2 & 4
    t0 = 4.5 + k * 1.0
    if 13.5 <= t0 < 14.0 or 17.5 <= t0 < 18.2:
        continue
    add('drums', clap(), t0, 0.5, 0.05, rev=0.35)
for k in range(72):
    t0 = 4.0 + k * 0.25
    if k % 2:
        add('drums', hat(0.08, 36), t0, 0.16, 0.25)
    if 6.0 <= t0 < 10.0 or 18.0 <= t0 < 22.0:
        add('drums', shaker(), t0 + 0.125, 0.06, -0.35)
    if 14.0 <= t0 < 18.0:
        add('drums', hat(0.04, 90, 9500), t0 + 0.125, 0.05, -0.4)

# bass: offbeat 8ths, octave jumps on the last of each bar
for k in range(36):
    t0 = 4.0 + k * B + 0.25
    if 13.5 <= t0 < 14.0 or 17.5 <= t0 < 18.0:
        continue
    _, root = chord_at(t0)
    m = root + (12 if k % 4 == 3 else 0)
    nb = int(0.24 * SR)
    t = tt(nb)
    if 14.0 <= t0 < 18.0:                                                   # Nimbus: darker, reese-ish
        x = saw(mtof(m), nb) + saw(mtof(m) * 1.007, nb)
        x = filt(x, 'lp', 220 + 900 * np.exp(-t * 16), 2.0) * env(nb, 0.003, 0.2) * fade(nb)
    else:
        x = saw(mtof(m), nb) * 0.6 + sine(mtof(m), nb)
        x = filt(x, 'lp', 260 + 1500 * np.exp(-t * 22), 1.2) * env(nb, 0.003, 0.18) * fade(nb)
    add('music', x, t0, 0.45)
    add('music', sine(mtof(root), nb) * env(nb, 0.003, 0.2) * fade(nb), t0 - 0.25, 0.2)  # sub on the beat

# chord stabs: syncopated house pattern
STAB_PAT = (0, 0.75, 1.5)
for bar in range(9):
    b0 = 4.0 + bar * 2
    for off in STAB_PAT + tuple(1.0 + o for o in (0.75,)):
        t0 = b0 + off
        if 13.5 <= t0 < 14.0 or 17.5 <= t0 < 18.0:
            continue
        notes, _ = chord_at(t0)
        if 18.0 <= t0 < 22.0:
            add('music', epiano([m + 12 for m in notes[1:]], 0.7), t0, 0.6, 0.0, rev=0.45)
        elif 14.0 <= t0 < 18.0:
            add('music', stab([m + 12 for m in notes[1:]], 0.25, 4000, 400, det=18), t0, 0.5, 0.0, rev=0.5)
        else:
            add('music', stab([m + 12 for m in notes[1:]], 0.28, 7500, 700), t0, 0.58, 0.0, rev=0.35)
for t0, t1 in ((4.0, 6.0), (6.0, 10.0), (10.0, 13.5), (14.0, 17.5), (18.0, 22.0)):  # pads under each section
    notes, _ = chord_at(t0)
    seg = t1 - t0
    if seg > 2.1:
        n1, _ = chord_at(t0 + 2.0)
        add('music', pad(notes, 2.05, 1500, 0.3, 0.3), t0, 0.3, rev=0.5)
        add('music', pad(n1, seg - 2.0, 1500, 0.3, 0.3), t0 + 2.0, 0.3, rev=0.5)
    else:
        add('music', pad(notes, seg, 1500, 0.3, 0.3), t0, 0.3, rev=0.5)

# ================================================================= 02 VOLTA (4 – 6)
add('fx', impact(1.6, 70, 30, 1.1), 4.0, 0.8, rev=0.3)
add('fx', crash(2.2), 4.0, 0.4)
n = int(0.6 * SR)
p = tt(n) / 0.6
add('fx', filt(noise(n), 'bp', 600 * 12 ** (1 - (1 - p) ** 3), 2.5) * np.sin(np.pi * p) * fade(n), 4.0, 0.35, 0.3)  # ring draws
for k, t0 in enumerate((4.12, 4.18, 4.26)):
    add('fx', click(3800 + k * 400, 0.012), t0, 0.1, (-0.5, 0.5, 0.3)[k])
n = int(0.5 * SR)
add('fx', sum(sine(f, n) * np.exp(-tt(n) * d) for f, d in ((2900, 7), (4400, 9), (6100, 12))) / 3 * fade(n), 4.62, 0.14, 0.0, rev=0.4)  # letters slide out
add('fx', whoosh(0.3, 800, 5000), 4.6, 0.3)
add('fx', pop(1400), 4.92, 0.18, 0.4, rev=0.3)                              # ®
for i in range(12):                                                         # tagline decode
    add('fx', blip(86 + (0, 3, 5, 7, 10)[i % 5], 0.025), 4.86 + i * 0.022, 0.04, -0.6 + i * 0.1)
for i, m in enumerate((74, 76, 78, 81, 83)):                                # chips
    add('fx', pop(mtof(m + 12)), 5.0 + i * 0.06, 0.16, -0.6 + i * 0.3, rev=0.3)
add('fx', click(2600, 0.015), 5.3, 0.2, 0.0)                                # "Motion" toggles on
add('fx', riser(0.45, 300, 12000), 5.55, 0.55)
add('fx', reverse(crash(0.45)), 5.55, 0.5)

# ================================================================= 03 FLOWPAY (6 – 10)
add('fx', impact(1.2, 80, 38, 0.8), 6.0, 0.6, rev=0.25)
n = int(0.55 * SR)
lfo = 0.5 + 0.5 * np.sin(2 * np.pi * 6 * tt(n))
add('fx', filt(noise(n), 'bp', 900 + 2600 * lfo, 3.0) * np.sin(np.pi * tt(n) / 0.55) * fade(n), 6.0, 0.3, -0.2, rev=0.3)  # wave
add('fx', bloop(240, 760, 0.2), 6.28, 0.45, 0.0, rev=0.3)                   # coin
add('fx', reverse(whoosh(0.3, 1000, 7000)), 6.52, 0.22, 0.0)                 # wave retracts
for i in range(7):                                                          # letters ride the wave
    add('music', pluck(78 + (0, 2, 4, 7, 9, 11, 14)[i], 0.3, 4500), 6.9 + i * 0.035, 0.14, -0.6 + i * 0.2, rev=0.4)
add('fx', whoosh(0.45, 300, 3500), 7.2, 0.45, 0.4)                          # card swings in
add('fx', impact(0.5, 120, 60, 0.4), 7.62, 0.2)
add('fx', shimmer(0.5, 92, 110, 50, 16), 7.75, 0.12, 0.3, rev=0.5)           # sheen
add('fx', whoosh(0.3, 600, 4500), 8.22, 0.35, -0.4)                         # card turns aside
add('fx', whoosh(0.5, 200, 2500), 8.25, 0.4, 0.5)                           # phone rises
ticks(8.55, 9.25, 45, 12, gain=0.045, f=3000, pan=0.45)                    # balance roll
n = int(0.7 * SR)
add('fx', sine(mtof(72) * 2 ** (1.0 * tt(n) / 0.7), n) * 0.5 * fade(n, 0.05, 0.1) * np.sin(np.pi * tt(n) / 0.7), 8.6, 0.05, 0.4, rev=0.3)  # chart draws
for i in range(3):
    add('fx', click(2200 + i * 300, 0.014), 8.9 + i * 0.08, 0.1, 0.5)
add('fx', chime((88, 95)), 9.2, 0.16, 0.45, rev=0.4)                        # balance locks: cha-ching
add('fx', click(1800, 0.02), 9.15, 0.3, 0.45)                               # send press
add('fx', kick(0.08, 400, 160, 1.0), 9.15, 0.12, 0.45)
add('fx', chime((93, 88)), 9.32, 0.14, 0.45, rev=0.5)                       # toast
for k, m in enumerate((74, 78, 81, 86)):                                    # success
    add('music', bell(m, 0.8), 9.45 + k * 0.025, 0.09, -0.3 + k * 0.2, rev=0.5)
add('fx', bloop(300, 900, 0.18), 9.44, 0.35, 0.0, rev=0.3)
add('fx', whoosh(0.36, 300, 2500), 9.66, 0.5, 0.0)
add('fx', reverse(crash(0.35)), 9.66, 0.4)

# ================================================================= 04 MUNCH (10 – 14)
add('fx', boing(160, 0.5, 0.25, 9), 10.0, 0.45, 0.0, rev=0.2)               # plate lands
add('fx', impact(0.8, 90, 45, 0.6), 10.0, 0.5)
add('fx', pop(1200), 10.14, 0.25, -0.3)                                     # eyes
add('fx', pop(1500), 10.2, 0.25, 0.3)
add('fx', chomp(), 10.45, 0.9, 0.2, rev=0.15)                              # CHOMP
for k in range(10):                                                         # crumbs
    add('fx', click(5000 + rng.random() * 3000, 0.008), 10.5 + k * 0.05 + rng.random() * 0.03, 0.04, rng.uniform(-0.8, 0.8))
add('fx', bloop(500, 1100, 0.1), 10.52, 0.18, 0.3)                          # grin
add('fx', whoosh(0.3, 700, 4000), 10.72, 0.25, -0.3)
for i in range(5):                                                          # letters land
    tl = 10.82 + i * 0.07 + 0.26
    add('fx', boing(300 * 2 ** ((0, 2, 4, 7, 9)[i] / 12), 0.35, 0.3, 12), tl, 0.22, -0.5 + i * 0.25, rev=0.25)
    add('drums', kick(0.12, 260, 120, 1.0), tl, 0.2, -0.5 + i * 0.25)
add('fx', blip(96, 0.03), 11.0, 0.05)                                       # blink
add('fx', pop(700, 0.09), 11.38, 0.4, 0.3, rev=0.2)                         # sticker slap
add('fx', filt(noise(int(0.08 * SR)), 'bp', 1800, 1.0) * np.exp(-tt(int(0.08 * SR)) * 50), 11.4, 0.25, 0.3)
add('fx', whoosh(0.5, 300, 3000), 11.72, 0.45, 0.0)                         # pan down to the city
for k in range(16):                                                         # blocks pop
    add('fx', pop(600 + rng.random() * 900, 0.04), 11.85 + k * 0.022, 0.06, rng.uniform(-0.8, 0.8))
n = int(0.4 * SR)
add('fx', sine(900 * 2 ** (tt(n) / 0.4), n) * 0.4 * fade(n, 0.01, 0.05), 11.95, 0.05, -0.2, rev=0.3)  # route draws
add('fx', bloop(400, 800, 0.12), 11.98, 0.25, -0.4)                         # restaurant pin
add('fx', boing(240, 0.4, 0.3, 10), 12.25, 0.3, 0.4, rev=0.2)               # home pin drops
# scooter: motor pitch follows its speed (inOutCubic over 12.05 – 13.25)
r0, r1 = 12.05, 13.25
n = int((r1 - r0) * SR)
p = tt(n) / (r1 - r0)
spd = 12 * np.minimum(p, 1 - p) ** 2                                        # derivative of inOutCubic
f = 70 + 120 * spd / spd.max()
motor = saw(f, n) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * f * 0.25 * tt(n))))
motor = filt(motor, 'bp', 900, 1.0) * np.sin(np.pi * p) ** 0.6 * fade(n, 0.05, 0.1)
add('fx', motor, r0, 0.1, 0.0)
for k, (t0, pn) in enumerate(((12.3, -0.6), (12.5, 0.6), (12.7, 0.5))):    # stickers
    add('fx', pop(500 + k * 150, 0.1), t0, 0.4, pn, rev=0.2)
    add('fx', filt(noise(int(0.06 * SR)), 'bp', 2000, 1.0) * np.exp(-tt(int(0.06 * SR)) * 60), t0, 0.2, pn)
add('fx', chime((86, 90, 93)), 13.25, 0.2, 0.0, rev=0.5)                    # delivered!
for k in range(14):
    add('fx', pop(1200 + rng.random() * 1500, 0.03), 13.27 + k * 0.025, 0.05, rng.uniform(-0.9, 0.9))
n = int(0.5 * SR)
add('fx', sine(1200 * 2 ** (-3 * tt(n) / 0.5), n) * fade(n, 0.01, 0.05) * 0.6, 13.42, 0.12, 0.0, rev=0.3)  # iris "wooop"
add('fx', whoosh(0.48, 2500, 300), 13.42, 0.35)
add('fx', blip(100, 0.04), 13.92, 0.1)

# ================================================================= 05 NIMBUS (14 – 18)
add('drums', kick(0.7, 160, 38, 2.4), 14.0, 1.0)
KICKS.append(14.0)
add('fx', impact(2.0, 65, 26, 1.3), 14.0, 0.9, rev=0.45)                    # big bang
add('fx', shimmer(1.0, 88, 112, 70, 9), 14.0, 0.22, 0.0, rev=0.6)
add('fx', crash(2.4), 14.0, 0.4)
for k in range(16):                                                         # network arps
    notes, _ = chord_at(14.45 + k * 0.0625)
    add('music', pluck(notes[(0, 2, 4, 1, 3)[k % 5]] + 24, 0.2, 3500), 14.45 + k * 0.0625, 0.08, 0.6 * np.sin(k * 1.7), rev=0.5)
add('fx', riser(0.6, 400, 11000), 14.95, 0.4)                               # particles → word
add('fx', shimmer(0.7, 90, 110, 60, 10), 15.0, 0.12, 0.0, rev=0.6)
add('music', stab([66, 69, 73, 78], 0.6, 9000, 1500, det=14), 15.58, 0.45, 0.0, rev=0.6)  # "nimbus" resolves
add('fx', impact(0.8, 90, 45, 0.6), 15.6, 0.4)
for i in range(14):                                                         # tagline decode
    add('fx', blip(90 + (0, 5, 7, 12)[i % 4], 0.02), 15.75 + i * 0.016, 0.03, -0.5 + i * 0.07)
add('fx', whoosh(0.5, 400, 6000), 15.9, 0.35, 0.0, rev=0.3)                 # to starfield
add('fx', reverse(whoosh(0.3, 500, 2500)), 15.95, 0.2)                      # prompt bar
for i in range(29):                                                         # typing
    if 'Design a brand for my startup'[i] == ' ':
        continue
    add('fx', click(2000 + rng.random() * 1400, 0.012), 16.08 + (i + 1) * 0.0128, 0.09, 0.1 * rng.uniform(-1, 1))
add('fx', click(1600, 0.02), 16.5, 0.25)                                    # send
add('fx', bloop(300, 1200, 0.18), 16.52, 0.3, 0.0, rev=0.4)
for k in range(4):                                                          # cards generate
    add('fx', pop(mtof(81 + (0, 4, 7, 12)[k]), 0.07), 16.6 + k * 0.07, 0.18, -0.5 + k * 0.33, rev=0.3)
    add('fx', bell(93 + (0, 4, 7, 12)[k], 0.4), 16.74 + k * 0.07, 0.05, -0.5 + k * 0.33, rev=0.5)
add('fx', reverse(shimmer(0.6, 84, 104, 50, 8)), 17.25, 0.18, 0.0)          # regroup into a planet
add('fx', riser(0.6, 200, 6000, tone=False), 17.3, 0.35)

# ================================================================= 06 TERRA (18 – 22)
add('fx', impact(1.4, 70, 34, 0.8), 18.0, 0.55, rev=0.4)
for k, t0 in enumerate((18.15, 18.25)):
    add('fx', blip(86 + 3 * k, 0.04), t0, 0.07, (-0.5, 0.5)[k], rev=0.3)
add('fx', reverse(whoosh(0.5, 200, 1500)), 18.62, 0.3)                      # tilt edge-on
add('music', pad([62, 66, 69, 74], 1.2, 2400, 0.05, 0.8), 18.9, 0.25, rev=0.6)  # sun blooms
for k in range(4):                                                          # stripes
    add('music', marimba(74 - (0, 3, 5, 8)[k] + 12, 0.5), 19.0 + k * 0.05, 0.28, -0.4 + k * 0.25, rev=0.4)
add('fx', whoosh(0.4, 400, 2500), 19.25, 0.25)
for i, m in enumerate((74, 76, 78, 81, 83)):                                # "terra"
    add('music', marimba(m, 0.5), 19.42 + i * 0.045, 0.24, -0.5 + i * 0.25, rev=0.4)
add('fx', whoosh(0.4, 600, 3000), 20.0, 0.25, -0.4)                         # header move
ticks(20.15, 21.0, 50, 10, gain=0.04, f=2800, pan=-0.4)                    # counter roll
add('fx', click(1200, 0.03), 21.0, 0.2, -0.4)
for k in range(10):                                                         # growth bars
    notes, _ = chord_at(20.3)
    add('music', marimba(notes[k % 5] + 12 + 12 * (k // 5), 0.45), 20.3 + k * 0.045, 0.17, 0.2 + k * 0.06, rev=0.4)
    add('fx', pop(2000 + k * 120, 0.03), 20.55 + k * 0.045, 0.04, 0.5)
add('fx', shimmer(0.4, 96, 112, 40, 14), 20.8, 0.08, 0.5, rev=0.5)          # net-zero line
for k in range(8):                                                          # bar wipe
    add('fx', whoosh(0.22, 800, 7000), 21.42 + k * 0.028, 0.12, (-0.7, 0.7)[k % 2])
add('fx', riser(0.5, 300, 13000), 21.5, 0.5)
add('fx', reverse(crash(0.45)), 21.55, 0.5)

# ================================================================= 07 MONTAGE (22 – 24)
for c in range(8):
    t0 = 22.0 + c * 0.25
    notes, _ = chord_at(t0)
    add('drums', kick(), t0, 1.0)
    KICKS.append(t0)
    add('music', stab([m + 12 for m in notes], 0.26, 9000, 900), t0, 0.5, 0.0, rev=0.3)
    add('fx', impact(0.5, 100, 50, 0.5), t0, 0.25)
add('fx', crash(1.5), 22.0, 0.35)
for i in range(4):                                                          # logo wall tiles
    add('fx', pop(800 + i * 200, 0.05), 22.0 + i * 0.025, 0.15, -0.6 + i * 0.4)
add('fx', whoosh(0.2, 1000, 7000), 22.25, 0.3)                              # palettes rise
for i in range(4):                                                          # type swaps
    add('fx', click(3000 + i * 400, 0.015), 22.5 + i * 0.0625, 0.15, -0.3 + i * 0.2)
for i in range(5):                                                          # app icons
    add('fx', bloop(400 + i * 120, 900 + i * 150, 0.08), 22.75 + i * 0.022, 0.16, -0.6 + i * 0.3)
for k in range(16):                                                         # BRANDS THAT MOVE: roll building
    add('drums', snare(0.12, 1 + k * 0.03), 23.0 + k * 0.0625, 0.1 + k * 0.022, 0.1)
add('drums', clap(), 23.0, 0.5, rev=0.3)
add('drums', clap(), 23.5, 0.6, rev=0.3)
add('fx', whoosh(0.3, 400, 6000), 23.73, 0.45)                              # spinning mark
add('fx', riser(0.3, 600, 14000), 23.72, 0.4)

# ================================================================= 08 STATS (24 – 26)
add('drums', kick(0.6, 170, 42, 2.0), 24.0, 0.95)
KICKS.append(24.0)
add('fx', impact(1.4, 70, 32, 1.0), 24.0, 0.7, rev=0.3)
add('fx', crash(2.0), 24.0, 0.35)
add('music', pad(CH['Em'][0], 1.0, 1400, 0.02, 0.3), 24.0, 0.32, rev=0.5)
add('music', pad(CH['Asus'][0], 1.0, 1800, 0.05, 0.2), 25.0, 0.32, rev=0.5)
for k in range(3):
    add('drums', kick(), 24.5 + k * 0.5, 0.6)
    KICKS.append(24.5 + k * 0.5)
for i, t0 in enumerate((24.12, 24.26, 24.4)):                               # counters roll ...
    ticks(t0, t0 + 0.55, 45, 15, gain=0.035, f=3000 + i * 500, pan=-0.6 + i * 0.6)
    add('fx', bell(86 + (0, 4, 7)[i], 0.6), t0 + 0.55, 0.1, -0.6 + i * 0.6, rev=0.4)   # ... and lock in
add('fx', whoosh(0.3, 800, 4000), 24.78, 0.25)                              # headline
n = int(0.25 * SR)
add('fx', filt(noise(n), 'bp', 2400 + 2000 * tt(n) / 0.25, 3) * np.sin(np.pi * tt(n) / 0.25), 25.05, 0.25, 0.3)  # highlighter swipe
for k in range(16):                                                         # final roll
    add('drums', snare(0.12, 1.1 + k * 0.03), 25.0 + k * 0.0625, 0.08 + k * 0.025, -0.1)
add('fx', riser(1.0, 250, 14000), 25.0, 0.55)
add('fx', reverse(crash(0.6)), 25.4, 0.6)
add('music', reverse(stab(CH['D'][0] + [74, 78], 0.5, 8000, 1200)), 25.5, 0.5, rev=0.5)

# ================================================================= 09 END (26 – 30)
n = int(0.32 * SR)
add('fx', sine(2200 * 2 ** (-2.2 * tt(n) / 0.32), n) * 0.5 * fade(n, 0.01, 0.01), 26.0, 0.1, 0.0, rev=0.3)  # dot falls
add('drums', kick(0.9, 180, 36, 2.6), 26.32, 1.0)
KICKS.append(26.32)
add('fx', impact(2.6, 62, 26, 1.5), 26.32, 1.0, rev=0.45)
add('fx', crash(2.6), 26.32, 0.5, rev=0.2)
big = pad(CH['D'][0] + [69, 73, 78], 3.6, 3000, attack=0.01, release=2.2)
add('music', big, 26.32, 0.85, rev=0.65)
add('music', sine(mtof(26), int(3.0 * SR)) * env(int(3.0 * SR), 0.005, 1.2), 26.32, 0.5)
add('fx', boing(300, 0.25, 0.2, 14), 26.6, 0.12, rev=0.3)                   # small bounces
add('fx', pop(700, 0.05), 26.76, 0.1)
add('fx', whoosh(0.5, 300, 4000), 26.62, 0.35, 0.0)                         # ring swings around
n = int(0.6 * SR)
add('fx', sum(sine(f, n) * np.exp(-tt(n) * d) for f, d in ((2600, 6), (3900, 8), (5200, 11))) / 3 * fade(n), 26.92, 0.13, 0.0, rev=0.5)
add('fx', pop(1400), 27.3, 0.16, 0.4, rev=0.3)                               # ®
for i, m in enumerate((78, 81, 85, 86, 90)):                                # "From zero to one."
    add('music', bell(m, 1.2), 27.45 + i * 0.06, 0.07, -0.5 + i * 0.25, rev=0.6)
for i in range(14):                                                         # tagline decode
    add('fx', blip(88 + (0, 2, 4, 7, 9)[i % 5], 0.025), 27.7 + i * 0.02, 0.035, -0.6 + i * 0.09)
add('fx', bloop(300, 800, 0.16), 28.0, 0.3, 0.0, rev=0.4)                   # CTA
for k in range(4):                                                          # arrow nudges
    add('fx', click(4500, 0.01), 28.5 + k * 0.5, 0.05, 0.3)
    add('music', pluck(CH['D'][0][(0, 2, 4, 1)[k]] + 24, 0.4, 2500), 28.5 + k * 0.5, 0.07, 0.3 * (-1) ** k, rev=0.6)

# ----------------------------------------------------------------- mix
t = tt(N)
duck = np.ones(N)
for k0 in KICKS:
    i0 = int(k0 * SR)
    seg = t[i0:] - k0
    duck[i0:] = np.minimum(duck[i0:], 1 - 0.65 * np.exp(-seg / 0.1))
duck = signal.lfilter([0.02], [1, -0.98], duck)

ir_n = int(2.4 * SR)
irt = tt(ir_n)
ir = np.vstack([filt(noise(ir_n), 'lp', 5200) * np.exp(-irt * 2.8) for _ in range(2)])
ir[:, :int(0.02 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
rev = np.vstack([signal.fftconvolve(BUS['rev'][c], ir[c])[:N] for c in range(2)]) * 0.5

mix = BUS['drums'] + BUS['music'] * duck + BUS['fx'] + rev * (0.6 + 0.4 * duck)
mix = np.vstack([filt(mix[c], 'hp', 28) for c in range(2)])
mix /= np.max(np.abs(mix)) + 1e-9
mix = np.tanh(mix * 1.7) / np.tanh(1.7)
mix *= 10 ** (-1.0 / 20) / np.max(np.abs(mix))
mix[:, -int(0.5 * SR):] *= np.linspace(1, 0, int(0.5 * SR)) ** 1.5

out = sys.argv[1] if len(sys.argv) > 1 else 'audio/soundtrack.wav'
pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'wrote {out}  peak -1 dBFS  rms {20 * np.log10(np.sqrt((mix ** 2).mean())):.1f} dBFS')
