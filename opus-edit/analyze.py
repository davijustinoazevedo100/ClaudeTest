"""Track the footage so the graphics can stick to it.

    python3 analyze.py source/input.mp4 work/

Writes, at a constant 30 fps:
  work/plate/fNNNN.jpg   graded 1920x1080 plate (what the renderer draws under everything)
  work/matte/fNNNN.png   person matte from the selfie segmenter (960x540, soft)
  work/track.json        per-frame hand landmarks (21 pts x 2 hands) and face box, normalised 0..1
Models live in models/ (MediaPipe hand_landmarker.task, face_landmarker.task, selfie_seg.tflite).
"""
import json, os, subprocess, sys
import numpy as np
import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

FPS = 30
src, out = sys.argv[1], sys.argv[2]
models = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
for d in ('plate', 'matte', 'raw'):
    os.makedirs(os.path.join(out, d), exist_ok=True)

# Grade + upscale once with ffmpeg. The webcam image is warm and noisy, so denoise lightly,
# pull the highlights down a touch and push a gentle teal/orange split.
grade = ('hqdn3d=2:2:4:4,'
         'eq=contrast=1.10:saturation=1.15:gamma=0.95,'
         'colorbalance=rs=-0.04:gs=-0.01:bs=0.05:rh=0.04:bh=-0.03,'
         'scale=1920:1080:flags=lanczos,unsharp=5:5:0.6')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vf', f'fps={FPS},{grade}', '-q:v', '2',
                os.path.join(out, 'plate', 'f%04d.jpg')], check=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vf', f'fps={FPS}', '-q:v', '2',
                os.path.join(out, 'raw', 'f%04d.jpg')], check=True)
frames = sorted(os.listdir(os.path.join(out, 'raw')))

hands = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=os.path.join(models, 'hand_landmarker.task')),
    running_mode=vision.RunningMode.VIDEO, num_hands=2,
    min_hand_detection_confidence=0.35, min_hand_presence_confidence=0.35, min_tracking_confidence=0.35))
faces = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=os.path.join(models, 'face_landmarker.task')),
    running_mode=vision.RunningMode.VIDEO, num_faces=1))
seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
    base_options=BaseOptions(model_asset_path=os.path.join(models, 'selfie_seg.tflite')),
    running_mode=vision.RunningMode.VIDEO, output_confidence_masks=True))

track, prev = [], None
for i, name in enumerate(frames):
    bgr = cv2.imread(os.path.join(out, 'raw', name))
    img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    ts = int(i * 1000 / FPS)
    hr = hands.detect_for_video(img, ts)
    fr = faces.detect_for_video(img, ts)
    sr = seg.segment_for_video(img, ts)

    rec = {'hands': [], 'face': None}
    for lm, hd in zip(hr.hand_landmarks, hr.handedness):
        rec['hands'].append({'score': round(hd[0].score, 3),
                             'pts': [[round(p.x, 4), round(p.y, 4)] for p in lm]})
    if fr.face_landmarks:
        pts = np.array([[p.x, p.y] for p in fr.face_landmarks[0]])
        (x0, y0), (x1, y1) = pts.min(0), pts.max(0)
        # 33/263 outer eye corners, 1 nose tip, 13 upper lip
        rec['face'] = {'box': [round(float(v), 4) for v in (x0, y0, x1, y1)],
                       'eyeL': [round(float(v), 4) for v in pts[33]], 'eyeR': [round(float(v), 4) for v in pts[263]],
                       'nose': [round(float(v), 4) for v in pts[1]]}
    track.append(rec)

    # Matte: confidence of the "person" class, lightly temporally smoothed to kill flicker.
    conf = sr.confidence_masks[-1].numpy_view() if len(sr.confidence_masks) > 1 else sr.confidence_masks[0].numpy_view()
    conf = cv2.resize(np.asarray(conf, dtype=np.float32), (960, 540), interpolation=cv2.INTER_LINEAR)
    m = conf if prev is None else 0.6 * conf + 0.4 * prev
    prev = m
    m = cv2.GaussianBlur(np.clip((m - 0.25) / 0.5, 0, 1), (0, 0), 1.6)
    a = (m * 255).astype(np.uint8)   # stored as alpha so the browser can composite with it directly
    cv2.imwrite(os.path.join(out, 'matte', name.replace('.jpg', '.png')), cv2.merge([np.full_like(a, 255)] * 3 + [a]))
    if i % 60 == 0:
        print(f'{i}/{len(frames)}', flush=True)

for task in (hands, faces, seg):
    task.close()
json.dump({'fps': FPS, 'frames': len(frames), 'track': track}, open(os.path.join(out, 'track.json'), 'w'))
print('done', len(frames))
