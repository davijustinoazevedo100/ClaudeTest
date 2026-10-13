"""Beat grid for a song with numpy: tempo, beat phase, downbeats, and which bars the loop uses.

    python3 audio/analyze.py song.mp3 [--bars 7] [--start-bar N] [--out audio/grid.json]

Writes {bpm, beat, offset, ...}: `beat` is the measured beat period and `offset` the song time of the
downbeat the animation starts on (bar 1, beat 1).
"""
import argparse
import json
from pathlib import Path

import numpy as np

from dsp import decode

SR, NFFT, HOP = 22050, 1024, 128
FPS = SR / HOP
LATENCY = -0.012   # flux peaks this long before the true onset with this STFT (measured on the temp track's kicks)


def spectrogram(x):
    win = np.hanning(NFFT)
    n = 1 + (len(x) - NFFT) // HOP
    out = np.empty((n, NFFT // 2 + 1), np.float32)
    for a in range(0, n, 4096):
        b = min(n, a + 4096)
        idx = np.arange(NFFT)[None, :] + HOP * np.arange(a, b)[:, None]
        out[a:b] = np.abs(np.fft.rfft(x[idx] * win, axis=1))
    return out


def frame_time(i):
    return (i * HOP + NFFT / 2) / SR


def smooth(x, w):
    k = np.hanning(max(3, int(w)))
    return np.convolve(x, k / k.sum(), mode='same')


def onset_strength(S, fmask):
    L = np.log1p(1000 * S[:, fmask])
    d = np.maximum(0, np.diff(L, axis=0, prepend=L[:1]))
    o = d.sum(axis=1)
    o = np.maximum(0, o - smooth(o, FPS * 0.6))     # remove the slow trend
    return o / (o.max() + 1e-12)


def at(o, t):
    """Onset strength at (fractional) times t, linear interpolation."""
    f = (np.asarray(t) * SR - NFFT / 2) / HOP
    return np.interp(f, np.arange(len(o)), o, left=0, right=0)


def tempo(o, lo=70, hi=180):
    n = len(o)
    r = np.fft.irfft(np.abs(np.fft.rfft(o - o.mean(), 2 * n)) ** 2)[:n]
    r /= r[0]
    bpms = np.arange(lo, hi, 0.01)
    lag = FPS * 60 / bpms
    score = sum(w * np.interp(lag * m, np.arange(n), r) for m, w in ((1, 1.0), (2, 0.5), (4, 0.25)))
    score *= np.exp(-0.5 * (np.log2(bpms / 120) / 0.6) ** 2)  # gentle prior around 120
    return float(bpms[np.argmax(score)])


def fit_grid(o, period, duration):
    """Phase by comb search, then a weighted least-squares fit of t_k = t0 + k*P to the onset peaks."""
    phases = np.arange(0, period, 0.001)
    k = np.arange(int(duration / period))
    combs = [at(o, p + k * period).sum() for p in phases]
    t0 = float(phases[int(np.argmax(combs))])
    for _ in range(3):
        beats = t0 + k * period
        ok = beats < duration - 0.1
        ts, ws, ks = [], [], []
        for kk, tb in zip(k[ok], beats[ok]):
            win = np.arange(tb - 0.06, tb + 0.06, 0.0005)
            v = at(o, win)
            j = int(np.argmax(v))
            if v[j] > 0.1 and 0 < j < len(win) - 1:
                a, b, c = v[j - 1], v[j], v[j + 1]
                off = 0.5 * (a - c) / (a - 2 * b + c + 1e-12)       # parabolic refinement
                ts.append(win[j] + off * 0.0005); ws.append(v[j]); ks.append(kk)
        ts, ws, ks = map(np.array, (ts, ws, ks))
        for _ in range(4):                                          # trim outliers
            A = np.vstack([np.ones_like(ks), ks]).T * np.sqrt(ws)[:, None]
            t0, period = np.linalg.lstsq(A, ts * np.sqrt(ws), rcond=None)[0]
            res = ts - (t0 + ks * period)
            keep = np.abs(res) < max(0.012, 2.5 * np.std(res))
            ts, ws, ks = ts[keep], ws[keep], ks[keep]
        t0 = t0 % period
        k = np.arange(int((duration - t0) / period))
    return float(t0), float(period), float(np.sqrt(np.mean(res[keep] ** 2)) if len(res[keep]) else 0), len(ts)


def chroma_per_beat(S, beats):
    f = np.fft.rfftfreq(NFFT, 1 / SR)
    use = (f > 55) & (f < 2000)
    pc = (np.round(12 * np.log2(f[use] / 440)) % 12).astype(int)
    out = []
    for a, b in zip(beats[:-1], beats[1:]):
        i0, i1 = int((a * SR - NFFT / 2) / HOP), int((b * SR - NFFT / 2) / HOP)
        seg = S[max(0, i0):max(i0 + 1, i1), use].sum(axis=0)
        c = np.bincount(pc, weights=seg, minlength=12)
        out.append(c / (np.linalg.norm(c) + 1e-12))
    return np.array(out)


def z(x):
    x = np.asarray(x, float)
    return (x - x.mean()) / (x.std() + 1e-12)


def analyze(path, bars=7, start_bar=None):
    x = decode(path, SR, mono=True)
    duration = len(x) / SR
    S = spectrogram(x)
    f = np.fft.rfftfreq(NFFT, 1 / SR)
    o = onset_strength(S, f > 30)
    low = onset_strength(S, f < 120)
    mid = onset_strength(S, (f > 1000) & (f < 4000))
    bpm = tempo(o)
    # Beats sit on kicks (low end, plus their click) and snares/claps (mid band). Hi-hats are left out:
    # they usually run on 8ths or offbeats and would pull the grid half a beat off.
    beat_o = low + mid
    t0, period, jitter, used = fit_grid(beat_o / beat_o.max(), 60 / bpm, duration)
    t0 -= LATENCY
    beats = t0 + np.arange(int((duration - t0) / period) + 1) * period
    beats = beats[beats < duration]

    # downbeat: harmonic change and low-end hits line up with bar starts
    chroma = chroma_per_beat(S, beats)
    nov = np.r_[0, 1 - np.sum(chroma[1:] * chroma[:-1], axis=1), 0][:len(beats)]
    lows = np.array([at(low, tb + np.arange(-0.03, 0.03, 0.002)).max() for tb in beats])
    feat = z(nov) + 0.5 * z(lows)
    phase_scores = [float(feat[j::4].mean()) for j in range(4)]
    ph = int(np.argmax(phase_scores))

    # bars and their loudness
    starts = beats[ph::4]
    rms = np.array([np.sqrt(np.mean(x[int(a * SR):int((a + 4 * period) * SR)] ** 2) + 1e-12) for a in starts])
    nb = len(starts) - 1                      # bars that are complete
    cands = [b for b in range(1, nb - bars) if starts[b] + bars * 4 * period < duration - 0.5]
    if start_bar is None:
        db = 20 * np.log10(rms + 1e-12)
        bar_nov = np.r_[0, np.abs(np.diff(db))]
        score = {b: db[b:b + bars].mean() - 0.5 * db[b:b + bars].std() + 0.6 * bar_nov[b] for b in cands}
        start_bar = max(score, key=score.get)
    offset = float(starts[start_bar])
    return {
        'source': Path(path).name, 'duration': round(duration, 3),
        'bpm': round(60 / period, 4), 'beat': round(period, 6),
        'offset': round(offset, 4), 'start_bar': int(start_bar), 'bars': bars, 'loop': round(bars * 4 * period, 6),
        'first_beat': round(t0, 4), 'downbeat_phase': ph, 'downbeat_scores': [round(s, 3) for s in phase_scores],
        'beats_fitted': used, 'jitter_ms': round(jitter * 1000, 2), 'tempo_estimate': bpm,
    }


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('song')
    ap.add_argument('--bars', type=int, default=7)
    ap.add_argument('--start-bar', type=int)
    ap.add_argument('--out', default=str(Path(__file__).parent / 'grid.json'))
    a = ap.parse_args()
    g = analyze(a.song, a.bars, a.start_bar)
    Path(a.out).write_text(json.dumps(g, indent=2))
    print(f"{g['source']}: {g['bpm']} BPM (beat {g['beat'] * 1000:.2f} ms, jitter {g['jitter_ms']} ms over {g['beats_fitted']} beats)")
    print(f"downbeat phase {g['downbeat_phase']} {g['downbeat_scores']}; loop = bars {g['start_bar'] + 1}-{g['start_bar'] + g['bars']} "
          f"from {g['offset']:.3f}s to {g['offset'] + g['loop']:.3f}s -> {a.out}")
