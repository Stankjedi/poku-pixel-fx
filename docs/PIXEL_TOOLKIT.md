# Native pixel style, diagnostics and material tools

These APIs make raster policy explicit and keep edits reproducible. They operate
on native sprites, so a display zoom does not add detail to a small source.
`src/examples/pixel-toolkit.ts` contains twelve executable native studies; inspect
`examples/character-studio/pixel-techniques-native.png` and its individual notes.

## One raster and coordinate contract

`blitSprite2D` uses the painter's inverse-cell mask path. Human, creature, portrait
and held-weapon drawing helpers now use it, including arbitrary rotations. It
covers transformed source cells instead of forward-stamping their centers. This
removes the reproduced diagonal holes without changing the native construction
or adding a smoothing filter.

A `RasterSprite2D` contains `x/y` actor-local top-left coordinates, `w/h`, packed
RGBA pixels and a matching silhouette mask. Pixel matrices are
`[a,b,c,d,tx,ty]`. Compose continuous local, socket, actor and camera transforms
with `composePixelTransform2D`; choose the destination source cell only in
`transformSprite2D` / the painter. An explicit bake creates a new native raster.
Avoid a chain of rotate-then-rotate bitmap bakes when the transforms can be
composed before the first bake.

## PixelStyleProfile

```ts
import {createPixelStyleProfile2D,compilePixelStyle2D} from 'poku-pixel-fx';

const profile = createPixelStyleProfile2D({
  name: 'My native palette', nativeResolution: [320,180],
  presentation: 'integer-device-pixels', sampling: 'inverse-cell-nearest',
  surfaceColors: 'indexed', palette: [0xff29344d,0xff637e8e,0xffbdd3bd],
  quantization: 'nearest', alpha: 'solid', outline: 'none',
  dither: {anchor:'object',pattern:'bayer4'}, emission: 'none',
  finalColorPolicy: 'palette-locked', poseSampling:'authored-cels',
});
const styled = compilePixelStyle2D(profile).apply(sprite, time);
```

Profiles serialize/parse as JSON. `apply` performs the authored surface-pixel
operations: saved pixel tracks, outline selection, indexing/cycles and explicit
alpha handling. Native/display resolution, final compositor light policy and pose
sampling are also declared in the profile so the project renderer can enforce the
same choices. This surface function does not resize a canvas, change the
simulation cadence, quantize a live skeleton or synthesize emission. Character
players support an explicit clip `fps`; the project/display adapter owns the
presentation and final-light stages.

`finalColorPolicy:'palette-locked'` requires an explicit palette and rejects a
claim of unrestricted `linear-hdr` light. A cinematic light composite can create
colors outside a surface palette. Check/quantize the final composite separately
when final-palette membership is the intended contract. The default remains the
existing coverage surface and cinematic linear-light path.

## Indexed color, swaps and cycles

```ts
const indexed = indexSprite2D(sprite); // exact RGB roles, independent coverage
const recolored = swapIndexedPalette2D(indexed, replacementPalette);
const water = renderIndexedSprite2D(recolored, time, [
  {indices:[1,2,3],fps:6},
]);
```

Exact indexing rejects a supplied palette mismatch. Nearest-color conversion is
an explicit operation, not an accidental side effect. Up to 256 unique RGB slots
are supported. Coverage is stored separately, cycles must use disjoint valid
indices, and a palette swap preserves slot count, indices, alpha and geometry.

## Dither and texture coordinate spaces

`DitherOptions2D.anchor` selects object, world or screen coordinates. The explicit
`objectToWorld` and `worldToScreen` matrices are applied before threshold-cell
quantization. Object-anchored cloth moves with its owner; screen anchoring stays on
the display grid. Pass the actual camera matrix for a screen-space policy.

```ts
const cutout = ditherSprite2D(sprite,
  {anchor:'object',pattern:'bayer4',scale:1},
  {objectToWorld:actorMatrix,worldToScreen:cameraMatrix});
const fabric = textureMaterial2D(sprite, {
  kind:'woven', palette:clothRamp, coordinates:{anchor:'object',scale:2}, seed:51,
}, clothSelection);
```

The alternative `dispersed8` is a fixed dispersed threshold tile; it is not
advertised as an optimized blue-noise spectrum. No pattern is reseeded per frame.
Texture brushes include checker, hatch, woven, seeded stone clusters and dither.
They preserve silhouette and coverage and can be restricted to a material mask.
They are reusable authored patterns, not an automatic finished-material artist.

Already-composited 2D frames supply `rasterToObject` as well. The project adapter
constructs it from the inverse of the actual effect/ACT instance transform and
the frame's `ox/oy`. Its `cameraOffset` is the final native presentation offset,
after transparent-output/reduced-motion policy. Consequently an object pattern
follows instance translation, reflection and rotation; a world pattern uses the
native world grid; a screen pattern includes final camera shake. Direct
`rasterToWorld` / `rasterToScreen` mappings avoid cancellation roundoff at exact
threshold boundaries. Object anchoring
in this composite means the effect/actor root, not each particle's private space.

```ts
postprocessProjectFrame(frame, project, effectTime, outputFrameIndex, {
  objectToWorld: pixelTransform2D(actual.x, actual.y, actual.angle, actual.flip),
  cameraOffset: [nativeShakeX, nativeShakeY],
  allowEmptyMasks: ['intentionalWindow'],
});
```

Projected 3D composites use `space:'screen-only'`. Screen dithering is supported;
object/world alpha dithering fails with an explicit diagnostic because a single
inverse 2D matrix cannot recover per-surface 3D coordinates. True 3D surface
patterns require those coordinates during 3D rasterization.

Postprocess color erasure and alpha dithering clear physical semantic membership
where occupied cells disappear. `negativeSpace` and explicitly allowed empty
regions remain selectable. An explicit region brush can annotate an expected
solid cell even before paint exists; `allowEmpty:true` on that edit preserves the
region when later style operations erase its color. Resolved optical emission is
independent of color: only an emission-channel edit or an explicit emission policy
changes it. Editing one HDR cell first preserves other existing packed optical
light by decoding it into the new linear buffer.

The common authored-RGBA coverage/solid/dither project paths reuse frame-local
mask scratch buffers and operate on the render target without allocating a new
full color raster each frame. `ditherSprite2DInto` is the explicit mutable-buffer
API. The ordinary `ditherSprite2D` and compiled style `apply` continue returning
independent pixels/masks. Palette conversion, contour and authored pixel-track
paths still create their operation outputs; this is not a zero-allocation claim
for every style or renderer.

## Selective contour, authored AA and subpixel keys

`selectiveOutline2D` adds one-cell contour colors on the supplied canvas. A light
direction, lit/shadow/side colors and `omitLit` determine which boundary cells are
used. An optional selection limits the operation; a protected selection preserves
critical one-cell eyes/highlights. Existing opaque cells are untouched. Supply
transparent padding if a contour must extend past the current canvas edge.

`compileAuthoredPixelTrack2D` samples discrete cluster-patch keys. An optional
approved-color list rejects undeclared colors. Each key starts from the source,
so previous edits do not accumulate when seeking.

```ts
const aa = compileAuthoredPixelTrack2D({
  duration:1, loop:true, purpose:'subpixel', allowedColors:[shade,highlight],
  keys:[
    {at:0,patches:[{x:5,y:4,rows:['h.'],palette:{h:highlight}}]},
    {at:.5,patches:[{x:5,y:4,rows:['sh'],palette:{s:shade,h:highlight}}]},
  ],
});
const cel = aa(sprite,time);
```

This models deliberately redistributed shade/highlight clusters. It does not
interpolate pixels or apply generic blur. `applyOpticalCorrection2D` similarly
selects one authored native-height tier; overlapping tiers are rejected. Eye,
finger, edge and ornament corrections must be authored for their actual cell
budget. The study includes a compact face correction and a small moving highlight.

## Explainable static and temporal diagnostics

`diagnosePixelSprite2D` returns locations, a heatmap and two confidence classes:

| Diagnostic | Meaning |
| --- | --- |
| `solid-gap` | A supplied `solidSubject` contract expected an occupied cell |
| `palette-escape` | Surface RGB is outside a selected palette |
| `enclosed-hole` | Small enclosed transparent region, a review candidate |
| `isolated-cell` | Possible accidental single cell, a review candidate |
| `jaggy-candidate` | Abrupt left-silhouette step-length change |
| `banding-candidate` | Repeated adjacent diagonal color steps |

`negativeSpace`, `sparkAccent` and `featureMask` distinguish intentional holes,
particles and face details. A pattern detector cannot decide whether a dot is an
eye or an error. No diagnosis automatically fills, deletes or certifies art.
Jaggy/banding detectors are deliberately explainable local heuristics, not an
exhaustive pixel-art-quality score.

```ts
const diagnostic = diagnosePixelSprite2D(sprite, {masks:{
  solidSubject,negativeSpace,sparkAccent,featureMask,
}});
const temporal = diagnosePixelMotion2D([
  {sprite:a,time:0,transform:alignmentA},
  {sprite:b,time:1/30,transform:alignmentB},
], {expectedStill:true});
```

Temporal transforms map each native sprite into the same comparison space. The
comparison uses the union canvas, so growth outside the first frame is visible.
It reports changed color cells, silhouette changes and a heatmap. `unexpected`
requires the explicit `expectedStill` contract; normal animation changes are not
called defects. Alignment is supplied by root/socket metadata rather than guessed
optical flow. A protected mask refers to this union diagnostic canvas.

## Material, height and normal channels

`createMaterialChannels2D` stores independent uint16 material IDs, native float
height and three-component normals. `paintMaterialChannel2D` edits a selected
material/height region. Height normals use central differences, with clamped
boundary samples. These channels never infer that a skin-colored pixel is skin.

```ts
const channels = createMaterialChannels2D(sprite.w,sprite.h,{height:heightMap});
const shade = createMaterialShader2D([
  {id:1,palette:['#253449','#53718a','#a6b9c0','#ebe5c7'],
   thresholds:[.2,.55,.84],highlight:{color:'#fff2ce',threshold:.72},
   specularPower:24,emission:[0,0,0]},
], [{position:[20,8,24],radius:64,intensity:1}], {ambient:.12});
const surface = shade(sprite,channels); // pixels + separate linear emission
```

Point-light Lambert response and a half-vector specular term choose exact authored
ramp colors; no interpolated light RGB is written into the surface. The light
source's RGB is not used to invent additional material colors. This is a local
2.5D material response, without scene shadows, refraction or a physical BRDF.
Emissive materials return coverage-weighted linear RGB separately. The examples
include a discrete metal response and a narrow glass-like highlight response,
not simulated transparent/refractive glass.

## Report coverage and verification

| Report item | Concrete API / behavior |
| --- | --- |
| P01 | Shared inverse-cell direct character blit |
| P03 | Serializable PixelStyleProfile and compiled surface policy |
| P04 | Continuous affine composition and one inverse raster bake |
| P05 | Semantic solid/negative-space/accent/feature diagnostics |
| P06 | Object/world/screen dither and texture coordinates |
| P07 | Exact indices, palette replacement and timed cycles |
| P08 | Light-directed/protected selective contour |
| P09 | Located jaggy/banding candidates with heuristic labels |
| P10 | Approved-color held AA/subpixel pixel tracks |
| P11 | Disjoint native-size optical correction tiers |
| P12 | Aligned union-canvas temporal cell diagnostics |
| P13 | Material IDs, height/normals and quantized light response |
| P14 | Twelve executable native cluster/material examples |

P02 exact display scaling is provided by the project/gallery presentation layer;
it is separate from these native raster operations. `tests/report-character-pixel.test.mjs`
checks rotated coverage, transform composition, indexing/cycles, anchoring,
protected contour, authored colors, diagnostic semantics, material channels and
executable example output. Visual review remains necessary for style and meaning.
