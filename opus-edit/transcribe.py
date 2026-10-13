"""Word timings for the captions (edit.js LINES were taken from this, then hand-corrected).

    pip install sherpa-onnx
    curl -L https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2 | tar xj -C models
    python3 transcribe.py source/input.mp4

Prints "start word" for every word, using the Parakeet TDT 0.6B v3 token timestamps.
"""
import subprocess, sys
import numpy as np
import sherpa_onnx as so

P = 'models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/'
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', sys.argv[1], '-ac', '1', '-ar', '16000', '-f', 's16le', '-'],
                     check=True, capture_output=True).stdout
x = np.frombuffer(raw, '<i2').astype(np.float32) / 32768
rec = so.OfflineRecognizer.from_transducer(encoder=P + 'encoder.int8.onnx', decoder=P + 'decoder.int8.onnx',
                                           joiner=P + 'joiner.int8.onnx', tokens=P + 'tokens.txt',
                                           model_type='nemo_transducer', num_threads=4)
s = rec.create_stream(); s.accept_waveform(16000, x); rec.decode_stream(s)
words = []
for tok, ts in zip(s.result.tokens, s.result.timestamps):
    if tok.startswith((' ', '▁')) or not words:
        words.append([ts, tok.strip(' ▁')])
    else:
        words[-1][1] += tok
for ts, w in words:
    print(f'{ts:6.2f}  {w}')
