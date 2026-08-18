#!/usr/bin/env python3
"""Rasterise the GRIDGO 3×3 mark onto a black launcher plate.

Captain correction 2026-08-19: no white plate. Adaptive background is
#000000. All nine dots are painted — six charcoal, two grey on the right
column, one yellow — so nothing punches a hole through to a light plate.

Source geometry: gridgo-landing/public/favicon.svg (48-unit viewBox,
centres 8/24/40, r=5). Colours follow the captain photo, not the
favicon's pure-black structural dots (invisible on this plate).

Run from the repo root:

    python3 scripts/generate-app-icon.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

# Captain photo / black-plate spec.
DOT_CHARCOAL = (0x2A, 0x2A, 0x2A, 255)
DOT_YELLOW = (0xFF, 0xDE, 0x58, 255)
DOT_GRAY = (0x5B, 0x5B, 0x5B, 255)
PLATE = (0x00, 0x00, 0x00, 255)
MONO = (0xF0, 0xF0, 0xF0, 255)

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


def dot_fill(col: int, row: int, *, mono: bool) -> tuple[int, int, int, int]:
    if mono:
        return MONO
    if col == 2 and row == 0:
        return DOT_YELLOW
    if col == 2:
        # Middle-right and bottom-right are both grey. Never skip
        # middle-right — that hole read as a white dot on the old plate.
        return DOT_GRAY
    return DOT_CHARCOAL


def draw_mark(
    size: int,
    *,
    mono: bool = False,
    inner_ratio: float = 1.0,
) -> Image.Image:
    """Paint all nine dots into a size×size RGBA canvas (transparent plate).

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
            fill = dot_fill(col, row, mono=mono)
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

    # Home-screen / iOS icon: opaque black plate, mark inset so the squircle
    # mask does not clip a corner dot.
    save_png(composite_plate(draw_mark(1024, inner_ratio=0.70)), "icon.png")

    # Adaptive layers. Foreground paints every dot (no transparent holes);
    # background is the black plate; monochrome is nine light dots so a
    # themed icon still shows the full grid on that same plate.
    save_png(draw_mark(1024, inner_ratio=SAFE_ZONE), "android-icon-foreground.png")
    save_png(Image.new("RGB", (1024, 1024), PLATE[:3]), "android-icon-background.png")
    save_png(draw_mark(1024, mono=True, inner_ratio=SAFE_ZONE), "android-icon-monochrome.png")

    # Splash: same nine-dot mark, no plate, so it sits on the #000000 splash.
    save_png(draw_mark(1024, inner_ratio=0.72), "splash-icon.png")
    save_png(draw_mark(1024, inner_ratio=0.72), "splash-icon-dark.png")

    # Web tab icon matches the launcher tile.
    save_png(composite_plate(draw_mark(48, inner_ratio=0.84)), "favicon.png")


if __name__ == "__main__":
    main()
