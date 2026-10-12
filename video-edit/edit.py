#!/usr/bin/env python3
"""
OPUS 5.5 vs CHATGPT 6 ASTRA — talking-head edit with motion graphics.

Every overlay follows the speech (word timings in words.json) and the hands
(MediaPipe tracks in track.json): when the hand on the right of frame says
"esse aqui, o Opus 5.5" it holds the Claude logo; the hand on the left holds
the ChatGPT logo for "ChatGPT 6 Astra".

    python3 edit.py SRC_30FPS.mp4 track.json words.json OUT_VIDEO.mp4 EVENTS.json
"""
import io
import json
import math
import os
import subprocess
import sys
from functools import lru_cache
from multiprocessing import Pool

import cairosvg
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
W, H, FPS = 1920, 1080, 30
SW, SH = 1280, 720
BASE = W / SW
EXTRA = 2.4                         # seconds of end card after the footage

CORAL, CORAL_HI, CREAM = (217, 119, 87), (244, 146, 108), (250, 249, 245)
GREEN, INK, GOLD = (25, 195, 125), (13, 13, 13), (255, 214, 64)
WHITE, BLACK = (255, 255, 255), (0, 0, 0)


def asset(*p):
    return os.path.join(HERE, 'assets', *p)


# ------------------------------------------------------------------ easing
def c01(x):
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def e_out(x, p=3):
    return 1 - (1 - c01(x)) ** p


def e_in(x, p=3):
    return c01(x) ** p


def e_inout(x):
    x = c01(x)
    return 4 * x ** 3 if x < .5 else 1 - (-2 * x + 2) ** 3 / 2


def e_back(x, s=2.2):
    x = c01(x) - 1
    return 1 + (s + 1) * x ** 3 + s * x ** 2


def lerp(a, b, k):
    return a + (b - a) * k


def window(t, t0, t1, fin=0.2, fout=0.2):
    """0→1→0 visibility envelope for [t0, t1]."""
    return min(e_out((t - t0) / fin), 1 - e_in((t - t1 + fout) / fout))


# ------------------------------------------------------------------ data
DATA = {}


def load(track_path, words_path):
    tr = json.load(open(track_path))
    words = json.load(open(words_path))
    n = len(tr)

    def smooth(arr, sigma):
        arr = np.asarray(arr, float)
        ok = ~np.isnan(arr[:, 0])
        idx = np.arange(len(arr))
        out = arr.copy()
        for c in range(arr.shape[1]):
            out[:, c] = np.interp(idx, idx[ok], arr[ok, c])
        k = int(sigma * 3) | 1
        return cv2.GaussianBlur(out.astype(np.float32), (1, k * 2 + 1), sigma).astype(float)

    face = []
    for f in tr:
        if f['face']:
            x, y, w, h = f['face']
            face.append([x + w / 2, y + h * 0.42, w])
        else:
            face.append([np.nan] * 3)
    face = smooth(face, 7)

    # Hands by side of frame (relative to the face), anchored at the palm top.
    sides = {'L': [], 'R': []}
    for i, f in enumerate(tr):
        got = {}
        for hd in f['hands']:
            pts = np.array(hd['pts'])
            palm = pts[[0, 5, 9, 13, 17]].mean(0)
            side = 'R' if palm[0] > face[i][0] else 'L'
            top = pts[:, 1].min()
            if side not in got or top < got[side][1]:
                got[side] = [palm[0], top, pts[:, 0].max() - pts[:, 0].min()]
        for s in 'LR':
            sides[s].append(got.get(s, [np.nan] * 3))
    hands = {s: smooth(v, 3.0) for s, v in sides.items()}
    raw = {s: np.array(v, float) for s, v in sides.items()}
    DATA.update(face=face, hands=hands, raw=raw, n=n, words=words)


def track(name, t):
    arr = DATA['face'] if name == 'face' else DATA['hands'][name]
    i = int(np.clip(round(t * FPS), 0, len(arr) - 1))
    return arr[i]


# ------------------------------------------------------------------ timeline
def word_t(key, which='s'):
    for w in DATA['words']:
        if w.get('key') == key:
            return w[which]
    raise KeyError(key)


def timeline():
    k = lambda key: word_t(key)
    T = dict(
        intro_out=1.38,
        lancou=k('lancou'), opus1=k('opus1'), e_hoje=k('e_hoje'),
        esse1=k('esse1'), opus2=k('opus2'), ou=k('ou'), esse2=k('esse2'),
        chatgpt=k('chatgpt'), astra=k('astra'), melhor=k('melhor'),
        entao=k('entao'), fica=k('fica'), mostrar=k('mostrar'), voce1=k('voce1'),
        qual=k('qual'), y2026=k('y2026'), voce2=k('voce2'), assinar=k('assinar'),
    )
    T['claude_in'] = T['esse1'] - 0.05
    T['openai_in'] = max(T['esse2'] + 0.25, 9.55)
    T['vs'] = T['melhor'] - 0.04
    T['logos_out'] = min(T['entao'] - 0.1, word_t('melhor', 'e') + 0.33)   # hands start to drop
    T['end'] = word_t('assinar', 'e') + 0.25
    T['dur'] = DATA['n'] / FPS + EXTRA
    return T


# ------------------------------------------------------------------ camera
def camera_keys(T):
    # (start, duration, zoom, focus, ease)
    return [
        (0.0, 0.0, 1.12, 'face', e_out),
        (T['intro_out'], 0.25, 1.04, 'face', e_out),
        (T['lancou'] - 0.05, 0.14, 1.16, 'face', e_out),
        (T['opus1'] - 0.03, 0.14, 1.27, 'face_l', e_out),
        (T['e_hoje'], 0.45, 1.0, 'face', e_inout),
        (T['esse1'], 1.4, 1.05, 'R_mid', e_inout),
        (T['ou'], 0.6, 1.0, 'center', e_inout),
        (T['vs'], 0.12, 1.07, 'center', e_out),
        (T['logos_out'], 0.35, 1.0, 'face', e_inout),
        (T['fica'] - 0.05, 0.16, 1.2, 'face', e_out),
        (T['mostrar'], 0.5, 1.06, 'face', e_inout),
        (T['voce1'] - 0.04, 0.12, 1.3, 'face', e_out),
        (T['qual'], 0.45, 1.08, 'face_l', e_inout),
        (T['y2026'] - 0.04, 0.12, 1.16, 'face_l', e_out),
        (T['voce2'], 0.4, 1.06, 'face', e_inout),
        (T['assinar'] - 0.04, 0.12, 1.22, 'face', e_out),
        (T['end'], 0.5, 1.35, 'face', e_in),
    ]


def focus(name, t):
    f = track('face', t)
    if name == 'face':
        return np.array([f[0], f[1]])
    if name == 'face_l':                       # face sits left, room on the right
        return np.array([f[0] + 150, f[1] + 20])
    if name == 'center':
        return np.array([SW / 2, SH / 2])
    if name == 'R_mid':
        h = track('R', t)
        return np.array([(f[0] + h[0]) / 2, SH / 2])
    raise KeyError(name)


SHAKES = []        # (t0, amplitude px, decay /s)


def camera(t, T):
    keys = camera_keys(T)
    z, f = keys[0][2], focus(keys[0][3], t)
    for ts, d, zt, ft, ease in keys[1:]:
        if t < ts:
            break
        a = ease((t - ts) / d) if d > 0 else 1.0
        z = lerp(z, zt, a)
        f = lerp(f, focus(ft, t), a)
    z *= 1 + 0.006 * math.sin(t * 1.3)          # breathing
    s = BASE * z
    hw, hh = W / (2 * s), H / (2 * s)
    fx = np.clip(f[0], hw, SW - hw)
    fy = np.clip(f[1], hh, SH - hh)
    dx = dy = rot = 0.0
    for i, (t0, amp, dec) in enumerate(SHAKES):
        if t >= t0:
            e = amp * math.exp(-(t - t0) * dec)
            dx += e * math.sin((t - t0) * 71 + i * 1.7)
            dy += e * math.cos((t - t0) * 59 + i * 2.3)
            rot += e * 0.035 * math.sin((t - t0) * 47 + i)
    return z, fx, fy, dx, dy, rot


def cam_matrix(t, T):
    z, fx, fy, dx, dy, rot = camera(t, T)
    s = BASE * z
    M = np.array([[s, 0, W / 2 - s * fx + dx], [0, s, H / 2 - s * fy + dy]], np.float64)
    if rot:
        R = cv2.getRotationMatrix2D((W / 2, H / 2), rot, 1.0)
        M = R @ np.vstack([M, [0, 0, 1]])
    return M, z


def to_out(M, p):
    return M @ np.array([p[0], p[1], 1.0])


# ------------------------------------------------------------------ graphics
@lru_cache(None)
def font(size, weight=900, face='mont'):
    if face == 'anton':
        return ImageFont.truetype(asset('fonts', 'Anton-Regular.ttf'), size)
    f = ImageFont.truetype(asset('fonts', 'Montserrat-var.ttf'), size)
    f.set_variation_by_axes([weight])
    return f


def svg_img(path, size, color=None):
    data = open(path, 'rb').read()
    if color:
        data = data.replace(b'currentColor', ('#%02x%02x%02x' % color).encode())
    png = cairosvg.svg2png(bytestring=data, output_width=size, output_height=size)
    return Image.open(io.BytesIO(png)).convert('RGBA')


def blur_rgba(im, sigma):
    a = np.asarray(im).astype(np.float32)
    rgb, al = a[..., :3] * a[..., 3:] / 255.0, a[..., 3:]
    rgb = cv2.GaussianBlur(rgb, (0, 0), sigma)
    al = cv2.GaussianBlur(al, (0, 0), sigma)[..., None]
    out = np.dstack([np.where(al > 0, rgb * 255.0 / np.maximum(al, 1e-3), 0), al])
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA')


def rrect(size, radius, fill, outline=None, width=0):
    im = Image.new('RGBA', size, (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius,
                                         fill=fill, outline=outline, width=width)
    return im


def with_shadow(im, sigma=14, dy=10, alpha=150, glow=None, glow_sigma=26):
    pad = int(max(sigma, glow_sigma if glow else 0) * 3) + dy
    out = Image.new('RGBA', (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
    a = im.getchannel('A')
    if glow:
        g = Image.new('RGBA', im.size, glow + (0,))
        g.putalpha(a)
        layer = Image.new('RGBA', out.size, (0, 0, 0, 0))
        layer.paste(g, (pad, pad))
        out = Image.alpha_composite(out, blur_rgba(layer, glow_sigma))
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0))
    sh.putalpha(a.point(lambda v: v * alpha // 255))
    layer = Image.new('RGBA', out.size, (0, 0, 0, 0))
    layer.paste(sh, (pad, pad + dy))
    out = Image.alpha_composite(out, blur_rgba(layer, sigma))
    out.alpha_composite(im, (pad, pad))
    out.info['pad'] = pad
    return out


@lru_cache(None)
def tile(kind, size=210, glow=True):
    if kind == 'claude':
        t = rrect((size, size), int(size * .25), CREAM + (255,), (255, 255, 255, 255), 4)
        logo = svg_img(asset('logos', 'claude.svg'), int(size * .66))
        g = CORAL
    else:
        t = rrect((size, size), int(size * .25), INK + (255,), (70, 70, 70, 255), 4)
        logo = svg_img(asset('logos', 'openai.svg'), int(size * .62), WHITE)
        g = GREEN
    t.alpha_composite(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
    return with_shadow(t, glow=g if glow else None)


@lru_cache(None)
def emoji(code, size):
    return with_shadow(svg_img(asset('emoji', code + '.svg'), size), sigma=8, dy=6, alpha=110)


@lru_cache(None)
def text(s, size, fill=WHITE, stroke=0, stroke_fill=BLACK, face='mont', weight=900, shadow=True):
    f = font(size, weight, face)
    l, t_, r, b = f.getbbox(s, stroke_width=stroke)
    im = Image.new('RGBA', (r - l + 4, b - t_ + 4), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((2 - l, 2 - t_), s, font=f, fill=fill + (255,),
                            stroke_width=stroke, stroke_fill=stroke_fill + (255,))
    return with_shadow(im, sigma=size * .06, dy=int(size * .07), alpha=170) if shadow else im


@lru_cache(None)
def pill(s, size, bg, fg=WHITE, border=WHITE, face='mont'):
    f = font(size, 900, face)
    l, t_, r, b = f.getbbox(s)
    px, py = int(size * .55), int(size * .32)
    w, h = r - l + px * 2, b - t_ + py * 2
    im = rrect((w, h), h // 2, bg + (255,), border + (255,), max(3, size // 12))
    ImageDraw.Draw(im).text((px - l, py - t_), s, font=f, fill=fg + (255,))
    return with_shadow(im, sigma=10, dy=7, alpha=140)


def paste(canvas, im, cx, cy, scale=1.0, rot=0.0, alpha=1.0):
    if scale <= 0.01 or alpha <= 0.01:
        return
    if abs(scale - 1) > 1e-3:
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.BICUBIC)
    if abs(rot) > 0.05:
        im = im.rotate(rot, Image.BICUBIC, expand=True)
    if alpha < 0.999:
        im = im.copy()
        im.putalpha(im.getchannel('A').point(lambda v: int(v * alpha)))
    x, y = int(round(cx - im.width / 2)), int(round(cy - im.height / 2))
    sx, sy = max(0, -x), max(0, -y)
    ex, ey = min(im.width, canvas.width - x), min(im.height, canvas.height - y)
    if ex <= sx or ey <= sy:
        return
    canvas.alpha_composite(im.crop((sx, sy, ex, ey)) if (sx or sy or ex < im.width or ey < im.height) else im,
                           (x + sx, y + sy))


# ------------------------------------------------------------------ captions
CAP_SIZE, CAP_Y = 80, 945
STYLE = {'claude': CORAL_HI, 'openai': GREEN, 'gold': GOLD}


def caption_chunks():
    words = [w for w in DATA['words'] if w.get('cap', True)]
    chunks, cur = [], []
    for w in words:
        cur.append(w)
        if w.get('br'):
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    return chunks


def draw_captions(cv, t, T):
    if t >= T['end']:
        return
    chunks = caption_chunks()
    for ci, ch in enumerate(chunks):
        t0 = ch[0]['s'] - 0.04
        t1 = chunks[ci + 1][0]['s'] - 0.04 if ci + 1 < len(chunks) else T['end']
        if not (t0 <= t < t1):
            continue
        imgs = []
        for j, w in enumerate(ch):
            nxt = ch[j + 1]['s'] if j + 1 < len(ch) else t1
            active = w['s'] - 0.03 <= t < max(w['e'], nxt - 0.02) + 0.02
            spoken = t >= w['s'] - 0.03
            col = STYLE.get(w.get('style'), GOLD if active else WHITE)
            if w.get('style') and not spoken:
                col = WHITE
            imgs.append((w, text(w['w'].upper(), CAP_SIZE, col, stroke=9), active))
        gap = int(CAP_SIZE * .32)
        widths = [im.width - 2 * im.info['pad'] for _, im, _ in imgs]
        total = sum(widths) + gap * (len(imgs) - 1)
        x = W / 2 - total / 2
        for (w, im, active), wd in zip(imgs, widths):
            k = (t - (w['s'] - 0.03)) / 0.17
            if k >= 0:
                sc = (0.55 + 0.45 * e_back(k, 2.6)) * (1.07 if active else 1.0)
                dy = (1 - e_out(k)) * 24
                paste(cv, im, x + wd / 2, CAP_Y + dy, sc, 0, c01(k * 3))
            x += wd + gap


# ------------------------------------------------------------------ scenes
def burst(cv, cx, cy, t, t0, color, r0=70, r1=290, n=12, dur=0.45, seed=0):
    k = (t - t0) / dur
    if not 0 <= k <= 1:
        return
    d = ImageDraw.Draw(cv)
    r = lerp(r0, r1, e_out(k))
    a = int(255 * (1 - k))
    wdt = max(2, int(14 * (1 - k)))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color + (a,), width=wdt)
    rng = np.random.default_rng(seed)
    for i in range(n):
        ang = i / n * 2 * math.pi + rng.uniform(-.15, .15)
        l0 = lerp(r0 * .9, r1 * 1.05, e_out(k, 4))
        l1 = l0 + lerp(70, 8, k)
        d.line([cx + math.cos(ang) * l0, cy + math.sin(ang) * l0,
                cx + math.cos(ang) * l1, cy + math.sin(ang) * l1],
               fill=(color if i % 2 else WHITE) + (a,), width=max(2, int(9 * (1 - k))))


def hand_logo_pos(side, t, M):
    h = track(side, t)
    p = to_out(M, (h[0], h[1]))
    return p[0], max(p[1] - 150, 270)


def draw_hand_logo(cv, glow, t, T, side, kind, t_in, t_label, label, t_out):
    if not t_in <= t < t_out + 0.3:
        return None
    M = DATA['M']
    x, y = hand_logo_pos(side, min(t, t_out - 0.05), M)     # hold still while leaving
    k_in = (t - t_in) / 0.42
    k_out = (t - t_out) / 0.26
    sc = e_back(k_in, 2.4) * (1 - e_in(k_out, 2)) * (1 + 0.3 * math.sin(math.pi * c01(k_out)))
    rot = (1 - e_out(k_in)) * -140 + 4 * math.sin((t - t_in) * 4.2)
    y += 7 * math.sin((t - t_in) * 6.6)
    col = CORAL if kind == 'claude' else GREEN
    burst(cv, x, y, t, t_in, col, seed=len(kind))
    burst(cv, x, y, t, t_out, WHITE, r0=40, r1=220, n=10, dur=0.3, seed=3)
    # orbiting sparkles
    if sc > 0.2:
        d = ImageDraw.Draw(glow)
        for i in range(5):
            a = (t - t_in) * 2.2 + i * 2 * math.pi / 5
            r = 150 * sc
            px, py = x + math.cos(a) * r, y + math.sin(a) * r * .55
            s = 5 + 3 * math.sin(t * 9 + i)
            d.ellipse([px - s, py - s, px + s, py + s], fill=col + (230,))
    paste(cv, tile(kind), x, y, sc, rot)
    kl = (t - t_label) / 0.3
    if kl >= 0:
        ls = e_back(kl, 2.8) * (1 - e_in(k_out, 2))
        im = pill(label, 54, CORAL if kind == 'claude' else INK,
                  border=WHITE if kind == 'claude' else GREEN)
        paste(cv, im, x, y - 160 + (1 - e_out(kl)) * 30, ls, 0)
    return x, y, sc


def lightning(d, a, b, t, color, seed):
    rng = np.random.default_rng(seed + int(t * 15))
    pts = [np.array(a, float), np.array(b, float)]
    for _ in range(5):
        new = [pts[0]]
        for p, q in zip(pts[:-1], pts[1:]):
            m = (p + q) / 2
            n = np.array([-(q - p)[1], (q - p)[0]])
            n /= np.linalg.norm(n) + 1e-6
            m += n * rng.normal(0, np.linalg.norm(q - p) * .12)
            new += [m, q]
        pts = new
    flat = [tuple(p) for p in pts]
    d.line(flat, fill=color, width=14, joint='curve')
    d.line(flat, fill=(255, 255, 255, 255), width=5, joint='curve')


def scene_intro(cv, glow, t, T):
    if t >= T['intro_out'] + 0.05:
        return
    cx, cy = W / 2, 470
    kL, kR = (t - 0.04) / 0.36, (t - 0.12) / 0.36
    paste(cv, tile('claude', 250), lerp(-300, cx - 470, e_back(kL, 1.6)), cy, 1, (1 - e_out(kL)) * 40)
    paste(cv, tile('openai', 250), lerp(W + 300, cx + 470, e_back(kR, 1.6)), cy, 1, -(1 - e_out(kR)) * 40)
    kl = (t - 0.3) / 0.3
    if kl >= 0:
        paste(cv, pill('OPUS 5.5', 46, CORAL), cx - 470, cy + 190 + (1 - e_out(kl)) * 40, e_back(kl))
        paste(cv, pill('CHATGPT 6 ASTRA', 46, INK, border=GREEN), cx + 470, cy + 190 + (1 - e_out(kl)) * 40, e_back(kl))
    kv = (t - 0.46) / 0.14
    if kv >= 0:
        sc = lerp(3.2, 1.0, e_out(kv, 2))
        paste(cv, text('VS', 230, GOLD, stroke=12, face='anton'), cx, cy - 10, sc, -6, c01(kv * 2))
        burst(cv, cx, cy, t, 0.6, GOLD, r0=80, r1=420, n=16, dur=0.5)
        paste(cv, emoji('26a1', 120), cx - 150, cy - 140, e_back((t - 0.62) / 0.3), -18)
        paste(cv, emoji('26a1', 120), cx + 150, cy + 120, e_back((t - 0.68) / 0.3), 160)
    kq = (t - 0.78) / 0.3
    if kq >= 0:
        paste(cv, text('QUAL É MELHOR?', 72, WHITE, stroke=9), cx, 860 + (1 - e_out(kq)) * 30, e_back(kq, 2), 0, c01(kq * 3))


def scene_launch(cv, glow, t, T):
    t0, t1 = T['opus1'] - 0.05, T['e_hoje'] + 0.1
    if not t0 <= t < t1 + 0.3:
        return
    k = (t - t0) / 0.32
    ko = (t - t1) / 0.25
    x = lerp(W + 400, 1500, e_back(k, 1.4)) + e_in(ko, 2) * 900
    y = 400
    paste(cv, tile('claude', 230), x, y, 1, (1 - e_out(k)) * -25 + 3 * math.sin(t * 5))
    paste(cv, text('OPUS 5.5', 108, CORAL_HI, stroke=10, face='anton'), x, y + 205, 1, -3)
    kb = (t - t0 - 0.22) / 0.3
    if kb >= 0:
        paste(cv, pill('LANÇOU HOJE', 42, WHITE, fg=INK, border=CORAL), x - 30, y - 170, e_back(kb, 3), 5)
        paste(cv, emoji('1f680', 96), x + 200, y - 190, e_back(kb - .2, 3), 10 * math.sin(t * 6))
    if k < 1:
        burst(cv, x, y, t, t0 + 0.18, CORAL, r1=320)


def scene_vs(cv, glow, t, T, pL, pR):
    t0, t1 = T['vs'], T['logos_out']
    if not t0 <= t < t1 + 0.1 or pL is None or pR is None:
        return
    k = (t - t0) / 0.16
    ko = (t - t1) / 0.18
    vis = 1 - e_in(ko)
    vx = (pL[0] + pR[0]) / 2
    vy = 760
    d = ImageDraw.Draw(glow)
    if vis > 0.3 and (int(t * FPS) % 3 != 2):
        lightning(d, (pL[0] + 60, pL[1] + 40), (vx - 90, vy - 20), t, (120, 255, 190, 255), 1)
        lightning(d, (pR[0] - 60, pR[1] + 40), (vx + 90, vy - 20), t, (255, 170, 120, 255), 2)
    sc = lerp(3.0, 1.0, e_out(k, 2)) * vis
    paste(cv, text('VS', 190, GOLD, stroke=12, face='anton'), vx, vy, sc, -7 + 2 * math.sin(t * 13))
    paste(cv, emoji('26a1', 96), vx + 125, vy - 70, e_back((t - t0 - .1) / .3) * vis, 15)
    burst(cv, vx, vy, t, t0 + 0.05, GOLD, r0=60, r1=380, n=14, dur=0.5)


def scene_sticker(cv, t, t0, t1, code, x, y, size=150, rot=0):
    if not t0 <= t < t1 + 0.25:
        return
    k = (t - t0) / 0.35
    ko = (t - t1) / 0.22
    paste(cv, emoji(code, size), x, y + 6 * math.sin(t * 7), e_back(k, 3) * (1 - e_in(ko, 2)),
          rot + 8 * math.sin(t * 5))


def scene_2026(cv, glow, t, T):
    t0, t1 = T['y2026'] - 0.06, T['voce2'] + 0.05
    if not t0 <= t < t1 + 0.3:
        return
    k = (t - t0) / 0.3
    ko = (t - t1) / 0.22
    vis = 1 - e_in(ko, 2)
    x, y = 1490, 420
    paste(cv, text('2026', 210, GOLD, stroke=12, face='anton'), x, y, e_back(k, 2.2) * vis, -4 + 2 * math.sin(t * 4))
    paste(cv, emoji('1f3c6', 170), x, y - 210, e_back((t - t0 - .12) / .35, 3) * vis, 8 * math.sin(t * 5))
    paste(cv, pill('MELHOR OPÇÃO', 48, GOLD, fg=INK, border=WHITE), x, y + 170, e_back((t - t0 - .2) / .3, 3) * vis, 3)
    burst(cv, x, y, t, t0 + .05, GOLD, r1=360, n=16)


def scene_end(cv, glow, t, T):
    t0 = T['end']
    if t < t0:
        return
    grp = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    _scene_end(grp, t, T)
    z = 1 + 0.035 * e_inout((t - t0 - 0.6) / 2.0)
    paste(cv, grp, W / 2, H / 2, z)


def _scene_end(cv, t, T):
    t0 = T['end']
    cx, cy = W / 2, 440
    k1, k2 = (t - t0 - .15) / .4, (t - t0 - .25) / .4
    paste(cv, tile('claude', 240), lerp(-300, cx - 430, e_back(k1, 1.5)), cy, 1, (1 - e_out(k1)) * 50 + 4 * math.sin(t * 3))
    paste(cv, tile('openai', 240), lerp(W + 300, cx + 430, e_back(k2, 1.5)), cy, 1, -(1 - e_out(k2)) * 50 - 4 * math.sin(t * 3))
    kl = (t - t0 - .4) / .3
    if kl >= 0:
        paste(cv, pill('OPUS 5.5', 40, CORAL), cx - 430, cy + 175, e_back(kl, 3))
        paste(cv, pill('CHATGPT 6 ASTRA', 40, INK, border=GREEN), cx + 430, cy + 175, e_back(kl - .08, 3))
    kv = (t - t0 - .55) / .14
    if kv >= 0:
        paste(cv, text('VS', 200, GOLD, stroke=12, face='anton'), cx, cy, lerp(3, 1, e_out(kv, 2)), -6)
        burst(cv, cx, cy, t, t0 + .62, GOLD, r1=420, n=16)
    kq = (t - t0 - .8) / .35
    if kq >= 0:
        paste(cv, text('QUEM VENCE?', 120, WHITE, stroke=12, face='anton'), cx, 760 + (1 - e_out(kq)) * 40, e_back(kq, 2))
    kc = (t - t0 - 1.15) / .35
    if kc >= 0:
        paste(cv, pill('COMENTA AQUI', 44, GOLD, fg=INK), cx - 40, 915, e_back(kc, 3))
        paste(cv, emoji('1f447', 96), cx + 255, 910 + 10 * math.sin(t * 8), e_back(kc - .15, 3))


# ------------------------------------------------------------------ frame
GRADE = None


def grade_luts():
    x = np.arange(256) / 255.0
    s = 0.5 + (x - 0.5) * 1.1
    s = np.clip(s, 0, 1) ** 1.03
    r = np.clip(s * 1.025 + 0.005, 0, 1)
    b = np.clip(s * 0.97, 0, 1)
    lut = np.stack([b, s, r], 1) * 255
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    rr = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    vig = (1 - 0.3 * np.clip(rr - 0.35, 0, None) ** 1.6)[..., None]
    return lut.astype(np.float32), vig.astype(np.float32)


def grade(img):
    lut, vig = GRADE
    f = np.empty(img.shape, np.float32)
    for c in range(3):
        f[..., c] = lut[img[..., c], c]
    g = f.mean(2, keepdims=True)
    f = g + (f - g) * 1.18
    bl = cv2.GaussianBlur(f, (0, 0), 1.3)
    f = f * 1.45 - bl * 0.45
    return f * vig


def glitch(img, t, amt, seed):
    rng = np.random.default_rng(seed)
    out = img.copy()
    sh = int(18 * amt)
    out[..., 2] = np.roll(img[..., 2], sh, 1)
    out[..., 0] = np.roll(img[..., 0], -sh, 1)
    for _ in range(int(10 * amt)):
        y0 = rng.integers(0, H - 40)
        hgt = rng.integers(8, 70)
        out[y0:y0 + hgt] = np.roll(out[y0:y0 + hgt], rng.integers(-120, 120), 1)
    return out


def render(i):
    T = DATA['T']
    t = i / FPS
    src = DATA['frames'][min(i, len(DATA['frames']) - 1)]
    M, z = cam_matrix(t, T)
    DATA['M'] = M
    # zoom blur on fast punches
    M2, z2 = cam_matrix(t - 0.5 / FPS, T)
    if abs(z2 - z) > 0.012:
        acc = np.zeros((H, W, 3), np.float32)
        for a in np.linspace(0, 1, 5):
            Ma = lerp(M2, M, a)
            acc += cv2.warpAffine(src, Ma, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT101)
        frame = (acc / 5).astype(np.uint8)
    else:
        frame = cv2.warpAffine(src, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT101)
    f = grade(frame)

    # backgrounds for intro / end card
    if t < T['intro_out']:
        k = 1 - e_in((t - T['intro_out'] + 0.12) / 0.12)
        bg = cv2.GaussianBlur(f, (0, 0), 22) * 0.38
        f = lerp(f, bg, k)
    if t >= T['end']:
        k = e_out((t - T['end']) / 0.35)
        bg = cv2.GaussianBlur(f, (0, 0), 1 + 24 * k) * lerp(1, 0.36, k)
        f = bg

    # split tint during VS
    if T['vs'] <= t < T['logos_out'] + 0.2:
        k = window(t, T['vs'], T['logos_out'] + 0.2, 0.1, 0.25) * 0.16
        ramp = np.linspace(0, 1, W, dtype=np.float32)[None, :, None]
        tint = np.array(GREEN[::-1], np.float32) * (1 - ramp) + np.array(CORAL[::-1], np.float32) * ramp
        f = f * (1 - k) + tint * k

    cv = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    scene_intro(cv, glow, t, T)
    scene_launch(cv, glow, t, T)
    pR = draw_hand_logo(cv, glow, t, T, 'R', 'claude', T['claude_in'], T['opus2'] - 0.05, 'OPUS 5.5', T['logos_out'])
    pL = draw_hand_logo(cv, glow, t, T, 'L', 'openai', T['openai_in'], max(T['chatgpt'] - 0.05, T['openai_in'] + 0.15),
                        'CHATGPT 6 ASTRA', T['logos_out'])
    scene_vs(cv, glow, t, T, pL, pR)
    fx = to_out(M, track('face', t)[:2])
    scene_sticker(cv, t, T['fica'], T['mostrar'] - 0.1, '1f440', min(fx[0] + 330, W - 150), max(fx[1] - 200, 140), 160, -8)
    scene_2026(cv, glow, t, T)
    scene_sticker(cv, t, T['assinar'] - 0.05, T['end'], '1f4b3', 1500, 430, 210, -10)
    scene_sticker(cv, t, T['assinar'] + 0.1, T['end'], '1f914', 1650, 250, 130, 12)
    draw_captions(cv, t, T)
    scene_end(cv, glow, t, T)

    g = np.asarray(glow).astype(np.float32)
    if g[..., 3].any():
        gl = g[..., 2::-1] * (g[..., 3:] / 255.0)
        f = f + cv2.GaussianBlur(gl, (0, 0), 9) * 1.6 + gl * 0.9
    o = np.asarray(cv).astype(np.float32)
    a = o[..., 3:] / 255.0
    f = f * (1 - a) + o[..., 2::-1] * a

    # flashes on impacts
    for tf, dur, amt in DATA['flashes']:
        if tf <= t < tf + dur:
            f = lerp(f, 255.0, amt * (1 - (t - tf) / dur))
    out = np.clip(f, 0, 255).astype(np.uint8)
    for tg, dur, amt in DATA['glitches']:
        if tg <= t < tg + dur:
            out = glitch(out, t, amt * (1 - 0.5 * (t - tg) / dur), i)
    if t > T['dur'] - 0.35:
        out = (out * c01((T['dur'] - t) / 0.35)).astype(np.uint8)
    return out.tobytes()


def init_worker():
    global GRADE
    GRADE = grade_luts()


def main():
    src, track_path, words_path, out, events_path = sys.argv[1:6]
    load(track_path, words_path)
    T = timeline()
    cap = cv2.VideoCapture(src)
    frames = []
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        frames.append(fr)
    DATA['frames'] = frames
    DATA['T'] = T
    SHAKES.extend([
        (0.6, 16, 9), (T['opus1'], 7, 10), (T['claude_in'] + 0.1, 5, 10), (T['openai_in'] + 0.1, 5, 10),
        (T['vs'] + 0.05, 20, 7), (T['voce1'], 8, 10), (T['y2026'], 9, 9), (T['end'] + 0.62, 14, 8),
    ])
    DATA['flashes'] = [(0.0, 0.12, 0.9), (0.6, 0.08, 0.5), (T['intro_out'], 0.06, 0.35),
                       (T['vs'] + 0.04, 0.1, 0.55), (T['end'] + 0.62, 0.08, 0.4)]
    DATA['glitches'] = [(T['intro_out'] - 0.1, 0.16, 1.0), (T['end'] - 0.05, 0.12, 0.8)]
    json.dump({'T': T, 'shakes': SHAKES, 'dur': T['dur']}, open(events_path, 'w'), indent=1)

    n = int(round(T['dur'] * FPS))
    only = os.environ.get('ONLY')            # e.g. ONLY=300 renders a single still
    if only:
        init_worker()
        for spec in only.split(','):
            i = int(spec)
            img = np.frombuffer(render(i), np.uint8).reshape(H, W, 3)
            cv2.imwrite(f'{out}_{i:04d}.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 90])
        return
    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24',
                           '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', out],
                          stdin=subprocess.PIPE)
    with Pool(int(os.environ.get('WORKERS', os.cpu_count())), initializer=init_worker) as pool:
        for k, buf in enumerate(pool.imap(render, range(n), chunksize=4)):
            ff.stdin.write(buf)
            if k % 60 == 0:
                print(f'  frame {k}/{n}', flush=True)
    ff.stdin.close()
    ff.wait()


if __name__ == '__main__':
    main()
