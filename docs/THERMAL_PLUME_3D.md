# Thermal Plume 3D

A material-specific fire study: a broad fuel root feeds six narrow, folded flame tongues. Their bends travel upward, tips cool, sparks lift with the buoyant plume, and expanding soot survives after combustion stops. The fire has a compact yellow-white root, orange body and darker outline; smoke has its own cooler ramp. It does not reuse an energy ring, exploding sphere or 2D billboard.

## Preview and export

Choose **THERMAL PLUME** in the 3D gallery. Drag to orbit and compare the real near/far structure. The CPU preview caps this effect at 192 × 144 rather than the mesh effects' 400 × 300 budget. Actual dimensions retain the display aspect ratio.

```sh
npm run build
npm run render:3d -- flame --frames 24 --out records/3d/thermal-plume-contact.png
npm run render:3d:gif -- flame --fps 20 --width 260 --height 220 --grid false --out records/3d/thermal-plume.gif
npm run test:3d
```

The optional `--grid false` is supported by both 3D exporters for cleaner material previews. GIF output uses one global palette and nearest-neighbor scaling. The effect is a 6.4-second one-shot with ignition, burn, cooling and dissipation stages. It starts and ends empty, including its coal bed.

```ts
import { createFx3D, thermalPlume3D } from "poku-pixel-fx/3d";
const flame = createFx3D(thermalPlume3D, {
  seed: 4217,
  size: 1,       // Clamped to 0.4..1.5; reframe the camera for larger variants.
  wind: 0.34,    // Signed X-direction drift, clamped to -0.8..0.8.
  smoke: 0.82,   // 0 disables soot; otherwise clamped to 0..1.5.
});
```

A custom fire palette is resampled to seven steps. Smoke deliberately retains a separate gray-violet material ramp. An empty fire palette selects the default. Noise, tongue dimensions and soot timing are seeded; rendering consumes no RNG and does not advance the simulation. The only draw-time mutation is an internal density cache, so repeated or differently orbited captures preserve the same simulation.

## Reusable volume tools

`drawVolume3D(painter, bounds, field, options)` reconstructs real orthographic or perspective camera rays and clips them against an axis-aligned world-space box and the existing scene depth. The field returns density (extinction per world unit), color and optional emission. Integration uses `1 - exp(-density × distance)`, so opacity does not accidentally change with the number of ray samples. The renderer:

- Integrates near-to-far and terminates opaque rays early.
- Supports explicit palette quantization after integration and optional faint-alpha rejection.
- Preserves the pixel lattice, alpha mode, legacy additive buffer and optional linear HDR buffer.
- Attenuates background emission through foreground smoke instead of letting every glow shine through soot.
- Does not write opaque depth for translucent media.

`VolumeGrid3D` caches expensive procedural fields in stable world-space cells. `refill(field)` replaces the previous contents; `sample(x, y, z)` interpolates density-weighted material color without black fringes where a colored cell meets an empty cell. Its returned object is borrowed until the next sample. The fire effect refills only when simulation time changes, and crops ray traversal to the live plume rather than scanning its full lifetime bounds. `volumeNoise3D` supplies smooth, seeded noise at positive or negative coordinates.

## Limits

This is a small CPU reference volume, not a Navier–Stokes solver, physical combustion simulator or GPU volumetric renderer. The buoyancy, cooling and rolling soot are art-directed. A small number of hero volumes or sprite exports are appropriate; many live instances need a GPU implementation or baked frames. Benchmark at your actual resolution and camera zoom.

Draw opaque geometry first, then volumes. Combine overlapping media in the same field or submit separate volumes back-to-front; there is no order-independent transparency. Perspective integration clips before the painter's clamped near-plane region. It does not ray march behind the eye. The cache cell size and march step trade detail for speed; increasing either can erase thin flame tips. Keep the light modest so it does not replace the shape.

## Checks

The dedicated test file covers step-independent optical thickness, scene-depth occlusion, background-emission extinction, HDR, camera projection, discrete palettes, empty fields, cache refill and color boundaries, noise continuity, deterministic stepping/seek, pure repeat renders, seed variation, orbital parallax, smoke after flame, empty endpoints and complete-animation framing at three seeds. Visual review included multiple native-size contact sheets and a full GIF export. Automated checks are not a substitute for inspecting the flame and smoke motion.

## Exact-output CPU optimization

The density cache tracks which interpolation cells have at least one nonempty corner. Rays skip interpolation only when all eight corners are empty, so thin boundary cells still receive the same samples. Active cells reuse their eight addresses and interpolation weights in the original accumulation order. Cache refill clears the buffer once, and the fire field reuses tongue centerlines at each grid-row height. These changes do not reduce resolution, sample count, grid detail or emission quality, and do not alter scene-depth clipping.

A controlled Node 24.22.1 comparison at 192 × 144, alternating baseline and optimized draws in one process, measured:

| Workload | Before | After |
|---|---:|---:|
| Full 6.4-second timeline, median of five run means | 37.59 ms/frame | 20.69 ms/frame |
| Burning stage | 34.16 ms/frame | 19.20 ms/frame |
| 95th percentile, median of five runs | 57.10 ms/frame | 32.11 ms/frame |
| Repeated draw at t=2, density cache already filled | 22.36 ms/frame | 12.54 ms/frame |

Measured 2026-11-04 on the development host, with two warm-up runs and 64 evenly spaced animation frames per run. These are CPU timings, not browser FPS or a universal hardware guarantee. The occupancy map adds one byte per grid vertex (about 63 KiB for the default grid). All 72 compared frames matched the baseline byte-for-byte in color, additive light, depth and optional HDR across six parameter/camera configurations. Regression fixtures retain 12 representative snapshots, including perspective, smoke, palette changes and scene occlusion.

Run an advisory local benchmark after building:

```sh
node tools/benchmark-thermal-plume.mjs build
# To compare preserved builds on the same host:
node tools/benchmark-thermal-plume.mjs path/to/baseline-build build
```
