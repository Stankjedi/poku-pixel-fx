# Character assets, native animation and equipment

`CharacterAsset2D` is a portable authoring document. It stores a procedural human,
stock creature, data-driven creature rig, or authored sprite clip, together with
named animations, equipment, semantic selections and saved native-pixel edits.
`createCharacterPlayer2D` compiles that document into seekable samples. It has no
hidden playback or spring state: sample the same time and choices to obtain the
same raster, sockets and masks.

The new APIs are exported from `poku-pixel-fx` and the individual `core/*` modules.
Executable examples live in `src/examples/character-studio.ts`; the checked-in
assets and native sheets are in `examples/character-studio/`.

## Start, render, save and reload

```ts
import {
  createStudioCharacter2D, createCharacterPlayer2D,
  serializeCharacterAsset2D, parseCharacterAsset2D,
} from 'poku-pixel-fx';

const asset = createStudioCharacter2D({
  id: 'my-wayfarer', name: 'My Wayfarer', height: 96,
  view: 'three-quarter', facing: 'right',
  style: { hair: 'bob', outfit: 'jacket', build: 'regular', skin: 'brown' },
});
const player = createCharacterPlayer2D(asset);
const info = player.clipInfo('sword'); // duration, loop, authored events
const b = player.boundsForClip('sword', 30);
// Export the same 30 fps grid used to measure b. Native origin = [-b.x0, -b.y0].
painter.place(-b.x0, -b.y0);
player.draw(painter, 0.44, 'sword');

const savedJSON = serializeCharacterAsset2D(asset);
const restored = createCharacterPlayer2D(parseCharacterAsset2D(savedJSON));
```

`height` constructs native pixels; it is not a bitmap enlargement. Human assets
support the existing 32–192 px construction range. The asset envelope permits
16–384 for authored raster/data-rig characters. A creature's `nativeHeight` is its
construction scale, so a long, low serpent is shorter on screen than a standing
human with the same number. Use the returned bounds for the actual extent.

`asset.clips` is a named record. `player.clips` is its name list. `sample(t, name)`
returns the body actor, native bounds, pivot, anchors, oriented sockets, visible
semantic masks, root displacement, contacts, source/cel frame index, event
*definitions*, separate projectile rasters, and `drawBack` / `drawFront` callbacks.

The raster actor excludes detached projectiles. This keeps status effects from
wrapping a released arrow. `sample.bounds` includes everything that will draw,
including those projectiles. `player.bounds` is a deliberately conservative
all-clip envelope. `boundsForClip(name, fps)` caches the union of the actual export
frame grid with two native cells of padding. An arbitrary time between those
frames is not guaranteed to fit a sampled envelope; off-grid previews can inspect
`sample(time).bounds` or use the conservative envelope.

The player snapshots its input. Treat returned asset/sample metadata as read-only;
edit a document and compile a new player to adopt a change. Body pixels, masks and
clip getters are independent outputs. Asset JSON is limited to 64 MiB, all decoded
raster clips/layers to 16,777,216 cells, and one composed character to 4,194,304
cells. Invalid clip, equipment and edit references fail when loading.

## Existing motions and authored strong keys

The actor adapter now accepts `idle`, `walk`, `wave`, `guard`, `crouch`, `run`,
`jump`, `punch`, `block`, `hit`, `sword` and `bow`. The existing `motion:'act'`
contract still follows the ACT pose. Native height, seeded effects and the
simulation timestep are independent of this choice.

```ts
const actor = createActorAdapter2D({
  kind: 'human', height: 96, motion: 'run',
  style: { view: 'side', facing: 'right' }, rootMotion: true,
});
const sample = actor.sample(0.2);

const authoredActor = createActorAdapter2D({
  kind: 'asset', asset, clip: 'key-strike', rootMotion: false,
});
```

Human clips dispatch to the existing analytic action/combat/weapon samplers.
`key-pose` clips instead store explicit hand/foot targets, pose controls, held keys
and `hold`, `linear` or `smooth` transitions. Boolean eyelids and IK branch choices
change at key boundaries; they are not interpolated. Optional `fps` deliberately
holds the authored raster cadence without changing the simulation clock.

The reference asset includes a 12 fps `key-strike` with anticipation, contact,
recovery and an explicit contact event. Key-pose `contacts` are authored keys
`{at, left, right}`; absence means unknown/unplanted, not inferred ground contact.
Facial `faceTrack` keys select `blink` and `gaze` without interpolating topology.
Other face expressions can use frame-specific cluster edits or the portrait API.

## Equipment and sockets

Slots declare a name, socket and drawing order. Negative layers draw behind the
body/effect split; nonnegative layers draw in front. Each equipment item declares
which slots accept it and one or more native layers. Layer IDs are stable edit
targets. `occludedBy:['hands']` preserves the visible holding hand over an item.

```ts
const equipped = equipCharacter2D(asset, 'mainHand', 'wayfarer-sword');
// A clip-specific loadout takes precedence over the document's default loadout.
const swordEverywhere = createCharacterAsset2D({
  ...equipped,
  clips: {
    ...equipped.clips,
    idle: { ...equipped.clips.idle, loadout: { mainHand: 'wayfarer-sword' } },
  },
});
```

The supplied sword and bow use native articulated equipment generators. They
reuse the existing weapon geometry, palms, bow draw, string relaxation and arrow
release. Their saved `clip` is an inventory thumbnail; `generator:'human-sword'`
or `'human-bow'` uses the human grip and does not permit a second arbitrary local
transform. A custom raster item omits `generator` and follows its oriented socket,
local offset and angle. This path supports authored weapons, shields, accessories
and equipment cels without a human-specific renderer.

A socket contains `position`, `basisX`, `basisY`, `visible`, `layer` and
`mirrorPolicy`. Transform composition happens in continuous native coordinates;
the destination cell is sampled once at rasterization. Human and authored item
sockets include `root`, `head`, `chest`, `mouth`, `hand.grip`, hand/foot variants,
`weapon.base`, `weapon.tip`, `weapon.edge`, `bow.upperTip`, `bow.lowerTip`,
`bow.nock`, and `muzzle` as applicable. Available socket names depend on the source
and equipped item. Imported frame sockets can add or override canonical names.

```ts
const s = player.sample(0.44, 'sword').sockets['weapon.tip'];
const angle = Math.atan2(s.basisX[1], s.basisX[0]);
// Preserve both basis vectors when exporting: angle alone loses reflection.
```

A native raster layer can carry frame sockets in its SpriteClip data. These are
transformed with the layer, so a different sword's authored tip does not retain
the previous sword's length. Layers that depend on another layer's socket must
appear after the defining layer. Unknown attachment sockets fail explicitly.
When a defining layer is hidden, or its current cel omits a named socket, its
published socket becomes invisible so dependent layers hide without a dangling
attachment error.

### Persisted socket keys

Each clip can contain `socketTracks`, keyed by socket name. They edit attachment
coordinates without replacing the source anatomy. Corrections run before equipment
and socket-space cel patches. An item's frame sockets are then transformed and
their own named tracks are applied once, so a charm can follow an edited sword tip.

```ts
const adjusted = setCharacterSocketKey2D(asset, 'sword', 'hand.grip', {
  at: 0.2, position: [2, -1], angle: 0.08,
  visible: true, interpolation: 'hold',
}, 'delta');
const adjustedPlayer = createCharacterPlayer2D(adjusted);
const original = adjustedPlayer.sample(0.3, 'sword', {ignoreSocketTracks:true});
const corrected = adjustedPlayer.sample(0.3, 'sword');
const value = sampleCharacterSocketTrack2D(
  adjusted.clips.sword.socketTracks!['hand.grip'], 0.3,
);
```

`delta.position` is in the unedited socket's moving basis. `override.position`
is absolute in actor-local native coordinates. A delta angle rotates in the
socket basis, including reflection; an override angle sets the actor-local heading
while retaining baseline scale, shear and handedness. A track may instead author
paired `basisX` / `basisY`, but must consistently use either angle keys or basis
keys. Basis interpolation preserves nonzero axis lengths; a handedness change
occurs at a key rather than passing through a singular matrix. Angles take the
shortest arc. Visibility is held, and omitted channels retain their last authored
value. Before the first key the source socket is unchanged and the sample helper
returns `null`. A position override can define a new custom socket; an unmatched
delta remains dormant until that socket exists.

`setCharacterSocketKey2D` replaces a key at the same time, sorts the track and
returns a validated new asset. Socket keys use clip phase time after any `clip.fps`
hold. Editor controls should use that same effective phase, including loop
normalization, rather than an off-grid wall-clock time. Up to 128 tracks and 16,384
total keys are accepted per clip, with at most 4,096 keys per track.

For the native sword/bow generators, a `hand.grip` correction transforms held
equipment pixels and their tip/edge/muzzle sockets together. A released arrow
retains the correction at its release cue; later hand edits do not drag it through
the air. Editing a tip socket alone changes that attachment/emission point. It
does not bend a sword, reposition the body hand, or solve new limb IK. Named tracks
are independent corrections, not a replacement skeleton or arbitrary hierarchy.

## Root motion, contact events and secondary motion

Root displacement is data, and drawing remains in place unless requested:

```ts
const baked = bakeCharacterFootPlant2D(asset, 'run', { fps: 120 });
console.log(baked.maxResidual); // two simultaneous contacts can be incompatible
const planted = createCharacterPlayer2D(baked.asset);
planted.draw(painter, 0.25, 'run', { applyRootMotion: true });
```

The bake holds each contact's world anchor and solves root corrections. With two
incompatible constraints it reports the residual instead of silently claiming
perfect foot locking. It writes a portable root track including the endpoint.
Looping tracks accumulate their end-to-start displacement. Bake/sample cadence is
explicit; sub-frame interpolation is still a sampled approximation.

Gameplay events are separate from pure render samples:

```ts
const events = player.createEventCursor('sword');
for (const event of events.advance(time)) spawnEffectAt(event.socket);
events.seek(scrubbedTime); // seeking/reversing does not emit skipped events
```

`connectCharacterEvents2D` preserves an existing ACT `onHit`, bridges it to the
same event shape, optionally drains a 3D cue source, and restores the handler on
`dispose()`. Authored contact/slash events indicate timing; they do not claim a
physical collision or apply damage.

`bakeSecondaryMotion2D` integrates bounded angle springs at a fixed 240 Hz and
writes serializable sample keys. Layers sample the bake directly, so seek order
cannot change hair/cape output. The reference cape and hair lock use this path;
their loop endpoint correction is authored explicitly. This is a constrained
attachment-angle model, not cloth simulation or collision-aware hair strands.

## Persisted cel edits and semantic selections

A CharacterAsset cel patch uses **actor-local native coordinates**, even though
the lower-level `editSpriteCluster2D` patch uses buffer coordinates. Changing
raster padding therefore does not move the saved mark. `space:'socket'` makes
coordinates local to the named oriented socket. Edits apply after regeneration
and before equipment composition; their target is `body` or an exact layer ID.

```ts
const frame = player.sample(0.5, 'key-strike');
const painted = editCharacterCel2D(asset, {
  id: 'badge-highlight', clip: 'key-strike', frame: frame.frameIndex,
  target: 'body', space: 'socket', socket: 'chest', semantic: 'badge',
  patch: { x: -2, y: 2, rows: ['xx'], palette: { x: 0xffd7e5bb } },
});
const selected = paintCharacterSemanticMask2D(painted, {
  id: 'badge-region', name: 'protectedDetail', target: 'body',
  clip: 'key-strike', frame: frame.frameIndex,
  space: 'socket', socket: 'chest', x: -2, y: 2, rows: ['++'],
});
```

Omit `frame` to apply throughout a clip, or omit both clip/frame to apply globally.
For analytic animation `frameIndex` uses `clip.fps` or 60 Hz; for SpriteClip it is
the original source frame index. It is not necessarily the export sheet index.
A repeated edit ID replaces that edit. Unmapped patch symbols preserve pixels;
`null` erases. Erasure clears silhouette, emission and every occupied semantic
membership in that layer. `+` selects a cell and `-` removes membership. Ordinary material selections stay
on occupied cells. `negativeSpace` and edits with `allowEmpty:true` also preserve
transparent selections through transforms and composition, so intentional holes
can actually be annotated.
Edits are clipped to the target's native canvas; add source padding to author
outside that canvas.

Human material ownership is produced by a second ID-color construction pass, so
identical display colors do not merge skin and clothing. The visible masks include
skin, hair, cloth, trousers, shoes, outline, features, head, hands and body.
Head/hand selections also use native rig regions; they are editable selections,
not pixel-by-pixel anatomical annotation. Named equipment/material masks replace
covered memberships according to layer order. Imported clips supply the body
silhouette until the artist adds semantic regions.

## Shared identity and data-driven creatures

```ts
const portrait = renderCharacterPortrait2D(asset.identity!, {
  resolution: 128, pose: { expression: 'determined' },
});
```

Identity shares source skin/hair/clothing palettes and selected face, hair and
outfit traits. A portrait and a 96 px body each use native authored geometry;
neither is a resized version of the other. Their hairstyle/shape vocabularies
differ, so `identity.portrait` remains editable. `createCharacterAsset2D` keeps
`identity.body` in sync with a changed human source.

`CreatureRigAsset2D` defines parent-first bones, local offsets, lengths, angular
limits, periodic motion, colored ellipse/segment/polygon parts, semantic roles and
sockets. Adding an anatomy is a data change rather than another species switch.
The original Moss Serpent demonstrates this path. The rig is a constrained 2D FK
system; quadruped IK/contact-aware locomotion remains in the existing cat/fox/owl/
dragon builders. A custom FK rig does not invent foot-contact metadata.

## SpriteClip interchange and emission

`createSpriteClip2D` retains source RLE pixels, unequal durations, tags and original
frame indexing. New `frameSockets(index)`, `socketAt(name,time)` and
`frameEmission(index)` getters return copies. Frame socket coordinates are in the
original source canvas; `socketAt` subtracts the pivot. Optional basis vectors and
mirror policy are retained with angle/visibility.

`emission` is a row-major array of `width * height * 3` **coverage-weighted linear
RGB radiance**. It is independent of the color alpha, so an emission-only cell can
remain transparent. Drawing applies painter fade/light gain once and adds the
values with `addLinearLight2D`. `emissionKind:'optical'` preserves the existing
screen-glow contract; `'surface'` lets later foreground color occlude the emission.
Color-only rect mocks remain compatible; emissive clips require a real Painter.

## Reproduce and review

```sh
npm run build
node tools/preview-character-studio.mjs examples/character-studio
node --test tests/report-character-pixel.test.mjs
```

The preview command saves four CharacterAsset JSON files, native character and
gear sheets, shared-identity portraits, twelve native pixel-technique studies,
and an idle atlas with a full-speed `playback.html`. Rendering leaves viewing
flags false. Actual observations are recorded separately in
`examples/character-studio/VISUAL_REVIEW.md`.

| Report item | Executable implementation |
| --- | --- |
| C01 | Human animation dispatch and `ActorSelection2D` integration |
| C02 | Serializable source style; immutable asset edit/reload APIs |
| C03 | CharacterAsset source/clip document and player |
| C04 | Slots, loadouts, ordered native layers, articulated and raster gear |
| C05 | Oriented/reflected sockets, imported/item frame sockets |
| C06 | Four original reference assets, native views and held key-strike |
| C07 | Explicit displacement, contact solver and saved foot-plant root bake |
| C08 | Event cursor, ACT hit/cue adapter and seek semantics |
| C09 | SpriteClip actor source and native raster/HDR/socket drawing |
| C10 | Persisted, frame/clip/socket-scoped cel patches |
| C11 | Material ownership pass, editable selections and mask-consistent erase |
| C12 | Shared identity palettes/traits and native portrait output |
| C13 | Data-driven FK creature anatomy and serpent example |
| C14 | Bounded secondary-motion bake and authored facial keys |
