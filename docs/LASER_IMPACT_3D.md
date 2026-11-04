# Laser contact: metal ablation

The coherent laser now has a material-specific hit response. A small beveled metal target
makes the contact point and residual damage readable. This is not the meteor impact system:
there is no terrain wave, large crater, global explosion or branch network.

## Timeline

- **Before 0.625 s:** the target is intact. No contact light, spray or heat appears early.
- **At 0.625 s:** a compact white/gold back-pressure fan erupts out of the metal. It fades
  within about 0.18 s, while the original beam remains on its stable axis.
- **During the hold:** the recess widens over 0.85 s. A dished, irregular molten lip surrounds
  its unfilled center. Incandescent splinters and heavier droplets shed continuously. Two
  small slag runs develop downward along the surface and vapor rises from the contact.
- **At 1.90 s:** power turns off at the emitter, but the contact remains fed while the tail
  is still traveling. Pressure decays only when that tail reaches the target at 2.03 s.
- **Afterward:** white/gold metal cools through orange/red into dark slag around the bore.
  The target itself remains visible long enough to read the damage, then the whole effect
  fades empty at its original 3.10 s duration.

The authored face is a fixed oblique world-space plane, with visible thickness and bolts.
Its local vertical axis points upward in the world, so molten runs actually descend. It
never rotates toward the camera. Spray is seeded, localized, drag-damped and floor-bounded.
This is stylized VFX, not a thermal or physical optics simulation.

## Effect options

```ts
const fx = createFx3D(coherentLaser3D, {
  seed: 2419,
  impactScale: 1,
  targetVisible: true,
  impactPalette: ["#28151d", "#652723", "#b94525", "#f58436", "#ffd078", "#fff3d0"],
});
```

`palette` still controls the laser. `impactPalette` independently controls molten material,
so recoloring the laser does not inadvertently turn the metal into electrical branches.
Empty and one-color heat palettes are supported. `impactScale` is clamped to 0.45–1.35.
`targetVisible: false` omits the demonstration plate while retaining the impact response,
for applications whose host scene already supplies the target.

## Reusable API

`src/3d/laser-impact.ts` exports `LASER_METAL_HEAT_3D`, `laserContactState3D` and
`createLaserMetalContact3D`, independently of the 2D core.

```ts
const beam = createBeamFrame3D(source, hitPoint);
if (beam) {
  const metal = createLaserMetalContact3D(beam, { seed: 19, targetVisible: false });
  // Each rendered frame:
  metal.surface(painter, time); // Material lip, optional plate and cooling vapor.
  drawCoherentBeam3D(painter, beam, beamEnvelope3D(time));
  metal.contact(painter, time); // Initial pressure fan and continuous molten spray.
}
```

Creation consumes the seeded randomness once. `surface`, `contact`, `point` and `state` are
pure with respect to simulation state, preserving repeated draw, seek and fixed-step replay.
Custom timing uses the same finite, strictly increasing contract as the beam envelope.
The analytic response separates first-contact flash, sustained pressure, stored heat,
bore growth and final visibility instead of reusing one fade for every phase.

## Verification

The laser regression suite now contains 15 tests, including arrival-only energy, tail-time
pressure, cooling, world-up material coordinates, optional host geometry, dark recessed
center, localized floor-safe spray, palettes and defaults across four seeds and 93 frame
times. Reviewed buffer fixtures were refreshed because target geometry is now intentional.
Three visual passes covered first contact, hold, moving shutoff, cooling, decoded GIF frames
and a second orbit. The shared beam geometry, timing, camera defaults and other effects were
not changed by this patch.
