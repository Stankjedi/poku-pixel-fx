# Liquid motion and clear water pixels

Water must retain its own material identity: gravity bends the trajectory, pressure feeds a coherent
stream, surface tension narrows necks into round drops, and surface contact produces waves. Broad
emissive bloom, random star particles and widening flame-like bodies are not default water shading.

## Reusable flight helpers

`liquidMotion(launch, age, physics?)` and `liquidImpactTime(launch, physics?)` are exported from the core
and package root. Launch coordinates are `x` across the pool, `z` into the scene, and `h` above the
surface. Velocities are `vx`, `vz`, and `vh`. The optional physics fields are `gravity` (default 820),
linear `drag` (default 0.35), and `depthScale` (default 0.22).

The sample includes world position/velocity and projected `y = z * depthScale - h` and `vy`. It uses the
same analytic drag/gravity trajectory for both heads and trails, so it is deterministic and seekable.
`liquidImpactTime` finds the first descending crossing of `h = 0`, including the later landing of a
rising drop launched at the surface. Use the sample at that exact time for a ripple's center. Negative
launch height, invalid times, non-positive gravity and negative drag/depth scales are rejected.

```ts
const launch = { x: 3, z: -5, h: 24, vx: 45, vz: 12, vh: 90 };
const physics = { gravity: 700, drag: 0.45, depthScale: 0.24 };
const landingTime = liquidImpactTime(launch, physics);
const landing = liquidMotion(launch, landingTime, physics);
// Draw the drop only before landingTime. Start a ring at (landing.x, landing.y) afterward.
```

The internal water `liquidBead` renderer adds a short connected trajectory tail behind a shaded round
head. It emits no broad glow. A fast small drop still stretches, while at the apex its tail shortens.
This is a reusable authoring helper, not a fluid solver: there is no pressure grid, volume conservation
between separate particles, collision geometry, refraction of the game scene, or self-interacting waves.

## Effects

- `water/water-jet`: unchanged ID, frame size, pivot, duration and palette options. The default now
  narrows under acceleration and develops travelling capillary necks before breaking into round beads.
  Downstream spray inherits its tangent and falls under gravity. The authored 1-second loop is exact.
  Set `flowStyle: "classic"` for the prior pixels and glow; a regression hash protects that route.
- `water/capillary-crown`: a new 2.2-second one-shot. A drop lands on an export frame, a curved
  translucent crown opens, ten beads separate from its actual rim, the cavity rebounds, and each bead
  generates a small ring at its computed landing point. It ends with fully empty color and light.

Both preserve crisp color cells, a dark underside, small reflected white accents and transparent
interiors. Reflections are palette color, not simulated light emission. Recoloring, flipping, seeking
and seeded variants are supported. Rotating an effect may require a larger host canvas. The CLI keeps
its declared pivot when mirroring, so a directional jet needs a mirrored host placement: use
`--opts '{"flip":true,"x":174}'` for its 188-pixel-wide canvas. A bare `flip:true` clips this left-origin
effect; automatic export re-centering is an existing tooling limitation, not fixed by this water pass.

## Visual iteration and checks

1. The initial water jet read as a bright energy beam. The replacement removed its broad nozzle flash,
   reduced spray from 70 random fine drops to 24 coherent trajectories, and introduced narrowing,
   gravity bend, capillary pinch and round heads. The first crown was tall and straight-sided.
2. The crown was widened and lowered. Its walls now curve outward instead of forming a rigid glass;
   pre-detachment beads visibly connect to the crown. Ring strengths and spacing were separated to
   prevent several crests from merging into a bright white band. Jet beads were phase-aligned to the
   travelling stream necks.
3. A low-frequency slosh prevents the collapsing crown from becoming a perfect rigid ellipse. The jet
   was slightly thickened for a readable dark/body/reflection hierarchy at native resolution. Final
   GIF sequences, impact/release/landing frames, native-size output and transparent checkerboard
   variants were inspected. Tests cover physics, exact periodicity, deterministic seeks, classic pixels,
   recoloring, terminal transparency and complete default/seed color bounds.

Run `npm run build`, `npm run test:quality`, and `npm run check -- water/water-jet water/capillary-crown`.
Render with `npm run render -- water/water-jet water/capillary-crown --gif --sheet`. Generated GIFs and
transparent sprite sheets live in `records/` and are not committed. Artistic quality remains subjective;
verify timing, scale and readability in the target game. The original `water/splash` still has its
pre-existing 3-pixel falling-stone tail overflow above its declared canvas; this change does not alter it.
