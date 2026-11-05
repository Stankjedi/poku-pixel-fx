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
| `source` | 카탈로그 / 인라인 레시피 / 인라인 캐릭터 |
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

## 세 종류의 원본

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

원본 객체에는 실행 가능한 코드나 임의 URL을 넣지 않습니다. 재귀 시퀀스, 3D 장면, ACT의 캐릭터·히트스톱 전체 시간표는 이 스키마의 원본 유형에 포함하지 않습니다. ACT가 있는 카탈로그 항목을 사용하면 그 모듈의 **이펙트 부분**을 재생합니다. 배우가 필요하면 캐릭터 큐를 별도로 추가합니다.

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
