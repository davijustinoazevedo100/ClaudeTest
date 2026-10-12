"""
Hand + face tracking for edit.py (MediaPipe Tasks).

    python3 track.py SRC_30FPS.mp4 MODELS_DIR track.json
"""
import cv2, json, sys, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
src, models, out_path = sys.argv[1:4]
hl = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=f"{models}/hand_landmarker.task"),
    running_mode=vision.RunningMode.VIDEO, num_hands=2,
    min_hand_detection_confidence=0.3, min_hand_presence_confidence=0.3, min_tracking_confidence=0.3))
fd = vision.FaceDetector.create_from_options(vision.FaceDetectorOptions(
    base_options=BaseOptions(model_asset_path=f"{models}/face_detector.tflite"),
    running_mode=vision.RunningMode.VIDEO, min_detection_confidence=0.4))
cap=cv2.VideoCapture(src); i=0; out=[]
while True:
    ok,fr=cap.read()
    if not ok: break
    h,w=fr.shape[:2]
    img=mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(fr,cv2.COLOR_BGR2RGB))
    ts=int(i*1000/30)
    r=hl.detect_for_video(img,ts)
    hands=[]
    for lm,hd in zip(r.hand_landmarks, r.handedness):
        xs=[p.x*w for p in lm]; ys=[p.y*h for p in lm]
        hands.append({"side":hd[0].category_name,"score":round(hd[0].score,2),
            "cx":round(sum(xs)/21,1),"cy":round(sum(ys)/21,1),
            "x0":round(min(xs),1),"y0":round(min(ys),1),"x1":round(max(xs),1),"y1":round(max(ys),1),
            "pts":[[round(x,1),round(y,1)] for x,y in zip(xs,ys)]})
    f=fd.detect_for_video(img,ts); face=None
    if f.detections:
        b=f.detections[0].bounding_box; face=[b.origin_x,b.origin_y,b.width,b.height]
    out.append({"i":i,"t":round(i/30,3),"hands":hands,"face":face}); i+=1
json.dump(out,open(out_path,"w"))
print(f"tracked {len(out)} frames -> {out_path}")
