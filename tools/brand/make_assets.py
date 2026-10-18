"""Regenerate every brand and KTM image from the official masters.

The masters stay out of the repo (Berlin's Vault: LOGO > PATS GROUP > PATS UNIV, and the KTM
artwork). Only the generated sizes are committed. The artwork is only ever resized, padded onto a
canvas, or stripped of its fully transparent margin: never cropped into, masked, recoloured or
redrawn (docs/DESIGN.md §7).

    tools/brand/make-assets.sh ~/pats-univ-brand/official ~/pats-univ-brand/ktm

Runs anywhere Python + Pillow exist (make-assets.sh uses a throwaway python:3.12-slim container).
"""

import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / 'apps/web/public'
MOBILE = ROOT / 'apps/mobile/assets'
PRINT = ROOT / 'apps/web/card-templates/ktm-2026'
BRAND = json.loads((ROOT / 'packages/shared/src/colors.json').read_text())['brand']


def load(path: Path) -> Image.Image:
    im = Image.open(path).convert('RGBA')
    # Strip only the fully transparent margin around the mark; the mark itself is untouched.
    box = im.getchannel('A').getbbox()
    return im.crop(box) if box else im


def fit(im: Image.Image, w: int, h: int | None = None) -> Image.Image:
    h = h or w
    scale = min(w / im.width, h / im.height)
    return im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)


def canvas(mark: Image.Image, w: int, h: int, background: str | None, scale: float) -> Image.Image:
    """The mark resized to `scale` of the canvas and centred on it (padding only)."""
    m = fit(mark, round(w * scale), round(h * scale))
    out = Image.new('RGBA', (w, h), background or (0, 0, 0, 0))
    out.alpha_composite(m, ((w - m.width) // 2, (h - m.height) // 2))
    return out.convert('RGB') if background else out


def width(im: Image.Image, w: int) -> Image.Image:
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def main(official: str, ktm: str) -> None:
    off = Path(official)
    crest = load(off / 'PATS UNIV_NEW LOGO-01.png')  # THE logo: full-colour crest
    lockup_cream = load(off / 'PATS UNIV_NEW LOGO-07.png')  # arched PATS / UNIVERSITY, cream: on navy
    lockup_navy = load(off / 'PATS UNIV_NEW LOGO-09.png')  # the same lockup in navy: on paper
    navy, cream = BRAND['navy'], BRAND['cream']

    (WEB / 'brand').mkdir(parents=True, exist_ok=True)
    for px in (64, 80, 120, 160, 240, 320, 480):
        fit(crest, px).save(WEB / f'brand/crest-{px}.png', optimize=True)
    for px in (240, 480, 720):
        width(lockup_cream, px).save(WEB / f'brand/lockup-cream-{px}.png', optimize=True)
        width(lockup_navy, px).save(WEB / f'brand/lockup-navy-{px}.png', optimize=True)

    # Favicons and touch icons: the full crest, never a cut-out. At 16-32 px its small text cannot
    # be read; that is accepted (Berlin, 18 Oct): the silhouette is still the crest.
    canvas(crest, 32, 32, None, 1.0).save(WEB / 'favicon-32.png', optimize=True)
    canvas(crest, 48, 48, None, 1.0).save(WEB / 'favicon-48.png', optimize=True)
    # Solid navy behind the crest, as on the official LOGO_BG-04; 86% leaves the crest its breathing room.
    canvas(crest, 192, 192, navy, 0.86).save(WEB / 'icon-192.png', optimize=True)
    canvas(crest, 512, 512, navy, 0.86).save(WEB / 'icon-512.png', optimize=True)
    canvas(crest, 180, 180, navy, 0.86).save(WEB / 'apple-touch-icon.png', optimize=True)
    canvas(crest, 1200, 630, navy, 0.78).save(WEB / 'og.png', optimize=True)

    # App (Expo): icon = LOGO-01 centred on solid navy (no alpha, iOS; Expo derives the AppIcon set); adaptive foreground = the crest
    # inside Android's 66% safe circle, the launcher draws brand navy behind it; splash = the crest.
    MOBILE.mkdir(parents=True, exist_ok=True)
    canvas(crest, 1024, 1024, navy, 0.86).save(MOBILE / 'icon.png', optimize=True)
    canvas(crest, 1024, 1024, None, 0.62).save(MOBILE / 'adaptive-icon.png', optimize=True)
    canvas(crest, 1024, 1024, None, 1.0).save(MOBILE / 'splash-icon.png', optimize=True)
    canvas(crest, 48, 48, None, 1.0).save(MOBILE / 'favicon.png', optimize=True)

    # KTM: the official blank front and the back, for screens (WebP) and for print (PNG, 300+ dpi).
    k = Path(ktm)
    front = Image.open(k / 'blank-front.png').convert('RGB')
    back = Image.open(k / 'example-back.png').convert('RGB')  # the back carries no personal data
    (WEB / 'ktm').mkdir(parents=True, exist_ok=True)
    for w in (800, 1600):
        width(front, w).save(WEB / f'ktm/front-{w}.webp', quality=86, method=6)
        width(back, w).save(WEB / f'ktm/back-{w}.webp', quality=86, method=6)
    PRINT.mkdir(parents=True, exist_ok=True)
    # CR80 + 3 mm bleed at ~400 dpi; the artwork is stretched over the bleed by the template.
    width(front, 1440).save(PRINT / 'front.jpg', quality=92)
    width(back, 1440).save(PRINT / 'back.jpg', quality=92)
    print('brand assets written')


if __name__ == '__main__':
    main(*sys.argv[1:3])
