# 개선 보고서 80개 항목 구현 기록

기준: 2026-11-05 전체 개선 보고서의 A/G/P/C/E/M 백로그. 릴리스 코드 기준은 0.4.0입니다. 아래 표는 **실제로 연결된 기능**, **호출 가능한 기반 API**, **현재 환경에서 확인한 범위**를 함께 적습니다. 전용 UI가 없는 고급 API, 다른 장치에서의 성능, 외부 앱/최종 미술 검토까지 모두 완료했다는 뜻으로 사용하지 않습니다.

## 핵심 변화

- 프로젝트 파일 하나로 Studio, CLI, 검토, 공유 준비, atlas와 native 자산 재생을 연결했습니다.
- 여섯 제작 recipe, 캐릭터/장비/소켓/프레임 수정, 픽셀 스타일, timeline/curve/undo를 제공합니다.
- GPU cinematic, DrawIR, 장식 compute 입자와 shared WGSL native player를 실제 구현했습니다.
- 기존 직접 blit, 긴 ACT, 빈 ID 검사, 3D 설정 불일치, 공유 metadata 손실, Aseprite socket/HDR, 설치 CLI 경로를 고쳤습니다.
- 캐시/worker/checkpoint/lazy loading은 명시적 한도와 fallback을 갖습니다.

## 실제 검증 경계

| 구분 | 확인 결과 |
| --- | --- |
| Studio/recipe/GPU 계약 | 최종 37개 통과; 별도 소켓/좌표 7개 및 marker/event 회귀 포함 |
| 캐릭터/픽셀 기존+신규 | 담당 범위 156개 통과; 소켓·디더 좌표·독립 HDR 추가 7개 통과 |
| 기존 전체 3D/quality | 175+419개 실행, 발견한 9개를 수정하여 해당 9개 재검증 통과 |
| export/review/Aseprite/install | 기존+신규75개 및 추가 manifest/8개 프로젝트 일치·HDR 보존 검사 통과 |
| 최종 통합 회귀 | export 11개(기본 합성 정책 포함), ACT marker 5개, 소켓/후처리 7개: 총23개 통과; 깨끗한 설치 패키지 별도 통과 |
| 새 recipe 출력 | 6개 모두 통과, 캔버스 바깥 그리기 경고 0; 경계 회귀를 포함한 recipe 계약 10개 통과 |
| 사이트 | portable install, React/TypeScript typecheck, production build 통과 |
| Rust | fmt/check/build, 최종 7개 contract 통과 |
| 실제 shared WGSL | 9개 DrawIR 장면+실제 frost, 34 capture, 25 비교, 61,540 RGBA 채널 최대 delta 0 |
| 실제 GPU particle | software adapter에서64compute dispatch,고정tick/seed/ID/lifetime 검증 |
| 실제3D export→native | frost 64×48, 4 frame, 49,152채널 최대 delta 0 (위 집계 포함); camera/grid/radiance/AO/trim 보존 |
| 장치 | llvmpipe LLVM20.1.2/Mesa25.2.8/OpenGL, adapter type CPU |
| 로컬 browser | root sandbox 제한으로 실행불가; sandbox를 해제하지 않고 CI에서 별도 실행 |
| physical GPU/외부 Aseprite/최종 미술 승인 | 이번 로컬 검증으로 확인했다고 주장하지 않음 |

정확한 CI 결과와 최종 commit은 연결된 PR의 Checks와 merge 기록이 기준입니다. 속도 우위, 다양한 GPU의 bit-identical 출력, 실제 게임의 모든 장면에 대한 미술 품질은 이 표의 자동 검사에서 도출하지 않습니다.

기본 recipe의 로컬 CPU 검사에는 폭발 약13.7ms/frame, 불꽃 약5.6ms/frame이라는 비용 경고가 남았습니다. 이는 해당 환경의 일회성 검사 값이며 벤치마크나 실물 GPU 수치가 아닙니다. GPU finishing은 JavaScript 도형 생성 자체의 비용을 제거하지 않습니다.

## 항목별 추적

### A. 제작 품질과 재사용

| ID | 보고서 항목 | 상태 | 구현 위치와 동작 | 범위와 확인 기준 |
| --- | --- | --- | --- | --- |
| A01 | 기존 intent와 recipe 연결 | 구현 | [recipe/project의 intentRef·notes, contact/경로/재질/시간 설정을 함께 저장](../src/authoring/recipes.ts) | 의도서 참조는 의미를 자동 판정하는 AI가 아님 |
| A02 | 의미 기반 참고 효과 검색 | 구현 | [영문/한글 의미 alias와 여러 검색어, lazy effect loader](../src/authoring/registry.ts) | 임베딩 검색 서버 없이 로컬 검색 |
| A03 | 완성형 recipe 6종 | 구현·검토 범위 명시 | [실제 렌더링 가능한 여섯 recipe와 의도서·프로젝트·재사용 팩](../src/authoring/recipes.ts) | native 정지 장면은 확인; 최종 미술 승인/실시간 관람 기록은 별도 |
| A04 | 주요 실루엣 단계 | 구현 | [고체 본체, 광학 glow 레이어 독립 및 실루엣 진단](../src/authoring/recipes.ts) | glow-off sheet를 실제 확인 |
| A05 | 독립 시간 트랙 | 구현 | [5개 독립 timing-curve 트랙과 Studio key editor](../src/authoring/recipes.ts) | 기존 모든 효과의 임의 함수까지 자동 트랙 변환하지 않음 |
| A06 | 비행/자체 회전 분리 | 구현 | [Bézier 위치와 회전 turns/s를 분리한 투척 검](../src/authoring/recipes.ts) | 회전 값을 바꿔도 같은 경로를 따라감 |
| A07 | 재질별 접촉 recipe | 구현 | [metal/water/ice/stone 접촉 반응과 접촉 metadata](../src/authoring/recipes.ts) | 현실 재료 시뮬레이션 모델이 아닌 제작용 반응 |
| A08 | 화려함의 역할별 제어 | 구현 | [body/trail/glow/debris/environment visibility·solo·density](../src/authoring/recipes.ts) | 주형태를 별도 검토 가능 |
| A09 | 파라미터 schema | 구현 | [타입·범위·단위·invalidates·protected 메타데이터](../src/authoring/parameters.ts) | 새 recipe UI/검증에 사용; legacy options의 타입은 기존 meta 기반 |
| A10 | 의도 검토를 편집기로 연결 | 구현 | [기존 observations/frameRanges JSON→시간·layer·parameter 연결](../src/authoring/review.ts) | 검토자의 판단이나 승인 플래그를 변경하지 않음 |
| A11 | 좋은 결과의 재사용 팩 | 구현 | [poku.recipe-pack/v1: project/examples/lessons/intent](../src/authoring/project.ts) | 새 출력에는 새 검토가 필요 |
| A12 | 남은 반복 횟수 지침 정리 | 구현 | [QUALITY/AUTHORING의 고정 반복 횟수 지침 정리](../docs/QUALITY.md) | 구체적인 미해결 문제와 수용 기준으로 반복 |

### G. GPU·합성·네이티브 렌더

| ID | 보고서 항목 | 상태 | 구현 위치와 동작 | 범위와 확인 기준 |
| --- | --- | --- | --- | --- |
| G01 | 실제 GPU/browser harness 실행 | 구현·환경별 검증 | [실제 browser/native/particle harness 및 CI gate](../tools/gpu-browser-harness.mjs) | 로컬 browser sandbox 불가; physical GPU 미검증 |
| G02 | 처리 단계 타이머 | 구현 | [prepare/upload/encode/present/readback/GPU query와 메모리 계측](../src/render/metrics.ts) | timestamp 미지원 시 null; 장치 전체 VRAM 측정 아님 |
| G03 | GPU cinematic | 구현 | [CPU 계약과 같은 HDR/bloom/tone/grade/finalPalette WGSL](../src/render/webgpu.ts) | 기존 2D/3D geometry는 CPU; GPU 속도 우위 미주장 |
| G04 | DrawIR·재질 명령 | 구현 | [versioned DrawIR와 CPU/GPU reference 실행](../src/render/draw-ir.ts) | rect/disc/segment/triangle/sprite/ribbon/mesh |
| G05 | GPU sprite/ribbon/mesh 배치 | 구현·알고리즘 한계 | [sprite/ribbon/mesh를 하나의 compute command batch로 처리](../src/render/draw-ir-gpu.ts) | O(pixels×primitives), exact-alpha64, tiled/indirect renderer는 아님 |
| G06 | GPU 장식 입자 | 구현 | [stable ID/hash, 고정 tick, GPU state/command buffer](../src/render/gpu-particles.ts) | 장식용; authoritative collision은 CPU/game host 유지 |
| G07 | 상주 자산·증분 업로드 | 구현 | [resident asset revision·dirty ranges·upload counters](../src/render/gpu-resources.ts) | 수정 데이터는 revision 갱신이 필요 |
| G08 | 2D 표면 발광·광학 glow 분리 | 구현 | [표면 emission과 optical light를 분리하고 앞 coverage로 감쇠](../src/render/surface2d.ts) | legacy light 모양과 기본 경로 유지 |
| G09 | 투명 fragment 진단 | 구현 | [fragment 누계/중첩/arena/재합성 진단과 명시적 한도](../src/3d/surface.ts) | 초과를 숨기지 않고 오류 처리 |
| G10 | 표현별 투명 처리 | 구현 | [exact/cutout/additive material 정책](../src/3d/surface.ts) | cutout/additive는 exact-alpha와 다른 표현 계약 |
| G11 | 공통 volume field | 구현 | [world-space extinction/source를 합산 후 한 번 적분](../src/3d/volume.ts) | 공통 field API를 사용해야 하며 CPU volume integration |
| G12 | 비동기 GPU 캡처 | 구현 | [비동기 texture capture·bounded staging·sink backpressure](../src/render/gpu-capture.ts) | 일반 프레임에 readback 없음 |
| G13 | WGSL·native renderer 재사용 | 구현·기준 runtime | [공통 WGSL과 Rust/wgpu headless scene/asset player](../native/README.md) | 게임 엔진 plugin/창 시스템/JS 자동 이식은 별도 |
| G14 | GPU 자원·capability 관리 | 구현 | [capability·한도·device loss·retry·dispose·CPU fallback](../src/render/webgpu.ts) | 주입 device의 소유권은 host에 남김 |

### P. 픽셀 퍼펙트와 도트 기법

| ID | 보고서 항목 | 상태 | 구현 위치와 동작 | 범위와 확인 기준 |
| --- | --- | --- | --- | --- |
| P01 | 직접 캐릭터 blit 통일 | 구현 | [human/creature/portrait/weapon 직접 blit의 셀 역변환 통일](../src/core/sprite-raster.ts) | flip/회전/셀 coverage 회귀 검증 |
| P02 | 정확한 표시 모드 | 구현 | [실제 DPR 픽셀 기준 정수 배율과 letterbox](../src/authoring/clock.ts) | 작은 창은1× crop; fit은 별도 옵션 |
| P03 | PixelStyleProfile | 구현 | [PixelStyleProfile2D 저장/컴파일/최종 색 정책](../src/core/pixel-style.ts) | 프로젝트와 캐릭터 native 스타일 모두 지원 |
| P04 | 좌표·반올림 계약 | 구현 | [pixel-edge 좌표·중심 역샘플·pivot/socket basis 계약](../src/core/sprite-raster.ts) | 각도만 저장해서 반사 handedness를 잃지 않음 |
| P05 | 의미 mask 기반 빈틈 진단 | 구현 | [solidSubject/negativeSpace/feature 등의 의미 진단](../src/core/pixel-tools.ts) | 의도된 빈 셀 보존, heuristic 자동삭제 없음 |
| P06 | dither/texture 좌표 선택 | 구현 | [object/world/screen pattern context와 실제 preview/export 연결](../src/authoring/edits.ts) | 투영된3D 합성 후처리는 screen만 가능 |
| P07 | 선택형 indexed palette | 구현 | [indexed palette·cycling·surface/final palette 검사](../src/core/pixel-tools.ts) | 최종 compositing 후 palette lock 별도 적용 |
| P08 | 선택적 외곽선 | 구현 | [재질/광원/occlusion을 사용하는 선택적 outline](../src/core/pixel-tools.ts) | semantic 조건은 작가가 지정 |
| P09 | banding·jaggy 시각 진단 | 구현 | [banding/jaggy/isolated cluster heatmap과 수동 patch](../src/core/pixel-tools.ts) | 계약 위반과 검토 후보 구별 |
| P10 | authored AA·subpixel 트랙 | 구현·API | [authored AA와 subpixel patch 트랙](../src/core/pixel-tools.ts) | 허용 색/셀 변화를 명시; 임의 blur 미사용 |
| P11 | 해상도별 형태 보정 | 구현·기준 자산 | [해상도별 optical patch와 native character/portrait](../src/core/pixel-tools.ts) | 사용자 자산의 모든 해상도 원화를 자동 보장하지 않음 |
| P12 | 시간 안정성 진단 | 구현 | [시간 간 changed-cell/윤곽 변화 heatmap](../src/core/pixel-tools.ts) | 의도한 변형인지 최종 판단은 작가 |
| P13 | material/normal/height 채널 | 구현·API | [height→normal·material channel·ramp lighting](../src/core/material-surface.ts) | 선택한 source channels에 적용 |
| P14 | 재질·클러스터 도구 모음 | 구현 | [12개 실행 가능한 material/cluster/AA/dither 예제](../src/examples/pixel-toolkit.ts) | 독립 예제로 기법 비교 |

### C. 캐릭터·애니메이션

| ID | 보고서 항목 | 상태 | 구현 위치와 동작 | 범위와 확인 기준 |
| --- | --- | --- | --- | --- |
| C01 | 기존 동작 선택 통합 | 구현 | [12개 사람 동작을 공통 animation/actor adapter에 통합](../src/core/character-animation.ts) | 기존 액션 모듈 재사용 |
| C02 | 기존 외형 UI 연결 | 구현 | [외형·방향·시점·팔레트·장비 UI 및 저장](../gallery/studio.ts) | 기존 자산의 사용자 설정을 보존 |
| C03 | CharacterAsset | 구현 | [human/creature/rig/sprite CharacterAsset 모델](../src/core/character-asset.ts) | 유효성 검사와 decoded cell budget |
| C04 | 장비 슬롯·레이어 | 구현 | [장비 슬롯/클립별 loadout/semantic 가림/앞뒤 layer](../src/core/character-asset.ts) | 검/활 generator는 grip geometry를 재사용 |
| C05 | 방향 포함 소켓 | 구현 | [position+basis+visibility+mirrorPolicy 소켓과 키 편집](../src/core/character-animation.ts) | socket basis를 export/Aseprite/native까지 전달 |
| C06 | 원화·키 포즈 기준 팩 | 구현·검토 범위 명시 | [네 original reference character, native sheet/atlas/playback](../src/examples/character-studio.ts) | 정지 native 관찰 기록; full-speed 관람 미기록 |
| C07 | 발 고정·root motion | 구현·API | [root track·contact key·foot-plant solver](../src/core/character-animation.ts) | 게임 지형 solver/전체 locomotion controller는 아님 |
| C08 | 사건 adapter 통합 | 구현 | [seek/advance 분리 cursor, ACT onHit/3D cue adapter](../src/core/character-animation.ts) | fractional loop 경계/빈 track/큰 jump 보호 |
| C09 | SpriteClip 배우 | 구현 | [SpriteClip source, mask/HDR/socket를 actor로 연결](../src/core/character-asset.ts) | 수작업 clip도 기존 FX에 부착 |
| C10 | 프레임 보정 지속 저장 | 구현 | [유일 ID의 cel patches, clip/frame/native좌표 저장](../src/core/character-asset.ts) | 열기/재수정/undo에서 수정 유지 |
| C11 | 의미 mask 편집 | 구현 | [레이어별 named masks, +/- membership, empty-space 지원](../src/core/character-asset.ts) | 가시 색과 의미 mask를 구별 |
| C12 | 전신·초상화 identity | 구현·특징 범위 명시 | [색 역할과 지원되는 얼굴/머리/복장 identity 공유](../src/core/character-identity.ts) | 전신과 portrait vocab 전체가 동일하지 않음 |
| C13 | 생물 rig/자산 데이터화 | 구현 | [새 생물 rig·primitive·animation을 JSON 데이터로 정의](../src/core/creature-asset.ts) | 기존 종 renderer 보존 |
| C14 | 머리·천·표정 2차 동작 | 구현·API | [bounded spring bake·secondary angle·blink/gaze keys](../src/core/character-animation.ts) | cloth physics/일반 skeletal physics 엔진은 아님 |

### E. 에디터·교환·내보내기

| ID | 보고서 항목 | 상태 | 구현 위치와 동작 | 범위와 확인 기준 |
| --- | --- | --- | --- | --- |
| E01 | ACT 길이 계산 수정 | 구현 | [ACT 자연 종료·hit-stop·hold 공유 계산, 명시 crop](../src/render/export.ts) | 임의8초 cap 제거, 비종료 오작동은 오류 |
| E02 | 빈 ID 검사 실패 처리 | 구현 | [미매칭 ID는 nonzero exit](../tools/check.mts) | 0개 선택을 통과로 보고하지 않음 |
| E03 | 공통 프로젝트 설정 | 구현 | [하나의 resolved project를 render/review/share/export에 사용](../tools/lib/project-render.mts) | project/source hash와 intent resolution 보존 |
| E04 | variant·3D·ACT 검토 | 구현 | [2D/ACT/3D/recipe/character variant별 review 산출물](../tools/review.mts) | 변경된 출력에 이전 관람 기록 자동 재사용 없음 |
| E05 | 공통 3D RenderProfile | 구현 | [공통 camera/lights/native size/background/grid/motion/finish](../src/render/profile3d.ts) | 3D source의 radiance/AO도 bundle/native에 유지 |
| E06 | 공유 원본 manifest | 구현 | [full JSON sidecar 보존·동시 수정 보호·download 재연결](../site/lib/share.ts) | 사이트 production build/typecheck 통과; 외부 배포 미수행 |
| E07 | multi-page atlas | 구현 | [bounded multi-page packer·trim·pivot·dedup](../src/render/export.ts) | 브라우저는 trim+multiple pages, dedup은 CLI |
| E08 | Aseprite slice/소켓 교환 | 구현 | [Aseprite slice→oriented socket round trip](../tools/lib/aseprite-bridge.mts) | 실제 Aseprite 실행 파일 관람은 별도 확인 |
| E09 | 레이어·발광 보정 교환 | 구현·앱 검증 제한 | [2D/character layer channels와 HDR edit sidecar](../tools/lib/aseprite-bridge.mts) | 3D layered Aseprite는 명시 거절; flattened paint/bundle 사용 |
| E10 | 타임라인·onion skin | 구현 | [scrub/frame-step/onion/hold·event·socket·contact 편집](../gallery/studio.ts) | 고급 sprite duration/rig는 JSON/API로도 편집 |
| E11 | inspector·곡선·경로 | 구현 | [schema inspector·curve 키·Bézier control points](../gallery/studio.ts) | 범위/단위 표시와 유효성 검사 |
| E12 | 저장/열기·undo/redo | 구현 | [save/open·autosave·undo/redo·recipe pack 열기](../src/authoring/history.ts) | 연속 drag를 하나의 history 단계로 저장 |
| E13 | 버전 있는 export 묶음 | 구현 | [poku-asset/v1·원본project·채널 명세·SHA-256](../tools/lib/asset-bundle.mts) | 별도채널의 finishing 정책을 소비자가 준수 |
| E14 | Rust 자산 player 예제 | 구현·headless 기준 | [duration/loop/trim/pivot/socket/event native player](../native/src/lib.rs) | submit→GPU texture 게임루프 API; 창/engine plugin 미포함 |

### M. 성능·배포·회귀 방지

| ID | 보고서 항목 | 상태 | 구현 위치와 동작 | 범위와 확인 기준 |
| --- | --- | --- | --- | --- |
| M01 | 실시간/step 재생 정책 | 구현 | [visible elapsed 유지·hidden pause·고정 tick/export 분리](../src/authoring/clock.ts) | 장식 GPU particle 장기 jump는 나누어 advance |
| M02 | 시간·공간 culling | 구현 | [시간active 범위·보수적 공간 cullBounds/cullHalo](../src/core/chain.ts) | offscreen draw만 생략, simulation/events는 진행 |
| M03 | 입자·투영 scratch 재사용 | 구현·측정 범위 명시 | [postprocess scratch 재사용·resident GPU buffers·arena](../src/authoring/edits.ts) | 전체 legacy 효과의 할당 제거/GC 성능 개선률을 주장하지 않음 |
| M04 | 변경별 cache/invalidation | 구현 | [byte-budget cache·변경 종류·finishing edit의 simulation 유지](../src/authoring/runtime.ts) | 물리/seed/geometry 변경은 새 런타임 |
| M05 | worker·베이크 큐 | 구현 | [worker bake·ACK backpressure·progress·cancel·page encode](../gallery/studio-worker.ts) | 한도 초과는 CLI 안내 |
| M06 | 상태형 seek 체크포인트 | 구현·명시적 계약 | [capture/restore 전체 state+RNG+clock, bounded checkpoints](../src/core/fx.ts) | 임의 closure는 honest replay fallback |
| M07 | 공통 registry | 구현 | [runtime registry→catalog/generated lazy metadata 동기화](../scripts/generate-registry.mjs) | 274개: 6개 신규+누락된 기존 2개 등록 복구; hosted catalog는 중복 공유 원본 2개 제외한 272개 |
| M08 | 갤러리 lazy load | 구현·계측 | [모듈 lazy load·visible hero tiles·hover animation·release](../gallery/app.ts) | build의 bundle-report로 static graph bytes 기록 |
| M09 | 문서 계약 정리 | 구현 | [renderer/native/HDR/QA/Node20/사용법 문서 계약 정리](../docs/STUDIO.md) | 미검증 플랫폼/미술 판단을 완료로 표시하지 않음 |
| M10 | 제작 CLI 배포 | 구현 | [precompiled CLI·bin·package exports·caller workspace](../tools/poku.mjs) | npm 배포행위는 이번 변경에 포함하지 않음 |
| M11 | 대표 장면 최종 QA | 구현·검증 기록 | [대표 project parity, native scene/asset, 실제산출물 관찰](../docs/GPU_RENDERING.md) | 자동테스트는 게임의 최종 미술 승인 아님 |
| M12 | 깨끗한 패키지·Windows 확인 | 구현·CI gate | [offline tarball 설치·공백 경로·Linux/Windows/browser CI](../tests/cli-package.test.mjs) | 로컬Linux와 원격OS 검사 결과 구별 |

## 구조와 선택 이유

### 제작 데이터와 실행 데이터를 분리

`poku.project/v1`은 사람이 다시 편집할 데이터입니다. 렌더러 instance/function/typed array와 검토 승인을 JSON에 넣지 않습니다. `poku-asset/v1`은 게임에 전달할 출력 계약입니다. 원본 project와 각 파일의 hash를 연결하지만 asset을 다시 읽었다고 procedural source가 자동 복원되지는 않습니다. CharacterAsset과 recipe는 스스로 편집 가능한 원본 데이터를 담습니다.

### 화면과 내보내기의 동일성

같은 seed, layout, sample clock, camera, palette, edits를 사용하는 공통 경로로 이관했습니다. ACT는 hit-stop을 포함한 출력 frame index와 effect time을 구분합니다. 소켓은 pixel-edge 좌표와 두 basis를 보존합니다. 저장 당시의3D radiance/AO는 별도 float32 채널로 전달하여 native에서 finishing을 다시 적용해도 조명 정보가 빠지지 않습니다. raw asset에는 게임 카메라의2D shake를 강제로 bake하지 않습니다.

native 외형 일치는 선언된 `cinematic`/`linear-transparent` 정책을 지원하는 범위입니다. 기본 2D의 legacy encoded-light 합성과 native linear HDR 합성을 같은 것으로 처리하지 않습니다. 새 bundle은 실제 정책을 명시하고, legacy 자산은 최종 RGBA bake 또는 외형 변경을 수반하는 명시적 cinematic 선택이 필요합니다.

### GPU 기능의 정확한 범위

기존 Painter/3D simulation을 전부 shader로 번역하지 않았습니다. GPU cinematic은 기존 frame의 finishing을 담당하고, 새 DrawIR/particle API는 명시적으로 GPU에서 그릴 내용을 받습니다. DrawIR은 하나의 compute batch지만 현재 알고리즘은 픽셀마다 primitive를 검사합니다. 지원 한도와 오류가 명시되어 있으며 고성능 triangle hardware pipeline으로 홍보하지 않습니다.

### 제작 품질의 증거

자동 검사는 설정 보존, 결정성, 좌표, coverage, 출력 parity와 자원 한도를 검증합니다. 실제 생성한 native sheets는 `examples/recipes/`와 `examples/character-studio/`에 있습니다. 관찰 기록은 실제로 본 내용만 기록하며 재생 관람/승인 필드를 추정하여 채우지 않습니다. 최종 효과 선택은 게임 배경·크기·카메라·대상 실루엣과 함께 이루어져야 합니다.

## 실행 가능한 검증

```bash
npm run build
npm run test:3d
npm run test:quality
npm run test:export
npm run test:review
npm run test:gpu
npm run test:aseprite
npm run test:contracts
npm run test:studio
npm run test:export-studio
npm run test:install
node site/scripts/prepare-engine.mjs --check
cargo test --locked --manifest-path native/Cargo.toml
```

브라우저가 허용되는 일반 사용자 환경에서는 `STUDIO_REQUIRED=1 node tools/studio-browser-harness.mjs`를 실행합니다. 실제 WebGPU가 필수인 장치 검증은 `GPU_REQUIRED=1`로 별도로 수행합니다. CI의 optional capability probe가 unavailable을 기록한 경우를 GPU 통과로 계산하지 않습니다.

## 이후 결과를 확대할 때

새로운 기능의 틀은 갖춰져 있습니다. physical GPU별 품질/성능 수치, Aseprite 실제 앱 왕복, 목적 게임에서의 미술 채택 기록은 해당 장치·앱·장면을 사용한 실측으로 계속 채웁니다. DrawIR tile binning/indirect compaction, native window/엔진 plugin, 모든 legacy 효과의 GPU geometry 이식은 현재 기능의 존재와 구별하는 추가 개발입니다. 필요한 기능을 현 구현으로 오인하지 않도록 각 관련 문서에도 같은 경계를 기록했습니다.

소프트웨어 어댑터 실제 실행 기록: [native 결과](validation/gpu-native-final.json), [particle 결과](validation/gpu-particle-final.json).

### 갤러리 코드 로딩 계측

기존 main의 단일 app.js는 2,465,710 bytes였고, 새 갤러리의 entry 및 정적 JavaScript 의존성 합계는 958,166 bytes입니다. 비압축 정적 코드 기준 **61.14% 감소**입니다. 274개 effect entry는 동적 로더로 나뉩니다. 보이는 타일의 추가 다운로드, CSS/폰트, 압축률, 실제 네트워크 지연과 FPS는 이 수치에 포함하지 않습니다. [빌드 계측 기록](validation/bundle-metrics.json)을 확인할 수 있습니다.
