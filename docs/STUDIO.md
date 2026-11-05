# POKU Studio 제작 안내

0.4.0은 기존 코드 기반 이펙트 라이브러리에 **저장 가능한 제작 프로젝트, 브라우저 Studio, 캐릭터 자산, 픽셀 스타일 도구, WebGPU 후처리, 게임용 자산 묶음과 Rust/wgpu 기준 플레이어**를 더합니다. 기존 Painter 함수는 계속 사용할 수 있습니다.

## 1. 시작하기

Node.js 20 이상을 사용합니다. 소스 체크아웃에서는 다음을 실행합니다.

```bash
npm ci
npm run build
npm run gallery
```

- 제작 화면: `http://127.0.0.1:8080/gallery/studio.html`
- 전체 효과 갤러리: `http://127.0.0.1:8080/gallery/`
- 3D 제작 화면: `http://127.0.0.1:8080/gallery/3d.html`

빌드한 패키지를 설치한 환경에서는 `poku-fx gallery`로 같은 화면을 실행합니다. 패키지에 컴파일된 CLI와 갤러리를 포함하므로 소비자 프로젝트에 TypeScript/esbuild를 설치할 필요는 없습니다. 이 변경은 npm 게시 자체를 수행하지 않습니다.

현재 한국어 UI의 모든 한글 문자를 포함하는 SUIT 글꼴과 라이선스를 함께 배포합니다. 외부 폰트 서비스 없이 제작 화면을 읽을 수 있으며, 글꼴의 정확한 출처와 문자 범위는 [글꼴 안내](../gallery/fonts/NOTICE.md)에 기록했습니다.

## 2. 처음부터 형태와 동작을 갖춘 효과 만들기

왼쪽 템플릿 중 하나를 선택하면 설명, 경로, 시간 트랙, 팔레트, 레이어와 의도서 참조가 함께 설정됩니다.

| 템플릿 | 주된 편집 대상 | 확인할 장면 |
| --- | --- | --- |
| 투척 검 | 비행 경로, 회전 속도, 이동 시간, 금속/물/돌/얼음 접촉 | 검의 형태가 회전 중에도 보이는지, 접촉이 비행 종료와 맞는지 |
| 검격 잔상 | 날의 진행, 리본 폭, 잔상 길이, 접촉 | 잔상의 끝이 주체를 따라가는지 |
| 낙뢰 | 굵은 주 방전, 가는 분기, 접지 | 가장 강한 방전이 어느 곳에 닿는지 |
| 폭발 | 압력 전면, 파편, 발광, 냉각 연기 | 빠른 팽창 뒤에 무게 있는 파편과 느린 연기가 남는지 |
| 불꽃 | 연결된 불의 면, 상승, 불티, 연기 | 불의 면과 보조 입자가 구별되는지 |
| 포털 | 입구, 앞뒤 테두리, 내부 회전 | 구멍과 외곽선이 작은 크기에서도 읽히는지 |

`examples/projects/`에는 이 여섯 프로젝트와 캐릭터/ACT/3D 프로젝트가 있습니다. `examples/recipes/`의 재사용 팩에는 설정, 의도서, 샘플 시점, 다음 제작에서 확인할 메모가 포함됩니다. 이 팩을 새 프로젝트에 사용해도 이전 결과의 검토 승인을 자동으로 이어받지는 않습니다.

권장 작업 순서는 주형태 → 움직임 → 접촉 → 보조 요소 → 발광입니다. 레이어의 **단독** 버튼과 **실루엣** 보기를 사용하면 주형태가 독립적으로 성립하는지 볼 수 있습니다. 새 템플릿은 구조가 갖춰진 편집 출발점이며 특정 게임의 최종 미술 승인을 뜻하지 않습니다.

### 시간과 경로

본체·잔상·발광·파편·환경 트랙의 키를 각각 움직일 수 있습니다. 곡선에서 클릭은 키 추가, 드래그는 시간/값 수정, 우클릭은 키 삭제입니다. 투척 검은 네 제어점의 Bézier 경로와 자체 회전을 독립적으로 편집합니다. `이동 시간`을 늘릴 때 필요한 접촉/회복 구간도 확보합니다. 전체 클립 길이를 별도로 줄이면 의도적인 crop입니다.

재질 선택은 접촉 응답을 바꿉니다. 금속은 날카로운 불티, 물은 방울과 수면 파문, 돌은 무거운 조각, 얼음은 밝은 결정 조각을 만듭니다. 보조 밀도와 발광 세기는 독립 변수입니다.

### 의도와 검토 기록

한눈에 전달해야 할 의미와 의도서 경로를 저장할 수 있습니다. 기존 visual/intent 검토 JSON을 열면 관찰과 frame range가 표시됩니다. 관찰을 클릭하면 해당 시점으로 이동하며, 기록에 layer/parameter가 있으면 관련 트랙이나 입력을 선택합니다. 기록의 실제 관람 여부나 승인 상태를 편집기가 대신 채우지 않습니다.

## 3. 캐릭터와 애니메이션

새 캐릭터 높이를 선택한 뒤 **캐릭터 제작**을 누릅니다. 기존 자산의 해상도를 UI에서 바꾸면서 장비·사용자 클립·수정 좌표를 조용히 재생성하지 않습니다. 다른 native 높이가 필요하면 새 자산을 만들거나 원본 데이터를 명시적으로 변환합니다.

기본 캐릭터는 idle/walk/run/jump와 방어·피격·격투·검·활 동작을 공통 선택기로 제공합니다. 머리, 체형, 의상, 피부, 시점과 방향을 바꾸고 클립별 장비를 선택합니다. 장비 선택의 빈 값은 해당 슬롯을 해제하는 명시적 `null`입니다. 뒤쪽 망토, 몸, 손에 가려지는 무기, 앞쪽 효과의 순서를 보존합니다.

`poku.character/v1`은 생성형 사람, 기존 생물, 데이터 기반 생물 rig, 수작업 SpriteClip을 담을 수 있습니다. 원본 캐릭터, 클립, 장비, identity와 수정 기록은 프로젝트 JSON 안에 함께 저장됩니다. `examples/character-studio/`의 네 캐릭터와 [캐릭터 API 문서](CHARACTER_STUDIO.md)를 참고하세요.

### 픽셀 수정과 의미 마스크

1. 재생을 멈추고 프레임을 고릅니다.
2. 편집 레이어에서 `body` 또는 현재 장착된 무기/망토 등의 layer ID를 고릅니다.
3. 그리기/지우기/발광/의미 마스크를 선택합니다.
4. 현재 프레임 또는 전체 프레임 범위를 선택하고 칠합니다.
5. 프로젝트를 저장합니다. 드래그 한 번은 undo 한 단계입니다.

캐릭터 color/mask 수정은 native actor 좌표로 저장하므로 raster padding이 바뀌어도 유지됩니다. 표시 중인 원화 프레임에 연결하며 외부 flip/회전과 화면 흔들림을 역변환합니다. 장비별 레이어를 지정해야 해당 장비에 수정이 적용됩니다. 수정 대상은 해당 native 레이어의 raster 영역이며 캔버스 밖에 무제한으로 도형을 추가하는 페인팅 프로그램은 아닙니다.

마스크는 추가와 해제를 지원합니다. `negativeSpace`는 투명한 빈 셀에도 의도된 여백을 기록할 수 있습니다. `skin`, `cloth`, `metal`, `featureMask` 등은 의미별 진단에 쓰입니다. 진단은 계약 위반과 휴리스틱 검토 후보를 구분하며 작가의 선택을 자동으로 삭제하지 않습니다. 전체 합성 화면의 HDR 수정은 프로젝트의 frame-indexed emission 채널에 저장합니다.

### 키 포즈, 사건과 소켓

`클립 시간 · 키 포즈 · 사건`에서 원화 갱신 FPS를 정하고, key-pose 클립은 키 시간과 hold/linear/smooth 보간을 편집할 수 있습니다. 발 접촉 키는 좌우 발 고정을 표시합니다. 접촉 사건은 추가/삭제하거나 시간을 이동할 수 있습니다. 소켓에는 위치뿐 아니라 방향 basis, 가시성과 반사 정책이 있으며 자세를 바꿔도 장착 기준을 유지합니다.

관절·장착점 표시로 실제 위치를 확인할 수 있습니다. 소켓 키 편집에서 현재 프레임을 고정한 뒤 위치·회전·가시성·보간을 수정합니다. 기본은 움직이는 소켓을 따라가는 delta 보정입니다. override/basis로 작성된 고급 트랙은 JSON/API에서도 편집할 수 있으며, 기존 방향 행렬은 임의로 회전각 하나로 축약하지 않습니다. 수작업 소켓 키와 장착 오프셋은 캐릭터 자산에 저장됩니다. event cursor는 실제 전진 재생에서만 사건을 내보내고, seek/역방향 재생에서 이미 지나간 타격을 다시 발생시키지 않습니다. root motion과 발 접촉 보정은 자산/API에서 제공하며 지형 충돌이나 게임의 이동 컨트롤러를 대신하지는 않습니다.

전신과 초상화는 색 역할과 지원되는 얼굴/머리/복장 특징을 공유하지만 해상도별로 독립적인 원화를 사용합니다. 초상화의 형태 선택지는 전신과 완전히 같지 않습니다. UI는 이를 **공유 팔레트 초상화**로 표시합니다.

## 4. 픽셀 퍼펙트와 도트 기법

기본 뷰는 CSS 배율이 아니라 실제 디스플레이 픽셀의 정수 배율을 계산합니다. 작은 창에서는 1×를 유지하며 가장자리를 자를 수 있습니다. `화면 맞춤`은 비정수 확대를 허용하는 별도 보기입니다. PNG/atlas의 native 해상도는 창 크기로 바뀌지 않습니다.

`PixelStyleProfile2D`는 native 격자, 표면 색, 알파, 발광, 외곽선과 디더 좌표를 저장합니다. 팔레트 고정은 **후처리 후의 최종 RGB**까지 다시 제한하고 알파 coverage는 보존합니다. WebGPU와 CPU가 같은 팔레트 계약을 사용합니다. raw color/HDR을 받는 게임 렌더러도 이 마지막 정책을 적용해야 합니다. 제공되는 Rust player는 저장된 정책을 읽습니다.

색/명암/실루엣/빈틈/시간 변화 보기, onion skin, 한 프레임 이동을 함께 사용하세요. object/world/screen 좌표 디더는 실제 외부 변환과 화면 offset을 반영합니다. 화면 흔들림을 포함하지 않는 게임용 raw atlas와 화면 미리보기의 screen 기준은 의도적으로 구별합니다. 이미 투영된 3D 합성 화면에는 하나의 object/world 역변환이 없으므로 3D 후처리 디더는 screen 기준만 지원하고 다른 선택은 명시적인 오류로 알려줍니다.

API에는 indexed palette cycling, 선택적 외곽선, 작가가 지정한 AA/subpixel 클러스터, 해상도별 형태 보정, height→normal, material ramp 광원도 포함됩니다. 모든 고급 기법이 별도 브러시 버튼으로 나열되지는 않습니다. 실행 가능한 12개 예제는 `src/examples/pixel-toolkit.ts`, 사용법은 [픽셀 도구 문서](PIXEL_TOOLKIT.md)에 있습니다.

## 5. GPU와 3D

Studio에서 WebGPU HDR을 선택하면 HDR 준비, bloom, tone mapping, grading과 최종 팔레트 처리를 GPU에서 실행합니다. 기존 JavaScript Painter가 만드는 도형/시뮬레이션 전체가 자동으로 GPU로 변환되는 것은 아닙니다. GPU에서 도형까지 만들려면 DrawIR/GPU particle API를 사용합니다.

렌더러가 지원되지 않거나 장치가 손실되면 CPU로 전환하며 이유를 표시합니다. 초기화/업로드/제출/표시 시간과 사용량을 구분합니다. timestamp query를 사용할 수 없으면 GPU 실행 시간을 숫자로 추측하지 않습니다. 소프트웨어 adapter와 실제 하드웨어의 성능은 별도로 측정해야 합니다.

3D 화면은 프로젝트와 `RenderProfile3D`의 `version: 1` 데이터를 열고 저장합니다. 카메라, 조명, native size, grid, background, camera motion과 cinematic 설정을 CLI와 공유합니다. GPU 선택은 CPU geometry/volume 단계 뒤의 finishing을 교체합니다. 현재 PNG는 native 해상도로 캡처합니다.

[GPU 문서](GPU_RENDERING.md)는 DrawIR 한도, 알파 정확도, 볼륨 합성, 자원 수명과 실제 검증 장치를 기록합니다. [Rust 예제](../native/README.md)는 저장된 자산을 게임의 GPU 루프에 연결하는 headless 기준 구현입니다.

## 6. 내보내기

Studio의 **Atlas 내보내기**는 worker에서 프레임을 만들고 페이지 단위로 인코딩합니다. 진행률을 표시하고 취소할 수 있습니다. ZIP에는 PNG, 필요한 linear HDR sidecar, `asset.json`, `project.json`이 들어갑니다. 별도 파일도 내려받을 수 있습니다.

| 항목 | 브라우저 제작 기본 한도 |
| --- | --- |
| 프레임 | 최대 4,096 |
| native frame | 최대 4,194,304 셀 |
| atlas 한 변 | 2,048px |
| 페이지 | 최대 16 |
| 인코딩한 결과 파일 합계 | 128 MiB |
| worker in-flight | ACK를 기다리는 프레임 1개 |
| 프레임 cache | 16 MiB |
| 시뮬레이션 checkpoint | 8 MiB, 최대 32개 |

이 한도는 브라우저 전체 프로세스 메모리의 상한이 아닙니다. 현재 페이지/임시 인코더와 JSON 데이터도 메모리를 사용합니다. 더 큰 작업이나 중복 프레임 dedup은 CLI를 사용합니다.

```bash
npm run render -- --project examples/projects/thrown-blade.poku-project.json --bundle --trim --deduplicate --max-texture 2048
npm run render -- --project examples/projects/wayfarer-sword.poku-project.json --bundle
npm run render -- --project examples/projects/frost-native.poku-project.json --bundle
```

`asset.json`은 가변 frame duration, page/rect, untrimmed 크기, trim offset, pivot, sockets, events, 태그, project hash와 파일 SHA-256을 보존합니다. engineVersion과 선택적 sourceRevision도 기록하며, CLI에서 원본 소스 파일이 있는 경로는 sourceSha256을 추가합니다. 브라우저·recipe·character의 모든 출력에 개별 코드 파일 hash가 있는 것은 아닙니다. 3D 묶음은 저장 당시 조명을 재현하기 위한 radiance/AO 채널도 지원합니다. 이는 다른 카메라로 다시 투영할 수 있는 3D mesh/rig 파일은 아닙니다.

후처리 정책도 명시적으로 저장합니다. 기본 2D CPU 프로젝트의 `legacy` 합성은 선형 HDR을 사용하는 native 기준 렌더러와 다릅니다. native의 외형 일치 검증은 `cinematic` 또는 `linear-transparent`로 선언한 지원 정책의 범위입니다. legacy 자산은 최종 RGBA를 굽거나 native 호출에서 cinematic 전환을 명시해야 하며, 이 전환은 외형을 바꿀 수 있습니다.

상세 포맷과 Aseprite 왕복은 [ASSET_EXPORT.md](ASSET_EXPORT.md), [ASEPRITE_BRIDGE.md](ASEPRITE_BRIDGE.md)를 참고하세요. PNG/JSON에는 외부 인코더가 필요하지 않습니다. GIF/MP4에는 ffmpeg가 필요합니다. Aseprite 실제 앱 왕복은 사용자가 지정한 Aseprite 실행 파일이 필요합니다.

## 7. 저장과 재생 계약

- 프로젝트 저장/열기, 자동 로컬 초안, undo/redo, Ctrl/Cmd+S 및 Z/Y를 지원합니다. 브라우저 저장 공간 오류는 상태 표시로 알려주며 명시적인 파일 저장을 사용할 수 있습니다.
- 보이는 화면의 느린 프레임은 경과 시간을 버리지 않습니다. 숨겨진 탭에서는 재생을 일시 정지합니다. 고정 tick 시뮬레이션과 내보내기 FPS는 별개입니다.
- 렌더/스타일/픽셀 수정은 생성된 프레임 cache를 비우고 시뮬레이션 state를 유지할 수 있습니다. seed/동작/geometry 변경은 런타임을 새로 만듭니다.
- 상태형 효과가 명시적 `captureState/restoreState`를 제공하면 가장 가까운 checkpoint에서 다시 진행합니다. 임의의 legacy closure를 추측해서 복제하지 않습니다. 해당 계약이 없는 stateful 효과는 뒤로 seek할 때 처음부터 재생합니다.
- 저장/불러오기와 테스트 통과는 최종 미술 승인과 다릅니다. 실제 native 장면과 재생을 확인한 관찰 기록을 별도로 남깁니다.

## 8. 검증과 추적

[개선 구현 표](IMPROVEMENT_IMPLEMENTATION.md)는 원래 보고서의 80개 항목을 코드, 사용 위치, 테스트와 남은 외부 검증에 연결합니다. 새 API의 한계와 확인하지 못한 플랫폼을 이 표에서 확인할 수 있습니다.
