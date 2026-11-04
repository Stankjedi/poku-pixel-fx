# Wind and airflow authoring

Ordinary air is visible through the things it carries: thin condensation streaks, dust and leaves.
Its shape should describe transport, not an opaque tube or an unrelated stack of circular rings.
`weather/crosswind-gust` is a lateral roll-up; `nature/tornado` is a rising funnel; `nature/leaf-storm`
is a magical expanding updraft. Keep those identities distinct.

## Reusable tools

- `helicalAirflow(u, options)` samples a rising helix. `height`, `radius` and optional `axis` describe
  its silhouette; the radius and axis may be functions of normalized age. `turns`, `phase` and `shear`
  describe differential rotation. `depth` is preserved separately from the screen `perspective`.
- `airflowTrail(position, age, seconds, samples, since)` samples the actual transport function,
  clips at birth, and splits at the front/back depth plane. Shared crossing endpoints prevent a
  false chord across a character. Its `from`/`to` values retain full-trail arc length, so every crossing
  does not restart the tail or create another bright head. Samples are bounded to 2..256.
- `drawAirflow(painter, runs, style)` draws coverage-tapered, connected tracers through `Painter.path`.
  Specify `back: true`/`false` for layered effects. It never emits light. The color is palette-stepped,
  opacity tapers at both ends, and nearest-neighbor pixel-art output stays intact.

These are deterministic kinematic authoring primitives, not a fluid-pressure or Navier–Stokes solver.
Sampling does not advance time or consume random numbers. Author each trajectory first, then reuse it
for tracers and entrained material. Use finite-life envelopes so a recycled parcel is already invisible.

## Existing effects and compatibility

Tornado now transports density coherently upward rather than choosing independent angular velocities
for every scanline. Its filaments rise, broaden and fade into shadowed condensation rolls. It no longer
emits a continuous column light; its deliberately authored lightning flash still emits light.
Leaf Storm's air tracers follow its expanding leaf updraft instead of staying at fixed heights. Its
original magical leaf glints and ambient aura remain.

Both accept `airStyle: "classic"` to reproduce their original color and light frames exactly. Seed,
palette, canvas dimensions, duration, actor choreography and original debris are preserved.

## Review and tests

Three visual passes replaced stationary hoops, restored longer readable trails after an overly sparse
first draft, and softened the tornado crown while reducing its unsupported emission. Crosswind's first
open fork was replaced with unequal tightening curls, then its trajectories were made tangent-continuous
at the roll-up join. Tracers and leaves use the same curve, and plain wind has no sparks or star glints.

`tests/air-quality.test.mjs` covers helix geometry, birth clipping, exact depth crossings, persistent taper,
input validation, original-frame hashes, seekability, exact loop seams, native bounds across every frame
and seed, recoloring, mirroring, and clean one-shot completion. Visually inspect GIF playback plus native
and 3× pixel views on dark and transparent/checkerboard backgrounds; numeric checks are not an art verdict.

Final CLI checks passed without warnings. A separate warmed 240-frame native benchmark measured median /
p95 times of 2.65 / 3.45 ms for Tornado, 1.09 / 1.64 ms for Leaf Storm, and 0.26 / 0.53 ms for
Crosswind Gust on this runner. Timings vary with runner load; density and crown shape are not removed
solely to meet a soft authoring threshold.
