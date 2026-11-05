"""Independent PNG fixtures: run with Python + Pillow, not the POKU PNG writer."""
from pathlib import Path
from PIL import Image, __version__
import json

root = Path(__file__).resolve().parent
manifest = {'encoder': 'Pillow ' + __version__, 'images': {}}
def save(name, mode, size, pixels, **options):
    image = Image.new(mode, size)
    image.putdata(pixels)
    if mode == 'P':
        image.putpalette([component for i in range(256) for component in ((i * 73) % 256, (i * 31) % 256, (255 - i * 17) % 256)])
    image.save(root / (name + '.png'), **options)
    with Image.open(root / (name + '.png')) as loaded:
        manifest['images'][name] = {'width': loaded.width, 'height': loaded.height, 'rgba': list(loaded.convert('RGBA').tobytes())}

save('rgba-sheet', 'RGBA', (4, 2), [(255, 0, 0, 128), (0, 255, 0, 255), (0, 0, 255, 64), (37, 19, 211, 0), (10, 20, 30, 255), (10, 20, 30, 255), (12, 34, 56, 200), (90, 80, 70, 255)])
save('rgb', 'RGB', (3, 2), [(i * 39, i * 21, 255 - i * 40) for i in range(6)])
save('gray', 'L', (3, 2), [0, 255, 127, 63, 1, 219])
save('gray-alpha', 'LA', (3, 2), [(0, 0), (100, 127), (255, 255), (0, 255), (80, 64), (219, 222)])
save('rgb-trns', 'RGB', (3, 1), [(31, 63, 127), (0, 255, 128), (31, 63, 127)], transparency=(31, 63, 127))
save('gray-trns', 'L', (3, 1), [63, 127, 63], transparency=63)
for bits in (1, 2, 4, 8):
    count = min(2 ** bits, 16)
    save('indexed-' + str(bits), 'P', (5, 2), [i % count for i in range(10)], bits=bits, transparency=bytes([0, 127] + [255] * (count - 2)))
(root / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
