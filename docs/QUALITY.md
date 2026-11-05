# Shared pixel VFX quality standard

Spatial Severance (`shadow/spatial-severance`) is a concrete reference for clean curves, controlled
particles, localized lighting, and fast readable timing. It is a reference, not a filter that can make
all existing effects equally good. Different effects still need deliberate composition and visual review.

## What improves automatically

Simulated `Particles` SPARK, MOTE, and STREAK now draw connected trails instead of overlapping lines or
half-pixel dot stamps. Their recent trajectories are reconstructed from the same constant-force motion
used by the simulator, limited by birth and the latest spark collision. A tail fades toward its origin,
a stepped bright head stays readable, and light is localized at the head. Motion, RNG consumption,
particle counts, and other particle kinds stay unchanged.

This applies to particles created and advanced by `Particles`. Manually reconstructed particle records
without trail history, including the existing Swarm/Ghosts loops, retain their original rendering.
Custom painters supporting only the original six methods also retain the original rendering.

For an unchanged catalog appearance use:

```ts
const fx = createFx(effect, { particleStyle: "classic" });
// Or opt an individual particle system out:
const particles = new Particles({ renderStyle: "classic" });
```

The classic option is a compatibility path, not a lower-resolution export mode. It does not change
ribbon geometry or authored effects that do not use the shared simulated particles.

Authored boundary repairs apply to both particle styles. Splash now includes its opening stone trail
(`176 × 104`, pivot `88, 82`); Sword Slash includes upward/outward motes (`144 × 120`, pivot `44, 108`).
Their local geometry and timing are unchanged. Warp In and Big Explosion keep their 3 s and 7.2 s
durations while late motes/stars and ash finish their own fades before the terminal frame. Classic
regressions preserve the original Sword Slash crop and the untouched early phases of both one-shots.

## Reusable authoring helpers

All helpers are exported from the package root and `core/index`.

- `pointedRibbon(left, right, upper, lower, bend?, tolerance?)` returns `top`, `bottom`, and a closed
  `shape`. The two adaptive cubic edges share exact needle tips. Upper/lower are control-point heights,
  so the visible maximum height is smaller. Use separate dark/body/core ribbons for hard palette steps.
- `motionTrail(position, age, seconds?, samples?, since?)` returns tail-to-head samples. It clips at birth
  or `since`, the most recent collision time. The trajectory function must be deterministic. For a
  curved flight, sample `fly(...)`, rather than drawing a straight segment from the current velocity.
- `drawTrail(painter, points, style)` draws a connected coverage-tapered trail, a palette-stepped head,
  and a small optional head light. At one logical pixel wide, taper opacity, not random pixel density.
- `stratified(count, rng, jitter?)` gives seeded positions in separate emission cells. Use at creation
  time so particles have intentional gaps and stable identity.
- `particleEnvelope(age, life, attack?, fadeStart?)` gives smooth normalized birth/death coverage.
- `painter.glowPath(points, radius, color, strength?)` emits light once per cell from the nearest segment.
  Adding more curve samples or retracing a segment does not make joins brighter. Color and strength may
  use global arc-length `u` and radius `v`. Separate calls remain additive, as separate lights should be.

No helper blurs the color buffer or removes nearest-neighbor pixel-art scaling. Glow is confined to the
existing light buffer. Keep noise and dithering intentional rather than using them to hide weak shapes.

## Required authoring and review pass

1. Name the silhouette, focal point, palette, and timing before drafting. Choose a relevant reference:
   Spatial Severance for a fast incision, sword-slash for an arc, frost-nova for radial shards, or an
   appropriate fire/smoke loop. Do not turn every effect into a cyan slash.
2. Prefer one continuous primary silhouette. Use adaptive curves, hard palette layers, and one
   uninterrupted highlight. Look for accidental notches, disconnected tips, and overexposed joins.
3. Give secondary particles a role and space. Use fewer coherent trajectories before adding more noise.
   Reserve the brightest ramp step for the impact and hot heads. Let fragments share the main motion.
4. Build a timing hierarchy: anticipation, fast release, brief focal flash, readable recovery, and a clean
   end. Frame-align a critical flash at the actual export fps; inspect motion, not just a hero image.
5. Keep a dark/body/core separation. Broad bloom and more white pixels do not automatically mean quality.
   Test over both the intended scene and transparency/checkerboard at logical 1x and nearest-neighbor 3x.
6. Render at native size and full playback speed. Record concrete observed defects; stop refining when the declared readability, timing, alpha and boundary criteria pass. A fixed number of iterations is not a quality measure.
7. Run `npm run build`, `npm run test:quality`, and `npm run check -- <id>`. Also run `test:3d` after shared
   renderer changes and `test:export` after export changes. A technical pass does not certify aesthetics.
8. Export GIF/MP4 and a transparent sprite sheet. Check first/impact/last frames, complete playback,
   flip/recolor/seed variants, bounds, final transparency or the loop seam, and target-game speed.

`tools/new` now starts with layered shapes, birth/death envelopes, and coherent trails. It is still a
starter. Do not describe a generated effect as reference-quality until the actual result is reviewed.

## Regression evidence

`tests/shared-quality.test.mjs` covers helper geometry, birth/collision clipping, deterministic drawing,
lighting overdraw, HDR, legacy painters, classic mode, and the three Spatial Severance variants.
`tests/catalog-quality.test.mjs` locks the classic baseline hashes. The six-case visual comparison covers sword-slash, hit-spark, mana-burst, warp-in, big-explosion, and
energy-core. Classic output was compared byte-for-byte to the previous engine across all 475 frames;
refined mode changes the five simulated-particle effects and preserves the manually reconstructed loop.
The older sword-slash bounds and warp-in/big-explosion terminal-pixel warnings are pre-existing catalog issues,
not silently waived quality guarantees. Address them when polishing those individual effects.
