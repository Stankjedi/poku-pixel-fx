# 시간 큐로 조합하는 이펙트 프로젝트

`kind: "sequence"` 프로젝트는 기존 카탈로그, 편집한 레시피, 캐릭터 자산을 **시작 시간과 위치가 있는 여러 큐**로 합칩니다. 이 조합은 프로젝트 JSON에 저장하며, Studio 미리보기·CLI 렌더·worker atlas 내보내기가 같은 실행기를 사용합니다.

복합 효과마다 TypeScript 모듈을 새로 복사할 필요가 없습니다. 예를 들어 방전의 접촉을 0.32초로 잡고, 그때 폭발 큐를 시작한 뒤 연기가 끝날 때까지 재생할 수 있습니다. 각 원본의 모양, 시드와 파라미터는 독립적입니다. 기존 `chain()` API와 2D 효과 모듈은 그대로 동작합니다.

## 실행하는 예제

```sh
npm run build
npm run gallery
# Studio의 프로젝트 열기에서 아래 JSON 선택
npm run render -- --project examples/projects/charged-impact.poku-project.json --bundle --trim --deduplicate
```

[Charged Impact 프로젝트](../examples/projects/charged-impact.poku-project.json)는 `lightning/focused-arc`와 `explosions/layered-detonation`의 조합입니다. 원본 두 효과는 변경하지 않습니다. 접촉 뒤 반응을 시작하고 두 효과의 가로 위치를 맞추는 제작 예제이며, 최종 미술 승인을 대신하지 않습니다. 제작 의도는 [별도 의도서](../authoring/arcane/charged-impact.intent.json)에 있습니다.

## 데이터 구조

```ts
import {
  createProject, createSequenceSpec, createProjectRuntime,
} from 'poku-pixel-fx/authoring';

const project = createProject({
  id: 'arcane/my-strike',
  name: 'My strike',
  kind: 'sequence',
  seed: 17,
  actor: false,
  bg: 'none',
  sequence: createSequenceSpec({
    size: [384, 224],
    origin: [192, 190],
    duration: 2.72,
    cues: [
      {
        id: 'strike',
        source: {kind: 'catalog', id: 'lightning/focused-arc'},
        at: 0, x: -155, y: 0,
      },
      {
        id: 'response',
        source: {kind: 'catalog', id: 'explosions/layered-detonation'},
        at: .32, x: -110, y: 0,
      },
    ],
  }),
});
const runtime = await createProjectRuntime(project);
const sample = runtime.render(.7);
// sample.frame: native color + emission; sample.rgba: selected finishing policy.
runtime.dispose();
```

### 시퀀스 설정

| 필드 | 의미 |
| --- | --- |
| `schema` | `poku.sequence/v1` |
| `cues` | 저장한 배열 순서대로 그리는 큐, 최대 64개 |
| `duration` | 생략하면 마지막 큐의 끝까지. 명시하면 해당 시점에서 자르거나 빈 종료 구간을 늘림 |
| `loop` | 기본 `false`. `true`이면 전체 큐 스케줄을 매 주기 처음부터 재시작 |
| `size`, `origin` | 둘 다 생략하면 각 원본 캔버스를 위치·반전·회전한 뒤 합집합으로 계산. 직접 지정할 때 둘을 함께 저장 |

빈 시퀀스의 기본 캔버스는 320×180이고 길이는 1초입니다. 각 변은 8,192px 이내, 면적은 4,194,304셀 이내여야 합니다. 과도하게 떨어진 큐를 자동으로 맞추면서 큰 빈 프레임을 생성하는 경우 명시적인 오류로 알려줍니다.

자동 캔버스는 원본 `meta.size`와 `meta.origin`을 따릅니다. 원본 자체가 선언한 캔버스 밖으로 그리거나 광학 halo를 잘못 선언한 경우까지 기하학적으로 추론하지 않습니다. 필요한 여백은 원본 캔버스나 프로젝트의 `margin`으로 작성합니다. 비활성 큐를 숨겨도 캔버스와 전체 길이는 줄지 않아 위치와 재생 시점이 움직이지 않습니다.

### 큐 설정

| 필드 | 기본값과 의미 |
| --- | --- |
| `id` | 필수, 중복 없는 식별자. 영문자로 시작하며 영문·숫자·`_`·`-`, 최대 64자 |
| `source` | 카탈로그 / 인라인 레시피 / 인라인 생성 의도 / 인라인 캐릭터 |
| `at` | 0, 전체 시퀀스에서 시작할 초 |
| `duration` | 생략하면 원본 한 주기. 루프 원본은 지정한 구간만큼 계속 재생하며, one-shot 원본의 수명은 늘리지 않음 |
| `x`, `y` | 0, 부모 pivot 기준의 native 픽셀 위치 |
| `angle`, `flip` | 0 라디안, `false`. 그림과 접촉 법선·소켓 방향을 함께 변환 |
| `fadeIn`, `fadeOut` | 0초. 큐 내부에서 color coverage와 emission을 smoothstep으로 감쇠 |
| `enabled` | `true`. 비활성 큐는 그림·접촉·사건·소켓에서 빠짐 |
| `seed` | 생략하면 부모 seed와 큐 id로 결정. 큐 순서를 바꿔도 보조 입자가 무작위로 바뀌지 않음 |
| `options` | 원본의 팔레트·발광·레이어·재질 등 기존 옵션 |

`project.layers[cue.id] = false`로도 해당 큐를 숨길 수 있습니다. 원본의 내부 레이어를 숨길 때는 큐의 `options.layers`를 사용합니다.

`options`에 들어온 `x/y/angle/flip/seed`는 프로젝트를 가져오는 편의를 위해 한 번 정규화하여 큐의 독립 필드로 옮깁니다. 독립 필드가 함께 있으면 그 값이 우선합니다. 저장 결과에는 서로 충돌하는 두 위치가 남지 않습니다.

## 네 종류의 원본

카탈로그 참조는 등록된 2D 모듈을 읽습니다. 프로젝트에는 이름만 저장하므로 다른 엔진 버전에서도 완전히 같은 원본이 필요한 경우 `sourceRevision`과 배포된 패키지 버전을 함께 고정해야 합니다.

```ts
{ kind: 'catalog', id: 'lightning/focused-arc' }
```

편집한 레시피를 포함하면 경로, 트랙, 레이어, 팔레트를 프로젝트 안에 그대로 담습니다.

```ts
{ kind: 'recipe', recipe: createRecipeSpec('thrown-blade') }
```

캐릭터는 완전한 `poku.character/v1` 데이터와 선택할 클립을 함께 저장합니다.

```ts
{ kind: 'character', character: characterAsset, clip: 'sword' }
```

지원되는 재질/동작을 새로 만들 때 생성 의도를 직접 넣을 수 있습니다. 기존 생성기의
규칙과 원화를 사용하며 별도 TypeScript 모듈이나 카탈로그 등록은 필요하지 않습니다.

```ts
{
  kind: 'generation',
  intent: { material: 'energy', action: 'dash', distance: 128, travel: .74 },
  renderOptions: { composition: 'material-volumes' },
}
```

`intent`는 `GenerationIntent2D`에서 `seed`만 제외한 데이터입니다. `seed`는 기존 큐의
`seed`에 한 번만 작성합니다. 생략하면 부모 프로젝트 seed와 큐 id로 결정되며, 생성
의도 안에 `seed`를 넣으면 거부합니다. 재질/동작/응답과 dash 거리·시간의 검증은 기존
`createGenerationPlan2D`를 그대로 사용합니다. 생성 원본의 알 수 없는 필드도 거부합니다.

`renderOptions`는 기존 `GenerationCompositionOptions2D`입니다. **생략하면 기존 API의
`body` 원화**를 사용합니다. `new.mjs`의 최신 fire/energy 시작 예제와 같은 선택을
원할 때는 지원되는 dash/plume dissipation에 `composition: 'material-volumes'`를 명시합니다.
얼음에는 `iceSurface: 'crystal'`을 명시할 수 있습니다. 지원하지 않는 조합은 거부하며,
프로젝트를 열면서 다른 재질이나 원화로 자동 대체하지 않습니다.

새 조합 예제 두 개는 아래 명령으로 실제 CLI에서 렌더할 수 있습니다.

```sh
node build-tools/tools/render.mjs --project examples/projects/generated-energy-fracture.poku-project.json --sheet
node build-tools/tools/render.mjs --project examples/projects/generated-storm-fire.poku-project.json --sheet
```

- Energy fracture: energy 도착 `0.28 + 0.74 = 1.02`초와 ice 파쇄 `0.66 + 0.36 = 1.02`초를 맞춥니다.
  Ice 큐의 `x: 64`가 energy 종점 `(64,-16)`과 crystal 중심을 맞춥니다. 자연 종료는 2.17초입니다.
  이는 사건 표식의 정렬입니다. 폭이 있는 pulse 실루엣은 1.02초보다 먼저 온전한 crystal과
  겹치므로, 최초 시각 접촉이나 물리 충돌 시점까지 자동 정렬한 것은 아닙니다.
- Storm fire: lightning 도착 0.23초에 fire **준비**를 시작합니다. Fire 방출은 그 다음 0.28초 뒤인
  0.51초입니다. `y: -12`로 fire의 로컬 근원 `(0,12)`를 strike 접점 `(0,0)`에 맞춥니다.
  Fire 큐의 `options.layers.sparks: false`가 작은 장식을 줄이고 기존 부피 입자를 남깁니다.
  자연 종료는 3.16초입니다.

위 두 기존 예제의 시간과 위치는 **작성자가 맞춘 숫자**입니다. 거리·시간을 바꾸면
관련 큐의 `at/x/y`도 다시 작성해야 합니다. 아래의 명시적 eventAnchor 예제는 그 관계를
저장하는 별도 opt-in입니다. 자동 충돌, 자동 choreography나 자동 고품질 생성은 아닙니다. 시퀀스의 `duration`은 전체 길이 crop/연장이지 생성 재질의 재타이밍이 아닙니다.

생성 사건의 `payload.x/y`는 원본 로컬 좌표를 그대로 보존합니다. 시퀀스가 바꾸는 것은
기존 계약대로 사건 id와 `sourceTime/at`이며, payload를 scene/world 좌표라고 해석하면
안 됩니다. 큐의 반전·회전·위치 변환은 그릴 때 적용됩니다.

생성 원본을 넣으면 기존 `at/x/y/angle/flip`, fade, `project.layers[cue.id]`,
`cue.options.layers`를 사용할 수 있습니다. 내부 layer 이름/의미는 재질별 생성기 문서를
따르며, 모든 이름이 모든 재질에서 같은 파티클 역할을 갖는 것은 아닙니다. fade는 기존
`chain()`이 색과 조명을 함께 감쇠합니다. 새 밝기/밀도/입자 수 조정기는 추가하지 않습니다.

이 경로는 JSON / authoring API / 실제 `render --project` 경로입니다. `new.mjs`에 새 옵션을
추가하지 않았고, Studio에 생성 편집 UI를 추가하거나 브라우저 동작을 검증한 것은 아닙니다.
두 예제는 사용 가능한 연결과 조합 방법을 보여 주며 미술적 우월성이나 최종 승인이 아닙니다.

원본 객체에는 실행 가능한 코드나 임의 URL을 넣지 않습니다. 재귀 시퀀스, 3D 장면, ACT의 캐릭터·히트스톱 전체 시간표는 이 스키마의 원본 유형에 포함하지 않습니다. ACT가 있는 카탈로그 항목을 사용하면 그 모듈의 **이펙트 부분**을 재생합니다. 배우가 필요하면 캐릭터 큐를 별도로 추가합니다.

## Explicit generation event anchors (JSON/API/CLI)

An optional `eventAnchor` on a **generation** cue keeps one authored relationship when
source timing, distance or either endpoint's transform changes. Existing independent cues
and the two original `generated-*` examples retain their absolute numeric placements.
This is not a new scheduler, collision detector, automatic choreography or artwork preset.

```ts
{
  id: 'crystal',
  source: { kind: 'generation', intent: { material: 'ice', action: 'shatter' },
    renderOptions: { iceSurface: 'crystal' } },
  eventAnchor: { cue: 'pulse', event: 'arrival', targetEvent: 'shatter' },
  at: 0, x: 0, y: 0,
  angle: .14, flip: true,
}
```

**Ownership is conditional and explicit:** without `eventAnchor`, `at/x/y` are the existing
absolute start and pivot-relative position. With it, those same saved fields are **offsets**:
`at` is a signed number of seconds after event alignment; `x/y` are native-pixel offsets in
sequence axes, not rotated source/target axes. Omitted offsets are zero. `angle/flip` always
remain the target's own transform, never inherited. Remove an anchor only after manually
baking its absolute placement if the current placement should stay unchanged.

The compiler computes:

- target start = source start + source event time − target event time + target `at` offset;
- target origin = transformed source event point − rotated/flipped target event point + (`x`,`y`) offsets.

Both endpoints flip local X before rotation, using the existing pixel transform functions.
The saved project and returned module's `sequence` retain the **unresolved** relationship and
offsets. They are never overwritten with compiled coordinates. Reloading and recompiling after
an intent edit recomputes placement. For anchored cues, `options.x/y` are rejected so imported
absolute placement cannot silently become a second offset owner. Existing seed ownership,
source options, fades, two-pass array drawing order and material/light budgets stay unchanged.

The source cue may appear before or after the dependent cue in the array. Dependencies resolve
first, but draw order is never topologically reordered. Hidden/disabled upstream cues still
provide their authored event facts: this is a layout relationship, not a runtime visibility
trigger. Hiding a cue removes only that cue's visuals and exported markers, as before. Seeds
and random particle variation do not affect the known generation markers.

Only uniquely named events from `createGenerationPlan2D` can provide points. Catalog, recipe,
character and arbitrary event payloads cannot be anchor endpoints. Missing names/references,
cycles, unsupported source kinds, coordinates outside ±65536, starts outside 0..3600 seconds,
and selected events outside cue/sequence windows reject during compilation. Shape, identifier,
input offset and target-kind errors reject during normalization. Repeated runtime event
occurrences are not supported as anchors. Exported event payloads keep their original local
coordinates; anchoring does not change metadata conventions or add world-coordinate fields.

A negative computed start rejects with an instruction to delay the upstream cue or change the
explicit offset. Preparation is never silently trimmed and no preroll system is introduced.
Only negative cancellation noise within
`2 * Number.EPSILON * (abs(sourceStart) + abs(sourceEventTime) + abs(targetEventTime) + abs(offset))`
is normalized to zero. This is an arithmetic error bound, not a frame-sized tolerance.

Cue `duration` and sequence `duration` crops must still include both selected events, following
the existing exclusive cropped endpoints and loop-boundary rules. **`project.seconds` remains
an outer export crop** and can intentionally truncate an otherwise valid sequence/link. It is
not a relationship validation guarantee or source retiming control.

```sh
node build-tools/tools/render.mjs --project examples/projects/event-linked-energy-fracture.poku-project.json --sheet
node build-tools/tools/render.mjs --project examples/projects/event-linked-storm-fire.poku-project.json --sheet
```

The energy example aligns arrival with shatter while retaining the target's complete .36 s
preparation. The storm example aligns strike with fire release using `at: .28`, deliberately
starting fire preparation at strike and releasing .28 s later. Zero time offset there would
make preparation begin before the strike, and may require delaying the upstream cue to avoid
a negative sequence start. These are author choices, not automatic material semantics.

Event-center alignment is **not earliest silhouette contact**: the finite energy pulse can
overlap the crystal before its center arrives. Anchors coordinate the unchanged particle/light
sources; they do not improve individual material art, create a physical ignition model, detect
collisions or provide Niagara simulation. This change is supported through portable JSON,
authoring API and `render --project`; no new Studio editing UI or browser verification is claimed.

## 재생과 레이어 계약

시퀀스는 연속적인 표시 시간을 받고, 각 자식 이펙트가 기존 120Hz 고정 시뮬레이션을 유지합니다. 큐 시작점이 1/120초 사이에 있어도 시작 시간을 양자화하거나 남은 시간을 버리지 않습니다. 프레임을 그리는 행위는 시뮬레이션을 전진시키지 않습니다.

큐의 끝은 표시 구간에서 제외됩니다. one-shot 원본은 자연 수명에 끝나며, 더 긴 `duration`을 줘도 마지막 셀을 정지해서 붙잡지 않습니다. 끝 포즈를 유지하려면 원본 캐릭터/클립의 종료 정책 또는 별도 큐로 의도를 작성합니다. 루프 원본에는 유한한 표시 구간이 있고, 전체 루프는 각 주기의 시작 상태와 시드를 다시 만듭니다.

먼저 모든 큐의 `back` 패스를 배열 순서대로 그리고, 이어 모든 큐의 `front` 패스를 그립니다. 이는 기존 `chain()`의 캐릭터 앞/뒤 계층을 보존합니다. 카탈로그 내부의 두 패스를 한 장의 완성 이미지로 평탄화하여 불투명하게 쌓는 모드가 아닙니다.

현재 시퀀스는 backward seek에서 결정적으로 재생을 복원합니다. 임의의 자식 closure를 복제한 checkpoint라고 주장하지 않습니다. 렌더된 셀 캐시는 기존 Studio의 메모리 예산을 사용합니다.

## 접촉, 사건과 소켓의 내보내기

- 접촉 위치와 법선은 원본 로컬 좌표에서 큐의 반전·회전·위치 변환을 받고, 전체 시퀀스 pivot 기준으로 저장됩니다.
- 소켓은 원본의 pixel-edge 좌표와 방향 basis를 변환하여 전체 시퀀스 프레임 안의 좌표로 저장합니다. 비활성 구간과 완전히 투명한 fade 경계에서는 소켓을 내보내지 않습니다.
- `strike/primary`, `actor/hand.grip`처럼 큐 id를 앞에 붙여 같은 원본을 두 번 사용해도 이름이 충돌하지 않습니다.
- 사건의 `sourceTime`은 전체 시퀀스 초입니다. `cueSourceTime`은 원본에서 작성한 시간이고 `cue`는 원본 큐 id입니다. 음향·사용자 payload는 보존됩니다.
- 원본 루프의 사건은 실제 표시 구간 안에서 반복합니다. 전체 루프의 마지막 경계 사건을 중복해서 첫 프레임에 넣지 않습니다. one-shot의 자연 종료 사건은 전체가 one-shot일 때 유지됩니다.
- atlas의 `timeMs`는 기존 공유 내보내기 코드가 실제 표시 프레임에 연결합니다. 예를 들어 0.375초 사건을 10fps로 내보내면 최초로 그 시간을 통과한 400ms 프레임에 놓습니다.

사건 반복으로 메타데이터가 100,000개를 넘는 작업은 구간을 줄여야 합니다. 접촉 기록은 게임의 충돌 검사나 피해 적용을 자동으로 수행하지 않습니다.

## 레시피 전체 길이 변경과 crop의 차이

기존 Studio는 전체 길이를 바꿀 때 레이어 불투명도 키만 늘렸습니다. 실제 방전·폭발·접촉은 코드 안의 원래 초를 계속 사용하여 동작과 외피의 길이가 어긋날 수 있었습니다.

`retimeRecipeSpec(recipe, seconds)`는 이제 **전체 동작을 같은 비율로 늘이거나 줄입니다**. 준비 시간, 이동, 접촉과 후속 반응, loop phase, 레이어 곡선과 명시한 Hermite velocity가 함께 이동합니다. 투척 검의 이동 시간과 잔상 길이는 실제 초 단위로 바뀌며 회전 속도는 반비례합니다.

```ts
const original = createRecipeSpec('thrown-blade'); // 2.2 s
const slower = retimeRecipeSpec(original, 4.4);
// slower의 1.0초 셀은 original의 0.5초 셀과 같은 모양이다.
```

이 값은 `timeScale`로 저장합니다. 기존 프로젝트에서 이 필드가 없으면 1로 읽으므로 기존 원화와 기본 타이밍을 바꾸지 않습니다. `createRecipeSpec(kind, {duration})`로 직접 작성한 길이 역시 기존 의미를 유지합니다. 명시적인 전체 재타이밍에는 위 helper를 사용하세요.

투척 검의 **이동 시간**만 조절하는 경우에는 전체 시간 배율을 또 바꾸지 않습니다. 필요한 접촉/회복 꼬리를 확보하고 레이어 외피의 길이만 늘립니다. 반면 `project.seconds`는 원본을 재타이밍하지 않는 명시적인 내보내기 crop입니다. 시퀀스 `duration`도 큐 원본의 속도를 바꾸지 않습니다.

`recipeParameters(recipe)`는 해당 레시피가 실제로 소비하는 입력만 제공합니다. 포털/불꽃/폭발에 아무 효과가 없는 검의 회전 속도나 이동 시간은 표시하지 않습니다. 재타이밍된 레시피의 슬라이더 범위도 현재의 실제 초와 회전/초에 맞춥니다.

## 검증 범위

`tests/authoring-sequence.test.mjs`는 시간 구간, 독립 시드, 고정 tick, 반복 재생, 뒤로 seek, 회전 캔버스, 접촉/사건/소켓 변환과 Studio–CLI 일치를 확인합니다. `tests/authoring-retiming.test.mjs`는 여섯 레시피의 재타이밍 전후 native 셀·빛과 접촉 시간을 비교합니다.

이 검사는 최종 그림의 완성도, 관객의 의미 이해 또는 물리적 타당성을 자동 인증하지 않습니다. 새 조합을 완성할 때에는 [EFFECT_INTENT.md](EFFECT_INTENT.md)에 따라 실제 원본 크기와 정상 속도 재생을 확인합니다.
