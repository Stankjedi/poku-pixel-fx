# Native actors in ACT and gallery exports

`createActorAdapter2D` connects the authored Human/Creature renderers to ACT without rescaling their bitmaps or replacing the stock actor. `height` is the native drawing budget (32–192 pixels). Existing ACT calls without a selection keep the stock path.

```ts
import { createAct, createFrame, clearFrame, composite } from 'poku-pixel-fx';
import * as slash from 'poku-pixel-fx/fx/melee/sword-slash';

const actorSelection = {
  kind: 'human' as const,
  height: 96,
  style: { view: 'three-quarter' as const, hair: 'ponytail' as const, outfit: 'jacket' as const },
  motion: 'act' as const,
  weapon: 'sword' as const,
  attachment: 'auto' as const,
};
const act = createAct(slash, { x: 140, y: 190, seed: 17, actorSelection });
const frame = createFrame(360, 260);
// On each frame:
act.update(1 / 60);
act.draw(clearFrame(frame));
const rgba = composite(frame, new Uint8ClampedArray(frame.w * frame.h * 4));
```

## Contract

- A sample supplies native pixel bounds, a root pivot, mask, head/chest/hand/foot anchors, and back/front draw callbacks. Returned samples remain valid after subsequent samples; their arrays are read-only to callers.
- ACT poses drive Human limb targets at their native height. A fixed chosen motion can instead drive idle, walk, guard, wave or crouch. Cat/fox support idle/walk/trot; owl/dragon support idle/fly.
- Held sword/bow geometry uses the same Human material renderer as the standalone weapon studies, attached to the current ACT hand and authored weapon angle. The effect's hit-stop and contact times remain the original ACT timeline.
- Automatic attachment uses the live body mask for body effects and the hand offset for armed effects. Explicit root/hand/head/chest attachment is available. Effect art retains its native pixel scale.
- Stateful body transformations such as petrification and disintegration precompute a silhouette. They bind one immutable native pose at effect time zero to both the simulation and the visible body. Wind-up can animate before zero; the transformation then holds that pose. This snapshot policy avoids changing simulation geometry according to browser draw frequency. `act.actorSampling` can explicitly declare `snapshot` or `live`; custom stateful `live` effects must resolve changing actor data themselves rather than cache a silhouette.
- Pure drawn statuses such as Burning, Frozen, Charmed and Sleep use live masks and anchors. Stock ACT retains its existing rest-body remapping.
- `actBounds(module, { actorSelection })` includes the native actor, transformed effect and attachment offsets. Mirrored asset placement reflects the resulting pivot too.

In the gallery, open an effect and use **배우**, **원화 높이**, **시점**, **동작**, and **무기**. **이펙트 PNG** remains an actor-free effect asset. **현재 장면 PNG + JSON** and WebP include the selected actor and scene. Their metadata records actor selection, seed, flip, background, speed and sampled ACT times; WebP encoding may be lossy.

```bash
node build-tools/tools/act.mjs melee/sword-slash --sheet --actor human --height 96 --weapon sword --no-target
node build-tools/tools/act.mjs status/burning --sheet --actor cat --height 64 --motion walk
```

## Allocation and ownership

Human construction reuses a bounded four-entry scratch-frame pool and a bounded parsed-palette cache. Result pixels and masks remain independently owned. Portraits cache at most twelve discrete style/expression/eye states, with no continuous time key. Every portrait result owns its pixels, masks and landmarks. Modifying one result cannot change later renders.
