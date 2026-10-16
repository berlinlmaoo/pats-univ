"""Place an image centred on a square canvas (sips can resize but not composite).

usage: python3 compose.py <in.png> <out.png> <canvas px> <background: #rrggbb | transparent>
The input must already be resized (with sips). A solid background drops the alpha channel,
which iOS requires for the app icon.
"""

import sys

from PIL import Image


def main(src_path: str, out_path: str, size: str, background: str) -> None:
    src = Image.open(src_path).convert('RGBA')
    n = int(size)
    solid = background != 'transparent'
    canvas = Image.new('RGBA', (n, n), background if solid else (0, 0, 0, 0))
    canvas.alpha_composite(src, ((n - src.width) // 2, (n - src.height) // 2))
    (canvas.convert('RGB') if solid else canvas).save(out_path)


if __name__ == '__main__':
    main(*sys.argv[1:5])
