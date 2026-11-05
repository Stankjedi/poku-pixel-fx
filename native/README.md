# POKU native wgpu reference

This crate loads `poku-draw/v1` scenes or exported `poku-asset/v1` bundles and executes the same DrawIR/cinematic WGSL as the browser implementation. It is a working library and headless playback/capture CLI. It does not execute JavaScript effect callbacks or create a native window.

```sh
cargo run --manifest-path native/Cargo.toml -- native/examples/draw-scene.json --out /tmp/poku
cargo run --manifest-path native/Cargo.toml -- /path/to/asset.json --frames 60 --fps 60 --socket hand --out /tmp/playback
```

The output directory contains PNG frames and `playback.json` with actual adapter identity, frame/socket/event samples and upload/timing counters. The API has `AssetPlayer::advance/seek/socket/drain_events`, `Asset::render_options/frame_lighting`, `Renderer::submit/submit_with_lighting/output_texture/capture`. Call `submit` (or `submit_with_lighting` for exported 3D camera-lighting arrays) and sample the output texture for a host render loop without readback; `render` and `render_with_lighting` capture for the CLI.

Atlas PNG is straight sRGB; companion emission and optional external radiance are linear-sRGB float32 little-endian RGB. Optional occlusion is a linear float32 scalar in [0,1]. Frame restoration retains all three independently, including radiance in transparent pixels. This is camera lighting baked as separate arrays, not relightable geometry. Timings are cumulative milliseconds. Sockets retain an affine basis so reflected attachments preserve handedness. Declared final palette locks are enforced by the shared GPU resolve shader, after cinematic finishing. Legacy encoded-light profiles and bundles without a declared mode are rejected unless the caller explicitly chooses supported finishing; omitted 2D authoring modes mean legacy, not cinematic. Direct 3D `settings.renderProfile` / `renderMode` are honored, including `linear-transparent` identity finishing. A new background behind a transparent asset requires an explicit packed `background` option.

Use `--options cinematic.json` to supply finishing settings; `{"mode":"cinematic"}` explicitly chooses cinematic finishing for a legacy-declared or mode-less bundle, retaining the native `CinematicCompositor` defaults unless values are supplied. `{"mode":"linear-transparent"}` chooses identity finishing. These are deliberate conversions and do not reproduce legacy compositing. For exact legacy appearance, export already composed RGBA and choose identity finishing. The bundle's final palette lock remains in effect. A game host should call `Asset::render_options()` to resolve the same policy.

Keep `src/render/shaders/` alongside `native/`: Rust `include_str!` loads those canonical files. `Cargo.lock` is checked in; target and generated image caches are excluded from package distribution. See [GPU rendering and validation scope](../docs/GPU_RENDERING.md) for the full contracts, real adapter evidence and remaining platform limits.
