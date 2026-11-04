# Continuous 2D lightning light

The shared `stroke` and `crackle` helpers in `src/fx/lightning/_lib.ts` now light each connected electric
channel with `Painter.glowPath`. Previously they added a radial light at every third control point.
That made tessellation density change brightness, left sparse channels partly unlit, and washed out tight
bends. Full strokes now keep the blue-violet edge steps and white core readable, with continuous local
light along the channel. This is a lightning-specific refinement, not a generic glow filter for fire,
smoke, water, slashes, or every other material.

## Preserved and changed

- The raw pixel-art color buffer, authored palettes, silhouettes, source geometry, branching, flicker,
  particle movement, simulation, and RNG consumption are unchanged at default options.
- Light is intentionally different. The 12 lightning catalog effects retain their raw-color hashes over
  all 879 default rendered frames. Ten use the updated helpers; ion-stormburst and plasma-ball do not.
- Opacity now fades emission as well as ink. Alpha zero no longer leaves a detached glow behind.
- `minY` clips the source centerline at the actual crossing. The radial falloff may still extend beyond
  that source boundary, matching its original intent. Separate branches remain separate additive lights.
- `particleStyle: "classic"` still selects the old particle rendering only. It does not disable this
  lightning light correction.
- There is no blur, resampling, or new color in the raw pixel-art buffer. Export stays nearest-neighbor.

The shared path-light rasterizer also avoids visiting cells whose constant light strength cannot survive
its existing 0.004 emission cutoff. Falloff still uses the original radius. Constant-strength and
uncropped callback-reference renders match exactly, including HDR, transforms, and clipped frame origins.

## Verification

`npm run test:quality` includes `tests/lightning-quality.test.mjs`:

- The same line with 2 or 49 points, or retraced geometry, has identical LDR/HDR light.
- Rotation, mirroring, opacity, fade, light strength, source clipping, and disabling light are covered.
- Lighting does not alter the hard palette-stepped ink buffer.
- Every catalog raw-color frame matches the starting-snapshot fixture.
- A 64-case constant-light/reference matrix covers four radii, eight intensities, and both flip states
  across LDR and HDR output.

Run `npm run build`, `npm run test:quality`, `npm run test:3d`, `npm run test:export`, and
`npm run check -- lightning`. The existing ion-stormburst seed-dependent six-pixel bounds warning is
not fixed by this work; no new catalog check warning was introduced.

## Visual review and cost

Review native-size and enlarged nearest-neighbor output, dark and transparent backgrounds, first/strike/
last frames, and recolored/flipped variants. A uniform path light is an objective rendering correction;
whether its more restrained halo is artistically preferable remains subjective and should be judged
in the target game's scene.

The continuous distance-based light costs more than the old sparse point lights. In one local benchmark
of four representative effects, median draw times were 0.25–0.69 ms, and the heaviest lightning-strike
95th percentile was about 5.16 ms (old renderer: 3.52 ms). These are container measurements, not device
performance guarantees. Batch-heavy game scenes should be profiled before adoption.
