"""
Soundtrack for VIRALGROW — MOTION CASE 2026.

Fully synthesized with numpy/scipy: no samples. 128 BPM, F#m → A, 32 beats.
Every sound effect sits on a visual event in reel.js: the cell divisions, the
swarm drawing the mark, the spark, the type hits, the UI pops and the click,
the chart's ×10 rescales, the globe's arcs, the six cuts and the end card.

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


def chirp(f0, f1, dur, curve=1.0):
    n = int(dur * SR)
    p = (tt(n) / dur) ** curve
    return sine(f0 * (f1 / f0) ** p, n)


def zip_up(dur=0.25, f0=300, f1=3000):
    n = int(dur * SR)
    t = tt(n)
    p = t / dur
    x = chirp(f0, f1, dur, 1.6) * 0.6 + filt(noise(n), 'bp', f0 * (f1 / f0) ** p, 2.0) * 0.8
    return x * np.sin(np.pi * p) ** 0.7 * fade(n)


def pop(f=600, dur=0.09):
    n = int(dur * SR)
    t = tt(n)
    return sine(f * (1 + 1.5 * np.exp(-t * 60)), n) * np.exp(-t * 45) * fade(n, 0.0005)


def supersaw(notes, dur, fc, attack=0.004, decay=0.25, sustain=0.0):
    n = int(dur * SR)
    t = tt(n)
    x = sum(saw(mtof(m) * 2 ** (d / 1200), n) for m in notes for d in (-17, -7, 0, 8, 16))
    x = filt(x, 'lp', fc, 0.8) / (5 * len(notes))
    e = np.minimum(1, t / attack) * (sustain + (1 - sustain) * np.exp(-t / decay))
    return x * e * fade(n, 0.001, 0.02)


# ----------------------------------------------------------------- the score
BPM = 128
BEAT = 60 / BPM
BAR = 4 * BEAT


def bt(x):
    return x * BEAT


SC = [i * BAR for i in range(9)]
CHORDS = {
    'F#m9': ([54, 57, 61, 64, 68], 42), 'Dmaj9': ([50, 54, 57, 61, 64], 38),
    'Aadd9': ([57, 61, 64, 71], 45), 'E69': ([52, 56, 59, 66, 61], 40),
    'Bm9': ([50, 54, 57, 61], 35), 'Amaj9': ([45, 52, 57, 61, 64, 68, 71, 76], 33),
}
PROG = [(SC[0], 'F#m9'), (SC[1], 'Dmaj9'), (SC[2], 'Aadd9'), (SC[3], 'E69'), (SC[4], 'F#m9'),
        (SC[5], 'Dmaj9'), (SC[6], 'Bm9'), (bt(26), 'E69'), (SC[7], 'Amaj9')]
PENT = [66, 68, 69, 71, 73, 76, 78, 80, 81, 83, 85, 88]   # F# minor-ish, bright register


def chord_at(t):
    name = PROG[0][1]
    for t0, c in PROG:
        if t >= t0 - 1e-9:
            name = c
    return CHORDS[name]


KICKS = []

# ================================================= 01 IGNIÇÃO (0 – 1.875)
add('music', pad([42, 54, 61, 64], SC[1], 560, attack=0.7, release=0.15), 0.0, 0.62, rev=0.3)
add('fx', bloop(500, 1100, 0.1), 0.0, 0.35, 0.0, rev=0.4)
for t0 in (0.08, 0.32):                                 # ring pings around the first post
    add('fx', bell(85, 0.7), t0, 0.06, 0.0, rev=0.6)
for k in range(12):                                     # HUD decode chatter
    add('fx', blip(86 + int(rng.integers(0, 10)), 0.025), 0.1 + k * 0.035, 0.03, 0.7 * (-1) ** k)
add('fx', click(3600), 0.12, 0.12, 0.3, rev=0.2)
GEN_T = [0, bt(1), bt(2), bt(2.5), bt(2.875), bt(3.125), bt(3.375), bt(3.56), bt(3.72), bt(3.86), SC[1] - 0.012]
for g in range(1, 11):                                  # every division: a wet pop, climbing the scale
    t0 = GEN_T[g]
    m = PENT[min(g - 1, len(PENT) - 1)]
    add('fx', bloop(mtof(m - 24) * 0.9, mtof(m - 12), 0.12), t0, 0.32 - g * 0.012, (-1) ** g * 0.25, rev=0.35)
    add('music', pluck(m - 12, 0.25, 3500), t0, 0.12, (-1) ** g * 0.3, rev=0.4)
    for j in range(min(2 ** (g - 1), 12)):              # more cells, more grains
        add('fx', blip(m + int(rng.integers(0, 12)), 0.02), t0 + rng.random() * 0.06, 0.012 + 0.002 * g, rng.uniform(-0.9, 0.9), rev=0.3)
for t0 in (bt(1), bt(2)):                               # heartbeat on the first divisions
    add('drums', kick(0.3, 180, 70, 1.1), t0, 0.4, rev=0.2)
add('fx', riser(0.95, 300, 12000), SC[1] - 0.95, 0.55, 0.0, rev=0.2)
add('fx', reverse(crash(0.6)), SC[1] - 0.58, 0.55)
n = int(0.5 * SR)                                       # snare build in the last half bar
for k in range(8):
    add('drums', snare(0.12, 1.1 + k * 0.04), bt(3) + k * BEAT / 8, 0.08 + k * 0.035, 0.1 * (-1) ** k)

# ================================================= groove: 1.875 – 11.25
for k in range(20):
    t0 = SC[1] + k * BEAT
    add('drums', kick(), t0, 0.95 if k else 1.1)
    KICKS.append(t0)
for k in range(20):
    t0 = SC[1] + k * BEAT
    if k % 2 == 1:
        add('drums', clap(), t0, 0.5, 0.05, rev=0.3)
for k in range(48):                                     # offbeat hats + ghost 16ths
    t0 = SC[1] + k * BEAT / 2
    if k % 2:
        add('drums', hat(0.09, 34), t0, 0.2, 0.25)
    elif t0 >= SC[2]:
        add('drums', hat(), t0 + BEAT / 4, 0.06, -0.3)
for k in range(48):                                     # bass: 8ths, octave pump on the "and" of 4
    t0 = SC[1] + k * BEAT / 2
    _, root = chord_at(t0 + 1e-3)
    m = root + (12 if k % 4 == 3 else 0)
    n = int(BEAT / 2 * 0.95 * SR)
    t = tt(n)
    x = saw(mtof(m), n) * 0.6 + sine(mtof(m), n) * 0.9
    x = filt(x, 'lp', 240 + 1800 * np.exp(-t * 20), 1.3) * env(n, 0.003, 0.18) * fade(n)
    add('music', x, t0, 0.42)
add('music', sine(mtof(26), int(BAR * SR)) * env(int(BAR * SR), 0.005, 0.5), SC[1], 0.45)   # drop sub

# ================================================= 02 LOGO (1.875 – 3.75)
add('fx', impact(1.8, 70, 30, 1.3), SC[1], 0.9, rev=0.3)
add('fx', crash(2.2), SC[1], 0.4)
add('music', supersaw(CHORDS['Dmaj9'][0], 0.9, 6000, decay=0.35), SC[1], 0.5, rev=0.4)
n = int(0.45 * SR)                                      # the swarm: a stereo sweep of sparkles
sw = whoosh(0.45, 600, 9000)
add('fx', np.vstack([sw * np.linspace(1, 0.3, n), sw * np.linspace(0.3, 1, n)]), SC[1] + 0.02, 0.5)
for k in range(40):
    add('fx', blip(PENT[int(rng.integers(0, len(PENT)))] + 12, 0.02), SC[1] + 0.05 + k * 0.009 + rng.random() * 0.01, 0.025, rng.uniform(-1, 1), rev=0.4)
add('fx', zip_up(0.26, 250, 2600), bt(4.4), 0.35, -0.2, rev=0.2)                       # stroke draws
add('fx', pop(900, 0.1), bt(5), 0.55, 0.3, rev=0.3)                                     # the spark
add('fx', bell(88, 1.2), bt(5), 0.18, 0.3, rev=0.6)
add('fx', bell(93, 1.2), bt(5) + 0.03, 0.12, 0.35, rev=0.6)
add('fx', impact(0.8, 110, 50, 0.6), bt(5), 0.35)
for i in range(9):                                      # wordmark letters land
    add('fx', click(2000 + i * 160, 0.014), bt(5.6) + i * 0.028 + 0.1, 0.12, -0.5 + i * 0.12)
add('fx', whoosh(0.35, 400, 3000), bt(5.6), 0.3, 0.2)
for k in (0, 3, 6, 10, 12):                             # future-bass stabs under the lockup
    add('music', chord_stab(CHORDS['Dmaj9'][0], 0.28, 7000, 900), bt(6) + k * BEAT / 4, 0.32, 0.0, rev=0.3)
add('fx', riser(0.5, 500, 14000), SC[2] - 0.5, 0.6, 0.0)
add('fx', reverse(crash(0.5)), SC[2] - 0.48, 0.5)

# ================================================= 03 TIPOGRAFIA (3.75 – 5.625)
add('fx', impact(1.2, 85, 40, 1.0), SC[2], 0.7, rev=0.2)
add('music', supersaw(CHORDS['Aadd9'][0], 0.6, 7000, decay=0.25), SC[2], 0.45, rev=0.3)
for i in range(8):                                      # SEU VÍDEO: letters rise
    add('fx', click(1500 + i * 120, 0.012), SC[2] + i * 0.03 + 0.12, 0.1, -0.4 + i * 0.1)
add('fx', whoosh(0.3, 800, 5000), SC[2] + 0.1, 0.25, 0.5)                             # cobalt bar wipe
for i in range(6):                                      # TEM UMA flips
    add('fx', whoosh(0.12, 1200, 7000), bt(9) - 0.03 + i * 0.03, 0.18, -0.6 + i * 0.24)
add('fx', impact(0.6, 100, 50, 0.6), bt(9), 0.35)
for i in range(11):                                     # TEMPERATURA pops
    add('fx', pop(500 + i * 70, 0.07), bt(10) - 0.03 + i * 0.025 + 0.08, 0.16, -0.7 + i * 0.14, rev=0.2)
add('music', supersaw([m + 12 for m in CHORDS['Aadd9'][0]], 0.4, 9000, decay=0.2), bt(10), 0.3, rev=0.4)
for k in range(12):                                     # arp bed
    notes, _ = chord_at(SC[2] + k * BEAT / 4 + 1e-3)
    add('music', pluck(notes[(0, 2, 1, 3)[k % 4]] + 12, 0.18, 2800), SC[2] + k * BEAT / 4, 0.07, 0.3 * (-1) ** k, rev=0.3)
# the heat liquid rises and the counter climbs 0° → 97°
c0 = bt(11)
add('fx', bloop(80, 260, 0.35), c0, 0.5, 0.0, rev=0.4)
n = int(0.42 * SR)
t = tt(n)
glide = sine(mtof(54) * 2 ** (2 * (1 - np.exp(-t * 7))), n) + 0.3 * saw(mtof(54) * 2 ** (2 * (1 - np.exp(-t * 7))), n)
add('fx', filt(glide, 'lp', 3000) * env(n, 0.01, 0.4) * fade(n), c0 + 0.02, 0.2, 0.0, rev=0.3)
for k in range(14):
    add('fx', click(2600 + k * 90, 0.01), c0 + 0.03 + k * 0.026, 0.05, 0.4 * (-1) ** k)
add('fx', bell(90, 0.8), c0 + 0.42, 0.16, 0.0, rev=0.5)

# ================================================= 04 PRODUTO (5.625 – 7.5)
add('fx', impact(0.9, 95, 45, 0.7), SC[3], 0.45, rev=0.2)
add('fx', whoosh(0.4, 300, 3000), SC[3], 0.3, -0.4)                                    # ring opens into gauge
add('music', pad(CHORDS['E69'][0], BAR, 1600, attack=0.2), SC[3], 0.3, rev=0.4)
n = int(0.62 * SR)
t = tt(n)
fill_up = saw(mtof(52) * 2 ** (2.4 * (1 - (1 - t / 0.62) ** 4)), n)
add('fx', filt(fill_up, 'lp', 600 + 5000 * (t / 0.62)) * env(n, 0.02, 0.6) * fade(n, 0.01, 0.06), SC[3] + 0.18, 0.12, -0.4, rev=0.3)
for k, st in enumerate((0.16, 0.28, 0.4, 0.55)):                                      # cards & button pop in
    add('fx', pop(700 + k * 140, 0.09), SC[3] + st + 0.04, 0.38, 0.5, rev=0.25)
    add('fx', whoosh(0.18, 1500, 6000), SC[3] + st - 0.05, 0.12, 0.7)
for k in range(27):                                     # retention cells scan in
    add('fx', blip(84 + k % 5, 0.015), SC[3] + 0.36 + k * 0.012, 0.03, 0.6)
add('fx', whoosh(0.5, 400, 1800), SC[3] + 0.75, 0.12, 0.6)                            # cursor travels
CLICK = bt(15)
add('fx', click(2400, 0.016), CLICK, 0.5, 0.2)
add('fx', kick(0.06, 600, 300, 1.0), CLICK, 0.1, 0.2)
add('fx', bell(83, 0.9), CLICK + 0.04, 0.22, 0.2, rev=0.5)                             # scheduled ✓
add('fx', bell(90, 0.9), CLICK + 0.11, 0.2, 0.25, rev=0.5)
for k in range(16):                                     # confetti crackle
    add('fx', click(4000 + rng.random() * 3000, 0.008), CLICK + 0.02 + rng.random() * 0.3, 0.05, rng.uniform(-0.8, 0.8))
add('fx', reverse(whoosh(0.4, 200, 2500)), SC[4] - 0.42, 0.45)
add('fx', riser(0.4, 300, 9000, tone=False), SC[4] - 0.4, 0.35)

# ================================================= 05 DADOS (7.5 – 9.375)
add('fx', impact(1.0, 90, 42, 0.8), SC[4], 0.5, rev=0.2)
n = int(BAR * SR)                                       # the curve, sonified: pitch follows log10(views)
t = tt(n)
lv = t / BAR
voice = sine(mtof(54 + 24 * lv), n) + 0.2 * saw(mtof(54 + 24 * lv), n)
add('fx', filt(voice, 'lp', 2500) * fade(n, 0.05, 0.1), SC[4], 0.05, -0.2, rev=0.3)
for nn in (1, 2, 3):                                    # ×10 stamps
    t0 = SC[4] + bt(nn)
    add('fx', impact(0.5, 120, 60, 0.5), t0, 0.35)
    add('fx', bloop(300 * 2 ** (nn / 3), 1200 * 2 ** (nn / 3), 0.16), t0, 0.35, -0.3, rev=0.3)
    add('music', chord_stab([m + 12 for m in CHORDS['F#m9'][0]], 0.25, 8000, 1200), t0, 0.28, 0.0, rev=0.3)
    for k in range(5):
        add('fx', click(1800 + k * 300, 0.01), t0 + 0.03 + k * 0.02, 0.06, -0.6)
for k in range(30):                                     # readout odometer ticks
    add('fx', click(5200, 0.006), SC[4] + 0.1 + k * 0.058, 0.03, -0.1)
add('fx', riser(0.3, 600, 14000), SC[5] - 0.3, 0.55)
add('fx', reverse(crash(0.3)), SC[5] - 0.28, 0.4)

# ================================================= 06 GLOBO (9.375 – 11.25)
D2R = np.pi / 180


def vec(lat, lon):
    return np.array([np.cos(lat * D2R) * np.sin(lon * D2R), np.sin(lat * D2R), np.cos(lat * D2R) * np.cos(lon * D2R)])


CITY = {'sp': (-23.5, -46.6), 'nyc': (40.7, -74.0), 'lis': (38.7, -9.1), 'lag': (6.5, 3.4), 'lon': (51.5, -0.1),
        'mex': (19.4, -99.1), 'dxb': (25.2, 55.3), 'bom': (19.1, 72.9), 'tyo': (35.7, 139.7), 'jkt': (-6.2, 106.8),
        'syd': (-33.9, 151.2), 'lax': (34, -118.2)}
at = {'sp': 0.08}
arcs = []
for f, to, l in [('sp', 'nyc', .2), ('sp', 'lis', .26), ('sp', 'lag', .34), ('sp', 'mex', .42), ('nyc', 'lax', .62), ('lis', 'lon', .66),
                 ('lis', 'dxb', .7), ('dxb', 'bom', .98), ('bom', 'tyo', 1.12), ('bom', 'jkt', 1.08), ('jkt', 'syd', 1.3)]:
    d = np.arccos(np.clip(vec(*CITY[f]) @ vec(*CITY[to]), -1, 1))
    t0 = max(l, at[f] + .02)
    dur = .2 + .14 * d
    arcs.append((t0, dur, to))
    at[to] = min(at.get(to, 99), t0 + dur)
add('fx', impact(1.0, 80, 36, 0.7), SC[5], 0.45, rev=0.3)
add('music', pad(CHORDS['Dmaj9'][0], BAR, 2400, attack=0.15), SC[5], 0.35, rev=0.5)
for i, (t0, dur, to) in enumerate(arcs):
    pan = float(np.clip((CITY[to][1] - 20) / 120, -0.9, 0.9))
    add('fx', zip_up(dur, 500, 3500), SC[5] + t0, 0.12, pan, rev=0.3)
    add('fx', bell(PENT[(i * 3) % len(PENT)] + 12, 0.7), SC[5] + t0 + dur, 0.1, pan, rev=0.6)
    add('fx', pop(1200, 0.05), SC[5] + t0 + dur, 0.14, pan)
for k in range(16):                                     # sparkle bed
    notes, _ = chord_at(SC[5] + k * BEAT / 4 + 1e-3)
    add('music', bell(notes[(0, 3, 1, 4, 2)[k % 5]] + 24, 0.5), SC[5] + k * BEAT / 4, 0.04, 0.6 * np.sin(k * 1.3), rev=0.6)
add('fx', riser(0.34, 200, 15000), SC[6] - 0.34, 0.7)
add('fx', reverse(crash(0.36)), SC[6] - 0.34, 0.55)

# ================================================= 07 RITMO (11.25 – 13.125)
CUTS = [SC[6], bt(26), bt(26.5), bt(27), bt(27.5), bt(27.75)]
for c, t0 in enumerate(CUTS):
    notes, _ = chord_at(t0 + 1e-3)
    add('drums', kick(), t0, 1.0)
    KICKS.append(t0)
    add('music', supersaw(notes, 0.3, 8000, decay=0.12), t0, 0.5, 0.0, rev=0.3)
    add('fx', impact(0.5, 110, 55, 0.5), t0, 0.3 + 0.05 * c)
add('fx', crash(1.4), SC[6], 0.35)
for k in range(5):                                      # +340%: the bars grow
    add('fx', bloop(200 + k * 120, 500 + k * 200, 0.12), SC[6] + 0.05 + k * 0.05, 0.25, 0.3 + k * 0.1, rev=0.3)
for t0 in (SC[6] + bt(1),):
    add('drums', kick(), t0, 0.9)
    KICKS.append(t0)
add('drums', clap(), SC[6] + bt(1), 0.5, rev=0.3)
add('drums', clap(), SC[6] + bt(1.5), 0.3, rev=0.3)
for k in range(4):                                      # stutter stabs between the first two cuts
    add('music', chord_stab(CHORDS['Bm9'][0], 0.16, 7000, 900), SC[6] + bt(2) - (4 - k) * BEAT / 4, 0.18 + k * 0.05, 0.3 * (-1) ** k, rev=0.2)
add('fx', pop(500, 0.14), bt(26), 0.6, -0.3, rev=0.4)                                   # heart
for k in range(4):                                      # notifications
    add('fx', bell(88 + (0, 4, 7, 12)[k], 0.4), bt(26) + 0.08 + k * 0.06, 0.12, 0.5, rev=0.4)
add('fx', whoosh(0.2, 1000, 8000), bt(26.5) - 0.05, 0.6, 0.6)                           # whip
add('fx', whoosh(0.2, 600, 4000), bt(27) - 0.04, 0.5, -0.4)                             # drop
n = int(0.24 * SR)
add('fx', sine(300 * 2 ** (tt(n) / 0.24 * 3), n) * fade(n, 0.005, 0.03), bt(27.5), 0.1, 0.0, rev=0.3)
for k in range(16):                                     # snare roll into the end card
    add('drums', snare(0.1, 1.15 + k * 0.035), bt(26.5) + k * BEAT / 8, 0.1 + k * 0.03, 0.15 * (-1) ** k)
add('fx', riser(0.95, 250, 15000), SC[7] - 0.95, 0.5)
add('fx', reverse(crash(0.5)), SC[7] - 0.5, 0.6)

# ================================================= 08 ASSINATURA (13.125 – 15)
add('drums', kick(0.9, 170, 38, 2.2), SC[7], 1.1)
KICKS.append(SC[7])
add('fx', impact(2.2, 62, 26, 1.5), SC[7], 1.0, rev=0.4)
add('fx', crash(2.4), SC[7], 0.5, rev=0.2)
tail = DUR - SC[7]
add('music', pad(CHORDS['Amaj9'][0], tail, 2800, attack=0.01, release=1.2), SC[7], 1.0, rev=0.6)
add('music', supersaw(CHORDS['Amaj9'][0][2:], 1.2, 7000, decay=0.5), SC[7], 0.4, rev=0.5)
n = int(tail * SR)
add('music', sine(mtof(33), n) * env(n, 0.005, 0.8), SC[7], 0.55)
add('fx', zip_up(0.3, 300, 2400), SC[7] + 0.02, 0.25, -0.2)                            # mark draws
add('fx', pop(950, 0.1), SC[7] + 0.3, 0.45, -0.2, rev=0.3)                              # spark
add('fx', bell(93, 1.2), SC[7] + 0.3, 0.14, -0.2, rev=0.6)
add('fx', whoosh(0.45, 300, 3000), SC[7] + 0.2, 0.3, 0.3)                               # wordmark slides out
for k in range(7):                                      # tagline words
    add('fx', blip((81, 83, 85, 88, 90, 92, 93)[k], 0.03), SC[7] + 0.5 + k * 0.035 + 0.05, 0.05, -0.5 + k * 0.16, rev=0.4)
add('fx', pop(700, 0.12), SC[7] + 0.78, 0.4, 0.0, rev=0.3)                              # call to action
add('fx', bell(85, 0.9), SC[7] + 0.8, 0.1, 0.0, rev=0.5)
for k in range(8):                                      # credits decode
    add('fx', click(4200, 0.01), SC[7] + 1.0 + k * 0.05, 0.03, -0.6 + k * 0.17)
add('drums', kick(0.4, 150, 50, 1.2), bt(31), 0.4, rev=0.3)                             # last heartbeat
add('fx', bell(88, 1.0), bt(31), 0.1, 0.0, rev=0.6)

# ----------------------------------------------------------------- mix
t = tt(N)
duck = np.ones(N)
for k0 in KICKS:
    i0 = int(k0 * SR)
    seg = t[i0:] - k0
    duck[i0:] = np.minimum(duck[i0:], 1 - 0.7 * np.exp(-seg / 0.1))
duck = signal.lfilter([0.02], [1, -0.98], duck)

ir_n = int(2.2 * SR)
irt = tt(ir_n)
ir = np.vstack([filt(noise(ir_n), 'lp', 5600) * np.exp(-irt * 3.0) for _ in range(2)])
ir[:, :int(0.016 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
rev = np.vstack([signal.fftconvolve(BUS['rev'][c], ir[c])[:N] for c in range(2)]) * 0.5

mix = BUS['drums'] + BUS['music'] * duck + BUS['fx'] + rev
mix = np.vstack([filt(mix[c], 'hp', 28) for c in range(2)])
mix /= np.max(np.abs(mix)) + 1e-9
mix = np.tanh(mix * 1.7) / np.tanh(1.7)
mix *= 10 ** (-1.0 / 20) / np.max(np.abs(mix))
mix[:, -int(0.15 * SR):] *= np.linspace(1, 0, int(0.15 * SR))

out = sys.argv[1] if len(sys.argv) > 1 else 'audio/soundtrack.wav'
pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'wrote {out}  peak -1 dBFS  rms {20 * np.log10(np.sqrt((mix ** 2).mean())):.1f} dBFS')
