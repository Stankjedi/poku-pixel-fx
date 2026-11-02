# Engine integration and migration

Current state: TypeScript sources cover the core, all 254 effects and gallery; CLI sources use `.mts`, and `npm run build` emits JavaScript for execution. Sampled reference rendering and representative CLI, package and gallery flows have passed; full-frame equivalence and target-engine integration are not established. Node is needed for the current tools; the browser runtime uses compiled JavaScript. There is no native library or engine binding yet.

## Existing exchange format

A sprite-sheet export consists of an RGBA PNG and Aseprite-style JSON with frame rectangles, durations and `meta.pokuFx`: effect id, frame size, pivot, frame rate, loop flag and optional act timing. This is the available engine-neutral path today. Rendering frames is the visual reference for any future port.

## Proposed native boundary

Select target engines and platforms before freezing an ABI. A minimal candidate is an opaque effect instance with explicit create/update/draw/destroy operations, caller-owned RGBA buffers, dimensions and stride, configurable seed, palette, origin and timing. Define channel order, alpha and light-buffer compositing, thread ownership, error handling, lifetime, deterministic time steps, and versioning before implementation. A C ABI wrapping C++ or Rust is a candidate, not a selected implementation.

## Acceptance criteria

1. Type-check all migrated TypeScript without suppressing errors; retain local tools and exports.
2. Implement the selected native runtime with no Node dependency in the game process.
3. Compare dimensions, pivot, frame count, timing, loop seams and image pixels against reference exports for pure, simulated and acted effects; document numerical tolerances.
4. Run an actual target-engine integration with update, draw, recolor, disposal and export or playback. Verify representative visual quality and performance on the target platform.
5. Preserve copyright and license notices for incorporated code and assets.

No native behavior is claimed until these checks pass.
