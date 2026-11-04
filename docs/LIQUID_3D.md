# Liquid 3D authoring

Crown Splash 3D is a 3.8-second, seeded water impact. A falling drop creates a flared thin sheet; rounded drops detach from the actual crown rim; the sheet drains and tears, a central jet rebounds, and falling drops merge into the surface with local ripples. The blue/cyan palette reads as shaded water, with **no additive emission** in the effect. It does not reuse crystal fragments, fire smoke or electrical-star motifs.

## Preview and orbit

```bash
npm run build
npm run render:3d -- water --frames 30 --grid false --out records/3d/water.png
npm run render:3d:gif -- water --fps 30 --grid false --out records/3d/water.gif
# Review real XYZ crown thickness, gaps and droplet parallax from another angle.
npm run render:3d:gif -- water --yaw 110 --elevation 44 --zoom 1.2 --target-y 1.05 --grid false --out records/3d/water-orbit.gif
```

Camera overrides apply equally to sheets and GIFs. `--yaw` and `--elevation` are in degrees; `--zoom` is positive scale; `--target-y` uses world units. Omitted flags retain each effect's prior camera. The contact-sheet JSON records the actual camera. Very large size/force settings require a wider camera.

In `/gallery/3d.html`, select **CROWN SPLASH**. Drag to orbit, change the seed, pause/replay, or turn CINEMATIC off to inspect the unlit palette. The default water lighting rig is empty; the ordinary cinematic display finishing remains optional and is not water emission.

## Shared tools

Import from `poku-pixel-fx/3d`:

- `advanceLiquidDrop3D(position, velocity, dt, gravity?, drag?)` analytically advances constant gravity with linear drag. Its trajectory is independent of step partition within floating-point tolerance. All vectors use +Y up and seconds.
- `LiquidDrops3D(surface?, capacity?)` holds bounded drop states. `spawn` copies input vectors and returns false for invalid geometry or full capacity. `update` integrates motion, finds the surface crossing, and removes the drop without a solid-debris bounce. `drainImpacts()` returns position, incoming velocity, radius and elapsed contact time within the update. Consume the events after each update to place secondary ripples correctly. Expired drops generate no fake splash. `clear()` removes drops and queued events.
- `drawLiquidDrop3D` draws a rounded, velocity-aligned XYZ mesh with discrete palette bands. Shape stretching is artistic; width compensation is not a fluid mass solver.
- `sampleLiquidCrown3D` returns a deterministic sampled rim. Use those exact points to attach drops or secondary ligaments instead of spawning disconnected random spray. Seed controls lobe phase and asymmetry.
- `drawLiquidCrown3D` draws a curved thin sheet and wet lip. The optional `breakup` control opens art-directed drainage gaps from the rim. Radius, height and breakup are supplied by the effect timeline.
- `drawSurfaceRipple3D` draws a low finite-width annular crest and darker trough around any world-space origin, with damping, partial highlights and a finite lifetime. `strength` changes both height and visibility, so tiny drops do not create hero-strength rings.

```ts
import { LiquidDrops3D, drawSurfaceRipple3D } from "poku-pixel-fx/3d";
const drops = new LiquidDrops3D(0.04, 64);
drops.spawn({ position: [1, 2, 0], velocity: [1, 2, 0], radius: 0.12, gravity: 10.8, drag: 0.24 });
// On fixed-step update:
drops.update(1 / 120);
for (const hit of drops.drainImpacts()) {
  // Store a ripple at hit.position, born at the old clock time + hit.at.
}
// On draw:
drops.draw(painter);
drawSurfaceRipple3D(painter, { origin: [0, 0.04, 0], age: 0.3, strength: 0.5 });
```

All draw helpers are pure and independent of the 2D core. Empty palettes fall back to the water palette; one-color palettes are supported. Opacity uses the painter's current coverage/dither mode. No helper adds light or glow.

## Scope and verification

This is art-directed liquid VFX, **not** Navier–Stokes/SPH, a surface-tension solver, volumetric fluid conservation, light refraction, caustics or a physically based water shader. Gravity/linear drag and contact timing are analytical; crown growth, drainage, rebound timing and ripple propagation are authored approximations. Independent ripples overlap visually rather than solving wave interference. Translucent triangles are depth-sorted within each drop/crown; the engine's nearest-surface depth buffer is not order-independent transparency across all effects.

The tests cover partition-independent trajectories, precise contact time, no repeated bounces, bounded/invalid inputs, seeded rim geometry, draw purity, palette/depth/no-emission behavior, endpoint emptiness, stage and cue timing, multiple orbit angles/seeds, exact reviewed frame buffers, and export-camera metadata. Three visual refinement passes reduced spike-like crown tips, removed overly strong small-impact rings, and added sheet drainage plus a continuous rebound jet. Inspect the GIF as well as contact sheets when changing timings; tests are not an artistic quality guarantee.
