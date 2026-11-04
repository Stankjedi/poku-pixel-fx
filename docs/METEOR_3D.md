# Meteor Impact 3D

Select **METEOR IMPACT · 메테오 충돌** in `/gallery/3d.html`. A heavy, irregular basalt body follows a slanted accelerating descent. Heating stays on the leading surface as the rock tumbles; the plasma mantle follows the already-travelled path, while detached chips lag behind. At 1.65 seconds the actual lowest mesh vertex reaches the floor. The contact patch breaks into twelve matching closed ground slabs. The compressed meteor separates into twenty closed pieces made from its actual source faces. The two materials follow distinct heavy ballistic arcs, with a subtle traveling ground swell, refractive air-pressure hemisphere, volumetric rolling dust, and a raised fractured crater rim around dark inner walls. The whole scene jolts briefly at contact.

This is an unpowered atmospheric-entry effect, deliberately distinct from a guided missile: no machined hull, fins, nozzle, steering or thruster. It is an art-directed ballistic trajectory, not an aerodynamic or impact-physics solver.

```sh
npm run build
npm run render:3d -- meteor --frames 32 --grid false
npm run render:3d:gif -- meteor --fps 24 --grid false
npm run render:3d:gif -- meteor --cinematic true --grid false
# Inspect the same world geometry from another camera:
npm run render:3d -- meteor --yaw -40 --elevation 35 --grid false
npm run test:3d
```

```ts
import { createFx3D, meteorImpact3D } from "poku-pixel-fx/3d";
const fx = createFx3D(meteorImpact3D, { seed: 60217, size: 1, force: 1 });
```

`size` is bounded to 0.45–1.4 and `force` to 0.25–1.5. `palette` replaces the six-step plasma/heat ramp, including shorter nonempty ramps; basalt and dust remain non-emissive material colors. Empty ramps recover the defaults. Timeline: entry, ablation, breakup, impact, ground failure, heavy ejecta, cooling and settle. `METEOR_IMPACT` is exported from the effect module, and hit/flash/shake/sound cues share that exact instant. Seek is silent; live playback fires the impact cues once. The 5.6-second one-shot ends empty.

## Reusable rock geometry

`createRockMesh3D({ seed, radius, roughness, detail })` returns a closed `FragmentMesh3D`, usable with `drawFragment3D` and `Fragments3D`. Seeded radial variation retains shared vertices and outward winding. Detail 0 produces 20 triangles; default detail 1 produces 80. Radius must be finite and positive, and roughness is bounded to 0–0.45. No runtime textures or image assets are used.

The effect reuses the existing mesh debris engine for angular velocity, gravity, drag, vertex-ground collision, low bounce and face-supported settling. The atmospheric mantle uses world-space mesh sections, the dust uses a depth-clipped world-space density volume, and emission goes through the existing light buffer. The 3D module never imports the 2D core or modifies existing effects.

## Verification scope

`tests/meteor-3d.test.mjs` checks closed rock topology, outward winding, seed variation, acceleration, update-partition/seek/restart determinism, repeated-draw purity, orbit parallax, impact timing, terminal cleanup, short palettes, bounded options and native-frame margins over several seeds. Rendered contact sheets and exported GIF frames must still be inspected for mass, silhouette and impact readability: tests alone are not an art-quality guarantee.


## Ground shockwave toolkit

`drawGroundShockwave3D(painter, { age, center, radius, speed, width, height, life, seed, palette, hotColor })` is reusable for ground slams, cannon strikes and other impacts. It builds an irregular annular ridge in world XYZ, with a seeded soil crest, floor contact on both edges, an optional early pressure flash and late breakup into dust. Translucent wedges are sorted by camera depth. Its geometry is not a screen-space ring.

`groundShockwaveRadius3D(age, radius, speed)` gives the same analytic, monotonically expanding radius. The front launches quickly and decelerates toward its maximum reach; it never moves backward. Both helpers are exported by the 3D package. Before the event and after its lifetime, the drawing helper emits nothing. This is deliberate VFX choreography, not a pressure-wave simulation.

This annular helper remains available for other effects. The meteor now uses the connected terrain and refractive pressure response below instead of an annular ring. The incoming body, contact time, 120 Hz determinism and total duration remain unchanged.


## Coherent ground and meteor fracture

`createImpactGround3D(seed, size)` creates twelve thick closed wedges with shared contact boundaries, seeded release delays, world-space centers and angular velocities. The effect renders these exact meshes attached to the contact patch before releasing them into `Fragments3D`. `drawImpactCrater3D` leaves a fractured raised lip, shaded inner walls and recessed floor rather than a ring of unrelated pebbles. These are reusable 3D-package exports.

`fractureRockMesh3D(mesh)` splits a detail-1 `createRockMesh3D` result into twenty closed solids. Every original outer triangle belongs to exactly one piece, internal cut faces close each solid, and the total solid volume is preserved. Returned `sourceFaces` permit inspection. Other mesh formats are rejected rather than silently partitioned incorrectly.

The meteor compresses briefly at contact before splitting. Soil slabs are larger and turn slowly; heated meteor fragments are darker, sharper and move on steeper arcs; fine gravel and short sparks remain subordinate. Dust is sampled in world XYZ through the existing volume renderer, clipped by opaque scene depth and illuminated with a bounded earth palette. Dust trails originate at actual simulated slab positions. Spatial bins bound their contribution to nearby density-cache cells. No camera-facing smoke discs or long triangular flame spikes are used in the impact.

This revision costs more than a particle-only impact. The gallery caps meteor rendering at 260×180 internal pixels, preserving crisp nearest-neighbor presentation. Pre-bake hero effects for constrained hardware; the CPU volume is not a GPU fluid simulation. The included tests cover matching boundaries, closed debris topology, face/volume conservation, deterministic playback and final cleanup in addition to visual fixtures.


## Ground motion, air pressure, and camera response

`createImpactTerrain3D(seed, size)` builds a connected, seeded floor mesh with shared vertices and subtle bedding marks. `impactGroundHeight3D(radius, age, size, strength)` supplies the contact-centered displacement: a shallow outward crest, a much smaller trailing trough, and exact zero before contact and after 1.25 seconds. `drawImpactTerrain3D` applies this field to the same vertices each frame; fracture lines follow the surface. At default scale the crest stays below 0.38 world units, so the earth ripples rather than turning into a liquid wave. The outer floor fades softly into the host scene and the one-shot still ends empty.

`Painter3D.pressureWarp(center, radius, width, displacement, air?)` produces a short expanding refractive hemisphere, clipped at the ground and against nearer objects. It samples immutable color, depth, legacy-light and HDR snapshots together. Compression and rarefaction bend pixels in opposite directions. The optional `{ tint, opacity }` is a faint grazing condensation edge that adds no opaque depth or emission. Both orthographic and perspective cameras use scene depth; perspective uses reconstructed ray/sphere intersections. Invalid or overflowing bounds are rejected and sampling remains within the frame. This is an artistic optical approximation, not a compressible-fluid solver.

`impactCamera3D(base, age, strength, seed)` derives a deterministic camera jolt from an unchanged base camera. It settles exactly by 0.7 seconds, never mutates the base or accumulates offsets, and is identity outside the event. The meteor implements the optional `Effect3D.camera(base)` hook. Hosts should call `fx.camera(baseCamera)` **before** drawing the grid, effect and other world geometry, and use that same camera for lighting. Ordinary effects without a hook return the base unchanged. Seeking does not dispatch cues and still gives the correct camera response.

```ts
const frameCamera = reducedMotion ? baseCamera : fx.camera(baseCamera);
painter.setCamera(frameCamera).begin("#0a1525");
painter.grid();
fx.draw(painter);
// Pass frameCamera to any world-space lighting pass too.
```

The gallery honors `prefers-reduced-motion`; both 3D exporters accept `--camera-motion false`. This disables camera movement while preserving the impact geometry, deformation and air effect. The default GIF bakes camera response into its frames, so no site-side JavaScript is needed to play it. Replaying starts and ends on the exact base camera without a shake seam. Tests cover propagation, bounded crest/rebound, pressure buffer integrity, overflow rejection, foreground occlusion, camera immutability and playback/restart behavior.

## Volume performance checks

The dust keeps the same 0.28-unit cache cells and 0.16-unit ray steps, scaled by `size`. Its fixed radial/lobe geometry is cached per grid column, and each animated refill reuses column-level values across heights. Repeated draws at one simulation time also skip rebuilding the fragment-trail bins. The shared volume cache skips redundant RGB interpolation only for non-emissive fields where every occupied corner has the same material, and skips emission interpolation when the field is non-emissive. Mixed-material cells retain the original weighted interpolation order.

`node tools/benchmark-meteor-impact.mjs build path/to/baseline-build` alternates render order across identical 260×180 HDR frames, reports median round means and p95 values, and separately measures cached redraws. Wall-clock results are advisory on shared hosts. These changes preserve the existing reviewed meteor and plume color, light, depth and HDR buffers; they do not reduce dust density, fragments, simulation frequency or ray samples.
