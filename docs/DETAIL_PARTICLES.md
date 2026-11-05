# Seekable detail particles

`createDetailParticles2D` builds a finite burst or emitter for secondary sparks and motes. Births and
random variation are baked once. `sample(time)` and `draw(painter, time)` can seek directly to any
time, including backward, without `update()` or frame-rate-dependent state.

```ts
import { createDetailParticles2D } from 'poku-pixel-fx/core/detail-particles';

const sparks = createDetailParticles2D({
  seed: 17, count: 24,
  palette: ['#fff3b0', '#ef944a', '#9f485a'], // young/hot to old/cool
  life: [0.3, 0.7], speed: [25, 75],
  angle: -Math.PI / 2, spread: Math.PI * 1.4,
  gravity: 90, drag: 1.2,
  size: [0.6, 1.3], endSize: 0.3,
  trailSeconds: 0.045,
});

// Inside an effect's draw(painter, time):
sparks.draw(painter, time);
// Set the effect's end at or after sparks.end to include the full fade.
```

## Controls

- `count` is bounded to 0–4096. Seeded variation is independent for each index, so changing only count
  preserves existing particles' IDs, birth times, and trajectories.
- `start` is the absolute emission start in seconds. `duration: 0` makes a burst; a positive duration
  distributes births through a finite window. `life`, `speed`, and `size` accept a number or `[min, max]`.
- `origin` is local `[x, y]` or a pure `(birthTime, id) => [x, y]` callback. The callback is evaluated
  once at birth during construction. Emitted particles stay at their own birth positions instead of
  following subsequent source movement. Parent painter transforms still move the whole effect.
- `inheritedVelocity` is a local `[vx, vy]` in pixels/s or a pure `(birthTime, id) => [vx, vy]`
  callback. It defaults to `[0, 0]` and is added to the seeded `speed`/`angle` velocity, without
  changing random variation. The callback is evaluated once per particle during construction at its
  absolute birth time, just like `origin`; vector values are copied, so later source or array changes
  cannot steer emitted particles. Negative components are allowed. Both components and the summed
  initial velocity must be finite. Gravity and drag then affect the combined velocity normally.
  Supply the moving source's derivative explicitly; `origin` is not differentiated automatically.
- `angle` and `spread` are radians, with positive y downward. A spread of zero follows one direction,
  while `Math.PI * 2` covers all directions. Gravity is pixels/s², speed pixels/s, and drag 1/s.
- Palette steps advance over life without color interpolation or automatic white. Width changes
  linearly from `size` to `size * endSize`. `opacity`, `attack`, and `fadeStart` control the smooth
  coverage envelope; the latter two are normalized life fractions. Exact birth and death draw nothing.
- `style: 'point'` draws a compact mote. The default `'spark'` draws a short actual trajectory using
  `trailSeconds` and 2–64 `trailSamples`. The trail cannot reach before birth.
- Subpixel widths fade coverage instead of randomly omitting particles. Stationary large particles
  retain their authored width. `emission` defaults to zero; when enabled it adds only head-local light
  through the existing light buffer. `lightRadius` controls its radius.
- An optional `layer` filters explicit `draw(painter, time, 'back' | 'front')` calls. Omitting the draw
  layer draws the emitter unconditionally. For `createFx`, use back emitters in `drawBack` and front
  emitters in `draw`, or pass explicit layers.

```ts
const wake = createDetailParticles2D({
  seed: 9, count: 36, palette: ['#c8ece2', '#75a9a6', '#426478'],
  start: 0.1, duration: 0.5, life: [0.25, 0.45],
  origin: birth => [birth * 80 - 24, Math.sin(birth * 4) * 6],
  inheritedVelocity: birth => [80, Math.cos(birth * 4) * 24],
  angle: Math.PI, spread: 0.6, speed: [8, 20], drag: 2,
  style: 'point', size: [0.6, 1.4], layer: 'back',
});
```

`sample(time)` returns fresh live state records with `id`, `born`, `age`, `life`, `progress`, `x`, `y`,
`vx`, `vy`, `size`, `alpha`, and `color`. At exact birth the record is live with zero alpha. Altering a
returned record does not affect the emitter. The frozen `particles` array exposes initial records;
`count` is the baked count, and `end` is the final death time, or `start` for zero particles.

This is an opt-in helper, not a change to catalog effects or existing `Particles`. There is no ground
collision, infinite loop, or 3D simulation. Sampling is O(count), and trajectory drawing is bounded by
trail sample count. Use existing simulated particles for bounce and spawned smoke. Build, then run
`node --test tests/detail-particles.test.mjs tests/particle-quality.test.mjs tests/shared-quality.test.mjs`.
