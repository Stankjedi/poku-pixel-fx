# 네이티브 픽셀 편집 — 직접 그리기, 선택과 보호

`src/core/pixel-brush.ts`는 실제 픽셀 셀에 작업하는 선택형 작성 도구다.
기존 효과, Painter 기본값, 캐릭터 렌더링에는 자동 적용되지 않는다.
이미지 확대나 흐림 필터를 거치지 않고, 먼저 **이진 작업 마스크**를 만들고
그 마스크를 한 번만 적용한다. 같은 위치를 지나거나 대칭 축이 겹쳐도
반투명 색이 중복 합성되지 않는다.

## 연필·지우개·선과 대칭

```ts
import { rasterizePixelBrush2D, paintPixelMask2D, hex } from 'poku-pixel-fx';

const stroke = rasterizePixelBrush2D(sprite.w, sprite.h, [
  { x: 12, y: 8 },
  { x: 23, y: 16 },
  { x: 24, y: 17 },
], {
  size: 1,
  tip: 'round',
  pixelPerfect: true,
  symmetry: 'none',
});
const edited = paintPixelMask2D(sprite, stroke, hex('#f9dfa1'), {
  selection: selectedCells,
  protectedMask: faceAndEmbroidery,
  alphaLock: true,
});
// null은 명시적인 지우개다. 색과 실루엣을 함께 비운다.
const erased = paintPixelMask2D(sprite, stroke, null);
```

좌표는 배치 위치가 아닌 원본 버퍼의 셀 번호다. 소수 좌표는 `floor`로 셀에
맞춘다. 띄엄띄엄 들어오는 포인터 이벤트 사이도 정수 선으로 이어서 빈칸을
남기지 않는다. 캔버스 밖에서 시작한 선은 원래 선의 계단 간격을 유지하며
잘라낸다. 단일 선의 방향을 뒤집어도 같은 셀을 칠한다.

`size`는 1~256셀, `tip`은 `round` 또는 `square`다. 점마다 0~1의 `pressure`를
주면 지름을 보간하며, 0은 칠하지 않는다. 압력은 알파를 무작위로 바꾸거나
중간 팔레트 색을 추가하지 않는다. 짝수 지름의 브러시는 기준 셀보다
오른쪽·아래쪽으로 반 셀 치우친 중심을 사용한다.

`pixelPerfect`는 **1셀 연필**의 연속된 직각 꺾임에서 불필요한 중간 셀을
제외한다. 완성된 그림의 모서리를 일괄 삭제하는 기능이 아니다. 이미 그려진
원본 픽셀은 선택된 색으로 덮어쓰는 셀 이외에는 그대로 남는다.

브라우저에서 스트로크를 미리 볼 때는 포인터를 누르기 직전의 원본에 현재
전체 스트로크를 다시 적용한다. 매 미리보기를 누적해서 적용하면 나중에
제외된 꺾임이 앞선 결과에 남는다. 포인터를 놓는 시점에 한 편집으로 저장한다.

| `symmetry` | 반사 위치 |
| --- | --- |
| `none` | 대칭 없음 |
| `x` | 열 좌표를 `w - 1 - x`로 반사 |
| `y` | 행 좌표를 `h - 1 - y`로 반사 |
| `xy` | 두 축 모두 반사 |

대칭은 **브러시의 전체 면적**을 반사하므로 캔버스 크기나 브러시 지름이
짝수여도 좌우·상하가 정확히 대응한다.

## 정확한 색 교체와 명시적인 알파 합성

기본 `mode:'replace'`는 지정한 색의 RGBA를 그대로 쓴다. 제한 팔레트로
눈·자수·금속 강조점 같은 디테일을 그릴 때 중간 색이 생기지 않는다.
`mode:'over'`를 선택하면 직선 알파의 source-over 합성을 사용한다.

`alphaLock:true`는 이미 실루엣과 알파가 있는 셀만 수정하고 원래 알파를
정확히 유지한다. 잠긴 지우개는 아무것도 지우지 않는다. 알파 잠금과 `over`를
함께 쓰면 source-atop 방식으로 RGB를 섞고 기존 커버리지를 유지한다.
독립 실루엣이 숨기는 RGB를 합성 배경으로 잘못 가져오지 않는다.

픽셀·실루엣 버퍼는 복사한다. 수정하지 않은 셀은 바이트 단위로 유지한다.
기타 metadata, semantic mask, 높이·법선·HDR 채널은 기존 `editSpriteCluster2D`와
같이 참조를 보존한다. 이 API는 해당 채널을 자동 재설계하지 않으므로, 새로
그린 형상에 필요한 재질/발광 채널은 별도로 작성한다.

## 사각형과 타원

```ts
import { rasterizePixelShape2D } from 'poku-pixel-fx';

const ellipse = rasterizePixelShape2D(96, 96, 'ellipse', [9, 17], [78, 68], {
  filled: false,
  size: 2,
});
const rectangle = rasterizePixelShape2D(96, 96, 'rectangle', [8, 8], [20, 15], {
  filled: true,
});
const line = rasterizePixelShape2D(96, 96, 'line', [4, 5], [62, 40], {
  size: 1,
});
```

드래그 시작/끝 셀을 포함한 범위를 사용한다. 사각형·타원의 윤곽 두께는
범위 안쪽으로 들어가며, 기본은 채우지 않는 1셀 윤곽이다. 타원은 네이티브
셀 중심에서 연속 타원식을 평가한다. 윤곽은 네 방향 이웃을 기준으로 안쪽을
제외하므로 가로로 길고 2~3셀밖에 안 되는 타원도 끝부분이 끊어지지 않는다.
화면 바깥으로 나간 도형을 자를 때 캔버스 끝에 가짜 윤곽을 만들지 않는다.
한 셀짜리 도형도 그릴 수 있다.

## 색상 선택, 채우기와 영역 연산

```ts
import {
  selectPixelRegion2D, combinePixelSelections2D, resizePixelSelection2D,
} from 'poku-pixel-fx';

const region = selectPixelRegion2D(sprite, { x: 18, y: 22 }, {
  contiguous: true,
  tolerance: 6,
  connectivity: 4,
  includeTransparent: true,
});
const added = combinePixelSelections2D(currentSelection, region, 'add');
const grown = resizePixelSelection2D(sprite.w, sprite.h, added, 2);
const inner = resizePixelSelection2D(sprite.w, sprite.h, grown, -1);
const border = combinePixelSelections2D(grown, inner, 'subtract');
```

연결 선택은 매 후보를 **처음 누른 색**과 비교한다. 조금씩 비슷한 색을
따라가다가 전체 그라데이션으로 번지는 연쇄 허용오차는 사용하지 않는다.
`tolerance`는 각 sRGB 채널의 최대 차이이고, 기본 0은 정확한 RGB 일치다.
`matchAlpha:true`는 알파 차이도 비교한다. `contiguous:false`는 떨어져 있는
같은 색도 고른다. `selection`을 제한 마스크로 주면 해당 경계를 넘어가지 않는다.

투명한 곳을 채우려면 `includeTransparent:true`로 빈 영역을 선택한다.
실루엣이 숨기는 셀도 빈 영역으로 취급하며 숨겨진 RGB에 따라 선택을 쪼개지
않는다. 불투명한 셀에서 시작하면 투명 배경으로 확장하지 않는다.

선택 결합은 `replace`, `add`, `subtract`, `intersect`, `xor`를 지원한다.
양의 반지름은 선택 확장, 음의 반지름은 축소다. 정확한 유클리드 거리와
원형 커널을 사용하므로 대각선 경계가 다이아몬드 모양으로 치우치지 않는다.
캔버스 바깥은 선택되지 않은 영역으로 취급한다. 입력 선택은 변하지 않고,
반지름에 비례해 반복하지 않는 `O(너비×높이)` 거리 변환을 사용한다.

작성 범위는 최대 4096×4096셀, 스트로크당 입력 65,536점이다. 원격 좌표로
긴 선을 그려도 화면과 브러시가 만나는 범위만 순회한다. 비정상적으로 긴
동일 스트로크는 보간 셀 4,194,304개/브러시 행 8,388,608개에서 제한한다.
일반적인 편집은 포인터를 놓을 때마다 독립 스트로크로 저장하면 된다.

## 검증 범위

`tests/pixel-brush.test.mjs`는 끊김 없는 선, 양방향/클리핑 일관성, 꺾임
보호, 압력, 짝수/홀수 대칭, 도형, 알파 잠금, source-over/source-atop,
연결 선택, 투명 배경 채우기와 정확한 거리 기반 선택 변경을 확인한다.
이 검사는 그림의 미술적 완성도를 판정하지 않는다.
