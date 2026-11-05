# Export contracts: transport, timing and game assets

The CLI and 2D gallery use the same `src/render/export.ts` plan and atlas metadata.
These changes address report items I01, I06, I10–I13 and I20. The fixes preserve
native resolution and effect quality; they do not downsample the artwork to save
memory.

## Effect assets and scene previews

An **effect sheet** contains the effect on transparency, at its authored frame
rate. Stand-in actors, preview backdrops and camera shake are excluded. An
**acted scene** contains the selected actor, the target when enabled, poses and
hit-stop. Its transparent sheet excludes preview camera movement, while a video
may include the chosen backdrop and camera response. The output kind and the
settings are recorded in `meta.pokuFx.settings`.

```bash
npm run build
node build-tools/tools/render.mjs projectiles/arrow --sheet --opts '{"flip":true}'
node build-tools/tools/render.mjs weather/rising-smoke --sheet --layers --seed 17
node build-tools/tools/render.mjs explosions/nuke --gif --mp4 --sheet --scale 2
node build-tools/tools/act.mjs melee/sword-slash --actor human --height 96 --weapon sword --sheet
node build-tools/tools/act.mjs status/burning --actor fox --height 72 --motion trot --gif
```

The same selection is available to scripts via
`options.actorSelection`. This is serializable selection data; live actor adapter
methods are not serialized into an atlas. Human motions include `idle`, `walk`,
`guard`, `crouch` and `wave`; creature motions are checked against that creature's
renderer. `act` follows the authored pose timeline. `--opts` can carry the full
selection and style; the explicit CLI actor flags override those fields.

Stateful body transformations can capture their actor's silhouette when created.
Those modules use `actorSampling: "snapshot"` during the active effect, binding
the same initial native pose to simulation and visible body. Frame-driven status
effects use live pose masks. `actTiming()` records the resolved policy; a
snapshot transformation is not advertised as a continuously deforming effect.

## Straight RGBA and placement

PNG stores straight RGBA. `canvas.paste()` performs source-over composition,
including the destination alpha. An atlas cell uses `canvas.copy()` instead:
all four channels are copied exactly, even RGB beneath zero alpha. An atlas does
not darken a translucent pixel by multiplying its RGB by alpha a second time.

`exportLayout2D()` transforms the source canvas's **pixel edges** around its
pivot, fits the result, and records the new pivot. For the 112 × 32 arrow whose
pivot is `[92, 16]`, horizontal reflection yields pivot `[20, 16]`. Quarter-turn
rotations swap the dimensions without adding spurious rows from floating-point
trigonometry. A margin is included in the recorded pivot.

This fitting is an export placement operation. `createFx()` continues to use the
world coordinates supplied by the game. Explicit export options `x` or `y` keep
the caller's chosen canvas placement; they opt out of fitting. This is useful for
an authored layout and can intentionally clip the art. Omit those fields for an
automatically fitted effect asset.

`edgeFade` is an explicit, light-only asset step. By default, non-screen effects
without extra margin ease emission over the last eight native pixels; screen
fills and padded diagnostic renders disable it. Both packed light and HDR use
the same attenuation. Color/coverage is unchanged. Set `--edge-fade 0` or the
programmatic `edgeFade: false` to disable this finishing step. The selected width
is stored in the export settings.

## Timing and references

Frame `i` receives the duration

```ts
Math.round((i + 1) * 1000 / fps) - Math.round(i * 1000 / fps)
```

The sum for `N` frames is exactly `round(N * 1000 / fps)` milliseconds. At 30 fps,
90 frames total 3,000 ms. Millisecond metadata, rather than repeated individually
rounded frame lengths, therefore follows the same playback rate as an importer
using `fps`. The exported time samples are recorded separately. An acted
scene's samples can repeat during a freeze; its `frozenFrames` identify those
output frames.

Normal looping effect assets omit a duplicate terminal frame. One-shots retain
the established terminal-frame policy, and `terminalFrame` records that choice.
Their playback duration consequently includes the terminal frame's display time.
Changing the lifetime policy is separate from correcting cumulative rounding.

`meta.image` is the basename of the PNG actually written beside the JSON. ACT
sheets, including names such as `melee-sword-slash.sheet.png`, use that exact
name. A CLI command fails with a nonzero exit code if an ID matches no effect or
if a requested GIF/MP4 cannot be created because ffmpeg is unavailable. The
optional library encoder still returns `false` for a missing ffmpeg binary.

## Memory behavior

`renderSequence()` and `renderActSequence()` yield frames. A new iteration
recreates the instance from its seed. Consumers can discard each frame after
using it. The CLI fills its selected contact cells and atlas cells while the
video writer stages that same frame to disk. GIF and MP4 reuse one native RGBA
file and, where applicable, one GIF palette. Scale and repeat count do not
multiply the staged source sequence.

A category comparison draws one effect's selected samples into the final canvas
before moving to the next effect. It does not retain every effect's frames.
An ACT strip retains only its chosen time samples. The final requested atlas or
contact canvas still requires memory proportional to its own pixel count.

`renderFrames()` and `renderAct()` remain convenient collecting APIs for callers
that intentionally need random access to every frame. Their default result has
`color` and `clear` RGBA. `raw` and `light` are now requested with
`diagnostics: true`; `layers: true` requests separate material and linear emission.
Existing raster regression tests and visual-review tooling request diagnostics
explicitly. Code that previously assumed `frame.raw` was always present should
set this option or adopt the streaming API.

```ts
const sequence = renderSequence(effect, { seed: 17 });
for (const frame of sequence.frames) {
  consume(frame.color); // current preview RGBA
  consumeAsset(frame.clear); // current transparent, unshifted effect RGBA
}
const diagnostic = renderFrames(effect, { diagnostics: true });
```

ACT atlas layout needs the exact number of frames after hit-stop. Its stream
counts simulation updates once without rasterizing, then renders the sequence;
this is bounded in memory and preserves contact timing.

### Clock changes and artwork regression evidence

The current runtime accumulates elapsed time with compensation and normalizes
numerical noise at 120 Hz boundaries. A simulation consumes complete 120 Hz
ticks; presentation retains fractional time between those ticks. This makes a
boundary such as 0.4 seconds consistent across 30/60/120/144/165 Hz hosts.

Older artwork hashes were captured with repeated `time += 1 / 30`. In that
schedule the twelfth sample is `0.39999999999999997`, one representable number
below 0.4. Pure effects that select a seeded animation phase with `floor(time *
rate)` can consequently choose a different phase even though their art and
renderer are unchanged. Rounding can also move a contour by one pixel.

The original air, energy-core and lightning artwork hashes are retained. Their
fixture helper supplies the original accumulated time **only to the draw
argument**, while running the current `createFx`, painter, option resolution and
export path. It does not replace fixed simulation updates or composition
scheduling. Simulated fixture effects continue to run the current normal clock.
An independent boundary test checks the canonical energy-core frames across
host rates, and the 2D contract suite checks seeded simulation and nested cues.
Comparison against the pre-change build confirmed zero color/light differences
for the affected pure effects when both versions receive the same legacy draw
timestamps; no stored pure-effect artwork hash was regenerated to accept the
clock change.

Compound effects have a separate simulation migration. The previous runtime
split each host update `dt` into `ceil(dt * 120)` equal steps of `dt / n`. For
example, one update of 0.137 seconds ran 17 steps of approximately 0.008058824
seconds. The corrected runtime runs 16 steps of exactly 1/120 second and retains
the remainder. A chain starts each child at its exact cue time, so simulated
debris and smoke can change even when the authored shapes and choreography do
not. Reinstating the old subdivision to satisfy those hashes would restore the
host-frame dependency.

`chain-composition-before.json` therefore remains unchanged as provenance. The
reviewed `chain-composition-fixed-tick.json` records its checksum, original
hashes, original crop/pivot, the clock contract and new expectations. All 55
samples from 11 moves were checked against the pre-change build: 19 retain the
old hash and 36 reflect the corrected clock. Each new sample is also tested
against one large update and 30/60/144/165 Hz partitions. Paired renders of all
11 moves were inspected with amplified difference images; core silhouettes,
palettes and composition remain recognizable while particle positions/ages and
some quantized animation phases follow the new clock.

Classic Fireball retains all 43 original charge/flight frames through 1.4
seconds byte-for-byte. Its first changed frame is the first post-impact sample
at 1.4333333333333333 seconds. The 205-frame fixed-tick fixture preserves the
original full hash as provenance and separately checks the unchanged launch
prefix, so a future launch-art regression cannot hide in the simulation update.

## Separate color/coverage and HDR emission

`--layers` adds three outputs alongside the simple composite export when
`--sheet` is also selected:

| File | Contents |
| --- | --- |
| `name.color.png` | Straight sRGB color with coverage in alpha |
| `name.emission.f32` | Unclamped linear-sRGB emission, three little-endian Float32 values per pixel |
| `name.layers.json` | Aseprite-compatible frames, common pivot/timing/settings, and layer contracts |

The emission file is an **atlas**, with the same full width and height as the
color PNG. Its order is row-major, interleaved R, G, B. It has no header and no
alpha channel; dimensions and format are stated in the JSON. Unused cells are
zero. Values above 1 are preserved. HDR rows are written directly to a temporary
file, so export does not allocate a second full HDR sequence or atlas in RAM.

A target-engine shader combines the layers in linear space:

```text
output = linear(color.rgb) * color.a
       + linear(scene.rgb) * (1 - color.a)
       + emission.rgb
```

Upload the color PNG as sRGB, sample its alpha as coverage, and upload the
emission data to a floating-point **linear** texture. Do not premultiply the
emission by the color alpha; a light-only pixel can have zero color coverage.
Use the same nearest-neighbor UV rectangles and pivot for both layers. Tone
mapping and bloom are the host engine's choice. A Unity/Godot custom importer
can use the JSON frame rectangles and convert the `.f32` atlas into its native
floating-point texture resource; no built-in importer plugin is claimed here.

The Float32 sidecar is deliberately not labeled a PNG or an EXR. It provides a
precise, dependency-free interchange format with explicit layout. For example,
a JavaScript importer reads channel `j` with
`new DataView(bytes.buffer, bytes.byteOffset).getFloat32(j * 4, true)`.

A single composite RGBA remains available for simple workflows. Such an image
cannot encode both arbitrary-background source-over color and independent
additive emission exactly. The separated outputs retain those two operations.

## 3D inspection sheets versus game atlases

Existing `render-3d` calls remain inspection sheets: they sample the full effect
for review, keep the default background/grid policy and record camera settings.
A game atlas uses consecutive frames at `--fps`, transparent background, no grid,
and no baked camera movement by default.

```bash
# Existing inspection workflow
node build-tools/tools/render-3d.mjs water --frames 24 --yaw 90 --out records/3d/water-review.png

# Consecutive game frames and independent material/emission layers
node build-tools/tools/render-3d.mjs frost --atlas --layers --fps 30 --width 192 --height 128 --out records/3d/frost-atlas.png

# Opt in to baking scene motion or a grid; the JSON records the decision
node build-tools/tools/render-3d.mjs meteor --atlas --layers --camera-motion true --grid true --fps 30
```

`--frames` explicitly limits the number of consecutive atlas frames; omitting it
exports the effect's full normal timeline. `--columns` applies identically to
composite, color and emission atlases. The common metadata contains seed, effect
options, base camera, stages/cues, output kind and time samples. The pivot is the
projection of world `[0, 0, 0]`. When camera movement is baked, per-frame camera
and pivot samples record that movement.

`--background none` requests transparency; a hex background bakes that color.
An effect can still deliberately paint its own dark surfaces or atmospheric
geometry. Those authored pixels remain part of the asset. `--cinematic true`
applies cinematic finishing to the composite preview; separated layers retain
the palette material and raw linear emission for the host to finish. This is
recorded as `cinematicFinishing: "composite-preview-only"`.

The GIF command uses the same scene/camera contract and streams through the
shared video encoder. Both old simple PNG output and opaque video previews remain
available.
