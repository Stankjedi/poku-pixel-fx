import { hex } from '../core/color.js';
import { sculptPixelHeight2D } from '../core/pixel-sculpt.js';
import { rasterizePixelPath2D, type PixelArtPathNode2D } from '../core/pixel-path.js';
import { createBlankPixelArtDocument2D, renderPixelArtDocument2D, writePixelArtHeightLayer2D,
  type PixelArtDocument2D, type PixelArtPathLayer2D } from '../authoring/pixel-art-document.js';

export type PixelCraftStudy2D = 'plume' | 'folds';
const node = (point: [number, number], incoming?: [number, number], outgoing?: [number, number]): PixelArtPathNode2D =>
  ({ point, ...(incoming ? { in: incoming } : {}), ...(outgoing ? { out: outgoing } : {}) });

/** Editable tool studies: deliberately authored curves, palette clusters and explicit
 * sculpted volume. No existing effect artwork, hidden image generator, or time-varying noise. */
export function createPixelCraftStudy2D(kind: PixelCraftStudy2D = 'plume'): PixelArtDocument2D {
  if (kind !== 'plume' && kind !== 'folds') throw new RangeError('Unknown pixel craft study');
  let doc = createBlankPixelArtDocument2D(160, 192, kind === 'plume' ? '청록 깃 장식 · 곡선과 높이' : '수놓은 천 · 직접 조각한 주름');
  const path = (name: string, color: string, nodes: PixelArtPathNode2D[], fill: boolean, startWidth = 0, endWidth = startWidth) => {
    const id = `path-${doc.layers.length + 1}`;
    const layer: PixelArtPathLayer2D = { kind: 'path', id, name, color: hex(color), nodes,
      options: { closed: fill, fill, strokeWidth: startWidth, startWidth, endWidth, pixelPerfect: false } };
    doc = { ...doc, layers: [...doc.layers, layer], activeLayerId: id };
  };
  if (kind === 'plume') {
    path('깃의 휘어진 외곽', '#153d4b', [node([100, 12], [96, 8], [130, 39]), node([132, 68], [133, 41], [139, 100]),
      node([89, 145], [131, 123], [77, 154]), node([66, 170], [76, 157], [64, 146]), node([28, 97], [34, 134], [20, 65]), node([70, 28], [35, 43], [84, 23])], true);
    path('안쪽 청록 면', '#257b83', [node([100, 20], [89, 24], [125, 48]), node([125, 71], [126, 49], [131, 102]),
      node([83, 140], [115, 125], [76, 148]), node([70, 154], [75, 149], [66, 133]), node([36, 96], [45, 129], [31, 68]), node([72, 35], [45, 48], [84, 28])], true);
    path('한쪽 큰 색 덩어리', '#43a294', [node([100, 24], undefined, [93, 57]), node([81, 105], [86, 84], [78, 125]),
      node([70, 150], [74, 137], [65, 127]), node([40, 94], [49, 121], [35, 67]), node([74, 38], [49, 49], [86, 31])], true);
    for (let i = 0; i < 8; i++) {
      const y = 46 + i * 12, x = 99 - i * 3.2;
      path(`왼쪽 깃 결 ${i + 1}`, i % 3 === 0 ? '#98cbb0' : '#68b7a1',
        [node([x, y], undefined, [x - 10, y - 10]), node([47 + i * 1.7, 57 + i * 10], [56 + i, 46 + i * 10])], false, 2.4, .4);
      if (i < 6) path(`오른쪽 깃 결 ${i + 1}`, i % 2 ? '#2d696b' : '#1b515d',
        [node([x + 2, y], undefined, [x + 18, y - 7]), node([126 - i * 2.4, 59 + i * 11], [132 - i * 2, 49 + i * 11])], false, 2.2, .5);
    }
    path('금빛 중심 줄기', '#c7a866', [node([64, 177], undefined, [81, 144]), node([100, 29], [82, 81])], false, 5, .6);
    path('줄기의 작은 반사', '#f0d6a0', [node([66, 170], undefined, [79, 139]), node([98, 39], [85, 85])], false, 1.6, .3);
    path('아래 금속 고리', '#9f744b', [node([54, 166]), node([72, 172]), node([69, 180]), node([51, 174])], true);
    path('고리의 밝은 모서리', '#e2be7c', [node([54, 166]), node([72, 172])], false, 2);
  } else {
    path('둥글게 휘어진 천 윤곽', '#192b42', [node([27, 20], [23, 25], [68, 8]), node([135, 26], [102, 35], [126, 73]),
      node([130, 162], [127, 123], [104, 177]), node([32, 170], [70, 153], [38, 115])], true);
    path('청색 비단의 바탕', '#426c91', [node([33, 27], undefined, [72, 16]), node([128, 32], [98, 41], [121, 78]),
      node([124, 156], [121, 121], [100, 168]), node([39, 162], [72, 148], [44, 113])], true);
    path('왼쪽 넓은 색면', '#577e9a', [node([35, 28]), node([55, 25], undefined, [45, 87]), node([61, 157], [51, 133]), node([40, 163], undefined, [46, 109])], true);
    path('오른쪽 넓은 색면', '#325876', [node([102, 35], undefined, [94, 73]), node([105, 160], [100, 125]), node([123, 156], undefined, [123, 105]), node([127, 33])], true);
    path('위쪽 자수 선', '#c49e65', [node([32, 27], undefined, [73, 15]), node([129, 32], [98, 42])], false, 2);
    path('아래쪽 자수 선', '#c49e65', [node([39, 160], undefined, [73, 146]), node([124, 154], [101, 166])], false, 2);
    // A deliberately designed repeated stitch is a finishing detail; the large folds
    // are independent height strokes below, not simulated by these tiny marks.
    const n = doc.width * doc.height, accents = new Map<number, number>();
    for (let j = 0; j < 8; j++) for (let i = 0; i < 6; i++) {
      const x = 45 + i * 13 + (j % 2 ? 5 : 0), y = 47 + j * 13;
      if (x > 119) continue;
      const c = hex((i + j) % 3 ? '#668498' : '#a5a48f') >>> 0;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) accents.set((y + dy) * 160 + x + dx, c);
    }
    const visible = renderPixelArtDocument2D(doc);
    const indices = [...accents.keys()].filter(i => i < n && visible.mask.data[i]).sort((a, b) => a - b);
    doc.layers.push({ kind: 'paint', id: 'embroidery', name: '손으로 설계한 자수 군집', indices, pixels: indices.map(i => accents.get(i)!) });
    path('타원형 금속 장식', '#b18b55', [node([80, 54], [68, 54], [94, 54]), node([96, 72], [96, 61], [96, 83]),
      node([80, 91], [92, 91], [66, 91]), node([63, 72], [63, 83], [63, 60])], true);
    path('안쪽 에나멜', '#275d65', [node([80, 59], [71, 59], [90, 59]), node([91, 72], [91, 65], [91, 80]),
      node([80, 86], [89, 86], [70, 86]), node([68, 72], [68, 80], [68, 64])], true);
    path('금빛 식물 문양', '#d9be80', [node([78, 82], undefined, [85, 68]), node([78, 63], [75, 68])], false, 2, .6);
    path('문양의 가지', '#c8b882', [node([80, 74], undefined, [85, 77]), node([87, 69], [89, 73])], false, 1.2, .4);
  }
  let surface = renderPixelArtDocument2D(doc), sculptId: string | undefined;
  const strokes = kind === 'plume' ? [
    { points: [{ x: 76, y: 139 }, { x: 84, y: 99 }, { x: 99, y: 40 }], size: 34, strength: 8 },
    { points: [{ x: 47, y: 76 }, { x: 56, y: 105 }, { x: 70, y: 131 }], size: 28, strength: 3 },
    { points: [{ x: 55, y: 171 }, { x: 69, y: 175 }], size: 8, strength: 4 },
  ] : [
    { points: [{ x: 47, y: 28 }, { x: 49, y: 78 }, { x: 57, y: 150 }], size: 31, strength: 9 },
    { points: [{ x: 80, y: 32 }, { x: 73, y: 111 }, { x: 84, y: 157 }], size: 30, strength: 8 },
    { points: [{ x: 113, y: 35 }, { x: 107, y: 88 }, { x: 116, y: 151 }], size: 26, strength: 7 },
    { points: [{ x: 80, y: 72 }], size: 36, strength: 7 },
  ];
  for (const stroke of strokes) {
    const result = sculptPixelHeight2D(surface, stroke.points, { mode: 'raise', size: stroke.size, strength: stroke.strength, hardness: .12 });
    doc = writePixelArtHeightLayer2D(doc, result.deltas, result.touched, sculptId);
    sculptId = doc.activeLayerId; surface = renderPixelArtDocument2D(doc);
  }
  if (sculptId) doc.layers = doc.layers.map(layer => layer.id === sculptId ? { ...layer, name: '붓으로 작성한 큰 부피' } : layer);
  doc.layers.push({ kind: 'relight', id: 'craft-light', name: '따뜻한 주 광원과 차가운 보조광', lighting: {
    lights: [{ direction: [-.75, -.55, 1], color: '#ffe6bf', intensity: .82 }, { direction: [.8, .25, .65], color: '#79c9da', intensity: .2 }],
    ambient: .28, ambientColor: '#c6d4e8', diffuseBands: 12, specular: kind === 'plume' ? .16 : .08, roughness: .52, ambientOcclusion: .25, strength: 1,
  } });
  doc.activeLayerId = 'craft-light';
  return doc;
}
