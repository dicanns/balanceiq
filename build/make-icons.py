#!/usr/bin/env python3
"""
BalanceIQ icon generator.
Produces build/icon.png (1024x1024), build/icon.icns (Mac), build/icon.ico (Windows).
Run from the project root: python3 build/make-icons.py
"""

import os
import subprocess
import shutil
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = os.path.dirname(os.path.abspath(__file__))  # balanceiq/build/

# ── Colours ───────────────────────────────────────────────────────────────────
C1 = (249, 115, 22)   # #f97316  top-left
C2 = (234,  88, 12)   # #ea580c  bottom-right
WHITE = (255, 255, 255, 255)

# ── Sizes needed for the iconset (.icns) ──────────────────────────────────────
ICONSET_SIZES = [16, 32, 64, 128, 256, 512, 1024]


def make_base_png(size=1024):
    """Render the icon at the given pixel size. Returns an RGBA Image."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Diagonal gradient  top-left → bottom-right
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            r = int(C1[0] + (C2[0] - C1[0]) * t)
            g = int(C1[1] + (C2[1] - C1[1]) * t)
            b = int(C1[2] + (C2[2] - C1[2]) * t)
            draw.point((x, y), fill=(r, g, b, 255))

    # Rounded-corner mask  (radius ≈ 22.5 % of size, matches macOS icon style)
    radius = int(size * 0.225)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=radius, fill=255
    )
    img.putalpha(mask)

    # "BIQ" text — bold, white, centred
    font_path = "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"
    font_size = int(size * 0.42)
    font = ImageFont.truetype(font_path, font_size)

    draw = ImageDraw.Draw(img)
    bbox = draw.textbbox((0, 0), "BIQ", font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    tx = (size - text_w) // 2 - bbox[0]
    ty = (size - text_h) // 2 - bbox[1] - int(size * 0.02)  # slight upward nudge

    # Subtle shadow for depth
    shadow_offset = max(2, size // 128)
    draw.text(
        (tx + shadow_offset, ty + shadow_offset),
        "BIQ",
        font=font,
        fill=(0, 0, 0, 60),
    )
    draw.text((tx, ty), "BIQ", font=font, fill=WHITE)

    return img


def build_icns(base_img):
    """Create icon.icns using macOS iconutil."""
    iconset_dir = os.path.join(OUT_DIR, "icon.iconset")
    os.makedirs(iconset_dir, exist_ok=True)

    # Required iconset filenames and their pixel sizes
    specs = [
        ("icon_16x16.png",       16),
        ("icon_16x16@2x.png",    32),
        ("icon_32x32.png",       32),
        ("icon_32x32@2x.png",    64),
        ("icon_128x128.png",    128),
        ("icon_128x128@2x.png", 256),
        ("icon_256x256.png",    256),
        ("icon_256x256@2x.png", 512),
        ("icon_512x512.png",    512),
        ("icon_512x512@2x.png", 1024),
    ]

    for filename, px in specs:
        resized = make_base_png(px) if px != 1024 else base_img.copy()
        if px != 1024:
            resized = base_img.resize((px, px), Image.LANCZOS)
        resized.save(os.path.join(iconset_dir, filename))
        print(f"  {filename}")

    icns_path = os.path.join(OUT_DIR, "icon.icns")
    result = subprocess.run(
        ["iconutil", "-c", "icns", iconset_dir, "-o", icns_path],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"iconutil failed: {result.stderr}")

    shutil.rmtree(iconset_dir)
    print(f"  → icon.icns ({os.path.getsize(icns_path)//1024} KB)")


def build_ico(base_img):
    """Create icon.ico with standard Windows sizes."""
    ico_path = os.path.join(OUT_DIR, "icon.ico")
    # Pillow ICO: pass the source image + sizes list; it resamples internally
    base_img.save(
        ico_path,
        format="ICO",
        sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)],
    )
    print(f"  → icon.ico ({os.path.getsize(ico_path)//1024} KB)")


if __name__ == "__main__":
    print("Generating BalanceIQ icons...")

    print("\n[1/3] Rendering 1024×1024 base PNG...")
    base = make_base_png(1024)
    png_path = os.path.join(OUT_DIR, "icon.png")
    base.save(png_path)
    print(f"  → icon.png")

    print("\n[2/3] Building iconset → icon.icns (macOS)...")
    build_icns(base)

    print("\n[3/3] Building icon.ico (Windows)...")
    build_ico(base)

    print("\nDone. Files in build/:")
    for f in ["icon.png", "icon.icns", "icon.ico"]:
        p = os.path.join(OUT_DIR, f)
        print(f"  {f}  ({os.path.getsize(p)//1024} KB)")
