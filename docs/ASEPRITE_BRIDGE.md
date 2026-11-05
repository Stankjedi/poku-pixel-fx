# Aseprite ↔ POKU Pixel FX

The bridge exchanges **color pixels, optional separate HDR emission, sockets and animation timing**. Export a sheet or a saved Studio project, edit it in your own Aseprite installation, then import the saved animation as a normal POKU effect. It does not reconstruct procedural simulation code from edited pixels. Existing effect sources are untouched.

Layered editing supports 2D, ACT, recipe and character projects. A 3D project's external lighting and ambient occlusion need additional snapshot channels, so `--layers` rejects that kind explicitly. Export its flattened composite for painting, or use the game-asset bundle to preserve color, emission, radiance and occlusion together.

**Verification status (2026-11-05):** PNG/JSON export → import → engine playback is tested with every pixel and duration checked. Independent Pillow PNG fixtures cover the decoder. Aseprite is not installed in the build environment, so the optional CLI/Lua `.aseprite` create/pull path has been checked against official APIs but **has not been executed in the real application**. POKU does not contain a native `.aseprite` writer or claim a complete application round trip.

## Build and export

```sh
npm ci                      # only when dependencies are absent
npm run build
npm run aseprite -- export fire/torch --out ./aseprite-work/torch
npm run aseprite -- export --project ./effect.project.json --layers --out ./aseprite-work/project
```

This creates a new project containing:

- `source.png`: straight-RGBA sheet, no background or stand-in character.
- `source.json`: Aseprite JSON-array frame rectangles, timing and POKU pivot.
- `bridge.json`: dimensions, original pivot, loop flag and frame timings.
- `import.lua`: generated, data-only script for Aseprite's official sheet import.

No Aseprite executable is searched for, downloaded or installed. `--fps 24` changes export sampling; `--opts '{"seed":7}'` passes effect options. Integer-millisecond durations are balanced (e.g. 33/34/33 at 30 fps), so rounding does not shorten an entire animation. A non-looping effect includes the renderer's terminal frame and therefore one extra frame interval. The exported clip preserves that interval rather than silently deleting the blank end.

## Separate color and HDR editing

Add `--layers` to export a two-channel project. `source.color.png` contains straight RGBA without baked glow. `source.emission.f32` contains authoritative little-endian float32 linear RGB energy, including values above one. `source.emission-proxy.png` is an 8-bit sRGB editing proxy normalized by `bridge.json.layers.emissionScale`. Keep all three with `bridge.json`; the original HDR and proxy hashes are checked before importing edits.

The generated document has `color` and `emission` layers. Normal `pull` exports both layers and reconstructs a runtime clip with separate HDR emission. `--color-layer NAME` and `--emission-layer NAME` select renamed layers; `--emission-gain N` scales the returned energy explicitly. An explicit `--layer NAME` instead requests the existing one-layer raster import.

Untouched proxy pixels retain their original float32 values exactly. Edited proxy pixels decode as `sRGB_to_linear(proxyRGB) × emissionScale × proxyAlpha × emissionGain`. This introduces the declared 8-bit editing precision only in changed pixels. Emission coverage is already included once and is independent of color alpha: a transparent color pixel can still emit light. Larger peaks require an explicit gain or a new source scale; editing a white proxy pixel alone cannot represent arbitrary additional HDR range. Aseprite's additive-layer preview is not POKU's cinematic tone mapper and bloom.

Per-frame position slices are named `socket:<name>`. Slice bounds/pivots use untrimmed source-canvas coordinates, never atlas coordinates. Project angle, visibility, basis vectors and mirror policy are stored in slice user data; a companion `socket:<name>.direction` slice can supply edited per-frame orientation while retaining the basis handedness. Slice coordinates are integer pixels; an unchanged rounded position is matched back to its fractional original on a layered pull. Original socket metadata is also carried by the PNG/JSON interchange. A `pivot` slice supplies the default clip pivot when neither an explicit option nor POKU pivot metadata is present.

Changing the timeline order can make two identical-looking proxy frames ambiguous when their original float32 values differ below 8-bit precision. Matching prefers the unchanged same-index frame, then an exact proxy match elsewhere, then edited pixels at the original index. Keep the original order for an exact HDR round trip, or author an explicit revised proxy/gain. Source JSON, frame names, timings, tags and channel data remain available for inspection.

## Create an editable document with your installed Aseprite

Supply the executable path explicitly. Paths with spaces must be quoted using your shell's syntax.

```sh
npm run aseprite -- create ./aseprite-work/torch --aseprite "/your/path/to/aseprite"
```

The script uses Aseprite 1.2.26+ `ImportSpriteSheet`, sets every frame's duration in seconds from the millisecond manifest, creates frame tags, removes only unused trailing grid cells, and asks **Aseprite** to save `editable.aseprite`. Intentional empty animation frames remain. Aseprite 1.3+ is recommended; older versions lacking `PING_PONG_REVERSE` reject that tag instead of silently changing its direction.

You can combine both steps with `export ... --aseprite "/your/path/to/aseprite"`. The exporter still does not install or launch the graphical editor. Open `editable.aseprite` yourself, edit the pixels/layers/timing, and save. `create` will not overwrite an existing editable document. It also rejects a modified `import.lua`, rather than executing arbitrary script contents.

## Bring saved edits back

```sh
npm run aseprite -- pull ./aseprite-work/torch --aseprite "/your/path/to/aseprite" --name torch-edited
```

Aseprite exports the saved document through its official `--sheet`/`--data` CLI. A fresh `revisions/001` directory is created, then `002`, etc. Each revision contains `edited.png`, `edited.json`, and `engine/` with a portable `clip.json`, two TypeScript files, and an import report. Copy **both** `torch-edited.ts` and `_torch-edited.ts` into `src/fx/fire/`, rebuild, and render:

```sh
npm run build
npm run render -- fire/torch-edited --gif
```

No catalog or source file is replaced automatically. You can use `--out NEW_REVISION` to choose the revision folder, `--layer "Ink"` to export a named layer, and `--tag "release"` to choose one tag for runtime playback. Hidden or grouped layers follow Aseprite's own export behavior; this bridge does not guess which ones you intended. Re-run `pull` after saving new edits. This is an explicit file workflow, not live sync, an Aseprite extension, or a gallery button.

## Import an existing Aseprite animation

Export from your application using the official CLI or Export Sprite Sheet UI:

```sh
"/your/path/to/aseprite" --batch drawing.aseprite --list-tags --list-layers --list-slices --format json-array --sheet-type rows --sheet edited.png --data edited.json
npm run aseprite -- import --sheet edited.png --data edited.json --out ./imported/drawing --pivot 32,56 --name drawing-edited
```

Use a **new, empty output directory**. Add `--loop` explicitly if the imported clip should loop. The bridge neither parses nor rewrites a supplied `.aseprite` binary itself. Do not use `--split-layers` in the same atlas: that produces per-layer frame entries, not a single flattened animation timeline. To import separate layers independently, export/import each one with `--layer`. Avoid `--ignore-empty`, frame filtering and reordering when tags must refer to the original frame indexes.

## Supported information and boundaries

- **Pixels/transparency:** noninterlaced RGBA8, RGB8, grayscale8, grayscale+alpha8; indexed PNG 1/2/4/8-bit including palette alpha; RGB/grayscale color-key transparency. Partial alpha is preserved, not multiplied twice. APNG, interlaced PNG and 16-bit channels are rejected with clear errors.
- **Frames:** JSON array or hash, atlas rectangles, trim offsets and original canvas dimensions. Packed, nonrotated rectangles work. Rotated atlas frames are rejected. Hash order is JavaScript property order; use JSON-array for unambiguous timeline order.
- **Timing:** each source duration is retained in milliseconds. Runtime `createSpriteClip2D` seeks by that timing, including unequal durations. The generated effect's 60 fps is only uniform preview sampling, so a GIF/video preview may approximate millisecond boundaries. The portable data is not resampled.
- **Tags:** forward, reverse, pingpong and pingpong_reverse playback. Pingpong does not duplicate turning endpoints. Tag `repeat` is retained as metadata; only explicit `--loop`/project loop controls runtime repetition.
- **Pivot:** explicit `--pivot x,y`, otherwise POKU metadata, otherwise the first `pivot` slice, otherwise `[0,0]` with a warning. `pull` retains the project pivot; if you change the canvas size/origin in Aseprite, import the exported revision manually with the new pivot.
- **Layers:** the default mode remains one flattened raster layer. `--layers` creates separate color/emission layers and exports them independently on pull. Imported PNGs already contain Aseprite's selected layer rendering, so layer opacity and blend mode are not applied a second time. Original procedural layer hierarchies, cels and groups are not reconstructed.
- **Lighting:** default flattened imports contain baked color. Layered imports carry separate linear HDR values into `SpriteClip2D.frameEmission()` and actual Painter playback. Neither mode reconstructs point lights, normals, procedural palette controls or particle physics.
- **Color:** numeric PNG samples are preserved. Embedded color profiles/gamma chunks produce warnings; no ICC/gamma conversion is performed. Visual color agreement across applications is not guaranteed by byte agreement.
- **Other metadata:** `socket:` and `pivot` slices become runtime socket/pivot data; other slices and layer metadata remain in `source.meta`. Arbitrary slices do not automatically become collision boxes.
- **Bounds:** frame axes and count ≤4,096; total decoded frame cells ≤16,777,216. Atlas axes ≤65,535 and atlas area ≤16,777,216. PNG file ≤64 MiB and JSON file ≤32 MiB. Reduce size, duration or sample rate when a limit is exceeded. Per-pixel runtime drawing is designed for small pixel clips, not large movies.

## Minimum reproducible checks

```sh
npm run build
npm run test:aseprite
node --test tests/aseprite-layered.test.mjs
```

The focused checks cover actual `weather/rising-smoke` engine export at 7 fps, exact RGBA round trip including translucent pixels, runtime drawing, pivot, 142/143 ms balanced timing, all tag directions, independent PNG formats/filters, trim restoration, malformed-input rejection, Lua generation and overwrite protection. Layered tests use real PNG/JSON/float32 files to check HDR, unchanged-pixel preservation, alpha-independent optical energy and sockets. They do not install Aseprite or pretend a fake binary is the application. Fixtures state their provenance in `tests/fixtures/aseprite/README.md`.

## Official references

- CLI and export flags: https://www.aseprite.org/docs/cli/
- ImportSpriteSheet command: https://www.aseprite.org/api/command/ImportSpriteSheet
- Frame duration: https://www.aseprite.org/api/frame
- Sprite save/delete methods: https://www.aseprite.org/api/sprite
- Tag direction: https://www.aseprite.org/api/tag
- Slice keys, pivots and user data: https://www.aseprite.org/api/slice
- Cropped image construction: https://www.aseprite.org/api/image
- Official JSON examples: https://gist.github.com/dacap/a32adb9248320326733a and https://gist.github.com/dacap/db18e5747a4b6e208d3c

No proprietary Aseprite binary or user reference-derived artwork is included in this integration. Existing licenses/notices remain in place. No public upload is required by this workflow.
