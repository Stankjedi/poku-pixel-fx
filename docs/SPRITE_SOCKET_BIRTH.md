# Opt-in pose sockets at particle birth

Import `captureSpriteSocketBirth2D` from `core/index.js` (or the focused
`core/sprite-socket-birth.js` module). This is a bridge from existing
`SpriteClip2D.socketAt` metadata to an immutable world-space birth record. It is
not a renderer, scheduler, anatomy detector, or a new socket schema. Existing
effects do not opt in automatically; their defaults and artwork are unchanged.

Author `SpriteClipSocket2D` maps for every relevant pose, keeping each name tied
to the same anatomical part or material source even when its screen side changes.
For example, anatomical right hand stays right hand when the actor turns. If
using initial viewer-side IDs, document that convention rather than swapping
names dynamically. Hidden limbs should be `visible:false`. Choosing a flame
instead of a foot is an explicit authoring decision, never a geometric repair.
These coordinates are authored facts, not inferred from arbitrary image pixels.

## Contract

- Pass `birthTime` (effect clock), `clipTime` (selected clip playback clock), and
  `world` sampled at that exact birth. Both clocks are seconds; frame durations
  remain milliseconds in clip data. Convert millisecond event clocks explicitly.
  Negative finite birth clocks are allowed for preroll. Negative clip clocks are
  unavailable; non-finite clocks are invalid and throw. No clock is shifted here.
- `socketAt` already subtracts the source canvas pivot. Do not subtract it again.
  `world` is the existing `PixelTransform2D` column-major `[a,b,c,d,tx,ty]` mapping
  pivot-relative clip coordinates into world coordinates. Translation locates
  the clip pivot, not its original top-left. Pass the same transform used to place
  the visual source, excluding camera motion unless world space includes it.
- Full authored `basisX`/`basisY` take precedence over `angle`. Without a basis,
  angle (radians, default zero) creates `[cos,sin]`, `[-sin,cos]`. Positive angles
  turn clockwise on a screen whose Y grows downward. No normalization or rounding
  occurs. The two world basis columns preserve skew, scale and handedness.
- `offset` is in socket-basis pixels, `velocity` in socket-basis pixels/second;
  omitted values are zero. Both are transformed through the socket and world
  bases. Translation affects position only. Nonuniform scale also scales velocity
  and can change speed and direction. A unit-speed policy, inherited actor
  velocity or world gravity belongs to the caller, not this helper.
- `unavailable` must be explicitly `'throw'` or `'skip'`. Missing or hidden
  (`visible:false`) sockets never emit at the origin. Omitted visibility is visible.
  An optional `fallbackSocket` tries exactly one named socket at the same time.
  It is not a recursive chain and never selects by distance. The result records
  `requestedSocket`, `resolvedSocket`, and `fallbackReason` (`missing`, `hidden`,
  or null). Outside a nonlooping clip, fallback cannot resurrect a cel. Looping
  follows the clip's explicit options. Failed resolution throws or returns null;
  choosing skip explicitly can suppress a caller's birth. Use throw when a strict
  count is required. Custom providers must return frame -1 or a nonnegative safe
  integer; invalid frame metadata throws before socket lookup. Invalid numbers,
  singular/near-singular bases or transforms (absolute determinant < 1e-12), and
  overflow always throw, even with skip. The actual `createSpriteClip2D` validates
  all stored socket metadata at construction; the adapter validates the resolved
  visible socket again. A custom structural provider's hidden metadata is treated
  as unavailable, not inspected as an emission basis. No silent numerical repair
  is performed.
- `mirrorPolicy` remains existing metadata. This adapter supports geometric
  reflection for `'reflect'` and omitted policy. If the world determinant is
  negative, `'authored'` and `'swap-hand'` are unsupported and throw: there is no
  implicit anatomy swap or selection of another cel. Preauthor the mirrored pose
  and use a nonreflected world transform, or explicitly author a reflect policy
  where geometric reflection is intended. A reflected authored socket basis is
  valid by itself and is preserved. This restriction does not alter clip playback.
- Copy a birth's position/velocity into your particles once. All result fields
  and basis arrays are frozen and retain no live references to clip, root or input
  vectors. Future source movement does not drag old particles. The helper does not
  emit particles, consume randomness, set counts, alter brightness/lifetime,
  invent acceleration, or replace an effect's scheduling system.

## Usage

`examples/sprite-socket-birth.mjs` is an executable metadata-only example with a
two-pose turning weapon and authored events. It shows the opt-in binding and
independent later trajectory, not visual fire quality. Normal compiled runtime
and tests use the repository's existing Node >=20 requirement. Run the example
with `node examples/sprite-socket-birth.mjs` and the focused tests with
`node --test tests/sprite-socket-birth.test.mjs` after the project's ordinary build.
No package manifest change is needed.

For a bounded no-build check only, tests/example accept module URL overrides:
`POKU_SPRITE_CLIP_MODULE` for an existing compiled clip and
`POKU_SOCKET_BIRTH_MODULE` for the candidate module. Direct TypeScript execution
requires a supporting Node (Node 24 was used in the isolated study); that is a
verification convenience, not a new runtime requirement. The fixtures validate
source geometry, timing and independence, not art quality or normal-speed playback.

## Create a real effect

See [Socket spark authoring](SOCKET_SPARK_AUTHORING.md) for an opt-in executable recipe that creates a fresh effect module from authored clip sockets, scheduled events and a moving source. It uses this helper directly, preserves explicit clocks/counts and never changes existing generation defaults.
