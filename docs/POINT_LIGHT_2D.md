# 2D point-light material response

This opt-in helper adds authored 2.5D material response without changing existing catalog rendering.

## What it does

`samplePointLight2D(light, position, normal)` computes received light from an authored 2.5D surface:

- Positions and normals share one coordinate system; negative z points toward the viewer.
- The normal is normalized internally. The response is non-negative Lambert diffuse.
- Falloff is `(1 - (distance / radius)^2)^2`, exactly zero at and beyond the radius.
- Radius is in native pixels; intensity is an artistic multiplier, not photometric units.
- The result includes direction, distance, attenuation and diffuse. Coincident source/surface
  positions have zero diffuse because the direction is undefined.
- Inputs are validated. The function neither changes input objects nor writes image buffers.

`localPointLight2D(painter, worldLight)` converts a world/frame light after Painter placement.
Translation, rotation and x mirroring are supported. Camera offsets do not move the world light.
It does not support nonuniform scale or infer depth from a flat image.

`createPointLightSampler2D(light, normal)` compiles one fixed-normal surface for pixel shaders.
It returns `(x, y, z) => diffuse`, snapshots the source/normal, and avoids vector allocation and
repeated source/normal validation for every pixel. Recreate it when the light or normal changes.
The initial full scene had a slow-frame warning; using this path for the floor removed that warning.
No general performance claim is made beyond this checked scene and host.

```ts
import { localPointLight2D, samplePointLight2D, createPointLightSampler2D } from 'poku-pixel-fx';

// Call after painter.place(), including a nested placement.
const local = localPointLight2D(painter, {
  position: [170, 90, -38], radius: 122, intensity: 1.8,
});
const response = samplePointLight2D(local, [8, -12, -5], [0.6, 0, -0.8]);
const paletteStep = Math.min(6, Math.floor(baseStep + response.diffuse * 3.4));

const floorLight = createPointLightSampler2D(local, [0, -0.48, -0.88]);
painter.shade(-80, 0, 80, 50, (x, y, out) => {
  out.c = ramp[Math.min(6, Math.floor(1 + floorLight(x, y, 14) * 3.4))];
  out.a = 1;
});
```

## Actual scene

`arcane/point-lit-rupture` moves a charge over a stone floor, compresses it and releases a short
asymmetric energy burst. Nearby floor pixels and distinct stone faces receive light from the moving
source. The source then cools independently of the residual fragments.

- `receiveLight: false` disables only material receiving. Source, particles, geometry, opacity and
  additive glow remain identical. This is the comparison control.
- `pointLight` optionally supplies an external world/frame light for diagnostic or host control.
  It changes receiving light, not the visible charge trajectory.
- `sourceAt(t)` exposes the demonstration source in effect-local coordinates.
- The scene is a small functional lighting example, not a universal visual style.

## Limits

The host supplies depth and normals. No cast shadows, occlusion, color mixing, reflection,
automatic normal extraction, physical inverse-square transport or global catalog relighting is
implemented. The scene uses illustrative 2.5D coordinates, not a true 3D perspective reconstruction.
The stepped light boundary follows the authored palette, and the stones are deliberately simple.

## Minimal validation

```
npm run build
node --test tests/point-light-2d.test.mjs
node tools/preview-point-lit-rupture.mjs
node build-tools/tools/check.mjs arcane/point-lit-rupture
```

Build succeeded. Six focused tests pass, covering analytic response, transforms, invalid inputs,
source immutability, optimized/reference agreement, deterministic seeking, endpoint cleanup and
material-only changes. Effect check has zero warnings. No full repository test pass is claimed.
The final on/off animation changes 390,699 frame-pixel material samples while preserving alpha
and additive emission exactly. The no-glow comparison visibly confirms that this is surface
receiving light rather than an added bloom overlay.

Outputs are in `records/arcane/point-lit-rupture/`. The single GIF is 768 x 672; the comparison is
1024 x 484. Both are 50 fps, 131 frames, 2.62 s including the empty terminal frame.

## Checkpoint scope

The full-source checkpoint contains the b6627aa tracked baseline plus this point-light module,
its core export lines, scene, preview script, focused test, documentation and previews.
Parallel workers' later edits are intentionally excluded from this isolated checkpoint. They must
be backed up by a later integrated checkpoint. No source is published to GitHub by this work.
