#!/usr/bin/env python3
"""Rasterise the legacy printing_app adaptive mark.

Source geometry (copy, do not invent):
  printing_app/.../drawable/ic_launcher_foreground.xml
  108×108 viewport, radius 6. Each path starts at the left of the circle
  (M32,38 / M48,38 / M64,38 and y 38/54/70), so centres are 38/54/70.

Plate: #111111 (ic_launcher_background). Captain change from legacy:
the middle-left dot (M32,54) is #5B5B5B, not white.

    #FFFFFF  #FFFFFF  #FFDE58
    #5B5B5B  #FFFFFF  #FFFFFF
    #FFFFFF  #FFFFFF  #8A8A8A

Run from the repo root:

    python3 scripts/generate-app-icon.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

DOT_WHITE = (0xFF, 0xFF, 0xFF, 255)
DOT_YELLOW = (0xFF, 0xDE, 0x58, 255)
DOT_MID_LEFT = (0x5B, 0x5B, 0x5B, 255)
DOT_BOTTOM_RIGHT = (0x8A, 0x8A, 0x8A, 255)
PLATE = (0x11, 0x11, 0x11, 255)
MONO = (0xFF, 0xFF, 0xFF, 255)

# Geometric centres of the legacy vector (path start + radius on x).
VIEW = 108
RADIUS = 6
CENTRES = (38, 54, 70)

SCALE = 4

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "images"


def dot_fill(col: int, row: int, *, mono: bool) -> tuple[int, int, int, int]:
    if mono:
        return MONO
    if col == 2 and row == 0:
        return DOT_YELLOW
    if col == 0 and row == 1:
        return DOT_MID_LEFT
    if col == 2 and row == 2:
        return DOT_BOTTOM_RIGHT
    return DOT_WHITE


def draw_mark(size: int, *, mono: bool = False) -> Image.Image:
    """Paint all nine dots into a size×size canvas mapped to the 108 viewport."""
    big = size * SCALE
    canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    unit = size / VIEW

    for row, cy in enumerate(CENTRES):
        for col, cx in enumerate(CENTRES):
            fill = dot_fill(col, row, mono=mono)
            px = cx * unit * SCALE
            py = cy * unit * SCALE
            r = RADIUS * unit * SCALE
            draw.ellipse((px - r, py - r, px + r, py + r), fill=fill)

    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def composite_plate(mark: Image.Image, color: tuple[int, int, int, int] = PLATE) -> Image.Image:
    plate = Image.new("RGBA", mark.size, color)
    plate.alpha_composite(mark)
    return plate.convert("RGB")


def save_png(image: Image.Image, name: str) -> None:
    path = OUT / name
    image.save(path, format="PNG", optimize=True)
    print(f"wrote {path.relative_to(ROOT)} ({image.size[0]}×{image.size[1]} {image.mode})")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    save_png(composite_plate(draw_mark(1024)), "icon.png")
    save_png(draw_mark(1024), "android-icon-foreground.png")
    save_png(Image.new("RGB", (1024, 1024), PLATE[:3]), "android-icon-background.png")
    save_png(draw_mark(1024, mono=True), "android-icon-monochrome.png")
    save_png(draw_mark(1024), "splash-icon.png")
    save_png(draw_mark(1024), "splash-icon-dark.png")
    save_png(composite_plate(draw_mark(48)), "favicon.png")


if __name__ == "__main__":
    main()
