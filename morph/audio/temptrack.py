"""A placeholder groove at exactly 120 BPM, used only until the real song is in audio/.

    python3 audio/temptrack.py [out.wav]

Am - F - C - G, one chord per bar: four-on-the-floor kick, claps on 2 and 4, offbeat hats,
an offbeat bass and a pumping pad. 20 bars, the first two are an intro.
"""
import sys
from pathlib import Path

import numpy as np

from dsp import SR, bandpass, env, fade, fft_filter, highpass, lowpass, t_, write_wav

BPM, BARS = 120, 20
BEAT = 60 / BPM
N = int(BARS * 4 * BEAT * SR)
rng = np.random.default_rng(7)
mix = np.zeros((2, N))
kicks = []


def mtof(m):
    return 440 * 2 ** ((m - 69) / 12)


def add(x, t0, gain=1.0, pan=0.0):
    i = int(round(t0 * SR))
    if i >= N:
        return
    x = x[:N - i]
    a = (pan + 1) * np.pi / 4
    mix[0, i:i + len(x)] += x * gain * np.cos(a) * np.sqrt(2)
    mix[1, i:i + len(x)] += x * gain * np.sin(a) * np.sqrt(2)


def saw(f, n, fmax=4000):
    t = t_(n)
    return sum(np.sin(2 * np.pi * k * f * t) / k for k in range(1, max(2, int(fmax / f)) + 1)) * 0.6


def kick():
    n = int(0.42 * SR)
    t = t_(n)
    f = 46 + 110 * np.exp(-t / 0.035)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.22)
    click = fft_filter(rng.standard_normal(n) * env(n, 0.0002, 0.002), bandpass(3000, 0.8)) * 0.25
    return np.tanh(1.6 * (body + click)) * 0.9


def clap():
    n = int(0.3 * SR)
    x = np.zeros(n)
    for d in (0, 0.011, 0.022):
        i = int(d * SR)
        x[i:] += rng.standard_normal(n - i) * env(n - i, 0.0005, 0.006 if d < 0.02 else 0.11)
    return fft_filter(x, bandpass(1300, 0.9)) * 0.7


def hat(decay):
    n = int((decay * 6 + 0.01) * SR)
    return fft_filter(rng.standard_normal(n) * env(n, 0.0004, decay), highpass(7500, 3)) * 0.5


def crash():
    n = int(2.2 * SR)
    return fft_filter(rng.standard_normal(n) * env(n, 0.002, 0.55), highpass(4500, 2)) * 0.28


def bass(note, dur):
    n = int(dur * SR)
    x = fft_filter(saw(mtof(note), n, 1400), lowpass(520, 2)) + np.sin(2 * np.pi * mtof(note) * t_(n)) * 0.6
    return fade(x * env(n, 0.004, 0.16), fout=0.01)


def pad(notes, dur):
    n = int(dur * SR)
    x = sum(saw(mtof(m) * d, n, 2600) for m in notes for d in (0.997, 1.003))
    a = np.minimum(1, t_(n) / 0.05) * np.minimum(1, (dur - t_(n)) / 0.08)
    return fft_filter(x, lowpass(1600, 2)) * a * 0.09


def pluck(note):
    n = int(0.3 * SR)
    t = t_(n)
    f = mtof(note)
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t)) * env(n, 0.002, 0.09) * 0.22


CHORDS = [(57, [69, 72, 76]), (53, [69, 72, 77]), (48, [67, 72, 76]), (55, [67, 71, 74])]   # Am F C G (root, voicing)
for bar in range(BARS):
    t0 = bar * 4 * BEAT
    root, voicing = CHORDS[bar % 4]
    full = bar >= 2
    if bar % 4 == 2 or bar == 0:
        add(crash(), t0, 0.8 if full else 0.4, 0.2)
    add(pad(voicing, 4 * BEAT), t0, 1.0 if full else 0.7)
    for b in range(4):
        tb = t0 + b * BEAT
        if full:
            add(kick(), tb, 1.0)
            kicks.append(tb)
            if b in (1, 3):
                add(clap(), tb, 0.55, -0.1)
            add(bass(root - 12, BEAT * 0.45), tb + BEAT / 2, 0.55)
        add(hat(0.05), tb + BEAT / 2, 0.55 if full else 0.35, 0.25)
        for s in (1, 3):
            add(hat(0.012), tb + s * BEAT / 4, 0.18, -0.3)
        if bar >= 4:
            arp = voicing + [voicing[1] + 12]
            add(pluck(arp[(bar * 4 + b) % 4] + 12), tb + BEAT * 0.75, 0.6, 0.35)

# sidechain: duck the music under each kick
duck = np.ones(N)
t = t_(N)
for k in kicks:
    i = int(k * SR)
    m = min(N, i + int(0.35 * SR))
    duck[i:m] *= 1 - 0.55 * np.exp(-(t[i:m] - k) / 0.11)
master = np.tanh(mix * duck * 1.2)
master = master / np.abs(master).max() * 0.89

out = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent / 'temp-track.wav')
write_wav(out, master)
print(f'temp track: {BPM} BPM, {BARS} bars, {N / SR:.1f}s -> {out}')
