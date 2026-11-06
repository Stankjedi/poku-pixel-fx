# 반복 재질, 원화 재조명, 애니메이션 공통 팔레트

이 도구들은 픽셀아트의 **색·표면 구조·조명·애니메이션 색상 예산**을 따로 다룬다.
기존 이펙트와 기존 재질의 기본 설정은 바꾸지 않는다. 흐림 효과, 프레임마다 달라지는
무작위 노이즈, 이미지 밝기에서 추정한 가짜 높이를 추가하지 않는다.

## 1. 가장자리까지 이어지는 반복 재질

```ts
import { createPixelMaterial2D } from 'poku-pixel-fx/core/pixel-material';

const material = createPixelMaterial2D({
  kind: 'wood',
  seed: 41,
  scale: 18,
  detail: .6,
  relief: 1.4,
  bevel: 0,
  tileSize: [128, 128],
  ambientOcclusion: .4,
  castShadow: .65,
});
const tile = material.shade(source128, { height: authoredTileHeight });
```

`tileSize`는 x/y 방향의 반복 간격이며 각 값은 네이티브 셀 단위의 정수 `2..4096`이다.
이를 생략하면 기존 재질 계산 경로를 그대로 사용한다. 저장한 설정에는 지정한 경우에만
이 항목이 들어간다.

재질의 색만 이어 붙이는 대신 **높이·명암 변화·홈·작은 강조점이 만들어지는 연속 함수**를
주기화한다. 두 방향의 경계에서 1차·2차 미분이 0인 5차 혼합 가중치를 사용하므로
무늬의 값과 기울기가 반복 경계에서 연결된다. 색은 마지막에 기존 고정 팔레트로 양자화한다.
확대, 블러, 반투명 경계나 후처리용 테두리 복사는 없다.

| 설정 | 실제 동작 |
| --- | --- |
| `tileSize` 생략 | 기존 비주기적 재질과 기존 출력 유지 |
| `tileSize` 지정 | 물체 좌표의 재질 무늬와 절차적 높이가 지정한 간격으로 반복 |
| `tileSize`가 캔버스 크기와 같고 `bevel:0` | 명시한 높이의 법선, AO, 그림자도 반대편 타일을 이웃으로 사용 |
| 가장자리 입체감이 있는 독립 물체 | 기존 실루엣의 모서리를 유지; 반복 가능한 바탕 텍스처로 자동 바꾸지 않음 |

완성된 타일은 캔버스를 채우고, **캔버스 크기의 `tileSize`와 `bevel:0`**을 사용한다.
이미지의 양 끝 픽셀을 같은 색으로 만드는 것이 목표가 아니다. 오른쪽 마지막 셀과
다음 타일의 첫 셀이 전체 주기 함수의 연속된 두 표본이어야 한다. 넓은 반복 미리보기에서
그 연결을 확인한다.

직접 그린 높이와 실루엣은 그대로 반복된다. 반대편 높이·모양을 작가가 불연속으로
작성했다면 이 API가 임의로 매끈하게 고치지 않는다. `origin`은 기존과 같은 물체 좌표이고,
반복 간격의 정수배를 더해도 무늬가 같다. 재질의 시드, 결 방향과 사용한 팔레트도 유지된다.

### 저장한 높이와 표면 맵도 같은 경계 조건 사용

```ts
import { bakePixelSurfaceLighting2D, exportPixelSurfaceMaps2D }
  from 'poku-pixel-fx/core/pixel-surface-maps';

const visibility = bakePixelSurfaceLighting2D(128, 128, authoredTileHeight, {
  mask: tile.mask.data,
  wrap: true,
  light: [-1, -.4, .8],
  occlusionRadius: 8,
  shadowDistance: 32,
});
const maps = exportPixelSurfaceMaps2D(tile, {
  normalConvention: 'opengl', heightRange: [-4, 12],
  lighting: { wrap: true, light: [-1, -.4, .8] },
});
```

`wrap:true`는 전체 높이·마스크의 반복이다. 광선의 실제 이동 거리는 계속 증가하고,
셀 주소만 반대편으로 넘어간다. 지정한 AO 반경과 그림자 거리, 기존 방문 셀 예산은
동일하게 적용된다. 투명한 구멍은 반복 후에도 그림자를 만드는 고체가 되지 않는다.
기본 `wrap:false`는 이전처럼 캔버스 바깥을 빈 공간으로 다룬다.

## 2. 여러 색으로 그린 원화를 유지하는 재조명

기존 `createPixelMaterial2D`는 새 재질을 하나의 명암 램프로 표현하는 도구이다.
`createPixelRelighter2D`는 **원래 그린 색과 무늬를 입력 색상으로 사용**하면서,
별도로 작성한 표면 방향에 따라 조명을 계산한다. 문양, 서로 다른 색의 천과 자수,
금속 장식에 동일한 단색 램프를 덮어씌울 필요가 없다.

```ts
import { createPixelRelighter2D } from 'poku-pixel-fx/core/pixel-relight';

const relighter = createPixelRelighter2D({
  lights: [
    { direction: [-.8, -.6, 1], color: '#ffe5bc', intensity: 1,
      castShadow: .8, shadowDistance: 40 },
    { direction: [.7, .2, .5], color: '#83b6ef', intensity: .35 },
  ],
  ambient: .22,
  ambientColor: '#c2d8f2',
  diffuseBands: 12,
  roughness: .5,
  specular: .15,
  ambientOcclusion: .55,
  occlusionRadius: 8,
  strength: 1,
  // palette: authoredFinalPalette,
  // wrap: true, // 완전한 반복 타일일 때만 사용
});
const relit = relighter.shade(albedo, {
  height: authoredHeight,
  selection: metalAndCloth,
  protectedMask: handPaintedGlints,
});
```

한 번만 사용할 때는 `relightPixelArt2D(source, options, edit)`를 사용한다.
여러 프레임을 굽는 경우 같은 `relighter`를 재사용한다.

### 작업실의 독립적인 재조명 설정

작업실의 **원화 색을 유지하는 재조명** 패널에는 자체 방향·고도·주변 밝기·거칠기·AO·그림자
설정이 있다. 이 패널의 값을 바꿔도 재질 설정이나 미리보기 레이어가 생성되지 않는다.
**재조명 레이어 추가**를 눌렀을 때 현재 그림 위에 조명 레이어만 추가한다.
반복 타일의 조명은 이 패널의 독립적인 경계 연결 옵션으로 지정한다.

이미 별도로 만든 재질 미리보기가 있다면 버튼을 누를 때 그 미리보기도 함께 확정된다.
저장한 원래 그림에만 조명 레이어를 추가하려면 재질 미리보기를 먼저 취소한다.
재조명 패널을 조절하는 행위 자체가 원화를 새 재질로 교체하지는 않는다.

### 조명 모델과 데이터 우선순위

기본 확산광은 법선과 빛 방향의 내적으로 계산한다. `diffuseBands`는 이를 2~64개의
명시한 단계로 나누며 기본값은 8이다. 0을 지정하면 연속 응답을 사용한다. 반사는
거칠기에 따라 폭과 강도가 바뀌는 정형화된 하이라이트이다. 여러 광원의 색과 주변광은
sRGB 바이트가 아닌 **선형 광량**에서 더하고, 원화 색에 적용한 뒤 다시 sRGB로 변환한다.
최종 출력은 여전히 네이티브 픽셀이고, 공간적으로 섞거나 흐리지 않는다.

1. `edit.normal`을 지정하면 해당 법선을 사용한다. 유한한 비단위 벡터는 정규화한다.
2. `edit.height`만 지정하면 그 높이로 법선을 다시 만든다. 이전 채널에 남은 법선을 재사용하지 않는다.
3. 둘 다 없으면 `source.channels.normal`과 `source.channels.height`를 사용한다.
4. 어떠한 기하 데이터도 없으면 +z를 향한 평면으로 취급한다. RGB에서 높이를 추정하지 않는다.
5. 그림자 또는 AO를 실제로 계산하려면 명시한 높이가 필요하다. 법선만으로 차폐를 추정하지 않는다.

직접 작성한 높이에서 법선을 구할 때 실루엣 밖의 픽셀을 가짜 높이 0으로 간주하지 않는다.
양쪽 이웃이 있으면 중심 차분, 한쪽만 있으면 단측 차분을 사용한다. 따라서 균일한 경사의
평면은 외곽이나 구멍 옆에서도 같은 방향을 유지한다. 둥근 가장자리를 원하면 높이에
실제 경사를 작성하거나 기존 재질의 bevel로 만든다.

| 옵션 | 기본값 | 범위·의미 |
| --- | --- | --- |
| `lights` | 흰색 광원 1개 | 최대 8개; 빈 배열은 주변광만 사용 |
| 광원 `intensity` | `.85` | `0..8`, 선형 광량 |
| `ambient`, `ambientColor` | `.2`, 흰색 | 주변 밝기 `0..4`와 색 |
| `diffuseBands` | `8` | `0` 또는 정수 `2..64` |
| `specular`, `roughness` | `.12`, `.6` | 반사 강도 `0..2`, 거칠기 `0..1` |
| `ambientOcclusion`, `occlusionRadius` | `0`, `8` | AO 강도 `0..1`, 반경 정수 `1..32` |
| 광원 `castShadow`, `shadowDistance` | `0`, `32` | 차폐 강도 `0..1`, 거리 정수 `1..128` |
| `strength` | `1` | 원본과 조명 결과의 선형 광량 혼합; 0은 정확한 원본 |
| `palette` | 없음 | 최종 RGB를 지정한 팔레트에 Oklab 최근접 대응; 디더 없음 |
| `wrap` | `false` | 전체 높이/실루엣을 반복하여 법선과 차폐 계산 |

선택과 보호 영역은 쓰기 범위이다. 그 밖의 높이도 주변 표면에 그림자를 드리울 수 있다.
원본 RGBA, 숨은 RGB와 독립 실루엣, 높이·법선·재질 ID, 발광/HDR, 소켓과 나머지 metadata는
변경하지 않는다. 출력 픽셀과 마스크는 별도 버퍼이며, 수정하지 않는 채널과 metadata는
기존 참조를 유지한다. `strength:0`에서는 최종 팔레트 교체도 실행하지 않는다.

컴파일된 옵션은 동결된 복사본이다. 저장할 광원 방향은 입력 수치를 그대로 보존하며,
계산 내부에서만 정규화한다. 저장→다시 열기→재저장을 반복해도 정규화 오차가 옵션에
누적되지 않는다.

**이 기능은 기존 그림에서 조명을 제거하거나 원래 반사율을 복구하지 않는다.** 이미 명암이
그려진 픽셀에 적용하면 그 명암도 입력 색상에 포함된다. 조명을 완전히 따로 조절하려면
원래 색상과 높이·법선을 분리해서 작성한다. 조정 미리보기는 항상 같은 입력에 다시
적용하고, 이미 재조명한 결과를 계속 입력에 넣어 명암을 누적하지 않는다. 물체의 겹친
여러 깊이, 투과·굴절, 전역 조명이나 물리적 재질 시뮬레이션은 이 기능의 범위가 아니다.

## 3. 애니메이션 전체에서 공통 팔레트 추출

각 프레임을 따로 양자화하면 같은 색이 프레임마다 서로 다른 대표색으로 바뀔 수 있다.
`extractPixelAnimationPalette2D`는 모든 cel을 읽고 한 개의 공통 팔레트를 만든다.
그 팔레트로 컴파일한 mapper를 전체 프레임에 적용한다.

```ts
import { extractPixelAnimationPalette2D, createPixelPaletteMapper2D }
  from 'poku-pixel-fx/core/pixel-palette';

const frames = [
  { sprite: cel0, duration: 100 },
  { sprite: cel1, duration: 70, protectedMask: irisAndGlintMask },
  { sprite: cel2, duration: 160 },
];
const palette = extractPixelAnimationPalette2D(frames, {
  colors: 24,
  locked: ['#10223b', '#ffe6af', '#8ff8d8'],
  weighting: 'equal-frame',
  iterations: 8,
});
const mapper = createPixelPaletteMapper2D(palette);
const mapped = frames.map(({ sprite, selection, protectedMask }) =>
  mapper.remap(sprite, { selection, protectedMask }));
```

프레임마다 크기와 선택/보호 영역이 달라도 된다. `selection`과 `protectedMask`는
각 프레임 descriptor에 지정한다. 완전히 투명하거나 실루엣 밖인 셀, 미선택 셀,
보호한 셀은 추출에 기여하지 않는다. 잠근 색은 원래 순서와 값으로 남는다.

| `weighting` | 가중 방식 | 용도 |
| --- | --- | --- |
| `equal-frame` (기본) | 각 비어 있지 않은 cel의 총 유효 알파를 1로 정규화 | 큰 cel이 작은 cel을 압도하지 않는 공통 팔레트 |
| `duration` | cel별 알파 정규화 후 표시 시간 비율 적용 | 오래 표시되는 포즈에 더 많은 색 예산 배분 |
| `pixel` | 모든 유효 셀의 알파를 그대로 누적 | 같은 셀 밀도로 큰 합성 이미지처럼 분석 |

표시 시간은 같은 단위의 양수이면 되고 단위 자체는 사용하지 않는다. 프레임별 일부
픽셀의 상대적 투명도는 세 방식 모두 반영한다. `equal-frame`에서는 전체가 희미한 cel도
하나의 비어 있지 않은 프레임으로 같은 총 가중치를 가진다. 빈 cel은 시간과 무관하게
색 예산에 영향을 주지 않는다.

거대한 가로 시트를 만들지 않고 입력 버퍼들을 순차적으로 누적한다. 기존과 같이 정확한
색 히스토그램은 8,192색까지 유지하고, 그보다 많으면 최대 32,768개의 RGB 구간과 원본
색의 가중합을 사용한다. 상한은 4,096개의 프레임 descriptor와 총 134,217,728개의 입력 셀이다.
입력 버퍼를 복제하거나 프레임마다 별도의 거대한 histogram을 보관하지 않는다.
같은 입력과 설정을 다시 실행하면 같은 결과이며, 프레임 사이에 숨은 학습 상태가 없다.

공통 팔레트는 색의 대표값 변동을 막는 도구다. 움직임 때문에 생긴 실루엣 변화,
실제 조명 변화, 서로 다른 crop origin에서 디더를 적용한 경우의 무늬 이동까지 자동으로
제거하지 않는다. 중요한 눈·자수·발광색은 `locked` 또는 보호 영역으로 명시한다.

## 검증과 재현 가능한 원본 크기 예제

```sh
npm run build
node --test tests/pixel-relight.test.mjs tests/pixel-seamless.test.mjs tests/pixel-animation-palette.test.mjs
node tools/preview-pixel-art-pro.mjs
```

새 검사는 선형 광량의 알려진 회색 값, 기울어진 평면의 해석적 법선, 타일 경계 너머
절벽의 해석적 그림자, 명시적으로 반복한 큰 높이 지도와의 일치, 전체 애니메이션의
알파·시간 가중 중심색, 잠금 색·보호 영역·정확한 알파와 저장 옵션의 재현성을 다룬다.

[예제 결과](previews/pixel-art-pro/README.md)는 이 API로 직접 만든 독립적인 작성 예제이다.
원본 크기 비교와 3배 최근접 확대가 함께 있으며 기존 FX 카탈로그를 교체하지 않는다.
수치 검사가 통과했다는 사실과 그림의 미술적 완성도는 서로 다른 판단이다.
