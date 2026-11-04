# Ice Shatter 3D and solid debris authoring

`ice/ice-shatter-3d` is a 4.6-second, seeded one-shot. A six-sided ice pillar freezes into place, develops stress cracks attached to its real shell, and fractures at **0.96 s**. Twelve pieces reconstruct the intact volume before the hit; those same meshes then receive outward impulses, tumble, bounce, settle on a broad face and shrink away. Small fast ice chips clear before the heavy pieces. Ground fissures are angular and branching, rather than reusing an energy-ring silhouette.

```sh
npm run build
npm run render:3d -- shatter --frames 24
npm run render:3d:gif -- shatter --fps 24 --width 300 --height 210
npm run test:3d
```

Select **ICE SHATTER** in the 3D gallery. Import `iceShatter3D` from the `3d` entrypoint; `size`, `force`, `seed` and `palette` are the effect options. `ICE_SHATTER_HIT` is exported from the effect module for client choreography. Hit, flash, shake and sound cues use that same constant. Fixed-step playback, silent seeking and draw purity are preserved. Short palettes are resampled; an empty palette safely selects the default.

## Why a new fragment helper

`Particles3D` is appropriate for small points, sparks and stylized line shards. It does not rotate solid geometry or account for the outline of a mesh contacting the floor. `Fragments3D` fills that separate role without changing existing particles or the 2D engine.

```ts
import { Fragments3D } from "poku-pixel-fx/3d";
const fragments = new Fragments3D(0, 128);
fragments.spawn({
  mesh: { vertices, faces }, // local XYZ vertices and triangle indices
  position: [0, 2, 0], velocity: [3, 4, 1],
  angularVelocity: [2, -3, 4],
  palette: ["#164663", "#3686aa", "#81d5e6", "#e9fcf9"],
  life: 3.5, gravity: 10.8, drag: 0.72,
  bounce: 0.2, friction: 0.64, meltStart: 0.68,
});
// Call inside the effect's fixed-step update and draw contracts:
fragments.update(dt);
fragments.draw(painter);
```

- Local XYZ Euler rotations and world translation make each mesh genuinely three-dimensional. `drawFragment3D` and `transformFragment3D` also support stateless authoring.
- Gravity and drag use analytic free-flight integration. Collisions use the lowest transformed vertex, not the center or an oversized sphere. On low-energy impacts, a 0.24-second settling ease selects an outward support plane with a broad face. A resting piece keeps touching the floor as it shrinks.
- `restingRotation3D` can be used independently to derive a supported resting pose. Convex, closed meshes with non-degenerate faces are recommended. Triangle winding can vary because candidate support planes are checked against the entire mesh.
- A fragment is a solid palette-shaded object; its late-life fade is geometric shrinkage, not a transparent billboard. Drawing never mutates simulation state.
- This is **art-directed fixed-step debris**, not a rigid-body solver. It does not simulate fragment-to-fragment collisions, torque transfer or arbitrary collision meshes. Ground contact and settling should be inspected at the fixed 120 Hz timeline, not used as a claim of variable-step collision invariance.

## Verification

The dedicated regression suite checks fixed-step/seek equality, seed variation, repeat draw purity, camera parallax, fracture cues, empty start/end buffers, custom palettes, floor contact, broad-face settling, expiry/capacity and invalid update times. Automated checks supplement inspection of native pixel contact sheets and frames decoded from the actual GIF.
