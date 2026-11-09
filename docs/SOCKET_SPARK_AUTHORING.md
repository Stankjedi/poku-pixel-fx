# Author a new sprite-socket spark effect

This opt-in executable recipe creates an ordinary effect module, not a new socket schema or a Studio default. It uses `SpriteClip2D` and `captureSpriteSocketBirth2D`. Supply the anatomy/material source for each pose yourself. No image inference is performed.

## Create and use

From a checkout with compiled core modules, including `build/core/sprite-socket-birth.js`:

```sh
node examples/author-socket-sparks.mjs examples/socket-sparks/turning-torch.config.json examples/socket-sparks/turning-torch.intent.json ./my-new-torch
```

The new directory contains `effect.mjs`, the exact input `config.json`, and the validated `intent.json`. Its parent must already exist. An existing directory, file or symlink is rejected. Configuration, every scheduled birth and intent timing are validated before output creation. Writes use exclusive creation; files created by this invocation are removed if a write fails. If concurrent unrelated content prevents cleanup, the original failure is retained with `cleanupErrors` and `outputDirectory` diagnostics; unrelated files are never removed. No registry, catalog artwork, generation defaults or user preferences change.

```js
import * as effect from './my-new-torch/effect.mjs';
import { createFx, createFrame, composite } from './build/core/fx.js';
const fx = createFx(effect, { x: 0, y: 0 });
const frame = createFrame(96, 64);
fx.update(0.23);
fx.draw(frame);
const rgba = new Uint8ClampedArray(96 * 64 * 4);
composite(frame, rgba, null);
```

This is the standard runtime EffectModule path, not a registered catalog entry. `new`, Studio, catalog render/review/share commands do not discover this output automatically. Keep the generated relative recipe import valid when moving output. The generated module and recipe are editable source. For catalog integration, author an effect entry explicitly and follow normal intent/review workflow; this writer deliberately never edits a shared registry.

The recipe imports the focused `build/core/sprite-socket-birth.js`, not the root index. The package export `poku-pixel-fx/core/sprite-socket-birth` resolves that leaf when it is emitted. Source `src/core/index.ts` includes the helper, but an older compiled root index does not: do not assume `import { captureSpriteSocketBirth2D } from "poku-pixel-fx"` works until that index is rebuilt. A source-only checkout needs its normal supported compiler step first. The isolated study used one installed-esbuild leaf emission; it did not run a full build or regenerate root exports/types.

## Input and reuse

- `version: 1`, name, integer native `size`, `origin`, finite positive `durationMs`.
- `clip` is the existing portable SpriteClipData2D, including per-frame `sockets`, palette RGBA runs and optional HDR. Aseprite bridge `engine/clip.json` data can be supplied here after explicitly authoring and checking `socket:` slices. `clipOptions` retains the selected tag and loop policy. See ASEPRITE_BRIDGE.md. Character rig socket tracks are a different authoring source and are not automatically converted.
- `clipClockOffsetMs` is explicit: clip time = effect time + offset. A negative offset delays the source. It never changes event births. Clip durations stay milliseconds in data and are converted once by the existing clip API.
- `roots` is a strictly increasing translation-only path `{atMs, position:[x,y]}` covering zero through duration. Coordinates locate the clip pivot in effect-local space, not top-left. Linear interpolation is shared by the displayed clip and birth capture. Birth snapshots are effect-local: host placement, flip and rotation are applied once to both by createFx. Moving the host afterward still moves the whole effect, including detached sparks. Host flip is geometric reflection, not anatomical swap-hand metadata resolution; do not use this recipe for swap-hand/authored mirrored poses without authoring a separate correct clip. For general affine source transforms use the lower-level helper yourself.
- `events` is the author-selected list (zero is valid). Each has unique `id`, `sourceRole`, `birthMs`, `lifeMs` (greater than zero and at most 300), `socket`, explicit `unavailable: "throw" | "skip"`, optional `fallbackSocket`/socket-basis `offset`, socket-basis `velocity` in px/s, unsigned packed RGBA `color`, and `light` from 0 to 2. Birth plus life must fit the effect duration. Additional JSON attributes remain in each birth's `event` record. No distance rescheduling, count multiplier or random regeneration is applied.
- Missing/hidden requested sockets resolve only to the author's explicit fallback at the same selected clip time. `skip` preserves the scheduled slot with null source; `throw` aborts authoring before writes. Invalid metadata always throws. Hidden fallback is not an anatomical guess.

The example authors a small three-pose torch with 18 short sparks, four hidden-tip fallback events and a moving root. Each birth snapshots position/basis/velocity once; the later root and pose never drag that spark. The renderer uses short linear flights and at most 2px exposure trails, not contact patches, distance-based schedules, a flame simulation or a new shared spark-field default.

## Validation and honest review

Run `node --test tests/socket-spark-authoring.test.mjs` after the focused compiled helper exists. The test uses the actual runtime and helper. Configuration validation, deterministic pixels, empty ending and no-overwrite checks do not prove artistic quality. Inspect native pixels and actual normal-speed playback before treating a new artistic effect as complete. The included fixture is a connection demonstration, not a finished fire/phoenix design. Its intent records no viewed playback or user approval.
