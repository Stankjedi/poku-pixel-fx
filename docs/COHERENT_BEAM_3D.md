# Coherent laser beams

`scifi/coherent-laser-3d` is a new directional 3D effect, exported as `coherentLaser3D`.
It deliberately differs from electrical discharge: one stable optical axis, an uninterrupted
rose-white core, a sustained hold, and metal-specific contact ablation. There are no zigzag channels,
branches, lightning restrikes, large shockwave rings, or global flashes.

## Play and render

```ts
import { createFx3D, coherentLaser3D } from "poku-pixel-fx/3d";
const fx = createFx3D(coherentLaser3D, { seed: 2419, length: 9, width: 0.065 });
```

```sh
npm run build
npm run render:3d -- laser --frames 30 --width 240 --height 160 --cinematic true --grid false --out records/3d/laser.png
npm run render:3d:gif -- laser --fps 30 --width 320 --height 190 --cinematic true --grid false --out records/3d/laser.gif
node --test tests/beam-3d.test.mjs
```

The gallery includes **COHERENT LASER · 레이저 빔**. The shared PNG/GIF exporters use
zoom `1.45`, target `[0, 1.2, 0]`, yaw `0.68` radians and elevation `28°` for the laser.
The laser uses its authored emission instead of the exporters' generic blue/pink world-light
rig; camera flags and legacy rendering remain supported. GIF encoding requires ffmpeg.

## Choreography

| Time | Action |
| --- | --- |
| 0.04–0.56 s | Sparse converging particles focus through three shrinking perpendicular collars. |
| 0.56–0.625 s | The leading edge advances from the source to the target along the same axis. |
| 0.625–1.90 s | The complete core remains continuously lit. The metal face develops a molten lip and recessed bore while hot splinters shed continuously. |
| 1.90–2.03 s | Power turns off at the source. The tail moves toward the target, rather than shortening from the impact side. |
| 2.03–3.10 s | The target cools from white/gold through orange to dark slag. Molten runs descend while small vapor puffs rise. |

The initial contact has a brief pressure-driven fan. The later ring is a dished molten
metal lip around a dark recess, not an optical lens or shockwave. White is reserved for the
beam core, fresh contact and young splinters; bloom is restrained and a separate buffer.
The effect starts and ends empty. All particle descriptors and contact times are seeded at
creation; drawing does not advance time or randomness. Host hit/flash/shake cues occur at
actual contact `0.625 s`; the firing sound begins at `0.56 s`.

The supported options are `seed`, `length` (2–10 world units), `width` (0.025–0.16),
`intensity` (0–2), and `palette`. The contact adds `impactPalette`, `impactScale` (0.45–1.35)
and `targetVisible` (default `true`). Set `targetVisible: false` when the host scene supplies
the actual target geometry; the heat, lip and spray remain. See [LASER_IMPACT_3D.md](LASER_IMPACT_3D.md). Empty palettes use the default; one-color palettes work.
Invalid numeric material options use defaults; finite values are bounded. Framing was
verified for defaults across four seeds and the full timeline, not for every possible
custom camera/length/width combination.

## Reusable beam helpers

`src/3d/beam.ts` is independent of `src/core` and any specific effect:

- `createBeamFrame3D(start, end)` returns a copied axis and stable orthonormal cross-section.
  Coincident points return `null`; non-finite endpoints throw. Vertical axes are supported.
- `beamPoint3D(frame, fraction, u, v)` samples the axis plus cross-section offsets in world
  units. This supports directional rings, contact planes and axial motion at arbitrary angles.
- `beamEnvelope3D(time, timing)` separates `charge`, `head`, `tail`, `power`, `impact` and
  `cooling`. Custom times must be finite, nonnegative and strictly increasing. Out-of-range
  or non-finite sample times produce an empty envelope.
- `drawCoherentBeam3D(painter, frame, options)` draws three uninterrupted nested capsules:
  a restrained sheath, a colored edge and a narrow bright core. `head` and `tail` clip the
  same axis, `radius` controls width, and `power`, `palette`, `emission` control appearance.
  Geometry and emission use the painter's depth test, including HDR. The helper does not
  scatter camera-facing glow discs along the beam, so there is no dotted/scalloped halo.

```ts
const beam = createBeamFrame3D([0, 2, 0], [6, 3, -2]);
if (beam) {
  const envelope = beamEnvelope3D(t);
  drawCoherentBeam3D(painter, beam, { ...envelope, radius: 0.055, palette: ["#234", "#4df", "#fff"] });
}
```

This is stylized game VFX, not a laser-safety or physical-optics simulation. The CPU renderer
still has its existing transparency and world-glow limitations. No GPU path or 2D catalog
migration is implied.

## Verification

Three visual passes tightened the palette, contact silhouette, short trailing sparks and
camera framing. Inspection included the GIF's decoded frames and an orbited contact sheet.
Focused tests cover exact endpoints, arbitrary/vertical axes, timing, uninterrupted hold,
clipped shutoff, occlusion, HDR safety, bounded options, deterministic update partitions,
seek/restart, seed zero, one-shot completion, cues, palettes, margins and reviewed buffers.
The aggregate 3D suite remains required before integration.
