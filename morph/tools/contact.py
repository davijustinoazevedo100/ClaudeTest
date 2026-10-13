"""Contact sheet of the per-beat stills: python3 tools/contact.py stills sheet.png [--cols 4] [--size 360]"""
import argparse
import glob
import os

from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('out')
ap.add_argument('--cols', type=int, default=4)
ap.add_argument('--size', type=int, default=360)
a = ap.parse_args()

files = sorted(glob.glob(os.path.join(a.src, '*.png')))
rows = (len(files) + a.cols - 1) // a.cols
pad, label = 6, 22
sheet = Image.new('RGB', (a.cols * (a.size + pad) + pad, rows * (a.size + label + pad) + pad), (30, 30, 30))
draw = ImageDraw.Draw(sheet)
font = ImageFont.load_default(size=15)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((a.size, a.size), Image.LANCZOS)
    x = pad + (i % a.cols) * (a.size + pad)
    y = pad + (i // a.cols) * (a.size + label + pad)
    sheet.paste(im, (x, y + label))
    draw.text((x + 2, y + 3), os.path.splitext(os.path.basename(f))[0], fill=(220, 220, 220), font=font)
sheet.save(a.out)
print(f'{len(files)} stills → {a.out} ({sheet.size[0]}x{sheet.size[1]})')
