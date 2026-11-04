# Surface-bound fantasy corrosion

`nature/acid-splash` is now a viscous liquid hitting a readable metal plate. The incoming glob's nose
reaches the contact plane at 0.46 s, flattens into a short thick sheet, and sheds heavy falling drops.
Wet film spreads across the receiving face, narrow runs drain downward, and attached bubbles swell
and collapse. A dark pitted discoloration remains after the film dries. The rim, rivets and side of
the metal plate remain legible. There is no white explosion, spark shower, fire, shock ring or shake.

This is **stylized fantasy VFX, not a chemistry simulation**. No chemical substance, rate, danger,
material removal, gameplay damage or real-world corrosion behaviour is inferred or calculated.

## Reusable masked response

`surfaceCorrosion2D(contact, target, options)` uses the existing immutable `ImpactContact2D` facts.
The target is `{ x, y, mask: { w, h, data } }` in effect-local projected pixels, with screen-down Y.
The contact must lie within 1.5 pixels of an occupied mask cell. All inputs are copied or snapshotted.

- `cells`: immutable occupied surface cells reachable from the actual contact. Each has a seeded
  coarse pit pattern, projected travel distance, `startsAt`, `dose` and `edge` flag.
- `sample(index, time)`: pure `wet`, `etch`, and `active` values. Wet film rises then dries. Surface
  change starts later, grows monotonically and stays after the film is gone. Repeated or reverse
  sampling does not advance state. The caller controls eventual scene removal or overlay fade.
- `driesAt`: a conservative upper bound after which every cell's wet film is zero.
- `seed`, `reach`, `spreadSpeed`, `wetFor`, `dryFor`: art-directed distances and seconds, not physical
  or chemical coefficients. Defaults are 1, 44, 70, 1.1 and 0.6 respectively.
- `flow`: projected runoff direction, default `[0, 1]`. `[0, 0]` gives no directional bias. The
  contact normal remains descriptive contact geometry; the explicit projected flow is independent.

A bounded eight-neighbour shortest-path traversal follows the mask. A diagonal step requires both
adjacent cardinal cells, so the field cannot cut a corner, cross a hole or wet a disconnected island.
Travel is faster along the authored flow. The field never changes its source mask or host target.
Masks may be up to 512×512 pixels; rebuild when the silhouette changes rather than constructing it
inside each draw call. The helper is renderer-independent and produces no light or camera motion.

```ts
const contact = defineImpactContact2D({
  id: 'acid-metal', at: .46, position: [30, -49], normal: [-1, 0], material: 'metal',
});
const surface = surfaceCorrosion2D(contact, targetMask, {
  seed: 6, reach: 44, flow: [0, 1], wetFor: 1.04, dryFor: .68,
});
for (let i = 0; i < surface.cells.length; i++) {
  const cell = surface.cells[i], state = surface.sample(i, effectTime);
  // Render wet film and etched color at cell.x/cell.y, using the target's own shading.
}
```

## Effect and export contract

The built-in effect uses a fixed projected metal test plate. `surface: false` omits that plate and its
shadow, leaving the fluid and surface-response overlays for the same placement. It does not infer a
new target or act as a universal runtime collision system. Use the helper for your own target mask.
`palette` controls fluid, `surfacePalette` controls metal and pitting. `power` is clamped to .65..1.3.
`light: 0` retains all crisp color geometry. Drops use the shared analytic `liquidMotion` and
`liquidImpactTime`, land at their true floor crossing, and form small settled puddles there.

The existing effect ID is deliberately rebuilt: 2.8 s / 184×116 becomes 3.4 s / 264×160, pivot
`[132, 136]`, 103 frames at 30 fps. The last transparent frame is empty. The contact is exported in
`meta.pokuFx.contacts`; flipped exports transform its point and normal around the fixed pivot.
`particleStyle: 'classic'` is not an archival version of this new authored effect.

## Review and regression

Three render-inspect passes, including decoded GIFs:

1. Replaced the glowing ground pit and hot spark motif with a solid metal target, attached wet film,
   bubbles, liquid sheet and floor droplets. Initial surface travel read as a rigid triangular stain.
2. Changed the masked field to diagonal-aware travel, rounded the splash lips, reused analytic drop
   contact, and replaced four static straight runs with three narrowing, draining channels.
3. Delayed bubble growth until after the primary hit, filled the splash's excessive central notch,
   confined pit rims to actual surface cells, and checked zero glow and mirrored warm variants.

```sh
npm run build
node --test tests/corrosion-quality.test.mjs
node tools/preview-corrosion.mjs
node build-tools/tools/render.mjs nature/acid-splash --gif --sheet
npm run check -- nature/acid-splash
npm run test:quality
```

Tests cover connected-mask wetting, holes, diagonal corners, directional travel, snapshot immutability,
seed repeatability, monotonic pitting, dry persistence, invalid input, host-frame partitioning,
exact visible contact, unchanged pre-contact plate, zero-glow readability, rim preservation, raw
bounds across variants and transparent sprite metadata. Tests do not replace artistic review.
