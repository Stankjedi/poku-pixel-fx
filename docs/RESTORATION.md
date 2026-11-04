# Target-bound restoration

`holy/heal` is a restorative interaction, not a small explosion. A jade lotus anchors the feet,
two upward ribbons wrap the target, a narrow mint response follows the body, and one soft chest
beat marks the heal. The target stands up smoothly. There is no recoil, hit-stop, screen shake,
ground fracture, radial burst, or rain of impact sparks.

## Shared tooling

`core/restoration.ts` exports:

- `defineRestorationTiming2D({ startsAt, pulseAt, liftedAt, endsAt })`: validates an ordered schedule
  and returns an immutable copy. Healing application uses `pulseAt`, not a separate hand-tuned time.
- `restorationField2D(target, timing)`: snapshots an actor mask, pixels, local placement and optional
  chest landmark. It exposes occupied `cells`, `top`, `bottom`, `centerX`, `chest`, and `spanAt(y)`.
  Empty padding is not treated as part of the body. Sparse rows use their nearest occupied row.
- `field.sample(time)`: pure, seekable upward sweep, single soft pulse, and release coverage.
  The sweep passes the target's actual chest at exactly `pulseAt` for different target sizes.
- `field.responseAt(y, time)`: a narrow travelling restoration response. The rendering effect can
  tint the original shaded pixels and light only their rim rather than washing the body white.
- `restorationPulseCrossed(timing, previous, current)`: half-open crossing test for a host update.
  A catch-up update still finds the event; repeated updates at the same time do not reapply it.

```ts
import { createFx, restorationPulseCrossed } from 'poku-pixel-fx';
import * as heal from 'poku-pixel-fx/fx/holy/heal';
const fx = createFx(heal, { actor: targetMask, x: target.x, y: target.y });

function update(dt: number) {
  const previous = fx.t;
  fx.update(dt);
  fx.options.x = target.x;
  fx.options.y = target.y;
  if (restorationPulseCrossed(heal.restoration, previous, fx.t)) {
    // Apply the host game's approved heal/cleanse here. The VFX library never modifies HP.
  }
}
```

All of this effect's geometry follows the instance origin, including the quiet departing leaves.
Create a new field/instance when a custom target's mask or source pixels change. The built-in
`act.onBody` path remaps the stock actor's response to its moving pose. Custom masks need their own
renderer and appropriately sized export canvas; the default 96×104 canvas covers stock actors 1/2.

The module exports `restoration` independently of damage `contacts` and `act.hits`. Sprite-sheet
JSON preserves it as `meta.pokuFx.restoration`, including the 0.70 s application beat. It is timing
metadata only, not a damage event and not automatic gameplay logic. The fixed-pivot transparent
sheet is 64 frames at 30 fps; its last frame is empty. Actor-recolor pixels are deliberately
body-specific, so use a runtime target mask for different character artwork.

## Visual review

The initial effect's bright hoop, lotus and heart bursts competed with the target. Three design
passes reduced bloom, rebuilt the petals as filled shaded forms, shaped the paired ribbons, and
removed front-layer crossings over the face. A subsequent raw-bounds test caught faint floor light
outside the canvas; reducing its radius fixed it without masking or edge fades. The body response
now touches only the strong narrow sweep, preserving the original anatomy elsewhere.

Run after building:

```sh
node tools/preview-restoration.mjs
node build-tools/tools/render.mjs holy/heal --gif --sheet
node build-tools/tools/act.mjs holy/heal --mp4
node --test tests/restoration-quality.test.mjs
```

The review GIF compares a moving target, zero glow, and a warm mirrored recolor. Check the actual
encoded motion plus native-size silhouettes, target readability, first/pulse/last frames and
transparent output. Tests cover attachment, exact timing, small/catch-up updates, custom masks,
immutability, determinism across frame partitions, no impact reactions, raw bounds and metadata.
The rebuild deliberately changes the old warm 1.9 s / 80×104 presentation to jade 2.1 s / 96×104;
`particleStyle: 'classic'` is not an archival version of this authored effect.
