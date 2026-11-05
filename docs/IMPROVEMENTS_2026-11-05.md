# 2026-11-05 improvement report implementation

Implemented against `main` at `4249ebdcf59d974b36fe17868959cb55b3073cfe`, preserving the later Aseprite and pixel-fidelity work beyond the report's `b6627aa` baseline.

| Report | Implementation |
|---|---|
| I01 | Retained the existing correct source-over canvas paste; non-overlapping atlas cells use exact RGBA copy. Browser PNG downloads encode straight RGBA directly instead of round-tripping it through canvas premultiplication. |
| I02 | Actual 120 Hz simulation ticks, compensated clocks and retained fractional time; deterministic ACT physics and exact authored contact/freeze boundaries. |
| I03 | Surface color and emission share depth and coverage; explicit optical glow has separate semantics. |
| I04 | Independent body/back/front composition, straight alpha, HDR transfer and world-coordinate placement; compact source support follows changing frame origins. |
| I05 | Float32 depth comparisons and explicit black-hole horizon ownership. |
| I06 | Shared transformed pixel-edge bounds and reflected pivot for effect and ACT assets. |
| I07 | Site build prepares engine assets, current catalog and both bundles together; source/content hashes verify prepared inputs, including standalone site packages. |
| I08 | Shared per-pixel transparent fragment ordering, independent opaque occlusion and visible depth, with reused typed storage. |
| I09 | HDR is authoritative; packed mirrors cannot override linear energy. Legacy writers have explicit import/add paths. |
| I10 | Sequential frame generators feed video, contacts, comparisons and atlas consumers; diagnostic raw/light snapshots are opt-in. HDR atlas scanlines stream to a file. |
| I11 | Cumulative millisecond rounding shared by atlas/WebP generation and applied to bulk downloads. |
| I12 | Browser and CLI effect sheets share layout, edge finishing, frame count, settings and metadata. Scene exports explicitly include selected actor/background/speed. |
| I13 | Requested but missing encoders and unmatched IDs fail with a nonzero status; ACT JSON references the actual PNG basename. |
| I14 | Runnable gallery examples serialize actual palette, seed, actor selection and flip; they create their own canvas and clear each frame. |
| I15 | A paused 3D gallery renders only on invalidation; camera, resize, seed and appearance controls invalidate it. |
| I16 | Offscreen Bresenham steps are skipped with original phase/gradient preserved; body attachments avoid viewport-wide scratch buffers and scans. |
| I17 | Shield topology, adjacency, projections and response storage are reused; Human scratch/palettes and bounded discrete portrait states are reused with preserved output ownership. |
| I18 | Ten report-derived directional metadata boundary fixes, a further four-pixel left expansion for Earth Stomp under the corrected child clock, and Curse terminal fade; targeted contract tests and light/HDR determinism checks supplement existing coverage. |
| I19 | Native Human/Creature actor adapters, gallery controls, ACT pose/weapon attachment and matching scene exports. Stateful silhouette transformations have an explicit effect-start snapshot contract. |
| I20 | Optional separate source-over color/coverage and unclamped linear emission assets; continuous 3D game atlases record camera, pivot, seed and timeline separately from inspection sheets. |

## Detailed contracts

- [2D time, composition, clipping and bounds](RUNTIME_CONTRACTS_2D.md)
- [3D visibility, transparency and HDR](RENDERING_CONTRACTS.md)
- [Streaming exports and game layers](EXPORT_CONTRACTS.md)
- [Native actor authoring](ACTOR_ADAPTERS_2D.md)

## Scope and limits

The image fixes preserve native geometry and palettes except where the original composition was incorrect. Corrected 3D occlusion/transparency deliberately changes affected visual baselines. Optical bloom remains a chosen screen effect. Refraction is an explicit resolved pass, and overlapping integrated volumes should be evaluated as one field; this implementation does not claim arbitrary order-independent volume integration.

The `.emission.f32` format contains little-endian interleaved linear RGB. It is not an ordinary display image and needs an appropriate texture import/upload path in a consuming engine. The existing single PNG workflow remains available. No native game runtime or universal Unity/Godot importer is claimed.

The report's performance-warning effects remain profiling candidates. Allocation reductions and projection-count changes are distinct from measured frame rates; this change does not promise a numerical FPS improvement or change artistic detail to obtain one.

## Validation

The validation set covers 72 test files and 654 automated cases. Initial integrated runs were followed by focused reruns of the corrected failures. All 72 files are included in the pull request's CI workflow; the final CI result is recorded on the pull request.

| Verification | Result |
|---|---|
| Engine, tools and both gallery bundles | Full TypeScript/esbuild build passed. |
| 3D tests | 175 cases verified. Nine representative effects were compared with `4249ebd` in packed and cinematic rendering, including multiple times and camera angles. Seven affected fixture files were refreshed only after verifying their old samples against that baseline and reviewing the new images. |
| Exports, Aseprite and visual review | 38 cases passed, including real PNG round trips, encoder failure handling, reflected pivots, timing, transparent 3D atlases and linear emission. |
| Contact timing and native actors | 27 focused cases passed. Stateful Human/Creature body effects retain the same start mask through prewindup, and real Petrified shattering agrees across no intermediate drawing and 60/144/165 Hz drawing. |
| Corrected composition clock | All 55 reference samples for 11 moves match at direct seeking and 30/60/144/165 Hz host partitions. Classic Fireball retains its original 43-frame launch prefix; the full 205-frame sequence has a separately reviewed fixed-tick reference. Original composition hashes remain recorded as provenance. |
| Catalog bounds and determinism | All 268 source effects passed. The ten reported clipping fixes and Curse lifetime were checked; the additional Earth Stomp clipping found during QA was repaired, then all 12 moves passed with zero warnings. Ten full-catalog warnings concern per-frame cost on the QA host. |
| Actual browser exports | Flipped Arrow PNG pixels, frame cells, durations and engine metadata match CLI output. Human 96 px + sword + flip + seed + 0.5× scene export was decoded successfully; browser runtime errors: zero. |
| Paused 3D gallery | No redundant renders while paused; a camera change invalidates the image, after which rendering becomes idle again. |
| Site preparation | The 264-effect public catalog and 2D/3D bundles pass source/content-hash verification in both the full checkout and a standalone site copy. The original hosted community CSS is preserved in a separate stylesheet with the same cascade order. |

### Measured memory and work reduction

Nuke contact export was measured in separate Node processes using the same current engine: 400 × 320 native pixels, 271 frames and 16 selected contact samples.

| Consumer | Peak process RSS | Retained sequence payload |
|---|---:|---:|
| Streaming | 105.8 MiB | 0 B |
| Current RGBA collector | 358.5 MiB | 277,504,000 B |
| Collector with diagnostic buffers | 625.9 MiB | 555,008,000 B |

The streaming consumer keeps one current frame; the collectors keep 271. All three contact PNGs were byte-identical, with SHA-256 `88095f5f9ea1da3d904cef7881fe88d1e31649d13d7d13817a82a79a37d4aea0`. The diagnostic collector represents the former four-buffer retention policy using the current engine; this is not a historical engine speed benchmark.

For Energy Shield at 2 seconds, the same reviewed sample made 2,241 `project()` calls instead of the baseline's 18,836 in both packed and cinematic rendering. This measures eliminated repeated projection work, not an FPS gain. Contact sheets, atlases and typed fragment pools still consume memory proportional to the output or scene complexity.
