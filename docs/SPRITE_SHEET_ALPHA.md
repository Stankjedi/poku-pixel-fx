# Straight-alpha sprite-sheet export

The tool canvas previously pasted RGB as `source × alpha + destination × (1 − alpha)` even when the
destination was transparent, then stored the source alpha as well. A half-transparent red cell
`[255, 0, 0, 128]` became `[128, 0, 0, 128]` in the actual PNG. An ordinary straight-alpha PNG viewer
or game applied alpha again, making smoke, glow and fading pixels too dark.

`tools/lib/fxlib.mts` now retains straight RGBA when pasting into transparent cells. For two translucent
layers it uses source-over coverage (`As + Ad × (1 − As)`) and normalizes RGB by that coverage. Fully
transparent sources leave the destination untouched. This is a transport/compositing correction, not
an artistic improvement algorithm.

## Compatibility

- The engine's frames, color/light buffers, effects, palettes, timing and default runtime rendering do
  not change. Existing opaque contact-sheet composition and byte rounding remain identical.
- Transparent PNG sheets intentionally change where they previously darkened partial-alpha colors.
  Fully opaque sprite colors and frame layout, pivots, durations and metadata are unchanged.
- `render --sheet`, `share`, sheet exports and other users of the shared tool canvas receive the fix.
  Gallery/browser exports use their existing browser canvas path; no new export mode is introduced.
- Existing visual-review records for affected sheets become stale because the actual PNG hash changes.
  Rebuild and regenerate the evidence, then inspect the changed output before recording a new review.
  Do not silently reuse a review of the darker file.
- The image remains standard straight-alpha RGBA. Do not manually premultiply its RGB a second time.
  This does not remove the separate limits of baking additive glow into a transparent RGBA sheet.

## Focused reproduction and checks

```sh
npm run build
node --test tests/sprite-sheet-alpha.test.mjs tests/visual-review.test.mjs
node tools/preview-sprite-alpha.mjs
```

Three tests decode actual emitted PNG bytes, compare a real Rising Smoke frame pixel-for-pixel, verify
translucent overlap, and preserve the old opaque-background result across all 256 alpha values and
clipping. The comparison PNG shows the same source frame, previous export behavior and corrected
export over the same dark background at 3× nearest scaling. No effect redesign is implied.
