import test from "node:test";
import assert from "node:assert/strict";
import { createSpriteClip2D, createFrame, Painter } from "../build/core/index.js";

const data = () => ({ version: 1, width: 1, height: 1, pivot: [0, 0], frames: [
  { durationMs: 100, runs: [1, 0xff0000ff] },
  { durationMs: 250, runs: [1, 0xff00ff00] },
  { durationMs: 50, runs: [1, 0xffff0000] },
] });

test("sprite clip uses authored durations, half-open boundaries and explicit looping", () => {
  const clip = createSpriteClip2D(data());
  assert.equal(clip.duration, .4);
  assert.equal(clip.frameCount, 3);
  for (const [time, frame] of [[0, 0], [.099999, 0], [.1, 1], [.349999, 1], [.35, 2], [.399999, 2]])
    assert.equal(clip.frameAt(time), frame, `time ${time}`);
  for (const time of [-.1, .4, 1, NaN, Infinity, -Infinity]) assert.equal(clip.frameAt(time), -1);
  const loop = createSpriteClip2D(data(), { loop: true });
  for (const [time, frame] of [[0, 0], [.4, 0], [.5, 1], [.75, 2], [.8, 0], [123.6, 0]])
    assert.equal(loop.frameAt(time), frame, `loop time ${time}`);
  for (const time of [-.1, NaN, Infinity]) assert.equal(loop.frameAt(time), -1);
  assert.ok(loop.frameAt(Number.MAX_VALUE) >= 0, "large finite times remain safe to seek");
  const single = createSpriteClip2D({ ...data(), frames: [{ durationMs: 1001, runs: [1, 0xffffffff] }] }, { loop: true });
  assert.equal(single.frameAt(single.duration), 0);
});

test("sprite clip draws per-cell alpha through placement, flip and rotation without changing painter state or light", () => {
  const source = { version: 1, width: 2, height: 2, pivot: [1.25, 1.5], frames: [
    { durationMs: 100, runs: [1, 0x804020ff, 1, 0x00112233, 1, 0xffaabbcc, 1, 0x4000ff00] },
  ] };
  const clip = createSpriteClip2D(source);
  for (const flip of [false, true]) for (const angle of [0, .43, Math.PI / 2]) {
    const actual = createFrame(16, 16), expected = createFrame(16, 16);
    actual.color.fill(0x80603010); expected.color.fill(0x80603010);
    actual.light.fill(0x10203040); expected.light.fill(0x10203040);
    const p = new Painter(actual).place(8.25, 9.5, flip, angle), q = new Painter(expected).place(8.25, 9.5, flip, angle);
    p.fade = q.fade = .6; p.lightK = q.lightK = .75; p.layer = q.layer = "back";
    const state = [p.tx, p.ty, p.fx, p.cs, p.sn, p.fade, p.lightK, p.layer, p.alphaMode];
    clip.draw(p, 0);
    q.rect(-1.25, -1.5, 1, 1, 0x804020ff);
    q.rect(-1.25, -.5, 1, 1, 0xffaabbcc);
    q.rect(-.25, -.5, 1, 1, 0x4000ff00);
    assert.deepEqual(actual.color, expected.color);
    assert.ok(actual.color.some(c => c !== 0x80603010));
    assert.deepEqual(actual.light, expected.light);
    assert.deepEqual([p.tx, p.ty, p.fx, p.cs, p.sn, p.fade, p.lightK, p.layer, p.alphaMode], state);
    const before = actual.color.slice();
    clip.draw(p, -.1); clip.draw(p, clip.duration);
    assert.deepEqual(actual.color, before);
  }
  const f = createFrame(2, 1), alpha = createSpriteClip2D({ version: 1, width: 2, height: 1, pivot: [0, 0],
    frames: [{ durationMs: 100, runs: [1, 0x804020ff, 1, 0x00112233] }] });
  alpha.draw(new Painter(f), 0);
  assert.deepEqual([...f.color], [0x804020ff, 0], "source alpha is retained; invisible hidden RGB is not drawn");
  f.alphaMode = "dither"; f.color.fill(0);
  alpha.draw(new Painter(f), 0);
  assert.equal(f.color[1], 0, "hidden RGB remains invisible in dither mode too");
});

test("sprite clip tags honor all directions without repeating pingpong endpoints", () => {
  const source = { ...data(), frames: Array.from({ length: 5 }, (_, i) => ({ durationMs: 100, runs: [1, 0xff000000 + i] })) };
  const expected = { forward: [1, 2, 3], reverse: [3, 2, 1], pingpong: [1, 2, 3, 2], pingpong_reverse: [3, 2, 1, 2] };
  for (const [direction, sequence] of Object.entries(expected)) {
    source.tags = [{ name: "action", from: 1, to: 3, direction, repeat: 7 }];
    const clip = createSpriteClip2D(source, { tag: "action" });
    assert.equal(clip.duration, sequence.length / 10);
    assert.equal(clip.frameCount, 5);
    assert.deepEqual(sequence.map((_, i) => clip.frameAt(i / 10 + .01)), sequence);
    assert.equal(clip.frameAt(clip.duration), -1, "tag repeat is interchange metadata, not a loop directive");
    assert.equal(createSpriteClip2D(source, { tag: "action", loop: true }).frameAt(clip.duration), sequence[0]);
  }
  for (const direction of ["pingpong", "pingpong_reverse"]) for (const to of [1, 2]) {
    source.tags = [{ name: "short", from: 1, to, direction }];
    assert.equal(createSpriteClip2D(source, { tag: "short" }).duration, (to - 1 + 1) / 10);
  }
  source.tags = [{ name: "uneven", from: 0, to: 2, direction: "pingpong" }];
  source.frames = data().frames;
  const uneven = createSpriteClip2D(source, { tag: "uneven" });
  assert.equal(uneven.duration, .65);
  assert.equal(uneven.frameAt(.4), 1);
});

test("sprite clip snapshots input, returns independent pixel copies and seeks deterministically", () => {
  const source = { ...data(), width: 2, pivot: [.5, 1], frames: [
    { durationMs: 100, runs: [1, 0x00123456, 1, 0x80402010] },
    { durationMs: 200, runs: [2, 0xffabcdef] },
  ], tags: [{ name: "back", from: 0, to: 1, direction: "reverse" }], source: { app: "Aseprite" } };
  const before = structuredClone(source), clip = createSpriteClip2D(source, { tag: "back", loop: true });
  assert.deepEqual(source, before);
  assert.deepEqual([...clip.framePixels(0)], [0x00123456, 0x80402010]);
  const copy = clip.framePixels(0); copy.fill(0);
  source.width = 1; source.pivot[0] = 123; source.frames[0].runs.fill(0); source.frames[1].durationMs = 900;
  source.tags[0].direction = "forward"; source.tags[0].from = 1; source.frames.reverse();
  assert.equal(clip.width, 2); assert.deepEqual(clip.pivot, [.5, 1]); assert.equal(clip.duration, .3);
  assert.deepEqual([...clip.framePixels(0)], [0x00123456, 0x80402010]);
  assert.notEqual(clip.framePixels(0), clip.framePixels(0));
  for (const time of [.25, .01, 2.04, 0, .2, .3, .29]) {
    const calls = [], painter = { rect(...args) { calls.push(args); } };
    clip.draw(painter, time);
    const again = []; clip.draw({ rect(...args) { again.push(args); } }, time);
    assert.deepEqual(calls, again);
  }
  for (const index of [-1, 2, .5, NaN, Infinity]) assert.throws(() => clip.framePixels(index), RangeError);
});

test("sprite clip rejects malformed, sparse and out-of-range data", () => {
  const base = data();
  for (const change of [null, { ...base, version: 2 }, { ...base, width: .5 }, { ...base, height: Infinity },
    { ...base, pivot: [NaN, 0] }, { ...base, pivot: [0] }, { ...base, pivot: Array(2) },
    { ...base, frames: [] }, { ...base, frames: Array(1) }, { ...base, source: [] },
    { ...base, tags: Array(1) }, { ...base, tags: {} }])
    assert.throws(() => createSpriteClip2D(change), RangeError);
  for (const change of [{ durationMs: 0 }, { durationMs: NaN }, { durationMs: Infinity }, { durationMs: -1 },
    { runs: [] }, { runs: [1] }, { runs: [0, 0] }, { runs: [2, 0] }, { runs: [.5, 0] },
    { runs: [1, -1] }, { runs: [1, 0x100000000] }, { runs: [1, NaN] }, { runs: Array(2) }])
    assert.throws(() => createSpriteClip2D({ ...base, frames: [{ ...base.frames[0], ...change }] }), RangeError);
  assert.throws(() => createSpriteClip2D({ ...base, width: 2 }), RangeError, "runs must fill the entire frame");
  for (const change of [{ name: "" }, { from: -1 }, { from: .5 }, { to: 3 }, { from: 2, to: 1 },
    { direction: "sideways" }, { repeat: -1 }, { repeat: .5 }])
    assert.throws(() => createSpriteClip2D({ ...base, tags: [{ name: "tag", from: 0, to: 2, ...change }] }), RangeError);
  assert.throws(() => createSpriteClip2D({ ...base, tags: [{ name: "a", from: 0, to: 0 }, { name: "a", from: 1, to: 1 }] }), RangeError);
  for (const options of [null, { tag: "missing" }, { tag: "" }, { loop: 1 }])
    assert.throws(() => createSpriteClip2D(base, options), RangeError);
});

test("sprite clip rejects oversized decoded storage and invalid timing before use", () => {
  const base = data();
  for (const change of [{ width: 4097 }, { height: 4097 }, { frames: Array(4097) },
    { width: 4096, height: 4096, frames: [base.frames[0], base.frames[0]] }])
    assert.throws(() => createSpriteClip2D({ ...base, ...change }), RangeError);
  for (const frames of [
    [{ durationMs: Number.MIN_VALUE, runs: [1, 0] }],
    [{ durationMs: Number.MAX_VALUE, runs: [1, 0] }, { durationMs: Number.MAX_VALUE, runs: [1, 0] }],
    [{ durationMs: 1e20, runs: [1, 0] }, { durationMs: 1, runs: [1, 0] }],
  ]) assert.throws(() => createSpriteClip2D({ ...base, frames }), RangeError);
});
