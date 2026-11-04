# Nested effects and timed cue fades

`chain` composes small effects into a move without flattening its pixel layers. Each cue is drawn
through the parent's transform and style, so rotating, mirroring, stopping, or reducing the light
of a whole move also affects its children. No image resampling or full-frame brightness pass is used.

```ts
export const create = chain([
  { fx: charge, t: 0.1, until: 0.95, fadeIn: 0.12, fadeOut: 0.05, light: 0.75 },
  { fx: projectile, t: 0.9, until: 1.4, fadeIn: 0.05,
    x: (time) => 28 + (time - 0.9) * 320, y: -22 },
  { fx: explosion, t: 1.4, x: 188, light: 0.8 },
]);
```

- Positions and angles are local to the parent, including nested, rotated and mirrored moves.
  Position callbacks receive the move's time, not the child age. Mirroring reverses a local angle.
- `t` is inclusive; `until` is exclusive. A one-shot also ends at its natural duration. Zero-length
  windows draw nothing. Cues at time zero are available on the initial draw without an update.
- `fadeIn` and `fadeOut` are smoothstep durations in seconds, inside the active window. They multiply
  when they overlap. A loop needs a finite `until` to fade out; without one it keeps running.
- Fades scale each cue's Painter color coverage, additive light, and optional HDR light before those
  values enter the shared frame. Other effects already in the frame are not dimmed. This is per-draw
  coverage, not isolated group opacity: overlapping opaque shapes within one cue still composite.
- Matching an outgoing fade and an incoming fade over the same interval gives complementary weights.
  Local HDR illumination stays constant for equal lights. Color uses normal source-over blending,
  rather than a postprocessed image dissolve. Keep the overlap brief for crisp projectile handoffs.
- Child `light` multiplies the parent's light. A move with `light: 0` emits no child light. Calling
  `stop()` on the move fades children too, including nested cues.
- Parent `particleStyle` flows through the chain unless a cue explicitly sets it. Parent `palette`
  is a creation-time fallback; an explicit cue palette wins. Ramps still use `resolveOptions` fitting.
  A cue's explicit `seed` wins; otherwise the seed remains parent seed plus cue index.
- Invalid start/end/fade times throw a `RangeError`. Floating-point roundoff within one nanosecond
  is treated as an exact cue boundary, preventing a one-frame-late release after fixed-step updates.

## Direct custom composition

An effect instance also accepts `child.draw(frame, layer, parentPainter)`. Its `x`, `y`, `flip`, and
`angle` are then parent-local. The parent's current fade, light strength and particle style are
inherited, and the cached painter's placement/style/layer are restored even if the child throws.
The optional third argument is an `EffectDrawContext`, so custom composers can provide a small
snapshot rather than a Painter. Existing one- and two-argument draws keep their original behavior.

## Fireball Throw polish

`moves/fireball-throw` demonstrates the tool: gathering energy eases in, moves into the throwing
hand, then hands off over 0.05 seconds to the fireball. Each stage has its own restrained light
multiplier. The projectile's nose still meets the target at the existing hit time, 1.41 seconds;
its center is intentionally behind the target by the nose radius. The act's freeze and target
reaction remain synchronized. `choreography: "classic"` retains the original authored staging.

This change repairs composition, not the underlying flame or smoke simulation. Generic electric,
water, stone and wind effects retain their own material-specific shapes and timing.

## Checks

`npm run build && node --test tests/composition-quality.test.mjs` tests exact cue boundaries, active
simulation time, affine nesting, layers, restoration after exceptions, local light, stop fades,
palette/style/seed inheritance, repeatable draw, crossfades, and invalid inputs. The fixture preserves
55 pre-change samples across all 11 other existing moves, away from the corrected boundaries.
Ice Lance bounds are checked over complete animations at 30/60/120 fps, 13 seeds, and both directions.

The exact-boundary repair also exposes Ice Lance Throw's initial projectile tail, which the old
runtime skipped. Its canvas is now 324×136 with origin (96,134), adding 10 pixels on the left and
4 on the right. The extra right margin also retains the burst fringe between 30 fps samples. Its original 310×136 crop remains unchanged at the recorded compatibility samples.
Consumers importing sprite sheets should read the exported pivot, rather than hardcode it.

## Arrow Shot framing

`moves/arrow-shot` now exports a 344×88 canvas with origin (62,80). This adds 24 pixels
on the left, 20 on the right, and 14 above the original 300×74 sheet. The looping arrow
already has a full wake at its 0.56-second release; seeded hit sparks also reach past the
old top and right edges. The bow poses, projectile speed, 0.8-second hit, impact physics,
colors and 1.9-second duration are unchanged. Live placement still uses the same local anchor.
Read the exported pivot when importing the larger sheet; an existing fixed-size crop remains
pixel-identical in both color and light buffers.

`tests/arrow-shot-quality.test.mjs` checks complete 24/30/60/120 fps animations with 20 seeds,
both mirrors and particle styles, plus exact-release/subframe samples with 256 seeds. It also
preserves all 58 original-crop frames for seven seeds in each direction and particle style.
The broader repair audit checked 259 seeds at all four frame rates: all 4,144 combinations
fit the corrected color bounds, compared with 1,260 overflowing combinations before the repair.
