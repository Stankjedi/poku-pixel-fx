# Unified pixel VFX engine — 2026-11-03

The integration combines all five feature branches without reverting the newer cinematic black hole already present on main. The existing 2D effect catalog, licensing and legacy compositors are retained.

## Included capabilities

| Source branch | Integrated benefit |
| --- | --- |
| `feat/3d-pixel-vfx-engine-20261102` | World-space geometry, depth-tested pixel rasterizer, seeded 120 Hz simulation, Frost Nova and Arc Slash |
| `feat/black-hole-3d-vfx` | General-purpose `sphere()` and `lensWarp()` primitives, horizon occlusion and original black-hole infrastructure |
| `feat/cinematic-black-hole-vfx-20261103` | The newer procedural disk, photon arcs, plasma, faceted debris and dedicated GIF exporter; retained from main |
| `feat/wind-rasenshuriken-vfx-optimization-20261103` | Original/refined wind effects, particle compaction, palette caching, one-shot completion bounds, cue timing fixes and generic GIF export |
| `feat/cinematic-lighting-engine-20261103` | Linear-light HDR capture, multiscale bloom, ACES tone mapping, depth-derived point lights, SSAO and grading for 2D/3D |

Integration resolutions preserve both sides of shared files: HDR clearing plus 2D dt validation; cached lens-warp snapshots plus synchronized HDR/depth/light resampling; both wind exports plus cinematic exports; and all regression suites in one command. Lens-warp scratch storage now also reuses its Float32 HDR snapshot.

The gallery contains `blackhole`, `wind`, `windOriginal`, `frost` and `slash`. The wind variants share their light rig for meaningful comparisons. The newer black-hole camera framing remains intact. Cinematic finishing is enabled in the gallery by default; old runtime composition APIs remain opt-in and unchanged.

## Run and export

```bash
npm ci
npm run build
npm run test:3d
npm run gallery

npm run render:3d -- wind --frames 24 --width 260 --height 180 --cinematic true --out records/3d/wind.png
npm run render:3d -- windOriginal --frames 24 --width 260 --height 180 --cinematic true --out records/3d/wind-original.png
npm run render:3d -- blackhole --frames 24 --cinematic true --out records/3d/blackhole.png

# Optional local ffmpeg is required for GIF encoding.
npm run render:3d:gif -- wind --fps 20 --width 260 --height 180 --cinematic true --out records/3d/wind.gif
npm run render:3d:gif -- blackhole --fps 20 --cinematic true --out records/3d/blackhole.gif
```

The generic PNG and GIF exporters both accept all five effect names and `--cinematic true`. Without that flag they retain legacy composition. PNG export writes a matching JSON sidecar, even when the supplied output path has no extension. Seed zero is accepted. GIF export advances the fixed-step simulation sequentially instead of replaying from time zero for every frame, then uses nearest-neighbor enlargement and a shared adaptive palette. The dedicated existing `tools/render-blackhole-gif.mjs` remains available.

## Wind authoring reference

The original variant uses four simple pairs of triangles and sparse sparks. The refined variant adds two-layer curved 3D airfoils, ten helical filaments, seeded turbulence, four pressure bands and a three-ring detonation. Both use a 4.6-second timeline and default seed 308. Compare them with the same camera and rendering settings; their authored shape/radius defaults deliberately differ.

## Compatibility and limits

The cinematic black-hole shader still performs custom light-buffer writes and reprojection. Gallery/export clients therefore retain its legacy emission fallback instead of enabling the auxiliary Painter HDR buffer for that effect; it still receives cinematic composition and world-light radiance. Other built-in 3D effects use unclamped HDR capture. Custom effects that manipulate light buffers directly must keep their HDR buffers synchronized.

This remains a CPU software renderer, not a GPU AAA renderer, path tracer or scientific gravitational-lensing solver. GIF palette reduction can alter colors; use PNG output for exact pixel colors. No performance multiplier or cross-device benchmark is claimed.

## Integration verification

`npm run test:3d` includes the existing 3D, black-hole, cinematic and wind suites plus focused cross-branch checks: deterministic rendering of all five effects, sequential export versus seek, HDR/depth/legacy-light registration during cached lens warp, opaque horizon emission occlusion, PNG sidecars and cinematic GIF encoding. Local GIF verification skips only when optional ffmpeg is absent; CI provisions ffmpeg so it runs there.

The merge records the inspected source heads as parents, including branches previously incorporated through squash commits. Feature branches are retained; there is no force-push or source-branch deletion.
