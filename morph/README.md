# One Shape

A 7-bar UI motion loop: one black-and-white shape that never cuts. It morphs through twelve states
on a 120 BPM grid, driven by a cursor that really clicks and drags, and the last frame flows back
into the first.

`one-shape.mp4` is 1440×1440 at 60 fps, with 4 subframes per frame blended for motion blur.
`index.html` is the whole animation: open it in a browser to scrub it (space plays it, ←/→ steps a
frame, clicking jumps to that point in the loop).

> **Soundtrack placeholder.** The current render uses `audio/temptrack.py`, a synthesized 120 BPM
> groove, because the royalty-free song isn't in the repo yet. Drop it at `audio/song.mp3` and run
> `./build.sh`. The beat grid, the loop window, every UI sound and the player's title/artist are
> rebuilt from it.

## The grid

| Bar | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| 1 | **Button**: click *Start listening* | **Loader**: the arc whips round on the beat | **Check** draws itself | **Dynamic island** |
| 2 | Click: island → **player** | Click ▶: play morphs into pause | Grab the playhead: **scrub** | Let go |
| 3 | Bar → **volume slider** (flips white) | Grab the fill | Past max: the pill **stretches** | Let go: it springs back |
| 4 | Fill → **toggle** knob | Click: **flips on**, knob leading edge first | Knob → **tab indicator** | Click *Week*: liquid indicator |
| 5 | Tabs open into a **chart** | The line **draws itself** | Hover: **tooltip** | Slide to the peak |
| 6 | **⌘K** keycap | Blooms into the **palette** | Type `s`, `h` (on the "and") | Type `a`: one row left |
| 7 | Enter: **toast** | The check lands | Toast → **button** | Hover, press… loop |

## How it works

- **A pure function of time.** `seek(t)` computes every style from `t` alone: no CSS transitions,
  no timers, no state carried between frames.
- **Springs are closed-form step responses.** A value that changes target many times is its last
  target plus one spring per change. Each change is also summed from the previous loop, so every
  value is periodic and the seam is continuous in position and speed. `node render.mjs check`
  measures both sides of the seam.
- **Two edges, two springs.** The toggle knob and the tab indicator are a single element (the
  "blob") whose leading edge rides a fast spring and trailing edge a slow one, so it stretches
  ahead and catches up. The same element starts as the progress fill and becomes the volume fill.
- **Direct manipulation.** While the cursor is held, the playhead, volume and rubber-band stretch
  are computed from the cursor's position. On release the stretch springs back from wherever it was,
  with the speed it had.
- **No grey.** Colour flips never cross-fade. The new colour grows inside the shape from the point
  of the action (the playhead, the card's centre, the chosen row), or, for the toggle, sweeps in
  behind the knob. The blob flips inside the same region, so a fill inverts with its track.
- **The camera** zooms per state so each one fills the frame. The cursor lives in screen space but
  rides the world point it touches. Nothing the camera scales has `will-change`, so text
  re-rasterizes sharp at every zoom.
- **Text swaps** inside a morphing container each get their own enter and exit window (blur, fade,
  slight scale), so they never overlap.

## Audio

| Script | What it does |
|---|---|
| `audio/analyze.py` | numpy beat grid. Tempo from the onset autocorrelation. Phase from kicks and snares, not hi-hats. A least-squares fit over all the beats. Downbeats from harmonic change and low-end hits. Then it picks the strongest 7-bar window and writes `audio/grid.json`. |
| `audio/sfx.py` | Synthesizes the UI sounds (clicks, grab and drop, haptic limit, switch, keys, chime, pop) and measures each one's peak. |
| `audio/mix.py` | Cuts the loop from the song and crossfades its last beat into the beat before the start downbeat, so the audio loops too. It places every UI sound so that its measured peak lands on its event, panned toward the cursor. |
| `audio/temptrack.py` | The placeholder groove. The analyzer recovers its tempo to within 0.01 % and its start downbeat to within 2 ms. |

## Build

```sh
./build.sh                           # temp track, or audio/song.* if present
SONG=~/Downloads/song.mp3 ./build.sh # any song; TITLE=… ARTIST=… override its tags
START_BAR=16 ./build.sh              # choose the loop's first bar yourself (0-based)
node render.mjs stills               # one frame per beat into stills/, before a full render
python3 tools/contact.py stills sheet.png --cols 7 --size 300
```

Needs Node with Playwright (Chromium), ffmpeg and Python 3 with numpy.

`render.mjs video` renders 4 subframes per frame, spread over a 180° shutter, in parallel headless
Chromium workers. It pipes them to ffmpeg, where `tmix` averages each group and `select` keeps one
frame per group. N whole frames span exactly one loop, and the encode nudges the audio by the same
ratio, so video and sound loop together.

## Credits

Type: [Geist](https://vercel.com/font) by Vercel, SIL Open Font License (`fonts/Geist-OFL.txt`).
Music: placeholder synthesized in `audio/temptrack.py`. Credit the real track here once it's in.
