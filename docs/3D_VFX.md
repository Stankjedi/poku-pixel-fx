# POKU 3D Pixel FX Engine

A dependency-free TypeScript **software-rasterized** 3D VFX engine, alongside the existing 2D renderer. It preserves the project's authoring loop: procedural geometry, seeded particles, choreography on a second-based timeline, discrete palette ramps, 4×4 Bayer alpha, a separate additive-light buffer, render/inspect/refine. It does **not** replace `src/core` or silently convert the 2D catalog.

## Run

```bash
npm ci
npm run build
npm run gallery
# http://127.0.0.1:8080/gallery/3d.html
node build-tools/tools/render-3d.mjs frost --frames 24 --out records/3d/frost.png
node build-tools/tools/render-3d.mjs slash --frames 24 --out records/3d/slash.png
node build-tools/tools/render-3d.mjs blackhole --frames 32 --out records/3d/blackhole.png
# Optional engine-only cinematic light finishing, without editing any effect modules:
node build-tools/tools/render-3d.mjs frost --frames 24 --cinematic true --out records/3d/frost-cinematic.png
node tools/render-blackhole-gif.mjs --out records/3d/black-hole-cinematic.gif
```

The orbitable preview contains **Frost Nova 3D** (solid five-sided ice crystals, expanding ground wave, snowflake windup, physics shards, melt), **Arc Slash 3D** (3D ribbon, secondary echo, collision sparks), and **Black Hole 3D** (lensed dark event horizon, rotating accretion disk, 3D gas plumes, inspiralling meteor fragments). Drag to orbit; wheel to zoom; adjust pixel size, elevation and additive emission. Screenshot PNG download works directly in the browser. The contact-sheet CLI exports PNG and a JSON file containing sample times, camera and options.

## Use in a Canvas application

```ts
import { createFrame3D, Painter3D, createFx3D, compositeFrame3D } from "poku-pixel-fx/3d";
import { meta, create } from "poku-pixel-fx/3d/effects/frost-nova";

const fx = createFx3D({ meta, create }, { seed: 42, reach: 5.9 });
const frame = createFrame3D(256, 144);
const painter = new Painter3D(frame);
const rgba = new Uint8ClampedArray(frame.w * frame.h * 4);
const image = new ImageData(rgba, frame.w, frame.h);

function tick(dt: number) {
  fx.update(dt); // internally fixed-step 120 Hz
  painter.setCamera({ yaw: 0.7, elevation: 0.6, zoom: 1 });
  painter.begin("#0a1525"); // clears color, light, depth
  fx.draw(painter); // draw other world-space meshes/particles here too
  compositeFrame3D(frame, rgba, 1);
  lowResolutionContext.putImageData(image, 0, 0);
  // Scale the low-resolution canvas to the display canvas via nearest-neighbor.
}
```

This is intentionally a small, CPU-side reference engine. It uses real 3D coordinates, a camera projection, depth-tested triangles, discrete facet lighting, 3D capsules, ring primitives, particles and colored emission. It is **not** WebGL, ray tracing, GPU-instanced volumetrics or a complete 3D game engine. For hundreds of simultaneous instances, implement the same draw contract on WebGL/WebGPU and use GPU instancing, without changing effect choreography.

## Public API

| Module | Contract |
|---|---|
| `math.ts` | Vec3 + deterministic `Rng3D`, tween helpers |
| `frame.ts` | `createFrame3D`, `clearFrame3D`, `compositeFrame3D` and packed ABGR buffers |
| `painter.ts` | `Painter3D` with `project`, `point`, `line`, `triangle`, `facet`, `ring`, `crystal`, `glow` and `grid` |
| `particles.ts` | `Particles3D.spawn`, `update`, `draw`, `clear` (gravity, drag, bounce, trails) |
| `fx.ts` | `createFx3D`, fixed 120Hz simulation, `seek`, `restart`, cues and stage names |
| `effects/*` | Typed `meta` + `create(opts)` factories; new effects do not modify the engine |

3D uses **+Y up**, world-space XYZ and seconds (unlike the 2D pixel-local coordinate system). `Camera3D` supports orthographic rendering by default and optional lightweight perspective, yaw, elevation, zoom and target. The 3D `Frame3D` has `color`, `light`, `depth` arrays; `color` and `light` have the same ABGR packing as the 2D frame so existing sprite/image pipelines can be adapted. `compositeFrame3D` composites over an opaque background for speed.

Effects are deterministic for a given seed and fixed-step timeline. `update(dt)` can be called at arbitrary frame rates, while `seek(seconds)` reconstructs from t=0 for stable frame capture. `drainCues()` exposes hit/flash/shake timing without imposing a specific character or camera controller. `done()` handles one-shots; demos can replay them explicitly.

## Writing a new 3D effect

1. Create `src/3d/effects/my-effect.ts` with `export const meta` and `export function create(options)`; see `arc-slash.ts` for a ribbon, `frost-nova.ts` for simulation.
2. In `create`, use `new Rng3D(options.seed)` for *all* variability and `new Particles3D()` for physical fragments. Derive geometry from math functions, not hand-edited sprite frames.
3. `update(dt)` advances particles and spawns events **once** when the timeline crosses an event; `draw(painter)` builds shapes and paints particles for the current time. `draw` must not mutate simulation or RNG state.
4. Reuse the camera, depth buffer, palette, dithering and light buffer rather than inventing per-effect postprocessing. End each one-shot with no visual output.
5. Export a contact sheet using `render-3d.mjs`; orbit the live preview, check solid silhouette and z-buffer from different angles; refine before publishing.

## Rendering constraints and trade-offs

- Fixed low-resolution frame and nearest-neighbor presentation preserve hard pixel edges; pixel size and orbit should remain stable within a shot.
- Bayer thresholds replace smooth alpha for primary pixel shapes; **additive emission is intentionally softer**. The light buffer is accumulated in 8-bit channels, so extremely bright overlap can saturate.
- Opaque z-buffered triangles are used for crystals/ribbons. This favors intentional flat-color silhouettes rather than expensive volumetrics. The painter does not implement order-independent transparency, shadow maps, physically based lighting or full scene occlusion with external 3D objects.
- Runtime performance depends on pixel resolution, 3D triangle count and pixel coverage, not just particle count; benchmark target devices. Use smaller render targets and pre-bake sheets for mobile/large crowds.
- Existing 2D effects stay in `src/fx` and are unaffected. 3D effects live in `src/3d/effects` and are **not** counted as 2D gallery effects.

## Third-party attribution

This 3D engine implementation is new code based on the general POKU Pixel FX authoring principles. It remains distributed under this repository's license; `LICENSE`/`NOTICE.md` and original 2D adapted-file attributions remain unchanged.

## Black Hole 3D — procedural singularity

Select **BLACK HOLE** in `/gallery/3d.html` or render `npm run render:3d -- blackhole --frames 32`. The effect lives in `src/3d/effects/black-hole.ts`, imported as `blackHole3D` from `poku-pixel-fx/3d`. Its seven-second sequence has six named stages: condense, singularity, accretion, inspiral, collapse and evaporate. It supplies `flash`, `shake`, `sound` cues that game clients may consume via `drainCues()`.

```ts
import { createFx3D, blackHole3D } from "poku-pixel-fx/3d";
const fx = createFx3D(blackHole3D, { seed: 42, radius: 1.24, reach: 6.9, intensity: 1 });
fx.update(1 / 60);
// painter.setCamera(...).begin("#05030d"); fx.draw(painter);
```

The general-purpose engine also provides optional `Painter3D.sphere()` and `Painter3D.lensWarp()` primitives for other effects. The **cinematic black-hole effect** uses its own orthographic view-ray disk intersection, analytic horizon depth check and photon-ring shading instead. Its orbiting rock meshes and sparks remain in real XYZ world coordinates; the optical lensing is an artistic approximation, not a GR solver.

The default palette has **11 steps**, and overrides with other lengths are resampled to 11 colors. The CPU renderer is suitable for individual hero spells and sprite-sheet baking; benchmark hardware before using many simultaneous black holes.

## Cinematic Black Hole VFX (quality revision)

The black-hole implementation is **code-generated on every frame**; it never uses the concept-art PNG as an animated texture or billboard. A view ray intersects a physically inclined XYZ accretion plane, and the polar intersection coordinates drive multiple moving, quantized plasma bands. A horizon depth test suppresses back-facing disk material, while orbiting faceted basalt and sparks provide near/far parallax. Camera-facing photon arcs and background lensing are explicitly **art-directed approximations**, not a scientific general-relativity integrator.

The revised effect adds blue-violet ion filaments, layered spiral gas, larger fractured-rock silhouettes, controlled emission and a small two-pass bloom that preserves the pixel-perfect color buffer. It uses a seeded, 120 Hz deterministic timeline (`createFx3D`) with a 7-second one-shot and a fade-out suitable for seamless repeated playback. `blackhole` is available in the interactive 3D gallery and PNG sheet exporter. Performance is resolution-dependent; the browser preview caps its internal raster size while retaining nearest-neighbor output. For larger production scenes, a WebGL/WebGPU implementation is recommended.
