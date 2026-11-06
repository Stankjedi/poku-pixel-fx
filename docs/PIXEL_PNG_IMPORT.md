# 원본 RGBA를 보존하는 브라우저 PNG 가져오기

픽셀아트 파일을 Canvas에 그린 뒤 `getImageData()`로 다시 읽으면 낮은 알파의 RGB가
반올림되거나 완전히 투명한 픽셀의 숨은 RGB가 없어질 수 있다. Pixel Art Lab의 네이티브
가져오기는 PNG의 필터와 압축을 직접 풀어 **premultiply하지 않은 원래 샘플**을 읽는다.
알파가 0, 1, 2인 픽셀도 파일에 기록된 RGB를 보존한다.

```ts
import { decodePixelArtPNG } from './png-import.js';

const decoded = await decodePixelArtPNG(new Uint8Array(await file.arrayBuffer()));
if (decoded.kind === 'decoded') {
  // packed ABGR; 원본 alpha 및 숨은 RGB가 그대로 들어 있다.
  useNativePixels(decoded.w, decoded.h, decoded.pixels);
} else {
  // reason: '16-bit' | 'adam7'
  // 지원하지 않는 유효한 입력임을 표시한 뒤, 명시한 브라우저 변환 경로를 사용한다.
  // 이 경로는 네이티브 샘플의 정확한 보존을 보장하지 않는다.
}
```

## 지원 범위

| PNG 종류 | 정확한 네이티브 가져오기 |
| --- | --- |
| RGBA, RGB | 채널당 8비트 |
| 그레이스케일 + 알파 | 채널당 8비트 |
| 그레이스케일 | 1·2·4·8비트; 낮은 비트 심도는 정확한 8비트 명암 단계로 확장 |
| 인덱스 팔레트 | 1·2·4·8비트; PLTE와 부분 tRNS 알파 지원 |
| RGB·그레이스케일 색상 키 | tRNS 키와 일치하는 픽셀은 RGB를 남기고 알파만 0 |
| 16비트 또는 Adam7 인터레이스 | 유효성 확인 후 `kind: 'unsupported'` 반환 |
| APNG | 한 장의 원화로 조용히 바꾸지 않고 오류 반환 |

PNG는 가로·세로 각각 512픽셀 이하, 파일 크기는 16 MiB 이하이다. 내부 읽기 결과는
원본의 8비트 straight RGBA이며, 팔레트 자동 변경이나 이미지 확대는 수행하지 않는다.

색상 프로필과 감마 정보는 자동 변환하지 않는다. `warnings`에 해당 청크를 보고하고,
파일에 저장된 수치를 그대로 가져온다. 프로필을 반영한 화면상의 색 맞춤과 원본 샘플의
정확한 편집은 서로 다른 동작이므로 이 차이를 명시한다.

## 손상된 입력과 대체 경로 구분

서명, IHDR, 크기, 청크 길이·CRC·순서, 팔레트 크기·참조, tRNS 구조, 압축 결과 길이,
행 필터를 확인한다. 압축은 `DecompressionStream('deflate')`으로 읽고 예상한 크기를
넘는 출력은 취소한다. zlib 체크섬과 스트림 완료 여부도 확인한다.

16비트와 Adam7 입력도 청크 검사만 통과했다고 바로 대체 경로로 넘기지 않는다.
각 패스의 예상 크기와 필터를 확인한 다음 지원 범위 밖이라는 결과를 반환한다.
**손상된 PNG는 예외이며 `unsupported`가 아니다.** 호출부는 예외를 잡아 무조건 다른
디코더로 다시 시도하면 안 된다. 이 경로는 파일의 오류를 숨기거나 손상된 입력을 정상
원화처럼 받아들이기 위한 기능이 아니다.

`tests/pixel-png-import.test.mjs`는 실제 브라우저 TypeScript 모듈을 esbuild로 묶어서
Node의 표준 Web Streams 구현으로 검사한다. 기존 독립 Pillow PNG와 그 RGBA 명세,
별도의 PNG 작성기로 만든 낮은 알파 픽셀, 5종 필터, 팔레트 투명도, 손상·잘린 데이터와
유효한 미지원 형식을 포함한다.

형식·필터와 [tRNS 색상 키](https://www.w3.org/TR/png-3/#11tRNS)는 W3C PNG 제3판, 스트림 압축 해제는
[WHATWG Compression 표준](https://compression.spec.whatwg.org/)을 기준으로 한다.
