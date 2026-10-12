#!/usr/bin/env python3
"""
Soundtrack for the edit: a synthesized 120 BPM beat that ducks under the voice,
plus sound effects placed on every graphic event from edit.py (events.json).

    python3 sound.py VOICE.wav EVENTS.json OUT.wav
"""
import json
import sys
import wave

import numpy as np
from scipy import signal

SR = 48000
rng = np.random.default_rng(55)


# ----------------------------------------------------------------- utilities
def tt(n):
    return np.arange(n) / SR


def mtof(m):
    return 440.0 * 2 ** ((np.asarray(m, float) - 69) / 12)


def sine(freq, n, phase=0.0):
    f = np.broadcast_to(np.asarray(freq, float), (n,))
    return np.sin(2 * np.pi * np.cumsum(f) / SR + phase)


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


def noise(n):
    return rng.standard_normal(n)


def fade(n, fi=0.002, fo=0.01):
    e = np.ones(n)
    k = min(int(fi * SR), n)
    e[:k] = np.linspace(0, 1, k)
    k = min(int(fo * SR), n)
    if k:
        e[-k:] *= np.linspace(1, 0, k)
    return e


def env(n, a=0.002, d=0.2):
    t = tt(n)
    return np.minimum(1, t / a) * np.exp(-np.maximum(t - a, 0) / d)


def filt(x, kind, fc, q=0.707, block=128):
    fc = np.broadcast_to(np.asarray(fc, float), x.shape)
    y = np.empty_like(x)
    zi = np.zeros(2)
    for i in range(0, len(x), block):
        f = float(np.clip(fc[i], 20, SR * 0.45))
        w0 = 2 * np.pi * f / SR
        c, s = np.cos(w0), np.sin(w0)
        al = s / (2 * q)
        if kind == 'lp':
            b = [(1 - c) / 2, 1 - c, (1 - c) / 2]
        elif kind == 'hp':
            b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
        else:
            b = [al, 0, -al]
        a = [1 + al, -2 * c, 1 - al]
        y[i:i + block], zi = signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x[i:i + block], zi=zi)
    return y


# ----------------------------------------------------------------- instruments
def kick(dur=0.45):
    n = int(dur * SR)
    t = tt(n)
    body = sine(48 + 120 * np.exp(-t * 32), n) * np.exp(-t * 7)
    click = filt(noise(n), 'hp', 3000) * np.exp(-t * 400) * 0.4
    return np.tanh((body + click) * 1.8) * fade(n, 0.0005, 0.02)


def clap(dur=0.35):
    n = int(dur * SR)
    t = tt(n)
    nz = filt(noise(n), 'bp', 1500, 0.9)
    e = sum(np.where(t >= o, np.exp(-(t - o) * 250), 0) for o in (0, 0.01, 0.021)) * 0.6
    e += np.where(t >= 0.027, np.exp(-(t - 0.027) * 15), 0)
    return nz * e * 0.5 * fade(n, 0.0005)


def hat(dur=0.06, decay=60):
    n = int(dur * SR)
    return filt(noise(n), 'hp', 8000) * np.exp(-tt(n) * decay) * fade(n, 0.0005)


def sub(note, dur):
    n = int(dur * SR)
    t = tt(n)
    x = sine(mtof(note), n) + 0.25 * sine(mtof(note) * 2, n)
    return np.tanh(x * 1.4) * np.minimum(1, t / 0.01) * np.exp(-t * 1.2) * fade(n, 0.002, 0.04)


def pluck(note, dur=0.3):
    n = int(dur * SR)
    t = tt(n)
    x = saw(mtof(note), n) * 0.6 + sine(mtof(note) * 2, n) * 0.3
    return filt(x, 'lp', 400 + 5000 * np.exp(-t * 28), 1.3) * env(n, 0.001, 0.11) * fade(n)


def pad(notes, dur, fc=1800):
    n = int(dur * SR)
    t = tt(n)
    x = sum(saw(mtof(m) * 2 ** (d / 1200), n) for m in notes for d in (-12, 0, 11))
    x = filt(x, 'lp', fc, 0.8) / (3 * len(notes))
    return x * np.minimum(1, t / 0.15) * np.minimum(1, np.maximum(0, (dur - t) / 0.3))


def bell(note, dur=1.2):
    n = int(dur * SR)
    t = tt(n)
    f = mtof(note)
    x = sine(f, n) + 0.45 * sine(f * 2.76, n) * np.exp(-t * 6) + 0.25 * sine(f * 5.4, n) * np.exp(-t * 11)
    return x * env(n, 0.002, 0.45) * fade(n)


def whoosh(dur=0.35, f0=500, f1=5000):
    n = int(dur * SR)
    p = tt(n) / dur
    return filt(noise(n), 'bp', f0 * (f1 / f0) ** np.sin(np.pi * p), 1.1) * np.sin(np.pi * p) ** 2


def impact(dur=1.6, body=1.0):
    n = int(dur * SR)
    t = tt(n)
    boom = sine(32 + 48 * np.exp(-t * 7), n) * np.exp(-t * 2.6) * body
    crunch = filt(noise(n), 'lp', 1800 + 6000 * np.exp(-t * 20)) * np.exp(-t * 9) * 0.5
    return np.tanh((boom + crunch) * 1.5) * fade(n, 0.0005, 0.05)


def crash(dur=2.2):
    n = int(dur * SR)
    x = filt(noise(n), 'hp', 4500) + 0.4 * filt(noise(n), 'bp', 9000, 2)
    return x * np.exp(-tt(n) * 2.2) * fade(n, 0.0005, 0.05) * 0.5


def riser(dur, f0=300, f1=9000):
    n = int(dur * SR)
    p = tt(n) / dur
    x = filt(noise(n), 'bp', f0 * (f1 / f0) ** (p ** 1.4), 1.4) * 1.6 + 0.25 * saw(120 * 2 ** (p * 3), n)
    return filt(x, 'lp', 400 + 9000 * p ** 2) * p ** 2.5


def pop(f0=300, f1=1100, dur=0.12):
    n = int(dur * SR)
    t = tt(n)
    return sine(f0 + (f1 - f0) * (1 - np.exp(-t * 45)), n) * env(n, 0.001, dur / 3.5) * fade(n)


def thump():
    n = int(0.25 * SR)
    t = tt(n)
    return np.tanh(sine(55 + 90 * np.exp(-t * 40), n) * np.exp(-t * 14) * 1.6) * fade(n, 0.0005)


def glitch(dur=0.18):
    n = int(dur * SR)
    x = np.sign(sine(rng.choice([220, 330, 880, 1760]) * (1 + 0.5 * np.sign(np.sin(tt(n) * 90))), n))
    x = np.round(x * noise(n) * 3) / 3
    return filt(x, 'bp', 2500, 0.7) * fade(n, 0.001, 0.02) * 0.8


def zap(dur):
    n = int(dur * SR)
    t = tt(n)
    crackle = filt(noise(n) * (rng.random(n) < 0.06), 'hp', 1800) * 2.5
    buzz = saw(110 + 15 * np.sin(t * 40), n) * 0.15
    return filt(crackle + buzz, 'lp', 7000) * fade(n, 0.01, 0.08)


def shimmer(base=84):
    out = np.zeros(int(0.9 * SR))
    for i, m in enumerate([0, 4, 7, 12, 16]):
        b = bell(base + m, 0.6) * 0.5
        i0 = int(i * 0.035 * SR)
        out[i0:i0 + len(b)] += b[:len(out) - i0]
    return out


def kaching():
    n = int(0.9 * SR)
    t = tt(n)
    ring = (bell(93, 0.9) + 0.7 * bell(100, 0.9)) * 0.6
    chk = filt(noise(n), 'bp', 5000, 2) * np.exp(-t * 60) * 0.8
    return ring + chk


# ----------------------------------------------------------------- arrange
def main():
    voice_path, events_path, out = sys.argv[1:4]
    ev = json.load(open(events_path))
    T, DUR = ev['T'], ev['dur']
    N = int(DUR * SR)
    bus = {k: np.zeros((2, N)) for k in ('music', 'fx', 'rev')}

    def add(b, sig, t0, gain=1.0, pan=0.0, rev=0.0):
        sig = np.asarray(sig, float)
        a = (np.clip(pan, -1, 1) + 1) * np.pi / 4
        st = np.vstack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)
        i0 = int(round(t0 * SR))
        if i0 < 0:
            st, i0 = st[:, -i0:], 0
        k = min(st.shape[1], N - i0)
        if k <= 0:
            return
        bus[b][:, i0:i0 + k] += st[:, :k] * gain
        if rev:
            bus['rev'][:, i0:i0 + k] += st[:, :k] * gain * rev

    # --- music: Am9 – Fmaj7 – C – G at 120 BPM, groove starts with the voice
    beat = 0.5
    t_in, t_end = T['intro_out'], T['end']
    chords = [([57, 60, 64, 67, 71], 45), ([53, 57, 60, 64], 41), ([48, 55, 60, 64], 36), ([55, 59, 62, 67], 43)]
    gap = (T['vs'] - 0.3, T['vs'] + 0.04)            # pre-drop silence before the VS
    stop = DUR - 0.9                                   # drums stop, final chord rings
    bar = 0
    t = t_in
    while t < stop:
        notes, root = chords[bar % 4]
        card = t >= t_end - 2 * beat
        add('music', pad(notes, min(4 * beat, stop - t) + 0.3, 3200 if card else 2200), t, 0.30, rev=0.3)
        add('music', sub(root - 12, min(4 * beat, stop - t)), t, 0.55)
        for b in range(4):
            tb = t + b * beat
            if gap[0] <= tb < gap[1] or tb >= stop or t_end - 0.5 <= tb < t_end + 0.62:
                continue
            if b in (0, 2):
                add('music', kick(), tb, 0.8)
            if b == 1 and bar % 2 == 1:
                add('music', kick(), tb + 0.75 * beat, 0.5)
            if b in (1, 3):
                add('music', clap(), tb, 0.45, 0.1, rev=0.25)
            for h in range(2):
                add('music', hat(), tb + h * beat / 2, 0.16 if h else 0.1, 0.3)
            arp = notes[(b * 2) % len(notes)] + 12, notes[(b * 2 + 1) % len(notes)] + 12
            add('music', pluck(arp[0]), tb, 0.12, -0.4, rev=0.4)
            add('music', pluck(arp[1]), tb + beat / 2, 0.10, 0.4, rev=0.4)
        bar += 1
        t += 4 * beat
    add('music', pad([45, 57, 60, 64, 67, 71], 1.4, 2600), stop, 0.4, rev=0.5)
    add('music', sub(33, 1.0), stop, 0.6)
    add('music', kick(), stop, 0.9)
    # intro bed: dark swell into the VS slam, then a riser into the groove
    add('music', pad([57, 64, 69, 72], 1.5, 900), 0.0, 0.3, rev=0.4)
    add('music', sub(33, 0.9), 0.6, 0.6)

    # --- effects on graphic events
    fx = lambda *a, **k: add('fx', *a, **k)
    fx(whoosh(0.4), 0.0, 0.5, -0.6)
    fx(whoosh(0.4), 0.08, 0.5, 0.6)
    fx(pop(), 0.3, 0.35, -0.5)
    fx(pop(400, 1300), 0.33, 0.35, 0.5)
    fx(impact(), 0.6, 0.9)
    fx(crash(), 0.6, 0.35, rev=0.3)
    fx(pop(500, 1500, 0.1), 0.78, 0.3)
    fx(glitch(), t_in - 0.1, 0.35)
    fx(whoosh(0.25, 800, 6000), t_in - 0.05, 0.35)

    fx(thump(), T['lancou'] - 0.05, 0.55)
    fx(whoosh(0.3, 700, 5200), T['opus1'] - 0.12, 0.45, 0.6)
    fx(thump(), T['opus1'] - 0.03, 0.6)
    fx(shimmer(84), T['opus1'] + 0.12, 0.25, 0.5, rev=0.5)
    fx(pop(), T['opus1'] + 0.17, 0.3, 0.6)
    fx(whoosh(0.3, 900, 5000), T['e_hoje'] + 0.08, 0.35, 0.8)

    fx(pop(260, 1000, 0.14), T['claude_in'], 0.45, 0.5)
    fx(shimmer(88), T['claude_in'] + 0.05, 0.22, 0.5, rev=0.5)
    fx(pop(500, 1400, 0.1), T['opus2'] - 0.05, 0.3, 0.5)
    fx(pop(260, 1000, 0.14), T['openai_in'], 0.45, -0.5)
    fx(shimmer(83), T['openai_in'] + 0.05, 0.22, -0.5, rev=0.5)
    fx(pop(500, 1400, 0.1), max(T['chatgpt'] - 0.05, T['openai_in'] + 0.15), 0.3, -0.5)

    fx(riser(1.0), T['vs'] - 1.0, 0.35, rev=0.3)
    fx(impact(1.8, 1.1), T['vs'] + 0.04, 1.0)
    fx(crash(), T['vs'] + 0.04, 0.4, rev=0.4)
    fx(zap(T['logos_out'] - T['vs']), T['vs'] + 0.05, 0.22)
    fx(whoosh(0.3, 1200, 6000), T['logos_out'], 0.35)
    fx(pop(900, 300, 0.12), T['logos_out'] + 0.02, 0.3, -0.5)
    fx(pop(900, 300, 0.12), T['logos_out'] + 0.05, 0.3, 0.5)

    fx(thump(), T['fica'] - 0.05, 0.5)
    fx(pop(200, 900, 0.18), T['fica'], 0.35, 0.5)
    fx(thump(), T['voce1'] - 0.04, 0.6)
    fx(whoosh(0.2, 1500, 7000), T['voce1'] - 0.1, 0.3)
    fx(thump(), T['y2026'] - 0.04, 0.5)
    fx(bell(91, 1.4), T['y2026'], 0.3, 0.5, rev=0.6)
    fx(bell(96, 1.4), T['y2026'] + 0.06, 0.22, 0.5, rev=0.6)
    fx(kaching(), T['assinar'] - 0.03, 0.35, 0.5, rev=0.3)
    fx(thump(), T['assinar'] - 0.04, 0.5)

    fx(riser(0.8), t_end - 0.8, 0.25)
    fx(glitch(0.14), t_end - 0.05, 0.3)
    fx(whoosh(0.4), t_end + 0.12, 0.45, -0.6)
    fx(whoosh(0.4), t_end + 0.22, 0.45, 0.6)
    fx(impact(2.0, 1.1), t_end + 0.62, 0.9)
    fx(crash(2.6), t_end + 0.62, 0.4, rev=0.4)
    fx(pop(), t_end + 0.8, 0.3)
    fx(pop(400, 1500), t_end + 1.15, 0.3)
    fx(bell(81, 2.0), t_end + 0.62, 0.22, -0.3, rev=0.7)
    fx(bell(88, 2.0), t_end + 0.66, 0.18, 0.3, rev=0.7)
    fx(crash(1.6), stop, 0.3, rev=0.4)
    fx(shimmer(81), stop + 0.02, 0.2, rev=0.6)

    # --- voice and ducking
    w = wave.open(voice_path)
    v = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float) / 32768
    if w.getnchannels() == 2:
        v = v.reshape(-1, 2).mean(1)
    assert w.getframerate() == SR
    voice = np.zeros(N)
    voice[:min(N, len(v))] = v[:N]
    venv = signal.lfilter([1 - 0.9995], [1, -0.9995], np.abs(voice))
    venv = np.convolve(venv, np.ones(int(0.12 * SR)) / int(0.12 * SR), 'same')
    talk = np.clip(venv / (np.percentile(venv, 92) + 1e-9), 0, 1)
    duck = 1 - 0.72 * talk
    duck = signal.lfilter([0.002], [1, -0.998], duck)
    duck[:int(t_in * SR)] = 1.0

    ir_n = int(2.2 * SR)
    ir = np.vstack([filt(noise(ir_n), 'lp', 5000) * np.exp(-tt(ir_n) * 3.2) for _ in range(2)])
    ir[:, :int(0.02 * SR)] = 0
    ir /= np.sqrt((ir ** 2).sum(1, keepdims=True))
    rev = np.vstack([signal.fftconvolve(bus['rev'][c], ir[c])[:N] for c in range(2)]) * 0.5

    music = bus['music'] / (np.max(np.abs(bus['music'])) + 1e-9)
    fxb = bus['fx'] + rev
    fxb /= np.max(np.abs(fxb)) + 1e-9
    mix = voice[None] * 1.0 + music * duck * 0.30 + fxb * 0.42
    mix = np.vstack([filt(mix[c], 'hp', 30) for c in range(2)])
    mix = np.tanh(mix * 1.3) / np.tanh(1.3)
    mix *= 10 ** (-1.0 / 20) / np.max(np.abs(mix))
    k = int(0.35 * SR)
    mix[:, -k:] *= np.linspace(1, 0, k) ** 2

    pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
    with wave.open(out, 'wb') as o:
        o.setnchannels(2)
        o.setsampwidth(2)
        o.setframerate(SR)
        o.writeframes(pcm.tobytes())
    print(f'wrote {out} ({DUR:.2f}s)')


if __name__ == '__main__':
    main()
