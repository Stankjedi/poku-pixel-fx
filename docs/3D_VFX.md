# POKU 3D Pixel FX Engine

A dependency-free TypeScript **software-rasterized** 3D VFX engine, alongside the existing 2D renderer. It preserves the project's authoring loop: procedural geometry, seeded particles, choreography on a second-based timeline, discrete palette ramps, continuous coverage with optional 4×4 Bayer alpha, separate emission, render/inspect/refine. It does **not** replace `src/core` or silently convert the 2D catalog.

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
  painter.setCamera(fx.camera({ yaw: 0.7, elevation: 0.6, zoom: 1 }));
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
| `painter.ts` | `Painter3D` with `project`, `point`, `line`, `triangle`, `facet`, `ring`, `crystal`, `glow` and `grid`; cached projections through `triangleProjected` / `lineProjected` |
| `particles.ts` | `Particles3D.spawn`, `update`, `draw`, `clear` (gravity, drag, bounce, trails) |
| `fx.ts` | `createFx3D`, fixed 120Hz simulation, `seek`, `restart`, cues and stage names |
| `effects/*` | Typed `meta` + `create(opts)` factories; new effects do not modify the engine |

3D uses **+Y up**, world-space XYZ and seconds (unlike the 2D pixel-local coordinate system). `Camera3D` supports orthographic rendering by default and optional lightweight perspective, yaw, elevation, zoom and target. The 3D `Frame3D` has `color`, `light`, `depth` arrays; `color` and `light` have the same ABGR packing as the 2D frame so existing sprite/image pipelines can be adapted. `compositeFrame3D` composites over an opaque background for speed.

Effects are deterministic for a given seed and fixed-step timeline. `update(dt)` can be called at arbitrary frame rates, while `seek(seconds)` reconstructs from t=0 for stable frame capture. `drainCues()` exposes hit/flash/shake timing without imposing a specific character or camera controller. Optional effect-authored response is available through `fx.camera(baseCamera)`, applied once before all scene drawing and lighting; omit it for reduced motion. `done()` handles one-shots; demos can replay them explicitly.

## Writing a new 3D effect

1. Create `src/3d/effects/my-effect.ts` with `export const meta` and `export function create(options)`; see `arc-slash.ts` for a ribbon, `frost-nova.ts` for simulation.
2. In `create`, use `new Rng3D(options.seed)` for *all* variability and `new Particles3D()` for physical fragments. Derive geometry from math functions, not hand-edited sprite frames.
3. `update(dt)` advances particles and spawns events **once** when the timeline crosses an event; `draw(painter)` builds shapes and paints particles for the current time. `draw` must not mutate simulation or RNG state.
4. Reuse the camera, depth buffer, palette, dithering and light buffer rather than inventing per-effect postprocessing. End each one-shot with no visual output.
5. Export a contact sheet using `render-3d.mjs`; orbit the live preview, check solid silhouette and z-buffer from different angles; refine before publishing.

## Rendering constraints and trade-offs

- Fixed low-resolution frame and nearest-neighbor presentation preserve hard pixel edges; pixel size and orbit should remain stable within a shot.
- Pixel geometry uses continuous coverage by default; select `alphaMode = "dither"` for deliberate Bayer stippling. The legacy light mirror accumulates in 8-bit channels; `enableHDRLight(frame)` preserves linear emission above that ceiling.
- Opaque surfaces replace hidden color and surface emission. Transparent raster fragments share a frame-local, per-pixel depth-sorted queue, including fragments from different `Painter3D` instances on that frame. Coverage attenuates rear surface emission by the same transmittance as color. Equal-depth ties retain submission order. `frame.depth` remains nearest visible depth for lighting; `opaqueDepthAt()` exposes only the depth that can block transparent material.
- `glow()` and `screenLight()` explicitly request screen-space optical glow. That glow remains independent of surface occlusion. Use primitive `emission` for a material that must be hidden by a foreground object. Custom optical masks can use `clearEmission(x, y, true)` after confirming ownership; the black-hole horizon does so without erasing foreground debris.
- Surface transparency is exact for the submitted fragments. Integrated overlapping volumes still belong in one field, and refraction (`lensWarp` / `pressureWarp`) is an explicit resolved pass: submit the scene to refract before it, then foreground geometry afterward. This reference engine does not implement shadow maps, physically based lighting or an external game engine's scene depth automatically.
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

## Ice Shatter 3D — solid material fracture

**ICE SHATTER** in the 3D gallery, or `render:3d -- shatter`, adds a matching-mesh ice fracture rather than an unrelated particle burst. The independent `Fragments3D` helper supplies real rotating mesh pieces, vertex-floor contact and face-supported settling. See [solid debris authoring](ICE_SHATTER_3D.md) for its API, effect timing and deliberately art-directed physics limits.

## Thermal Plume 3D — fire and cooling soot

**THERMAL PLUME** in the 3D gallery, or `render:3d -- flame`, is a true world-space fire volume with rooted tongues, upward material flow, a compact hot core, embers and expanding smoke. `drawVolume3D`, `VolumeGrid3D` and `volumeNoise3D` provide reusable depth-clipped, palette-aware CPU volume rendering. See [thermal-plume authoring and limitations](THERMAL_PLUME_3D.md).

## Forked Lightning 3D — branched electrical discharge

**FORKED LIGHTNING** in the 3D gallery, or `render:3d -- lightning`, grows a seeded stepped leader and illuminates its persistent irregular XYZ branches with three uneven return strokes. Thin forks extinguish before the trunk; upward streamers and ground-contact sparks have separate timing. `createDischarge3D`, `drawDischarge3D` and `dischargePulse3D` provide reusable topology, distance-based growth and pulse tools. See [discharge authoring and scope](DISCHARGE_3D.md).

## Crown Splash 3D — liquid sheets, drops and surface waves

**CROWN SPLASH** in the 3D gallery, or `render:3d -- water`, forms a thin lobed water crown, sheds rounded droplets from its actual rim, collapses, rebounds and leaves local contact ripples. `LiquidDrops3D`, `drawLiquidDrop3D`, `sampleLiquidCrown3D`, `drawLiquidCrown3D` and `drawSurfaceRipple3D` provide reusable non-emissive water tools. See [liquid authoring and limits](LIQUID_3D.md).

Both 3D export commands also accept `--yaw <degrees>`, `--elevation <degrees>`, `--zoom <scale>` and `--target-y <world units>` for reproducible orbit review. Defaults remain unchanged for existing effects.

## Void Rift 3D — folded darkness and inward motion

**VOID RIFT · 공허의 균열** in the gallery, or `render:3d -- voidrift`, opens a jagged vertical cut into a dark concave throat with thick obsidian lips, attached curved hooks and accelerating inward splinters, then seals from its tips. `createSweep3D` and `drawSweep3D` provide reusable capped polygon sweeps with transported frames and elliptical cross sections. See [void-rift choreography and solid sweep authoring](VOID_RIFT_3D.md).

## Meteor Impact 3D — atmospheric entry and heavy debris

**METEOR IMPACT** in the 3D gallery, or `render:3d -- meteor`, adds a tumbling basalt body with an accelerating entry path, leading-surface ablation, a world-space plasma wake and an oblique ground impact. `createRockMesh3D` supplies reusable seeded, watertight low-poly rocks for the existing mesh-fragment simulator. See [meteor choreography, reusable rock geometry and limits](METEOR_3D.md).

## Energy Shield 3D — curved membrane and local hits

**ENERGY SHIELD · 에너지 방벽** in the gallery, or `render:3d -- shield`, catches three oblique amber bolts on a curved cyan membrane. Local dents and geodesic ripples illuminate only nearby cells, then leave the intact boundary. `createShieldSurface3D`, `shieldNormal3D`, `shieldResponse3D` and `shieldRipple3D` provide reusable surface coordinates, damped responses and cap-clipped wave geometry. See [energy-shield authoring and limitations](ENERGY_SHIELD_3D.md).

## Wind Pressure Strike 3D — air force and grounded reaction

The refined **WIND** attack compresses its four airfoils into a fast gust and strikes a wooden prop.
A shared contact clock drives local pressure, prop rocking/skidding, delayed grass response and
non-emissive downstream dust/leaves. `gustImpulse3D` and `advectGust3D` provide small seekable force
and drag tools. See [wind-pressure choreography, host controls and limits](WIND_PRESSURE_3D.md).
The legacy wind variant retains its own choreography and remains available separately; both variants use the shared renderer's corrected coverage and emission rules.

## Rendering and HDR contracts

Depth is compared and stored at Float32 precision for every primitive, including spheres and custom black-hole samples. Repainting an identical opaque surface therefore replaces every pixel instead of rejecting half the samples due to mixed double/Float32 rounding.

`enableHDRLight()` should be called before drawing. When HDR is present, `CinematicCompositor` reads it as the authoritative emission source; the saturated packed mirror is never selected with `max()`. A packed-only custom writer can use `importPackedLight(frame, additionalPacked)` to import a separate light buffer, or pass `legacyLight` to the compositor. Use `importPackedLight(frame, completeLegacyResult, "replace")` to convert an entire legacy result. Do not import the already mirrored `frame.light` a second time as additional light. The ordinary packed compositor remains available.

The shield renderer caches its ring connectivity and hex adjacency by surface, updates deployment positions in reusable arrays, and projects shared vertices once for both sorting and rasterization. Reuse the same `ShieldSurface3D` object; pass an animated `aperture` to `drawShieldSurface3D` instead of creating a new surface every draw. The cache keeps one cell-size topology per surface, so changing `cellSize` replaces that topology instead of accumulating a cache keyed by animation time.

See [rendering-contract implementation notes](RENDERING_CONTRACTS.md) for the report mapping and compatibility changes.
