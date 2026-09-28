#!/usr/bin/env python3
"""
extract_hero.py

Builds the hero layers from one engine test-cell photo.

Outputs (assets/img/hero/):
  engine.webp  engine + test stand with an alpha matte. The stand fades out above the floor.
  flame.webp   the afterburner plume as emitted light on black, for screen or additive blending.
  bloom.webp   the plume blurred at quarter size, used for the glow.

Also writes js/hero-plume.js: the plume geometry in art pixels, which the shader uses to know
where the flow runs.

How the flame is separated
  The plume is light added on top of the augmenter wall behind it. Above and below the plume
  the wall is visible, so for each column the script samples the wall in a band above and a
  band below, interpolates across the plume, and subtracts that estimate in linear light.
  What is left is the light the plume emits, which can be added back onto any dark page.

How the engine is separated
  A hand-traced outline. The concrete wall behind the engine is too close in tone to the casing
  for automatic segmentation to hold a clean edge, so the outline was traced against a gridded
  zoom of the photo and is rasterized with 4x supersampling for antialiased edges.

Usage
  python3 tools/extract_hero.py            (needs numpy, pillow, scipy)
  python3 tools/extract_hero.py --preview  (also writes a flattened preview PNG to tools/)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "source" / "engine-test-cell.jpg"
OUT = ROOT / "assets" / "img" / "hero"
PLUME_MODULE = ROOT / "js" / "hero-plume.js"

# Art board in source pixels. The left edge runs past the photo so the plume glow can fade out.
ART_X0, ART_Y0, ART_X1, ART_Y1 = -40, 200, 2000, 830

NOZZLE_X = 1045           # nozzle exit plane
PLUME_END_X = 95          # augmenter ring edge; the plume is hidden past this
PLUME_FADE_TO_X = 470     # plume fades in from PLUME_END_X to here
PLUME_SPREAD_TO_X = 620   # and diffuses (blurs outward) from PLUME_END_X to here
DIAMOND_GAIN = 1.05       # local contrast along the axis, so the shock diamonds read clearly
DIAMOND_SIGMA = (5, 72)   # reference blur (across flow, along flow): wider = broader diamonds
ENGINE_DIM = 0.82         # engine sits back from the plume
TOP_BAND_ONLY_BELOW_X = 185   # left of this the ring sits under the plume, so skip the lower band
STAND_FADE_ROWS = (680, 812)  # stand goes from opaque to clear across these rows
BG_COLOR = (0.035, 0.039, 0.047)  # page background, only used for the preview

# Engine and upper test stand, traced clockwise from the nozzle lip (source pixels).
ENGINE_OUTLINE = [
    # nozzle lip and top edge
    (1043, 420), (1044, 400), (1048, 380), (1053, 364), (1062, 354), (1075, 348),
    (1090, 343), (1120, 332), (1160, 318), (1200, 305), (1240, 294), (1258, 284),
    (1275, 272), (1295, 261), (1320, 254), (1345, 251), (1370, 251), (1395, 256),
    (1420, 264), (1445, 269), (1465, 267), (1490, 261), (1520, 257), (1550, 253),
    (1600, 249), (1650, 243), (1680, 239), (1700, 235), (1730, 232), (1760, 230),
    (1790, 229), (1820, 228), (1850, 226), (1900, 223), (1950, 221), (2000, 219),
    # photo edge, then the cut line under the stand
    (2000, 830), (1180, 830),
    # front of the stand, then the underside of the nozzle back to the lip
    (1180, 642), (1165, 636), (1140, 628), (1115, 620), (1098, 612), (1085, 601),
    (1073, 588), (1063, 573), (1055, 558), (1050, 540), (1049, 520), (1050, 505),
    (1047, 490), (1044, 470), (1043, 445),
]

# Background showing through the stand (a patch of the augmenter ring, the fire extinguishers).
# These are painted over with shadow instead of cut out, so the stand reads as one dark mass.
PAINT_OUT_RECTS = [(1165, 690, 1250, 760), (1815, 765, 2000, 1010)]
SHADOW = (0.045, 0.05, 0.052)


# ---------------------------------------------------------------- helpers

def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c: np.ndarray) -> np.ndarray:
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def luminance(rgb: np.ndarray) -> np.ndarray:
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def rasterize(points, width: int, height: int, ss: int = 4) -> np.ndarray:
    """Polygon to an antialiased 0..1 mask via supersampling."""
    big = Image.new("L", (width * ss, height * ss), 0)
    ImageDraw.Draw(big).polygon([(x * ss, y * ss) for x, y in points], fill=255)
    small = big.resize((width, height), Image.BOX)
    return np.asarray(small, dtype=np.float32) / 255.0


def to_art_board(layer: np.ndarray) -> np.ndarray:
    """Place a full-photo layer onto the art board (pads the left edge, crops the rest)."""
    h, w = layer.shape[:2]
    board = np.zeros((ART_Y1 - ART_Y0, ART_X1 - ART_X0) + layer.shape[2:], dtype=layer.dtype)
    sx0, sx1 = max(ART_X0, 0), min(ART_X1, w)
    board[:, sx0 - ART_X0:sx1 - ART_X0] = layer[ART_Y0:ART_Y1, sx0:sx1]
    return board


def save_rgb(arr: np.ndarray, path: Path, quality: int) -> None:
    img = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")
    img.save(path, "WEBP", quality=quality, method=6)


def save_rgba(arr: np.ndarray, path: Path, quality: int) -> None:
    img = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")
    img.save(path, "WEBP", quality=quality, alpha_quality=100, method=6)


# ---------------------------------------------------------------- engine

def build_engine(srgb: np.ndarray) -> np.ndarray:
    h, w = srgb.shape[:2]
    alpha = rasterize(ENGINE_OUTLINE, w, h)

    paint = np.zeros((h, w), dtype=np.float32)
    for x0, y0, x1, y1 in PAINT_OUT_RECTS:
        paint[y0:y1, x0:x1] = 1.0
    paint = np.clip(ndimage.gaussian_filter(paint, 5.0) * 1.4, 0, 1)[..., None]
    srgb = srgb * (1.0 - paint) + np.array(SHADOW, dtype=np.float32) * paint

    rows = np.arange(h, dtype=np.float32)[:, None]
    cols = np.arange(w, dtype=np.float32)[None, :]
    stand_fade = 1.0 - smoothstep(*STAND_FADE_ROWS, rows)
    alpha *= stand_fade
    # Soften the vertical cut at the front of the stand (below the nozzle).
    below_engine = smoothstep(640, 672, rows)
    alpha *= 1.0 - below_engine * (1.0 - smoothstep(1180, 1242, cols))

    # Neutral steel: pull 20% of the green cast out, and let the stand sink into shadow as it fades.
    lum = luminance(srgb)[..., None]
    rgb = lum + (srgb - lum) * 0.8
    rgb *= (0.55 + 0.45 * stand_fade)[..., None] * ENGINE_DIM

    return np.dstack([rgb, alpha])


# ---------------------------------------------------------------- flame

def plume_envelope(srgb: np.ndarray):
    """Per-column top and bottom rows of the plume, smoothed."""
    lum = luminance(srgb)
    xs = np.arange(PLUME_END_X, NOZZLE_X + 1)
    top = np.zeros(xs.size)
    bottom = np.zeros(xs.size)
    for i, x in enumerate(xs):
        y_max = 650 if x < 220 else 700   # the augmenter ring sits under the far end of the plume
        col = lum[300:y_max, x]
        rows = np.nonzero(col > 0.38)[0]
        if rows.size:
            top[i], bottom[i] = 300 + rows.min(), 300 + rows.max()
        else:  # keep the previous column's edges if this one has no bright pixels
            top[i], bottom[i] = top[i - 1], bottom[i - 1]
    top = ndimage.gaussian_filter1d(ndimage.median_filter(top, 41), 12)
    bottom = ndimage.gaussian_filter1d(ndimage.median_filter(bottom, 41), 12)
    return xs, top, bottom


def build_flame(srgb: np.ndarray, xs, top, bottom) -> np.ndarray:
    """Emitted plume light in linear RGB, zero everywhere else."""
    lin = srgb_to_linear(srgb)
    h, w = lin.shape[:2]
    emission = np.zeros_like(lin)
    envelope = np.zeros((h, w), dtype=np.float32)

    gap, band = 24, 40
    bg_top = np.zeros((xs.size, 3))
    bg_bot = np.zeros((xs.size, 3))
    for i, x in enumerate(xs):
        t, b = int(top[i]), int(bottom[i])
        bg_top[i] = np.median(lin[t - gap - band:t - gap, x], axis=0)
        bg_bot[i] = np.median(lin[b + gap:b + gap + band, x], axis=0)
    bg_top = ndimage.gaussian_filter1d(ndimage.median_filter(bg_top, size=(31, 1)), 8, axis=0)
    bg_bot = ndimage.gaussian_filter1d(ndimage.median_filter(bg_bot, size=(31, 1)), 8, axis=0)

    for i, x in enumerate(xs):
        t, b = int(top[i]), int(bottom[i])
        y0, y1 = t - gap, b + gap
        ys = np.arange(y0, y1)
        lower = bg_top[i] if x < TOP_BAND_ONLY_BELOW_X else bg_bot[i]
        k = ((ys - (t - gap - band / 2)) / ((b + gap + band / 2) - (t - gap - band / 2)))[:, None]
        wall = bg_top[i] * (1 - k) + lower * k
        emission[y0:y1, x] = np.maximum(lin[y0:y1, x] - wall, 0.0)
        envelope[t:b, x] = 1.0

    # Soft edge around the plume, and a small floor to drop leftover wall texture.
    envelope = ndimage.gaussian_filter(envelope, 14)
    envelope = np.clip(envelope * 1.6, 0, 1)
    emission = np.maximum(emission - 0.004, 0.0) * envelope[..., None]
    cols = np.arange(w, dtype=np.float32)[None, :]

    # Shock diamonds: boost contrast along the flow only. Blurring along x and barely at all
    # across it sharpens the bright cells without putting a bright rim on the plume's edge.
    along_blur = ndimage.gaussian_filter(emission, sigma=(DIAMOND_SIGMA[0], DIAMOND_SIGMA[1], 0))
    emission = np.maximum(emission + DIAMOND_GAIN * (emission - along_blur), 0.0)

    # Far end: the augmenter ring hides the rest of the plume, so let it spread and fade out
    # the way a plume dissipates, instead of stopping on the ring's edge.
    spread = ndimage.gaussian_filter(emission, sigma=(30, 8, 0))
    diffuse = (1.0 - smoothstep(PLUME_END_X, PLUME_SPREAD_TO_X, cols))[..., None]
    emission = emission * (1.0 - diffuse) + spread * diffuse
    emission *= smoothstep(PLUME_END_X, PLUME_FADE_TO_X, cols)[..., None]

    # Nozzle end: carry the exit glow a few pixels past the lip so it wraps the nozzle edge.
    lip = emission[:, NOZZLE_X - 2].copy()
    for x in range(NOZZLE_X - 1, NOZZLE_X + 40):
        emission[:, x] = np.maximum(emission[:, x], lip * np.exp(-(x - NOZZLE_X + 1) / 9.0))
    return emission


def build_bloom(emission_art: np.ndarray) -> np.ndarray:
    """Two blur radii mixed, stored at quarter size (it's smooth, so nothing is lost)."""
    near = ndimage.gaussian_filter(emission_art, sigma=(26, 26, 0))
    far = ndimage.gaussian_filter(emission_art, sigma=(80, 80, 0))
    glow = (near * 0.55 + far * 0.45).astype(np.float32)
    h, w = glow.shape[:2]
    channels = [
        np.asarray(Image.fromarray(glow[..., c], "F").resize((w // 4, h // 4), Image.BOX))
        for c in range(3)
    ]
    small = np.stack(channels, axis=-1)

    # Fade to black at the art's edges so the glow never shows the image's rectangle.
    sh, sw = small.shape[:2]
    y = (np.arange(sh, dtype=np.float32) + 0.5)[:, None] / sh
    x = (np.arange(sw, dtype=np.float32) + 0.5)[None, :] / sw
    window = smoothstep(0.0, 0.25, y) * smoothstep(0.0, 0.25, 1.0 - y) * smoothstep(0.0, 0.1, x)
    return small * window[..., None]


def plume_geometry(xs, top, bottom) -> dict:
    center = (top + bottom) / 2
    fit = (xs > 300) & (xs < NOZZLE_X - 5)
    slope, intercept = np.polyfit(xs[fit], center[fit], 1)
    half = (bottom - top) / 2

    def art(x, y):
        return [round(float(x - ART_X0), 1), round(float(y - ART_Y0), 1)]

    nozzle_y = slope * NOZZLE_X + intercept
    end_y = slope * PLUME_END_X + intercept

    # Top edge of the visible flame and engine, left to right. The heat text measures its
    # distance to this line to decide which words sit closest to the engine.
    flame_edge = [art(x, top[i]) for i, x in enumerate(xs) if x >= PLUME_FADE_TO_X and (x - xs[0]) % 40 == 0]
    engine_edge = [art(x, y) for x, y in ENGINE_OUTLINE[: ENGINE_OUTLINE.index((2000, 219)) + 1]]

    return {
        "artSize": [ART_X1 - ART_X0, ART_Y1 - ART_Y0],
        "nozzle": art(NOZZLE_X, nozzle_y),
        "end": art(PLUME_END_X, end_y),
        "halfWidth": [
            round(float(np.median(half[xs > NOZZLE_X - 60])), 1),
            round(float(np.median(half[xs < PLUME_END_X + 120])), 1),
        ],
        "edge": flame_edge + engine_edge,
    }


# ---------------------------------------------------------------- main

def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    srgb = np.asarray(Image.open(SRC).convert("RGB"), dtype=np.float32) / 255.0

    engine = to_art_board(build_engine(srgb))
    xs, top, bottom = plume_envelope(srgb)
    emission = to_art_board(build_flame(srgb, xs, top, bottom))
    bloom = build_bloom(emission)

    save_rgba(engine, OUT / "engine.webp", quality=86)
    save_rgb(linear_to_srgb(emission), OUT / "flame.webp", quality=88)
    save_rgb(linear_to_srgb(bloom), OUT / "bloom.webp", quality=85)

    geometry = plume_geometry(xs, top, bottom)
    PLUME_MODULE.write_text(
        "// Generated by tools/extract_hero.py. Do not edit by hand.\n"
        "// Plume geometry in art pixels: where the nozzle exit sits, where the plume ends, and\n"
        "// its half-width at each end (the shader runs the flow along this line), plus the top\n"
        "// edge of the flame and engine (the heat text measures distances to it).\n"
        f"export const PLUME = {json.dumps(geometry)};\n"
    )
    print(json.dumps(geometry))

    if "--preview" in sys.argv:
        bg = srgb_to_linear(np.array(BG_COLOR, dtype=np.float32))
        glow = np.asarray(
            Image.fromarray((linear_to_srgb(bloom) * 255).astype(np.uint8)).resize(
                (emission.shape[1], emission.shape[0]), Image.BILINEAR
            ),
            dtype=np.float32,
        ) / 255.0
        light = bg + emission + srgb_to_linear(glow) * 0.6
        a = engine[..., 3:4]
        comp = linear_to_srgb(light) * (1 - a) + engine[..., :3] * a
        save_rgb(comp, ROOT / "tools" / "hero-preview.webp", quality=90)


if __name__ == "__main__":
    main()
