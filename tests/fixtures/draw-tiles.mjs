/** Portable fixed inputs for the browser, native and Python/WGSL tile checks. */
export function drawTileFixtures() {
  const opaque = { color: 0xff756a28, blend: 'opaque' };
  const additive = { color: 0xffff9955, blend: 'additive', emission: [.3, .08, .02] };
  const sparse = { schema: 'poku-draw/v1', width: 257, height: 193, commands: Array.from({ length: 512 }, (_, i) => ({ op: 'disc', center: [3 + i * 73 % 250, 3 + i * 41 % 186, i % 13], radius: .6 + i % 4 * .4, material: i % 3 ? additive : opaque })) };
  const dense = { schema: 'poku-draw/v1', width: 33, height: 17, commands: Array.from({ length: 300 }, (_, i) => ({ op: 'disc', center: [16 + i % 3 * .3, 8, i % 7], radius: 26, material: i % 3 ? { ...additive, emission: [.01, .003, .007] } : opaque })) };
  dense.commands.push({ op: 'rect', origin: [0, 0, 12], size: [33, 17], material: { color: 0x40003277, opacity: .5, emission: [.01, .03, .02] } });
  const boundaries = { schema: 'poku-draw/v1', width: 47, height: 35, assets: [{ id: 'cells', revision: 1, width: 3, height: 2, color: [0xff0000ff, 0x8000ff00, 0, 0xff884411, 0xffffffff, 0x400000ff], emission: [0, 0, .1, 0, .1, 0, .2, 0, 0, 0, .1, .2, 0, 0, 0, .2, .3, .1] }], commands: [
    { op: 'rect', origin: [0, 0, -10], size: [47, 35], material: opaque },
    { op: 'rect', origin: [15.5, 14.5, 3], size: [.25, 2], material: { color: 0xffffffff, opacity: .7 } },
    { op: 'disc', center: [15.5, 15.5, 4], radius: 0, material: { color: 0xffffffff } },
    { op: 'disc', center: [31.7, 16.5, -12], radius: 3, material: { ...additive, emissionKind: 'optical' } },
    { op: 'segment', from: [-3.5, 15.5, -2], to: [40.5, 16.5, 5], width: .3, material: { color: 0xffe8f4ff, opacity: .5 } },
    { op: 'triangle', vertices: [[15.5, 15.5, 1], [32.5, 15.5, 4], [15.5, 31.5, 2]], material: { color: 0x80cc5588 } },
    { op: 'mesh', vertices: [[30.5, 20.5, 2], [38.5, 20.5, 2], [38.5, 28.5, 2], [30.5, 28.5, 2]], indices: [0, 1, 2, 0, 2, 3], material: { color: 0x80ffffff } },
    { op: 'sprite', asset: 'cells', origin: [31.5, 14.5, 6], axisX: [-1.3, .4], axisY: [.6, 1.3], material: { color: 0xffffffff } },
    { op: 'sprite', asset: 'cells', origin: [17, 28, 5], axisX: [1, 1], axisY: [1, 1.00001], material: { color: 0xffffffff } },
    { op: 'ribbon', points: [[4.5, 4.5, 1], [16.5, 4.5, 1], [18.5, 12.5, 1]], width: 2, material: additive },
    { op: 'rect', origin: [-100, -100, 10], size: [1, 1], material: opaque },
    { op: 'disc', center: [16, 16, 5], radius: 30, material: { color: 0xffffffff, opacity: 0, emission: [2, 3, 4] } },
  ] };
  const ties = { schema: 'poku-draw/v1', width: 17, height: 17, commands: [
    { op: 'rect', origin: [0, 0, 3], size: [17, 17], material: opaque },
    ...Array.from({ length: 64 }, (_, i) => ({ op: 'rect', origin: [i % 3, i % 5, 3], size: [16, 16], material: { color: (0x10000000 | i * 104729) >>> 0, opacity: .6, emission: [.001 * (i % 7), .001, .002] } })),
  ] };
  const offscreen = { schema: 'poku-draw/v1', width: 31, height: 23, commands: Array.from({ length: 80 }, (_, i) => ({ op: 'disc', center: [-20 - i, 70 + i, i], radius: 1, material: additive })) };
  return [{ name: 'sparse-512', scene: sparse }, { name: 'dense-overflow-301', scene: dense }, { name: 'boundaries-materials-sprites', scene: boundaries }, { name: 'alpha-depth-ties-64', scene: ties }, { name: 'offscreen-80', scene: offscreen }, { name: 'empty-odd-frame', scene: { schema: 'poku-draw/v1', width: 19, height: 13, commands: [] } }];
}
