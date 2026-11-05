# Engine integration and migration

## Implemented in 0.4

The TypeScript package supplies the effect catalog, authoring data, browser editor and precompiled CLI. The optional `native/` crate is an actual **Rust/wgpu headless reference renderer and exported-asset player**. It requires no Node process during playback. Its scene renderer and cinematic pipeline use the canonical WGSL under `src/render/shaders/`.

Use [native/README.md](../native/README.md) for commands and embedding APIs, [GPU_RENDERING.md](GPU_RENDERING.md) for the exact renderer contracts and measured adapter scope, and [ASSET_EXPORT.md](ASSET_EXPORT.md) for the versioned asset format.

## Existing exchange and playback boundary

`poku-asset/v1` retains RGBA color, independent linear HDR emission, variable frame durations, pages/trim/pivot, oriented sockets, events and integrity hashes. Optional radiance and occlusion sidecars preserve the saved 3D camera's lighting snapshot. The native player resolves the stored finishing and final-palette policy before submitting frames.

`Renderer::submit()` and `submit_with_lighting()` leave an output GPU texture that a game host can sample in its render pass. Explicit capture produces PNG frames and a playback trace. Resident atlas revisions avoid repeatedly uploading unchanged pixel assets. CPU scene construction and lighting restoration still perform array copies in the reference implementation.

The actual native comparison harness covers DrawIR primitives, alpha/depth, palette policy, capture, asset timing and a real 3D catalog export. Its documented software-adapter measurements do not establish physical GPU performance or universal numerical identity.

## Additional integration work

The current crate does not implement a native window, a Unity/Godot/Unreal plugin, a stable C ABI, a complete skeletal physics engine, or automatic execution of arbitrary TypeScript effect callbacks. These remain separate integration choices rather than implied capabilities of asset playback.

Before adding a game-engine binding, select its host/device ownership and define texture format, alpha/light conventions, frame/event clock, destruction, errors and versioning. Test the actual game loop with update, seek, draw, socket attachment and disposal. A host that changes sprite transforms must transform screen-space lighting consistently. A different 3D camera requires rendering the original scene again; an atlas is not relightable mesh geometry.

Retain the MIT license, NOTICE and relevant third-party notices in redistributed tools and assets.
