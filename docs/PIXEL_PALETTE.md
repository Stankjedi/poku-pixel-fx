# Pixel Palette — 원화의 색을 정리하고 명암 램프를 작성하기

이 도구는 원본 픽셀의 색을 명시한 팔레트로 정리하는 선택형 작성 도구이다.
기존 효과의 팔레트·렌더러·알파 처리 기본값은 바꾸지 않는다.
색을 무조건 늘리거나 디더를 추가한다고 결과가 좋아지는 것은 아니다. 얼굴, 자수,
금속의 작은 반사처럼 의미 있는 강조색은 잠그거나 보호하고, 큰 색 덩어리부터 확인한다.

## 1. 원화에서 팔레트 추출

```ts
import { extractPixelPalette2D } from 'poku-pixel-fx';

const palette = extractPixelPalette2D(sprite, {
  colors: 24,
  locked: ['#152337', '#fff0d2'],
  // selection: bodyRegion,
  // protectedMask: faceAndEmbroidery,
});
```

`colors`는 잠근 색을 포함한 **최대** 색 수이며 1~256이다. 선택한 원화의 색이 예산 안에
들어오면 그 색을 정확하게 보존한다. 색을 줄여야 할 때는 Oklab 공간에서 알파 기여도를
가중치로 사용해 중심색을 계산한다. 완전히 투명한 픽셀의 숨은 RGB, 실루엣 밖 픽셀,
선택하지 않은 픽셀과 보호한 픽셀은 추출에 기여하지 않는다. 빈 영역에서는 잠근 색만 반환한다.

잠근 색은 전달한 순서로 맨 앞에 남는다. 중복된 잠금 색은 처음 한 번만 유지한다.
나머지 색은 지각적 밝기 순서로 정렬한다. 잠그지 않은 작은 강조색은 색 수를 크게
줄일 때 합쳐질 수 있으므로, 중요한 색은 `locked`에 직접 넣는다.

추출은 프레임 시드나 무작위 표본에 의존하지 않는다. 정확한 색 히스토그램은 8,192색까지
유지하며, 그보다 많은 색이 있는 입력은 최대 32,768개의 5비트 RGB 구간으로 묶는다.
각 구간은 원본 색과 알파의 정수 가중합을 보유하므로 일부 픽셀을 건너뛰지 않는다.
그 뒤 기본 4회, 지정 시 최대 16회의 가중 Oklab 중심색 정리를 수행한다. 매우 많은 색을
가진 입력에서는 이 구간화가 근사이며, 수치적으로 가능한 모든 팔레트 중 최적값을
보장하는 알고리즘은 아니다. 8비트 변환 후 중복 중심색이 생기면 요청한 최대 개수보다
적은 색을 반환할 수 있다.

## 2. 색상만 교체하는 팔레트 조정

```ts
import { remapPixelPalette2D, createPixelPaletteMapper2D } from 'poku-pixel-fx';

const output = remapPixelPalette2D(sprite, palette, {
  dither: 'none',
  selection: bodyRegion,
  protectedMask: faceAndEmbroidery,
});

// 여러 cel에 같은 팔레트를 적용할 때는 한 번 컴파일한다.
const mapper = createPixelPaletteMapper2D(palette, {
  dither: 'bayer8', strength: .5,
});
const firstCel = mapper.remap(celA, { origin: [0, 0] });
const secondCel = mapper.remap(celB, { origin: [0, 0] });
const savedSettings = JSON.stringify(mapper.options);
```

가장 가까운 색은 Oklab 거리로 선택한다. 이미 팔레트에 있는 색은 디더를 켜도 그대로
유지한다. 팔레트 배열의 순서와 중복 위치는 저장 시 그대로 남는다. 컴파일한 `options`와
`palette`는 입력 배열과 분리된 읽기 전용 스냅샷이다.

| 보존 대상 | 동작 |
| --- | --- |
| 원본 픽셀 | 새 버퍼를 만들며 입력을 변경하지 않음 |
| 알파 | 반투명을 포함한 원래 8비트 알파를 정확하게 유지 |
| 실루엣 마스크 | 독립 마스크의 값과 숨은 픽셀을 그대로 유지 |
| 선택 밖·보호한 픽셀 | 원래 RGBA를 그대로 유지 |
| 높이·법선·HDR·소켓 | 색 교체가 변경하지 않으며 기존 metadata 참조를 유지 |
| 투명 픽셀의 숨은 RGB | 보존하며 색 분석과 교체 대상에서는 제외 |

`dither: 'none'`이 기본이다. `bayer4`, `bayer8`은 고정된 4×4 또는 8×8 순서 패턴으로
선택한 두 색의 비율을 표현한다. 두 색의 혼합은 **선형 광량**에서 평가하고,
그 결과의 Oklab 오차와 작은 대비 비용을 함께 비교한다. 검정과 흰색의 도트 비율을
지각적 밝기 값에 바로 맞추어서 중간 회색이 너무 밝아지는 문제를 피한다.
각 원본 색에 가장 가까운 팔레트 색을 먼저 정하고 그 색과 섞을 파트너를 찾으므로,
모든 색 쌍을 전수 탐색하는 최적 혼합 보장은 하지 않는다.

`strength: 0`은 가장 가까운 단색이고 `1`은 선택한 혼합 비율 전체이다. 디더는 색상에만
적용하고 알파를 점무늬로 바꾸지 않는다. 프레임별 무작위 노이즈나 공간 오차 확산을
사용하지 않으므로 선택 경계, 이전 cel 또는 실행 순서의 영향을 받지 않는다.

무늬 좌표는 `origin`을 기준으로 고정된다. sprite의 배치용 `x/y`는 무시한다.
원본에서 `(cropX, cropY)`만큼 자른 cel은 `origin: [cropX, cropY]`로 같은 패턴을 유지한다.
기존 원점이 있다면 잘라낸 오프셋을 더한다. 원점은 네이티브 셀의 주소이므로 소수 부분은
아래 정수로 내림한다. 무늬가 회전·변형된 원화에 붙어야 한다면 원화 좌표에서 먼저
팔레트를 적용하고 기존 픽셀 변환 API로 배치한다.

## 3. 차가운 그림자와 따뜻한 하이라이트를 잇는 명암 램프

```ts
import { createPixelPaletteRamp2D, createPixelMaterial2D } from 'poku-pixel-fx';

const palette = createPixelPaletteRamp2D({
  shadow: '#162d56',
  midtone: '#9f6b56',
  highlight: '#ffefa8',
  colors: 13,
  midpoint: .5,
});
const material = createPixelMaterial2D({ kind: 'fabric', palette });
```

밝기·채도·색상을 Oklch에서 따로 보간하고 색상은 짧은 방향으로 연결한다. 무채색
끝점은 연결된 유채색의 색상 방향을 빌린다. sRGB 범위를 벗어나는 중간색은 밝기와
색상 방향을 유지한 채 채도를 줄여서 범위 안에 넣는다. 채널별 값을 따로 잘라서
예기치 않은 색상 변화를 만드는 방식은 사용하지 않는다.

양 끝 색은 원래 값 그대로이며, 샘플 위치가 `midpoint`와 일치하면 중간색도 정확하게
보존한다. 출력은 2~256개의 불투명한 **팔레트 색 배열**이다. 원화에 흐린 그라데이션을
덮어씌우지 않는다. 같은 색을 여러 번 지정한 의도적인 램프는 중복을 허용하며, 자동으로
색 순서를 바꾸지 않는다. 재질 명암용 램프라면 어두운 색에서 밝은 색 순으로 작성한다.

## 검증 범위

`tests/pixel-palette.test.mjs`는 알려진 무채색 광량 관계, 알파 가중 중심색, 정확한 색
보존, 잠금 색, 큰 히스토그램의 순서 독립성, 보호 영역, 원점·crop 일치, 저장 가능한
옵션 스냅샷을 검사한다. 자동 검사는 수치 계약을 확인하며 미술적 완성도를 인증하지 않는다.

Oklab 변환은 [Björn Ottosson의 원문과 공개 도메인 변환식](https://bottosson.github.io/posts/oklab/)의
2021년 갱신 행렬을 사용한다. 디더 패턴은 프로젝트의 기존 고정 패턴 구현을 재사용한다.
