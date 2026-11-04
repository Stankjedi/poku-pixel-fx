# Powered projectile authoring

`projectiles/missile-salvo` stages three metallic missiles with separate acceleration arcs,
orange shock-diamond gas, exhaust that stays in world space after a turn, and staggered impacts.
It is a 352 × 232 one-shot (pivot 232, 204), lasts 3.8 seconds at 30 fps and ends transparent.
The three exact impact times are 1.08, 1.25 and 1.54 seconds (`missileTimings`).

## Shared engine additions

All exports are available through `core/index` and the package root.

- `CubicFlightPath([p0,p1,p2,p3], segments=256)` bakes cumulative distance along a cubic.
  `atDistance(fraction)` gives position and unit tangent; `atTime(time,duration,power=1)`
  adds speed. Timing advances arc distance, not the raw Bézier parameter. A power above
  one gives deliberate acceleration even when control points are unevenly spaced.
  Both endpoints are exact. Coincident points have a stable right-facing tangent.
- `createExhaustWake(path, options)` creates seeded spatial emission cells once.
  `sample(time)` is pure and seekable. Puffs detach at their birth heading, retain a
  configurable fraction of the projectile's world velocity, then decelerate and rise.
  Repeated draws or a different FPS cannot emit more particles. Increasing `spacing`
  reduces density and work; a maximum of 4096 cells bounds allocation.
- `dragDisplacement(velocity,acceleration,age,drag)` is exact for constant acceleration
  and linear drag. Zero drag is valid, and a series expansion avoids numerical loss
  near zero. Screen-space upward acceleration is negative.
- `drawRocketJet(painter,{x,y,angle,length,width,wobble,frame,palette})` draws nine-step
  colored gas and shock diamonds in nozzle-local coordinates without mutating the
  painter. It honors an enclosing effect's flip, rotation and nested placement.
  `projectiles/rocket` now uses this helper rather than a private horizontal-only jet. Its `legacy-horizontal` profile preserves
  existing composition pixels; new effects use the default nozzle-local oriented profile.

These are pixel-space art-direction helpers, not an aerodynamic or guidance simulation.
A sampled cubic length is approximate; raise its segment count for extreme curves.

## Materials and direction

The salvo keeps steel highlights and shaded fins separate from emitted light. Only the
nozzle, hot gas and sparse hot fragment heads glow. Mineral rubble stays non-emissive. Smoke uses the
existing merged, top-lit translucent volume rather than palette-colored circles.
Ground contacts spread dust horizontally and lift asymmetric flame tongues; the hot
flash is a short angular burst, not a spherical spell orb. Palette, metal and smoke
ramps remain independently configurable.

## Verification and visual refinement

1. Pass 1 established three distinct paths and verified the rotated nozzle integration.
   The sampled GIF revealed circular nested fire lobes and too-variable exhaust decay.
2. Pass 2 merged burning gas before palette quantization and narrowed puff lifespan
   variation. This made the wake continuous, but impacts still read too round.
3. Pass 3 stretched and tapered the gas lobes, replaced circular flashes with angular
   ground bursts, then reviewed the default GIF and a mirrored blue-palette variant.

`tests/propulsion-quality.test.mjs` covers distance timing, normalized headings, degenerate
paths, copied inputs, exact/tiny/zero drag, invalid inputs, bounded emission, seekability,
seed differences, painter-state preservation, native bounds across seeds and mirror
states, exact launch/impact instants, final transparency, registration and the existing
rocket integration. The visual review remains a separate requirement from passing tests. A pre-migration
fixture locks all 216 original rocket color/light frames across three seeds and both
mirror states, so existing Rocket Launcher choreography keeps its original pixels.

Render and export:

```sh
npm run build
node --test tests/propulsion-quality.test.mjs
npm run check -- projectiles/missile-salvo projectiles/rocket
npm run render -- projectiles/missile-salvo --gif --sheet
```

For a mirrored export in the same canvas, set `flip: true, x: 120, y: 204` so the
asymmetric pivot is mirrored too. In a game, `x` and `y` are the chosen world anchor.

The effect preserves the existing Sprite Fusion helper attribution and repository licenses.

## Contact-driven ground impacts

The salvo now uses the shared [impact interaction contract](IMPACT_INTERACTIONS.md): resolved contacts,
traveling ground uplift, material-specific bouncing rubble and collision dust. Its optional camera hook
moves the opaque scene while preserving transparent sheet pivots. Use `groundMaterial`, `impactStrength`,
the separate `ground` palette and `cameraMotion` to tune the response without recoloring stone as fire.
