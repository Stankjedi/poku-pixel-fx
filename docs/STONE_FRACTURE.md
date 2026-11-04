# Dry stone: fitted fractures and heavy rubble

`nature/rock-fracture` is a non-emissive sandstone breakup, deliberately different from
ice crystals, glowing fissures, and buoyant smoke. It has layered bedding, a short
left-to-right crack lead-in, compact angular blocks, heavy ballistic fall, low bounces,
contact dust, a brief rubble hold, and a ground-anchored decay. The material does not
produce hot cores, sparkle stars, crystal glints, energy rings, or rising smoke.

## Reusable authoring helpers

`src/core/stone.ts` exports these helpers through the core entry point:

- `fractureStone(polygon, { seed, pieces, minArea })`: splits a convex polygon into
  fitted convex cells. Each cell contains `polygon`, its area centroid `center`, and
  `area`. Shared cut boundaries and total source area are preserved. Candidate cuts
  are ranked by compactness to avoid long needle-like shards. The requested piece
  count is a maximum; `minArea` can stop splitting sooner. Either winding is accepted,
  inputs are not mutated, and concave, self-intersecting, degenerate, or invalid inputs
  are rejected. Coordinates are restricted to +/-1e6, with 3..256 vertices and 1..256 cells.
- `rubblePath(centeredVertices, launch, options)`: precomputes a fixed 240 Hz debris
  path, with gravity, damped floor bounces, tangential friction, and rotation-dependent
  polygon support. `sample(time)` is independent of caller frame rate and sampling
  order. `impacts` gives one event per collision with time, floor position, and incoming
  speed, allowing dust to originate at real landing points. The path stops moving after
  low-energy contact. Numeric inputs are bounded to +/-1e6 to prevent overflow. `duration` is limited to 30 seconds; samples after it hold the last
  state. This is a small VFX solver, not general rigid-body physics: bodies do not collide
  with one another, and collision time is quantized to the fixed step.

Keep dark fracture seams separate from outer material edges. Draw sparse strata in
the source polygon's coordinates so lines stay attached when each block rotates.
Do not replace the original shape with unrelated randomly generated triangles.
Low, expanding, genuinely translucent dust is secondary to the solid silhouette.

## Effect options and rendering

`palette` is a six-step stone ramp and supports recoloring. `pieces` is clamped to
6..28 and `force` to 0.5..1.3 to keep the documented canvas. `seed` changes both the
fracture layout and movement. `flip` and the shared transform options remain available.

```sh
npm run build
node build-tools/tools/render.mjs nature/rock-fracture --gif --sheet --scale 4
node build-tools/tools/check.mjs nature/rock-fracture
node --test tests/stone-quality.test.mjs
```

Tests cover fitted coverage and area conservation, compactness, winding and input
preservation, seeded results, numeric guards, rotation-aware ground contact, bounce
damping and settled state, order-independent samples, frame-rate consistency,
recoloring, no emitted light, transparent terminal frames, and full raw-frame bounds
for multiple seeds and the exposed range extremes. Tests cannot replace visual review.

## Visual review

Three render rounds were inspected. The first exposed thin triangular shards and
floating late decay. The second introduced compact-cut selection, restrained bedding,
stronger landing dust, and ground-anchored shrink. The third fixed premature right-side
cracks, so all seams now build during anticipation. The encoded GIF is decoded for
frame/timing checks and inspected separately from the renderer's contact sheet.
