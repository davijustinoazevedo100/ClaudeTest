#!/usr/bin/env bash
# Build the reel end to end: soundtrack -> frames -> MP4.
#   ./build.sh                 full quality (12 motion-blur samples per frame)
#   SAMPLES=1 ./build.sh       fast preview
set -euo pipefail
cd "$(dirname "$0")"

SAMPLES="${SAMPLES:-12}"
WORKERS="${WORKERS:-4}"
FRAMES="${FRAMES:-$(mktemp -d)/frames}"
OUT="${OUT:-volta-showreel-2026.mp4}"
FFMPEG="${FFMPEG:-$(command -v ffmpeg || python3 -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')}"

mkdir -p audio
echo "▸ soundtrack";  python3 audio.py audio/soundtrack.wav
echo "▸ frames ($SAMPLES samples/frame)"; node render.mjs --out "$FRAMES" --samples "$SAMPLES" --workers "$WORKERS"
echo "▸ encode"
"$FFMPEG" -hide_banner -loglevel error -y -framerate 60 -i "$FRAMES/f%04d.png" -i audio/soundtrack.wav \
  -vf "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p,noise=c0s=4:c0f=t+u" \
  -c:v libx264 -preset slow -crf 17 -profile:v high \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -b:a 256k -movflags +faststart -shortest "$OUT"
echo "✓ $OUT"
