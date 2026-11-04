# Contact timing and target response

Treat impact as a shared event, not a separately guessed animation time. Define one contact-time constant and reuse it for the projectile arrival, the hit flash, surface response, hit-stop, sound and target reaction. The renderer does not decide damage, collision eligibility or network authority.

## 2D acts

`createAct(module)` accepts wall-time seconds in `update(dt)`. It advances exactly to each authored hit before applying target response and freezes the effect, pose, target and debris for `hit.stop` seconds. Shake continues on wall time. Any time left after the freeze is consumed in the same call, including additional contacts or loop cycles. Simultaneous hits share the longest freeze rather than adding freezes. `update(0)` does nothing; negative and non-finite deltas throw.

`act.onHit = hit => ...` runs at the contact, so `act.t` is the contact's effect time, not the end of the host's frame. For loops it is absolute elapsed effect time, while `hit.t` remains the authored cycle time. Negative wind-up contacts occur only on the first playback. End-of-cycle contacts are dispatched before the next cycle's zero-time contacts.

The timeline and hit-stop budget are independent of caller frame size. Spring and debris motion uses steps no larger than 1/120 s for stability; as with the existing 2D simulation, different fractional-step partitions may have small numerical motion differences. This is not a replacement for a game physics engine.

`actTiming(module)` exports existing timing keys plus the complete target response:

- `t`, `freeze`, `shake`, `amp`: effect timestamp and wall-time response.
- `target`, `at`: whether a target is hit and an optional index into `targets`.
- `y`, `push`, `straw`, `flash`, `shiver`, `skin`: local hit height and response settings, using the same defaults as the stock target.
- `contact`: optional contact geometry and application identifiers.

`target: false` suppresses stock target response but still permits hit-stop, shake and host callbacks. Serialized push, straw, flash and shiver are then zero. Existing `at`, `y`, `push`, `skin` and other hit fields retain their meanings. `ActHit` and `ActTimingHit` are exported types. The optional `contact` uses the shared immutable `ImpactContact2D` descriptor.

```ts
import { defineImpactContact2D, type ActHit } from 'poku-pixel-fx';

const contact = defineImpactContact2D({
  id: 'armor-hit', at: 0.42, position: [66, -28], normal: [-1, 0],
  material: 'metal', strength: 1, radius: 4,
});
const hit: ActHit = {
  t: contact.at, at: 0, stop: 0.07, shake: 0.12, amp: 2,
  push: 2.2, flash: 0.06, straw: 10, contact,
};
```

`ImpactContact2D.position` is effect-local pixels with **+Y down**, unaffected by instance placement or mirror. Its unit `normal` points out of the struck surface. Use `transformImpactContact2D` to transform the immutable descriptor into world space. Pass the local descriptor to the stock act target: it emits debris at that position when provided, while an explicit legacy `y` overrides its height. `contact.at` is contact time; **`hit.at` is the stock target index**, so never spread a contact descriptor directly into an act hit. Set `t: contact.at` explicitly to share one source of timing.

## 3D cues

Existing `{ at, type, value }` cues retain their shape. Keep 3D collision geometry in world XYZ with **+Y up** and use the same contact-time constant for cue timestamps and the visual response. The 3D player stays independent of the 2D act and contact modules.

`drainCues()` reports each crossed cue once in chronological order, preserving authored order for equal timestamps. A cue at zero fires on the first 120 Hz simulation step, once per playback or loop. `restart()` re-arms cues. `seek(seconds)` reconstructs silently and consumes all cues at or before the requested position, including `seek(0)` and fractional ticks, so playback cannot re-emit past contacts. Cues use the simulation clock; a host frame may receive multiple contacts and must retain their authored timestamps.

The contact descriptor is authored metadata. It does not add automatic mesh collision, damage, sound playback, material simulation or network replication. Contact events should come from the same trajectory/surface calculation that positions the visual impact.

## Regression checks

After `npm run build`, run:

```sh
node --test tests/contact-timing.test.mjs
```

Coverage includes zero-time and near-tick 3D cues, restart, silent seek, multi-cycle updates, exact contact endpoints, simultaneous freezes, arbitrary frame partitions, wind-up, target suppression, complete timing serialization and contact-point debris placement.
