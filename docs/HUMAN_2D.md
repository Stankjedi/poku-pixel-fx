# Connected human pixel art, pure 2D

`src/core/human.ts` is an opt-in 2D human drawing toolkit. It does not replace the
existing stock actor or the 3D-derived act rig. All artwork is rendered through
Poku's real 2D `Painter`: no image generation, imported character image, mesh,
projection, or 3D renderer.

## What this pass corrects

The earlier fantasy lineup drew almost every head, armor plate, limb and clothing
piece with a dark polygon outline. Those repeated internal borders made the body
look like separate overlapping panels. The new method paints connected color
masses first, then derives **one optional contour from the completed silhouette**.
No contour is inserted between touching or overlapping body parts. Elbows and
knees share continuous tapered fills; internal changes use colored shadow ramps.
The neckline, hair overlap and shoe sole retain restrained material shading.

This is a construction aid and a set of practice studies, not a promise that all
poses or all human styles will look good automatically. Visual inspection remains
part of authoring.

## Quick start

```js
import {
  createFrame, Painter, drawHuman2D, humanMotion2D, renderHuman2D, humanRig2D,
} from 'poku-pixel-fx';

const frame = createFrame(160, 160);
const painter = new Painter(frame).place(80, 140);
const style = {
  height: 96,
  build: 'regular',
  skin: 'brown',
  hair: 'curls',
  hairColor: 'dark',
  outfit: 'shirt',
  cloth: ['#3d5f57', '#608477', '#90a78b'],
  trousers: ['#4a424b', '#655a61', '#82777a'],
  // outline: null, // remove even the outside contour
};
const pose = humanMotion2D('wave', seconds);
const sprite = drawHuman2D(painter, style, pose);
// sprite.pixels, sprite.mask, sprite.x/y and sprite.rig can be reused.
```

Use nearest-neighbor display scaling. Rendering at height 32 is not the same as
shrinking a 96px bitmap: facial details, cloth highlights and hands use explicit
size thresholds, so small sprites omit details that cannot read.

## Contract

- Nominal height: 32–192 pixels. Hair and the optional 1px contour can extend
  beyond that nominal anatomical height. Sizes are freshly rasterized, not
  stretched from a smaller sprite.
- Coordinates: x right, y down, nominal standing feet at y=0. Pose values use a
  canonical 96px construction space and are scaled once by height/96.
- `x`, `y`, `lean` move the body root. Explicit `leftHand`, `rightHand`,
  `leftFoot`, `rightFoot` targets are absolute in that canonical local space,
  not offsets from the root. Default hands follow root x/y; default feet follow
  root x but stay planted at y=-4 (the ankle-to-sole offset).
- The solver lowers the root when a reachable foot would otherwise stretch a
  leg. It does not move a foot to fake a reachable target. Truly unreachable
  endpoints are clamped and named in `rig.clamped`. Inspect this list for custom
  poses rather than assuming a requested target was reached.
- Upper arm, forearm, thigh and shin lengths remain fixed in continuous space.
  Only final raster clusters snap to pixel cells. Elbow/knee bend controls accept
  only -1 or 1. Coincident targets use a deterministic pole and minimum reach.
- `armsFront: true` puts the arms/hands over the torso for guard/cross-body poses.
  This is explicit 2D layer ordering, not automatic depth inference.
- `idle`, `walk`, `wave`, `guard`, `crouch` are seekable 2-second pose loops.
  The four non-walk presets keep ground ankles fixed. `walk` is a front-facing
  stylized in-place walk study, not a root-motion locomotion controller.
- Passing `true` as the third `humanMotion2D` argument returns a static rest pose
  for reduced motion. It does not retain the animated action pose.
- `gaze` shifts the pupil clusters, not the head silhouette. This version has four authored views (front, three-quarter, side, back), eight hair silhouettes, four skin ramps, three build widths, four face shapes,
  optional beards, and six simple casual/fantasy clothing silhouettes. It does not implement continuous turning, arbitrary outfits, detailed fingers or automatic character design.
- Palettes require exactly three valid #rgb/#rrggbb colors. Invalid style enums,
  nonfinite input, bend values, out-of-range height/coordinates and excessive
  allocations fail explicitly. Coordinates are limited to ±4096, lean to ±32;
  sprite allocations are capped at one million pixels.
- `drawHuman2D` honors the current Painter placement/mirroring. Cache
  `renderHuman2D` outputs for static poses or pre-baked animation atlases if needed.

## Practice and review

```sh
npm run build
npm run test:human
npm run preview:human -- records/human-review
```

The preview renders six distinct people, five poses, four native sizes, dark and
light backgrounds, transparent sprites, and an optional-contour comparison.
It writes a 2x nearest-neighbor GIF, native PNGs, four-phase contact sheet and
metadata. FFmpeg is required for the GIF; `--single` renders PNG review only.

Three iterations in this pass:

1. **Connected color masses:** removed internal ink borders; inspected native
   and 4x portraits. Found the raised arm bent the wrong way, the idle knees were
   too bowed, and lower-row labels overlapped the tall size study.
2. **Joint and composition correction:** changed the wave elbow pole, straightened
   the neutral legs, preserved planted feet, placed guard hands in front of the
   torso, moved crouch hand targets within reach and fixed the preview spacing.
3. **Validation and small-size refinement:** made eye contrast independent of
   blond/gray hair, softened skin highlights, ensured all motion targets work
   across all three builds, fixed coincident-target IK, added input validation,
   and checked encoded GIF frames at native and enlarged resolution.

Review checklist for future people:

1. Read the whole silhouette at 1x before adding details.
2. Join body masses before contouring; never outline every limb separately.
3. Use large hue/value groups for light, shadow and clothing folds.
4. Check shoulder–elbow–wrist and hip–knee–ankle placement at every key pose.
5. Keep feet planted in idle and check hand/torso overlap explicitly.
6. Give eyes clear space; omit mouth, nose and fingers when pixels cannot support
   them. Do not use eye whites as large bright blocks at small sizes.
7. Reinspect transparency, a light background, the smallest native size, motion
   contact sheets and the decoded final export. Tests are not an art-quality score.


## Directional construction extension

```js
import { drawHuman2D, humanViewMotion2D } from 'poku-pixel-fx';
const view = 'three-quarter'; // 'front', 'three-quarter', 'side', or 'back'
painter.place(80, 120, false); // true mirrors the right-facing art to the left
drawHuman2D(painter, { ...style, view, height: 72 },
  humanViewMotion2D(view, 'walk', seconds));
```

These are **four authored 2D constructions**, not a squeezed front bitmap or
a projected 3D model. Shoulder/hip spacing, torso contour, nose/jaw silhouette,
hair overlap, shoe direction and near/far limb ordering are specific to the view.
Side faces show one eye. Three-quarter faces omit the far eye at 32px instead of
merging both eyes into a dark bar. The near arm always owns a near/far overlap;
`armsFront` brings the far arm in front of the torso before the near arm is drawn.

Use `humanViewMotion2D(view, motion, time, reducedMotion)` for the matching pose
presets. The original `humanMotion2D` remains the front-view pose authoring API.
Custom endpoints are still absolute canonical 2D targets. A view change is a
discrete style selection and is **not** an interpolated turning animation.
The initial front-view output is protected by a pixel hash regression.

The directional walk alternates a grounded stance foot and an arcing recovery
foot. Whole-arm swing plus slight elbow flex avoids both hands looking parked on
the hips. It remains an in-place cycle: the supporting foot moves relative to the
sprite origin, so the host must add appropriate root motion for a walk through a
world. Neither walking variant is a physics-based locomotion solver.

```sh
npm run build
npm run test:human
npm run preview:human:views -- records/human-views
```

The comparison displays the same three people in front, three-quarter and side
views at native 32/48/72px. It includes five-pose sheets, a light-background
check, transparent key-pose atlas and a 2x nearest-neighbor GIF. The key-pose
atlas contains named static poses sampled at t=0.25s, not an animation sequence.

Directional review corrections: first fixed foreground near/far arm ownership;
then replaced akimbo-looking walk targets with whole-arm swing and added pupil
gaze. Final review checks native pixels, enlarged profiles, transparent exports,
light backgrounds, motion phases and decoded GIF frames. Small sprites carry
identity through silhouette/color and one or two eye pixels, not detailed faces.


## Back view and coherent facing

```js
const style = { view: 'back', facing: 'left', height: 48, hair: 'crop' };
const pose = humanViewMotion2D('back', 'walk', seconds);
painter.place(worldX, worldY);
const sprite = drawHuman2D(painter, style, pose);
// sprite.rig landmarks, sprite.mask and sprite.x/y agree with the chosen facing.
```

The rear view draws a full back-of-head hair mass, ears/nape, a back neckline and
compact heel silhouettes. It never draws eyes, a nose, mouth marks or a jacket's
front opening. Five rear hair silhouettes are authored, including a long bob and
bun. Back guard/crouch presets keep arms behind the torso because the hands face
away from the camera. Explicit `armsFront` remains available for custom poses.

`facing: 'right'` is the default; `'left'` reflects the completed authored asset.
For front/back views, this mirrors the authored pose, hair and lighting rather
than turning the head to profile. For side/three-quarter views, it also reverses
the visible travel/look direction. This is **pixel reflection, not relighting**.

### Reflection and coordinate contract

- Explicit pose endpoints and `pose.x/y` remain canonical right-facing local
  authoring inputs. Facing reflects that whole local construction, including x
  offsets. Put the character in the world with `Painter.place`, not `pose.x`.
- A pixel cell x reflects to `-x-1`; sprite origin becomes `-x-width`, preserving
  exact whole-cell mirroring around the local origin. Masks use the same rule.
- Continuous geometric landmark x reflects to `-x`. That is the corresponding
  geometric reflection, not a pixel-index rounding rule.
- Limb labels are preserved identities: `leftHand` remains the same authored
  limb after reflection even when it appears on the right side of the image.
  Bone lengths and clamped-target labels remain unchanged.
- `rig.pose` retains the canonical input. Returned `rig` landmarks are in the
  facing-adjusted local space; Painter world placement, rotation and its own flip
  are not baked into those returned landmarks. Apply Painter transforms for
  world-space queries.
- A left-facing sprite plus a Painter flip produces the original right-facing
  pixels exactly. Do not enable both unless that double reflection is intended.

```sh
npm run build
npm run test:human
npm run preview:human:orientations -- records/human-orientations
```

The orientation preview compares left/right reflections for all four views at
32/48/72px, using a walk loop. Rear hairstyle studies and a transparent 24-cell
static walk-pose atlas are also written. Atlas landmarks are continuous cell-local
coordinates, with a fixed [48,84] pivot. This remains a set of discrete 2D views,
not a continuous turnaround or a root-motion controller.


## Run and jump choreography

```js
import { humanAction2D, drawHuman2D, HUMAN_ACTION_TIMING } from 'poku-pixel-fx';
const style = { view: 'side', facing: 'left', height: 72 };
const sample = humanAction2D('jump', elapsedSeconds, style);
drawHuman2D(painter, style, sample.pose);
// sample.phase, sample.contacts.left/right, sample.airborne and sample.done
```

The original five `humanMotion2D`/`humanViewMotion2D` presets are unchanged.
`humanAction2D` adds two separate action contracts:

- **run:** a deterministic .8-second loop. Each foot has a 32% stance interval,
  leaving real no-contact flight intervals. View-specific strides, forward lean
  and opposite arm swing distinguish it from a sped-up walk.
- **jump:** a 1.2-second one-shot. Preparation ends at .18s, release is .24s,
  apex is .54s, ground contact returns at .84s, and recovery begins at 1.04s.
  After 1.2s it holds the initial athletic rest pose and `done` stays true.
  Negative jump time also returns that rest pose. It does not repeat by itself.

Jump uses an approximately 20px canonical root rise, view-aware knee tuck, an arm
swing spanning preparation and early flight, and a separate landing compression.
Grounded jump feet remain fixed and the pelvis stays between them. This is
**authored choreography, not a balance/physics simulation**. Run contact flags
identify supported feet in the local in-place cycle; world locomotion and root
translation remain the host's responsibility.

`style` is validated, but the returned pose and `rootY` use canonical 96px units.
`facing` remains a renderer operation, so action poses and contact limb identities
are the same canonical data for left and right. The fourth argument `true` opts
into reduced motion: a static supported rest, not animated jumping or running.

`humanLimbTarget2D(origin, upperAngle, bendAngle, firstLength, secondLength)` is a
small reusable forward-kinematics helper. Angles are radians from down toward +x.
It returns a wrist/ankle target plus the matching IK pole; bending through zero
passes through a straight limb instead of abruptly switching elbow sides. It
normalizes large finite angles before adding them and rejects malformed points,
nonfinite values and nonpositive/oversized lengths.

```sh
npm run build
npm run test:human
npm run preview:human:actions -- records/human-actions
```

The preview compares front/side/back at 32/48/72px. Its 2.4-second GIF contains
three run cycles and one jump followed by rest. All 16 run frames and all 25 jump
frames (including the final rest at 1.2s) are exported per view for frame-by-frame
inspection. A bright background and eight-phase overview sheets are also written.
The three-quarter API is supported and tested even though this comparison focuses
on the requested front/side/back views. No new interior ink outlines are added.


## Individual appearance studies

Appearance is optional and does not change the skeleton, targets, contact timing
or animation API. Existing styles keep their exact pixels. Combine large shape
choices before adding small marks:

```js
const person = {
  height: 72, view: 'three-quarter', skin: 'brown', build: 'broad',
  faceShape: 'square', // 'oval' (original), 'round', 'square', 'long'
  hair: 'shaved', // also new: 'ponytail', 'parted'; old five remain available
  facialHair: 'beard', // 'none' by default
  hairColor: 'dark',
  outfit: 'overalls', // also new: 'sweater'
  cloth: ['#967450', '#c49c67', '#e0bf8b'],
  trousers: ['#315564', '#4b7887', '#77a0a4'],
};
drawHuman2D(painter, person, humanViewMotion2D(person.view, 'idle', seconds));
```

- Round, square and long heads reshape face planes, ears, hair attachment points
  and eye anchors together. The rig head landmark itself does not move.
- Shaved heads have an explicit scalp in back view. The scalp shadow uses the
  skin ramp, so `hairColor` has no effect on a shaved head without a beard.
- Ponytails join behind the head and overlap the neck/shoulders as a single hair
  mass. They are rigid authored shapes, not simulated hair or secondary motion.
- Parted hair uses two connected highlight masses, not outlined strands.
- Beards are lower-face color masses using the hair ramp. Back views omit them.
- Sweaters have wider, full-length sleeves with connected elbows and a restrained
  colored collar/hem. Overalls use the trouser ramp for the bib and straps; back
  views omit the front pocket. Neither garment adds internal ink borders.
- With new hair, non-default face shapes or a beard, the final pass reserves the
  eye/lid cells after hair and beard snapping. This prevents a beard or fringe
  from erasing a pupil at 32px as the head moves by a fraction of a pixel.
  Default appearances do not enter that pass, preserving legacy raster output.

At 32px, a face may occupy only a few pixels. Shape differences can quantize to
very similar heads in individual poses. Identity should rely on the combination
of silhouette, hair, build and clothing, not a promise of detailed facial likeness.
These are stylized design controls, not age/ethnicity inference, portrait fitting,
freeform clothing authoring or an anatomy simulator.

```sh
npm run build
npm run test:human
npm run preview:human:characters -- records/human-characters
```

The preview contains six people in all four views at 72px, native 32/48/72px
front studies, same-palette head-shape comparisons, same-person garment studies,
a light-background check and a 2-second idle GIF. The transparent atlas is a
static appearance sheet sampled at idle time zero, not an animation atlas.

Review revisions: first established joined appearance masses; then corrected
32px fringe/beard eye collisions and continuous sweater elbows; finally checked
new gaze/blink cells at fractional idle/guard positions, all previous views and
actions, exact facing reflections and the decoded GIF. A 3,360-render legacy
hash guards existing hair/outfit/view/facing/size/motion combinations. Tests
verify invariants, not artistic quality.


## Combat-ready gestures and contact cues

```js
import { humanCombat2D, humanContactPixel2D, drawHuman2D } from 'poku-pixel-fx';
const style = { view: 'side', height: 72, facing: 'right' };
const sample = humanCombat2D('punch', seconds, style); // also 'block', 'hit'
const sprite = drawHuman2D(painter, style, sample.pose);
// Attach a current-frame detail to an occupied pixel, if one is nearby:
const pixel = humanContactPixel2D(sprite, sample.anchor);
if (pixel) painter.px(pixel[0], pixel[1], color);
```

`humanCombat2D` provides three seekable authored one-shots:

- `punch`: preparation, extension, a short strike hold and return; 0.9 seconds.
- `block`: raise forearms, brace, release; 1.1 seconds.
- `hit`: a received-hit reaction after the authored impact time, with recoil and
  recovery; 0.9 seconds. It does not mean striking another character.

Each starts and ends at the same view-specific combat-ready stance. Time clamps
before/after the action and `done` becomes true at the duration. Both ankle ground
contacts remain planted. Arm targets come from continuous angular choreography
and the existing fixed-length IK solver. `pose.fists: true` uses shorter, wider
closed-hand clusters without additional ink; omitted/false preserves existing
relaxed-hand pixels. Return to ready supports sequencing completed gestures, not
arbitrary animation blending or interruption from a half-finished move.

### Contact and coordinate contracts

- `pose` remains canonical 96px, right-facing authoring input, as with other
  human motions. Pass it unchanged to a renderer using the same style.
- `anchor` is a continuous geometric point in the rendered style's local pixel
  units, already scaled and facing-adjusted. `anchorName` identifies the hand-axis
  tip or chest. It is not guaranteed to round to an occupied pixel.
- `humanHandTip2D(rig, side)` matches the painted hand-axis endpoint, including
  the compact fist option. It is not a collision hull or the outermost finger pixel.
- `humanContactPixel2D(sprite, point)` returns a nearby occupied **integer pixel
  cell origin**, within two pixels of the continuous point, or null. It searches
  the rendered sprite, including its optional contour, and cannot discover a
  hidden hand through another body part. Geometric x mirrors to `-x`; pixel-cell
  x mirrors to `-x-1`. Both helpers leave Painter world transforms to the caller.
- `contact` is a frozen `ImpactContact2D` authored synchronization cue evaluated
  at `contact.at`. It stays fixed while the current `anchor` moves. It is neither
  a collision result nor an automatically dispatched event. `contactAge` uses
  the caller's time. `contactActive` is a 60ms sampling window beginning at the cue.
  Hosts should detect a crossing of `contact.at` if updates can skip that window.
- Punch contact normal points out of an assumed opposing surface, toward the
  attacker: -x in the right-facing construction. Block/hit normals point out of
  this character's facing surface: +x before facing reflection. These are authored
  2D conventions, not normals calculated from a target mesh or collision response.
  Strength/radius are default cue metadata, not damage or measured impact.
- Cue timing is exported in `HUMAN_COMBAT_TIMING`: punch 0.34s, block 0.36s, hit
  0.10s. A matched-size punch aims its hand-axis tip at the shared ready-chest
  height, permitting a paired hit on the same floor. Start the receiving hit at
  `punch.contact - hit.contact` (0.24s); align world x using their contact positions.
- Passing `true` for reduced motion holds ready and returns no contact or active
  cue. It does not merely suppress the visible motion while firing hit effects.

These are stylized 2D gestures, not physics, hit boxes, damage logic, weapon
handling or continuous 3D turning. Front/back show a readable lateral strike;
side/three-quarter use the near hand. Back guard/recoil correctly hide parts of
forearms behind the torso rather than outlining them through it.

```sh
npm run build
npm run test:human
npm run preview:human:combat -- records/human-combat
```

The main GIF compares punch/block/hit in front/side/back at native 32/48/72px.
A second GIF demonstrates a same-floor side-view punch/hit exchange. Both use
50fps so the 0.34s contact time exists as an actual output frame, and pause at
ready before repeating. Gold cue dots are annotations, not baked character pixels.
The tool also writes 20-phase sheets, contact/recoil PNGs and a light-background
check. Tests cover all four views, old pixel hashes, limb reach, ground support,
phase continuity, geometric/pixel reflection, contact placement and closed hands.


## Held swords, bows and separate projectile layers

```js
import { drawHumanWeapon2D, renderHumanWeapon2D, humanWeapon2D } from 'poku-pixel-fx';
painter.place(worldX, groundY);
const result = drawHumanWeapon2D(painter, 'bow', seconds, {
  view: 'side', height: 72, hair: 'ponytail', faceShape: 'round',
});
// result.actor: human + held material; result.projectile: separate arrow or null.
// result.sample: pose, phase, geometry, authored cue and flight endpoints.
```

- `sword` is a 1.2s authored slash: ready, windup, swing, follow-through, recovery.
  It ends at the same weapon-ready pose. The slash cue is at 0.44s.
- `bow` is a 1.4s draw/release: loaded ready, draw, hold, release at 0.70s, then
  lower to an **unloaded** pose. It does not conjure a replacement arrow at the
  end. A replay starts a new prepared shot; the demonstration is not a seamless
  reload animation. Separate flight ends with the one-shot's preview lifetime.
- `humanGrip2D(rig, hand)` is the continuous palm center, 1.2 canonical units
  along the forearm from the wrist, scaled and facing-adjusted by the rig. It is
  distinct from the wrist and the hand-axis tip. All weapon geometry uses it.
- Geometry and cue positions are already scaled/facing-adjusted local pixel
  units. Apply world placement once. The bow's `tip` is its arrow/aim endpoint,
  while `upperTip`/`lowerTip` name the wooden bow tips. `nock` follows the drawing
  palm before release, then returns toward the unpulled string.
- Cues are frozen authored slash/release timing, not hit detection, projectile
  collisions or damage. `direction` is the blade/arrow axis, not a collision
  surface normal. The 60ms `cueActive` window is not an event dispatcher.
- Before release, exactly one attached arrow is painted with the held weapon.
  At release it becomes a separate `projectile` pixel layer; there is no duplicate
  attached arrow. The short straight flight is a drawing study, not ballistics.
  A game should use the release cue to hand off to its own projectile system.
- Reduced motion keeps a static loaded/ready study and emits neither cue nor
  moving projectile. Time is clamped; very late seeks cannot grow sprite bounds.

### Occlusion and the connected silhouette

The module starts from the existing human with its outline disabled. It paints
weapon materials in front for front/side/three-quarter views and behind the body
for the back view. Small palm regions restore the visible hand over the hilt and
string. Only then is one contour derived from the actor/held-material union.
The bowstring and arrow shaft are single colored lines, not outlined triangles.
The released arrow uses its own mask/bounds and never inflates the held actor's
collision or animation canvas. `drawHumanWeapon2D` draws both returned layers;
callers baking a fixed actor atlas can use `renderHumanWeapon2D(...).actor` alone.

Small rotated hilt/crossguard shapes use material centerlines and overlap at the
blade heel. This is deliberate pixel connectivity, not an internal dark seam.
Tests include dense unoutlined sword sampling, palm ownership, exact mirrored
layers, nock/release continuity and independent projectile padding.

### Native canvas resolutions and one scene pixel grid

Canvas dimensions are not a per-character display scale. All source pixels in
a shared scene should map to the same scene pixel grid. A small human asset can
have a 64×64 canvas and a large creature a 128×128 canvas while both use exactly
one scene pixel per source pixel. Canvas padding does not make an actor bigger.
Set intended native character dimensions consistently, compose all actors at
1:1 in the same `Painter` frame, then enlarge the complete scene uniformly for
display if desired. Do not independently resize actors to fit equal display boxes.

The weapon preview writes two different kinds of native examples:

1. `native-64/` and `native-128/` are **separate target-resolution studies**,
   freshly rasterized at 36px/72px actor height with room for the held weapons.
   They use size-appropriate details, not resized bitmaps. They are not presented
   as matching-density copies of the same actor in one shared world.
2. `shared-grid-64.png` and `shared-grid-128.png` contain the **same 36px actor**
   at the same native pixel size. Only canvas padding changes. A regression
   compares their translated pixels exactly. This is the shared-scene rule.

```sh
npm run build
npm run test:human
npm run preview:human:weapons -- records/human-weapons
```

The GIF compares native 32/48/72px sword/bow studies in front/side/back views,
with one uniform 2x display enlargement of the completed sheet. These separate
study panels intentionally compare target sizes; they are not a shared world.
It also writes 64×64/128×128 transparent assets, light-background checks and
24-phase sheets. Each phase-sheet cell clips its independent arrow viewport
to prevent arrows spilling across neighboring study cells.

Limits: discrete planar 2D views, rigid sword and simplified bow flex, no finger
release animation, reload, weapon selection graph, weapon physics or arbitrary
blending into unrelated idle/run/combat motions. Rear-view occlusion deliberately
hides hands/strings behind the body. Tests cannot guarantee every custom palette
or future pose is artistically readable.
