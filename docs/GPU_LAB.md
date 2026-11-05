# GPU Lab

GPU Lab connects the existing DrawIR/compute-particle APIs to an accessible browser workflow. It is a renderer study with an original symbolic scene, not a claim that every procedural TypeScript catalog effect has been translated to GPU code.

```bash
npm ci
npm run build
npm run gallery
# Open the GPU Lab link, or /gallery/gpu-lab.html on a compatible static server.
```

## What executes where

| Work | Execution |
| --- | --- |
| Original scene animation and DrawIR commands | CPU JavaScript |
| 16×16 conservative spatial bins | GPU compute |
| Sprite/shape sampling, depth and exact alpha | GPU compute |
| Optional cosmetic particle update | GPU compute, fixed 120 Hz |
| Linear HDR, bloom, grading, final palette | GPU compute |
| Native-pixel display | Straight GPU output → premultiplied canvas → nearest integer presentation |
| PNG export | Explicit asynchronous straight-RGBA capture |
| WebGPU-unavailable reference frame | CPU worker, same selected DrawIR, static frame |

The page reports the adapter identity and whether the API identifies it as a software adapter. Unknown identity remains unknown. It displays CPU command-generation/submission time separately from cinematic GPU timestamps. Those timestamps measure HDR finishing only; they do not include the DrawIR or particle dispatches. Frame completion backpressure prevents the preview from indefinitely queuing work on a slow adapter.

## Authoring and comparison

- **Orbit / distributed / overlapping** change the layout of the diagnostic primitives. Overlapping is deliberately a dense fallback case, not a quality preset.
- **Additional shape count** adds 32–4096 original shapes to 133 core/ribbon commands. Active particles add their resident command capacity; empty particle systems are not merged.
- **Culling** selects automatic tiles, a tiled request or the full-command baseline. Limited tile memory and per-tile overflow preserve the exact full scan.
- **GPU particle burst** creates up to 128 cosmetic particles within a 512-slot pool, with seeded initial variation, outward velocity, gravity and a two-second lifetime. It does not affect gameplay.
- **Current-frame inspection** pauses playback and reads actual GPU tile data. The reported candidate visits count one scan over native pixels, weighted for partial edge tiles. Bounds-check figures are a conservative upper bound. A candidate reduction percentage is not a speedup percentage.
- **Direct / tile pixel comparison** freezes the same geometry, particle state and finishing options, captures both paths, and reports differing RGBA channel count/max difference. It is one current-adapter check, not an artistic-quality or all-device certificate.
- **Final 8-color lock** applies to visible final RGB after bloom and grading, preserving alpha. The locked palette is a demonstration choice; imported assets retain their original source values.

The six-second procedural loop and its meaning are documented in [the intent brief](../authoring/examples/gpu-lab.intent.json). Normal motion pauses when the page is hidden; reduced-motion preference starts it paused. The fallback worker keeps controls responsive even while the deliberately simple CPU reference is rendering many primitives. CPU fallback does not claim to simulate the separate GPU particle state.

## Save and reopen

**DrawIR JSON save** records the selected native size, geometry, materials, source sprite pixels and revision. It saves the current procedural pose as a static scene. Live GPU particle state and cinematic display controls are not included in the `poku-draw/v1` geometry format. **JSON open** accepts up to 4 MiB and up to 1024×1024 native pixels for this page. The core API has separate device/budget limits.

**Transparent PNG save** reads the straight-alpha output texture, so transparent edge RGB is not taken from a premultiplied browser screenshot. It preserves the selected bloom/palette treatment. Imported scene geometry can also be rendered by the native player:

```bash
cargo run --manifest-path native/Cargo.toml -- poku-draw-scene.json --frames 1 --out output
```

Use matching cinematic options if comparing native output to the browser. Reset returns to the original procedural example. Retry reconstructs a lost/unavailable WebGPU pipeline; CPU fallback always displays the observed error instead of silently claiming GPU execution.

## Validation boundaries

The fixtures in `tests/fixtures/draw-tiles.mjs` are shared by browser/native checks. `tools/gpu-tiles-harness.py` runs the actual canonical WGSL on an available wgpu adapter and labels software devices explicitly. It checks exact same-adapter direct/tiled color, packed light and linear HDR buffers, stable candidate IDs, sparse candidate reduction, dense overflow fallback and an independent brute-force CPU reference. `tests/gpu-tiles.test.mjs` separately checks resource bookkeeping, invalid partial-upload atomicity, retry/disposal races, partial-tile statistics and example JSON round trips.

Shader execution does not validate browser canvas integration, physical-device speed, subjective visual quality or every imported scene. Actual observations and device reports must be recorded separately; the intent brief does not assert that an observer has viewed the animation.
