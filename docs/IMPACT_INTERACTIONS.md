# Contact-driven impact interactions

An impact is a contact between a particular moving shape and a particular surface, not a generic
explosion preset. Author contact facts once, then use those facts for projectile termination,
material response, hit-stop, camera feedback and export timing. Non-impact effects need no contacts.
The 2D interfaces below use local pixels and screen-down y. The independent 3D engine keeps its own
world-space and camera conventions; do not pass these 2D descriptors into 3D simulations.

## One source for contact timing and placement

```ts
import { defineImpactContact2D, impactContactAge2D, createGroundImpact, impactKick2D } from 'poku-pixel-fx';

const hit = defineImpactContact2D({
  id: 'shell-ground', at: 0.8, position: [42, 0], normal: [0, -1],
  material: 'stone', strength: 1.1, radius: 22,
});
export const contacts = (options) => [hit];
export const cameraShake = (time, options) => impactKick2D(impactContactAge2D(hit, time), hit.strength, options.seed);

export function create(options) {
  const response = createGroundImpact({ seed: options.seed, radius: hit.radius, strength: hit.strength, material: 'stone' });
  const style = { x: hit.position[0], y: hit.position[1], palette: mineralRamp };
  return {
    drawBack(p, time) { response.draw(p, impactContactAge2D(hit, time), 'back', style); },
    draw(p, time) {
      // End the shell's flight at hit.at. Draw its hot gas separately from mineral ground.
      response.draw(p, impactContactAge2D(hit, time), 'front', style);
    },
  };
}
```

`defineImpactContact2D` copies and freezes the point/normal, normalizes the surface normal and rejects
invalid facts. `contacts(options)` is an optional effect-module hook, so length-, radius- and
option-dependent contacts can be resolved at effect creation instead of guessed from fixed metadata.
`createFx(...).contacts` exposes the resolved, immutable local descriptors. Contacts do not apply
physics, play sounds or mutate another actor automatically. Their material is descriptive; each effect
chooses a compatible response. A water hit may splash; a blade can slice; a beam may sustain a cut.

`transformImpactContact2D(contact, {x, y, flip, angle})` transforms both point and normal to world
pixels. Translation affects only the point. For nested effects apply each local placement in order.
The ground helper is authored for a horizontal local floor. Orient the painter deliberately for other
surfaces; a generic collision normal does not turn soil into a wall, steel or water.

`impactContactAge2D` uses the same clock for all components and snaps sub-nanosecond roundoff to exact
contact. An `ActHit` is a different record: map `t: contact.at`, `y: contact.position[1]`, and
`at: targetIndex` explicitly. The act's `at` property is a target index, not time.

## Mineral-ground response

`createGroundImpact({ seed, radius=24, strength=1, direction=0, material='stone', duration=2.1 })`
provides:

- `displacement(x, age)`: a delayed outward-traveling uplift, damped rebound and shallow settling.
  A host can use it to displace its own terrain. The built-in drawing is a transient authored surface
  overlay; it does not rewrite the game's ground or the gallery's backdrop.
- `draw(painter, age, 'back'|'front', {x=0, y=0, palette})`: chipped surface plates behind the event,
  then opaque heavy fragments and low dust in front. The mineral palette needs six packed colors.
  This helper emits no light and does not mutate the painter's transform, fade or light controls.
- `chunks`: baked polygon-aware rubble paths with real collision times/points/speeds. Secondary dust
  originates at those collisions, not at unrelated random positions. Pieces bounce and rest instead
  of disappearing at their first floor crossing. `stone` rebounds more; `soil` loses more momentum
  and produces denser low dust. Both are mineral responses, not universal material substitutes.

Sampling is seekable and seeded. Frame rate, repeated drawing and layer order do not emit particles
or advance collisions. Radius is 8..64 pixels; strength is 0..2; direction is -1..1; duration is 1..6 s.
The helper is bounded, but its caller must allocate a canvas for the chosen parameters. It approximates
small debris collisions with a plane, not rubble/rubble or rubble/actor rigid-body physics.

## Whole-scene camera feedback

An optional pure module hook `cameraShake(time, options)` returns a native-pixel scene offset.
`createFx(...).shake` applies `cameraMotion` (default 1), stop-fade and integer quantization. Set
`cameraMotion: 0` to disable camera movement without changing effects, timing, debris or exports.
Hooks are opt-in: legacy effects without a hook retain their original drawing. `createAct` uses an
authored module hook in preference to legacy hit shake, never adds both, and applies `cameraMotion`
to legacy shake too. Ordinary effects without either return `[0,0]`.

```ts
const fx = createFx(shell, { x: 160, y: 120, cameraMotion: 1 });
fx.update(dt);
// Draw background, characters and effect into an offscreen full scene first.
const [sx, sy] = sceneCameraOffset(fx.shake, reducedMotion, transparentExport);
// Present that entire scene at sx,sy using nearest-neighbor pixels and suitable padding.
```

Never shake only the projectile sprite, accumulate camera offsets frame to frame, or write jitter
into a transparent sprite sheet. The gallery applies the guard to both ordinary effects and acted
attacks, and responds to the OS reduced-motion preference. CLI previews shake the composited opaque
scene; transparent RGBA, raw color/light, sprite pivots and sheet pixels remain unshifted. A CLI
caller can use `--opts '{"cameraMotion":0}'`. Sprite JSON includes resolved contacts in
`meta.pokuFx.contacts` for a host to reconstruct appropriate feedback. Exported contact points and
normals include the selected flip/rotation and are relative to the actual exported pivot; runtime
`fx.contacts` remain in authored local coordinates.

This hook does not add automatic hit-stop, sound, damage or interactions to every effect. The host
owns those decisions. Nested `chain` children also do not automatically aggregate camera hooks or
contacts: a composed move should author its own contacts and camera response so feedback is not
counted twice.

## Missile Salvo example and visual passes

`projectiles/missile-salvo` keeps its three distance-timed flights and exact contacts at 1.08, 1.25
and 1.54 seconds. Its new `ground` ramp is independent of `palette`, `metal` and `smoke`.
`groundMaterial` is `stone` or `soil`; `impactStrength` is clamped to 0..1.3 to protect its native
352×232 frame. `cameraMotion` controls camera response independently. The endpoint is aligned from
the visible nose support with `flightEndpointAtContact`, so the nose no longer enters the floor
before the authored hit. The three lead control points and hit clocks are unchanged. No existing rocket trajectory
or Rocket Launcher choreography changes.

1. The baseline had static scorch ellipses, two symmetric dust puffs and fragments removed on first
   floor contact. Pass 1 added surface breakup, real mineral collisions and settled rubble.
2. Pass 2 made the hot gas narrower and more lateral so it no longer lingered as a round fire egg;
   the camera hook also began moving the whole opaque scene at each contact.
3. Pass 3 increased the early ground uplift instead of brightening the explosion, preserved separate
   mineral colors, and checked individual contact frames, mirrored/recolored variants and transparency.

Build and verify with `npm run build`, `npm run test:quality`, `npm run test:3d`, `npm run test:export`
and `npm run check -- projectiles/missile-salvo projectiles/rocket`.
`tests/ground-impact-quality.test.mjs` covers contact facts/transforms, travel delay, real collisions,
materials, deterministic layers, parent state, zero emissive stone light, reduced motion, legacy hooks,
option-resolved contacts, and fixed-pivot transparent export. Passing tests is not a visual-quality
certificate; inspect the GIF and native-size frame crops too. `node tools/preview-ground-impact.mjs`
runs a fire-free stone/soil comparison through the same reusable contact and ground APIs.

A final geometry review also checked the actual rotated missile silhouette: the previous center at
y=-4 allowed its nose below the floor before the nominal hit. `flightEndpointAtContact` now solves
the endpoint and tangent from the visible supporting corner. Padded sprite exports also include the
margin in the pivot, with contact coordinates remaining pivot-relative.

## Thin glass response

`impacts/glass-shatter` uses the same immutable contact descriptor but a different material response:
contact-centered spiderweb cracks, fitted transparent slivers, edge-on tumbling, real shard/floor pings
and flat settling. It never routes glass through mineral ground dust, rubble, shock rings or emitted
light. Reusable `fractureGlass`, `glassShardPath` and `glassVertices` helpers expose the fitted topology,
seekable thin-sheet motion and exact support-point contacts. See [GLASS_FRACTURE.md](GLASS_FRACTURE.md)
for limits, examples, visual passes and tests.
