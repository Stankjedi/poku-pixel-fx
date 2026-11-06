import test from 'node:test';
import assert from 'node:assert/strict';
import { createPixelArtDocument2D, renderPixelArtDocument2D } from '../build/authoring/pixel-art-document.js';
import { createPixelArtAnimation2D, addPixelArtAnimationFrame2D, exportPixelArtAnimationSheet2D,
  createPixelArtAnimationTimeline2D, parsePixelArtAnimation2D, serializePixelArtAnimation2D,
  PixelArtAnimationHistory2D } from '../build/authoring/pixel-art-animation.js';
import { importPixelArtAnimationSheet2D, slicePixelArtAnimationSheet2D } from '../build/authoring/pixel-art-sheet.js';

const RED = 0xff0000ff, GREEN = 0xff00ff00, BLUE = 0xffff0000;
const raster = (width, height, pixels, mask = pixels.map(c => c >>> 24 ? 1 : 0)) => ({ w: width, h: height,
  pixels: Uint32Array.from(pixels), mask: { w: width, h: height, data: Uint8Array.from(mask) } });
const document = (pixels, name = 'Cel', mask) => createPixelArtDocument2D(raster(pixels.length, 1, pixels, mask), name);
function sequence() {
  let animation = createPixelArtAnimation2D(document([0x0124c8a9, 0x00123456, BLUE], 'First', [1, 1, 0]),
    { name: '서로 다른 프레임 시간', durationMs: 1000 / 24, direction: 'pingpong', loop: false });
  animation = addPixelArtAnimationFrame2D(animation, document([GREEN, RED, 0]), { name: '강조', durationMs: 75 });
  return addPixelArtAnimationFrame2D(animation, document([BLUE, 0, 0x80a1b2c3]), { name: '끝', durationMs: 225 });
}

test('own atlas export/import preserves native straight RGBA and unequal ping-pong timing', () => {
  const original = sequence(), sheet = exportPixelArtAnimationSheet2D(original, { columns: 2, padding: 2 });
  const imported = importPixelArtAnimationSheet2D(sheet.sprite, JSON.parse(JSON.stringify({ ...sheet.manifest, image: 'never-fetched.png' })));
  assert.equal(imported.schema, 'poku-pixel-art/v3'); assert.equal(imported.name, original.name);
  assert.equal(imported.loop, false); assert.equal(imported.direction, 'pingpong');
  assert.equal(imported.activeFrameId, original.frames[0].id); assert.equal(imported.frames.length, 3);
  assert.deepEqual(imported.frames.map(frame => [frame.id, frame.name, frame.durationMs]), original.frames.map(frame => [frame.id, frame.name, frame.durationMs]));
  assert.deepEqual(imported.frames[0].document.pixels, [0x0124c8a9, 0x00123456, BLUE & 0xffffff]);
  const reopened = parsePixelArtAnimation2D(serializePixelArtAnimation2D(imported));
  assert.deepEqual(reopened, imported);
  const secondSheet = exportPixelArtAnimationSheet2D(reopened, { columns: 2, padding: 2 });
  assert.deepEqual(secondSheet.manifest, sheet.manifest); assert.deepEqual(secondSheet.rgba, sheet.rgba);
  const clock = createPixelArtAnimationTimeline2D(imported);
  assert.deepEqual(clock.sequence, [0, 1, 2, 1]);
  for (let i = 0; i < clock.sequence.length; i++) assert.equal(clock.frameAt(clock.startsMs[i]), clock.sequence[i]);
});

test('reverse atlas manifests recover source cel order and keep fully transparent hold frames', () => {
  let animation = createPixelArtAnimation2D(document([0x00112233]), { direction: 'reverse', durationMs: 250 });
  animation = addPixelArtAnimationFrame2D(animation, document([RED]), { durationMs: 25 });
  const sheet = exportPixelArtAnimationSheet2D(animation, { columns: 1, padding: 0 });
  const imported = importPixelArtAnimationSheet2D(sheet.sprite, sheet.manifest);
  assert.equal(imported.frames.length, 2); assert.equal(imported.frames[0].document.pixels[0], 0x00112233);
  const clock = createPixelArtAnimationTimeline2D(imported);
  assert.equal(clock.frameAt(0), 1); assert.equal(clock.frameAt(25), 0); assert.equal(clock.durationMs, 275);
});

test('grid slicing respects symmetric margins, independent gaps, traversal and source slot range', () => {
  // A 2x2 frame grid: cells are 2x1, outer padding is [1,2], gaps are [2,1].
  const source = raster(8, 7, new Array(56).fill(0));
  const colors = [RED, GREEN, BLUE, 0xff123456];
  for (const [index, x, y] of [[0, 1, 2], [1, 5, 2], [2, 1, 4], [3, 5, 4]]) {
    source.pixels[y * 8 + x] = colors[index]; source.pixels[y * 8 + x + 1] = colors[index];
    source.mask.data[y * 8 + x] = source.mask.data[y * 8 + x + 1] = 1;
  }
  const options = { frameWidth: 2, frameHeight: 1, margin: [1, 2], gap: [2, 1], durationMs: 50, name: 'Grid' };
  const rows = slicePixelArtAnimationSheet2D(source, options), columns = slicePixelArtAnimationSheet2D(source, { ...options, order: 'column-major' });
  assert.deepEqual(rows.frames.map(frame => frame.document.pixels[0]), colors);
  assert.deepEqual(columns.frames.map(frame => frame.document.pixels[0]), [RED, BLUE, GREEN, 0xff123456]);
  const selected = slicePixelArtAnimationSheet2D(source, { ...options, order: 'column-major', start: 1, count: 2, direction: 'reverse', loop: false });
  assert.deepEqual(selected.frames.map(frame => frame.document.pixels), [[BLUE, BLUE], [GREEN, GREEN]]);
  assert.deepEqual(selected.frames.map(frame => frame.id), ['frame-2', 'frame-3']);
  assert.deepEqual(selected.frames.map(frame => frame.name), ['Frame 2', 'Frame 3']);
  assert.equal(selected.frames[0].durationMs, 50); assert.equal(selected.loop, false); assert.equal(selected.direction, 'reverse');
});

test('complete-grid slicing leaves trailing partial strips outside the selected native frames', () => {
  const source = raster(5, 1, [RED, GREEN, BLUE, RED, GREEN]);
  const imported = slicePixelArtAnimationSheet2D(source, { frameWidth: 2, frameHeight: 1 });
  assert.deepEqual(imported.frames.map(frame => frame.document.pixels), [[RED, GREEN], [BLUE, RED]]);
});

test('blank removal is explicit, follows source ranges, and never renumbers later slots', () => {
  const source = raster(5, 1, [0x00112233, RED, BLUE, GREEN, 0x000000aa], [1, 1, 0, 1, 0]);
  const all = slicePixelArtAnimationSheet2D(source, { frameWidth: 1, frameHeight: 1 });
  assert.equal(all.frames.length, 5); assert.equal(all.frames[0].document.pixels[0], 0x00112233);
  assert.deepEqual(all.frames[2].document.mask, [0]); assert.deepEqual(all.frames[2].document.pixels, [BLUE]);
  const visible = slicePixelArtAnimationSheet2D(source, { frameWidth: 1, frameHeight: 1, skipEmpty: true, start: 1, count: 3 });
  assert.deepEqual(visible.frames.map(frame => frame.id), ['frame-2', 'frame-4']);
  assert.deepEqual(visible.frames.map(frame => frame.document.pixels[0]), [RED, GREEN]);
  assert.throws(() => slicePixelArtAnimationSheet2D(source, { frameWidth: 1, frameHeight: 1, start: 0, count: 1, skipEmpty: true }), /no visible frames/);
});

test('all supplied geometry and independent silhouettes use the exact color crop coordinates', () => {
  const source = raster(3, 2, [RED, 0x0124c8a9, 0x00112233, BLUE, GREEN, RED], [255, 0, 1, 0, 1, 1]);
  source.channels = { w: 3, h: 2, material: Uint16Array.from([1, 2, 3, 4, 5, 6]), height: Float32Array.from([-.5, 0, 2, 3.25, -8, 9]),
    normal: Float32Array.from([0, 0, 1, 1, 0, 0, 0, 1, 0, -.5, .5, .75, .25, -.75, .5, 0, 0, -1]) };
  const before = structuredClone(source);
  const imported = slicePixelArtAnimationSheet2D(source, { frameWidth: 1, frameHeight: 2, start: 1, count: 1 });
  const frame = imported.frames[0].document;
  assert.deepEqual(frame.pixels, [0x0124c8a9, GREEN]); assert.deepEqual(frame.mask, [0, 1]);
  assert.deepEqual(frame.channels, { material: [2, 5], height: [0, -8], normal: [1, 0, 0, .25, -.75, .5] });
  const rendered = renderPixelArtDocument2D(frame);
  assert.deepEqual([...rendered.channels.normal], frame.channels.normal);
  assert.deepEqual(source, before);
  frame.pixels[0] = 0; frame.mask[1] = 0; frame.channels.height[0] = 99;
  assert.deepEqual(source, before, 'editing the imported cel cannot mutate the source sheet');
});

test('duplicate atlas rectangles create independent cels without flattening masked RGB or geometry', () => {
  const source = raster(1, 1, [0x12345678], [0]);
  source.channels = { w: 1, h: 1, material: Uint16Array.of(7), height: Float32Array.of(2), normal: Float32Array.of(0, 0, 1) };
  const manifest = { schema: 'poku-pixel-art-atlas/v1', name: 'Shared atlas rectangle', width: 1, height: 1,
    frameWidth: 1, frameHeight: 1, columns: 1, padding: 0, loop: true, direction: 'forward', sequence: [0, 1], startsMs: [0, 100], durationMs: 200,
    frames: [{ id: 'a', name: 'A', x: 0, y: 0, width: 1, height: 1, durationMs: 100 }, { id: 'b', name: 'B', x: 0, y: 0, width: 1, height: 1, durationMs: 100 }] };
  const imported = importPixelArtAnimationSheet2D(source, manifest);
  const first = imported.frames[0].document, second = imported.frames[1].document;
  assert.deepEqual(first.pixels, [0x12345678]); assert.deepEqual(first.mask, [0]);
  first.pixels[0] = RED; first.mask[0] = 1; first.channels.material[0] = 8;
  assert.deepEqual(second.pixels, [0x12345678]); assert.deepEqual(second.mask, [0]); assert.deepEqual(second.channels.material, [7]);
  assert.equal(source.pixels[0], 0x12345678);
});

test('imported artwork participates in whole-animation undo without changing its exact saved source', () => {
  const imported = slicePixelArtAnimationSheet2D(raster(2, 1, [0x00112233, 0x0124c8a9]), { frameWidth: 1, frameHeight: 1 });
  const history = new PixelArtAnimationHistory2D(imported), edited = structuredClone(imported);
  edited.frames[0].document.layers.push({ id: 'paint-1', kind: 'paint', name: 'Retouch', indices: [0], pixels: [RED] });
  assert.equal(history.commit(edited), true);
  assert.deepEqual(history.undo(), imported); assert.deepEqual(history.redo(), edited);
});

test('malformed manifest rectangles, identities and contradictory timing reject without changing input', () => {
  const sheet = exportPixelArtAnimationSheet2D(sequence(), { columns: 2, padding: 1 }), before = structuredClone(sheet);
  const edit = change => { const manifest = structuredClone(sheet.manifest); change(manifest); return manifest; };
  const invalid = [null, {}, edit(m => { m.schema = 'foreign'; }), edit(m => { m.width++; }), edit(m => { m.frames[0].width++; }),
    edit(m => { m.frames[0].x = -.5; }), edit(m => { m.frames[0].y = m.height; }), edit(m => { m.frames[1].id = m.frames[0].id; }),
    edit(m => { m.frames[0].name = ''; }), edit(m => { m.frames[0].durationMs = 0; }), edit(m => { m.columns = 0; }), edit(m => { m.padding = 33; }),
    edit(m => { m.sequence = [0, 1, 2]; }), edit(m => { m.startsMs[1]++; }), edit(m => { m.durationMs++; }), edit(m => { m.direction = 'reverse'; })];
  for (const manifest of invalid) assert.throws(() => importPixelArtAnimationSheet2D(sheet.sprite, manifest));
  assert.deepEqual(sheet, before);
});

test('invalid grid ranges and geometry reject before returning a partial animation', () => {
  const source = raster(2, 2, [RED, GREEN, BLUE, RED]), before = structuredClone(source), valid = { frameWidth: 1, frameHeight: 1 };
  for (const options of [null, { ...valid, frameWidth: 0 }, { ...valid, frameHeight: 1.5 }, { ...valid, margin: -1 }, { ...valid, margin: [1] },
    { ...valid, gap: [0, Infinity] }, { ...valid, start: -1 }, { ...valid, start: 4 }, { ...valid, count: 5 }, { ...valid, count: 0 },
    { ...valid, margin: 1 }, { ...valid, name: '' }, { ...valid, order: 'random' }, { ...valid, skipEmpty: 'yes' }, { ...valid, durationMs: Infinity }])
    assert.throws(() => slicePixelArtAnimationSheet2D(source, options));
  assert.deepEqual(source, before);
  assert.throws(() => slicePixelArtAnimationSheet2D({ ...source, channels: { w: 2, h: 2, material: new Uint16Array(4), height: new Float32Array(3), normal: new Float32Array(12) } }, valid), /geometry/);
  const channels = { w: 2, h: 2, material: new Uint16Array(4), height: new Float32Array(4), normal: new Float32Array(12) }; channels.normal[11] = NaN;
  assert.throws(() => slicePixelArtAnimationSheet2D({ ...source, channels }, valid), /finite/);
});

test('frame and aggregate map budgets are preflighted before materializing imported cels', () => {
  const small = raster(300, 1, new Array(300).fill(RED));
  assert.throws(() => slicePixelArtAnimationSheet2D(small, { frameWidth: 1, frameHeight: 1 }), /frame budget/);
  // Sparse sheets may contain many slots while only a few visible cels are selected.
  small.mask.data.fill(0); small.mask.data[299] = 1;
  const sparse = slicePixelArtAnimationSheet2D(small, { frameWidth: 1, frameHeight: 1, skipEmpty: true });
  assert.equal(sparse.frames.length, 1); assert.equal(sparse.frames[0].id, 'frame-300');
  const side = 256, cells = side * side, mapped = raster(side, side, new Array(cells).fill(0));
  mapped.channels = { w: side, h: side, material: new Uint16Array(cells), height: new Float32Array(cells), normal: new Float32Array(cells * 3) };
  mapped.channels.height[0] = NaN;
  const frames = Array.from({ length: 37 }, (_, index) => ({ id: `f-${index}`, name: `F ${index}`, x: 0, y: 0, width: side, height: side, durationMs: 100 }));
  const manifest = { schema: 'poku-pixel-art-atlas/v1', name: 'Budget', width: side, height: side, frameWidth: side, frameHeight: side,
    columns: 1, padding: 0, loop: true, direction: 'forward', frames, sequence: frames.map((_, i) => i), startsMs: frames.map((_, i) => i * 100), durationMs: frames.length * 100 };
  assert.throws(() => importPixelArtAnimationSheet2D(mapped, manifest), /aggregate storage/, 'budget failure precedes per-channel scanning and cel allocation');
});

test('timing that loses a frame boundary to floating-point precision is rejected on import', () => {
  const source = raster(2, 1, [RED, GREEN]);
  const manifest = { schema: 'poku-pixel-art-atlas/v1', name: 'Precision', width: 2, height: 1, frameWidth: 1, frameHeight: 1,
    columns: 2, padding: 0, loop: false, direction: 'forward', sequence: [0, 1], startsMs: [0, 1e20], durationMs: 1e20,
    frames: [{ id: 'first', name: 'First', x: 0, y: 0, width: 1, height: 1, durationMs: 1e20 }, { id: 'second', name: 'Second', x: 1, y: 0, width: 1, height: 1, durationMs: 1 }] };
  assert.throws(() => importPixelArtAnimationSheet2D(source, manifest), /distinguishable boundaries/);
});

test('an animation within native cell limits cannot import a project that exceeds its JSON save budget', () => {
  const side = 256, source = raster(side, side, new Array(side * side).fill(0xffffffff));
  const frames = Array.from({ length: 128 }, (_, index) => ({ id: `f-${index}`, name: `Frame ${index}`, x: 0, y: 0, width: side, height: side, durationMs: 100 }));
  const manifest = { schema: 'poku-pixel-art-atlas/v1', name: 'Saveable imports', width: side, height: side,
    frameWidth: side, frameHeight: side, columns: 1, padding: 0, loop: true, direction: 'forward',
    sequence: frames.map((_, i) => i), startsMs: frames.map((_, i) => i * 100), durationMs: frames.length * 100, frames };
  assert.throws(() => importPixelArtAnimationSheet2D(source, manifest), /64 MiB saved project budget/);
});
