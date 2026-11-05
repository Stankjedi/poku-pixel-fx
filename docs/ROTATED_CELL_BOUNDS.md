# Rotated cell candidate bounds

## Reproduced defect

Drawing an 8×8 solid sprite clip at `Painter.place(8.5, 8, false, Math.PI)` discarded seven cells that the equivalent `Painter.sprite` and a full-destination inverse-coordinate scan retained. The clip data was intact. Its per-pixel rectangles exposed an error in `Painter.each`, the common filled-shape iterator.

The transformed corner bounds were tightly rounded to candidate pixel centers. Floating-point forward and inverse transforms can disagree at a boundary, especially near cardinal rotations. A pixel that passed the existing inverse-coordinate test could therefore be omitted before that test ran.

## Fix and scope

Only rotated candidate bounds now use outward floor/ceil rounding. Each edge gains at most one candidate pixel. The existing inverse-coordinate rejection still decides inclusion; rectangles retain their half-open local bounds. This corrects the shared rasterization path rather than special-casing sprite clips.

- No-rotation candidate bounds and the rectangle fast path are unchanged.
- Transform math, coordinate snapping, palettes, fade, alpha modes and light accumulation are unchanged.
- Adjacent translucent cells still composite once. The expanded bounds are candidates, not an expansion of the shape.
- Previously missing rotated-boundary cells may now appear. Pixel-perfect equivalence to every old rotated output is neither expected nor claimed.
- Existing floating-point tie behavior at exact boundaries is retained. This is not a redesign of rotation sampling, an extreme-coordinate precision guarantee, or an improvement to the artwork itself. The extra border scan has not been performance-benchmarked.

## Focused verification

`tests/rotated-cell-quality.test.mjs` checks the seven-cell reproduction and compares colored/translucent clips against a full-destination inverse-coordinate reference. It covers integer and fractional placement, mirrors, cardinal/general/near-cardinal angles, coverage/dither modes and unchanged light buffers.

The existing painter, sprite-placement, sprite-clip and new sheet-timing tests also pass. Six default effects (`projectiles/rocket`, `ui/health-bar-hit`, `projectiles/arrow`, `shadow/necro-skulls`, `impacts/hit-flash`, `status/haste`) retained identical per-frame raw color/light hashes across 257 frames. This is a bounded compatibility sample, not the entire effect catalog.
