"""Independent Adam7 fixtures: ImageMagick/libpng writes, Pillow reads the oracle.

This generator does not import the POKU encoder or decoder. It is only needed when
regenerating the tiny checked-in PNGs and manifest, not when running Node tests.
"""

import json
from pathlib import Path
import struct
import subprocess
import tempfile
import zlib

import PIL
from PIL import Image


ROOT = Path(__file__).resolve().parent
ALPHAS = [0, 1, 2, 8, 64, 128, 254, 255]
images = {}


def transparency_chunk(encoded, color):
    """Set tRNS independently of pass encoding; ImageMagick drops partial palette alpha.

    Only ancillary transparency changes. The external encoder's filtered, compressed,
    interlaced samples and palette are retained byte-for-byte.
    """
    output = bytearray(encoded[:8])
    palette_count = 0
    written = False
    offset = 8
    while offset < len(encoded):
        length = struct.unpack_from(">I", encoded, offset)[0]
        kind = encoded[offset + 4:offset + 8]
        if kind == b"PLTE":
            palette_count = length // 3
        if kind == b"IDAT" and not written:
            data = struct.pack(">H", 0) if color == 0 else bytes([0, 1] + [255] * (palette_count - 2))
            body = b"tRNS" + data
            output.extend(struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body)))
            written = True
        if kind != b"tRNS":
            output.extend(encoded[offset:offset + length + 12])
        offset += length + 12
    return bytes(output)


def record(name, image, color, depth=8, **save_options):
    with tempfile.TemporaryDirectory() as temp:
        source = Path(temp) / "source.png"
        image.save(source, **save_options)
        destination = ROOT / (name + ".png")
        subprocess.run([
            "magick", str(source), "-strip", "-interlace", "PNG", "-depth", str(depth if color == 0 else 8),
            *(["-alpha", "off"] if color in [0, 3] else []),
            "-define", f"png:color-type={color}",
            "-define", f"png:bit-depth={depth}", str(destination),
        ], check=True)
    encoded = destination.read_bytes()
    if color in [0, 3]:
        encoded = transparency_chunk(encoded, color)
        destination.write_bytes(encoded)
    with Image.open(destination) as decoded:
        images[name] = {
            "width": decoded.width, "height": decoded.height,
            "colorType": encoded[25], "bitDepth": encoded[24],
            "interlace": encoded[28],
            "rgba": list(decoded.convert("RGBA").tobytes()),
        }


for name, size in [("rgba-all-passes", (9, 9)), ("rgba-one-column", (1, 9)), ("rgba-one-row", (9, 1))]:
    image = Image.new("RGBA", size)
    image.putdata([
        ((37 + 23 * x + 13 * y) % 256, (211 + 17 * x - 19 * y) % 256,
         (19 + 29 * x + 31 * y) % 256, ALPHAS[(x + 3 * y) % len(ALPHAS)])
        for y in range(size[1]) for x in range(size[0])
    ])
    record(name, image, 6)

rgb = Image.new("RGB", (11, 7))
rgb.putdata([((x * 37 + y * 17) % 256, (x * 19 + y * 43) % 256, (x * 53 + y * 23) % 256)
             for y in range(7) for x in range(11)])
record("rgb-transparency", rgb, 2, transparency=(0, 0, 0))

gray_alpha = Image.new("LA", (9, 9))
gray_alpha.putdata([((x * 29 + y * 47) % 256, ALPHAS[(2 * x + y) % len(ALPHAS)])
                    for y in range(9) for x in range(9)])
record("gray-alpha", gray_alpha, 4)

for depth in [1, 2, 4, 8]:
    count = 1 << depth
    gray = Image.new("L", (13, 9))
    gray.putdata([round(((x * 3 + y * 5) % count) * 255 / (count - 1))
                  for y in range(9) for x in range(13)])
    record(f"gray-{depth}", gray, 0, depth)

for depth in [1, 2, 4, 8]:
    count = 1 << depth
    palette = Image.new("P", (13, 9))
    palette.putpalette([component for i in range(256)
                        for component in [(37 + i * 53) % 256, (211 + i * 23) % 256, (19 + i * 41) % 256]])
    palette.putdata([(x * 3 + y * 5) % count for y in range(9) for x in range(13)])
    record(f"indexed-{depth}", palette, 3, depth, bits=depth)

version = subprocess.run(["magick", "-version"], check=True, capture_output=True, text=True).stdout.splitlines()[0]
(ROOT / "manifest.json").write_text(json.dumps({
    "encoder": version,
    "referenceDecoder": f"Pillow {PIL.__version__}",
    "images": images,
}, indent=2) + "\n", encoding="utf-8")
print(f"Generated {len(images)} independent Adam7 fixtures.")
