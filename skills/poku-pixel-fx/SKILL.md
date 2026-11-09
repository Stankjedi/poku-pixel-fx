---
name: poku-pixel-fx
description: Create and refine pixel art effects and sprite sheets using the local Poku Pixel FX library; use for game VFX, animation, and engine exports.
license: MIT
---

# poku-pixel-fx

POKU Pixel FX is a Korean-localized, TypeScript-based open-source fork/derivative of [PixelFX by Patch](https://github.com/patch-gg/pixelfx), maintained as a separate repository without a GitHub network-fork link. The upstream MIT license credits Patch and Hugo Duprez; preserve the copyright and attribution notices in `LICENSE` and `NOTICE.md`.

Requires Node.js 18 or newer; ffmpeg is optional for GIF and MP4 previews.

Pixel art effects as code. Each effect is one file, `src/fx/<category>/<name>.ts`, that draws into two buffers:
**color** (pixels: opaque, dithered or truly translucent) and **light** (additive glow). No images, so an effect
can be played live, recolored, mirrored, reseeded and rendered to a sprite sheet for any engine.

The method builds on Hugo Duprez's ([How to make (good) pixel art effects with
Claude](https://www.spritefusion.com/blog/how-to-make-good-pixel-art-effects-with-claude)): trust your eyes and
use references. Aim for a strong first complete generation by choosing subject, motion, scale and layer
hierarchy before detail work. Do not make the user repeatedly refine an old effect that misses their visual
direction. Inspect the result and fix material defects internally; tests do not certify artistic quality.

## Before anything

1. Work in a Poku Pixel FX checkout containing `package.json` and `tools/render.mts`. If none exists, obtain the public library in the user's chosen project or workspace: `git clone https://github.com/Stankjedi/poku-pixel-fx.git`. The skill file alone does not contain the effects library. Never use another person's machine-specific path. Install the checkout's dependencies with `npm ci` when needed; do not repeat it if already installed.
2. Run `npm run build` before using the tools or gallery; the compiler emits runtime modules to `build/` and CLI tools to `build-tools/`.
3. Check it runs: `node build-tools/tools/render.mjs fire/torch` writes `records/fire/torch/contact.png`. Open that PNG with
   your image-reading tool. That contact sheet is how you see every effect from now on.

## 1. Look for an existing effect first

`node build-tools/tools/list.mjs <words>` searches ids, names, tags and descriptions (`node build-tools/tools/list.mjs frost`,
`node build-tools/tools/list.mjs slash loop`). `docs/CATALOG.md` lists everything by category. Render the candidates and
look at them before choosing. Most requests are an existing effect with different options:

- `palette`: the main ramp, dark to bright, as hex strings. Any `PAL` ramp in `src/core/color.ts` (fire ember
  lava smoke dust ice water electric volt poison holy heal arcane shadow blood earth stone gold leaf wood metal
  bone neon cyber matrix candy night) or your own. A blue fire is `{"palette": PAL.ice}`.
- `seed` for a different but equivalent take; `flip` to face left; `angle` to rotate; `light` (0..1+) for glow
  strength; plus each effect's own knobs in its `meta.options` (size, count, radius, text, height...).
- Try options without editing code: `node build-tools/tools/render.mjs fire/torch --opts '{"palette":["#102","#215","#43a","#8cf","#fff"]}'`.

## 2. Put it in the game

**Canvas or WebGL games in JS or TS** (plain canvas, Phaser, PixiJS, Kaplay, three.js): use the code directly. It
has no dependencies; copy `src/core` and the effect files you need, or depend on the repo.

```js
import { createFrame, clearFrame, createFx, composite } from "poku-pixel-fx";   // src/core/index.ts
import * as frostNova from "poku-pixel-fx/fx/ice/frost-nova";                   // src/fx/ice/frost-nova.ts

const frame = createFrame(320, 180);            // the game's pixel resolution; ox, oy scroll it with the camera
const img = new ImageData(320, 180);
const fx = createFx(frostNova, { x: hero.x, y: hero.y, flip: hero.facing < 0 });

// every tick
fx.update(dt);
clearFrame(frame);
fx.draw(frame, "back");    // what goes behind characters
drawCharacters();          // your own sprites, or draw them into frame.color yourself
fx.draw(frame, "front");
composite(frame, img.data, background);   // color over the background plus light; or null for transparent
ctx.putImageData(img, 0, 0);              // then scale the canvas up with image-rendering: pixelated
if (fx.done()) removeIt();               // one-shots end on their own; fx.stop() fades a loop out
```

Several effects can share one frame. In a WebGL engine, upload the composited RGBA to a texture each frame, or
render the effect to a sprite sheet once (below) and play it like any other animation.

**Any engine** (Godot, Unity, GameMaker, Defold, LÖVE, Bevy, Construct): export sprite sheets.
`node build-tools/tools/render.mjs ice/frost-nova --sheet` writes `records/ice/frost-nova/frost-nova.png` (transparent
frames in a grid) and `frost-nova.json` (Aseprite-style frames, so Phaser's atlas loader, Godot and Unity Aseprite
importers and most tools read it; `meta.pokuFx` has fps, loop, frame size, columns and the pivot). Set the
pivot to `meta.pokuFx.pivot` (the effect's origin, e.g. the feet), import with nearest-neighbour filtering and no
compression, and play at `meta.pokuFx.fps`. Glow is baked into the sheet as color with alpha, which reads as
additive over dark scenes; for bright scenes, render a recolored version or keep the effect on a dark layer.

For the full library: `node build-tools/tools/render.mjs <category> --sheet` does a whole category.

**A hit needs a body behind it.** An effect alone looks like a sticker. Effects with a character carry an `act`: when the body winds
up, when to freeze, how the target reacts. Use it whichever way the game is built:

- With the stock character: `createAct(slash, { x, y })` instead of `createFx`. `act.update(dt)`, `act.draw(frame)`, and throw the
  picture by `act.shake`. It holds still by itself during a freeze. `node build-tools/tools/act.mjs <id> --sheet` bakes the lot into a sprite sheet.
- With the game's own character: read the timing, `slash.act` or `meta.pokuFx.act` in a sheet's JSON (`windup`, `recovery`, `hits`
  with `t` and `freeze`). Play the character's attack animation `windup` seconds before the effect, and at each hit stop updating
  everything, effect and characters both, for `freeze` seconds. Host-side hit-stop works on any effect, with or without an act.

`src/fx/moves/` has whole attacks chained from the effects, wind-up to recovery: start there when someone asks for a move, not an effect.

## 3. Make a new one

Read `docs/AUTHORING.md` first: it is the contract (meta, `draw(p, t, o)` for pure effects or `create(o)` for
simulated ones, local coordinates, seamless loops, ending empty), the toolkit, the painter API and the quality bar.
Read `docs/GENERATION_QUALITY.md` for the first-generation layer plan and `createCinematicParticles2D`.
For supported fire/energy dash, burst or plume requests, prefer `new.mjs --material <fire|energy>
--action <dash|burst|plume> [--response <burst|dissipate>]` (exact Korean aliases are documented).
For a finite falling water flow and spreading pool, use `new.mjs --material water --action pour`
(or `물` / `붓기`). It is non-emissive, uses ballistic contact and rejects other water actions/loops.
For rigid ice breakup, use `new.mjs --material ice --action shatter` (or `얼음` / `파쇄`); this
creates a solid crystal divided into persistent rotating/falling cells, without recoloring fire or
adding glow. Other ice actions are rejected. See the fracture API and limits in GENERATION_QUALITY.md.
This generates a causal plan whose primary source, arrival, emitted trails and terminal response share
timing and position. Do not silently keyword-match negation, substitute a supported preset for an
unsupported creature, or present this finite vocabulary as a general text-to-effect system.
For particle-rich cinematic requests, compose the primary silhouette, source-bound flowing ribbons, detached
sparks, cooling embers and light separately from the start. Match the requested visual language; do not assume
that a sparse pixel icon, a generic burst or extra glow is a substitute for an articulated flying creature.
Unreal/Niagara-like means a visual reference, not that this CPU renderer is that engine or its fluid simulator.
Read `docs/QUALITY.md` and `docs/EFFECT_INTENT.md` too. Write a concrete intent brief before adding detail: what happened, the intended first impression and likely wrong read, dominant silhouette, source of force, direction, weight/material, cause and effect, and preparation/action/response/ending. Use a physical, stylized-physical, magic-with-rules or symbolic-ui model with explicit limits. Omit inapplicable phases with reasons rather than imposing the same impact, gravity or glow on every effect. Treat `shadow/spatial-severance` as the clean-curve, refined-particle reference,
not a style to impose on all effects. New effects should use the shared ribbon, trajectory trail, envelope,
and path-lighting helpers where appropriate. Keep the pixel palette and inspect native-size silhouettes,
impact timing, negative space, and transparency. Automated tests do not guarantee artistic quality.
For impact-bearing effects, also read `docs/IMPACT_INTERACTIONS.md`: author one contact descriptor
(time, local point, normal, material), and derive shape-specific response and optional scene feedback
from it. Review ground/target reaction, secondary collisions and settling. Do not add the same shock
ring, stone debris or screen shake to every material. Preserve reduced motion and fixed-pivot
transparent exports.
Then:

1. **Say it in one line** with art direction: what it is, how it moves, its palette, its timing. "A frost nova:
   crystals erupt in a ring from the feet outward, a white flash at the center, shards spin off, the floor stays
   frosted and fades."
2. **Find references** in the library: `node build-tools/tools/list.mjs <words>`, then read the two or three closest effect
   files and borrow their techniques (`Particles` and `Bits` in `src/core/sim.ts` for sparks, smoke and debris,
   `p.disc` for translucent volumes, `cycle` for seamless particles, `tileFbm` scrolls for flames and water). Use the local library references as the quality bar; external references are optional and require network access.
3. **Generate.** `node build-tools/tools/new.mjs <category>/<name>` gives a declared one-shot example for `fire` (plume), `ice` (shatter), `scifi` (energy dash), or `water` (pour), with its generation plan and blank `authoring/<category>/<name>.intent.json`. These examples do not interpret the name or replace an unsupported creature/action. Explicit `--material` / `--action` wins. `--cinematic` selects the generic palette-based luminous study; use `--cinematic --loop` deliberately for a generic loop in these four categories. Mapped material loops reject before writing because they are not supported. Other categories retain the generic starter. `--minimal` explicitly selects the old small learning scaffold. Replace the primary form with the requested subject before the first complete render. Fill that brief, including actual `meta.duration` and `meta.loop`, and run `node tools/effect-intent.mjs validate <id>`. For an existing effect, create the brief with `node tools/effect-intent.mjs init <id>`. When the
   direction is open, write 3 to 5 genuinely different drafts (`<name>-a.ts` .. `-e.ts`), render them all
   (`node build-tools/tools/render.mjs "<category>/<name>-*"`) and look at every contact sheet before choosing. Show the user
   the strongest two or three if they're around (`--gif` makes animations to share). Rebuild after changing source files before rendering.
4. **Look, judge, fix.** Render, open `records/<id>/contact.png`, and judge like a picky pixel artist. Fix the
   worst misread or causal problem, then render again when needed. Do not use a fixed iteration count as proof of quality. `--all` shows every frame and `--mp4` shows motion at full speed.
   Run `npm run review -- <id>` for native/zoomed, silhouette/value/background and full-speed playback evidence. Record what it actually looks like, with frame references, separately from the intent. Use `informed-self-review` unless a genuinely independent observer saw it without the label. An agent may record a visually inspected self-assessment; never invent user approval or claim tests certify meaning, physics or artistic quality. Save both the visual review and explicit intent review as described in `docs/EFFECT_INTENT.md`.
   If playback was not inspected, retain an honest provisional record and do not mark it ready.
5. **Act it out** if a character is involved: add `export const act` (see "Acts" in `docs/AUTHORING.md`), with a wind-up before t = 0,
   a pose change on the release frame, a freeze on contact and a recovery. `node build-tools/tools/act.mjs <id>` shows consecutive 12 fps steps:
   judge motion from those and from `--mp4`, not from a contact sheet's samples.
6. **Check.** `node build-tools/tools/check.mjs <id>` catches drawing outside the canvas, one-shots that don't end empty,
   loop seams, unseeded randomness and slow frames, and in an act: keys out of order, unknown pose fields and hands
   that teleport. Fix until it passes clean. Delete the drafts you didn't keep.

What to look for, and the usual fix:

| you see | fix |
|---|---|
| it reads as mush at 1x | fewer colors, a clear silhouette, one focal point, bigger shapes |
| speckle: lone noise pixels inside shapes | threshold noise less, quantize with `at()`, no noise on small shapes |
| floaty, no punch | fast in, slow out (`ease.outQuart`/`outExpo`), a 1 to 2 frame white hero frame, shorter total time |
| stiff or mechanical | vary every particle (size, speed, delay, life), add secondary motion (sparks, smoke, debris) |
| washed out | less glow (k 0.2 to 0.5), darker edge steps, keep white for the hottest core only |
| flat | light from one side: brighter top-left, darker bottom-right step; a darker ramp step at the base |
| smooth gradients, vector look | hard ramp steps in color; softness only in light and in translucent smoke |
| a checkerboard where smoke should be | `SMOKE`, `VAPOUR` or `DUST` particles, or `p.disc`: truly translucent, lit on top |
| seam when a loop wraps | `cycle`, `loopNoise(phase)`, whole-cell `tileNoise` scrolls, `sin(phase * TAU * n)` |
| a one-shot that pops off | let it shrink, dither out or fall away before t = duration |
| a great effect on a dead character | give it an act: wind-up, release pose, freeze on contact, a target that reacts, recovery |
| the act feels weightless | a wind-up the opposite way to the blow, a longer freeze (up to 0.2 s), a bigger silhouette change, shake |
| the hit lands out of sync | move the hit key to the effect's own constant, not to a time you eyeballed |
| he holds the weapon badly | keep a bend in the elbow, shafts in front of the chest; on a swing the blade lags the hand; arms reach about 15 px and don't stretch, so step the body in |
| his arms cross or the pose looks flat | he faces three-quarters towards us: for open arms the near hand goes left (`fx < 0`), far hand right, with `turn: 1`; `yaw` really turns him |

Directional effects face right, ground effects stand on y = 0, actor effects wrap `o.actor` (a 24 x 38 stock
character's mask and pixels), and nothing uses `Math.random`. Generic motifs are fine; never recreate a specific game's
sprites, characters or logos.

## 4. Native code instead of JS

If the game can't run JS and a sprite sheet isn't enough (an effect that follows a moving target, or needs
per-instance colors at runtime), port the effect. Pure effects are a function of time; simulated ones step the particles in
`src/core/sim.ts`. Keep the two-buffer idea, the 4x4 Bayer threshold for dithered alpha and the palette ramp lookups.
Render the JS original and your port side by side to check they match.

The core, all effects, gallery and CLI are TypeScript sources. Build before use; after creating or changing a `.ts` effect, rebuild before rendering. The gallery and CLI search support Korean and English; Korean text falls back to a system font. For engine-native work consult `docs/NATIVE_MIGRATION.md`; do not claim a native runtime exists.


## Share a result

When the user requests public sharing, use the local checkout and run `npm run build` followed by `npm run share -- <category>/<effect>`. The command renders a transparent PNG and its Poku JSON in a new `records/share/` folder, validates the current site size and animation limits, and prints absolute file paths and the sharing page. It does not publish or log in.

Open https://poku-pixel-fx.stankjedi.chatgpt.site/shared, sign in with ChatGPT if needed, and follow the page's upload flow. Select the matching PNG and JSON together in the sharing form, fill any required title and tags, and submit after the uploader confirms the rights declaration. For multiple works, the bulk section accepts matching PNG and JSON filenames. Use the user's requested artwork and comply with the browser's upload and confirmation rules. Never manufacture identity headers, obtain or copy credentials, or assert the user's legal rights without their confirmation. Check the gallery for a success message and the resulting entry before claiming a publication. The site may enforce per-account quotas. Preserve LICENSE, NOTICE, and third-party copyright and permission notices when redistributing the software.
