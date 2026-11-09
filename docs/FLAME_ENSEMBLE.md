# Opt-in finite fire APIs

These modules are explicitly imported helpers. They do not register effects or change the catalog, generator defaults, existing effects or the root/core export barrels. They are stylized CPU pixel rendering, not Unreal/Niagara integration, a GPU/fluid solver or an accepted artwork preset.

This document describes a locally built candidate. It does not assert availability in a published package; packaging and publishing have not been exercised.

## Import and draw

The existing package subpath mapping exposes both JavaScript and TypeScript declarations. Do not add `.js` to these package specifiers:

```ts
import { createFrame, Painter } from 'poku-pixel-fx';
import { createFlameEnsemble2D } from 'poku-pixel-fx/core/flame-ensemble';
import { createFlameMatter2D } from 'poku-pixel-fx/core/flame-matter';

const frame = createFrame(256, 256);
const painter = new Painter(frame).place(128, 210);
const fire = createFlameEnsemble2D({
  seed: 17,
  palette: ['#250e18', '#b53421', '#ed5a17', '#ff9026', '#ffc65a', '#fff3cb'],
  start: 0,
  duration: 1.5,
  sizeScale: 1,
  speedScale: 0.85,
  inheritedVelocityScale: 0.3,
  density: 2,
  flutter: { amplitude: 5, frequency: 2 },
  layers: { light: false },
  emissionFrame: (_birth, _id, u) => ({
    position: [(u - 0.5) * 32, 0],
    direction: [0, -1],
    inheritedVelocity: [0, 0],
  }),
});
// Clear the frame between rendered times. Draw back before front.
fire.drawBack(painter, 0.7);
fire.draw(painter, 0.7);
```

The caller authors a meaningful source and primary silhouette. An emitter does not establish that its source lies on a solid/material surface. All source positions, velocities, angles, sizes and flow are in effect/Painter-local coordinates. Painter placement rotates/mirrors the complete result; `flowAngle:0` is not absolute screen-up after placement.

## Flame matter

`createFlameMatter2D({seed,palette}).draw(painter,sample)` draws finite tongue or mass material with stepped palette colors, evolving curved boundaries and no implicit light or path history. Palette alpha is forced opaque; sample opacity controls coverage. Palette/geometry are snapshotted and retained shader callbacks are independent.

Sample limits:
- IDs/seeds: uint32. Palette: 1–32 dense #rgb/#rrggbb or signed/unsigned packed 32-bit colors, cold to hot.
- Position components: ±1,000,000. Half-size components: .125–128.
- Shape/flow angles: ±1,000,000 radians. Time: ±3,600 seconds.
- Burnout and opacity: 0–1. Burnout 1 or opacity 0 is empty after validating inputs.

Flow direction is independent of geometry angle, aspect ratio and consumption shrink. It describes translation of two noise fields, not physical particle velocity. The helper evaluates at most two noise fields per shaded cell and retains no raster or ID cache. Burnout narrows only conservative traversal bounds; it does not change the shader arithmetic.

At burnout zero and positive opacity, the exact center and normalized local [0,-.45] point are inside both profiles. This is a continuous shader-point guarantee, not a nearest-pixel guarantee. Subpixel shapes may cover no pixel centers. Do not infer surface attachment for an arbitrary caller source or a consumed body from it.

## Flame ensemble

`createFlameEnsemble2D(options)` returns frozen `{count,end,prepare,sample,drawBack,draw}`. Source values are sampled once during construction, never while seeking. Arrays/options/source results are copied. A private one-time cache holds at most 416 samples; `sample(time)` returns fresh scalar records.

The emission callback must be deterministic from its arguments for layer-toggle reproducibility. Disabling a layer changes callback invocation count/order. Invalid callback results throw during construction; do not use side effects to drive source geometry.

Supported controls:
- Start: 0–3598 seconds. Duration: 0–60, with start+duration ≤3598. Query time: ±3600. Life ≤1.35 seconds, independent of the time origin. `sample(end)` is empty, and a particle is absent at its own absolute death time.
- Position components: ±100,000. Outgoing direction and inherited velocity components: ±10,000. Any finite nonzero direction within those component bounds is valid; its magnitude does not change speed, including very small/subnormal vectors.
- Size scale .25–3 and outgoing-speed scale .25–6 are independent. Inherited-velocity scale 0–1 multiplies only supplied inherited motion.
- Density .25–4 scales the fixed coarse/fine/spark budgets, up to 416 births. Density redistributes emission strata/times; it is not promised to preserve existing individual trajectories.
- Flutter amplitude 0–32 pixels and frequency 0–6 Hz. Optional sideways displacement and its analytic velocity start at zero; maximum offset is amplitude, derivative bound is amplitude × π × frequency. This is authored motion, not a fluid field.
- Coarse, fine, spark and light layers are independently switchable. Light is enabled by default only inside an explicitly created ensemble. At most six birth-selected light candidates retain eligibility for life; there is no reassignment when one dies. Radius ≤24 and intensity ≤.16 before lifetime/birth modulation.

Intensity accepts 2–16 strictly ordered [normalized birth stratum, strength] keys, endpoints 0 and 1, both values 0–1. It changes birth size/opacity and derived lighting, not live particles immediately. When duration is positive, the stratum maps to emission time. Zero/near-zero duration preserves stratum variation in a simultaneous burst rather than collapsing to one key. An all-zero curve is empty.

## Error and support boundaries

Nonfinite/out-of-range values, malformed/sparse palettes and invalid layers are rejected. Source/caller errors are not converted into fabricated visuals. Rendering is seekable and does not call the source again. Out-of-lifetime caches are empty even when the start is large enough for floating-point subtraction to lose precision.

Bounds and particle budgets are not a guaranteed frame-time budget. Material-only CPU savings do not establish whole-effect FPS; composition, scene size, light, overlap, CPU scheduling and the chosen controls matter. No GPU-performance claim is made.

The demonstration phoenix remains an isolated visual experiment, not part of this candidate: its constructed inner wings and rounded explosion are unresolved, and normal-speed playback has not been reviewed. Native and full-speed review are still required for any new effect. Preserve LICENSE, NOTICE.md and applicable third-party notices when redistributing.
