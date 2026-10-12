"""
Soundtrack for CLAUDE — MOTION REEL 2026.

Fully synthesized with numpy/scipy: no samples. 120 BPM, Fm → Ab, and every
sound effect is placed on a visual event in reel.js (bounces, letter hits, grid
waves, morphs, the easing race, the cuts).

    python3 audio.py [out.wav]
"""
import sys
import wave
import numpy as np
from scipy import signal

SR = 48000
DUR = 15.0
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


# ----------------------------------------------------------------- instruments
def kick(dur=0.5, f0=160, f1=46, drive=1.8):
    n = int(dur * SR)
    t = tt(n)
    f = f1 + (f0 - f1) * np.exp(-t * 30)
    body = sine(f, n) * np.exp(-t * 6.5)
    click = filt(noise(n), 'hp', 2500) * np.exp(-t * 380) * 0.5
    return np.tanh((body + click) * drive) * fade(n, 0.0005, 0.02)


def clap(dur=0.4):
    n = int(dur * SR)
    t = tt(n)
    nz = filt(noise(n), 'bp', 1600, 0.9)
    e = sum(np.where(t >= o, np.exp(-(t - o) * 260), 0) for o in (0, 0.009, 0.019)) * 0.6
    e += np.where(t >= 0.025, np.exp(-(t - 0.025) * 16), 0)
    body = sine(185, n) * np.exp(-t * 30) * 0.5
    return (nz * e * 0.35 + body) * fade(n, 0.0005)


def hat(dur=0.07, decay=55):
    n = int(dur * SR)
    t = tt(n)
    return filt(noise(n), 'hp', 7500) * np.exp(-t * decay) * fade(n, 0.0005)


def snare(dur=0.18, pitch=1.0):
    n = int(dur * SR)
    t = tt(n)
    nz = filt(noise(n), 'bp', 3000 * pitch, 0.6) * np.exp(-t * 22)
    tone = sine(200 * pitch, n) * np.exp(-t * 35)
    return (nz * 0.9 + tone * 0.6) * fade(n, 0.0005)


def chord_stab(notes, dur=0.32, bright=6500, dark=700):
    n = int(dur * SR)
    t = tt(n)
    x = sum(saw(mtof(m) * 2 ** (d / 1200), n) for m in notes for d in (-9, 9))
    fc = dark + (bright - dark) * np.exp(-t * 18)
    return filt(x, 'lp', fc, 1.1) * env(n, 0.002, 0.16) * fade(n) / len(notes)


def pluck(note, dur=0.35, bright=5000):
    n = int(dur * SR)
    t = tt(n)
    f = mtof(note)
    x = saw(f, n) * 0.6 + sine(f * 2, n) * 0.3
    return filt(x, 'lp', 300 + bright * np.exp(-t * 30), 1.4) * env(n, 0.001, 0.12) * fade(n)


def bell(note, dur=1.2):
    n = int(dur * SR)
    t = tt(n)
    f = mtof(note)
    x = sine(f, n) + 0.45 * sine(f * 2.76, n) * np.exp(-t * 6) + 0.25 * sine(f * 5.4, n) * np.exp(-t * 11)
    return x * env(n, 0.002, 0.45) * fade(n)


def pad(notes, dur, fc, attack=0.06, release=0.3):
    n = int(dur * SR)
    t = tt(n)
    x = sum(saw(mtof(m) * 2 ** (d / 1200), n) for m in notes for d in (-14, 0, 13))
    x = filt(x, 'lp', fc, 0.9) / (3 * len(notes))
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
        x += 0.25 * saw(120 * 2 ** (p * 3.2), n)
        x = filt(x, 'lp', 400 + 9000 * p ** 2)
    return x * p ** curve


def whoosh(dur=0.35, f0=500, f1=4500):
    n = int(dur * SR)
    t = tt(n)
    p = t / dur
    fc = f0 * (f1 / f0) ** np.sin(np.pi * p)
    return filt(noise(n), 'bp', fc, 1.1) * np.sin(np.pi * p) ** 2


def impact(dur=1.6, f0=70, f1=32, body=1.0):
    n = int(dur * SR)
    t = tt(n)
    boom = sine(f1 + (f0 - f1) * np.exp(-t * 7), n) * np.exp(-t * 2.6) * body
    crunch = filt(noise(n), 'lp', 1800 + 6000 * np.exp(-t * 20)) * np.exp(-t * 9) * 0.5
    return np.tanh((boom + crunch) * 1.5) * fade(n, 0.0005, 0.05)


def crash(dur=2.4):
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


def reverse(x):
    return x[::-1].copy()


# ----------------------------------------------------------------- the score
BEAT = 0.5
CHORDS = {
    'Fm9': ([53, 56, 63, 67, 72], 41), 'Dbmaj9': ([49, 56, 60, 63, 65], 37),
    'Bbm9': ([49, 53, 56, 60, 65], 34), 'Ebadd9': ([55, 58, 63, 65, 70], 39),
    'Eb/G': ([55, 58, 63, 67, 70], 43), 'Db': ([49, 53, 56, 61, 65], 37),
    'Eb': ([51, 55, 58, 63, 67], 39), 'Abmaj9': ([44, 51, 55, 60, 63, 70, 75], 32),
}
PROG = [(1.5, 'Fm9'), (3.5, 'Dbmaj9'), (5.5, 'Bbm9'), (7.5, 'Ebadd9'), (9.5, 'Fm9'), (10.5, 'Eb/G'),
        (11.5, 'Db'), (12.25, 'Eb'), (13.0, 'Abmaj9')]


def chord_at(t):
    name = PROG[0][1]
    for t0, c in PROG:
        if t >= t0 - 1e-9:
            name = c
    return CHORDS[name]


KICKS = []

# --- 01 PRINCIPLES (0 – 1.5): a quiet room, the ball, the wind-up
add('music', pad([29, 41, 48], 1.5, 380, attack=0.9, release=0.2), 0.0, 0.35)
add('fx', bloop(700, 1300, 0.07), 0.0, 0.25, -0.35, rev=0.3)
for k in range(10):                                   # HUD decode chatter
    add('fx', blip(84 + int(rng.integers(0, 12)), 0.03), 0.1 + k * 0.04, 0.035, 0.7 * (-1) ** k)
for t0, p in ((0.18, -0.25), (0.52, -0.1), (0.74, 0.2), (1.0, 0.45)):   # callout ticks
    add('fx', click(3600), t0, 0.12, p, rev=0.2)
add('drums', kick(0.35, 230, 95, 1.2), 0.5, 0.45, 0.0, rev=0.25)        # bounce 1
add('fx', bloop(420, 240, 0.12), 0.5, 0.25, 0.0, rev=0.3)
add('drums', kick(0.35, 200, 80, 1.2), 1.0, 0.55, 0.3, rev=0.25)        # bounce 2
add('fx', bloop(360, 190, 0.12), 1.0, 0.25, 0.3, rev=0.3)
n = int(0.1 * SR)
add('fx', sine(220 + 500 * tt(n) / 0.1, n) * (0.5 + 0.5 * np.sin(2 * np.pi * 40 * tt(n))) * fade(n), 1.03, 0.08, 0.3)
add('fx', riser(0.4, 400, 11000), 1.1, 0.5, 0.25, rev=0.2)
add('fx', reverse(crash(0.45)), 1.05, 0.5, 0.0)

# --- groove: 1.5 – 11.5
for k in range(20):
    t0 = 1.5 + k * BEAT
    g = 0.62 if t0 >= 9.5 else 0.95
    add('drums', kick(), t0, g)
    KICKS.append(t0)
for t0 in (2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.5, 10.0, 11.0):
    add('drums', clap(), t0, 0.55, 0.05, rev=0.35)
for k in range(40):                                   # hats: offbeat 8ths + ghost 16ths
    t0 = 1.5 + k * 0.25
    if k % 2:
        add('drums', hat(0.09, 34), t0, 0.22, 0.25)
    elif t0 >= 3.5:
        add('drums', hat(), t0 + 0.125, 0.07, -0.3)
    if 5.5 <= t0 < 7.5 and k % 2 == 0:
        add('drums', hat(), t0 + 0.0625 + 0.125, 0.05, 0.4)

# bass: 8ths with octave pumps (wobble in the fluid section)
for k in range(40):
    t0 = 1.5 + k * 0.25
    if 7.5 <= t0 < 9.5:
        continue
    notes, root = chord_at(t0 + 1e-3)
    m = root + (12 if k % 4 == 3 else 0)
    n = int(0.23 * SR)
    t = tt(n)
    x = saw(mtof(m), n) * 0.7 + sine(mtof(m), n) * 0.9
    x = filt(x, 'lp', 260 + 1700 * np.exp(-t * 22), 1.3) * env(n, 0.003, 0.2) * fade(n)
    add('music', x, t0, 0.42 if t0 < 9.5 else 0.3)
n = int(2.0 * SR)
t = tt(n)
lfo = (0.5 + 0.5 * np.sin(2 * np.pi * 4 * t - np.pi / 2)) ** 2
x = saw(mtof(27), n) * 0.8 + saw(mtof(39) * 1.003, n) * 0.4 + sine(mtof(27), n)
add('music', filt(x, 'lp', 140 + 1700 * lfo, 3.0) * fade(n, 0.005, 0.03), 7.5, 0.4)

# --- 02 TYPOGRAPHY
for k in (0, 3, 6, 10, 13):
    add('music', chord_stab(CHORDS['Fm9'][0]), 1.5 + k * 0.125, 0.5, 0.0, rev=0.3)
add('fx', impact(1.4), 1.5, 0.7, rev=0.25)
add('fx', crash(2.0), 1.5, 0.35, 0.0)
for i in range(6):
    add('fx', click(2400 + i * 180, 0.015), 1.5 + i * 0.04, 0.12, -0.4 + i * 0.12)
for i in range(6):
    add('fx', blip(76 + (0, 3, 5, 7, 10, 12)[i], 0.04), 2.0 + i * 0.03, 0.08, -0.5 + i * 0.2)
add('fx', impact(0.6, 90, 45, 0.6), 2.0, 0.35)
for i in range(5):
    add('fx', whoosh(0.16, 900, 6000), 2.5 + i * 0.045 - 0.04, 0.4, 0.8 - i * 0.3)
add('fx', impact(0.6, 90, 45, 0.6), 2.5, 0.35)
add('fx', riser(0.5, 500, 7000, tone=False), 3.0, 0.35, 0.0)
for j, p in enumerate((-0.7, 0.7, -0.4, 0.4)):
    add('fx', whoosh(0.2, 700, 5000), 3.12 + j * 0.06, 0.38, p)

# --- 03 SYSTEMS: every wave is a melodic cascade
add('fx', impact(1.2, 80, 38, 0.8), 3.5, 0.5, rev=0.2)
pent = [61, 63, 65, 68, 70, 73, 75, 77, 80, 82, 85]
for w, (t0, direction) in enumerate(((3.5, 1), (4.0, -1), (4.5, 1), (5.0, -1))):
    seq = pent if direction > 0 else pent[::-1]
    for i, m in enumerate(seq[:9]):
        add('music', pluck(m - (12 if w % 2 else 0), 0.3), t0 + i * 0.028, 0.16, -0.7 + i * 0.17, rev=0.4)
    add('fx', bloop(200, 520, 0.16), t0, 0.22, 0.0, rev=0.3)
for k in range(16):                                   # arpeggio bed
    notes, _ = chord_at(3.5 + k * 0.125 + 1e-3)
    add('music', pluck(notes[(0, 2, 4, 1, 3, 2)[k % 6]] + 12, 0.2, 2500), 3.5 + k * 0.125, 0.07, 0.3 * (-1) ** k, rev=0.3)
add('fx', riser(0.45, 300, 12000), 5.05, 0.55, 0.0)
add('fx', reverse(crash(0.5)), 5.0, 0.45, 0.0)

# --- 04 DIMENSION
add('fx', impact(1.8, 75, 30, 1.2), 5.5, 0.85, rev=0.3)
add('fx', crash(2.2), 5.5, 0.3)
add('music', pad(CHORDS['Bbm9'][0], 2.0, 1400, attack=0.25), 5.5, 0.5, rev=0.4)
for k in range(16):                                   # star-field bells
    notes, _ = chord_at(5.5 + k * 0.125 + 1e-3)
    add('music', bell(notes[(0, 3, 1, 4, 2, 4)[k % 6]] + 24, 0.6), 5.5 + k * 0.125, 0.05, 0.6 * np.sin(k * 1.3), rev=0.6)
for t0 in (6.0, 6.5, 6.97):
    add('fx', whoosh(0.4, 400, 7000), t0 - 0.05, 0.45, 0.0, rev=0.2)
    add('fx', bell(96, 0.5), t0, 0.06, 0.3, rev=0.5)
add('fx', riser(0.34, 200, 14000), 7.16, 0.75, 0.0)
add('fx', reverse(crash(0.4)), 7.1, 0.55)

# --- 05 FLUID
add('fx', impact(1.4, 60, 30, 1.0), 7.5, 0.7, rev=0.3)
add('fx', bloop(90, 340, 0.4), 7.5, 0.6, 0.0, rev=0.5)
add('music', pad(CHORDS['Ebadd9'][0], 2.0, 900, attack=0.4), 7.5, 0.35, rev=0.5)
for t0 in (8.0, 8.5, 9.0):
    add('fx', bloop(160, 480, 0.22), t0, 0.4, 0.0, rev=0.4)
for k in range(14):                                   # droplets
    t0 = 7.65 + k * 0.105 + rng.random() * 0.04
    add('fx', bloop(300 + rng.random() * 500, 900 + rng.random() * 900, 0.08), t0, 0.12, rng.uniform(-0.8, 0.8), rev=0.5)
add('fx', riser(0.42, 200, 8000), 9.08, 0.55, 0.0)

# --- 06 TIMING: the editor makes noise, then the race sings its curves
add('fx', impact(1.0, 85, 40, 0.7), 9.5, 0.45, rev=0.2)
add('music', epiano(CHORDS['Fm9'][0], 1.0), 9.5, 0.5, rev=0.4)
add('music', epiano(CHORDS['Eb/G'][0], 1.0), 10.5, 0.5, rev=0.4)
for t0 in (9.6, 9.65):
    add('fx', click(2800), t0, 0.15, -0.5)
n = int(0.36 * SR)
pen = filt(noise(n), 'bp', 3800, 2.0) * (0.6 + 0.4 * np.sin(2 * np.pi * 23 * tt(n))) * fade(n, 0.02, 0.05)
add('fx', pen, 9.62, 0.13, -0.4)
add('fx', click(1800, 0.012) + 0.0, 10.02, 0.3, -0.2)          # F9 down
add('fx', kick(0.08, 400, 160, 1.0), 10.025, 0.12, -0.2)
add('fx', click(2200, 0.012), 10.1, 0.22, -0.2)                # F9 up
n = int(0.5 * SR)
t = tt(n)
boing = sine(520 * (1 + 0.25 * np.exp(-t * 9) * np.sin(2 * np.pi * 9 * t)), n) * env(n, 0.003, 0.18)
add('fx', boing, 10.02, 0.12, -0.3, rev=0.3)
race_ease = [
    lambda p: p, lambda p: p ** 3, lambda p: 1 - (1 - p) ** 3,
    None, lambda p: 1 - np.exp(-6 * p) * np.cos(11 * p),
]


def easy(p):
    # cubic-bezier(.86, 0, .07, 1) — solved numerically, vectorized
    u = np.linspace(0, 1, 2001)
    bx = 3 * (1 - u) ** 2 * u * .86 + 3 * (1 - u) * u ** 2 * .07 + u ** 3
    by = 3 * (1 - u) * u ** 2 * 1 + u ** 3
    return np.interp(p, bx, by)


race_ease[3] = easy
r0, r1 = 10.42, 11.17
n = int((r1 - r0) * SR)
p = tt(n) / (r1 - r0)
for k, fn in enumerate(race_ease):
    pitch = mtof(65 + 12 * fn(p))
    voice = (sine(pitch, n) + 0.25 * saw(pitch, n)) * fade(n, 0.02, 0.02)
    add('fx', voice, r0, 0.045 if k != 3 else 0.07, -0.6 + k * 0.3, rev=0.3)
for k, m in enumerate((77, 80, 84, 87, 89)):
    add('fx', bell(m, 0.8), r1 + k * 0.012, 0.07, -0.6 + k * 0.3, rev=0.5)
n = int(0.45 * SR)
t = tt(n)
shing = sum(sine(f, n) * np.exp(-t * d) for f, d in ((3170, 9), (4730, 12), (6290, 15))) / 3
add('fx', shing + filt(noise(n), 'hp', 6000) * np.exp(-t * 30) * 0.6, 11.22, 0.22, 0.2, rev=0.4)
add('fx', whoosh(0.3, 600, 6000), 11.22, 0.5, 0.0)

# --- 07 ENERGY: six cuts, each a hit, under a building roll
cut_sfx = [None, 'zing', None, 'glitch', 'sweep', None]
for c in range(6):
    t0 = 11.5 + c * 0.25
    notes, _ = chord_at(t0 + 1e-3)
    add('music', chord_stab(notes, 0.3, 8000, 900), t0, 0.55, 0.0, rev=0.3)
    add('drums', kick(), t0, 0.95)
    KICKS.append(t0)
    if cut_sfx[c] == 'zing':
        add('fx', bell(98, 0.3), t0, 0.08, 0.5, rev=0.3)
    if cut_sfx[c] == 'glitch':
        for j in range(6):
            add('fx', blip(60 + 7 * (j % 3), 0.02), t0 + j * 0.03, 0.08, (-1) ** j * 0.6)
    if cut_sfx[c] == 'sweep':
        n = int(0.24 * SR)
        add('fx', sine(400 * 2 ** (tt(n) / 0.24 * 3), n) * fade(n, 0.005, 0.03), t0, 0.06, 0.0, rev=0.3)
add('drums', clap(), 12.0, 0.5, rev=0.3)
for k in range(8):
    add('drums', snare(0.15, 1 + k * 0.02), 12.0 + k * 0.0625, 0.12 + k * 0.02, 0.1)
for k in range(14):
    add('drums', snare(0.12, 1.2 + k * 0.03), 12.5 + k * 0.03125, 0.25 + k * 0.025, -0.1)
add('fx', riser(1.0, 250, 13000), 12.0, 0.5, 0.0)
add('fx', reverse(crash(0.6)), 12.4, 0.6)
add('music', reverse(chord_stab(CHORDS['Abmaj9'][0], 0.45, 8000, 1200)), 12.55, 0.5, rev=0.5)

# --- 08 HELLO
add('drums', kick(0.8, 180, 40, 2.2), 13.0, 1.0)
KICKS.append(13.0)
add('fx', impact(2.0, 65, 28, 1.4), 13.0, 1.0, rev=0.4)
add('fx', crash(2.0), 13.0, 0.5, 0.0, rev=0.2)
n = int(2.0 * SR)
big = pad(CHORDS['Abmaj9'][0], 2.0, 2600, attack=0.01, release=1.4)
add('music', big, 13.0, 0.95, rev=0.6)
add('music', sine(mtof(32), n) * env(n, 0.005, 0.9), 13.0, 0.5)
add('fx', reverse(whoosh(0.4, 200, 1200)), 13.12, 0.25)
for i in range(15):                                   # title decode
    if 'MOTION DESIGNER'[i] == ' ':
        continue
    add('fx', blip((80, 82, 84, 87, 89, 92)[i % 6], 0.04), 13.62 + i * 0.03 + 0.18, 0.06, -0.6 + i * 0.085, rev=0.4)
add('fx', bell(80, 1.0), 14.0, 0.14, -0.2, rev=0.6)
add('fx', bell(87, 1.0), 14.07, 0.11, 0.2, rev=0.6)
for k in range(8):
    add('fx', click(4200, 0.01), 14.25 + k * 0.05, 0.03, -0.5 + k * 0.14)

# ----------------------------------------------------------------- mix
t = tt(N)
duck = np.ones(N)
for k0 in KICKS:
    i0 = int(k0 * SR)
    seg = t[i0:] - k0
    duck[i0:] = np.minimum(duck[i0:], 1 - 0.72 * np.exp(-seg / 0.11))
duck = signal.lfilter([0.02], [1, -0.98], duck)       # smooth the edges

# reverb: decorrelated decaying noise, darkened, with a short pre-delay
ir_n = int(2.4 * SR)
irt = tt(ir_n)
ir = np.vstack([filt(noise(ir_n), 'lp', 5200) * np.exp(-irt * 2.9) for _ in range(2)])
ir[:, :int(0.018 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
rev = np.vstack([signal.fftconvolve(BUS['rev'][c], ir[c])[:N] for c in range(2)]) * 0.55

mix = BUS['drums'] + BUS['music'] * duck + BUS['fx'] + rev
mix = np.vstack([filt(mix[c], 'hp', 28) for c in range(2)])
mix /= np.max(np.abs(mix)) + 1e-9
mix = np.tanh(mix * 1.6) / np.tanh(1.6)               # gentle saturation / glue
mix *= 10 ** (-1.0 / 20) / np.max(np.abs(mix))
mix[:, -int(0.12 * SR):] *= np.linspace(1, 0, int(0.12 * SR))

out = sys.argv[1] if len(sys.argv) > 1 else 'audio/soundtrack.wav'
pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'wrote {out}  peak -1 dBFS  rms {20 * np.log10(np.sqrt((mix ** 2).mean())):.1f} dBFS')
