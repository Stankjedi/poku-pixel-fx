import type { DrawAsset, DrawCommand, DrawScene, IRPoint } from '../render/draw-ir.js';

export type GpuLabDistribution = 'orbit' | 'spread' | 'overlap';
export interface GpuLabSceneOptions { count?: number; distribution?: GpuLabDistribution }
const TAU = Math.PI * 2;
const white = 0xffffffff;
const cyan = 0xffffd86a;
const rose = 0xffb06bff;
const crystal: DrawAsset = {
  id: 'lab-star', revision: 1, width: 5, height: 5,
  color: new Uint32Array([
    0, 0, white, 0, 0,
    0, cyan, white, cyan, 0,
    white, white, white, white, white,
    0, cyan, white, cyan, 0,
    0, 0, white, 0, 0,
  ]),
};

/** Original symbolic GPU workload study. Six-second loop; no gameplay/collision claim. */
export function createGpuLabScene(time = 0, options: GpuLabSceneOptions = {}): DrawScene {
  const count = options.count ?? 128, distribution = options.distribution ?? 'orbit';
  if (!Number.isFinite(time) || !Number.isInteger(count) || count < 0 || count > 4096 || !['orbit', 'spread', 'overlap'].includes(distribution)) throw new RangeError('Invalid GPU Lab parameters');
  const phase = (((time % 6) + 6) % 6) / 6 * TAU, commands: DrawCommand[] = [];
  const point = (angle: number, axis: number): IRPoint => [128 + Math.cos(angle) * (axis ? 65 : 88), 96 + Math.sin(angle) * (axis ? 54 : 26), Math.sin(angle) * 14 + (axis ? 1 : 0)];
  for (let ring = 0; ring < 2; ring++) for (let segment = 0; segment < 64; segment++) {
    const a = segment / 64 * TAU + phase * (ring ? -1 : 1);
    commands.push({ op: 'segment', from: point(a, ring), to: point(a + TAU / 64, ring), width: segment % 8 === 0 ? 2 : 1,
      material: { color: ring ? rose : cyan, blend: 'cutout', emission: ring ? [.35, .04, .17] : [.04, .22, .4] } });
  }
  const vertices: IRPoint[] = [[128, 65, 18], [146, 94, 22], [128, 126, 18], [110, 94, 22], [128, 94, 27]];
  const facets = [0xffa47936, 0xff71462e, 0xff5d3549, 0xffd6a36e];
  for (let i = 0; i < 4; i++) commands.push({ op: 'triangle', vertices: [vertices[i], vertices[(i + 1) % 4], vertices[4]], material: { color: facets[i], blend: 'opaque', emission: [.01, .02, .03] } });
  commands.push({ op: 'segment', from: vertices[0], to: vertices[4], width: 1, material: { color: 0xffffe8bb, blend: 'cutout', emission: [.4, .6, .8] } });
  for (let i = 0; i < count; i++) {
    const a = phase + i * 2.399963229728653, r = 28 + (i * 37 % 76);
    let x: number, y: number;
    if (distribution === 'spread') { x = 8 + (i * 73 % 240); y = 8 + (i * 41 % 176); }
    else if (distribution === 'overlap') { x = 128 + Math.cos(a) * 4; y = 96 + Math.sin(a) * 4; }
    else { x = 128 + Math.cos(a) * r; y = 96 + Math.sin(a) * r * .72; }
    const cool = i % 3 !== 0;
    if (i % 19 === 0) {
      const angle = phase + i, scale = .6 + (i % 5) * .15;
      commands.push({ op: 'sprite', asset: crystal.id, origin: [x - 2 * scale, y - 2 * scale, 30], axisX: [Math.cos(angle) * scale, Math.sin(angle) * scale], axisY: [-Math.sin(angle) * scale || 0, Math.cos(angle) * scale], material: { color: cool ? cyan : rose, blend: 'cutout', emission: cool ? [.03, .12, .2] : [.14, .02, .07] } });
    } else commands.push({ op: 'disc', center: [x, y, 3 + Math.sin(a) * 28], radius: i % 7 === 0 ? 1.1 : .55,
      material: { color: cool ? cyan : rose, blend: 'additive', emission: cool ? [.04, .22, .4] : [.4, .04, .2] } });
  }
  return { schema: 'poku-draw/v1', width: 256, height: 192, assets: [crystal], commands };
}
