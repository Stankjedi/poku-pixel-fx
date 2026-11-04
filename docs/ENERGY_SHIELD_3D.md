# Energy Shield 3D: curved local response

`scifi/energy-shield-3d` is an original, deterministic energy-barrier effect. It is a curved spherical cap, not a flat circle, a solid metal shield, or a general-purpose explosion recolored cyan. Three amber projectiles stop at three different points on its surface. Each contact creates a short local dent, an expanding surface-bound crest, a faint trailing echo and temporary illumination of nearby hex cells. The membrane remains intact and then retracts.

## Preview and export

```bash
npm run build
npm run test:3d
npm run render:3d -- shield --frames 30 --width 260 --height 210 --grid false
npm run render:3d:gif -- shield --fps 24 --width 260 --height 210 --grid false --cinematic true
npm run render:3d:gif -- shield --fps 24 --grid false --yaw 95 --cinematic true --out records/3d/shield-side.gif
```

Select **ENERGY SHIELD · 에너지 방벽** in the 3D gallery. `--yaw`, `--elevation`, `--zoom` and `--target-y` support reproducible orbit review in both exporters. The default zoom is 1.45, the camera target is `[0, 2.1, 0]`, and the default palette is a restrained seven-step navy/cyan/mint ramp. Warm residue has its own amber ramp to keep projectile energy and the barrier visually distinct.

```ts
import { createFx3D, energyShield3D } from "poku-pixel-fx/3d";
const fx = createFx3D(energyShield3D, { seed: 2761, radius: 2.8, intensity: 1 });
```

`radius` is the projected aperture radius, bounded to 1.2–3.4 world units. `intensity` controls emission, not opacity: zero emission still draws the geometric membrane. Larger radius variants may need a different camera. Palette overrides, including a single color, are supported. Seed affects only projectile residue, so the carefully staged hit positions remain readable across seeds.

## Choreography

| Time | Action |
|---|---|
| 0.04–0.52 s | The aperture opens across the existing curved surface. It does not grow as a flat billboard. |
| 1.02 s | First upper-left contact. |
| 1.68 s | A separate lower-right contact intersects the previous fading response. |
| 2.32 s | The strongest, more central contact reinforces the membrane. |
| 2.9–3.18 s | The wave leaves the finite boundary and the shield settles. |
| 3.18–3.85 s | Opacity fades and the aperture retracts. |
| 3.95 s | One-shot ends empty. |

Each contact emits one `hit`, `flash`, and `shake` cue. `seek()` is silent and reconstructs the same image as fixed-step updates. Draw calls never change the RNG or simulation state.

## Reusable surface toolkit

The independent `src/3d/shield.ts` module exports:

- `createShieldSurface3D(apex, normal, radius, aperture)`: a stable orthonormal frame and a spherical cap. Requires finite vectors, a nonzero normal and `0 < aperture < radius`.
- `shieldNormal3D(surface, u, v)`: maps tangent-disk coordinates to a unit surface normal; returns `null` outside the finite membrane.
- `shieldPoint3D(surface, unitNormal, displacement)`: converts a surface normal and optional radial displacement to an XYZ point.
- `shieldDistance3D(surface, a, b)`: great-circle surface distance, not distance in the camera image or the tangent plane.
- `shieldResponse3D(surface, normal, hit, time, speed)`: a damped traveling crest, compact contact field and radial displacement. The default crest speed is 4.8 world units per second. A hit uses `{ at, normal, strength }` and has no response before its timestamp.
- `shieldRipple3D(surface, hitNormal, distance, segments)`: returns unit normals around a geodesic circle, with `null` samples where the wave exits the cap. Do not join across `null` samples. Rings beyond the maximum shortest-path distance `π × radius` are empty.
- `drawShieldSurface3D(painter, surface, options)`: a low-poly translucent membrane, attached hex edges and finite lip. Multiple impacts add their displacement. Shared cell edges are emitted only once, and vertex responses are reused within the draw call.

Use the same hit normals, surface distance and combined displacement for all layers. A ripple drawn as a world-space horizontal ring, a camera-facing circle, or a separate random particle field will detach from the shield when the camera moves.

## Scope and limitations

This is an art-directed damped membrane response, not an electromagnetic or elastic finite-element solver. It has no gameplay collision detection; game code must provide real hit coordinates when using the helpers. The sample's three incoming bolts and hit locations are choreographed.

The CPU rasterizer sorts the membrane's translucent triangles back-to-front and uses the existing depth, palette and HDR-light buffers. It does not provide order-independent transparency or true optical refraction. Its faint directional surface shading is stylized, not a physically based glass material. Core geometry is independent from `src/core/` and the 2D effect catalog.

Tests verify cap geometry and clipping, traveled distance, causality and decay, depth occlusion, palettes, deterministic sampling, cues, end-empty behavior, render fingerprints and framing across seeds. The preview was refined through three render/inspect rounds, including decoded GIF frames at the normal and near-edge-on orbit.
