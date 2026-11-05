/** Compile canonical input and an independent brute-force CPU reference for the WGSL harness. */
import { drawTileFixtures } from '../tests/fixtures/draw-tiles.mjs';
import { compileDrawScene, renderDrawSceneCPU } from '../build/render/draw-ir.js';
const bytes = data => Buffer.from(data instanceof ArrayBuffer ? data : data.buffer, data.byteOffset ?? 0, data.byteLength).toString('base64');
const fixtures = drawTileFixtures().map(({ name, scene }) => {
  const compiled = compileDrawScene(scene), reference = renderDrawSceneCPU(compiled);
  return { name, width: scene.width, height: scene.height, count: compiled.count, commands: bytes(compiled.commands), assets: bytes(compiled.color), emission: bytes(compiled.emission), expected: { color: bytes(reference.color), light: bytes(reference.light), hdr: bytes(reference.hdrLight) } };
});
console.log(JSON.stringify(fixtures));
