# Experimental native 2D portraits

`renderHumanPortrait2D(style, pose)` and `drawHumanPortrait2D(painter, style, pose)` are opt-in, original front-facing adult bust studies. They are not a replacement for the full-body human renderer, a likeness model, or evidence that the existing body animation and weapon art have reached production quality.

```ts
const portrait = renderHumanPortrait2D({
  resolution: 128, skin: 'brown', hair: 'bob', hairColor: 'copper',
  clothing: 'coat', cloth: 'moss', eyes: 'amber',
}, { expression: 'smile', time: 0.4 });
```

## Resolution and one scene pixel grid

- Native target resolutions are 64, 96, 128 and 192. Geometry is rasterized at the target size. Eyes use integer rows sized for that tier; the larger version is not an enlarged 64px bitmap.
- `canvas: [width, height]` adds centered integer padding only. Each dimension must be at least `resolution` and at most 512. A 64px portrait on a 128px canvas remains the exact same 64px art.
- Assets in one world must share a source pixel grid. Canvas dimensions can differ for bigger creatures or padding. Do not independently stretch each asset to fill its cell. Compose at source resolution, then enlarge the entire scene by one integer display scale.
- Different portrait resolutions in the preview are separate design studies, not simultaneous in-world actor scales.

## Construction

Face, hair, neck and clothing are joined color masses. Only the final union receives an optional one-pixel outer contour. Material shadows and collars do not receive dark outlines. Four hairstyles own different fringes and rear silhouettes; three clothes types, three face shapes and four expressions are available.

The result returns `faceMask`, `eyeRegionMask`, `eyeMask`, `frontHairMask`, `headAnchor` and `eyeAnchors`. Eye masks stay inside the anatomical face and reserved eye region. Front hair cannot occupy that reserved region. Blink replaces the entire eye with a lid, not an iris drawn over hair. Whole-art reflection mirrors the masks and raster anchors too.

`time` is a deterministic two-second blinking idle. There is deliberately no rigid whole-bust bob or simulated hair swing. `reducedMotion` disables automatic blinking; explicit `blink` is still respected. Gaze is clamped and remains centered at 64px because one-pixel horizontal shifts changed the expression too much.

## Visual iteration and limits

Five rendered revisions reduced checkerboard eyes, shortened the lower face and neck, rounded the shoulder slope, removed decorative clothing stripes and separated front fringe designs. A separate review caught a cross-resolution problem: early 64px eyes looked sleepy while 192px eyes looked alert. Integer eye rows replaced the fractional polygons. A semantic test also caught a blink endpoint outside the half-open reserved region; that region now includes its boundary cells.

The current art is still a restrained portrait baseline. Faces share much of the same geometry, expressions remain limited, crown highlights can read as stylized wedges, and there are no three-quarter/profile portraits. Passing geometry tests does not certify beauty, character identity, believable acting or game-ready animation. Full-body heads need their own native-size designs; do not shrink these bust eyes into 4px heads.

## Reference study

These primary tutorials informed the construction principles, not copied artwork or exact geometry:

- [Slynyrd: Anime Faces and Hair](https://www.slynyrd.com/blog/2020/7/28/pixelblog-29-anime-faces-and-hair): anatomical feature placement, exaggerated but deliberate eyes, grouped hair locks.
- [Pedro Medeiros: Cluster Sketching](https://saint11.art/pixel_art_articles/article2/): connected color masses before fine detail.
- [Pedro Medeiros: Thoughts on Low Resolution](https://saint11.art/blog/thoughts_on_low_resolution/): choose meaningful features for each pixel budget instead of shrinking every detail.

All art and palettes here are original. Numerical thresholds and shapes are implementation studies, not rules established by those sources. No source artwork is bundled.

Build, run `npm run test:human`, and generate the native sheets/GIFs with `npm run preview:human:portraits -- records/human-portraits`. Inspect native sizes, enlarged nearest-neighbor pixels, light/dark backgrounds and closed-eye frames separately.

A silhouette-only finishing pass also removed accidental one-pixel pinholes at the tied-hair/shoulder join and simplified the overlapping rear-hair boundary. The deliberate large negative space between tied hair and neck remains open in the material mask. Tests require one four-connected material shape and reject tiny enclosed background pinholes; this is separate from judging the contour visually.
