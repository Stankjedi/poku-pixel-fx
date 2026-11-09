# Short-exposure spark field (explicit opt-in)

This opt-in CPU helper draws varied incandescent grains with short current motion traces,
size-dependent drag, separate front/back populations and a stable sparse light budget.
It is not a fluid solver, GPU/Niagara implementation, or an approved final fire design.
Existing effects and generator defaults are unchanged.

## Reuse the emitter

```ts
import { createSparkField2D } from 'poku-pixel-fx/core/spark-field';

const sparks = createSparkField2D({
  palette: ['#491923', '#d44220', '#ff9f31', '#fff0ae'], // cold to hot
  seed: 17,
  count: 360,
  start: 0.28,
  duration: 1.3,
  life: [0.32, 0.95],
  speed: [55, 160],
  width: [0.9, 2.2],
  drag: [0.45, 1.6],
  gravity: 26,
  spread: 1.6,
  shutter: 0.042,
  maxLength: 8,
  lightBudget: 24,
  emissionFrame: (birth, id, u) => ({
    position: [(u - 0.5) * 20, -8],
    direction: [0, -1],
    inheritedVelocity: [0, 0],
  }),
});

// In the effect's two passes; placement/rotation belongs to the Painter.
sparks.draw(painter, time, 'back');
// Draw the primary body here.
sparks.draw(painter, time, 'front');
```

The emission callback must be deterministic for the desired result. It is called once
per birth during construction, never while seeking or drawing. Returned coordinates
and velocity are snapshotted. Directions are normalized by angle, so their magnitude
does not set speed. Source velocity is added to outgoing velocity and then shares drag.

Motion is analytic linear drag plus constant vertical acceleration. Larger grains tend
to experience lower drag. This is an authored correlation, not a physical mass model.
Rear grains are smaller, dimmer and cooler. This is a 2D depth cue, not camera projection.

A trace contains three real trajectory samples over a short exposure. Its rear is cropped
along the two-segment polyline to `maxLength`, never extended before birth. The result is
a short chord approximation, not a motion-blur filter or exact curved arc-length solution.
No long historical ribbon or random per-frame texture is used.

Limits: 0..2048 births; life .01..4 seconds; outgoing speed 0..600 px/s; width .1..5;
drag 0..20; gravity -500..500; shutter 0...15 seconds; maxLength 0..24 pixels;
lightBudget 0..32; start and end of emission 0..3596 seconds. Sample time is -3600..3600.
Positions are within ±100000 and source direction/inherited velocity components within
±10000. The helper does not clamp motion to a canvas. Each effect must check its bounds.

Palettes contain 1..32 cold-to-hot colors. Packed colors become opaque. No white or other
unrequested color is inserted. Light is independent of matter colors and can be disabled
without changing the birth schedule or material pixels. Up to `lightBudget` fixed IDs are
selected over the whole emission window, not replenished to maintain that many live lights.
The helper caches only one time's samples. `sample()` returns fresh nested copies, and
`births` is immutable. Exact absolute particle deaths and the terminal end are empty.

## Use on a newly generated fire effect

```ts
import { createGenerationPlan2D, createGeneratedEffect2D } from 'poku-pixel-fx/authoring';
const plan = createGenerationPlan2D({ material: 'fire', action: 'dash', seed: 17 });
const effect = createGeneratedEffect2D(plan, {
  composition: 'material-volumes',
  fireSparks: 'short-exposure',
});
```

Only fire plume or dash with dissipation is supported by this option. It replaces the
old spark accent while preserving the primary body, trail, response, palette, metadata
and events. It works with body, volumes and material-volumes compositions. Existing
`layers.sparks` and `layers.light` flags still apply. Unsupported material/action/response
combinations throw instead of silently substituting another effect. Omission retains the
previous exact path. The CLI can explicitly select the same option as shown below. Omission keeps the
previous creation policy; no existing effect or saved project is rewritten.

## Actual review scope

A separately retained phoenix study used this helper on the prior frontal phoenix's
upper wing surface and terminal explosion. That unfinished comparison, its effect
source and intent records are not included in this reusable API change or catalog.
Its bird geometry, broad fire matter and choreography were preserved for comparison;
the study is not a completed phoenix.

Native stills show finer airborne wing grains and a more dispersed dash wake. The plume
change is modest. The old armor-like body and broad flat orange explosion lobes remain.
Normal-speed playback has not been viewed. A decoded GIF is not motion or art approval.
The final local verification report is in the separate study deliverable.


## Select when creating or previewing a new effect

In a source checkout with the directly compiled tools available:

```sh
node build-tools/tools/new.mjs fire/new-spark-plume --seed 17 --fire-sparks short-exposure
node build-tools/tools/new.mjs fire/new-spark-dash --material fire --action dash --distance 160 --travel 1.1 --seed 61 --fire-sparks short-exposure
node tools/poku.mjs preview-generation --material fire --action dash --distance 160 --travel 1.1 --seeds 17,61 --fire-sparks short-exposure --out NEW_DIRECTORY
```

`NEW_DIRECTORY` must not already exist and its parent must exist. Add `--gif` for
the existing optional GIF export, which requires ffmpeg. A preview does not create
or register a catalog effect and does not write an intent or approval record.

Both routes accept only the exact `short-exposure` value, on fire plume or fire dash
with dissipation. Unsupported materials, burst responses, generic templates,
missing/repeated flags and conflicting modes fail before creating effect/preview
files. An omitted flag keeps the old generated source and artwork.

`new.mjs` stores the selected option explicitly in the generated TypeScript source.
Its `.generation.json` still contains only the causal plan, not rendering choices.
Preview stores the option in `project.json` sequence cue `source.renderOptions` and
in each candidate's manifest `renderOptions`. Reopening that project through the
ordinary project renderer retains the selected style and exact seed.

This is a creation-workflow improvement using the already available spark artwork,
not a new shader, completed phoenix or additional visual-quality claim. There is
no automatic default promotion, seed ranking or invented review approval.

## Independently set birth count and spark light

The direct spark API accepts `lightStrength: 0..2`, a finite multiplier with default
`1`. It changes only the strength of the existing spark glow calls. At `0` there
are no spark glow calls, and `light: false` overrides any strength. Matter colors,
opacity, births, sample shape, trajectories, layers and allocated light IDs do not
change. Omitted strength and explicit `1` preserve the previous exact output.

For supported generation, use `fireSparkCount` (integer 0..720) and `fireSparkLight`
(finite 0..2). Both require explicit `fireSparks: 'short-exposure'`; unsupported
materials/actions/responses and malformed controls throw before generation.
Omitted count stays 360 for plume and 240 for dash; omitted light stays 1. Explicit
count 0 produces no sparks and does not fall back to the previous spark emitter.
The 720 limit is a bounded generation authoring budget, not the direct API's 2048
limit. Changing count changes the birth strata and fixed light-ID distribution;
changing light alone changes neither. Values are copied into the factory, so later
mutation of the supplied options cannot change created instances.

```ts
const effect = createGeneratedEffect2D(plan, {
  composition: 'material-volumes',
  fireSparks: 'short-exposure',
  fireSparkCount: 480,
  fireSparkLight: 0.5,
});
```

```sh
node build-tools/tools/new.mjs fire/tuned-spark-plume --fire-sparks short-exposure --fire-spark-count 480 --fire-spark-light 0.5
node build-tools/tools/preview-generation.mjs --material fire --action dash --seeds 17 --fire-sparks short-exposure --fire-spark-count 720 --fire-spark-light 2 --out NEW_DIRECTORY
```

The CLI accepts finite decimal numbers, including zero. Count must resolve to an
integer. Empty, nonfinite, out-of-range, missing, repeated or inapplicable options
are rejected before output writes. Controls are never inferred from an effect
name or automatically enabled. Only explicitly supplied controls are serialized:
new source stores them in its factory call, and preview stores them in the project
cue and manifest `renderOptions`. The causal generation plan remains unchanged.
Existing sources and saved project/export data keep their previous representation
when controls are omitted (preview timings still naturally vary between runs).

These are adjustable controls, not a fix for the existing primary body's artwork.
Stronger glow can wash out pixels, and more births can obscure the main silhouette.
Speed, width, life, bounds, palette and all other layer artwork remain unchanged.
Native-size comparison, complete bounds checks and full-speed review remain separate
from API tests. The isolated comparison intent is in `SPARK_CONTROLS_STUDY_INTENT.md`;
no normal-speed viewing or user approval is claimed by these controls.
