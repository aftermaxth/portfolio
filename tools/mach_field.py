#!/usr/bin/env python3
"""
mach_field.py

Draws the Mach-number contour layer that sits behind the engine in the hero.

This is an illustrative model, not a simulation of this engine. It follows the structure of
an underexpanded jet and is lined up with the photo:
  - A supersonic core that narrows downstream, inside a shear layer that spreads.
  - Shock cells shaped like lozenges. The oblique shocks cross on the axis between cells, where
    the Mach number drops. Those crossings sit on the bright spots in the photo, since the gas
    glows hottest just behind the shocks.
  - Cell spacing measured from the photo: about 240 px at the nozzle, shrinking 0.12 px per px
    downstream (bright spots at 45, 275, 465, 635 and 785 px from the exit).

Rendered like a solver's contour plot: 16 bands of the jet colormap, thin lines on the band
edges, and the freestream left transparent so the page shows through.

Reads the plume geometry from js/hero-plume.js (written by extract_hero.py), so the two stay
aligned. Output: assets/img/hero/mach-field.webp at the same size as the other hero layers.

Usage
  python3 tools/mach_field.py     (needs numpy, pillow, scipy, matplotlib)
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
from matplotlib import colormaps
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
PLUME_MODULE = ROOT / "js" / "hero-plume.js"
OUT = ROOT / "assets" / "img" / "hero" / "mach-field.webp"

MACH_MAX = 3.2          # top of the color scale (the legend in index.html matches)
LEVELS = 16             # contour bands (the legend's colorbar has the same 16 steps)
FILL_ALPHA = 0.42       # band opacity
LINE_ALPHA = 0.45       # extra opacity on band edges

CELL_START = 240.0      # shock-cell length at the nozzle exit, art px
CELL_SHRINK = 0.12      # cell length lost per px downstream
FIRST_CROSSING = 45.0   # first shock crossing (first bright spot), px downstream of the exit


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def read_plume() -> dict:
    match = re.search(r"PLUME = (\{.*\});", PLUME_MODULE.read_text())
    return json.loads(match.group(1))


def cell_count(s: np.ndarray) -> np.ndarray:
    """Number of shock cells between the first crossing and s (cells shrink linearly)."""
    def n(x):
        return -np.log(np.clip(1.0 - CELL_SHRINK * x / CELL_START, 1e-3, None)) / CELL_SHRINK
    return n(s) - n(FIRST_CROSSING)


def mach_number(plume: dict) -> np.ndarray:
    width, height = plume["artSize"]
    nozzle = np.array(plume["nozzle"])
    axis = np.array(plume["end"]) - nozzle
    along = axis / np.linalg.norm(axis)
    across = np.array([-along[1], along[0]])
    exit_half = plume["halfWidth"][0]

    ys, xs = np.mgrid[0:height, 0:width].astype(np.float32)
    rx, ry = xs - nozzle[0], ys - nozzle[1]
    s = rx * along[0] + ry * along[1]          # downstream of the exit
    n = rx * across[0] + ry * across[1]        # off the axis
    sd = np.clip(s, 0.0, None)

    core = np.maximum(exit_half * 0.95 * (1.0 - sd / 1500.0), 8.0)
    outer = exit_half * 1.12 + 0.16 * sd
    shear_mid = 0.5 * (core + outer)
    shear_width = 10.0 + 0.07 * sd
    jet = 0.5 * (1.0 - np.tanh((np.abs(n) - shear_mid) / shear_width))

    # Position inside a cell: 0 and 1 at the shock crossings, 0.5 mid-cell.
    u = np.mod(cell_count(sd), 1.0)
    r = np.abs(n) / core + np.abs(2.0 * u - 1.0)
    cells = np.where(r < 1.0, 1.0 - r, -0.45 * np.minimum(r - 1.0, 1.0))

    mean = 2.3 * (1.0 - 0.3 * np.clip(sd / 1100.0, 0.0, 1.0))
    swing = np.exp(-sd / 1100.0)
    mach = (mean + swing * cells) * jet
    mach *= np.clip(s / 20.0 + 1.0, 0.0, 1.0)  # nothing upstream of the exit
    return ndimage.gaussian_filter(mach, 1.2), xs, ys


def render(plume: dict) -> np.ndarray:
    mach, xs, ys = mach_number(plume)
    width, height = plume["artSize"]
    t = np.clip(mach / MACH_MAX, 0.0, 1.0)

    band = np.floor(t * LEVELS) / LEVELS
    color = colormaps["jet"](np.clip(band + 0.5 / LEVELS, 0.0, 1.0))[..., :3]
    edge = (ndimage.maximum_filter(band, 3) != ndimage.minimum_filter(band, 3)).astype(np.float32)
    color = color + edge[..., None] * 0.25 * (1.0 - color)   # band edges drawn a little lighter

    visible = np.clip((t - 0.02) / 0.25, 0.0, 1.0) ** 0.8    # freestream stays transparent
    visible *= smoothstep(20.0, 280.0, xs)                    # fade toward the art's left edge
    visible *= smoothstep(0.0, 40.0, ys) * smoothstep(0.0, 40.0, height - 1 - ys)
    alpha = np.clip(visible * FILL_ALPHA + edge * visible * LINE_ALPHA, 0.0, 1.0)
    return np.dstack([color, alpha]).astype(np.float32)


def main() -> None:
    plume = read_plume()
    layer = render(plume)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    image = Image.fromarray((layer * 255 + 0.5).astype(np.uint8), "RGBA")
    image.save(OUT, "WEBP", quality=90, alpha_quality=95, method=6)
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
