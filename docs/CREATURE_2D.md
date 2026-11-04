# Side-view creatures, built in 2D

`src/core/creature.ts` adds opt-in fox, cat, owl and fantasy-dragon studies.
They use independent quadruped and winged body plans, not the human skeleton.
Existing human tools, stock actors, VFX and assets are unchanged. No image,
mesh, projection, AI bitmap or third-party art is imported into these sprites.

## Use

```js
import { Painter, drawCreature2D, creatureRig2D } from 'poku-pixel-fx';
const p = new Painter(frame).place(120, 150);
drawCreature2D(p, {species: 'fox', size: 96}, 'walk', seconds);
const rig = creatureRig2D({species: 'fox', size: 96}, 'walk', seconds);
// For actual movement instead of a treadmill preview, add rig.travelSpeed * seconds
// to the painter's x placement. A continuous stance then stays fixed in world x.
```

Public functions:

- `creatureRig2D(style, motion, seconds, options)` returns anatomical landmarks,
  fixed segment lengths, foot-contact flags, cycle phase/period and travel speed.
- `renderCreature2D(...)` returns pixel data, a matching binary mask, constant
  sprite bounds and the rig. Cache static poses or bake animated atlases.
- `drawCreature2D(painter, ...)` honors the caller's placement, mirror and opacity.

Fox/cat: `idle` (3s), `walk` (2s), `trot` (1s).
Owl/dragon: `idle` (3s), `fly` (1.5s).
Unsupported combinations fail explicitly. Size is 32–192, in canonical 96-unit
construction space. It is not a promise that the full tail/wings fit that width.
Coordinates are x right/y down, with the ground near y=0; flight is elevated.
`facing: 'left'` reflects full pixel cells and anatomical coordinates exactly.
`{reducedMotion: true}` returns a static supported resting pose, with zero travel.

`body` and `accent` accept three to six valid opaque hex colors, dark to light.
Three major values preserve the silhouette at small sizes. At size 64 and above,
extra ramp entries add haunch, back, covert or membrane shading when supplied.
The preview includes distinct size-specific color families: snow/violet/rust fox,
gold/lilac/slate cat, snow/blue/brown owl and ember/sapphire/jade dragon.
Palette arrays are recorded with the transparent atlas metadata.
No outline is added by default. `outline: '#color'` adds a single one-cell contour
outside the completed union and never overwrites the colored interior.

## What the studies turn into reusable features

1. **Four-beat walking vs diagonal trotting.** Feet have independent phase offsets.
   The walk uses a lateral sequence with 76% stance; the grounded stylized trot
   pairs diagonal limbs and uses 54% stance. During contact, toes remain at
   one height and move backward at one speed. Forward root travel cancels that
   displacement. Swing follows a lifted return, not a sine wave below the floor.
2. **Anatomy before surface detail.** A ribcage and haunch establish the body axis.
   Forelegs bend differently from hindlegs, with fixed bone lengths. A tapered
   neck joins the head. A fox has a long muzzle, tall ears, bib and brush tail;
   a cat has a shorter face, compact ears and a thin curved tail.
3. **Wings are articulated.** Shoulder, elbow and wrist move with fixed lengths.
   Elbow folding varies continuously on recovery instead of snapping at the
   stroke boundary. Owl coverts overlap grouped primary feathers; dragon
   membranes span a scalloped edge with colored supporting rays. Far/near
   wings are authored layers, not a depth simulation.
4. **Secondary motion is connected.** Tail samples are continuous tapered
   masses with delayed motion toward the tip. This changes the silhouette,
   rather than scattering disconnected particles around a static body.
5. **Readable pixel clusters.** Filled material masses meet without black panel
   borders. Same-color boundary coverage preserves very thin legs, feather tips
   and horns at 32px construction size. Larger sizes gain subtle marks, but
   tiny designs rely mainly on ears, muzzle, wing shape and tail.

## Research basis and artistic interpretation

- [Milton Hildebrand, *Symmetrical Gaits of Dogs in Relation to Body Build* (1968)](https://originalwisdom.com/wp-content/uploads/bsk-pdf-manager/2019/04/Hildebrand_1968_Symmetrical-Gaits-of-Dogs-in-Relation-to-Body-Build.pdf): gait phase, stance duration and footfall sequence are separate design variables. The paper also shows why one gait should not stand in for every build. Our two presets are simplified art studies, not measured fox/cat locomotion data.
- [Cornell Lab, *Everything You Need to Know About Feathers*](https://academy.allaboutbirds.org/feathers-article/): asymmetric flight feathers, fan-shaped tail feathers and overlapping coverts inform how broad wing masses are grouped before individual tips. No reference image was copied.
- [Natural History Museum of Los Angeles, *How Bird Feathers Work*](https://nhm.org/stories/how-bird-feathers-work): contour feathers establish the bird silhouette, and coverts cover the flight-feather bases. This is represented as shared color masses rather than outlined feather panels.

The dragon is an original fantasy construction, not a biological claim. Wing
motion is a hand-authored 2D visual study, not an aerodynamic simulation.

## Render and test

```sh
npm run build
npm run test:creature
npm run preview:creature -- records/creatures
# PNG/atlas only when ffmpeg is unavailable:
npm run preview:creature -- records/creatures --single
```

The preview writes four individual GIFs, a six-second lineup GIF, dark/light
native review PNGs, and four transparent PNG atlases with frame rectangles,
frame durations and the fixed pivot `[130,150]`. All samples use nearest-neighbor
scale only. The lineup includes native 32/64px left-facing studies, alongside
96px right-facing animations. The 32px variants use compact three-color ramps;
64/96px variants demonstrate four-to-six-color material ramps. Green marks in the ground strip indicate contacts.

Review iterations: first established body plans and motion; second widened wing
fans and moved flying examples away from labels; third repaired detached acute
pixels at small sizes and made elbow folding continuous across stroke reversals.
Tests check skeletal lengths, gait ordering, grounded contact/root travel,
connectivity, transparent bounds, deterministic loop pixels, silhouette-only
contours, exact mirroring, reduced motion, input validation and wing continuity.
Tests cannot certify artistic quality. Review every new style or motion in motion
and at native size before using it in production.

## Limits

This adds four authored side views, not arbitrary creature synthesis. There is
no front/back turning, terrain IK, collision, gallop, wing aerodynamics, takeoff,
landing or combat. Owl/dragon idle is an airborne rest study, not a perched pose.
The fixed sprite bounds intentionally include margin for all supported poses;
export tools may crop with a shared pivot if they need smaller textures.

## Canvas resolution and a shared world pixel grid

`renderCreatureCanvas2D(style, motion, seconds, {width:64, height:64, pivot:[43,49]})`
exports onto exactly the requested pixel canvas. It **never resizes the creature
or silently clips**. A too-small canvas throws. The canvas is storage area;
`style.size` controls the creature's physical dimensions in scene pixels. Putting
the same size-32 fox on 64×64 and 128×128 canvases gives identical body pixels
relative to its pivot, just different transparent margins.

The preview writes real 64×64, 128×128 and 256×256 frame atlases under `canvases/`.
Those sample sets use physical sizes 32, 64 and 128 respectively, not a nearest-
neighbor enlargement of one image. `physicalSize` and `canvas` are separate
metadata fields, and `sourcePixelsPerScenePixel: 1` states the shared-grid contract.

`shared-world-native.png` draws a size-64 fox, size-32 cat, size-64 owl and size-128
dragon directly into one 768×300 native pixel canvas. Every sprite source pixel
occupies one scene pixel. When displaying the world, magnify the completed scene
at one common integer scale with nearest-neighbor filtering. Do not magnify
individual actors by different factors to fill their canvas slots. Bigger canvas
area may hold a physically bigger creature or extra transparent margin; it does
not authorize bigger pixel blocks for that creature.

## Continuous fur and restrained anatomical shading

A later visual review found that narrow bright strokes along leg bones, tails,
wing leading edges and feather shafts made the body look assembled from separate
parts. Those strokes are removed. Torso, neck and near limbs now share one coat
base through their joints. Far limbs use a restrained occlusion shade, and broad
ribcage planes carry the light instead of thin borders around each limb. Natural
fox bib/tail-tip markings, eyes and material changes between a dragon membrane
and its skin remain distinct.

The supplied body ramp is interpreted as a material range. The renderer derives
nearby opaque, stepped coat colors from that range, so its brightest entry is not
stamped down every bone. Extra large-size tones are broad low-contrast patches,
not additional shiny lines. There are still no gradients or antialiased edges.
Wing feathers use overlapping fill masses; membrane supports are low-contrast
structural shadows, not bright rays.

This adjustment changes color rendering only. Gait phase, bone lengths, flight
paths, fixed pivots, canvas dimensions, no-resampling behavior and the shared-world
pixel-grid contract remain unchanged. To reproduce the matched review using a
previous local checkout as the baseline:

```sh
node tools/preview-creature-materials.mjs records/creature-materials /path/to/baseline-checkout
```

The review tool writes before/after quadruped and wing GIFs and native-size
comparisons at 32, 64, 96 and 128. The optional review tool needs an actual baseline
build and never fabricates the "before" appearance.
