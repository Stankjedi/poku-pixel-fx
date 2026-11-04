# Void Rift 3D: folded darkness and inward motion

`shadow/void-rift-3d` is available as `voidRift3D`, as **VOID RIFT · 공허의 균열** in the 3D gallery, and as `voidrift` in both 3D exporters.

```bash
npm run build
npm run render:3d -- voidrift --frames 28 --grid false --out records/3d/void-rift.png
npm run render:3d:gif -- voidrift --fps 24 --grid false --out records/3d/void-rift.gif
npm run render:3d -- voidrift --yaw 130 --elevation 42 --grid false --out records/3d/void-rift-rear.png
```

## Visual grammar

This is torn, folded void material, not an accretion disk, circular shockwave or generic luminous ring. Its narrow vertical cut opens into an irregular black throat framed by thick faceted lips. Six rooted, tapering hooks bend in XYZ, while distinct solid splinters accelerate inward along continuous curved paths. The slit seals inward from its two tips, leaving a fading incision.

The dark central surface is opaque and slightly concave. It occludes background geometry and far-side matter. The lips and tendrils are actual capped meshes, with small depth-dependent violet seams rather than broad glow. Geometry remains visible with additive light disabled. Front, oblique and rear views have different silhouettes and correct depth ordering.

Timing is in seconds:

- 0–0.62: a center-out incision.
- 0.62–1.25: the slit opens, then hooked material grows from its moving lips.
- 1.25–3.55: restrained breathing and travelling hook motion; solid debris accelerates toward the throat.
- 3.55–4.5: both tips seal toward the center; attached hooks retract with the same local opening.
- 4.5–5.2: the remaining scar fades to an empty frame.

The current eight-step palette resamples shorter custom ramps. `size` is clamped to 0.4–1.5 and `pull` to 0.4–1.7. `pull` changes debris travel duration; every late particle still expires before the scar phase. Seeded variation affects the tear edges, hooks and individual debris paths. The geometry and paths are analytic art direction on the engine's fixed 120 Hz timeline, not a fluid, elastic-body or gravitational simulation.

The gallery and export commands use no external point-light rig for this effect, including in cinematic mode, so the black throat does not turn into a brightly lit blue plate. Cinematic tone mapping and bloom can still finish its authored seams. Hosts may add their own lights intentionally.

## Reusable polygon sweeps

`createSweep3D` and `drawSweep3D` are independent of the 2D core. Use them for solid horns, roots, bent cables and folded strips that need stable cross sections under orbit.

```ts
import { createSweep3D, drawSweep3D } from 'poku-pixel-fx/3d';
const mesh = createSweep3D([
  { position: [0, 0, 0], width: 0.3, thickness: 0.15 },
  { position: [0.5, 1, 0.2], width: 0.2, thickness: 0.1, twist: 0.4 },
  { position: [0.2, 2, 0.7], width: 0, thickness: 0 },
], 5, [1, 0, 0]);
drawSweep3D(painter, mesh, ['#171027', '#38234b', '#815194']);
```

Each section has a world-space position, elliptical cross-section radii and optional tangent-axis twist. The helper projects the previous normal into the next tangent plane instead of repeatedly deriving a normal from world up. This avoids frame flips as a curved path crosses vertical. Returned frames support attached decorations. Three to 32 polygon sides are supported, and both ends are capped. A zero-radius endpoint forms a tip.

Adjacent duplicate positions, non-finite values and negative radii are rejected. Paths shorter than two points return empty geometry. At exact reversals the tangent is ambiguous; author a rounded bend with intermediate sections for a stable artistic result. Sweeps are surface meshes, not collision objects or a skinning system. Rebuild only when the path changes; static meshes can be cached.

## Verification

The focused suite covers capped topology, frame orthogonality and continuity, input validation, palette discipline, depth occlusion, seed stability, update/seek equivalence, draw purity, cues, stages, dark negative space, fade-out, short palettes and bounds across seeds and front/rear orbits. Reviewed buffer fixtures cover incision, opening, devouring, closure and rear views.

Three render/inspect/refine passes increased material thickness, replaced a smooth almond silhouette with a jagged tear, improved debris visibility and expiration, and removed an inappropriate generic cinematic light rig. The final GIF has 125 frames at nominal 24 fps, 640×440 presentation (2× nearest-neighbour from 320×220). GIF frame durations alternate centiseconds to approximate 24 fps, giving a 5.21-second encoded duration.

A local warm draw benchmark at 260×180 measured approximately 1.35 ms per frame across 1,000 draws of the full opening. This is an observation for this machine, not a device performance guarantee. Cinematic finishing, export, image encoding and scene content add cost.
