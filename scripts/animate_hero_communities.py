from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "static" / "hero-communities.png"
OUT_APNG = ROOT / "static" / "hero-communities-animated.png"
OUT_POSTER = ROOT / "static" / "hero-communities-animated-poster.png"
FRAME_DIR = ROOT / "static" / "hero-communities-frames"

FRAMES = 72
DURATION_MS = 50


def sine01(t: float, phase: float = 0.0) -> float:
    return 0.5 + 0.5 * math.sin((t + phase) * math.tau)


def soft_rect_mask(size: tuple[int, int], boxes: list[tuple[int, int, int, int]], blur: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    for box in boxes:
        patch = Image.new("L", (box[2] - box[0], box[3] - box[1]), 255)
        mask.paste(patch, box[:2])
    return mask.filter(ImageFilter.GaussianBlur(blur))


def shifted_region(base: Image.Image, box: tuple[int, int, int, int], dx: float, dy: float) -> tuple[Image.Image, Image.Image]:
    crop = base.crop(box)
    alpha = crop.getchannel("A")
    visible = alpha.point(lambda v: 255 if v > 30 else 0).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
    moved = Image.new("RGBA", base.size, (0, 0, 0, 0))
    moved.paste(crop, (round(box[0] + dx), round(box[1] + dy)), alpha)
    erase = Image.new("L", base.size, 0)
    erase.paste(visible, box[:2])
    return moved, erase


def make_path_mask(base: Image.Image) -> Image.Image:
    rgba = np.array(base)
    r = rgba[:, :, 0].astype(np.int16)
    g = rgba[:, :, 1].astype(np.int16)
    b = rgba[:, :, 2].astype(np.int16)
    a = rgba[:, :, 3]
    yy, xx = np.indices(a.shape)

    yellow = (a > 20) & (r > 95) & (g > 60) & (b < 50)
    central_band = (xx > 235) & (xx < 695) & (yy > 150) & (yy < 650)
    red_warmth = (r > g + 35) & (r > 100) & (a > 20)
    mask = ((yellow & central_band) | (red_warmth & central_band)).astype(np.uint8) * 255
    return Image.fromarray(mask, "L").filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(2.2))


def make_yellow_light_mask(base: Image.Image) -> Image.Image:
    rgba = np.array(base)
    r = rgba[:, :, 0].astype(np.int16)
    g = rgba[:, :, 1].astype(np.int16)
    b = rgba[:, :, 2].astype(np.int16)
    a = rgba[:, :, 3]
    yellow = (a > 16) & (r > 70) & (g > 45) & (b < 80) & (r >= g - 25)
    return Image.fromarray(yellow.astype(np.uint8) * 255, "L").filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.8))


def paste_dimmed_region(frame: Image.Image, base: Image.Image, mask: Image.Image, brightness: float) -> None:
    dimmed = ImageEnhance.Brightness(base).enhance(brightness)
    dimmed.putalpha(mask)
    frame.alpha_composite(dimmed)


def main() -> None:
    base = Image.open(SOURCE).convert("RGBA")
    size = base.size
    yellow_mask = make_yellow_light_mask(base)
    path_mask = make_path_mask(base)

    church_boxes = [(548, 116, 649, 190), (585, 23, 615, 82)]
    church_core_boxes = [(562, 120, 638, 181), (589, 25, 612, 76)]
    house_boxes = [(139, 391, 277, 487), (616, 301, 793, 401), (293, 531, 586, 664)]
    stadium_boxes = [(104, 119, 429, 238)]
    church_mask = ImageChops.multiply(yellow_mask, soft_rect_mask(size, church_boxes, 24))
    church_core_mask = ImageChops.multiply(yellow_mask, soft_rect_mask(size, church_core_boxes, 8))
    house_mask = ImageChops.multiply(yellow_mask, soft_rect_mask(size, house_boxes, 18))
    stadium_mask = ImageChops.multiply(yellow_mask, soft_rect_mask(size, stadium_boxes, 18))
    global_mask = yellow_mask

    bird_boxes = [
        (181, 91, 220, 122),
        (468, 69, 501, 96),
        (487, 92, 519, 119),
        (95, 552, 133, 590),
    ]

    frames: list[Image.Image] = []

    FRAME_DIR.mkdir(exist_ok=True)

    for i in range(FRAMES):
        t = i / FRAMES
        frame = base.copy()

        erase_total = Image.new("L", size, 0)
        moved_birds = Image.new("RGBA", size, (0, 0, 0, 0))
        for n, box in enumerate(bird_boxes):
            dx = math.sin((t + n * 0.17) * math.tau) * (1.2 + n * 0.2)
            dy = math.sin((t * 2 + n * 0.23) * math.tau) * 0.8
            moved, erase = shifted_region(base, box, dx, dy)
            erase_total = ImageChops.lighter(erase_total, erase)
            moved_birds.alpha_composite(moved)
        frame.putalpha(ImageChops.subtract(frame.getchannel("A"), erase_total.point(lambda v: min(210, v))))
        frame.alpha_composite(moved_birds)

        global_pulse = 0.58 + 0.42 * sine01(t, 0.00)
        church_pulse = sine01(t, 0.06)
        house_pulse = 0.52 + 0.48 * sine01(t, 0.31)
        stadium_pulse = 0.56 + 0.44 * sine01(t, 0.54)
        path_pulse = 0.50 + 0.50 * sine01(t, 0.72)
        micro_flicker = 0.92 + 0.08 * sine01(t * 5.0, 0.17)

        def add_light(mask: Image.Image, brightness: float, strength: float, blur: float = 0.0) -> None:
            light = ImageEnhance.Brightness(base).enhance(brightness)
            alpha = mask.point(lambda v: int(v * strength))
            light.putalpha(alpha)
            if blur:
                light = light.filter(ImageFilter.GaussianBlur(blur))
            frame.alpha_composite(light)

        church_dim = 0.34 + 0.66 * church_pulse
        paste_dimmed_region(frame, base, church_core_mask, church_dim)
        add_light(global_mask, 1.08 + 0.24 * global_pulse * micro_flicker, 0.10 + 0.18 * global_pulse, 0.0)
        add_light(church_mask, 0.92 + 1.05 * church_pulse, 0.03 + 0.74 * church_pulse, 4.8)
        add_light(church_core_mask, 1.00 + 1.20 * church_pulse, 0.04 + 0.70 * church_pulse, 1.4)
        add_light(house_mask, 1.16 + 0.38 * house_pulse, 0.18 + 0.26 * house_pulse, 2.4)
        add_light(stadium_mask, 1.12 + 0.34 * stadium_pulse, 0.13 + 0.22 * stadium_pulse, 1.8)
        add_light(path_mask, 1.10 + 0.32 * path_pulse, 0.10 + 0.24 * path_pulse, 1.2)

        frames.append(frame)
        frame.save(FRAME_DIR / f"frame-{i:03d}.png")

    frames[0].save(OUT_POSTER)
    frames[0].save(
        OUT_APNG,
        save_all=True,
        append_images=frames[1:],
        duration=DURATION_MS,
        loop=0,
        disposal=2,
        blend=1,
    )
    print(f"Wrote {OUT_APNG}")
    print(f"Wrote {OUT_POSTER}")
    print(f"Wrote frames to {FRAME_DIR}")


if __name__ == "__main__":
    main()
