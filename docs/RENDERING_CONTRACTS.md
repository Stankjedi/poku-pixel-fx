# Rendering contracts from the 2026-11-05 review

## Surface color, opacity and emission — I03, I05, I08

Every 3D primitive now uses one surface fragment path. Opaque geometry replaces hidden surface emission; transparent geometry attenuates rear color and emission together. A frame-local queue sorts fragments at each pixel, so intersecting triangles and overlapping effects do not depend on whole-object center sorting. The arrays remain resolved after every draw call, keeping existing frame consumers usable without a new finalization call.

`frame.depth` is the nearest visible sample used by the lighting pass. The opaque depth used for rejection is tracked separately. Equal-depth fragments retain the order in which the caller submitted them. Float32 rounding occurs before comparison as well as storage, fixing same-sphere repaint and custom horizon ownership comparisons.

The fragment arena consists of reusable typed arrays and grows only when a frame needs more fragments than the previous high-water mark. Opaque-only frames do not allocate a transparent arena. The ordinary far-to-near append composites one sample in constant time; an out-of-order sample is inserted in that pixel's list and only that pixel is resolved again. Exact transparency costs storage proportional to raster fragments, so the established small native pixel render target remains significant for CPU use.

Surface `emission` is distinct from `glow` / `screenLight`: the latter explicitly requests optical screen glow that is not hidden by geometry. Refraction and preintegrated volume passes retain their documented ordering constraints; the fragment queue is not a multiple-scattering volume solver.

Black-hole disk light and its artistic bloom now write both light representations explicitly. Horizon cleanup uses a stored horizon mask and the exact stored Float32 depth, rather than recomputing a double and comparing it to Float32. The bloom mask stops adding light over the central void; it no longer unconditionally deletes the emission of a foreground fragment occupying that pixel.

## HDR authority — I09

An HDR-enabled frame's `hdrLight` is the authoritative linear sum. Its packed `light` is a compatibility mirror for the existing simple compositor. The cinematic pass no longer selects the larger of decoded packed light and HDR, which previously replaced valid midrange HDR values when the 8-bit mirror saturated.

There are two explicit bridges for a packed-only writer:

- `importPackedLight(frame, additionalBuffer, "add")` adds a separate source to HDR. `"replace"` imports a complete packed legacy result instead.
- `CinematicCompositor.render(..., { legacyLight: additionalBuffer })` includes a separate packed light source without modifying the frame.

Neither bridge can recover energy already clipped in an 8-bit source. Never pass an HDR mirror as *additional* light. `radiance` remains independent world illumination, so `lightStrength: 0` does not remove world lighting.

Import complete direct-buffer results before drawing or after completing a material pass. If further 3D primitives will follow custom direct array writes, call `painter.adoptResolved()` to make that result the backing input of the next pass. This is an explicit pass boundary, just like refraction; direct buffer writes cannot supply depths for discarded individual transparent fragments.

## Shield reuse — I17a

The shield's sixteen-ring, ninety-six-sided mesh has 1,537 shared vertices and 2,976 triangles. Connectivity is fixed, while deployment changes the active aperture and positions. Mesh normals, response values, points, projected vertices and face sorting indices are reused. Hex edges and their neighboring cells are constructed once per surface/cell size. Shared edge endpoints are projected once; active cells are selected from the cached topology during deployment and retraction.

The public `project(point, out?)`, `triangleProjected` and `lineProjected` paths let other static meshes reuse projections without changing rasterization. The energy-shield effect keeps its base surface identity through its entire timeline.

## Regression coverage and reviewed fixtures

`tests/render-contracts-3d.test.mjs` covers submission-order independence, transparent transmittance, multiple painters sharing a frame, Float32 sphere repaint, actual wind fragment sorting at three orbit angles, saturated packed/HDR divergence, explicit legacy import and shield projection reuse. The old cinematic assertion that chose `max(packed, HDR)` is replaced with the authoritative-HDR rule. The black-hole test now distinguishes an occluded surface from deliberately retained optical glow.

Whole-frame fixture hashes must be reviewed against the new contract because the prior values included hidden rear light and prematurely rejected transparent fragments. Choreography, seeds, silhouettes, camera projections, primitive pixel coverage and the independent 2D catalog remain separate regression contracts. Rendering correctness changes are not evidence of an unmeasured frame-rate improvement.
