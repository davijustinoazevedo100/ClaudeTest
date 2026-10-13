"""UI sounds, synthesized with numpy, plus the measured peak of each one.

    python3 audio/sfx.py [outdir]        -> outdir/<id>.wav and outdir/peaks.json

The mixer lines up each sound's peak (not its first sample) with the frame it belongs to.
"""
import json
import sys
from pathlib import Path

import numpy as np

from dsp import SR, bandpass, env, fade, fft_filter, highpass, lowpass, peak_index, t_, write_wav

rng = np.random.default_rng(120)


def tone(f, n, decay, attack=0.0008):
    return np.sin(2 * np.pi * f * t_(n)) * env(n, attack, decay)


def noise_burst(n, decay, response):
    return fft_filter(rng.standard_normal(n) * env(n, 0.0002, decay), response)


def norm(x, peak):
    return x / np.abs(x).max() * peak


def click():            # trackpad click: bright tick + a little body
    n = int(0.05 * SR)
    x = noise_burst(n, 0.0011, bandpass(3600, 1.1)) * 0.9 + tone(2900, n, 0.0035) * 0.35 + tone(190, n, 0.011) * 0.45
    return norm(fade(x), 0.5)


def grab():             # pressing onto a draggable thing: softer, lower
    n = int(0.05 * SR)
    x = noise_burst(n, 0.0014, bandpass(2200, 1.4)) * 0.8 + tone(1700, n, 0.004) * 0.3 + tone(160, n, 0.014) * 0.5
    return norm(fade(x), 0.36)


def drop():             # letting go: a short, light tick
    n = int(0.035 * SR)
    x = noise_burst(n, 0.0008, bandpass(4200, 1.2)) * 0.7 + tone(3300, n, 0.0025) * 0.3
    return norm(fade(x), 0.26)


def limit():            # the slider hits max: a dull haptic tock
    n = int(0.08 * SR)
    x = tone(1180, n, 0.012) * 0.6 + tone(240, n, 0.02) * 0.7 + noise_burst(n, 0.001, bandpass(1500, 1.5)) * 0.3
    return norm(fade(x), 0.34)


def toggle():           # a switch: tick, then a lower tock 26 ms later
    n = int(0.09 * SR)
    a = noise_burst(n, 0.0009, bandpass(3800, 1.2)) * 0.8 + tone(3100, n, 0.003) * 0.3
    b = noise_burst(n, 0.0012, bandpass(2000, 1.3)) * 0.6 + tone(210, n, 0.014) * 0.6
    d = int(0.026 * SR)
    x = a.copy()
    x[d:] += b[:n - d]
    return norm(fade(x), 0.48)


def tick(level=0.24):   # hover / snap
    n = int(0.03 * SR)
    x = tone(4600, n, 0.0018) * 0.6 + noise_burst(n, 0.0005, bandpass(6000, 1.0)) * 0.5
    return norm(fade(x), level)


def key(body=310, level=0.42):   # a keyboard key: thocky body + a little rattle
    n = int(0.09 * SR)
    x = (noise_burst(n, 0.0016, bandpass(2600, 0.9)) * 0.55 + tone(body, n, 0.018, 0.0015) * 0.8
         + noise_burst(n, 0.006, highpass(5000)) * 0.12)
    return norm(fade(fft_filter(x, highpass(90))), level)


def enter():            # the return key: bigger and lower
    return key(body=220, level=0.55)


def success():          # loader resolves: two soft sine notes a fifth apart
    n = int(0.42 * SR)
    a = tone(1318.5, n, 0.09, 0.003)
    b = np.zeros(n)
    d = int(0.05 * SR)
    b[d:] = tone(1975.5, n - d, 0.12, 0.003)
    x = fft_filter(a * 0.6 + b * 0.5, lowpass(6000))
    return norm(fade(x, fout=0.05), 0.3)


def pop():              # toast lands: a short pitch-dropping bloop
    n = int(0.12 * SR)
    t = t_(n)
    f = 420 + 380 * np.exp(-t / 0.018)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.04)
    return norm(fade(x), 0.4)


SOUNDS = {
    'click': click, 'grab': grab, 'drop': drop, 'limit': limit, 'toggle': toggle,
    'tick': tick, 'tick-soft': lambda: tick(0.13), 'key': key, 'enter': enter, 'success': success, 'pop': pop,
}

if __name__ == '__main__':
    out = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent / 'sfx')
    out.mkdir(parents=True, exist_ok=True)
    peaks = {}
    for name, make in SOUNDS.items():
        x = make()
        write_wav(out / f'{name}.wav', x)
        peaks[name] = {'peak_s': round(peak_index(x) / SR, 6), 'length_s': round(len(x) / SR, 4)}
    (out / 'peaks.json').write_text(json.dumps(peaks, indent=2))
    print(f'{len(peaks)} UI sounds -> {out}')
    for k, v in peaks.items():
        print(f"  {k:10s} peak at {v['peak_s'] * 1000:5.1f} ms")
