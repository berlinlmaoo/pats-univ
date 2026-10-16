"""Cut the PATS shield out of the crest crop made by make-assets.sh.

Input is the shield region of the crest at 3000 px (crop 1500x1900 at offset 760,640). The
four quadrants are flood-filled from inside the maroon outline, grown by the outline width,
holes filled, and the result clipped to the outline's outer edge (the horizontal bar runs
through the outline into the crest background). Pixels are never redrawn or recoloured: the
mask only sets alpha.

usage: python3 shield.py <crop.png> <out.png>
"""

import sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

# Measured on the 3000 px crop.
SEEDS = [(300, 500), (1200, 450), (300, 1200), (1200, 1350)]  # one (x, y) per quadrant
OUTLINE = 35  # outline width in px
LEFT, RIGHT, TOP = 36, 1450, 53  # outer edge of the outline (antialiased column/row)
SQUARE_CORNERS_ABOVE = 600  # rows with the shield's square top corners


def main(crop_path: str, out_path: str) -> None:
    src = Image.open(crop_path).convert('RGBA')
    a = np.asarray(src).astype(int)
    r, g, b, alpha = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    # Maroon (dark, red >= blue) and transparent pixels stop the fill; navy and cream don't.
    barrier = ((r + g + b < 450) & (r >= b)) | (alpha < 128)
    fill = Image.fromarray(np.where(barrier, 0, 255).astype(np.uint8)).copy()
    for seed in SEEDS:
        ImageDraw.floodfill(fill, seed, 128)
    interior = Image.fromarray(np.where(np.asarray(fill) == 128, 255, 0).astype(np.uint8))

    # Grow by the outline width: an octagon (close to a disk) for the curved lower half, a
    # square for the top so the corners stay square.
    cross = ImageFilter.Kernel((3, 3), [0, 1, 0, 1, 1, 1, 0, 1, 0], scale=1)
    octagon = interior
    for i in range(OUTLINE):
        octagon = (
            octagon.filter(ImageFilter.MaxFilter(3))
            if i % 2 == 0
            else octagon.filter(cross).point(lambda v: 255 if v > 0 else 0)
        )
    square = interior.filter(ImageFilter.MaxFilter(2 * OUTLINE + 1))
    w, h = interior.size
    top = Image.new('L', (w, h), 0)
    ImageDraw.Draw(top).rectangle([0, 0, w, SQUARE_CORNERS_ABOVE], fill=255)
    grown = ImageChops.lighter(octagon, ImageChops.multiply(square, top))

    # Fill holes (maroon details inside the shield): keep everything not reachable from outside.
    outside = grown.point(lambda v: 0 if v > 0 else 255).copy()
    ImageDraw.floodfill(outside, (0, 0), 128)
    mask = np.where(np.asarray(outside) == 128, 0, 255).astype(np.uint8)
    mask = np.asarray(Image.fromarray(mask).filter(ImageFilter.GaussianBlur(0.8))).copy()
    mask[:, :LEFT] = 0
    mask[:, RIGHT + 1 :] = 0
    mask[:TOP, :] = 0
    mask[:, LEFT] //= 2
    mask[:, RIGHT] //= 2

    src.putalpha(ImageChops.multiply(src.getchannel('A'), Image.fromarray(mask)))
    bbox = src.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    src.crop(bbox).save(out_path)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
