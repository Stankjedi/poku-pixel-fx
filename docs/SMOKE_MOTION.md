# Smoke: connected volume and rolling folds

`weather/rising-smoke` is a 4-second, seekable loop. A narrow source carries widening folds upward;
rolled edges admit pockets of air and the top gradually loses optical thickness. The smoke receives
upper-left light but writes no additive light. It should not be recolored fire with sparks removed.

The loop supports `wind` (-14..22 px of authored lean), `density` (0..2), `turbulence` (0..1.5),
`seed`, palette, mirror and angle. Wind and turbulence are bounded to retain the intended source-scale
silhouette. `density: 0` is empty. Parameters shape an authored 2D volume; this is not a fluid solver.

## Reusable tools

- `smokeVolume(painter, cells, palette, style?)` first sums compact elliptical density kernels in
  local pixels, then shades/composites each screen cell once. Adjacent contributions form one volume
  instead of a stack of circles. Coverage is true alpha even in explicit dither mode. The palette
  stays quantized, and smoke never adds light.
- A `SmokeCell` has `x`, `y`, `rx`, `ry`, and `density`. Negative contributions carve entrained air.
  Radii must be positive and every value finite. The local field is limited to 4 million cells.
- `SmokeStyle` accepts `opacity`, `lightX` and `lightY`. Opacity scales optical thickness before
  `1 - exp(-density * opacity)`, not the RGB brightness. Light direction changes palette bands only.
- `smokeCurl(cells, x, y, radius, angle, turn, thickness, density, steps?)` appends one open tapered
  spiral to an existing density field. Join the outer end to a parent column; vary the fold's age,
  size, side and dissipation. Avoid repeating identical rings at regular spacing.

Transport remains the effect's responsibility. The loop uses material age to move and expand rolls,
then removes their density before wrapping. It never recycles a visible puff abruptly at the top.

## Existing effect

`explosions/smoke-bomb` keeps its canister flight, fuse, pop, sparks, debris, five-second duration and
palette controls. Its default `smokeStyle: "volume"` merges the billows, increases late buoyant rise,
and stretches shed vapour into thinning wisps. The flash still emits light; the smoke does not.

`smokeStyle: "classic"` retains the previous drawing and motion. All 151 original color and light
frames are covered by a SHA-256 regression with the original source compiled against the same core.

## Review and checks

Three rendered refinement passes were inspected:

1. A continuous density column replaced standalone puffs. The first curls were too small and regular.
2. Fewer, wider, asymmetric folds strengthened the silhouette. Smoke Bomb's dense core and numerous
   small edge coils were too busy, and its late legacy vapour still looked like circular beads.
3. Broader billows, fewer edge coils, a narrower dark ramp and shared-density trailing wisps removed
   those transitions. Recolored left-wind smoke was also checked on a light background.

Final GIFs were decoded and reviewed in consecutive five-frame samples at nearest-neighbor scale.
The loop is 240 encoded frames for two 4-second repeats; the bomb is 151 frames, 5.03 seconds including
its empty terminal frame. GIF centisecond delays alternate 30/40 ms to preserve 30 fps duration.
Transparent sprite sheets and full contact sheets accompany these local review exports.

`tests/smoke-quality.test.mjs` covers density addition, no emitted light, dither independence,
negative-density air, directional lighting, invalid geometry, exact looping, seeks, seeds, custom
palettes, rotations, mirrors, bounds, terminal transparency and exact classic compatibility.
Automated checks validate those contracts, not subjective artistic quality.
