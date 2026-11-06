# poku-pixel-fx.

> **원작 및 출처:** POKU Pixel FX는 [Patch의 PixelFX](https://github.com/patch-gg/pixelfx)를 한글화하고 TypeScript로 변환·확장한 오픈소스 포크(파생 버전)입니다. 원본 프로젝트와 별도로 운영하는 독립 저장소이며, GitHub의 포크 연결은 설정되어 있지 않습니다. 원본의 MIT 라이선스에는 Patch와 Hugo Duprez의 저작권이 명시되어 있습니다. Hugo Duprez의 Sprite Fusion 이펙트에서 가져와 적용한 부분의 출처 및 제3자 라이선스는 [NOTICE.md](NOTICE.md)와 [LICENSE](LICENSE)를 확인하세요.

> **Origin:** POKU Pixel FX is a Korean-localized, TypeScript-based open-source fork/derivative of [PixelFX by Patch](https://github.com/patch-gg/pixelfx). This repository is maintained separately and is not linked as a GitHub network fork. The upstream MIT license credits Patch and Hugo Duprez; see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md) for copyright and third-party notices.

## Pixel Art Lab · 곡선 형태와 세밀한 재질

**긴 직선 윤곽과 넓은 단색 면에만 의존하지 않고** 곡선 실루엣, 높이 기반 명암,
여러 크기의 재질 무늬, 가장자리 마모를 함께 작성하는 도구를 추가했습니다.
돌·금속·나무·천·수정 재질, 영역 선택과 디테일 보호, 재질 레이어,
네이티브 PNG·프로젝트 저장/열기를 제공합니다. 기존 274개 이펙트의 원화와 기본 동작은 변경하지 않습니다.

`npm ci && npm run build && npm run gallery` 후 **Pixel Art Lab** 링크 또는
`http://127.0.0.1:8080/gallery/pixel-art-lab.html`을 엽니다.
[사용법·API·표현 범위](docs/PIXEL_ART_LAB.md)를 읽거나
`npm run preview:pixel-art`로 같은 입력 형태의 재질 비교 이미지를 생성하세요.

## 0.5 · 시퀀스 제작 · 타일 GPU 렌더링 · 도트 스타일

여러 이펙트를 시간표로 합치는 **시퀀스 편집**, 동작과 접촉을 함께 바꾸는 길이 조정,
**16×16 GPU 타일 분류**, 직접 GPU 도형을 확인하는 **GPU Lab**, 장비 원화 동기화,
색상 디더와 편집 가능한 팔레트, 브라우저 Atlas 중복 제거·가장자리 확장을 추가했습니다.
상세 내용과 실제 구현 범위는 [0.5 개선 보고서](docs/PRODUCTION_UPGRADE_2026-11-06.md),
[시퀀스 사용법](docs/SEQUENCES.md)을 참고하세요.

`npm run build && npm run gallery` 후 Studio의 **현재 효과로 시퀀스 제작** 또는
`http://127.0.0.1:8080/gallery/gpu-lab.html`을 엽니다.

```sh
npm run render -- --project examples/projects/charged-impact.poku-project.json --bundle --trim --deduplicate --padding 2 --extrude 1
```

## 0.4에서 이어지는 Studio · GPU · CharacterAsset

0.4는 **저장 가능한 제작 프로젝트**를 중심으로 편집·검토·게임 자산 출력을 연결합니다. [Studio 사용법](docs/STUDIO.md), [80개 개선 항목의 구현과 검증 범위](docs/IMPROVEMENT_IMPLEMENTATION.md)를 함께 읽으세요.

```sh
npm ci
npm run build
npm run gallery
```

`http://127.0.0.1:8080/gallery/studio.html`에서 투척 검·검격 리본·번개·폭발·불꽃·포털 템플릿을 편집하거나 캐릭터를 만듭니다. 프로젝트 파일은 seed, 파라미터, 레이어, 시간 곡선, 팔레트 정책, 프레임별 픽셀 수정, 캐릭터와 장비를 보존합니다.

```sh
npm run render -- --project examples/projects/thrown-blade.poku-project.json --bundle --trim --deduplicate
npm run render -- --project examples/projects/wayfarer-sword.poku-project.json --bundle
npm run render -- --project examples/projects/frost-native.poku-project.json --bundle
```

- [WebGPU / native wgpu](docs/GPU_RENDERING.md): GPU HDR·bloom·tone mapping, DrawIR 배치 래스터, 장식 입자, 동일 WGSL을 사용하는 Rust 참조 플레이어. 기존 CPU 및 WebGL2 경로도 유지됩니다.
- [캐릭터](docs/CHARACTER_STUDIO.md): 원본 4종, 확장 동작, 장비·방향성 소켓, 저장되는 cel/의미 마스크, root motion·이벤트와 초상화 identity.
- [픽셀 도구](docs/PIXEL_TOOLKIT.md): 역변환 셀 래스터, indexed palette, 좌표 기준 디더, 선택적 외곽선, authored AA/subpixel, 재질 ramp, 진단과 12개 예제.
- [게임 자산](docs/ASSET_EXPORT.md): 투명 RGBA + linear HDR, 다중 atlas, trim·dedup, 시간·pivot·소켓·해시, Aseprite와 공유 사이트 metadata 보존.

새 GPU 경로는 opt-in입니다. 실제 그래픽카드별 성능은 별도 측정 대상이며, 저장소의 검증 기록은 사용한 어댑터와 확인 범위를 명시합니다. 원화 예제의 생성, 실제 시각 관찰, 사용자 승인은 각각 기록됩니다.

## 한국어 빠른 시작

공개 사이트의 소스와 실행·배포 안내는 [site/README.md](site/README.md)에 있습니다. 라이브러리 갤러리와 공유 사이트는 별도 앱이며, 공유 사이트에는 최신순·높은 별점순과 공개 작품 기능이 포함되어 있습니다.

Node.js 20 이상과 로컬 개발 의존성을 준비한 뒤 `npm run build`를 실행합니다. `npm run gallery`를 실행하고 브라우저에서 `http://127.0.0.1:8080/gallery/`를 열면 한국어로 이펙트를 검색하고 미리 볼 수 있습니다. 상세 화면에서 스프라이트 시트를 생성한 뒤 PNG 시트 또는 움직이는 WebP 애니메이션으로 내려받을 수 있습니다. WebP는 상세 미리보기의 설정을 반영하며 브라우저 압축으로 색상이 달라질 수 있습니다. 정확한 색상이 필요하면 PNG를 사용하세요.

사이트의 기본 효과 파일을 현재 라이브러리 코드와 맞추려면 저장소 루트에서 `npm run sync:site`를 실행합니다. 공유 사이트는 공유 원본을 별도 게시물로 표시하므로 해당 원본의 로컬 라이브러리 복사본을 기본 효과 목록에서 제외합니다. 로컬 라이브러리 갤러리에서는 두 복사본을 볼 수 있습니다.

- `node build-tools/tools/list.mjs 횃불`: 한글 또는 영어로 이펙트 검색
- `node build-tools/tools/render.mjs fire/torch --sheet`: PNG 스프라이트 시트와 JSON 생성
- `node build-tools/tools/new.mjs fire/my-effect`: 새 TypeScript 이펙트를 만들고 목록에 등록. 다시 빌드한 뒤 사용
- `node build-tools/tools/check.mjs fire/torch`: 이펙트의 품질 및 동작 검사

**Aseprite 편집 연동:** `npm run aseprite -- export fire/torch --out ./aseprite-work/torch`로 투명 PNG/JSON을 만들고, 명시한 Aseprite 실행 파일로 편집용 문서를 생성하거나 편집 결과를 엔진으로 가져올 수 있습니다. 가변 프레임 시간·투명도·태그·slice 소켓을 유지합니다. `--layers`는 색상 레이어와 HDR sidecar를 분리하고, 편집 중 유지·수정·삭제한 발광을 명시적으로 다시 가져옵니다. 기본 평면 내보내기도 계속 사용할 수 있습니다. 실제 앱 실행 검증 범위와 사용법은 [Aseprite 연결 문서](docs/ASEPRITE_BRIDGE.md)를 확인하세요.

**선택형 GPU 합성:** 상세 미리보기의 “GPU 합성 시도” 또는 `FrameRenderer(canvas, { backend: "auto" })`로 WebGL2 색·광원 합성을 사용할 수 있습니다. 픽셀 작성·시뮬레이션은 CPU이며 GPU가 불가하면 이유와 함께 CPU로 돌아갑니다. 실제 장치 검증 범위와 제약은 [GPU 합성 문서](docs/GPU_COMPOSITING.md)를 확인하세요.

**새 선택형 시네마틱 엔진:** 기존 2D/3D 이펙트의 기본 경로를 보존하면서, 선형 RGB 기반 HDR 발광 누적, 멀티스케일 블룸, ACES 톤매핑, 월드 좌표 3D 포인트 광원 및 SSAO를 추가했습니다. `enableHDRLight(frame)`로 8비트 포화 없는 발광을 활성화하고, `CinematicCompositor`로 픽셀 경계를 보존하면서 후처리할 수 있습니다. 3D 프리뷰의 **CINEMATIC** 스위치에서 기존 출력과 비교할 수 있습니다. 사용법과 제약은 [시네마틱 렌더링 문서](docs/CINEMATIC_RENDERER.md)를 참고하세요.

GIF·MP4 미리보기에는 로컬 ffmpeg가 필요합니다. 갤러리의 한글은 시스템 글꼴 대체를 사용하며 Poku Pixel 글꼴은 영문·숫자·기본 기호를 제공합니다. 이펙트 식별자와 코드 API, 내보낸 원본 메타데이터는 호환성을 위해 그대로 유지합니다.


**<!-- count -->274<!-- /count --> pixel art effects and animations, every one a small piece of code.** Fire,
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
| **fire** | 16 | brazier, campfire, candle, convection plume, fire breath, fire ring… |
| **explosions** | 13 | barrel explosion, big explosion, cartoon pow, dirt explosion, firework burst, firework rocket… |
| **water** | 14 | abyssal maelstrom, bubbles, capillary crown, drip, fountain, geyser… |
| **ice** | 11 | blizzard vortex, freeze, frost beam, frost breath, frost nova, ice crystal… |
| **lightning** | 13 | ball lightning, chain lightning, charge up, electrified, focused arc, ion stormburst… |
| **sci-fi** | 12 | emp blast, energy core, force field, glitch, hologram, jetpack… |
| **melee** | 14 | claw swipe, dagger flurry, double slash, hammer smash, heavy cleave, scythe reap… |
| **impacts** | 12 | blunt hit, bullet impact, critical hit, glass shatter, ground slam, heavy landing… |
| **projectiles** | 15 | arrow, bullet tracer, cannon shot, energy disc, signal flare, homing missile… |
| **spawn & death** | 10 | coin drop, disintegrate, dissolve burn, egg hatch, poof, respawn beam… |
| **arcane** | 18 | arcane beam, arcane missiles, arcane orb, blink in, blink out, celestial supernova… |
| **holy** | 11 | blessing, divine shield, feather burst, halo, heal, healing ring… |
| **shadow** | 15 | abyssal fracture, black dragon slash, black hole, curse, dark explosion, eclipse… |
| **status** | 13 | bleeding, burning, charmed, confused, cursed, frozen… |
| **nature** | 16 | acid splash, boulder, earth spike, emerald fireflies, healing bloom, leaf storm… |
| **weather** | 14 | aurora, blizzard, cherry blossoms, clouds, crosswind gust, falling leaves… |
| **ui** | 12 | achievement, coin collect, combo counter, confetti, countdown, crit number… |
| **pickups** | 11 | chest open, coin spin, collect burst, crystal shard, gem spin, heart pickup… |
| **transitions** | 10 | blinds, burn away, crt off, diamond wipe, glitch wipe, iris… |
| **critters** | 12 | bat, bird, butterfly, eyeball, fish school, flying skull… |
<!-- /catalog -->

Every effect is a file in `src/fx/<category>/<name>.ts`. The [catalog](docs/CATALOG.md) lists them all.

## 3D Pixel FX Engine

The optional **3D VFX engine** lives in `src/3d/` without changing the existing 2D catalog. It uses real XYZ camera projection, z-buffered pixel triangles, solid procedural crystals, 3D particles, a fixed 120 Hz timeline, seeded randomness, Bayer dither and a separate additive-light buffer. Thirteen effects ship, including **Frost Nova 3D**, **Arc Slash 3D**, **Black Hole 3D**, fire, water, wind, lightning, laser and shield scenes. A common saved render profile keeps camera, lighting and export settings consistent.

- Run `npm run build && npm run gallery` and open [the 3D preview](gallery/3d.html) (live URL: `http://127.0.0.1:8080/gallery/3d.html`). Orbit the camera, adjust pixel size/glow and download a PNG snapshot.
- Export contact sheets with `npm run render:3d -- frost --frames 24` or `npm run render:3d -- slash --frames 24`, or `npm run render:3d -- blackhole --frames 32`.
- **Energy Shield 3D** adds a curved energy membrane, three local impacts and traveling geodesic ripples. Run `npm run render:3d:gif -- shield`, or see [the shield surface toolkit](docs/ENERGY_SHIELD_3D.md).
- **Crown Splash 3D** adds non-emissive liquid sheets, rim-attached droplets and impact ripples. Run `npm run render:3d:gif -- water`, or see [the liquid toolkit](docs/LIQUID_3D.md).
- Use `import { createFx3D, Painter3D, createFrame3D, compositeFrame3D } from "poku-pixel-fx/3d"`, and read [3D authoring and API docs](docs/3D_VFX.md).
- Validate with `npm run test:3d` after building.

The first implementation is a **dependency-free CPU software rasterizer** suitable for artistic iteration and modest effects, not a hardware-accelerated WebGL/WebGPU engine. Pre-bake dense effects or implement a GPU renderer when large simultaneous counts are required.

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

Use Node 20 or newer and run `npm run build` first. Run `node build-tools/tools/render.mjs fire/torch --sheet` to export locally, or `node build-tools/tools/serve.mjs` for the gallery on 127.0.0.1. GIF/MP4 export requires a locally installed ffmpeg. Building the TypeScript sources and gallery requires the local development dependencies, including TypeScript and esbuild; the compiled effect runtime has no package dependencies. The Poku Pixel font supports ASCII letters, digits and common punctuation; other characters use system fallback fonts.

The 2D GIF/MP4 exporter stages one native-size RGBA sequence in the system temporary directory and lets ffmpeg scale and repeat it. Temporary disk use is `width × height × 4 × frame count` bytes, plus a small GIF palette, regardless of export scale or loop count; staged files are removed after success or failure. It avoids keeping enlarged, repeated raw frames in memory. After building, run `npm run test:export` to check export behavior; real GIF/MP4 checks require both ffmpeg and ffprobe.

| Status | Item |
|---|---|
| DONE | Local effect library, locally served gallery, and original pixel font |
| DONE | Remove runtime Google Fonts and bind the local server to loopback |
| TODO | Review upstream changes manually before adopting them |

## TypeScript and native migration

The migration targets TypeScript effect sources in `src/fx/<category>/<name>.ts`, TypeScript core sources in `src/core/`, and `.mts` CLI sources in `tools/`. Run `npm run build` before using the package or CLI; emitted runtime modules and declarations are in `build/`, and compiled CLI entry points are under `build-tools/tools/`. Relative source imports retain `.js` specifiers to resolve to the compiled JavaScript modules. Rebuild after editing or creating an effect before rendering it.

The core, registered effects, gallery and CLI tools are TypeScript sources. The 0.4 implementation adds a tested headless Rust/wgpu renderer and exported-asset player in `native/`. The full procedural TypeScript catalog is not automatically ported to native code. Current verification and platform limits are recorded in [the implementation ledger](docs/IMPROVEMENT_IMPLEMENTATION.md) and [native integration guide](docs/NATIVE_MIGRATION.md).

Sprite-sheet metadata uses `meta.pokuFx`; consumers of older sheets need to migrate their metadata reader.

| Status | Item |
|---|---|
| DONE | Local package name and original pixel font |
| DONE | Convert and type-check the TypeScript core, 244 effects, gallery and CLI |
| DONE | Verify sampled reference output, package import, CLI exports and representative gallery flow |
| DONE | Localize gallery, effect names, descriptions, tags and CLI messages in Korean |
| REFERENCE | Native Rust/wgpu asset-player library and capture CLI use the shared DrawIR/WGSL; host-game/window integration remains application-specific |
| VERIFIED SCOPE | Software-adapter parity and native asset contracts are recorded in docs/GPU_RENDERING.md; physical GPU/game integration is a separate target |

## 스킬 설치

Codex에서 저장소의 `skills/poku-pixel-fx`를 설치하고, 이 저장소를 로컬에 복제한 뒤 `npm ci`와 `npm run build`를 실행하세요.

## 공개 갤러리에서 공유

[POKU Pixel FX 사이트](https://poku-pixel-fx.stankjedi.chatgpt.site/)에서 이펙트를 확인하고, [공유 갤러리](https://poku-pixel-fx.stankjedi.chatgpt.site/shared)에 ChatGPT로 로그인해 직접 만든 PNG 또는 게시 권한이 있는 스프라이트 시트를 올릴 수 있습니다. 게시 전 권리와 책임에 동의해야 합니다. PNG는 최대 5 MiB, 가로·세로 각각 2048픽셀입니다. 서버는 형식과 크기를 검사하며 픽셀 아트 여부나 게시 권한을 자동으로 보증하지 않습니다. 문제가 있는 게시물은 공유 화면의 신고 링크를 이용해 주세요.


## 에이전트에서 공유 준비

저장소를 복제하고 `npm ci`, `npm run build`를 실행한 다음 `npm run share -- fire/torch`처럼 이펙트 ID를 지정하세요. 명령이 새로운 `records/share/` 폴더에 재생 가능한 PNG와 JSON을 만들고 파일 경로를 출력합니다. [공유 페이지](https://poku-pixel-fx.stankjedi.chatgpt.site/shared)에서 로그인하고 같은 이름의 PNG와 JSON을 함께 선택해 권리 확인 후 게시하세요. 스킬의 공유 절차를 따르는 에이전트도 동일하게 사용할 수 있습니다. 명령은 자동으로 게시하거나 로그인하지 않습니다.

## 이펙트 카탈로그

에이전트나 도구는 빌드 후 `npm run catalog -- --output catalog.json`을 실행해 등록된 기본 이펙트의 식별자, 한글·영어 이름과 설명, 태그, 재생 및 프레임 정보를 JSON으로 얻을 수 있습니다. 이 정적 카탈로그에는 공유 갤러리 게시물이 포함되지 않습니다.

### Shared rendering quality

See [the quality standard](docs/QUALITY.md) for the Spatial Severance reference, connected particle trails,
pointed ribbon geometry, and once-per-pixel path lighting. New effect starters use these building blocks.
Existing simulated sparks use refined rendering by default; `createFx(effect, { particleStyle: "classic" })`
retains their previous appearance. Technical checks and visual review are both required; no automatic
setting guarantees that every effect reaches the same artistic quality.

### Dry stone fracture

`nature/rock-fracture` adds fitted sandstone breakup, heavy bouncing rubble, and low landing dust without magical glow. The reusable `fractureStone` and `rubblePath` helpers preserve geometry and support deterministic, frame-rate-independent debris. See [STONE_FRACTURE.md](docs/STONE_FRACTURE.md).

### Target-bound healing

`holy/heal` now keeps the target readable with a jade lotus, upward ribbons and one soft chest beat.
The reusable restoration field follows custom target anatomy; exported sheets retain the non-damage
application timing. See [Restoration authoring](docs/RESTORATION.md) and run
`node tools/preview-restoration.mjs` after building to review moving-target, no-glow and recolor cases.
