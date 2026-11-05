# Fractional sprite placement

`Painter.sprite`, `mask` and `outline` sample source cells using pixel centers after placement.
The unrotated 1x paths previously rounded local coordinates down first, unlike their rotated
inverse-sampling paths. A 4×3 sprite at local `(0.75, 0.75)` with placement `(8, 8)` occupied
`(8, 8)..(11, 10)` at angle zero but jumped to `(9, 9)..(12, 11)` at angle `1e-10`.

The three unrotated source-cell writes now use the existing half-open rectangle rasterizer.
The example keeps the latter bounds at zero and tiny positive/negative angles. Equivalent local
and parent translations agree, including mirrored placement. Each cell is still composited once.

Compatibility scope:

- Integer local anchors with integer parent placement retain their pixels, including mirrors,
  sparse rows, tint, fade, alpha coverage and dither.
- `px`, `dot`, particles, rotated inverse sampling and integer sprite scales above 1 are unchanged.
- Fractional anchors and exactly half-cell parent translations can move by one cell per axis
  relative to the old locally rounded placement. This is an intentional sampling correction.
- Real crossings of a destination pixel center may still change a silhouette. This does not add
  antialiasing or guarantee improved artistic detail.

Focused check:

```sh
npm run build
node --test tests/sprite-placement-quality.test.mjs tests/painter-quality.test.mjs
```

Compatibility was checked against public baseline `b6627aae`.
The full build and 11 focused tests passed. Before editing, default runtime frames were captured
from this checkout at each effect's native FPS. After editing, per-frame SHA-256 hashes of both
raw color and raw light buffers matched for rocket (36 frames), health-bar-hit (61), arrow (18),
necro-skulls (90), hit-flash (16), and haste (36): 257 frames, zero changed color/light frames.
This is targeted compatibility evidence, not a full catalog or visual-art quality certification.
