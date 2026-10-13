"""
Sound for the Opus 5.5 edit: the cleaned-up voice, a synthesized music bed and a sound effect on
every graphic in edit.js. No samples; everything but the voice is numpy/scipy.

    python3 sound.py source/input.mp4 work/rig.json work/mix.wav

Cue times below are the same times edit.js animates on.
"""
import json
import subprocess
import sys
import wave

import numpy as np
from scipy import signal

SRC, RIG, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
SR = 48000
rig = json.load(open(RIG))
DUR = rig['frames'] / rig['fps']
N = int(round(DUR * SR))
rng = np.random.default_rng(55)
BUS = {k: np.zeros((2, N)) for k in ('music', 'fx', 'rev')}


# ----------------------------------------------------------------- voice
def load_voice():
    """Clean the webcam voice with ffmpeg: rumble cut, denoise, de-box, presence, compression."""
    chain = ('highpass=f=85,afftdn=nf=-30:tn=1,'
             'equalizer=f=300:t=q:w=1.1:g=-3,equalizer=f=3200:t=q:w=1.0:g=3,equalizer=f=9000:t=q:w=0.8:g=1.5,'
             'acompressor=threshold=-24dB:ratio=3.5:attack=6:release=140:makeup=3')
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', SRC, '-af', chain, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'],
                         check=True, capture_output=True).stdout
    v = np.frombuffer(raw, '<i2').astype(float) / 32768
    out = np.zeros(N)
    out[:min(N, len(v))] = v[:N]
    return out


# ----------------------------------------------------------------- dsp utilities
def mtof(m):
    return 440.0 * 2 ** ((np.asarray(m, float) - 69) / 12)


def tt(n):
    return np.arange(n) / SR


def add(bus, sig, t0, gain=1.0, pan=0.0, rev=0.0):
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


def env(n, a=0.002, d=0.2):
    t = tt(n)
    return np.minimum(1, t / max(a, 1e-6)) * np.where(t < a, 1, np.exp(-(t - a) / max(d, 1e-6)))


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
    else:
        b = [al, 0, -al]
    a = [1 + al, -2 * c, 1 - al]
    return np.array(b) / a[0], np.array(a) / a[0]


def filt(x, kind, fc, q=0.707, block=128):
    fc = np.broadcast_to(np.asarray(fc, float), x.shape)
    y = np.empty_like(x)
    zi = np.zeros(2)
    for i in range(0, len(x), block):
        b, a = biquad(kind, fc[i], q)
        y[i:i + block], zi = signal.lfilter(b, a, x[i:i + block], zi=zi)
    return y


def saw(freq, n):
    f = np.broadcast_to(np.asarray(freq, float), (n,))
    dt = f / SR
    ph = (np.cumsum(dt) + rng.random()) % 1.0
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
def kick(dur=0.45, f0=150, f1=45, drive=1.6):
    n = int(dur * SR); t = tt(n)
    body = sine(f1 + (f0 - f1) * np.exp(-t * 32), n) * np.exp(-t * 7)
    clk = filt(noise(n), 'hp', 2500) * np.exp(-t * 400) * 0.4
    return np.tanh((body + clk) * drive) * fade(n, 0.0005, 0.02)


def clap(dur=0.35):
    n = int(dur * SR); t = tt(n)
    nz = filt(noise(n), 'bp', 1500, 0.9)
    e = sum(np.where(t >= o, np.exp(-(t - o) * 260), 0) for o in (0, 0.009, 0.019)) * 0.6
    e += np.where(t >= 0.025, np.exp(-(t - 0.025) * 15), 0)
    return nz * e * 0.4 * fade(n, 0.0005)


def hat(dur=0.06, decay=60):
    n = int(dur * SR); t = tt(n)
    return filt(noise(n), 'hp', 7800) * np.exp(-t * decay) * fade(n, 0.0005)


def pad(notes, dur, fc, attack=0.3, release=0.4):
    n = int(dur * SR); t = tt(n)
    x = sum(saw(mtof(m) * 2 ** (d / 1200), n) for m in notes for d in (-12, 0, 11))
    x = filt(x, 'lp', fc, 0.8) / (3 * len(notes))
    return x * np.minimum(1, t / attack) * np.where(t > dur - release, np.maximum(0, (dur - t) / release), 1)


def bass(note, dur):
    n = int(dur * SR); t = tt(n)
    f = mtof(note)
    x = sine(f, n) + 0.35 * filt(saw(f, n), 'lp', 400 + 900 * np.exp(-t * 12))
    return np.tanh(x * 1.3) * env(n, 0.004, dur * 0.6) * fade(n, 0.002, 0.03)


def pluck(note, dur=0.3, bright=4500):
    n = int(dur * SR); t = tt(n)
    f = mtof(note)
    x = saw(f, n) * 0.6 + sine(f * 2, n) * 0.3
    return filt(x, 'lp', 300 + bright * np.exp(-t * 28), 1.3) * env(n, 0.001, 0.11) * fade(n)


def bell(note, dur=1.0):
    n = int(dur * SR); t = tt(n)
    f = mtof(note)
    x = sine(f, n) + 0.45 * sine(f * 2.76, n) * np.exp(-t * 6) + 0.25 * sine(f * 5.4, n) * np.exp(-t * 11)
    return x * env(n, 0.002, 0.4) * fade(n)


def riser(dur, f0=300, f1=9000, curve=2.2):
    n = int(dur * SR); t = tt(n); p = t / dur
    x = filt(noise(n), 'bp', f0 * (f1 / f0) ** (p ** 1.4), 1.4) * 1.6
    x += 0.22 * saw(110 * 2 ** (p * 3), n)
    return filt(x, 'lp', 400 + 9000 * p ** 2) * p ** curve * fade(n, 0.01, 0.01)


def whoosh(dur=0.35, f0=500, f1=4500):
    n = int(dur * SR); t = tt(n); p = t / dur
    return filt(noise(n), 'bp', f0 * (f1 / f0) ** np.sin(np.pi * p), 1.1) * np.sin(np.pi * p) ** 2


def impact(dur=1.4, f0=75, f1=32, body=1.0):
    n = int(dur * SR); t = tt(n)
    boom = sine(f1 + (f0 - f1) * np.exp(-t * 7), n) * np.exp(-t * 2.8) * body
    crunch = filt(noise(n), 'lp', 1800 + 6000 * np.exp(-t * 20)) * np.exp(-t * 9) * 0.5
    return np.tanh((boom + crunch) * 1.5) * fade(n, 0.0005, 0.05)


def crash(dur=1.8):
    n = int(dur * SR); t = tt(n)
    return (filt(noise(n), 'hp', 4500) + 0.4 * filt(noise(n), 'bp', 9000, 2)) * np.exp(-t * 2.4) * fade(n, 0.0005, 0.05) * 0.5


def bloop(f0=260, f1=900, dur=0.14):
    n = int(dur * SR); t = tt(n)
    return sine(f0 + (f1 - f0) * (1 - np.exp(-t * 40)), n) * env(n, 0.002, dur / 3.5) * fade(n)


def click(freq=3200, dur=0.02):
    n = int(dur * SR); t = tt(n)
    return (sine(freq, n) * 0.7 + filt(noise(n), 'hp', 5000) * 0.3) * np.exp(-t * 300) * fade(n, 0.0002)


def blip(note, dur=0.06):
    n = int(dur * SR); t = tt(n)
    return (sine(mtof(note), n) + 0.2 * saw(mtof(note), n)) * np.exp(-t * 55) * fade(n, 0.0005)


def glitch(dur=0.3):
    n = int(dur * SR); t = tt(n)
    x = np.zeros(n)
    i = 0
    while i < n:
        seg = int(SR * rng.uniform(0.008, 0.04))
        f = rng.choice([180, 360, 720, 1440, 2900])
        kind = rng.integers(3)
        s = np.sign(sine(f, min(seg, n - i))) if kind == 0 else (noise(min(seg, n - i)) if kind == 1 else np.zeros(min(seg, n - i)))
        x[i:i + seg] = s * rng.uniform(0.3, 1)
        i += seg
    x = np.round(x * 6) / 6
    return filt(x, 'lp', 7000) * fade(n, 0.001, 0.02) * np.exp(-t * 3)


def zap(f0, f1, dur):
    n = int(dur * SR); t = tt(n); p = t / dur
    f = f0 * (f1 / f0) ** p
    x = sine(f, n) * 0.6 + 0.3 * np.sign(sine(f * 0.5, n)) + 0.15 * filt(noise(n), 'bp', f * 2, 2)
    return filt(x, 'lp', 5000) * np.sin(np.pi * np.minimum(1, p * 1.05)) ** 0.5 * fade(n, 0.003, 0.02)


def reverse(x):
    return x[::-1].copy()


# ----------------------------------------------------------------- music bed
# 108 BPM, A minor: Am9 | Fmaj7 | C(add9) | G6 — a quiet groove that steps back for the voice.
BPM = 108
B = 60 / BPM
CH = [([57, 60, 64, 67, 71], 45), ([53, 57, 60, 64, 69], 41), ([48, 55, 60, 62, 67], 48), ([55, 59, 62, 64, 67], 43)]
BREAK = (15.76, 17.76)          # "e também, cara, o que acontece?" — the beat drops out
bar = 4 * B
k = 0
t0 = 0.0
while t0 < DUR:
    notes, root = CH[k % 4]
    in_break = BREAK[0] <= t0 < BREAK[1]
    add('music', pad(notes, bar + 0.25, 900 if in_break else 1600), t0, 0.5, 0.0, rev=0.4)
    for beat in range(4):
        tb = t0 + beat * B
        if tb >= DUR or BREAK[0] - 0.02 <= tb < BREAK[1] - 0.02:
            continue
        if beat in (0, 2) or (beat == 3 and k % 2):
            add('music', kick(), tb, 0.42)
        if beat in (1, 3):
            add('music', clap(), tb, 0.35, 0.05, rev=0.3)
        for h in (0, 0.5):
            add('music', hat(), tb + h * B, 0.12 if h else 0.07, 0.25)
        add('music', bass(root + (7 if beat == 3 and k % 2 else 0) - (12 if root > 46 else 0), B * 0.9), tb, 0.3)
        if tb > 17.7:  # second half lifts with a pluck line
            add('music', pluck(notes[(beat * 2 + k) % 5] + 12, 0.25), tb + 0.5 * B, 0.09, 0.4 * (-1) ** beat, rev=0.4)
    t0 += bar
    k += 1


# ----------------------------------------------------------------- stretch, as edit.js computes it
def hold_xy(t):
    i = min(len(rig['hold']) - 1, int(t * 30))
    h = rig['hold'][i]
    return None if h is None else (h[0] * 1920 - 10, min(h[1] * 1080 - 92 * 1.45, 1080 - 92 - 30))


def stretch(t):
    if t < 11.55 or t > 15:
        return 0.0
    grab = np.clip((t - 11.55) / 0.4, 0, 1)
    grab = 4 * grab ** 3 if grab < .5 else 1 - (-2 * grab + 2) ** 3 / 2
    i = min(int(min(t, 14.28) * 30), len(rig['pinch']) - 1)
    while i > 0 and rig['pinch'][i] is None:
        i -= 1
    P, Bp = rig['pinch'][i], hold_xy(t)
    if P is None or Bp is None:
        return 0.0
    L = np.hypot(P[0] * 1920 - Bp[0], P[1] * 1080 - Bp[1]) * grab
    rel = np.clip((t - 14.28) / 0.57, 0, 1)
    if rel > 0:
        el = 0 if rel <= 0 else 1 if rel >= 1 else 2 ** (-10 * rel) * np.sin((rel * 10 - .75) * 2 * np.pi / 3) + 1
        L *= 1 - el
    return L / (2 * 92)


# ----------------------------------------------------------------- sound effects (times match edit.js)
def fx(sig, t, g, pan=0.0, rev=0.2):
    add('fx', sig, t, g, pan, rev)

# intro + badge
fx(impact(1.3, 90, 34, 1.1), 0.0, 0.75, rev=0.3)
fx(glitch(0.32), 0.0, 0.35)
fx(crash(1.4), 0.0, 0.25)
fx(whoosh(0.3, 700, 5000), 0.18, 0.35, -0.6)
fx(bloop(500, 1100, 0.08), 0.3, 0.2, -0.6, 0.3)
for i in range(19):
    fx(click(3000 + 400 * (i % 3), 0.015), 0.6 + i / 19 * 0.7, 0.07, -0.5)
# ANTHROPIC rises, kicker types, underline + broadcast rings
fx(reverse(whoosh(0.5, 300, 3000)), 0.2, 0.45)
fx(impact(0.9, 110, 50, 0.6), 0.66, 0.35, -0.3)
for i in range(17):
    fx(click(4200, 0.01), 0.75 + i / 17 * 0.5, 0.05, -0.6)
fx(whoosh(0.35, 1500, 7000), 2.02, 0.3, -0.4)
for i in range(3):
    fx(bell(88 - i * 3, 0.9), 2.08 + i * 0.2, 0.08, 0.3 * (i - 1), rev=0.6)
fx(whoosh(0.35, 600, 3000), 2.72, 0.35, -0.3)
# OPUS slam + counter
fx(reverse(crash(0.6)), 2.7, 0.35)
fx(impact(1.8, 70, 30, 1.3), 3.28, 0.9, rev=0.35)
fx(crash(1.6), 3.28, 0.35)
for i in range(4):
    fx(kick(0.2, 220, 90, 1.2), 3.28 + i * 0.045, 0.18, -0.6 + i * 0.1)
for i in range(12):
    fx(blip(76 + i, 0.03), 3.92 + i * 0.03, 0.08, 0.6)
fx(bell(93, 1.2), 4.28, 0.16, 0.6, rev=0.6)
fx(bell(100, 1.0), 4.3, 0.08, 0.6, rev=0.6)
fx(reverse(whoosh(0.4, 400, 4000)), 4.4, 0.4)
# race
fx(whoosh(0.45, 300, 2600), 4.78, 0.45, -0.7)
fx(bloop(400, 900, 0.1), 5.15, 0.18, -0.7, 0.3)
fx(riser(0.95, 250, 8000), 5.92, 0.4, -0.5)
fx(whoosh(0.3, 900, 8000), 6.32, 0.4, -0.6)
fx(impact(1.2, 95, 38, 1.0), 6.88, 0.75, -0.3, 0.3)
fx(filt(noise(int(0.15 * SR)), 'lp', 2500) * np.exp(-tt(int(0.15 * SR)) * 30), 6.88, 0.35, -0.3)
fx(bloop(500, 160, 0.25), 7.1, 0.2, -0.7, 0.3)
for i, m in enumerate((84, 88, 91, 96)):
    fx(bell(m, 0.8), 7.15 + i * 0.04, 0.07, -0.6, rev=0.5)
fx(whoosh(0.35, 2000, 400), 8.2, 0.35, -0.8)
# hologram in the palm
for i, m in enumerate((72, 76, 79, 83, 86, 91)):
    fx(bell(m, 0.9), 8.76 + i * 0.05, 0.06, 0.6, rev=0.6)
fx(riser(0.45, 800, 12000, 1.4), 8.62, 0.18, 0.6)
n = int((15.25 - 8.8) * SR); t = tt(n)
hum = (sine(110, n) * 0.6 + sine(220.6, n) * 0.25 + sine(330.3, n) * 0.1) * (0.75 + 0.25 * np.sin(2 * np.pi * 3.2 * t))
hum *= np.minimum(1, t / 0.4) * fade(n, 0.01, 0.15)
fx(filt(hum, 'lp', 900), 8.8, 0.07, 0.5, 0.2)
fx(click(2600, 0.015), 9.18, 0.1, 0.4)
for i in range(8):
    fx(blip(88 + (i % 3) * 2, 0.025), 9.45 + i * 0.03, 0.05, 0.3)
# stretch: a slide whistle that follows the stretch, then a boing on release
fx(click(1800, 0.03), 11.58, 0.2, 0.0)
t0s, t1s = 11.6, 14.36
n = int((t1s - t0s) * SR); ts = t0s + tt(n)
S = np.interp(ts, np.arange(t0s, t1s + 0.01, 1 / 120), [stretch(x) for x in np.arange(t0s, t1s + 0.01, 1 / 120)])
k = np.clip(S / 3.5, 0, 1)
f = 420 + 1100 * k
f *= 1 + 0.012 * np.sin(2 * np.pi * 6 * tt(n))
whistle = sine(f, n) + 0.08 * filt(noise(n), 'bp', f, 3)
dk = np.abs(np.gradient(signal.savgol_filter(k, 2001, 2), 1 / SR))
amp = np.clip(0.35 + 2.5 * dk, 0, 1) * np.minimum(1, (ts - t0s) / 0.15) * fade(n, 0.01, 0.06)
fx(whistle * amp, t0s, 0.1, -0.1, 0.25)
n = int(0.7 * SR); t = tt(n)
boing = sine(260 * (1 + 0.35 * np.sin(2 * np.pi * 16 * t) * np.exp(-t * 6)) * (1 - 0.3 * t), n) * env(n, 0.003, 0.25)
fx(boing, 14.32, 0.2, 0.1, 0.3)
# vanish
n = int(0.3 * SR); t = tt(n)
fx(sine(300 * 2 ** (t / 0.3 * 2.5), n) * (t / 0.3) ** 2 * fade(n), 14.95, 0.12, 0.5)
fx(reverse(whoosh(0.3, 500, 6000)), 14.95, 0.3, 0.5)
fx(filt(noise(int(0.25 * SR)), 'bp', 900, 0.7) * np.exp(-tt(int(0.25 * SR)) * 18), 15.24, 0.5, 0.5, 0.4)
fx(bloop(900, 140, 0.18), 15.24, 0.25, 0.5, 0.4)
for i in range(7):
    fx(bell(96 + rng.integers(0, 8), 0.4), 15.26 + i * 0.035, 0.035, rng.uniform(-0.2, 0.9), rev=0.6)
# "e também, cara" snap zoom + "?" pops
fx(whoosh(0.22, 400, 6000), 15.6, 0.45)
fx(impact(0.9, 120, 45, 0.7), 15.76, 0.45, rev=0.3)
n = int(0.45 * SR); t = tt(n)
fx(saw(300 * 2 ** (-t / 0.45 * 3), n) * 0.3 * fade(n, 0.002, 0.05), 15.76, 0.12)  # tape stop
for i, (tq, f0, f1) in enumerate(((16.88, 300, 900), (16.98, 400, 1200), (17.12, 500, 1600))):
    fx(bloop(f0, f1, 0.16), tq, 0.28, (-0.6, 0.6, 0.4)[i], 0.3)
# back in: glitch + hit + marquee rows
fx(reverse(crash(0.7)), 17.06, 0.35)
fx(glitch(0.28), 17.7, 0.35)
fx(impact(1.5, 80, 32, 1.2), 17.76, 0.85, rev=0.3)
for i in range(3):
    fx(whoosh(0.4, 400, 3500), 17.74 + i * 0.1, 0.25, (-0.7, 0.7, -0.7)[i])
fx(impact(0.8, 110, 50, 0.6), 18.32, 0.4)
# chips thrown from the hands
fx(whoosh(0.5, 300, 5000), 19.0, 0.4)
for i in range(8):
    fx(bloop(500 + 90 * i, 1200 + 120 * i, 0.09), 19.05 + i * 0.05 + 0.35, 0.13, (-0.8, -0.3, 0.6, 0.9, -0.9, 0.9, -0.6, 0.7)[i], 0.3)
for i in range(8):
    fx(blip(84 - i, 0.04), 20.47 + i * 0.03, 0.05, 0.0)
# benchmark screen
fx(zap(180, 1400, 0.32), 21.5, 0.18, 0.3, 0.3)
fx(click(2200, 0.03), 21.8, 0.2, 0.3)
for i in range(5):
    fx(blip(79 + (0, 3, 5, 7, 10)[i], 0.05), 21.9 + i * 0.1, 0.09, 0.3, 0.3)
    fx(bloop(800, 1600, 0.06), 21.9 + i * 0.1 + 0.45, 0.07, 0.4, 0.3)
for i in range(2):
    fx(blip(91, 0.05), 23.2 + i * 0.11, 0.08, 0.3)
fx(zap(1400, 90, 0.26), 23.52, 0.18, 0.3, 0.3)
fx(click(1500, 0.03), 23.76, 0.18, 0.3)
# é isso mesmo
fx(impact(1.0, 100, 40, 0.8), 23.84, 0.5, 0.4, 0.3)
for i, m in enumerate((84, 88, 91)):
    fx(bell(m, 0.9), 23.86 + i * 0.05, 0.1, 0.4, rev=0.5)
fx(whoosh(0.25, 2000, 600), 24.4, 0.25, 0.4)
# continua + play wipe
fx(bloop(600, 1200, 0.08), 24.66, 0.18, 0.7, 0.3)
fx(riser(0.6, 300, 10000, 1.8), 25.38, 0.45)
fx(whoosh(0.5, 300, 6000), 25.5, 0.5)
fx(impact(0.6, 120, 50, 0.7), 25.92, 0.5)

# ----------------------------------------------------------------- mix
voice = load_voice()
venv = signal.lfilter([0.002], [1, -0.998], np.abs(voice))
venv /= venv.max() + 1e-9
duck = 1 - 0.55 * np.clip(venv * 3, 0, 1)               # music steps back under the voice
fxduck = 1 - 0.25 * np.clip(venv * 3, 0, 1)

ir_n = int(2.0 * SR); irt = tt(ir_n)
ir = np.vstack([filt(noise(ir_n), 'lp', 5000) * np.exp(-irt * 3.2) for _ in range(2)])
ir[:, :int(0.02 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
rev = np.vstack([signal.fftconvolve(BUS['rev'][c], ir[c])[:N] for c in range(2)]) * 0.5

def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)

speech = venv > 0.08
v = voice / (np.sqrt(np.mean(voice[speech] ** 2)) + 1e-9) * 10 ** (-17 / 20)   # voice at -17 dBFS RMS while talking
BUS['music'] = np.vstack([filt(BUS['music'][c], 'hp', 45) for c in range(2)])
music = BUS['music'] / (np.sqrt(np.mean(BUS['music'] ** 2)) + 1e-9) * 10 ** (-31 / 20)
sfx = (BUS['fx'] + rev) / (np.max(np.abs(BUS['fx'] + rev)) + 1e-9) * 10 ** (-8 / 20)
mix = np.vstack([v, v]) + music * duck + sfx * fxduck
mix = np.vstack([filt(mix[c], 'hp', 30) for c in range(2)])
# soft limiter to -1 dBFS
ceil = 10 ** (-1 / 20)
mix = np.tanh(mix / ceil * 0.9) * ceil / np.tanh(0.9) * 0.98
mix = np.clip(mix, -ceil, ceil)
mix[:, -int(0.05 * SR):] *= np.linspace(1, 0, int(0.05 * SR))

pcm = (mix.T * 32767).astype('<i2')
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(f'wrote {OUT}  {DUR:.2f}s  voice {rms_db(v[speech]):.1f} dBFS  music {rms_db(music):.1f}  mix rms {rms_db(mix):.1f}')
