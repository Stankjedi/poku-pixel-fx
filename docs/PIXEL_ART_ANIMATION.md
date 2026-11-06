# Pixel Art Lab — 프레임 애니메이션

정지 그림의 레이어·팔레트·높이·법선을 각 프레임에 유지하면서 움직임을 작성하는 도구다.
그림을 자동 생성하거나 중간 동작을 추정하지 않는다. 필요한 포즈와 세부 표현은 직접 그리거나
프레임을 복제해 수정하며, 재생 속도와 어니언 스킨으로 실제 움직임을 확인한다.
기존 이펙트와 정지 그림의 기본 출력은 바꾸지 않는다.

## 작업실에서 사용

`npm run build`와 `npm run gallery` 실행 후
`http://127.0.0.1:8080/gallery/pixel-art-lab.html`을 연다.

1. 정지 그림을 작성한 뒤 **프레임 추가** 또는 **프레임 복제**로 애니메이션을 시작한다.
2. 프레임을 고르고 기존 그림 도구로 해당 프레임의 원본·레이어를 편집한다.
3. 프레임마다 이름과 표시 시간(ms)을 지정한다. 긴 준비 동작과 짧은 타격 동작을 서로 다른 길이로 만들 수 있다.
4. 어니언 스킨으로 앞뒤 포즈의 위치를 확인하고, 실제 속도로 재생한다.
5. 전체 편집 프로젝트 또는 원본 크기 스프라이트시트와 타이밍 JSON을 저장한다.

프레임 전환은 그리기 명령과 별개의 탐색 동작이다. 프레임을 골랐다는 이유만으로 실행 취소
단계가 늘어나거나 다시 실행 기록이 사라지지 않는다. 그림·재질·타이밍·프레임 순서의 변경은
애니메이션 전체의 실행 취소/다시 실행에서 함께 복원된다.

## 프레임은 독립된 편집 문서

새 `poku-pixel-art/v3`는 여러 v2 문서를 담는 컨테이너다. v2의 정지 그림 API나 저장 형식을
수정하지 않는다. v1/v2 파일을 애니메이션 파서에서 열면 원래 출력 그대로 단일 프레임으로 승격한다.
각 프레임에 다음 데이터를 보존한다.

- 원본의 정확한 packed RGBA와 독립 실루엣 마스크
- 재질·그림·팔레트와 작업실이 지원하는 다른 편집 레이어
- 선택·보호 영역, 작성한 높이와 활성 레이어
- 구운 material ID·height·normal 채널
- 고유 프레임 ID, 이름과 가변 `durationMs`

프레임 크기는 문서 전체에서 같아야 한다. 프레임 복제는 편집 배열을 독립적으로 복사한다.
한 프레임을 수정할 때는 다른 프레임 문서의 참조를 재사용하므로 매 붓질마다 모든 픽셀을
다시 복사하지 않는다. API의 반환 문서는 불변 값처럼 다루어야 한다.

```ts
import {
  createPixelArtAnimation2D, duplicatePixelArtAnimationFrame2D,
  getPixelArtAnimationFrame2D, replacePixelArtAnimationFrame2D,
  updatePixelArtAnimationFrame2D, serializePixelArtAnimation2D,
  parsePixelArtAnimation2D,
} from 'poku-pixel-fx/authoring';

let animation = createPixelArtAnimation2D(document, {
  name: 'Hand-authored motion', durationMs: 1000 / 24,
  loop: true, direction: 'forward',
});
animation = duplicatePixelArtAnimationFrame2D(animation);
const cel = getPixelArtAnimationFrame2D(animation);
// Use the existing document/brush/layer APIs to produce editedDocument.
animation = replacePixelArtAnimationFrame2D(animation, editedDocument, cel.id);
animation = updatePixelArtAnimationFrame2D(animation, cel.id, {
  name: 'Contact pose', durationMs: 75,
});
const reopened = parsePixelArtAnimation2D(serializePixelArtAnimation2D(animation));
```

`addPixelArtAnimationFrame2D`는 문서를 생략하면 투명 프레임을 만들고, 기본적으로 활성 프레임 뒤에
삽입한다. `movePixelArtAnimationFrame2D`의 위치는 이동 후 최종 0 기반 인덱스다.
`removePixelArtAnimationFrame2D`는 최소 한 프레임을 남긴다. 이름에는 한글·한자·이모지를 사용할 수 있다.
복제 이름의 길이를 제한할 때 이모지의 UTF-16 쌍을 잘라 손상시키지 않는다.

## 시간과 재생 규약

`durationMs`는 양의 유한 밀리초이며 `1000 / 60`과 같은 소수도 허용한다.
렌더링 프레임률에 맞추어 지속 시간을 반올림하지 않는다.
프레임 시작은 포함하고 끝은 다음 프레임의 시작으로 처리한다.

| 방향 | 3프레임의 재생 순서 | 끝 처리 |
| --- | --- | --- |
| `forward` | 0 → 1 → 2 | loop 설정에 따라 처음으로 되돌아감 |
| `reverse` | 2 → 1 → 0 | 역순으로 각 프레임의 원래 지속 시간을 사용 |
| `pingpong` | 0 → 1 → 2 → 1 | 양쪽 회전 지점을 중복하지 않음 |

한 프레임의 ping-pong은 그 한 프레임만, 두 프레임은 0 → 1만 재생한다.
한 번 재생할 때의 종료 시각은 보이지 않는 구간으로 돌려준다. 편집기에서는 그 순간 마지막
프레임을 화면에 유지할 수 있으며, 이 표시 정책은 실제 데이터의 시간을 바꾸지 않는다.

```ts
const timeline = createPixelArtAnimationTimeline2D(animation);
const cache = renderPixelArtAnimation2D(animation);

// Compile/render again after an edit, not in every animation callback.
function display(elapsedMs: number) {
  const index = timeline.frameAt(elapsedMs);
  if (index >= 0) drawNative(cache[index]);
}
```

타임라인은 프레임 순서와 누적 시간만 스냅샷으로 만든다. `frameAt`은 버퍼 할당·문서 검증·재질 렌더를
하지 않는 이진 탐색이다. 음수·NaN·무한 시간과 끝난 비반복 재생은 `-1`이다.
`frameAtPhase(1)`은 마지막 재생 프레임을 유지한다. 너무 큰 시간 뒤의 작은 프레임이 부동소수점
반올림으로 사라지는 입력은 저장/컴파일 단계에서 거절한다.

## 어니언 스킨은 별도 미리보기

`createPixelArtOnionSkin2D(cachedFrames, activeIndex, options)`는 앞뒤 프레임만 색조를 입힌
고스트 이미지로 반환한다. 현재 그림은 포함하지 않는다. 이 이미지를 현재 프레임 뒤의 별도 Canvas에 그린다.

- 기본 앞/뒤 각각 1프레임, 투명도 0.28이며 양쪽 최대 8프레임을 지정할 수 있다.
- 원본의 알파와 실루엣으로 고스트의 표시를 제한한다. 숨겨진 RGB는 표시하지 않는다.
- 멀리 있는 프레임은 `opacity / distance`로 약해진다.
- 반복 경계를 연결할 수 있다. 동일한 프레임이 양쪽에 나타나더라도 가까운 위치에서 한 번만 표시한다.
- 원본 픽셀·마스크·높이·법선을 바꾸지 않는다. PNG·프로젝트·스프라이트시트에는 섞이지 않는다.

## 게임용 내보내기

`exportPixelArtAnimationSheet2D`는 `{sprite, rgba, manifest}`를 반환한다. `rgba`는 PNG 인코더에
바로 전달할 수 있는 straight RGBA 바이트다. 프레임을 원본 해상도로 배치하고 지정한 투명 여백을 둔다.
원화의 세부 표현을 흐리게 하는 리샘플링이나 화면 확대를 포함하지 않는다.

`poku-pixel-art-atlas/v1` JSON에는 시트 크기, 프레임 사각형·ID·이름·duration,
실제 재생 `sequence`·`startsMs`·전체 지속 시간·반복 설정을 저장한다.
역순과 ping-pong은 원본 프레임을 중복 배치하지 않고 `sequence`에서 참조한다.

```ts
const sheet = exportPixelArtAnimationSheet2D(animation, { columns: 4, padding: 1 });
// encodePNG(sheet.sprite.w, sheet.sprite.h, sheet.rgba)
const metadata = JSON.stringify(sheet.manifest, null, 2);

const data = exportPixelArtAnimationClip2D(animation, { pivot: [32, 60] });
const clip = createSpriteClip2D(data, { loop: animation.loop });
// Existing Painter/SpriteClip playback can consume the exported data directly.
```

`exportPixelArtAnimationClip2D`는 이미 제공되는 `SpriteClipData2D` 형식을 사용한다. 역순·ping-pong의
재생 순서는 내보낸 프레임 목록에 펼치며, 원본 프레임 ID 목록과 반복 설정을 `source`에 기록한다.
런타임의 반복 여부는 기존 규약대로 `createSpriteClip2D`의 `loop` 옵션으로 지정한다.

두 시각적 출력은 독립 실루엣을 알파에 반영한다. 가려진 픽셀은 알파만 0으로 만들고 숨은 RGB는
보존하며, 보이는 픽셀의 낮은 알파와 RGB도 정확히 유지한다. 독립 마스크, 편집 레이어와 높이·법선은
v3 프로젝트에 보존된다. 스프라이트시트나 런타임 클립만으로 모든 편집 채널을 복원하는 형식은 아니다.

## 용량과 히스토리

최대 256프레임과 기존의 개별 프레임 크기·레이어 한도를 적용한다. 합산 네이티브 셀은 8,388,608개,
저장 숫자 배열은 16,777,216개, 전체 레이어 재생은 67,108,864셀을 한도로 둔다. PNG 시트는
16,777,216셀과 가로·세로 16,384픽셀 이하이며, JSON은 UTF-8 64MiB 이하이다.
레이어나 맵이 많은 문서는 단순한 정지 이미지보다 먼저 합산 용량에 도달할 수 있다.
검증은 전체 프레임을 복사하거나 시트를 할당하기 전에 이 예산을 확인한다.

`PixelArtAnimationHistory2D`는 기본 64단계·과거/미래 스냅샷 합계 32MiB 안에서 기록을 유지한다.
큰 문서에서는 단계 수가 줄어들며 현재 그림은 이 기록 예산 때문에 삭제되지 않는다.
`selectFrame(id)`는 JSON을 다시 만들지 않고 탐색 상태만 갱신한다. 전체 내용을 가져오는 `value`는
외부 변경으로 히스토리가 손상되지 않도록 독립 문서를 반환한다.

## 검증 범위

`tests/pixel-art-animation.test.mjs`는 버전 승격, 프레임 독립성, 정확한 색·알파·맵 저장,
시간 경계, 역순·ping-pong, 고스트의 비파괴성, 실제 SpriteClip 런타임 연결,
프레임 탐색과 실행 취소/다시 실행, 합산 용량 거절을 검사한다.
이 검사는 제작 파일과 시간 규약을 검증하며 움직임의 미술적 완성도를 인증하지 않는다.
