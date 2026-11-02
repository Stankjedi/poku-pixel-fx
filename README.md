# poku-pixel-fx.

## 한국어 빠른 시작

Node.js 18 이상과 로컬 개발 의존성을 준비한 뒤 `npm run build`를 실행합니다. `npm run gallery`를 실행하고 브라우저에서 `http://127.0.0.1:8080/gallery/`를 열면 한국어로 이펙트를 검색하고 미리 볼 수 있습니다.

- `node build-tools/tools/list.mjs 횃불`: 한글 또는 영어로 이펙트 검색
- `node build-tools/tools/render.mjs fire/torch --sheet`: PNG 스프라이트 시트와 JSON 생성
- `node build-tools/tools/new.mjs fire/my-effect`: 새 TypeScript 이펙트를 만들고 목록에 등록. 다시 빌드한 뒤 사용
- `node build-tools/tools/check.mjs fire/torch`: 이펙트의 품질 및 동작 검사

GIF·MP4 미리보기에는 로컬 ffmpeg가 필요합니다. 갤러리의 한글은 시스템 글꼴 대체를 사용하며 Poku Pixel 글꼴은 영문·숫자·기본 기호를 제공합니다. 이펙트 식별자와 코드 API, 내보낸 원본 메타데이터는 호환성을 위해 그대로 유지합니다.


**<!-- count -->244<!-- /count --> pixel art effects and animations, every one a small piece of code.** Fire,
explosions, magic, weather, UI, pickups, critters and more. Play them live, recolor and mirror them, drop them into
a browser game, or export sprite sheets for any engine. Plus a Claude Code skill that makes new ones the way a
picky pixel artist would: draft, render, look, refine.

Every effect that involves a character is **acted out**: he winds up, lets go, freezes on contact and recovers, and a
target takes the hit. Twelve whole moves chain the effects into attacks from wind-up to recovery.

**Run the gallery locally:** `node build-tools/tools/serve.mjs` · [catalog](docs/CATALOG.md) · [acting](#acting) ·
[the skill](#the-skill) · [make your own](#make-your-own) · [how it works](#how-it-works)

The method is [Hugo Duprez](https://x.com/HugoDuprez)'s, from [How to make (good) pixel art effects with
Claude](https://www.spritefusion.com/blog/how-to-make-good-pixel-art-effects-with-claude): code is clay, trust your
eyes, feed your references. His [open-source effects](https://www.spritefusion.com/pixel-art-vfx) at Sprite Fusion
set the bar, and `src/core/sim.ts` and the effects that say so at the top adapt his code. This repo is our take on
the idea at library scale, with a skill to keep going.

## what's in it.

<!-- catalog -->
| category | effects | some of them |
|---|---|---|
| **moves** | 12 | arrow shot, dash strike, earth stomp, fireball throw, ground pound, holy smite… |
| **fire** | 12 | brazier, campfire, candle, fire breath, fire ring, fire tornado… |
| **explosions** | 12 | barrel explosion, big explosion, cartoon pow, dirt explosion, firework burst, firework rocket… |
| **water** | 12 | bubbles, drip, fountain, geyser, rain splash, ripples… |
| **ice** | 10 | blizzard vortex, freeze, frost breath, frost nova, ice crystal, ice lance… |
| **lightning** | 11 | ball lightning, chain lightning, charge up, electrified, lightning strike, plasma ball… |
| **sci-fi** | 12 | emp blast, energy core, force field, glitch, hologram, jetpack… |
| **melee** | 12 | claw swipe, dagger flurry, double slash, hammer smash, heavy cleave, scythe reap… |
| **impacts** | 11 | blunt hit, bullet impact, critical hit, ground slam, heavy landing, hit flash… |
| **projectiles** | 13 | arrow, bullet tracer, cannon shot, energy disc, signal flare, homing missile… |
| **spawn & death** | 10 | coin drop, disintegrate, dissolve burn, egg hatch, poof, respawn beam… |
| **arcane** | 12 | arcane beam, arcane missiles, arcane orb, blink in, blink out, magic circle cast… |
| **holy** | 10 | blessing, divine shield, feather burst, halo, heal, healing ring… |
| **shadow** | 12 | black hole, curse, dark explosion, eclipse, grasping hands, hex sigil… |
| **status** | 13 | bleeding, burning, charmed, confused, cursed, frozen… |
| **nature** | 13 | acid splash, boulder, earth spike, healing bloom, leaf storm, poison cloud… |
| **weather** | 12 | aurora, blizzard, cherry blossoms, clouds, falling leaves, fireflies… |
| **ui** | 12 | achievement, coin collect, combo counter, confetti, countdown, crit number… |
| **pickups** | 11 | chest open, coin spin, collect burst, crystal shard, gem spin, heart pickup… |
| **transitions** | 10 | blinds, burn away, crt off, diamond wipe, glitch wipe, iris… |
| **critters** | 12 | bat, bird, butterfly, eyeball, fish school, flying skull… |
<!-- /catalog -->

Every effect is a file in `src/fx/<category>/<name>.ts`. The [catalog](docs/CATALOG.md) lists them all.

## use one.

**In a browser game** (canvas, Phaser, PixiJS, Kaplay, three.js), use the code. No dependencies.

```js
import { createFrame, clearFrame, createFx, composite } from "poku-pixel-fx";
import * as frostNova from "poku-pixel-fx/fx/ice/frost-nova";

const frame = createFrame(320, 180);                   // your game's pixel resolution
const img = new ImageData(320, 180);
const fx = createFx(frostNova, { x: 160, y: 140 });   // also: flip, angle, seed, palette, light...

function tick(dt) {
  fx.update(dt);
  clearFrame(frame);
  fx.draw(frame, "back");                              // behind characters
  drawCharacters();
  fx.draw(frame, "front");
  composite(frame, img.data, backgroundColor);         // color, then light added on top
  ctx.putImageData(img, 0, 0);                         // scale up with image-rendering: pixelated
}
```

Use this local checkout as a dependency, or copy `src/core` and the effects you want.

**In any engine** (Godot, Unity, GameMaker, Defold, LÖVE, Bevy), use sprite sheets:

```bash
node build-tools/tools/render.mjs ice/frost-nova --sheet
```

That writes a transparent PNG of every frame in a grid and an Aseprite-style JSON (frame rects, durations, and
`meta.pokuFx` with fps, loop, columns and the pivot). Phaser's atlas loader and the Aseprite importers for Godot
and Unity read it. `node build-tools/tools/sheets.mjs` exports the whole library to `sheets/`.

Any effect takes a `palette` (a dark-to-bright ramp of hex colors), so a fire can burn blue and a heal can glow
pink without touching its code:

```bash
node build-tools/tools/render.mjs fire/torch --gif --opts '{"palette": ["#102","#215","#43a","#8cf","#cff","#fff"]}'
```

## acting.

An effect on its own looks like a sticker. What sells a hit is the body around it: the wind-up that says something is
coming, the freeze on contact, the target rocking back, the recovery. So the 61 effects with a character, and the 12
moves, say what the body does and when:

```js
export const act = {
  target: { x: 58 },
  poses: [
    [-0.55, GUARD],            // he starts before the effect does (t = 0 is the effect's first frame)
    [-0.3, WIND_UP],
    [0, CUT, "snap"],          // "snap" holds the last pose and jumps on the key
    [0.06, FOLLOW_THROUGH, "snap"],
    [0.86, GUARD],
  ],
  hits: [{ t: 0.06, stop: 0.14, shake: 0.18, amp: 2, push: 2.8, straw: 18 }],   // freeze for 0.14 s on contact
};
```

**Play the whole thing**, character and target included, by swapping `createFx` for `createAct`:

```js
import { createFrame, clearFrame, createAct, composite } from "poku-pixel-fx";
import * as slash from "poku-pixel-fx/fx/melee/sword-slash";

const act = createAct(slash, { x: 80, y: 140 });

function tick(dt) {
  act.update(dt);                                  // holds still by itself during a freeze
  clearFrame(frame);
  act.draw(frame);                                 // { body: false } and { target: false } leave them out
  composite(frame, img.data, backgroundColor);
  const [sx, sy] = act.shake;                      // throw the picture this far
  ctx.putImageData(img, sx, sy);
}
```

**Got your own character?** Effect ids haven't changed and a sprite sheet is still the effect alone, so existing games
keep working. (Effects drawn on the body paint the stock dummy, so regenerate those if you ship them.) The timing is plain data: read `slash.act`, or `meta.pokuFx.act` in a sprite sheet's
JSON (`windup`, `recovery`, `hits` with `t` and `freeze`, `poses`). Start your own wind-up animation that long before the effect, and
stop updating everything for `freeze` seconds at each hit.

Effects drawn on the body (frost, poison, a scan line) are written against the standing character and follow him
wherever he goes: each pixel of a pose knows which pixel of the standing body it came from. `node build-tools/tools/act.mjs
<id> --sheet` bakes a whole act, character included, into a sprite sheet.

The body is yours to use too: `skeleton(pose)` gives you every joint of a pose in 3D, to hang your own things on, and
`posedParts(pose)` gives you each part drawn on its own.

## the skill.

The `poku-pixel-fx` skill teaches Claude Code to find, use, export and make effects. Use the locally installed skill and this library. Then ask for what you want:

- "Add a frost nova to my mage's ultimate."
- "Make five takes on a coin pickup sparkle and show me the best two."
- "Export the fire and explosions categories as sprite sheets for Godot."
- "This hit effect feels floaty. Make it punchier."
- "Give this spell a wind-up and make the enemy react to it."

## make your own.

```bash
node build-tools/tools/new.mjs arcane/my-spell       # a working starting point (add --loop for a loop)
npm run build                                # compile the newly created source
node build-tools/tools/render.mjs arcane/my-spell    # records/arcane/my-spell/contact.png: look at it
node build-tools/tools/check.mjs arcane/my-spell     # spills, seams, unseeded randomness, slow frames
```

Then go round: look at the contact sheet, fix the worst thing, render again. `--gif` and `--mp4` show the motion,
`--all` shows every frame. `node build-tools/tools/act.mjs arcane/my-spell` shows an act as consecutive 12 fps steps, because motion
bugs don't show in samples. [docs/AUTHORING.md](docs/AUTHORING.md) has the contract, the drawing API and the quality
bar. `node build-tools/tools/serve.mjs` runs the gallery locally with your effects in it.

## how it works.

- **Two kinds of effect, no images.** Pure effects export `draw(p, t, o)`, the frame at `t` seconds from `t` alone, so
  loops tile with no seam. Simulated effects export `create(o)` and step real particles, debris and lights at 120 Hz,
  so sparks bounce and smoke rolls the same at any frame rate.
- **Two buffers.** `color` takes pixels: opaque, dithered or truly translucent. `light` takes additive glow, added on
  top. Hot things look hot because of the light buffer.
- **Seeded everything.** Every random number comes from the effect's seed, so frame 40 is the same every time.
- **Local space.** Effects draw around their own origin; the painter places, mirrors and rotates them. Directional
  effects face right. A 24×38 stock character stands in for status effects, auras and hits.
- **A real skeleton, drawn down to pixels.** The grey dummy is neutral on purpose, so the eye goes to the move and any effect's
  colors read on it. He's a 3D skeleton with fixed-length bones, pelvis to spine to shoulders, rendered in a few flat tones with one clean
  ink line, the way Dead Cells makes its sprites. So he can twist, bend and really turn round, and depth decides what's in front. Poses hold on 12 fps
  steps, the way hand-drawn sprites do, while particles run at full rate.
- **Same frame shape as Sprite Fusion's VFX** (`{ w, h, ox, oy, color, light }`), so both libraries can draw into
  one frame.

## license.

MIT, code and effects. Use them in anything, commercial included. Parts are adapted from Hugo Duprez's MIT effects
and from Hollow Crown's MIT source, and the original Poku Pixel gallery font are MIT licensed: see
[NOTICE.md](NOTICE.md).

Made by [Patch](https://patch.gg).

## Local independent use

Use Node 18 or newer and run `npm run build` first. Run `node build-tools/tools/render.mjs fire/torch --sheet` to export locally, or `node build-tools/tools/serve.mjs` for the gallery on 127.0.0.1. GIF/MP4 export requires a locally installed ffmpeg. Building the TypeScript sources and gallery requires the local development dependencies, including TypeScript and esbuild; the compiled effect runtime has no package dependencies. The Poku Pixel font supports ASCII letters, digits and common punctuation; other characters use system fallback fonts.

| Status | Item |
|---|---|
| DONE | Local effect library, locally served gallery, and original pixel font |
| DONE | Remove runtime Google Fonts and bind the local server to loopback |
| TODO | Review upstream changes manually before adopting them |

## TypeScript and native migration

The migration targets TypeScript effect sources in `src/fx/<category>/<name>.ts`, TypeScript core sources in `src/core/`, and `.mts` CLI sources in `tools/`. Run `npm run build` before using the package or CLI; emitted runtime modules and declarations are in `build/`, and compiled CLI entry points are under `build-tools/tools/`. Relative source imports retain `.js` specifiers to resolve to the compiled JavaScript modules. Rebuild after editing or creating an effect before rendering it.

The core, all 244 effects, the gallery and CLI tools are TypeScript sources. Strict builds and a packaged-library import passed. Reference rendering compared every effect at 3 fps and representative acted effects across 14 categories; it does not prove every frame or engine integration. The native engine runtime remains a separate future task; see `docs/NATIVE_MIGRATION.md`.

Sprite-sheet metadata uses `meta.pokuFx`; consumers of older sheets need to migrate their metadata reader.

| Status | Item |
|---|---|
| DONE | Local package name and original pixel font |
| DONE | Convert and type-check the TypeScript core, 244 effects, gallery and CLI |
| DONE | Verify sampled reference output, package import, CLI exports and representative gallery flow |
| DONE | Localize gallery, effect names, descriptions, tags and CLI messages in Korean |
| TODO | Define and implement a native engine ABI after choosing engine and target platforms |
| TODO | Compare native output against reference frames and verify engine integration |

## 스킬 설치

Codex에서 저장소의 `skills/poku-pixel-fx`를 설치하고, 이 저장소를 로컬에 복제한 뒤 `npm ci`와 `npm run build`를 실행하세요.

## 공개 갤러리에서 공유

[POKU Pixel FX 사이트](https://poku-pixel-fx.stankjedi.chatgpt.site/)에서 이펙트를 확인하고, [공유 갤러리](https://poku-pixel-fx.stankjedi.chatgpt.site/shared)에 ChatGPT로 로그인해 직접 만든 PNG 또는 게시 권한이 있는 스프라이트 시트를 올릴 수 있습니다. 게시 전 권리와 책임에 동의해야 합니다. PNG는 최대 5 MiB, 가로·세로 각각 2048픽셀입니다. 서버는 형식과 크기를 검사하며 픽셀 아트 여부나 게시 권한을 자동으로 보증하지 않습니다. 문제가 있는 게시물은 공유 화면의 신고 링크를 이용해 주세요.


## 에이전트에서 공유 준비

저장소를 복제하고 `npm ci`, `npm run build`를 실행한 다음 `npm run share -- fire/torch`처럼 이펙트 ID를 지정하세요. 명령이 새로운 `records/share/` 폴더에 재생 가능한 PNG와 JSON을 만들고 파일 경로를 출력합니다. [공유 페이지](https://poku-pixel-fx.stankjedi.chatgpt.site/shared)에서 로그인하고 같은 이름의 PNG와 JSON을 함께 선택해 권리 확인 후 게시하세요. 스킬의 공유 절차를 따르는 에이전트도 동일하게 사용할 수 있습니다. 명령은 자동으로 게시하거나 로그인하지 않습니다.
