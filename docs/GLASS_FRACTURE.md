# Thin glass fracture and contact response

`impacts/glass-shatter` is a clear, thin sheet rather than an ice block or recolored stone explosion.
Its one primary `ImpactContact2D` is at 0.30 seconds, point `[-8,-37]`, outward normal `[-1,0]`, material
`glass`. The strike and crack front use that descriptor's clock. Release begins 0.10 seconds after
contact, with a short distance-based delay for the remote cells. This delay is artistic timing, not a
claim to model real glass crack speed. There is no hidden camera motion, fire, mineral dust or glow.

The clear pane and its fragments retain continuous alpha. Hairline rims, brief reflected highlights,
rotating edge-on silhouettes and narrow triangular slivers distinguish glass from opaque rubble.
The `light` buffer stays empty: unheated glass reflects light instead of emitting it. Secondary pings
occur at actual shard/floor contacts, and sheets settle flat before fading out. `force` is clamped to
0.5..1.35 and `spokes` to 8..18 so those options fit the declared 288×160 native canvas.

## Reusable authoring helpers

All helpers are exported from `core/index` and the package root.

```ts
import { fractureGlass, glassShardPath, glassVertices, defineImpactContact2D } from 'poku-pixel-fx';

const hit = defineImpactContact2D({
  id: 'window-hit', at: .3, position: [-8,-37], normal: [-1,0], material: 'glass', radius: 3,
});
const mesh = fractureGlass({ left: -28, top: -66, right: 28, bottom: -3 }, hit.position,
  { seed: 23, spokes: 14, rings: 2 });
for (const cell of mesh.cells) {
  const [x,y] = cell.center;
  const local = cell.polygon.map(([a,b]) => [a-x,b-y] as const);
  const motion = glassShardPath(local, { x, y, vx: 70, vy: -60, spin: 3, tumbleSpeed: 8 });
  const visiblePolygon = glassVertices(local, motion.sample(.4));
  // Draw translucent faces and sharp reflection edges in the color buffer.
  // motion.impacts contains actual contact time, vertex position, and normal speed.
}
```

`fractureGlass(bounds, point, {seed=1, spokes=12, rings=3})` creates nested radial wedge cells and unique
cross-crack segments. Cells exactly cover the rectangular source without overlap; no material is
invented when the sheet breaks. The point must be strictly inside the rectangle. Inputs are copied,
results are frozen, coordinates/seed are finite and bounded to ±100000, spokes are 6..32 and rings
1..5. The return value contains `cells` (polygon, center, area, ring, spoke) and `cracks`.
This API is intentionally for rectangular panes, not arbitrary mesh fracture or laminated glass.

`glassShardPath(vertices, launch, options)` bakes 240 Hz plane collisions. Launch properties are `x`,
`y`, `vx`, `vy`, optional `angle`, `spin`, `tumble`, and `tumbleSpeed`. Options are `duration=2.5`,
`gravity=420`, `drag=0.6`, `bounce=0.26`, `friction=0.62`, `ground=0`. Positions are native pixels with
+Y down, angles radians, velocities per second. A returned `sample(time)` contains position,
velocity, angle, tumble, flatten and resting. `glassVertices` projects this thin sheet pose.

Tumbling support vertices determine ground contact and prevent the rotated shape from entering the
floor. Recorded impact positions use the contacting vertex, not the fragment's center. Low rebound
starts a short flattening and friction phase, then a stable rest. Samples can be sought in any order
and repeated without changing collision events. The effect canonicalizes its timeline to nanoseconds
before drawing so accumulated frame-clock roundoff cannot change a release or pixel-boundary frame.

This is bounded VFX plane motion, not a general physics solver. There are no shard/shard or shard/actor
collisions, damage, material strength calculation, sound playback, mesh mutation or automatic hit-stop.
The author or host chooses how to turn `path.impacts` into small secondary slivers, pings, or sounds.
Primary contacts are exported through the shared contact hook and sprite metadata. Secondary paths
are authoring data and are not automatically appended to a module's primary contact list.

## Visual review and regression evidence

1. Pass 1 established the intact clear pane, fitted spiderweb topology, rotating sheets and real floor
   pings. Inspection found the outward fan too dense and a release frame sensitive to floating-point
   accumulation. Quantized drawing time removed the threshold mismatch.
2. Pass 2 increased horizontal separation and early lift, used 14 thinner radial sectors, and retained
   crack lines on delayed cells rather than briefly returning them to uncracked faces.
3. Pass 3 reduced fragment face opacity, kept sparse sharp reflection edges, and preserved a shallow
   settled silhouette instead of reducing all resting pieces to a single-pixel line. A narrow dark
   crack lip restored contrast on bright backgrounds. Dark-ground,
   mirrored bright-background and amber transparent variants were rendered and inspected.

After building, run `node --test tests/glass-quality.test.mjs`, `npm run test:quality`, and
`npm run check -- impacts/glass-shatter`. Checks cover full-pane coverage and area, seed determinism,
unique cracks, parameter bounds, exact support-point contacts, edge-on turns, floor non-penetration,
settling, arbitrary sample order, 30/60/120/144 fps parity, glass-only contact timing, no emissive light,
transparent faces, raw bounds, mirrored metadata and empty final sprite frames.

Render with `node build-tools/tools/render.mjs impacts/glass-shatter --gif --sheet --scale 3`.
Inspect actual GIF playback and native frame silhouettes as well as the tests. `--bg light` checks
readability on a bright scene and `--bg none` checks alpha. These are code-generated VFX, not a
simulation of optical refraction: backgrounds transmit through the pane but are not displaced.
