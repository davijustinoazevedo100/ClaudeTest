"""The soundtrack: the song's loop bars from the beat grid, looped seamlessly, plus every UI sound
placed so that its measured peak (not its first sample) lands on the time of the event it belongs to.

    python3 audio/mix.py SONG --grid audio/grid.json --events audio/events.json [--out audio/mix.wav]

The loop seam: the last beat crossfades into the audio that precedes the start downbeat in the song,
so the end of the file flows into its beginning exactly as the song does.
"""
import argparse
import json
from pathlib import Path

import numpy as np

from dsp import SR, decode, peak_index, write_wav

here = Path(__file__).parent
ap = argparse.ArgumentParser()
ap.add_argument('song')
ap.add_argument('--grid', default=str(here / 'grid.json'))
ap.add_argument('--events', default=str(here / 'events.json'))
ap.add_argument('--sfx', default=str(here / 'sfx'))
ap.add_argument('--music', type=float, default=0.5, help='music bed gain')
ap.add_argument('--ui', type=float, default=0.8, help='UI sound gain')
ap.add_argument('--out', default=str(here / 'mix.wav'))
a = ap.parse_args()

grid = json.loads(Path(a.grid).read_text())
ev = json.loads(Path(a.events).read_text())
T = ev['T']
assert abs(T - grid['loop']) < 1e-3, f"page loop {T}s does not match the grid's {grid['loop']}s: render events with --beat {grid['beat']}"
n = int(round(T * SR))

# music bed: [offset, offset + T), with the last beat crossfading into the pre-roll
song = decode(a.song)
start = int(round(grid['offset'] * SR))
xf = int(round(min(grid['beat'], 0.5) * SR))
assert start >= xf and start + n <= song.shape[1], 'loop window must leave one beat before it and fit inside the song'
bed = song[:, start:start + n].copy()
u = np.linspace(0, np.pi / 2, xf)
bed[:, n - xf:] = bed[:, n - xf:] * np.cos(u) + song[:, start - xf:start] * np.sin(u)

# UI sounds, peak-aligned, wrapping around the loop
cache = {}
ui = np.zeros((2, n))
report = []
for e in ev['sounds']:
    if e['id'] not in cache:
        x = decode(Path(a.sfx) / f"{e['id']}.wav", mono=True)
        cache[e['id']] = (x, peak_index(x))
    x, p = cache[e['id']]
    ang = (e.get('pan', 0) + 1) * np.pi / 4
    i0 = int(round(e['t'] * SR)) - p
    idx = (i0 + np.arange(len(x))) % n
    np.add.at(ui[0], idx, x * np.cos(ang) * np.sqrt(2))
    np.add.at(ui[1], idx, x * np.sin(ang) * np.sqrt(2))
    report.append((e['t'], e['id'], p / SR * 1000, e.get('pan', 0)))

mix = bed * a.music + ui * a.ui
mix *= 0.89 / np.abs(mix).max()
write_wav(a.out, mix)

# check: every UI sound's peak sits on its event, measured on the UI stem
uim = np.abs(ui).max(axis=0)
worst = 0.0
for t, sid, _, _ in report:
    c = int(round(t * SR))
    win = (c + np.arange(-int(0.004 * SR), int(0.004 * SR) + 1)) % n
    worst = max(worst, abs(int(np.argmax(uim[win])) - int(0.004 * SR)) / SR * 1000)
print(f"{len(report)} UI sounds on a {T:.3f}s loop of {grid['source']} (from {grid['offset']:.3f}s), peaks within {worst:.2f} ms of their events -> {a.out}")
