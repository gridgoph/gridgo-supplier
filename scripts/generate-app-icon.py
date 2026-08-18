#!/usr/bin/env python3
"""Rasterise the official GRIDGO 3×3 mark into the Expo icon assets.

Source of truth: gridgo-landing/public/favicon.svg
  3×3 dots, top-right #FFDE58, bottom-right #5B5B5B, the rest black.

Run from the repo root:

    python3 scripts/generate-app-icon.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

# Official landing favicon.svg
DOT_BLACK = (0x00, 0x00, 0x00, 255)
DOT_YELLOW = (0xFF, 0xDE, 0x58, 255)
DOT_GRAY = (0x5B, 0x5B, 0x5B, 255)
# Dark splash: structural dots invert so the mark reads on #000000.
DOT_LIGHT = (0xF0, 0xF0, 0xF0, 255)
# White plate so the black mark reads on light and dark launchers.
PLATE = (0xFF, 0xFF, 0xFF, 255)
MONO = (0xFF, 0xFF, 0xFF, 255)

# favicon.svg viewBox="0 0 48 48": centres at 8/24/40, r=5.
CENTRES = (8, 24, 40)
RADIUS = 5
VIEW = 48

# Android adaptive icons are 108dp; the unmasked safe zone is the inner 66dp.
SAFE_ZONE = 66 / 108

# Super-sample then Lanczos-down so the dots stay round, not stair-stepped.
SCALE = 4

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "images"


def dot_fill(col: int, row: int, *, dark: bool, mono: bool) -> tuple[int, int, int, int]:
    if mono:
        return MONO
    if col == 2 and row == 0:
        return DOT_YELLOW
    if col == 2 and row == 2:
        return DOT_GRAY
    return DOT_LIGHT if dark else DOT_BLACK


def draw_mark(
    size: int,
    *,
    dark: bool = False,
    mono: bool = False,
    inner_ratio: float = 1.0,
) -> Image.Image:
    """Paint the 3×3 mark into a size×size RGBA canvas.

    `inner_ratio` is the fraction of the canvas the 48-unit viewBox occupies
    (centred). 66/108 puts every dot inside Android's adaptive safe zone.
    """
    big = size * SCALE
    canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    inner = size * inner_ratio
    origin = (size - inner) / 2
    unit = inner / VIEW

    for row, cy in enumerate(CENTRES):
        for col, cx in enumerate(CENTRES):
            fill = dot_fill(col, row, dark=dark, mono=mono)
            px = (origin + cx * unit) * SCALE
            py = (origin + cy * unit) * SCALE
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

    # Home-screen / iOS icon: opaque white plate, mark inset so the squircle
    # mask does not clip a corner dot.
    save_png(composite_plate(draw_mark(1024, inner_ratio=0.70)), "icon.png")

    # Adaptive layers. Foreground keeps the official colours and the 66dp
    # safe zone; background is the same white plate; monochrome is a white
    # silhouette (Android tints it; expo-notifications uses it as the small
    # status-bar glyph).
    save_png(draw_mark(1024, inner_ratio=SAFE_ZONE), "android-icon-foreground.png")
    save_png(Image.new("RGB", (1024, 1024), PLATE[:3]), "android-icon-background.png")
    save_png(draw_mark(1024, mono=True, inner_ratio=SAFE_ZONE), "android-icon-monochrome.png")

    # Splash: transparent canvas, mark only. Light splash sits on #ffffff;
    # dark splash inverts the structural dots so they survive #000000.
    save_png(draw_mark(1024, inner_ratio=0.72), "splash-icon.png")
    save_png(draw_mark(1024, dark=True, inner_ratio=0.72), "splash-icon-dark.png")

    # Web tab icon. White plate so black dots still read on a dark browser chrome.
    save_png(composite_plate(draw_mark(48, inner_ratio=0.84)), "favicon.png")


if __name__ == "__main__":
    main()
