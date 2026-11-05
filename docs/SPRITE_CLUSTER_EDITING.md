# Manual native-pixel cluster edits

`editSpriteCluster2D` makes a non-destructive edit to the existing engine sprite shape:
`{ w, h, pixels: Uint32Array, mask: { w, h, data: Uint8Array } }`. This fits `HumanSprite`,
`HumanPortraitSprite`, creature sprites and stock actor data without converting them into a new
indexed-cel format. It does not change any existing renderer's defaults.

The need came from local eye/face authoring: the research Cel's transparent write cleared color
but left silhouette occupancy behind. Authors had to clear both arrays manually. The new operation
always updates both values for a touched cell, including explicit deletion.

```ts
import { renderHumanPortrait2D, editSpriteCluster2D, hex } from "poku-pixel-fx";

const original = renderHumanPortrait2D({ resolution: 64 });
const edited = editSpriteCluster2D(original, {
  x: 25, y: 22, // Example only: choose the actual target cells in your portrait.
  rows: [".hh.", "sxxs"],
  palette: { h: hex("#f4d6b0"), s: hex("#b47f6d"), x: null },
}, {
  selection: { w: original.w, h: original.h, data: original.eyeRegionMask },
});

// Display the returned pixels, rather than calling a procedural renderer again.
painter.mask(edited.mask, 0, 0, (x, y) => edited.pixels[y * edited.w + x]);
```

## Rules and compatibility

- Coordinates are integer positions in the sprite's native buffer, not its world-space `x/y` or
  scaled preview. One Unicode code point in a row is one cell. Ragged rows are allowed.
- Missing palette symbols mean "leave unchanged". A dot is skipped unless explicitly assigned.
  `null` means erase. Colors use engine-packed RGBA, including signed values from `hex`.
- Visible color writes preserve their exact alpha and set silhouette occupancy to 1. Zero-alpha
  colors normalize to transparent zero and clear occupancy. This is replacement, not alpha blending.
- The optional full-canvas selection is read-only. Unselected and off-canvas cells are ignored.
  Untouched color/mask cells remain byte-identical, including any pre-existing mask policy.
- The result owns new color and silhouette buffers. The source and patch are not changed. Other
  metadata, rig data and anatomical masks are retained by reference, not recalculated. In particular,
  `eyeMask` and `eyeRegionMask` remain authored semantic regions; this does not infer new anatomy.
- `drawActor` retains its stock row art by default. Use `withActorPixels(edited)` to explicitly draw
  the current pixel/mask buffers through the same actor rendering path; see the connection below.
- Deleting an occupied cell removes stale silhouette data. An outline tool can still intentionally
  paint transparent neighbors of remaining geometry; that is its normal boundary behavior.
- This edits one raster result. It does not alter the original procedural character source, propagate
  an edit across poses, edit emission buffers, or automatically improve facial expression or detail.

## Focused verification

```sh
npm run build
node --test tests/sprite-edit.test.mjs
```

Tests cover erasure and subsequent mask/outline drawing, exact-alpha replacement, independent
buffers, an actual portrait's selected eye region, native clipping, skipped symbols and invalid inputs.

## Connect edits to actor rendering

Passing an edited stock actor directly to `drawActor` previously displayed its original row art:
11 changed buffer cells produced **zero** changed output cells. The legacy behavior remains available
for compatibility. Opt into the edited raster once, then pass that object through the usual actor path:

```ts
import { stockActor, editSpriteCluster2D, withActorPixels, drawActor, hex } from 'poku-pixel-fx';

const edited = editSpriteCluster2D(stockActor(2), {
  x: 9, y: 8, rows: ['.hhh.', 'hxxxh', '.hhh.'],
  palette: { h: hex('#ffce70'), x: null },
});
const actor = withActorPixels(edited);
drawActor(painter, actor); // reads actor.pixels and actor.mask
// Existing preview code also forwards it: createFx(effect, { actor }).
// Subsequent editSpriteCluster2D(actor, ...) results retain the opt-in marker.
```

`withActorPixels` validates dimensions, buffers and finite local `x/y`, then returns a shallow wrapper
with `renderSource: 'pixels'`. It does not copy or mutate buffers; use the editor for independent copies.
`drawActor` validates this path again before drawing, honors silhouette occupancy, packed color alpha,
the supplied actor alpha, painter fade/alpha mode and placement/mirroring/rotation. It never silently
falls back to stock art if a pixel actor is invalid or the painter lacks `mask()`.

Ordinary stock calls and sprite-only legacy painters keep the same path and output. An unmodified stock
actor also produces identical pixels after opt-in. No effect, palette, default actor, light buffer or
procedural character generator is changed. The stand-in actor remains excluded from effect-only sprite
sheets, just as before.

For another native sprite, provide its intended local top-left explicitly if it has no `x/y`:
`withActorPixels({ ...editedPortrait, x: -editedPortrait.w / 2, y: -editedPortrait.h })`.
This draws one raster; it does not fabricate head/chest anchors required by actor-aware effects, retarget
the stock `createAct` rig, propagate edits across poses, or rebuild semantic masks. Only pass it to an
effect whose actor metadata requirements you have satisfied. Regenerating the procedural sprite still
discards raster-only edits.

```sh
npm run build
node --test tests/actor-pixels.test.mjs tests/sprite-edit.test.mjs
node tools/preview-actor-pixels.mjs
```

The comparison shows the stock actor, ignored legacy-path edit and explicit pixel-path edit at native
size and 8× nearest scaling. The golden cluster and erased cells are diagnostic changes, not an assertion
that the character's design or visual quality has improved.
