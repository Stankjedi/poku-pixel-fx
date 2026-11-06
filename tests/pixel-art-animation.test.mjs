import test from 'node:test';
import assert from 'node:assert/strict';
import { createPixelArtProject2D, renderPixelArtProject2D } from '../build/authoring/pixel-art-project.js';
import { createPixelArtDocument2D, createBlankPixelArtDocument2D, renderPixelArtDocument2D,
  parsePixelArtDocument2D } from '../build/authoring/pixel-art-document.js';
import { createPixelArtAnimation2D, validatePixelArtAnimation2D, parsePixelArtAnimation2D, serializePixelArtAnimation2D,
  getPixelArtAnimationFrame2D, addPixelArtAnimationFrame2D, duplicatePixelArtAnimationFrame2D, removePixelArtAnimationFrame2D,
  movePixelArtAnimationFrame2D, updatePixelArtAnimationFrame2D, replacePixelArtAnimationFrame2D,
  createPixelArtAnimationTimeline2D, createPixelArtOnionSkin2D, renderPixelArtAnimation2D,
  exportPixelArtAnimationSheet2D, exportPixelArtAnimationClip2D, PixelArtAnimationHistory2D } from '../build/authoring/pixel-art-animation.js';
import { createSpriteClip2D } from '../build/core/sprite-clip.js';

const RED = 0xff0000ff, GREEN = 0xff00ff00, BLUE = 0xffff0000;
const sprite = (colors, mask = colors.map(c => c >>> 24 ? 1 : 0)) => ({ w: colors.length, h: 1, pixels: Uint32Array.from(colors), mask: { w: colors.length, h: 1, data: Uint8Array.from(mask) } });
const document = (colors = [RED, 0, 0], name = 'Cel') => createPixelArtDocument2D(sprite(colors), name);
function sequence() {
  let animation = createPixelArtAnimation2D(document(), { durationMs: 100, name: '편집 모션' });
  animation = addPixelArtAnimationFrame2D(animation, document([0, GREEN, 0]), { name: 'Center', durationMs: 50 });
  return addPixelArtAnimationFrame2D(animation, document([0, 0, BLUE]), { name: 'End', durationMs: 200 });
}

test('v1/v2 imports become one cel without changing RGBA, independent silhouettes or material output', () => {
  const original = sprite([RED, 0x0124c8a9, 0x00123456, BLUE], [1, 1, 0, 0]);
  const v1 = createPixelArtProject2D(original, 'Earlier material artwork');
  v1.layers.push({ name: 'Metal', material: { kind: 'metal', seed: 51 }, selection: [1, 0, 0, 0], height: [0, 1, 2, 0] });
  const imported = parsePixelArtAnimation2D(JSON.stringify(v1));
  assert.equal(imported.schema, 'poku-pixel-art/v3'); assert.equal(imported.frames.length, 1);
  assert.deepEqual(renderPixelArtAnimation2D(imported)[0], renderPixelArtProject2D(v1));
  const v2 = createPixelArtDocument2D(original, '独立した透明色');
  assert.deepEqual(renderPixelArtAnimation2D(parsePixelArtAnimation2D(JSON.stringify(v2)))[0], original);
  assert.equal(v2.schema, 'poku-pixel-art/v2');
  assert.throws(() => parsePixelArtDocument2D(serializePixelArtAnimation2D(imported)), /identity/);
});

test('v3 saves every cel layer, edit mask and baked geometry independently and exactly', () => {
  const a = document([RED, 0x5c253489, 0]);
  a.channels = { material: [7, 8, 0], height: [.25, 2.5, 0], normal: [0, 0, 1, .6, 0, .8, 0, 0, 1] };
  a.selection = [0, 1, 0]; a.protectedMask = [1, 0, 0]; a.authoredHeight = [1, 2, 0];
  a.layers.push({ kind: 'paint', id: 'detail', name: '눈동자 🌙', indices: [2], pixels: [0x01234567] }); a.activeLayerId = 'detail';
  let animation = createPixelArtAnimation2D(a, { name: '7등신 캐릭터', durationMs: 1000 / 60, direction: 'pingpong' });
  animation = addPixelArtAnimationFrame2D(animation, document([BLUE, GREEN, RED]), { durationMs: 125 });
  const before = structuredClone(animation), json = serializePixelArtAnimation2D(animation), reopened = parsePixelArtAnimation2D(json);
  assert.equal(serializePixelArtAnimation2D(reopened), json);
  assert.deepEqual(renderPixelArtAnimation2D(reopened), renderPixelArtAnimation2D(animation));
  assert.deepEqual(animation, before);
  reopened.frames[0].document.channels.height[0] = 99;
  assert.equal(animation.frames[0].document.channels.height[0], .25);
  assert.equal(reopened.frames[0].document.activeLayerId, 'detail');
});

test('duplicate/blank/reorder/delete operate on independent cels and keep selection valid', () => {
  const initial = sequence(), original = structuredClone(initial), sourceId = initial.frames[0].id;
  let edited = duplicatePixelArtAnimationFrame2D(initial, sourceId), copyId = edited.activeFrameId;
  assert.equal(edited.frames[1].id, copyId); assert.equal(edited.frames[1].durationMs, 100);
  edited.frames[1].document.pixels[0] = BLUE;
  assert.equal(initial.frames[0].document.pixels[0], RED, 'a copied cel does not alias source arrays');
  edited = movePixelArtAnimationFrame2D(edited, copyId, 3);
  assert.equal(edited.frames[3].id, copyId); assert.equal(edited.activeFrameId, copyId);
  const unchangedFrame = edited.frames[0];
  edited = addPixelArtAnimationFrame2D(edited);
  assert.equal(getPixelArtAnimationFrame2D(edited).document.pixels.every(c => c === 0), true);
  assert.equal(edited.frames[0], unchangedFrame, 'editing a different cel does not copy the entire animation');
  edited = removePixelArtAnimationFrame2D(edited);
  assert.equal(edited.activeFrameId, copyId);
  edited = removePixelArtAnimationFrame2D(edited, sourceId);
  assert.equal(edited.activeFrameId, copyId);
  assert.deepEqual(initial, original);
  assert.throws(() => removePixelArtAnimationFrame2D(createPixelArtAnimation2D(document())), /at least one/);
});

test('cel replacement snapshots only the edited document and rejects mismatched dimensions before state changes', () => {
  const initial = sequence(), cel = document([GREEN, RED, BLUE]), other = initial.frames[0];
  const edited = replacePixelArtAnimationFrame2D(initial, cel);
  cel.pixels.fill(0);
  assert.deepEqual(getPixelArtAnimationFrame2D(edited).document.pixels, [GREEN, RED, BLUE]);
  assert.equal(edited.frames[0], other);
  assert.equal(replacePixelArtAnimationFrame2D(edited, getPixelArtAnimationFrame2D(edited).document), edited);
  assert.throws(() => replacePixelArtAnimationFrame2D(initial, createBlankPixelArtDocument2D(4, 1)), /same native dimensions/);
  assert.deepEqual(getPixelArtAnimationFrame2D(initial).document.pixels, [0, 0, BLUE]);
});

test('frame timing respects variable durations, exact boundaries, reverse and ping-pong endpoints', () => {
  const animation = sequence(), forward = createPixelArtAnimationTimeline2D(animation);
  assert.deepEqual(forward.sequence, [0, 1, 2]); assert.equal(forward.durationMs, 350);
  for (const [time, expected] of [[0, 0], [99.999, 0], [100, 1], [149.999, 1], [150, 2], [349.999, 2], [350, 0], [450, 1]]) assert.equal(forward.frameAt(time), expected);
  const reverse = createPixelArtAnimationTimeline2D({ ...animation, direction: 'reverse', loop: false });
  assert.deepEqual(reverse.sequence, [2, 1, 0]);
  assert.equal(reverse.frameAt(0), 2); assert.equal(reverse.frameAt(200), 1); assert.equal(reverse.frameAt(250), 0); assert.equal(reverse.frameAt(350), -1);
  const pingpong = createPixelArtAnimationTimeline2D({ ...animation, direction: 'pingpong' });
  assert.deepEqual(pingpong.sequence, [0, 1, 2, 1]); assert.equal(pingpong.durationMs, 400);
  assert.equal(pingpong.frameAt(350), 1); assert.equal(pingpong.frameAt(400), 0); assert.equal(pingpong.frameAtPhase(1), 1);
  for (const time of [-1, NaN, Infinity]) assert.equal(pingpong.frameAt(time), -1);
  animation.frames[0].durationMs = 900;
  assert.equal(forward.frameAt(100), 1, 'compiled playback does not read subsequently mutated timing');
  const single = createPixelArtAnimationTimeline2D({ ...createPixelArtAnimation2D(document()), direction: 'pingpong' });
  assert.deepEqual(single.sequence, [0]);
  assert.deepEqual(createPixelArtAnimationTimeline2D({ ...animation, frames: animation.frames.slice(0, 2), activeFrameId: animation.frames[0].id, direction: 'pingpong' }).sequence, [0, 1]);
});

test('fractional frame rates remain authored durations and impossible time boundaries are rejected', () => {
  let animation = createPixelArtAnimation2D(document(), { durationMs: 1000 / 60 });
  animation = duplicatePixelArtAnimationFrame2D(animation);
  const timeline = createPixelArtAnimationTimeline2D(animation);
  assert.equal(timeline.frameAt(1000 / 60), 1); assert.equal(timeline.durationMs, 1000 / 30);
  const before = structuredClone(animation);
  for (const durationMs of [0, -1, NaN, Infinity, Number.MIN_VALUE]) assert.throws(() => updatePixelArtAnimationFrame2D(animation, animation.activeFrameId, { durationMs }));
  const ambiguous = { ...animation, direction: 'reverse', frames: [{ ...animation.frames[0], durationMs: 1 }, { ...animation.frames[1], durationMs: 1e308 }] };
  assert.throws(() => validatePixelArtAnimation2D(ambiguous), /distinguishable/);
  assert.deepEqual(animation, before);
});

test('long Unicode cel names are copied without splitting a surrogate pair', () => {
  let animation = createPixelArtAnimation2D(document());
  animation = updatePixelArtAnimationFrame2D(animation, animation.activeFrameId, { name: '🌙'.repeat(80) });
  const copied = getPixelArtAnimationFrame2D(duplicatePixelArtAnimationFrame2D(animation)).name;
  assert.ok(copied.length <= 160); assert.ok(copied.endsWith(' copy'));
  assert.equal(Array.from(copied.slice(0, -5)).every(char => char === '🌙'), true);
});

test('onion skin uses adjacent silhouettes and source alpha, omits active art and never mutates the cels', () => {
  const frames = [sprite([0xffffffff, 0, 0, 0]), sprite([0, 0xffffffff, 0, 0]), sprite([0, 0, 0x80ffffff, 0xffffffff], [0, 0, 1, 0])];
  const before = structuredClone(frames), ghost = createPixelArtOnionSkin2D(frames, 1, { opacity: .5, previousColor: RED, nextColor: BLUE });
  assert.deepEqual([...ghost.mask.data], [1, 0, 1, 0]);
  assert.equal(ghost.pixels[0], 0x800000ff); assert.equal(ghost.pixels[2], 0x40ff0000);
  assert.deepEqual(frames, before); assert.equal(ghost.channels, undefined);
  assert.equal(createPixelArtOnionSkin2D(frames, 1, { opacity: 0 }).mask.data.some(Boolean), false);
});

test('looped onion skin excludes the active cel and deduplicates a neighbour seen in both directions', () => {
  const frames = [sprite([0xffffffff, 0]), sprite([0, 0xffffffff])];
  const ghost = createPixelArtOnionSkin2D(frames, 0, { previous: 8, next: 8, loop: true, opacity: .5 });
  assert.equal(ghost.pixels[0], 0); assert.equal(ghost.pixels[1] >>> 24, 128);
  assert.deepEqual([...createPixelArtOnionSkin2D([frames[0]], 0, { loop: true }).pixels], [0, 0]);
  assert.throws(() => createPixelArtOnionSkin2D(frames, 2), /active cel/);
  assert.throws(() => createPixelArtOnionSkin2D([frames[0], sprite([0])], 0), /matching native buffers/);
});

test('native sheet export has exact RGBA, transparent gutters and an explicit variable-time playback manifest', () => {
  const source = sprite([0x0124c8a9, 0x00123456, 0xffaabbcc], [1, 1, 0]);
  let animation = createPixelArtAnimation2D(createPixelArtDocument2D(source), { durationMs: 75, direction: 'reverse', loop: false });
  animation = addPixelArtAnimationFrame2D(animation, document([RED, GREEN, BLUE]), { durationMs: 125 });
  const original = structuredClone(animation), sheet = exportPixelArtAnimationSheet2D(animation, { columns: 2, padding: 1 });
  assert.equal(sheet.sprite.w, 10); assert.equal(sheet.sprite.h, 3);
  assert.deepEqual(sheet.manifest.sequence, [1, 0]); assert.deepEqual(sheet.manifest.startsMs, [0, 125]); assert.equal(sheet.manifest.durationMs, 200);
  assert.deepEqual(sheet.manifest.frames.map(frame => [frame.x, frame.y, frame.durationMs]), [[1, 1, 75], [6, 1, 125]]);
  const pixel = (x, y) => [...sheet.rgba.subarray((y * sheet.sprite.w + x) * 4, (y * sheet.sprite.w + x + 1) * 4)];
  assert.deepEqual(pixel(1, 1), [0xa9, 0xc8, 0x24, 1]);
  assert.deepEqual(pixel(2, 1), [0x56, 0x34, 0x12, 0]);
  assert.deepEqual(pixel(3, 1), [0xcc, 0xbb, 0xaa, 0], 'visual exports bake only silhouette alpha, retaining hidden RGB');
  for (const [x, y] of [[0, 0], [4, 1], [5, 1], [9, 2]]) assert.deepEqual(pixel(x, y), [0, 0, 0, 0]);
  assert.deepEqual(animation, original);
  assert.throws(() => exportPixelArtAnimationSheet2D(animation, { columns: 0 }));
});

test('exported clip is consumed by the existing runtime with matching ping-pong timing and exact colors', () => {
  const animation = { ...sequence(), direction: 'pingpong' }, data = exportPixelArtAnimationClip2D(animation, { pivot: [1, .5] });
  const clip = createSpriteClip2D(data, { loop: animation.loop });
  assert.equal(clip.frameCount, 4); assert.equal(clip.duration, .4);
  assert.deepEqual(data.frames.map(frame => frame.durationMs), [100, 50, 200, 50]);
  assert.deepEqual(clip.pivot, [1, .5]);
  for (const [time, colors] of [[0, [RED, 0, 0]], [.1, [0, GREEN, 0]], [.15, [0, 0, BLUE]], [.35, [0, GREEN, 0]], [.4, [RED, 0, 0]]]) assert.deepEqual([...clip.framePixels(clip.frameAt(time))], colors);
  const hidden = createPixelArtAnimation2D(createPixelArtDocument2D(sprite([0x0124c8a9, 0xffaabbcc], [1, 0])));
  assert.deepEqual([...createSpriteClip2D(exportPixelArtAnimationClip2D(hidden)).framePixels(0)], [0x0124c8a9, 0x00aabbcc]);
});

test('whole-animation history restores cels/timing and treats frame navigation as a non-edit', () => {
  const original = sequence(), history = new PixelArtAnimationHistory2D(original);
  const first = original.frames[0].id, last = original.frames[2].id;
  history.selectFrame(first);
  assert.equal(history.canUndo, false); assert.equal(history.value.activeFrameId, first);
  const edited = updatePixelArtAnimationFrame2D(history.value, first, { durationMs: 230 });
  history.commit(edited); history.commit(removePixelArtAnimationFrame2D(edited, last));
  assert.equal(history.undo().frames.length, 3);
  assert.equal(history.canRedo, true); history.selectFrame(last);
  assert.equal(history.commit({ ...history.value, activeFrameId: first }), false, 'a navigation-only commit does not clear redo');
  assert.equal(history.canRedo, true); assert.equal(history.redo().frames.length, 2);
  history.undo(); history.commit(updatePixelArtAnimationFrame2D(history.value, last, { name: 'New branch' }));
  assert.equal(history.canRedo, false);
  const detached = history.value; detached.frames[0].document.pixels.fill(0);
  assert.equal(history.value.frames[0].document.pixels[0], RED);
});

test('history bounds both redo and undo storage while preserving the current animation', () => {
  const original = sequence(), history = new PixelArtAnimationHistory2D(original, 2);
  for (const name of ['a', 'b', 'c']) history.commit({ ...original, name });
  assert.equal(history.undo().name, 'b'); assert.equal(history.undo().name, 'a'); assert.equal(history.canUndo, false);
  const tiny = new PixelArtAnimationHistory2D(original, 64, 1);
  tiny.commit({ ...original, name: 'Kept current cels' });
  assert.equal(tiny.canUndo, false); assert.equal(tiny.value.frames.length, 3); assert.equal(tiny.value.name, 'Kept current cels');
  assert.throws(() => tiny.selectFrame('missing'), /must exist/);
});

test('import rejects ambiguous identity, missing cels, invalid timing and foreign project schemas', () => {
  const animation = sequence(), before = structuredClone(animation);
  const invalid = [{ ...animation, frames: [] }, { ...animation, activeFrameId: 'gone' }, { ...animation, direction: 'random' },
    { ...animation, frames: [animation.frames[0], animation.frames[0]] }, { ...animation, loop: 'yes' }, { ...animation, schema: 'poku.project/v1' }];
  for (const value of invalid) assert.throws(() => validatePixelArtAnimation2D(value));
  assert.throws(() => parsePixelArtAnimation2D('{invalid json'));
  assert.deepEqual(animation, before);
});

test('aggregate budgets reject oversized animations before copying or rendering sparse import buffers', () => {
  const n = 1024 * 1024, doc = { ...createBlankPixelArtDocument2D(1, 1), width: 1024, height: 1024, pixels: new Array(n) };
  const frame = index => ({ id: `frame-${index}`, name: `Cel ${index}`, durationMs: 100, document: doc });
  const oversized = { schema: 'poku-pixel-art/v3', name: 'Budget', width: 1024, height: 1024, activeFrameId: 'frame-0', loop: true, direction: 'forward', frames: Array.from({ length: 9 }, (_, i) => frame(i)) };
  assert.throws(() => validatePixelArtAnimation2D(oversized), /frame budget/);
  const mapped = { ...doc, channels: { material: new Array(n), height: new Array(n), normal: new Array(n * 3) } };
  assert.throws(() => validatePixelArtAnimation2D({ ...oversized, frames: Array.from({ length: 4 }, (_, i) => ({ ...frame(i), document: mapped })) }), /aggregate/);
  const layers = Array.from({ length: 32 }, (_, i) => ({ kind: 'material', id: `mat-${i}`, name: `Material ${i}`, material: {} }));
  const manyLayers = { ...doc, width: 256, height: 256, pixels: new Array(65536), layers };
  assert.throws(() => validatePixelArtAnimation2D({ ...oversized, width: 256, height: 256, frames: Array.from({ length: 32 }, (_, i) => ({ ...frame(i), document: manyLayers })) }), /aggregate/);
});
