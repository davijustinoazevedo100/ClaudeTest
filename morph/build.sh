#!/usr/bin/env bash
# Build the loop end to end: beat grid -> UI sounds -> sound events -> mix -> frames -> MP4.
#
#   ./build.sh                          uses audio/song.* if there is one, otherwise the 120 BPM temp track
#   SONG=~/song.mp3 ./build.sh          any song; title/artist come from its tags unless TITLE/ARTIST are set
#   START_BAR=8 ./build.sh              force which bar of the song the loop starts on (0-based)
#   WORKERS=4 ./build.sh                parallel Chromium workers for the frames
set -euo pipefail
cd "$(dirname "$0")"

FRAMES="${FRAMES:-$(mktemp -d)/frames}"
OUT="${OUT:-one-shape.mp4}"
WORKERS="${WORKERS:-3}"
SONG="${SONG:-$(ls audio/song.* 2>/dev/null | head -1 || true)}"

if [ -z "$SONG" ]; then
  echo "▸ no song in audio/: using the 120 BPM temp track"
  python3 audio/temptrack.py audio/temp-track.wav
  SONG=audio/temp-track.wav
  TITLE="${TITLE:-Temp Track}"
  ARTIST="${ARTIST:-120 BPM placeholder}"
fi
tag() { ffprobe -v error -show_entries "format_tags=$1" -of default=nw=1:nk=1 "$SONG" | head -1; }
TITLE="${TITLE:-$(tag title)}"; TITLE="${TITLE:-$(basename "${SONG%.*}")}"
ARTIST="${ARTIST:-$(tag artist)}"; ARTIST="${ARTIST:-Unknown artist}"
DUR="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SONG")"

echo "▸ beat grid"
python3 audio/analyze.py "$SONG" --out audio/grid.json ${START_BAR:+--start-bar "$START_BAR"}
BEAT="$(python3 -c "import json; print(json.load(open('audio/grid.json'))['beat'])")"
PAGE=(--beat "$BEAT" --title "$TITLE" --artist "$ARTIST" --dur "$DUR")

echo "▸ UI sounds";    python3 audio/sfx.py audio/sfx
echo "▸ sound events"; node render.mjs events "${PAGE[@]}"
echo "▸ mix";          python3 audio/mix.py "$SONG"
echo "▸ seam";         node render.mjs check "${PAGE[@]}"
echo "▸ frames";       node render.mjs video --out "$FRAMES" --workers "$WORKERS" "${PAGE[@]}"

# N frames span exactly one loop; nudge the audio by the same (tiny) ratio so the seam lines up
STRETCH="$(python3 -c "import json; print(json.load(open('$FRAMES/timing.json'))['stretch'])")"
echo "▸ encode (audio tempo x$(python3 -c "print(round(1/$STRETCH, 6))"))"
ffmpeg -hide_banner -loglevel error -y -framerate 60 -i "$FRAMES/f%05d.png" -i audio/mix.wav \
  -filter:a "atempo=$(python3 -c "print(1/$STRETCH)"),apad" -t "$(python3 -c "import json; print(json.load(open('$FRAMES/timing.json'))['frames'] / 60)")" \
  -vf "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p" \
  -c:v libx264 -preset slow -crf 14 -tune animation -profile:v high \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -b:a 256k -movflags +faststart "$OUT"
cp "$FRAMES/f00000.png" poster.png
echo "✓ $OUT"
