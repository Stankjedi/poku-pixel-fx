# Projects, game assets and reviewable exports

## One saved project

`poku.project/v1` records the effect kind/id, seed, options, sample rate, crop duration, actor/target selection, render profile, palette policy, layer visibility and native-pixel edits. Use the same file for CLI rendering, review, sharing and Aseprite export:

```sh
poku-fx render --project effect.project.json --bundle --trim --deduplicate --max-texture 2048
poku-fx review --project effect.project.json
poku-fx share --project effect.project.json
poku-fx aseprite export --project effect.project.json --layers --out ./editable-effect
```

The source-checkout equivalents are `npm run render -- ...`, `npm run review -- ...`, `npm run share -- ...` and `npm run aseprite -- ...`. Project kinds are `2d`, `act`, `3d`, `recipe` and `character`. An explicit `intentRef` resolves relative to the project file first. If Studio's canonical `authoring/<id>.intent.json` is absent there, the caller workspace and then the package/checkout's authored briefs are checked. Other explicit paths are never silently replaced. Review/share output names the resolved `intentSource`. The resolved project is serialized and SHA-256 bound into exported metadata.

The installed `poku-fx` command writes `records/` and `authoring/` in the caller's workspace; it does not write into `node_modules`. A source checkout is required to register new procedural modules. PNG/JSON/bundle output needs no external encoder. GIF/MP4 requires ffmpeg on PATH. Aseprite create/pull requires an explicitly supplied local executable. Runtime ESM and precompiled CLI files are included in the release package.

## Exact ACT duration and deliberate crops

ACT export includes negative-time windup, the declared effect/recovery ending and hit-stop. Simultaneous contacts use the largest freeze at that instant. A one-shot receives its configured end hold; a loop inspection exports two cycles. `resolveActDuration()` provides a bounded timeline plan, and `resolveActExport()` counts the actual clock without rasterizing. Browser and CLI use the same selection.

There is no implicit eight-second crop. `--seconds` is an explicit duration bound; if it ends before completion, metadata reports `truncated:true`, `termination:"explicit-duration-crop"` and no end hold. The default export fails if the declared ending cannot be reached. One export is bounded at one million clock steps. The `check` command rejects unmatched IDs and an empty catalog with a nonzero exit code.

## Multi-page game bundle

```sh
poku-fx render fire/torch --bundle --trim --deduplicate --max-texture 1024 --padding 1
poku-fx act melee/sword-slash --bundle --no-actor --no-target --hold 0
poku-fx render-3d frost --bundle --trim --max-texture 1024
poku-fx render-3d frost --bundle --cinematic true --trim --max-texture 1024
```

The output contains `name.asset.json`, one or more `name.N.color.png` pages and, when captured, matching `name.N.emission.f32` pages. Cinematic 3D also writes `name.N.radiance.f32` and `name.N.occlusion.f32` lighting snapshots. Node writes a single active atlas page at a time. Texture limits are configurable up to 4096 pixels per axis in this sink. Each stored frame rectangle plus padding must fit a page. Frames are never silently rescaled or split across pages.

`--trim` is lossless: bounds include nonzero color even at zero alpha, independent emission/radiance and non-neutral occlusion. `--deduplicate` reuses rectangles only when every stored channel matches, while retaining every frame's own duration, pivot, source size and trim offset. It does not shorten holds. Color padding is transparent and occlusion padding is neutral (`1`); consumers needing extruded borders should choose a deliberate sampler strategy rather than assume hidden extrusion.

### `poku-asset/v1`

| Field | Contract |
| --- | --- |
| `color` | RGBA8888, sRGB samples, straight alpha |
| `coordinates` | `untrimmed-pixel-edges-y-down` |
| `pages[].image` | PNG path relative to the manifest |
| `pages[].width/height` | Actual trimmed atlas-page dimensions |
| `pages[].emission` | Optional relative `.f32` path, little-endian float32, three linear-sRGB channels per pixel |
| `pages[].radiance` | Optional camera-lighting snapshot, little-endian float32 RGB, `colorSpace:"linear-srgb"`; independent of emission strength |
| `pages[].occlusion` | Optional ambient-occlusion snapshot, little-endian float32, `channels:1`, `colorSpace:"linear"`; `0..1`, outside/neutral value `1` |
| `frames[].page` | Zero-based page index |
| `frames[].rect` | Integer `{x,y,w,h}` rectangle within that page |
| `frames[].sourceSize` | Original native `[width,height]` before trimming |
| `frames[].trimOffset` | `[x,y]` placement of the rectangle in the original canvas |
| `frames[].pivot` | Original native pixel-edge pivot, independent of trim offset |
| `frames[].duration` | Positive integer milliseconds; cumulative rounding preserves total timing |
| `frames[].time` | Authored effect time in seconds; ACT may start negative or repeat during freezes |
| `frames[].sockets` | Named `{x,y,angle?,visible?,basisX?,basisY?,mirrorPolicy?}` values in untrimmed source coordinates; angle is radians, basis vectors retain mirrored handedness |
| `events[]` | `{name,timeMs,sourceTime,payload}`; playback milliseconds include freezes, original authored seconds and payload remain available |
| `tags`, `contacts` | Authored animation ranges and contact data; contact positions are relative to the frame pivot after effect flip/rotation |
| `settings` | Resolved rendering settings, including the saved project when provided |
| `source` | Engine/RNG version, source/project hashes and optional revision identifiers |
| `files[]` | Relative file path, byte length and SHA-256 of each binary page |

Emission is coverage-weighted radiance independent of the color channel's alpha. Consumers must not multiply it by color alpha again. Color-only transparent pixels may still carry optical energy. A native/GPU consumer should upload atlas pages once and update frame rectangles and transforms during playback.

Raw color includes the selected surface palette policy and native edits. `finalColorPolicy:"palette-locked"` additionally quantizes the composed PNG/preview after light and bloom; that last quantization is not baked into separate raw color/HDR files. A consumer of those files must apply the declared final policy itself if its final screen colors must stay inside the same palette. `project.actor` controls actor inclusion in saved-project assets; legacy effect-ID sheets keep their existing bare-effect default.

The manifest contains payload hashes, not a self-hash. A consumer can verify each listed file before loading it. It should still validate dimensions, frame rectangles, durations and its own GPU texture limits; a valid SHA-256 is an integrity check, not a signature or trust policy.

## 3D render profiles

`createRenderProfile3D()` centralizes camera, lights, cinematic settings, background, grid, camera motion and native size. `render-3d ... --profile FILE` reads the same profile schema as the gallery. Explicit CLI camera flags override it and the resolved profile is recorded.

Direct `render-3d --bundle`/`--atlas` keeps the asset defaults of transparent background, no grid and no camera motion. A saved 3D project instead preserves its explicit profile choices for review/export consistency. Set `background:null`, `grid:false` and `cameraMotion:false` in a game-asset project when those presentation elements should be absent. Background and grid drawn into the source frame are retained in its color channel. Both gallery and CLI use the same eight-unit grid with one-unit spacing.

Cinematic preview finishing never replaces separately exported source color/HDR. Its external lighting and ambient occlusion are stored as separate snapshots and restored by the native player before the shared cinematic resolve. The linear base is multiplied by occlusion; emission receives `lightStrength`, while external radiance is added independently. A noncinematic `linear-transparent` atlas instead uses identity finishing. This reproduces the stored camera and lighting; the bundle contains no world geometry or depth/normal scene from which to render a new camera or relight with new world lights. `--layers` also preserves the two lighting files. Aseprite layered editing remains a 2D color/emission workflow; 3D painting uses its flattened composite, while the game bundle keeps the lighting channels intact.

## Review evidence and variants

`review --project` writes a version-specific directory under `records/review/<id>/variants/<project-sha256>/`. It stores the resolved project, intent snapshot, native/zoom/silhouette/value/background sheets, full playback and empty reviewer templates. Source bytes, exported PNG/JSON and scene output are hashed. Changing seed, camera, palette, layer visibility or edits creates a different project variant.

The reviewer must actually inspect the evidence and record their own observations. The tool never fills viewing confirmations, assigns an aesthetic score or creates user approval. A source or output change invalidates an earlier record. `share --project` rerenders the selected project and requires matching explicit visual and intent records. Intent record commands include `--variant SHA256`. An agent's self-review is clearly distinct from user approval. `render` remains available while work is unfinished.

## Public gallery scope

The public gallery stores the full submitted JSON, with an image metadata pointer to a separate JSON object. Per-frame duration, rectangle, trim offset, pivot, tag, socket and project fields survive upload, edit and download. Playback uses the real frame durations and untrimmed placement; static and non-looping animations work. Title-only changes keep the existing manifest. Conditional updates stage the new manifest first, protect the image version and remove failed sidecars.

Older entries only had uniform timing. Their download is explicitly marked `reconstructedLegacy:true`; fields that were never saved cannot be recovered. Bulk ZIP download preserves the manifest data and relinks the PNG filename for the archive.

The hosted gallery remains a **single PNG plus JSON** service: PNG at most 2048×2048 / 5 MiB and JSON at most 1 MiB. It does not upload the separate float32 emission pages or a multi-page bundle. Use the composite PNG/JSON for public presentation, and keep the complete local game bundle for a native/GPU consumer. Multipart upload does not make an orphaned emission filename downloadable. Rights declarations and publication remain explicit user actions.

## Focused validation

After one completed build, run the existing export/Aseprite/review checks plus these contract suites:

```sh
node --test tests/export-studio.test.mjs tests/aseprite-layered.test.mjs tests/shared-manifest.test.mjs tests/project-workflow.test.mjs
node --test tests/cli-package.test.mjs
```

The clean-install test packs the built release, installs the local tarball offline into a directory containing spaces, checks its actual npm bin, imports ESM and renders a project without TypeScript/esbuild installed in the consumer. It runs with Node on Linux, macOS and Windows; the CI platform result is evidence for that platform, not a claim inferred from another OS. These tests validate data/rendering contracts. They do not certify artistic quality or replace inspection in Aseprite or the destination game.
