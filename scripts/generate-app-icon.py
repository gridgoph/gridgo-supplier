#!/usr/bin/env python3
"""Rasterise the GRIDGO launcher mark.

Geometry from the legacy printing_app adaptive foreground:
  108×108 viewport, radius 6. Each path starts at the left of the circle
  (M32,38 / M48,38 / M64,38 and y 38/54/70), so centres are 38/54/70.

Plate: #111111 (printing_app ic_launcher_background).

Captain most-final 3×3 (2026-08-19). Middle-right is #8A8A8A, not white.
No #5B5B5B anywhere.

    #FFFFFF  #FFFFFF  #FFDE58
    #FFFFFF  #FFFFFF  #8A8A8A
    #FFFFFF  #FFFFFF  #8A8A8A

Run from the repo root:

    python3 scripts/generate-app-icon.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

DOT_WHITE = (0xFF, 0xFF, 0xFF, 255)
DOT_YELLOW = (0xFF, 0xDE, 0x58, 255)
DOT_MUTED = (0x8A, 0x8A, 0x8A, 255)
PLATE = (0x11, 0x11, 0x11, 255)
MONO = (0xFF, 0xFF, 0xFF, 255)

# Captain most-final: right column is yellow, muted, muted.
GRID = (
    (DOT_WHITE, DOT_WHITE, DOT_YELLOW),
    (DOT_WHITE, DOT_WHITE, DOT_MUTED),
    (DOT_WHITE, DOT_WHITE, DOT_MUTED),
)

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
    return GRID[row][col]


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


def hex_rgb(pixel: tuple[int, ...]) -> str:
    return f"#{pixel[0]:02X}{pixel[1]:02X}{pixel[2]:02X}"


def sample_grid(path: Path) -> list[list[str]]:
    """Read the nine dot centres from a plate-composited raster."""
    image = Image.open(path).convert("RGB")
    width, height = image.size
    rows: list[list[str]] = []
    for cy in CENTRES:
        row: list[str] = []
        for cx in CENTRES:
            x = min(width - 1, int(round(cx * width / VIEW)))
            y = min(height - 1, int(round(cy * height / VIEW)))
            row.append(hex_rgb(image.getpixel((x, y))))
        rows.append(row)
    return rows


def verify_icon(path: Path) -> None:
    expected = [
        ["#FFFFFF", "#FFFFFF", "#FFDE58"],
        ["#FFFFFF", "#FFFFFF", "#8A8A8A"],
        ["#FFFFFF", "#FFFFFF", "#8A8A8A"],
    ]
    got = sample_grid(path)
    if got != expected:
        raise SystemExit(f"{path.name} grid {got} != {expected}")
    plate = hex_rgb(Image.open(path).convert("RGB").getpixel((8, 8)))
    if plate != "#111111":
        raise SystemExit(f"{path.name} plate {plate} != #111111")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    save_png(composite_plate(draw_mark(1024)), "icon.png")
    save_png(draw_mark(1024), "android-icon-foreground.png")
    save_png(Image.new("RGB", (1024, 1024), PLATE[:3]), "android-icon-background.png")
    save_png(draw_mark(1024, mono=True), "android-icon-monochrome.png")
    save_png(draw_mark(1024), "splash-icon.png")
    save_png(draw_mark(1024), "splash-icon-dark.png")
    save_png(composite_plate(draw_mark(48)), "favicon.png")
    verify_icon(OUT / "icon.png")
    print("verified icon.png 3×3")


if __name__ == "__main__":
    main()
