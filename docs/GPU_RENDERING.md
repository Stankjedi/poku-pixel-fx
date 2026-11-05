# GPU rendering, DrawIR and native playback

POKU has three explicit rendering paths. The original CPU painter remains the default and the reference for existing effect callbacks. WebGL2 can composite legacy packed buffers. The additional WebGPU path performs linear HDR preparation, multilevel bloom, tone mapping and final grading on the device, and can consume GPU-authored DrawIR and particle buffers without a CPU readback.

These APIs are working implementations with bounded resources. They do not automatically translate arbitrary `Painter`/`Painter3D` JavaScript callbacks, custom screen warps, or world-space volume fields into GPU programs. The 3D catalog still uses its established CPU geometry/volume pipeline; selecting WebGPU cinematic finishing accelerates a separate stage. API availability does not prove a physical GPU is in use.

## Paths and contracts

| Path | Draw/simulation | Finishing | Availability |
| --- | --- | --- | --- |
| `FrameRenderer` / `WebGLCompositor` | CPU callbacks | WebGL2 legacy encoded color/light | Optional, with CPU wrapper fallback |
| `CinematicFrameRenderer` | Existing CPU 2D/3D frames | CPU or WebGPU HDR/bloom/grade | CPU default; explicit `auto`/`webgpu` opt-in |
| `WebGPUDrawRenderer` | Batched compute raster of DrawIR | GPU buffers passed to WebGPU cinematic | Real WebGPU device required |
| `GpuParticleSystem` | Fixed-tick cosmetic compute | Resident DrawIR command batch | Real WebGPU device required |
| `native/` | Same DrawIR WGSL and exported atlas assets | Same cinematic WGSL | Rust wgpu library and headless playback CLI |

The separate [WebGL2 document](GPU_COMPOSITING.md) describes only that legacy compositor.

## Existing frame → WebGPU cinematic

```ts
import { CinematicFrameRenderer } from 'poku-pixel-fx/render/webgpu';

const renderer = await CinematicFrameRenderer.create(canvas, {
  backend: 'webgpu', // omit for CPU; 'auto' also attempts WebGPU
  onStatus: status => console.log(status.backend, status.state, status.reason),
});

renderer.render(frame, {
  background: null,
  bloom: { levels: 4, threshold: .12, knee: .2, intensity: .8 },
  toneMap: 'aces', exposure: 1.1,
});
const rgba = await renderer.capture(); // explicit export, never the ordinary presentation path
// Retry after device loss without restarting effect choreography:
await renderer.retry();
renderer.dispose();
```

The wrapper owns a separate WebGPU canvas and retains a 2D host context for fallback. The GPU render target is native resolution; only emission is downsampled and blurred. Color geometry is never filtered. Presentation converts straight output RGBA to the browser's premultiplied canvas convention. Capture reads the separate straight-alpha output texture, so exporting does not capture already premultiplied RGB.

`frame.hdrLight`, when present, is authoritative. `frame.light` is its legacy mirror and is not re-added or selected with `max()`. Separate `radiance`, `legacyLight` and `occlusion` inputs retain the CPU compositor contract. Background can be transparent, one packed color, or a full packed buffer. No native HDR display output is claimed: the final render target is RGBA8.

`finalPalette: number[]` optionally locks final visible RGB **after** bloom and grading, using nearest distance in encoded RGB and preserving alpha. CPU and GPU use the same first-match tie rule. Source emission remains linear HDR; the displayed/captured result is palette-limited. An absent palette preserves existing output. A palette contains 1–256 packed colors.

## Observability and lifecycle

`status` reports `backend`, `state`, `reason`, optional adapter identity and `timestampQuery`. `adapter.software` is true/false only when the API supplies that fact; `null` means unknown. Initialization failure, device loss or an uncaptured GPU validation/runtime error switches the wrapper to CPU. `retry()` reconstructs renderer resources. Overlapping retries retain only the newest device; disposing while initialization is pending cannot resurrect a GPU renderer. Disposal is idempotent and releases textures, buffers, query sets, canvas context and an owned device; an injected device remains owned by its host.

`timings` reports CPU milliseconds for `prepare`, `upload`, `encode` and `present`, plus the most recently resolved `gpu` timestamp duration and `readback` duration. `gpu` is `null` when unsupported or not yet available; it is not estimated from CPU submit time. Timestamp readback uses a three-slot asynchronous ring. It can lag the current submitted frame. `FrameProfiler` lets a host record its separate update/draw phases and rolling p50/p95 populations.

`resources` reports resident input buffer bytes, per-frame upload bytes/writes, avoided uploads, known render texture bytes, staging bytes and pending captures. These are application allocations, not a driver-wide memory reading. Texture/storage limits and a configured memory budget are checked, including capture staging. Unused frame/auxiliary uploads are released when changing paths. Changing native dimensions rebuilds targets; disposing releases them. Resident asset replacement keeps the previous buffer alive if allocation/upload fails, and validates every dirty range before the first write. Accounting reads do not scan the full asset map.

## DrawIR

`poku-draw/v1` is a serializable draw contract, not arbitrary executable effect code. Coordinates use native **pixel edges**, Y down, and larger depth nearer the camera. A sprite is sampled by the inverse affine transform at destination pixel centers, with integer source-cell ownership. Atlas `region` coordinates refer to the source page. A mesh is a list of projected XYZ vertices and triangle indices. The host projects world-space geometry before submission.

```ts
import { WebGPUCinematicRenderer } from 'poku-pixel-fx/render/webgpu';
import { WebGPUDrawRenderer } from 'poku-pixel-fx/render/draw-ir-gpu';
import { GpuParticleSystem } from 'poku-pixel-fx/render/gpu-particles';

const finish = await WebGPUCinematicRenderer.create(gpuCanvas);
const draw = await WebGPUDrawRenderer.create(finish.device);
const particles = await GpuParticleSystem.create(finish.device, { capacity: 256, seed: 42 });
const scene = {
  schema: 'poku-draw/v1', width: 160, height: 96,
  commands: [{ op: 'rect', origin: [20, 18, 1], size: [26, 34],
    material: { color: 0xff332211, blend: 'opaque' } }],
};
particles.spawn({ position: [40, 30, 2], velocity: [18, -12, 0],
  gravity: [0, 24, 0], lifetime: 1, radius: 1, color: 0xff55aaff, emission: 2 });
particles.advance(1 / 60);
finish.renderBuffers(draw.render(scene, particles), { background: null });
// Simulation state and DrawIR color/emission remain resident throughout this path.
particles.dispose(); draw.dispose(); finish.dispose();
```

Supported commands are rect, disc, segment, triangle, inverse-sampled sprite, ribbon and indexed mesh. Ribbon topology is a chain of round segments; overlapping segment coverage is intentional and is not a union-of-stroke or miter-join implementation. Mesh triangles use half-open top-left edge ownership. Assets store packed straight sRGB color and optional linear RGB emission. Immutable assets identify an explicit revision; changing data requires changing that revision. `ResidentGpuBuffers` also supports aligned dirty-range uploads.

Materials distinguish opaque, exact alpha, cutout and additive. Exact alpha sorts covered fragments by per-pixel depth and stable submission order. Cutout deliberately discards sub-threshold coverage. Additive draws emission without color coverage; surface additive emission is blocked by opaque depth and attenuated by nearer transparent coverage. Optical emission explicitly ignores surface occlusion. These policies are not interchangeable approximations to exact alpha.

### Batch algorithm and limits

The renderer now has two exact paths. `none` performs the original one-dispatch **O(pixels × primitives)** scan. `tiled` first builds conservative **16×16 native-pixel candidate lists on the GPU**, then rasterizes only each tile’s candidates. It accepts already resident particle command buffers; binning does not read command data back to the CPU. Candidate IDs remain in original submission order, preserving equal-depth opaque ownership and alpha ordering. Bounding boxes include a conservative pixel/float margin, and ill-conditioned sprite transforms remain candidates in every tile.

Each tile stores at most **256** command IDs. An overflowing tile scans the entire original batch, preserving every fragment; it does not keep only the first 256. Zero-opacity dead particle slots are omitted. The `auto` default enables bins at 32 primitives and 256 native pixels; smaller submissions retain the direct path. If the tile allocation cannot fit the device/application budget, the renderer uses the exact direct path and reports `resources.cullingReason`. Native Rust uses the same binning/raster WGSL and accepts `drawCulling: 'auto' | 'none' | 'tiled'` in its options.

The candidate-search cost becomes approximately **O(tiles × primitives + pixels × local candidates)**, followed by the existing alpha sorting and additive transmittance work. This is an operation-count model, not a guaranteed speedup: densely overlapping tiles add binning overhead before their complete scan, and GPU occupancy/dispatch cost depends on the adapter. There is no automatic LOD, dropped-particle optimization, hardware triangle rasterizer or automatic callback porting.

```ts
const draw = await WebGPUDrawRenderer.create(finish.device, 128 * 1024 * 1024, {
  culling: 'auto',
});
draw.setCulling('none'); // controlled baseline, same geometry and material rules
finish.renderBuffers(draw.render(scene));
draw.setCulling('tiled');
finish.renderBuffers(draw.render(scene));
const stats = await draw.inspectCulling(); // explicit diagnostic readback only
// candidatePixelVisits is one candidate scan, not elapsed GPU time.
console.log(stats.candidatePixelVisits, stats.directPixelVisits, stats.overflowTiles);
```

`resources` includes tile/merge/output allocation bytes, current primitive/alpha counts and the active culling mode. Tile storage is `ceil(width/16) × ceil(height/16) × 257 × 4` bytes. `inspectCulling()` allows one pending bounded inspection, preserves partial edge-tile weighting, and reports a conservative upper bound for binning bound checks. It never runs implicitly during ordinary rendering. Asset buffers, output and merge buffers are included in the configured DrawIR budget; optional bins give way before geometry does. The cinematic renderer has its own budget because it may be shared by other producers.

[GPU Lab](GPU_LAB.md) exposes the real path in the browser, including GPU particles, direct/tiled pixel comparison, a captured-bin inspector, palette-locked output, PNG capture and DrawIR JSON save/open. Existing Studio catalog callbacks continue to author geometry on the CPU.

The total primitive budget is 16,384 after mesh/ribbon expansion. The submitted exact-alpha primitive budget is **64**, conservatively counted across the entire batch before dispatch. Exceeding it throws; no normal compiled submission silently truncates transparent fragments. Opaque, cutout and additive primitives do not consume that alpha budget. Raw GPU command producers must satisfy the same ABI and alpha budget; `renderCommandBuffer` is a producer-facing integration API. `renderDrawSceneCPU()` is an inspectable CPU reference. Float32 GPU arithmetic is not guaranteed to be bit-identical across vendors.

## Cosmetic particles

Particles use stable CPU-assigned IDs, an integer hash for seeded initial variation, fixed 120 Hz ticks by default, and a resident state/DrawIR command buffer. Spawn writes one slot; updates and command generation are compute operations. A host can merge their command buffer with its main scene so opaque depth and transparent coverage are resolved together.

Lifetime is an explicit integer tick count, avoiding floating accumulation at death boundaries. Updates retain fractional elapsed time. Capacity exhaustion throws rather than overwriting a still-live slot. A single `advance()` accepts at most two seconds; subdivide longer seeks. `snapshot()` is an explicit diagnostic readback. Cosmetic output never feeds gameplay collision or authoritative state. Identical fixed ticks were checked on one software adapter; cross-device bit-identical floating-point trajectories are not promised.

## Bounded capture

`WebGPUCinematicRenderer.capture()` submits a texture-to-buffer copy, maps asynchronously, removes padded rows and returns top-down straight RGBA. The staging ring defaults to three slots. A full ring raises explicit backpressure; it does not grow without limit. Ordinary rendering never reads those buffers.

`captureCinematicSequence(renderer, source, sink, {inFlight: 2, signal, onProgress})` streams frames in order, bounds live captured frames and awaits the encoder/file sink. The sink can use WebCodecs, PNG encoding or an atlas writer. Cancellation waits for already submitted map promises to settle. The application controls filename, codec and destination; the capture API does not silently accumulate an entire animation in memory.

## 2D emission and 3D transparency/volume contracts

`Painter.surface()` / `surfacePixel()` opt a frame into separate surface and optical emission state. Later foreground coverage attenuates surface emission with the same transmittance as color. Existing `light()` stays optical and unmodified legacy frames keep their original path. `addLinearLight2D(..., 'surface' | 'optical')` imports native linear sprite emission. `clearFrame()` clears both channels. After custom direct buffer edits, `adoptSurfaceLight2D()` is an explicit synchronization barrier; arbitrary buffer mutations cannot be inferred automatically.

`Painter3D.withTransparency({mode:'exact'|'cutout'|'additive'}, draw)` scopes a material policy and restores it after the callback. The CPU exact queue remains the default. `surfaceDiagnostics3D(frame)` reports submitted/accepted/rejected fragments, peak overlap, recomposition work, allocated arena bytes, live fragments and budget status. `configureSurfaceBudget3D(frame,{maxFragments})` bounds transparent arena entries allocated during a frame; it throws on overflow instead of silently losing layers.

`combineVolumeFields3D()` adds overlapping extinction and density-weighted source radiance in world space **before integration**. `drawCombinedVolumes3D()` integrates that common field once, clipped against opaque scene depth. Independent linear `emissionRGB` is preserved through `VolumeGrid3D` interpolation. This remains CPU volume integration; unrelated separate volume draws are not turned into a unified field automatically.

## Shared 3D profiles

`createRenderProfile3D(effectId)`, parse/serialize/clone helpers supply one versioned JSON profile for camera, lights, lighting, cinematic settings, background, grid, motion and native size. CLI and gallery can consume exactly the same resolved profile. A transparent asset export and a scene preview are explicit output choices; their backgrounds and grid need not be identical unless the same overrides are requested. A profile contains settings, not live per-frame radiance or occlusion arrays.

## Native wgpu reference player

The `native/` crate includes the **same WGSL files** from `src/render/shaders/`; `tools/generate-wgsl.mjs` embeds those originals into the JS build. Shader source is not independently reimplemented in Rust.

```bash
cargo run --manifest-path native/Cargo.toml -- \
  native/examples/draw-scene.json --frames 2 --out /tmp/poku-draw
cargo run --manifest-path native/Cargo.toml --example make_asset -- /tmp/poku-asset
cargo run --manifest-path native/Cargo.toml -- \
  /tmp/poku-asset/fixture.asset.json --frames 8 --fps 25 \
  --socket hand --out /tmp/poku-playback
```

`poku-asset/v1` loading validates page sizes, frame rectangles, positive durations, declared file hashes and float32-le linear emission. Optional page `radiance` is float32-le linear-sRGB RGB; `occlusion` is float32-le scalar linear data in [0,1]. These sidecars preserve 3D camera-lighting results separately from material emission. `Asset::frame_lighting()` restores them to output coordinates with the same frame rectangle, trim, pivot and pixel-center ownership as the sprite. Outside the stored frame, radiance is zero and occlusion is one. Source emission receives `lightStrength`; external radiance does not. The CLI passes these arrays into the shared cinematic shader rather than silently dropping lighting or re-encoding it into RGBA8.

Page paths remain relative to the manifest. Playback honors cumulative per-frame milliseconds, one-shot clamping, loops, negative authored `sourceTime` metadata, and events when elapsed time crosses their `timeMs`. Seek does not replay historical events. Pivot/socket coordinates remain untrimmed pixel-edge coordinates; atlas geometry subtracts trim offset appropriately. Sockets preserve optional `basisX`, `basisY` and `mirrorPolicy`; world rotation/scale/reflection transforms the basis, retaining handedness.

The CLI automatically reads `settings.project.renderProfile.cinematic` and `settings.project.pixelStyle`. For a direct 3D bundle, it reads the resolved `settings.renderProfile` and `settings.renderMode`. A 3D project bundle also uses that resolved outer profile when present, because it includes the defaults actually used during export. `linear-transparent` mode selects identity finishing; `cinematic` reapplies declared finishing. A declared `palette-locked` palette is enforced in the actual GPU output texture, including after an options-file override. Legacy encoded-light modes and missing modes are rejected unless the caller explicitly chooses `options.mode:'cinematic'` or `'linear-transparent'`; omitted 2D authoring modes mean legacy. Choosing cinematic for a legacy or mode-less 2D asset retains the native CPU `CinematicCompositor` defaults plus supplied settings. This explicit conversion does not reproduce legacy rendering; exact legacy appearance requires already composed RGBA with identity finishing. Declared cinematic profiles use authoring defaults plus declared settings. The raw native example and harness fixture explicitly record the native defaults they exercise. For a transparent asset, pass a packed `background` in the options file when desired; an opaque background already stored in source color remains part of that source. Library hosts should call `Asset::render_options()` to resolve these declarations before submission.

`Renderer::submit()` leaves the result in `output_texture()` without CPU readback; `submit_with_lighting()` also accepts restored frame lighting. A native game host can sample that texture in its own pass. `capture()` is the separate bounded readback, and `render()` / `render_with_lighting()` are submit-plus-capture conveniences for this CLI. The CLI writes numbered PNGs and a playback trace; it has no native window, game-engine plugin, skeletal physics or automatic JavaScript effect execution. Exported lighting is a camera snapshot, not relightable geometry. The reference asset `scene()` / `frame_lighting()` methods translate an atlas frame; a host applying other transforms must transform the screen-space lighting with its sprite. The Rust scene compiler is a reference implementation: GPU atlases stay resident by revision, but animated scene construction still performs CPU-side array copies. No allocation-free native playback or hardware performance result is claimed.

## Reproducible checks and measured scope

```bash
npm run build
node --test tests/gpu-advanced.test.mjs tests/gpu-tiles.test.mjs
cargo fmt --manifest-path native/Cargo.toml --check
cargo check --manifest-path native/Cargo.toml --all-targets
cargo test --manifest-path native/Cargo.toml
cargo build --manifest-path native/Cargo.toml --bins --examples
GPU_NATIVE_REQUIRED=1 node tools/gpu-native-harness.mjs
# Optional independent WGSL compute harness:
python -m pip install wgpu==0.32.0
GPU_PARTICLE_REQUIRED=1 python tools/gpu-particle-harness.py
GPU_TILES_REQUIRED=1 python tools/gpu-tiles-harness.py
# Run these as an ordinary browser-capable user, keeping the sandbox enabled:
GPU_BROWSER_PATH=/path/to/chromium GPU_REQUIRED=1 node tools/gpu-browser-harness.mjs
GPU_BROWSER_PATH=/path/to/chromium STUDIO_REQUIRED=1 node tools/studio-browser-harness.mjs
```

The browser harness checks actual WebGL2/WebGPU output, odd sizes, transparent/background cases, HDR, DrawIR, resident assets, compute particles, capture ordering and loss. Tile fixtures include 512 spatially separated primitives, 301 overlapping primitives that force overflow, transformed sprites and boundary geometry, 64 equal-depth alpha primitives, fully offscreen commands and an empty odd-sized frame. Both the browser and native harness run these cases; the standalone Python harness executes the canonical WGSL, compares direct/tiled buffer bytes exactly and captures actual bin counts. Native harness scene count is now 15; historical validation below remains the earlier run until new native evidence is recorded. The Studio smoke checks real bundled modules, six recipes, one-frame seeking, character/equipment, pointer brush/undo, JSON save/import, explicitly injected API-unavailability fallback, and worker-generated ZIP hashes/PNG decode. `unavailable` and `failed` are distinct; `*_REQUIRED=1` makes either non-passing result fail CI. These are functional checks, not visual-quality approval.

Local validation on 2026-11-05 used Rust 1.99.1, wgpu 30.0.1, Python wgpu 0.32.0 and **llvmpipe LLVM 20.1.2 / Mesa 25.2.8 / OpenGL, adapter type CPU**. The native harness passed **9 DrawIR scene cases, one production 3D catalog case, 34 captured frames and 25 CPU/WGSL comparisons, totaling 61,540 RGBA channels with maximum delta 0**. Its acceptance limit is 2 encoded channel values; repeated same-device captures additionally require exact equality. Cases cover shared triangle edges, reordered alpha geometry, one-pixel bloom, palette policy, separate radiance/AO, direct 3D finishing modes and exported-asset timing/socket/events. The catalog case exports four 64×48 frost frames at 4 fps with moving camera, grid, transparent background and trimmed/deduplicated pages, then compares actual native playback against the original preview. Rust formatting, all-target compilation and **7 contract tests** passed. The particle harness executed **64 compute dispatches** and checked partition-independent state/commands, seed/ID variation, exact lifetime ticks and an independent ballistic sum.

The browser executable in the local root environment refused to start with its sandbox enabled. An unprivileged launch was also unavailable in that environment. Browser canvas/presentation and physical GPU validation are therefore **not recorded as locally passed**. CI and target-device runs are separate gates. Software-adapter results establish shader execution and tested pixel contracts, not a speedup, cross-device determinism or production device coverage.

## Tiled DrawIR verification — 2026-11-06

[Captured tile validation](validation/production-2026-11-06-gpu-tiles.json) executed both canonical shaders on **llvmpipe LLVM 20.1.2 / Mesa 25.2.8 / OpenGL, adapter type CPU** using Python wgpu 0.32.0. Across six scene cases and 18 compute dispatches, direct and tiled color, packed-light and linear-HDR buffers matched **exactly** on that adapter (1,061,120 compared bytes). The independent CPU reference differed by at most one encoded color channel value; the maximum HDR difference was 7.46×10⁻⁸.

In the 257×193 sparse fixture with 512 primitives, captured GPU bins reduced one pixel-candidate scan from **25,395,712 to 221,696 visits (99.127%)**, plus at most 113,152 tile-bound checks. All six tiles in the 301-primitive overlap fixture overflowed to the full scan and still matched the direct result exactly. These are measured candidate counts and software-adapter correctness results, **not physical-GPU frame-rate or speedup measurements**. Browser canvas, the interactive GPU Lab and native Rust host compilation remain separate verification targets.
