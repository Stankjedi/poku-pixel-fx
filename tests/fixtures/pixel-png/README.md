# Native Adam7 PNG fixtures

`generate.py` creates these small interlaced PNGs using **ImageMagick/libpng**.
**Pillow** decodes the resulting files into the straight RGBA byte oracle in
`manifest.json`. Neither encoder nor reference decoder uses POKU code.
The generator inserts grayscale/palette `tRNS` metadata after ImageMagick writes
the file; the encoded Adam7 samples, row filters, palette and compressed stream
remain the external encoder's output. This avoids ImageMagick discarding partial
palette alpha while still testing exact transparency and pass reconstruction.

The fixtures exercise all seven Adam7 passes, one-cell-width/height cases,
RGB and grayscale transparency keys, gray-alpha, indexed 1/2/4/8-bit palettes,
packed 1/2/4-bit grayscale, and RGB hidden under alpha 0 or 1. Filtering and
palette layout are selected independently by the external PNG encoder.

Node tests read the checked-in PNGs and manifest; they do not need Python or
ImageMagick. To regenerate them, install Pillow and ImageMagick with PNG support
and run `python tests/fixtures/pixel-png/generate.py`.
