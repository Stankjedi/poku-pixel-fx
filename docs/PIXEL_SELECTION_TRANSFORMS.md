# 네이티브 선택·이동·반전·회전과 명암 브러시

이 도구들은 원본 셀을 직접 다루는 선택형 작성 API다. 기존 효과나 렌더러에는
자동 적용하지 않는다. 불규칙한 디테일을 따로 고른 뒤 위치·방향을 수정하고,
선택한 재질의 팔레트 안에서 명암 덩어리를 다듬는 데 사용한다.

## 자유 선택과 선택 범위

```ts
import {
  rasterizePixelLasso2D, pixelSelectionBounds2D, invertPixelSelection2D,
  combinePixelSelections2D, rasterizePixelShape2D,
} from 'poku-pixel-fx';

const lasso = rasterizePixelLasso2D(sprite.w, sprite.h, [
  { x: 12, y: 9 }, { x: 35, y: 11 }, { x: 29, y: 28 }, { x: 16, y: 24 },
]);
const rectangle = rasterizePixelShape2D(sprite.w, sprite.h, 'rectangle', [2, 3], [9, 14], { filled: true });
const selection = combinePixelSelections2D(lasso, rectangle, 'add');
const bounds = pixelSelectionBounds2D(sprite.w, sprite.h, selection);
// bounds: { x, y, w, h, count }, or null when nothing is selected.
const remaining = invertPixelSelection2D(sprite.w, sprite.h, selection, sprite.mask.data);
```

자유 선택은 마지막 점과 첫 점을 연결해 닫고, 셀 중심에서 even-odd 규칙으로
채운다. 오목한 모양, 교차한 경로, 내부 구멍을 지원한다. 기본값은 경로 위의
1px 외곽도 포함하므로 한 번 클릭하면 한 셀, 두 점이면 그 사이의 선을 선택한다.
`includeBoundary:false`는 면 내부만 고른다. 소수 포인터 좌표는 해당 셀로 내린다.

최대 65,536개의 포인터 표본을 받으며 연속 중복·같은 방향의 일직선 표본을
정리한 뒤 최대 4,096개의 꼭짓점까지 처리한다. 캔버스 밖 부분은 네이티브
계단 간격을 유지하며 잘린다. 사각·타원 선택은 기존 도형 래스터를 재사용한다.
선택의 합치기·빼기·교집합·XOR도 기존 이진 선택 연산을 그대로 사용한다.
선택은 색상이나 알파에서 독립적이므로 빈 셀도 명시적으로 포함할 수 있다.

## 정확한 셀 변환

```ts
import { transformPixelSelection2D } from 'poku-pixel-fx';

const moved = transformPixelSelection2D(sprite, selection, {
  offset: [3, -2],
  flipX: true,
  quarterTurns: 1,
  copy: false,
  boundary: 'reject',
  protectedMask: faceAndEmbroidery,
});
// moved.sprite: edited native raster
// moved.selection: transformed destination only
// moved.touched: source erasures plus destination writes
// moved.clipped: cells deliberately discarded when boundary is 'clip'
```

순서는 **선택 경계 안에서 좌우/상하 반전 → 시계 방향 90도 단위 회전 → 정수
이동**이다. 선택의 왼쪽 위 셀이 기준점이며 90/270도 회전은 가로·세로만 바꾼다.
짝수·홀수 크기의 중심을 반 셀로 반올림하지 않는다. 전체 캔버스 크기는 고정한다.

| 설정 | 처리 |
| --- | --- |
| `offset` | 정수 셀 이동. 각 축 ±1,048,576 이내. |
| `flipX`, `flipY` | 선택 경계 안에서 좌우·상하 반전. |
| `quarterTurns` | 0, 1, 2, 3. 각각 0, 90, 180, 270도 시계 방향. |
| `copy:false` | 선택 원본을 비운 다음 변환된 위치에 기록. |
| `copy:true` | 원본을 유지하고 변환된 복사본만 새 선택으로 반환. |
| `boundary:'reject'` | 기본값. 한 셀이라도 밖으로 나가면 전체 편집을 거절. |
| `boundary:'clip'` | 밖으로 나간 셀을 의도적으로 버리고 개수를 반환. 이동 원본에서도 지움. |
| `boundary:'wrap'` | 캔버스 크기를 주기로 반대쪽으로 이동. 반복 타일의 이음새 편집에 사용. |

대상 셀은 항상 **편집 전 원본**에서 읽는다. 이동 영역이 겹쳐도 덧칠이 번지지 않고
RGBA와 독립 실루엣 바이트를 그대로 옮긴다. 낮은 알파, 숨겨진 RGB, 마스크 값도
정확히 유지한다. 선택한 투명 셀은 대상의 투명 셀 교체를 의미하므로 배경을 지울 수 있다.
새 색을 만드는 필터·보간·알파 합성은 사용하지 않는다.

보호된 원본 셀은 움직이지 않지만 선택 기준점은 변하지 않는다. 대상 위치가 보호된
셀을 침범하면 일부를 누락시키지 않고 전체 작업을 거절한다. 폭·높이가 다른 캔버스에서
감싸기와 90도 회전을 함께 쓰면 둘 이상의 원본이 한 셀에 겹칠 수 있다. 이 경우도
명확한 오류로 거절한다. 모든 검증은 원본을 바꾸지 않으며 성공한 결과의 버퍼도 원본과 분리한다.

### 형상과 재질 정보도 함께 이동

입력에 다음 채널이 있으면 색상과 같은 셀 매핑을 적용한다.

- `channels.material`, `channels.height`: 재질 ID와 실제 높이를 그대로 옮긴다.
- `channels.normal`: x/y 법선 성분도 반전·회전하고 z는 유지한다.
- `emission`: 셀별 HDR RGB를 그대로 옮긴다.
- `semanticMasks`: 이름별 의미 마스크를 그대로 옮긴다.

비워진 원본 셀의 채널은 0으로 지운다. 배치용 x/y, 리그, 소켓 등 나머지 metadata는
그대로 유지한다. 이 API는 래스터 편집이며 캐릭터 리그의 위치나 관절을 변경하는 기능이 아니다.
임의 각도 회전·비정수 배율을 이 함수에 추가해 새 픽셀을 암묵적으로 만들지 않는다.

`validatePixelSelectionTransformOptions2D()`는 래스터를 만들지 않고 정적 옵션만
검증·정규화한다. 프로젝트의 저장 가능한 변환 레이어에서 같은 규약을 재사용할 수 있다.

## 팔레트 안에서 한 단계 밝게·어둡게

```ts
import { rasterizePixelBrush2D, shadePixelMask2D } from 'poku-pixel-fx';

const brush = rasterizePixelBrush2D(sprite.w, sprite.h, pointerPoints, { size: 2 });
const lighter = shadePixelMask2D(sprite, brush,
  ['#1b2436', '#354a60', '#617f95', '#a3bfc4', '#edf3d0'],
  1,
  { selection, protectedMask: faceAndEmbroidery },
);
```

팔레트 순서는 작성자가 지정한 그림자에서 하이라이트 방향이다. 양수는 뒤쪽,
음수는 앞쪽으로 이동하고 끝에서는 멈춘다. 중복 RGB는 최초 순서를 유지해 정리한다.
원본 RGB가 팔레트에 **정확히 포함된 경우**에만 바꾸므로 다른 재질의 색이나 보호된
얼굴·문양을 가장 가까운 색으로 몰래 바꾸지 않는다. 검은색도 유효한 색이며 원래 알파와
실루엣 값은 그대로 유지한다. 투명하거나 마스크에 가려진 셀은 수정하지 않는다.

한 스트로크의 전체 마스크를 포인터를 누르기 전의 그림에 한 번 적용한다. 이렇게 하면
같은 셀을 다시 지나거나 대칭 브러시가 겹쳐도 한 번에 여러 단계 밝아지지 않는다.
`steps`는 -255~255의 정수이며, API는 색을 자동으로 밝기순 정렬하지 않는다.
큰 명암 덩어리·주름·금속 테두리를 직접 작성할 수 있으며 미술적 완성도를 자동 판정하지 않는다.

## 검증

`tests/pixel-selection-transform.test.mjs`는 오목한 자유 선택·구멍·클리핑,
겹치는 이동과 복사, 비정사각형 회전, 반복 이동, 보호 충돌, 모든 재질/HDR 채널의
회전과 4회 회전 후 복원, 정확한 팔레트 명암 이동을 확인한다.
브라우저의 실행 취소와 저장 재열기는 해당 작업실 통합 검사에서 확인한다.
