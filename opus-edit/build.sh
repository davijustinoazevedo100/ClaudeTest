#!/usr/bin/env bash
# Build the edit end to end: track the footage -> sound -> frames -> MP4.
#   ./build.sh                     (≈4 min on 4 cores)
#   WORKERS=8 OUT=x.mp4 ./build.sh
set -euo pipefail
cd "$(dirname "$0")"

SRC="${SRC:-source/input.mp4}"
OUT="${OUT:-opus-5.5-edit.mp4}"
WORKERS="${WORKERS:-4}"

# MediaPipe models (Apache-2.0), fetched once
mkdir -p models work
fetch() { [ -s "models/$1" ] || curl -sSL -o "models/$1" "https://storage.googleapis.com/mediapipe-models/$2"; }
fetch hand_landmarker.task hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task
fetch face_landmarker.task face_landmarker/face_landmarker/float16/latest/face_landmarker.task
fetch selfie_seg.tflite    image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite

echo "▸ track";  python3 analyze.py "$SRC" work 2>/dev/null
echo "▸ rig";    python3 rig.py work/track.json work/rig.json
echo "▸ sound";  python3 sound.py "$SRC" work/rig.json work/mix.wav
echo "▸ frames"; rm -rf work/frames; node render.mjs --out work/frames --workers "$WORKERS"
echo "▸ encode"
ffmpeg -hide_banner -loglevel error -y -framerate 30 -i work/frames/f%04d.png -i work/mix.wav \
  -vf "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p,noise=c0s=3:c0f=t+u" \
  -c:v libx264 -preset slow -crf 19 -profile:v high \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -b:a 256k -movflags +faststart -shortest "$OUT"
echo "✓ $OUT"
