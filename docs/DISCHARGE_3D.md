# Forked Lightning 3D

`lightning/forked-lightning-3d` is a seeded world-space discharge, separate from the 2D lightning catalog. Select **FORKED LIGHTNING** in the 3D gallery or render:

```sh
npm run build
npm run render:3d -- lightning --frames 36 --out records/3d/lightning.png
npm run render:3d:gif -- lightning --fps 40 --width 240 --height 200 --out records/3d/lightning.gif
```

## Material and timing

A dim leader advances in discrete steps from the upper endpoint to the ground. Unequal primary forks and smaller secondary forks attach to exact parent vertices and share their growth timing. Upward ground streamers appear before connection. Return strokes at 0.64, 0.94 and 1.39 seconds illuminate the **same channel**, rather than replacing it with unrelated random lines on every frame. Each pulse holds its peak for 25 ms so 30–60 fps captures retain the white hero frame, then decays exponentially. Thin forks lose current faster than the main channel. The final channel breaks into dim remnants and disappears; hot particles at the contact have their own short ballistic lifetime.

The six-step palette keeps white for the brief high-current trunk. Width, brightness and current decrease along child channels. There are no symmetric rings, broad beam meshes or constant-brightness tube surfaces. The normal color buffer stays pixel-crisp; emission and optional cinematic finishing remain separate.

## Reusable channel tools

```ts
import { createDischarge3D, drawDischarge3D, dischargePulse3D } from "poku-pixel-fx/3d";

// Create once when an electrical event begins. Both endpoints stay fixed exactly.
const channels = createDischarge3D({
  start: [-2, 5, -0.5], end: [1, 0.05, 0.3],
  seed: 42, roughness: 0.23, detail: 5, branches: 7,
});

// Draw without mutating geometry or consuming randomness.
drawDischarge3D(painter, channels, {
  progress: 1.5, // leader distance in main-channel lengths, including offshoots
  stroke: dischargePulse3D(seconds, [0.64, 0.94, 1.39]),
  residual: 0.08, radius: 0.047, emission: 0.18,
});
```

`createDischarge3D` returns a rooted topology with points, normalized arc lengths, parent/junction indices, generation, strength and root distance. Midpoint subdivision uses a local basis in XYZ, not a camera-facing plane. Branch length and direction vary independently; children are narrower than their parents. Seeds are reproducible, including zero. Detail is bounded to 2–7 subdivisions and primary branches to 0–12; equal endpoints produce an empty tree and non-finite endpoints are rejected.

`drawDischarge3D` clips growth by arc length, so child channels cannot appear before their junction. It uses the existing depth-tested rasterizer and palette colors at full opacity. Setting both `stroke` and `residual` to zero erases the discharge. Custom palettes of any nonzero length work; an empty palette uses the default. The effect's `height`, `branching`, `intensity` and `palette` can be overridden through `createFx3D`.

## Scope and verification

This is an art-directed dielectric-channel model, **not** an electrostatic field solver or a physical simulation of high-voltage safety. It does not calculate material conductivity, attraction to arbitrary scene geometry, collisions of the channel with meshes or sound propagation. The small contact glow uses the existing camera-facing additive primitive. CPU work is bounded by channel count, detail, screen coverage and particle count.

`tests/discharge-3d.test.mjs` covers topology continuity, unequal forks, real depth spread, endpoint anchoring, bounded input, leader ordering, palette-only color, depth occlusion, pulse timing, repeated-draw purity, fixed-step and seek equivalence, camera parallax, cue delivery, custom palettes, complete extinction and several-seed preview bounds. PNG/GIF export and visual inspection complement the tests; numeric checks alone do not establish artistic quality.
