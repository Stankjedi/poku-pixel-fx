# Wind pressure strike 3D

`wind` / `windRasenshuriken3D` keeps its four curved airfoil blades, but the attack now transfers
force into a visible surface instead of ending in an unmotivated cyan explosion. The 4.6-second,
seeded one-shot retains its existing identifier and legacy variant.

## Choreography and material

- The pale, hollow vortex forms above the floor. Its long tails remain inside the default frame.
- At 2.65 s it compresses into a fast downstream tongue with short curved wakes.
- `WIND_CONTACT_3D` owns the 3.05 s contact time, point `[3.15, 2.35, 0]`, outward surface normal
  `[-1, 0, 0]` and wood material. The hit cue uses that exact time. No light-flash cue is emitted.
- A thin pressure patch touches the wooden face. Air splits around the sides instead of passing
  through the prop or drawing a continuous energy beam. The prop rocks on its downstream support,
  slides, returns to the ground and settles. Rooted grass bends and springs back with a travel delay.
- Dust stays low and widens; actual leaf-shaped triangles tumble downstream. Neither uses glowing
  sparks, rock shrapnel, spherical detonation rings or emitted light.

`targetVisible: false` hides the demo wooden prop when a host supplies its own target. The soil bed,
rooted grass and contact dust remain part of the demo effect. Host code can consume the exported
contact facts, but this module does not apply damage or transform an external actor automatically.
The point is the original contact position; the demo prop moves after the impulse.

`radius` is bounded to 0.5–3.4 world units, `intensity` to 0–2, with non-finite values falling back to
defaults. Intensity zero draws nothing. Short and empty palettes are safe. Air is recolorable while
wood, soil and foliage retain their material ramps. The refined wind uses no additive light in either
packed or HDR buffers. The gallery and both cinematic exporters therefore omit the old neon stage
light rig for this variant; `windOriginal` preserves the previous presentation.

## Small reusable motion tools

`gustImpulse3D(age, strength = 1)` returns:

- `pressure`: a rapid positive compression envelope;
- `deflection`: a signed damped spring response for rooted or hinged objects;
- `drift` and `velocity`: bounded downstream displacement and its time derivative.

Negative ages return zero response. The wooden prop clamps negative deflection at its floor support;
rooted grass retains the signed spring-back. One function keeps their onset and force consistent.

`advectGust3D(origin, direction, age, speed, drag = 2.6)` returns a downstream position using a
normalized direction and analytically integrated linear drag. It preserves the origin before birth,
handles zero drag, rejects invalid input and never mutates caller vectors. Leaves add flutter and
lift while dust adds a much smaller lift to the same drag path. All sampling is independent of draw
order and frame rate. These are bounded artistic motion models, not CFD or a rigid-body solver.

## Review and verification

The visual passes removed the free-floating radial blast, linked force to a rocking prop, corrected
stray particles arriving before contact, made dust and leaves readable, then raised the hovering
formation and bounded its tails to prevent native-size edge clipping. Inspect decoded GIF frames
around 2.9–3.9 s as well as the full formation. An oblique cinematic render checks depth and the
surface split; no sprite texture is used.

Run:

```sh
npm run build
npm run test:3d
npm run test:export
node build-tools/tools/render-3d-gif.mjs wind --fps 24 --width 320 --height 220 --out records/3d/wind-pressure.gif
node build-tools/tools/render-3d-gif.mjs wind --fps 20 --yaw 60 --elevation 28 --zoom .95 --cinematic true --out records/3d/wind-pressure-orbit.gif
```

Regression tests cover impulse causality, drag limits, immutable contact facts, pre-contact geometry,
real prop support and skid, zero emitted light, palette safety, seed differences, seek/update/repeated
render equality, ending empty and full-sequence native border coverage. The integrated cinematic
test explicitly distinguishes non-emissive wind from the emissive legacy variant.
