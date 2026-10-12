# CLAUDE — Motion Reel 2026

A 15-second motion design showreel. **[▶ claude-motion-reel-2026.mp4](claude-motion-reel-2026.mp4)** · 1920×1080 · 60 fps · stereo

![End card](poster.jpg)

Everything here is made from code. There are no keyframes, footage or samples. Each frame comes from `REEL.renderFrame(ctx, t)`, a pure function of time drawn on a 2D canvas. The soundtrack is synthesized in numpy.

## The cut

At 120 BPM, every cut lands on a beat.

| t | Scene | Shows |
|---|---|---|
| 0.0 | 01 Principles | Bouncing ball with onion skin, a spacing chart, squash & stretch, arcs and anticipation. The ball then expands to fill the frame for the next scene. |
| 1.5 | 02 Typography | Serif italic vs. grotesk black. Letters use masked rises, flips and speed skew, with camera reframes on each hit. The rows then turn into marquees and a bar wipe clears the frame. |
| 3.5 | 03 Systems | 91 tiles morph between polar shapes in staggered waves from moving origins. The camera then zooms through the centre tile. |
| 5.5 | 04 Dimension | 1,600 points morph through sphere → torus → spiral → cube, with tracked callouts and a warp exit. |
| 7.5 | 05 Fluid | A metaball field shaded as topographic bands. The type knocks out wherever the fluid covers it. |
| 9.5 | 06 Timing | A graph editor whose bezier handles spring into an "easy ease", next to a five-lane easing race. The race is sonified, so each ball's pitch follows its curve. |
| 11.5 | 07 Energy | Six quarter-beat cuts: halftone, radial UI, echo type, wireframes, Lissajous and an implosion. |
| 13.0 | 08 Hello | End card. |

Finishing applies 12-sample motion blur (a 180° shutter), lens-style chromatic aberration on hits, camera shake from an impact list, and film grain at encode time.

## Build

```sh
npm install            # playwright (headless Chromium)
pip install numpy scipy pillow
./build.sh             # soundtrack → 900 frames → claude-motion-reel-2026.mp4  (~2.5 min)
SAMPLES=1 ./build.sh   # fast preview without motion blur
```

`ffmpeg` is taken from `PATH`. If it's not there, the build uses `imageio-ffmpeg`.

To watch it live, serve the folder (for example `npx serve .`) and open `index.html`. **Space** plays and pauses, **← / →** step one frame, and clicking scrubs.

## Files

- `reel.js` — every scene, the HUD and the compositor
- `audio.py` — the score and sound design
- `render.mjs` — parallel offline renderer (Playwright)
- `index.html` — live player and render harness
- `fonts/` — Instrument Serif, JetBrains Mono and Inter, all under the SIL Open Font License
