# Pixel Art Lab — 형태, 재질, 명암을 따로 작성하기

## 목표와 기존 효과 보존

자연물의 모양을 적은 수의 직선으로 만들고, 각 면을 거의 같은 색으로 채운 뒤
작은 무늬를 반복하면 벡터 그림에 도트 필터를 씌운 듯한 결과가 생기기 쉽다.
이 개선은 **형태 → 부피 → 재질 → 작은 강조점**을 서로 독립적으로 작성할 수 있게 한다.
기존 `src/fx/`와 `src/3d/effects/`의 효과 원본, Painter 기본값, 팔레트와 재생 방식은 바꾸지 않는다.

| 작성 단계 | 추가된 도구 | 직접 조절하는 것 |
| --- | --- | --- |
| 실루엣 | 네이티브 곡선 채움, 유기형 마스크 | 외곽의 곡률, 비대칭, 구멍, 오목한 형태 |
| 부피 | 명시한 높이 + 유클리드 거리 기반 가장자리 | 둥근 바위, 검날의 능선, 천의 큰 주름 |
| 재질 | 5종의 서로 다른 구조, 여러 크기의 연속 무늬 | 균열, 광물, 브러싱, 나뭇결, 직조, 내포물 |
| 명암 | 고정 팔레트, 방향광, 거칠기 | 어두운 틈, 면 밝기, 반사, 선택적 가장자리 마모 |
| 편집 | 영역 선택, 보호 마스크, 원본을 보존하는 레이어 | 원하는 부분만 재질 교체, 얼굴·자수·장식 보존 |
| 검토 | 평탄한 색 영역·직선 윤곽·고립 색 점 진단 | 원본과 결과 비교, 검토 위치와 수치 |

## 브라우저에서 사용

```sh
npm ci
npm run build
npm run gallery
```

`http://127.0.0.1:8080/gallery/pixel-art-lab.html` 또는 갤러리/Studio의
**Pixel Art Lab** 링크를 연다. 별도 로그인이나 생성 서비스가 필요하지 않다.

1. **돌길·바위·검날·천·수정** 예제 중 하나를 고르거나 PNG를 가져온다.
2. 돌·바위는 **유기적 윤곽**을 켜서 직선형 비교 도형과 형태 차이를 확인한다.
3. 재질, 팔레트, 무늬 간격, 세부 표현, 높낮이와 가장자리 폭을 조절한다.
4. 빛 방향·고도와 주변 밝기로 큰 명암이 먼저 읽히는지 살펴본다.
5. 원본에서 연결된 비슷한 색을 클릭해 영역을 선택한다. Shift 클릭은 선택을 더한다.
   선택 칠하기/지우기와 **디테일 보호** 브러시로 적용 범위를 직접 제한할 수 있다.
6. **선택 영역에 재질 적용**으로 레이어를 추가한다. 실행 취소/다시 실행은 이 적용 단위를 되돌린다.
7. **원본 크기 PNG**와 **프로젝트 저장**으로 결과를 내보낸다. 현재 미리보기도 저장 대상이다.

가져온 PNG는 즉시 덧칠하지 않는다. 사용자가 재질 설정이나 선택을 바꾼 시점부터
새 미리보기가 시작된다. 작업실 PNG 입력은 512×512 이하이며 자동 확대하지 않는다.
프로젝트 API는 최대 1,048,576셀, 32레이어와 총 레이어 셀 예산을 검사한다.

미리보기는 화면의 실제 장치 픽셀을 기준으로 정수 배율을 사용한다. 화면이 좁으면
스크롤하며 볼 수 있고, **1×**와 명암/높이/법선/진단 보기를 함께 확인한다.
PNG는 확대 배율, 선택 영역 표시와 진단 오버레이를 포함하지 않은 네이티브 출력이다.
프로젝트에는 원본 RGBA, 독립 실루엣, 재질 설정, 시드, 선택/보호 영역과 명시한 높이를 저장한다.
PNG를 다시 읽을 때의 색상/알파 처리는 브라우저 이미지 디코더를 따르므로, 원본 버퍼와
재질 채널의 정확한 반복 편집에는 프로젝트 파일을 사용한다.

## 1. 곡선을 네이티브 픽셀로 채우기

```ts
import {rasterizePixelContour2D, createOrganicSilhouette2D} from 'poku-pixel-fx';

const shape = rasterizePixelContour2D(96, 64, [
  {kind:'move', to:[7,35]},
  {kind:'cubic', control1:[8,7], control2:[76,2], to:[87,31]},
  {kind:'quadratic', control:[90,59], to:[46,58]},
  {kind:'quadratic', control:[11,59], to:[7,35]},
  {kind:'close'},
]);
const rounded = createOrganicSilhouette2D(96,64,{
  seed:41, inset:2, irregularity:.48, lobes:5,
});
```

`rasterizePixelContour2D`는 line/quadratic/cubic 명령을 받고 실제 픽셀 중심을
기준으로 이진 마스크를 만든다. even-odd 규칙으로 구멍과 겹친 경로를 처리하며,
다음 move 또는 경로 끝에서 열린 부분 경로를 닫는다. 곡선 분할 기본 오차는
네이티브 0.125셀이다. 공유 경계는 half-open 규칙을 사용한다.

`createOrganicSilhouette2D`는 타원에 부드러운 비대칭을 더한 시작 형태이다.
셀을 무작위로 지우거나 적은 꼭짓점의 다각형으로 근사하지 않는다.
돌의 의도한 깨짐, 캐릭터의 신체, 잎의 뾰족한 끝은 직접 작성한 곡선/직선 경로로 만든다.
진짜 네이티브 해상도가 높을수록 작성 가능한 디테일이 늘어난다. 화면 확대는 새 디테일을 만들지 않는다.

## 2. 재질과 높이를 함께 작성하기

```ts
import {createPixelMaterial2D, hex} from 'poku-pixel-fx';

const sprite = {
  w:shape.w, h:shape.h,
  pixels:Uint32Array.from(shape.data,v=>v?hex('#455564'):0),
  mask:shape,
};
const stone = createPixelMaterial2D({
  kind:'stone', seed:41, scale:15, detail:.65, relief:3, bevel:5,
  roughness:.65, light:[-.67,-.74,.8], ambient:.18,
});
const result = stone.shade(sprite, {
  // selection, protectedMask and height use the full native raster's dimensions.
  // height: authoredHeight,
  // selection: stoneRegion,
  // protectedMask: handPaintedDetails,
  origin:[0,0],
});
// result.channels contains material IDs, native height and normalized XYZ normals.
```

### 재질의 차이

- **돌:** 휘어진 큰 덩어리, 중간 크기의 광물 변화, 불연속 균열과 작은 홈.
- **금속:** 방향성 브러싱, 드문 흠집, 능선과 조명에 따르는 좁은 반사.
- **나무:** 흐르는 성장 무늬, 길이 방향의 섬유와 홈.
- **천:** 날실/씨실의 교차와 미세한 털결. 큰 주름은 높이 지도로 따로 작성한다.
- **수정:** 내부의 흐르는 결, 내포물, 방향성 반사. 의도한 결정 면은 보존한다.

색상은 제공한 팔레트에서만 선택한다. 기본 재질별 팔레트는 각각 12색이며,
사용자 팔레트와 별도 명암 구간(`thresholds`)도 지원한다. 빛이나 재질이
필요로 하지 않는 색을 모든 결과에서 강제로 사용하지 않는다.

`scale`은 무늬의 큰 간격이고 `detail`은 구조 강도이다. `relief`는 절차적 표면 높이,
`bevel`은 실루엣 안쪽으로 들어가는 가장자리 폭이다. `roughness`는 재질별 반사 표현을
조절한다. `light`는 표면에서 광원을 향하는 벡터이며 +x는 오른쪽, +y는 아래,
+z는 관찰자 쪽이다. `grainAngle`은 나뭇결·브러싱·직조의 방향을 바꾼다.

색만 보고 깊이나 물체 구조를 추측하지 않는다. 명시한 `height`가 실제 큰 부피이고,
그 위에 재질 요철과 가장자리를 더한다. 입력 높이는 `relief` 값에 의해 늘어나지 않는다.
선택 영역의 경계는 인위적인 새 모서리를 만들지 않는다. 실루엣의 빈 공간과
캔버스 밖을 기준으로 실제 가장자리까지의 유클리드 거리를 계산한다.

원본 알파·실루엣·보호 픽셀·기타 metadata/HDR은 보존한다. 재질 함수는 발광을
생성하지 않으며, 기존 `MaterialChannels2D`가 있으면 수정하지 않은 셀의 채널도 유지한다.
재질 함수 자체는 별도의 GPU 셰이더가 아닌 CPU 작성/베이크 도구이다.
애니메이션에서는 결과를 저장·캐시해서 기존 스프라이트 렌더러로 사용한다.

### 물체와 함께 움직이는 무늬

패턴은 시드와 명시한 물체 좌표만으로 정해진다. sprite의 배치용 x/y와 매 프레임 RNG는
무시한다. 잘라낸 조각은 `origin:[cropX,cropY]`로 원래 좌표를 유지한다.
무한 재질 영역의 정확한 crop 일치를 확인할 때는 `bevel:0`을 쓴다. 가장자리 기능을 켜면
잘린 마스크의 새 경계가 실제 새 모서리로 계산되기 때문이다.

## 3. 원본을 보존하는 저장 가능한 프로젝트

```ts
import {createPixelArtProject2D,renderPixelArtProject2D,
  serializePixelArtProject2D,parsePixelArtProject2D} from 'poku-pixel-fx/authoring';

const project = createPixelArtProject2D(sprite,'My stone');
project.layers.push({name:'Weathered stone',material:stone.options});
const saved = serializePixelArtProject2D(project);
const reopened = parsePixelArtProject2D(saved);
const raster = renderPixelArtProject2D(reopened);
```

`poku-pixel-art/v1`은 FX 타임라인의 `poku.project/v1`과 구분되는 네이티브 표면
작성 문서이다. 모든 미리보기는 저장된 원본에서 레이어를 재실행하므로 덧칠 노이즈가
누적되지 않는다. 선택/보호/높이와 시드가 같으면 색상·높이·법선 채널을 재현한다.
기존 FX Studio의 프로젝트를 임의로 이 형식으로 변환하지 않는다.

## 4. 진단을 미술적 판단과 분리하기

```ts
import {diagnosePixelArt2D} from 'poku-pixel-fx';
const report=diagnosePixelArt2D(result,{
  expectedStyle:'organic', colorTolerance:10, minFlatArea:48,
  flatRegionRatio:.12, minStraightRun:12,
  // protected: intentionallyFlatOrDetailedRegions,
});
```

| 값 | 측정 내용 |
| --- | --- |
| `dominantFlatRegionRatio` | 가장 큰 연결된 유사색 영역 / 분석 대상 셀 |
| `paletteSize` | 알파 차이를 제외한 실제 표면 RGB 색 수 |
| `longestStraightRun` | 수평·수직·±45도 방향의 가장 긴 직선 윤곽 |
| `isolatedColorRatio` | 주변 8셀에 유사색이 없는 내부 셀 / 분석 대상 셀 |

색 영역은 처음 셀의 색과 비교한다. 작은 색차가 연달아 이어진다고 전체 그라데이션을
한 단색 영역으로 합치지 않는다. 보호 영역은 분석에서 제외하지만 물리적인 실루엣에는
남겨서 보호 표시가 가짜 구멍을 만들지 않는다.

`organic`은 평탄한 면·직선·과도한 고립 점을 검토한다. `cel-shaded`는 넓은 단색 면,
`geometric`은 단색 면과 직선을 의도한 표현으로 허용한다. 스타일을 생략하면 측정만 한다.
색을 많이 쓰거나 무늬를 많이 넣는 것이 항상 더 좋은 픽셀아트라는 점수는 만들지 않는다.

## 검증과 직접 볼 수 있는 예제

```sh
npm run test:pixel-art
npm run preview:pixel-art
GPU_BROWSER_PATH=/path/to/chromium npm run test:browser:pixel-art
```

`tools/preview-pixel-art.mjs`는 새로운 도구의 입력/결과 비교를 생성한다.
비교의 원본은 동일 형태의 단색 예제이며 기존 효과의 변경 전/후 이미지가 아니다.
회귀검사는 곡선의 수학적 채움, 팔레트/알파/선택 보존, 높이와 거리 계산,
프로젝트 재현과 실제 브라우저 저장/열기를 확인한다.

자동 재질은 표면 구조를 만드는 도구이다. 이미지 한 장에서 캐릭터의 해부학,
의상의 의미, 장식의 설계나 완성된 원화를 자동 복원하지 않는다. 큰 형태와 재질을
잡은 다음 얼굴·모서리·자수·하이라이트는 실제 픽셀 크기에서 직접 조정한다.
