# Aseprite ↔ POKU Pixel FX

The bridge exchanges **rendered pixels and animation timing**, not the procedural effect's source construction. Export a transparent sheet, edit it in your own Aseprite installation, then import the saved animation as a normal POKU effect. Existing effect sources are untouched.

**Verification status (2026-11-05):** PNG/JSON export → import → engine playback is tested with every pixel and duration checked. Independent Pillow PNG fixtures cover the decoder. Aseprite is not installed in the build environment, so the optional CLI/Lua `.aseprite` create/pull path has been checked against official APIs but **has not been executed in the real application**. POKU does not contain a native `.aseprite` writer or claim a complete application round trip.

## Build and export

```sh
npm ci                      # only when dependencies are absent
npm run build
npm run aseprite -- export fire/torch --out ./aseprite-work/torch
```

This creates a new project containing:

- `source.png`: straight-RGBA sheet, no background or stand-in character.
- `source.json`: Aseprite JSON-array frame rectangles, timing and POKU pivot.
- `bridge.json`: dimensions, original pivot, loop flag and frame timings.
- `import.lua`: generated, data-only script for Aseprite's official sheet import.

No Aseprite executable is searched for, downloaded or installed. `--fps 24` changes export sampling; `--opts '{"seed":7}'` passes effect options. Integer-millisecond durations are balanced (e.g. 33/34/33 at 30 fps), so rounding does not shorten an entire animation. A non-looping effect includes the renderer's terminal frame and therefore one extra frame interval. The exported clip preserves that interval rather than silently deleting the blank end.

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
"/your/path/to/aseprite" --batch drawing.aseprite --list-tags --list-layers --format json-array --sheet-type rows --sheet edited.png --data edited.json
npm run aseprite -- import --sheet edited.png --data edited.json --out ./imported/drawing --pivot 32,56 --name drawing-edited
```

Use a **new, empty output directory**. Add `--loop` explicitly if the imported clip should loop. The bridge neither parses nor rewrites a supplied `.aseprite` binary itself. Do not use `--split-layers` in the same atlas: that produces per-layer frame entries, not a single flattened animation timeline. To import separate layers independently, export/import each one with `--layer`. Avoid `--ignore-empty`, frame filtering and reordering when tags must refer to the original frame indexes.

## Supported information and boundaries

- **Pixels/transparency:** noninterlaced RGBA8, RGB8, grayscale8, grayscale+alpha8; indexed PNG 1/2/4/8-bit including palette alpha; RGB/grayscale color-key transparency. Partial alpha is preserved, not multiplied twice. APNG, interlaced PNG and 16-bit channels are rejected with clear errors.
- **Frames:** JSON array or hash, atlas rectangles, trim offsets and original canvas dimensions. Packed, nonrotated rectangles work. Rotated atlas frames are rejected. Hash order is JavaScript property order; use JSON-array for unambiguous timeline order.
- **Timing:** each source duration is retained in milliseconds. Runtime `createSpriteClip2D` seeks by that timing, including unequal durations. The generated effect's 60 fps is only uniform preview sampling, so a GIF/video preview may approximate millisecond boundaries. The portable data is not resampled.
- **Tags:** forward, reverse, pingpong and pingpong_reverse playback. Pingpong does not duplicate turning endpoints. Tag `repeat` is retained as metadata; only explicit `--loop`/project loop controls runtime repetition.
- **Pivot:** explicit `--pivot x,y`, otherwise POKU metadata, otherwise `[0,0]` with a warning. `pull` retains the project pivot; if you change the canvas size/origin in Aseprite, import the exported revision manually with the new pivot.
- **Layers:** metadata is retained, but the PNG is already flattened. Opacity and blend mode are **not applied a second time**. Original procedural layers, original cels, groups and editable light channels are not reconstructed. A new editable document begins as one flattened raster layer. You may add layers in Aseprite, then export their composite or one selected layer.
- **Lighting:** engine color and glow are baked into the sheet. Imported playback writes the color buffer only; it does not recover a separate additive emission buffer, point lights, surface normals, procedural palette controls or particle physics. This also means appearance over very bright backgrounds may differ from the original additive effect.
- **Color:** numeric PNG samples are preserved. Embedded color profiles/gamma chunks produce warnings; no ICC/gamma conversion is performed. Visual color agreement across applications is not guaranteed by byte agreement.
- **Other metadata:** slices and layers are retained as source metadata, not implemented as hitboxes, per-slice pivots or editable layers.
- **Bounds:** frame axes and count ≤4,096; total decoded frame cells ≤16,777,216. Atlas axes ≤65,535 and atlas area ≤16,777,216. PNG file ≤64 MiB and JSON file ≤32 MiB. Reduce size, duration or sample rate when a limit is exceeded. Per-pixel runtime drawing is designed for small pixel clips, not large movies.

## Minimum reproducible checks

```sh
npm run build
npm run test:aseprite
```

The 19 focused checks cover actual `weather/rising-smoke` engine export at 7 fps, exact RGBA round trip including translucent pixels, runtime drawing, pivot, 142/143 ms balanced timing, all tag directions, independent PNG formats/filters, trim restoration, malformed-input rejection, Lua generation and overwrite protection. Tests do not install Aseprite or pretend a fake binary is the application. Fixtures state their provenance in `tests/fixtures/aseprite/README.md`.

## Official references

- CLI and export flags: https://www.aseprite.org/docs/cli/
- ImportSpriteSheet command: https://www.aseprite.org/api/command/ImportSpriteSheet
- Frame duration: https://www.aseprite.org/api/frame
- Sprite save/delete methods: https://www.aseprite.org/api/sprite
- Tag direction: https://www.aseprite.org/api/tag
- Official JSON examples: https://gist.github.com/dacap/a32adb9248320326733a and https://gist.github.com/dacap/db18e5747a4b6e208d3c

No proprietary Aseprite binary or user reference-derived artwork is included in this integration. Existing licenses/notices remain in place. No public upload is required by this workflow.
