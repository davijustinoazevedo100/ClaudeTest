#!/usr/bin/env bash
# Edit a talking-head clip end to end: 30 fps → tracking → graphics → sound → MP4.
#   ./build.sh INPUT.mp4 [OUTPUT.mp4]
# Word timings live in words.json (transcribed once with Whisper, then hand-tuned).
set -euo pipefail
cd "$(dirname "$0")"
IN="$(realpath "$1")"
OUT="${2:-opus-vs-chatgpt-editado.mp4}"
B=build
mkdir -p "$B/models"

GCS=https://storage.googleapis.com/mediapipe-models
[ -f "$B/models/hand_landmarker.task" ] || curl -sSL -o "$B/models/hand_landmarker.task" "$GCS/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"
[ -f "$B/models/face_detector.tflite" ] || curl -sSL -o "$B/models/face_detector.tflite" "$GCS/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"

echo "▸ constant 30 fps"
ffmpeg -v error -y -i "$IN" -vf fps=30 -c:v libx264 -crf 12 -preset fast -an "$B/cfr30.mp4"
echo "▸ voice cleanup"
ffmpeg -v error -y -i "$IN" -vn -af "highpass=f=85,lowpass=f=13000,afftdn=nf=-28:nr=10,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=3200:t=q:w=1.2:g=3,acompressor=threshold=-22dB:ratio=3:attack=4:release=90:makeup=3,loudnorm=I=-16:TP=-2:LRA=9" -ar 48000 -ac 1 "$B/voice.wav"
echo "▸ hand + face tracking"
[ -f track.json ] || python3 track.py "$B/cfr30.mp4" "$B/models" track.json
echo "▸ graphics"
python3 edit.py "$B/cfr30.mp4" track.json words.json "$B/video.mp4" "$B/events.json"
echo "▸ soundtrack"
python3 sound.py "$B/voice.wav" "$B/events.json" "$B/mix.wav"
echo "▸ mux"
ffmpeg -v error -y -i "$B/video.mp4" -i "$B/mix.wav" -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart "$OUT"
echo "✓ $OUT"
