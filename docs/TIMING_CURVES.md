# Timing curves for authored motion

`createTimingCurve` separates the timing of a shape from its geometry. It addresses a practical authoring problem: handwritten phase formulas often mix travel, width, brightness and disappearance, making an ending accidentally stop, shrink into a fixed point, overshoot or change speed at a join. This helper makes those choices explicit. It does not judge artistic quality or automatically fix a weak silhouette.

## Start a timing-based effect

```sh
npm run build
node build-tools/tools/new.mjs projectiles/my-timed-effect --timing
npm run build
node build-tools/tools/render.mjs projectiles/my-timed-effect
```

`--timing` is opt-in and cannot be combined with `--loop`. Existing default and loop templates remain unchanged. The new starter is intentionally simple, with four separately editable channels: travel, width, opacity and light. It is a starting point for an artist, not a finished skill or a universal visual style.

## Author keys in real units

```ts
import { createTimingCurve } from 'poku-pixel-fx';

const travel = createTimingCurve([
  { time: 0, value: 0, velocity: 0 },
  { time: 0.25, value: 3 },
  { time: 0.9, value: 66, velocity: 85 },
], { after: 'continue' });

const opacity = createTimingCurve([
  { time: 0, value: 0 },
  { time: 0.1, value: 1 },
  { time: 1.1, value: 1 },
  { time: 1.6, value: 0, velocity: 0 },
]);

const { value: x, velocity: vx } = travel.sample(time);
const alpha = opacity.sample(time).value;
```

Time is seconds. Value is whatever channel you are controlling, such as local pixels, width scale or opacity. Velocity is value units per second. In the example above, motion continues while opacity fades; the shape does not have to contract to disappear.

Missing velocities use a monotone cubic interpolation (PCHIP). With all velocities automatic, each interval stays between its keyed values and plateaus remain flat. This avoids an unrequested extra bounce when an artist edits unevenly spaced keys. Explicit velocities are allowed to overshoot deliberately for anticipation, squash or recoil. The helper does not clamp that artistic choice away.

`sample(time)` returns value and its analytic velocity. Use the derivative for an emitter's `inheritedVelocity` or to align related motion, rather than guessing it from frame-to-frame state. Inputs are copied at creation; `curve.keys` exposes frozen resolved keys, including the selected velocities. Sampling is stateless and can seek backward. Keys are finite, strictly increasing, and limited to 2–1024. Invalid policies, duplicate times, sparse input and unrepresentable numeric results are rejected.

## Choose what happens after the last key

- `after: 'hold'` keeps the last value and returns zero velocity strictly after it. This is the default and is appropriate for an intentional stop or a held scalar value.
- `after: 'continue'` extends the final tangent. It continues only the scalar value; it does not extrapolate a clamped spatial path for you. The geometry used with it must also support the intended continuation.
- `before` accepts the same two choices independently and defaults to `hold`.
- Exactly on a key, sampling returns that key's resolved/authored velocity. A nonzero final velocity followed by `hold` is an intentional abrupt stop. Use `velocity: 0` at that final key if it should settle smoothly.
- Continuation never fades an effect automatically. Author opacity and lifespan separately, and leave enough canvas space for the continued motion.

Changing a progress curve alone cannot fix geometry that still clamps all positions to one endpoint. Both the timing and the course must express forward release. Likewise, a timing helper cannot remove flat cut faces from a water shader; that needs shape work.

## Practical example, not a quality score

`src/fx/projectiles/timing-comet.ts` uses four actual curves. Its `coast` option changes only the motion endpoint policy. The same shape, palette, early movement, width, opacity and light are used on both sides of the comparison. At 1.80 seconds the held version remains at x=52 with zero speed; the continued version has x=126.25 and 135 pixels/s. Twenty secondary motes sample the source position and inherit its curve-derived velocity at birth.

```sh
npm run build
node --test tests/timing-curve.test.mjs tests/timing-comet.test.mjs
node build-tools/tools/check.mjs projectiles/timing-comet
node tools/preview-timing-comet.mjs
```

Outputs in `records/projectiles/timing-comet/` include `endpoint-policy-comparison.gif`, the standalone GIF/MP4, transparent sprite sheet/JSON, pose images and `timing-data.json`. The JSON records actual keys and samples, not an aesthetic score. The compact amber comet is a behavior demonstration, not a finished-art quality guarantee.

## Suggested authoring pass

1. Name the intended action and ending: settle, stop, coast, disperse or loop. Pick a different shape language when the effect calls for it.
2. Block the motion and silhouette first. Use a small key table with meaningful times, not dense noise or many compensating formulas.
3. Keep travel, width, opacity and light separate unless they are deliberately linked. A fading light does not require shrinking the whole shape.
4. Inspect the join and ending at the target fps. Revisit the geometry as well as the timing if a trail collapses, a face clips flat or a hold looks rigid.
5. Add secondary motion that inherits a clear cause. Then review the full visual result; numerical continuity is necessary for some motions, not proof of excellent art.

No existing catalog effect or default template is automatically changed. The helper is opt-in and preserves the existing license notices.
