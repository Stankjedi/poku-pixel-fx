# Cinematic rendering pipeline — 2D + 3D

This is an **optional engine-only rendering layer**. None of the existing presets or effect scripts in src/fx/ and src/3d/effects/ are modified. The original composite() and compositeFrame3D() remain the default, with byte-for-byte legacy behavior when callers do not use the cinematic pipeline.

## Design

The source frames already separate (1) crisp, palette-authored pixels and (2) additive emissive pixels. The cinematic finishing pass makes that separation explicit:

1. Decode packed **ABGR** color and emission to **linear RGB** using the sRGB transfer function.
2. Optionally add unclamped **float32 HDR radiance** produced by other lighting systems.
3. Extract emission highlights with a **soft-knee threshold**, not by blurring the opaque color layer.
4. Downsample emission through up to six half-resolution levels and apply separable five-tap Gaussian-like blur at each scale.
5. Accumulate broad-to-narrow bloom; optionally introduce a restrained chromatic fringe *in bloom only*.
6. Add direct emissive light + indirect bloom, apply exposure, ACES/Reinhard/none tonemapping, optional highlight-color preservation, saturation, contrast and vignette, and encode back to sRGB bytes.
7. For transparent output, propagate emission to the output alpha. Opaque color silhouettes remain untouched in the source buffers.

The 3D lighting stage additionally reconstructs **world-space positions from Painter3D.depth**, estimates screen-space normals, and accumulates multiple colored inverse-distance-style point lights into an independent HDR buffer. It can compute a small surface-aware SSAO field for extra geometry definition. Normals select the nearest-depth neighbor on each axis, falling back to the opposite side of a silhouette instead of introducing a false camera-facing highlight. Perspective specular and rim lighting use each pixel’s view ray. SSAO measures height above the reconstructed local surface, so a continuous sloped facet does not shadow itself; a smooth world-space range cutoff prevents distant geometry from creating contact shadows.

This is a physically **inspired** lighting stack, not a path tracer or physically exact energy-conserving renderer. It deliberately preserves hard pixel silhouettes and stepped palettes while adding softer photographic light.

## 2D API — all existing effects compatible

~~~ts
import { createFrame, createFx, CinematicCompositor, enableHDRLight } from "poku-pixel-fx";
import * as spell from "poku-pixel-fx/fx/lightning/lightning-strike"; // illustrative import

const frame = enableHDRLight(createFrame(224, 128));
const fx = createFx(spell);
const finish = new CinematicCompositor(); // reuse this across frames
const rgba = new Uint8ClampedArray(frame.w * frame.h * 4);

function draw(dt: number) {
  frame.color.fill(0);
  frame.light.fill(0);
  frame.hdrLight?.fill(0);
  fx.update(dt);
  fx.draw(frame);
  finish.render(frame, rgba, {
    background: null, // transparent sprite-sheet export; or supply packed ABGR backdrop
    bloom: { threshold: 0.14, knee: 0.2, intensity: 1.0, levels: 4 },
    exposure: 1.2,
    toneMap: "aces",
    saturation: 1.1,
    chromaticFringe: 0.35,
  });
}
~~~

Only the final output is graded. The painter, simulation, deterministic seeds, and source palette buffers remain unchanged.

## 3D API — cinematic world-space light rig

~~~ts
import {
  createFrame3D, Painter3D, createFx3D, frostNova3D,
  CinematicLighting3D, CinematicCompositor, enableHDRLight,
} from "poku-pixel-fx/3d";

const frame = enableHDRLight(createFrame3D(256, 144));
const camera = { yaw: 0.7, elevation: 0.5, zoom: 1.1 };
const painter = new Painter3D(frame, camera);
const spell = createFx3D(frostNova3D, { seed: 42 });
const lights = new CinematicLighting3D();
const film = new CinematicCompositor();
const pixels = new Uint8ClampedArray(frame.w * frame.h * 4);

function draw(dt: number) {
  spell.update(dt);
  painter.setCamera(camera).begin("#091523");
  spell.draw(painter);

  const shading = lights.evaluate(frame, camera, [
    { position: [-1.5, 3, 1.8], radius: 6, color: "#61cfff", intensity: 2.2, specular: 0.6 },
    { position: [2, 1.5, -1.2], radius: 5, color: "#be83ff", intensity: 1.1, rim: 0.25 },
  ], { ambientOcclusion: { radius: 3, intensity: 0.4 } });

  film.render(frame, pixels, {
    radiance: shading.radiance,
    occlusion: shading.occlusion,
    bloom: { threshold: 0.12, knee: 0.2, intensity: 1.05, levels: 4 },
    exposure: 1.3,
    toneMap: "aces",
  });
}
~~~

`ambientOcclusion.radius` is the sample radius in render-target pixels (1..8). `range` is the maximum world-space distance for an occluder (default 2); `bias` is the minimum height above the local surface (default 0.09). These settings only affect the optional lighting result, never source color, emission or depth buffers. No silhouette blur or extra antialiasing is added.

The 3D gallery's **CINEMATIC** checkbox now switches between the new engine finish and the legacy non-emissive view, without changing any preset code. The live preview demonstrates light probes, ambient occlusion, multi-scale bloom and grading.

## Pipeline settings and defaults

| Option | Default | Notes |
|---|---:|---|
| bloom.threshold | 0.16 | Linear RGB threshold; lower values glow more |
| bloom.knee | 0.18 | Smooth onset around the threshold |
| bloom.intensity | 0.9 | Indirect glow multiplier; direct emission is always added |
| bloom.levels | 4 | 1..6 half-resolution levels |
| lightStrength | 1 | Both native HDR and packed emission, after resolving their mirror; does not scale independent world radiance |
| radiance | none | Extra HDR float32 RGB, stride = 3 |
| occlusion | none | Per-pixel base color multiplier, stride = 1 |
| exposure | 1.15 | Multiply linear radiance before tone mapping |
| toneMap | aces | aces, reinhard, none |
| highlightColor | 0 | 0..1; optional RGB-ratio preservation in overexposed highlights, without changing existing defaults |
| saturation | 1.08 | Grading saturation |
| contrast | 1.04 | Grading contrast |
| vignette | 0.08 | Film-style corner attenuation |
| chromaticFringe | 0.45 | Bloom-only subpixel RGB shift |

Set bloom: false and toneMap: "none" with exposure/saturation/contrast=1, vignette=0 for a nearly lossless pixel-space copy. By design, this optional pipeline does not replace the old exact 8-bit compositors.

## Emission controls and highlight color

`lightStrength` scales the resolved direct emission **and its bloom**. It applies equally to 2D and 3D, with or without `enableHDRLight(frame)`. At `0`, both emission paths are off. It does not dim opaque artwork or the separate `radiance` supplied by a world-light rig. Resolve the packed/HDR mirror first, then scale; scaling only the packed mirror leaves native HDR lit even when the control reaches zero.

At high exposure, separate per-channel film curves can turn distinct orange, cyan or violet emission into nearly white regions. Set `highlightColor: 0.5` to `0.85` to retain more of the authored color in these highlights. This is an artistic control, not an HDR display mode or a physically exact camera transform:

~~~ts
film.render(frame, pixels, {
  lightStrength: 0.6,
  highlightColor: 0.75,
  bloom: { threshold: 0.12, knee: 0.2, intensity: 1.1, levels: 4 },
});
~~~

The control blends the existing channel curves with one peak-channel compression scale. A smooth transition starts above exposed linear RGB 1 and reaches full requested strength at 4. Neutral hot cores remain neutral; midtones, alpha coverage and the source color/depth buffers are unchanged. `toneMap: "none"` bypasses this control. Saturation and contrast still apply afterward, so extreme grading can still clip or shift colors. The default is `0`, preserving the existing cinematic appearance. Neither legacy compositor changes.

`tools/benchmark-cinematic.mjs` compares a previous compiled build with the current compositor, checking default-frame identity, zero-emission behavior and a known HDR RGB-ratio calibration. It also writes two pixel-nearest comparison GIFs: an emission-strength sweep on ordinary 2D/3D artwork, and an explicitly labeled 20× native-HDR stress test. The stress test is not representative of default effect brightness:

~~~bash
# Preserve the previous build before changing source, then rebuild the modified checkout.
BEFORE=$(mktemp -d)
cp -a build "$BEFORE/build"
npm run build
node tools/benchmark-cinematic.mjs --baseline "$BEFORE/build" --out records/cinematic
~~~

## Performance and limits

- CPU software rendering; use small internal pixel dimensions and **nearest-neighbor scale** for presentation. Blur work scales with the total multiresolution pixel count. The processor reuses typed arrays instead of creating per-frame temporary buffers.
- 3D world-space shading scales with visible geometry pixels × active point lights; SSAO uses eight neighborhood depth probes per geometric pixel.
- No shadow casting between world objects, temporal reprojection, physically correct BRDF, global illumination, texture normals, GPU instancing, or hardware HDR output. Depth derivative normals can differ from real face normals at narrow silhouettes.
- The original additive buffers still saturate at 8 bits, **but** calling enableHDRLight(frame) makes both 2D Painter.add() and 3D Painter3D.addLight() accumulate their energy in an additional unclamped linear RGB buffer, while continuing to mirror legacy writes. The cinematic renderer chooses the larger emission source per channel so it never counts a mirrored light twice. Custom effects that write directly to frame.light can still participate through the legacy fallback; for custom effects that manually occlude or reproject light, synchronize hdrLight too. The 3D world-light rig uses a separate HDR radiance buffer, summed independently.
- Avoid chromatic fringe on the original pixel buffer; deliberately blur light only. For large full-screen AAA production workloads, port these established buffers and passes to WebGPU/WebGL with GPU bloom, material/normal targets and physically based lights.

## Verification

~~~bash
npm ci
npm run build
npm run test:3d
# Render the same frost-nova effect with and without the optional film finish
node build-tools/tools/render-3d.mjs frost --frames 12 --out records/3d/frost-legacy.png
node build-tools/tools/render-3d.mjs frost --frames 12 --cinematic true --out records/3d/frost-cinematic.png
~~~

The cinematic regression suite checks shared HDR/packed emission dimming, independent world radiance, optional highlight RGB-ratio preservation, unchanged neutral cores and midtones, transparent alpha coverage, byte roundtrip (when post-effects disabled), deterministic render, transparent bloom alpha, HDR radiance, unchanged input buffers, 3D point lighting, frame allocations and occlusion safety. `tests/lighting3d-quality.test.mjs` additionally checks silhouette derivatives, close depth discontinuities, perspective mirror highlights, back-facing specular rejection, planar self-occlusion, distant-occluder rejection and source-buffer preservation. Automated test success must be confirmed on the target CI or local runtime.
