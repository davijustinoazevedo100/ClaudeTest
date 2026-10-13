"""numpy-only DSP helpers shared by the audio scripts (no scipy needed)."""
import subprocess
import wave

import numpy as np

SR = 48000


def decode(path, sr=SR, mono=False):
    """Any audio file -> float32 array, (n,) if mono else (2, n), via ffmpeg."""
    ch = 1 if mono else 2
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', str(ch), '-ar', str(sr), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).reshape(-1, ch).T.astype(np.float64)
    return x[0] if mono else x


def write_wav(path, x, sr=SR):
    x = np.atleast_2d(x)
    pcm = (np.clip(x, -1, 1) * 32767).round().astype('<i2').T.copy()
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(x.shape[0])
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def t_(n, sr=SR):
    return np.arange(n) / sr


def fft_filter(x, response, sr=SR):
    """Zero-phase filter: multiply the spectrum by response(freqs)."""
    n = x.shape[-1]
    m = 1 << int(np.ceil(np.log2(max(n, 2)))) + 1
    f = np.fft.rfftfreq(m, 1 / sr)
    return np.fft.irfft(np.fft.rfft(x, m) * response(f), m)[..., :n]


def lowpass(fc, order=2):
    return lambda f: 1 / np.sqrt(1 + (f / fc) ** (2 * order))


def highpass(fc, order=2):
    return lambda f: 1 / np.sqrt(1 + (fc / np.maximum(f, 1e-9)) ** (2 * order))


def bandpass(fc, q):
    return lambda f: 1 / np.sqrt(1 + q * q * (f / fc - fc / np.maximum(f, 1e-9)) ** 2)


def env(n, attack=0.001, decay=0.1, sr=SR):
    t = t_(n, sr)
    return np.minimum(1, t / max(attack, 1e-6)) * np.exp(-np.maximum(0, t - attack) / decay)


def fade(x, fin=0.0005, fout=0.004, sr=SR):
    x = np.array(x, dtype=np.float64)
    a, b = int(fin * sr), int(fout * sr)
    if a:
        x[..., :a] *= np.linspace(0, 1, a)
    if b:
        x[..., -b:] *= np.linspace(1, 0, b)
    return x


def peak_index(x):
    """Sample index of the largest absolute value: where a sound 'lands'."""
    return int(np.argmax(np.abs(np.atleast_2d(x)).max(axis=0)))
