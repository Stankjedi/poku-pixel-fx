import test from "node:test";
import assert from "node:assert/strict";
import { editSpriteCluster2D } from "../build/core/sprite-edit.js";
import { createFrame } from "../build/core/fx.js";
import { Painter } from "../build/core/painter.js";
import { hex } from "../build/core/color.js";
import { renderHumanPortrait2D } from "../build/core/human-portrait.js";

const sprite = (w = 5, h = 5) => ({ w, h, x: -2, y: -3,
  pixels: new Uint32Array(w * h), mask: { w, h, data: new Uint8Array(w * h) } });

test("explicit erasure updates color and silhouette on an independent copy", () => {
  const source = sprite(), i = 2 * source.w + 2;
  source.pixels[i] = hex("#e9b590") >>> 0; source.mask.data[i] = 1;
  const before = structuredClone(source);
  const edited = editSpriteCluster2D(source, { x: 2, y: 2, rows: ["x"], palette: { x: null } });
  assert.equal(edited.pixels[i], 0); assert.equal(edited.mask.data[i], 0);
  assert.deepEqual(source, before);
  assert.notEqual(edited.pixels, source.pixels); assert.notEqual(edited.mask.data, source.mask.data);
  assert.deepEqual([edited.x, edited.y], [source.x, source.y]);
  const frame = createFrame(5, 5), p = new Painter(frame);
  p.mask(edited.mask, 0, 0, 0xffffffff); p.outline(edited.mask, 0, 0, 0xffffffff);
  assert.ok(frame.color.every(c => c === 0), "the erased isolated pixel leaves no phantom silhouette for later drawing");
  const repainted = editSpriteCluster2D(edited, { x: 1, y: 1, rows: ["a🟨z"], palette: { a: hex("#fff"), "🟨": 0x40887766, z: 0x00112233 } });
  assert.deepEqual([...repainted.pixels.slice(6, 9)], [0xffffffff, 0x40887766, 0]);
  assert.deepEqual([...repainted.mask.data.slice(6, 9)], [1, 1, 0]);
  assert.ok(edited.pixels.every(c => c === 0));
});

test("manual portrait clusters honor semantic selection, skipped symbols and native canvas clipping", () => {
  const source = renderHumanPortrait2D({ resolution: 64 }), before = structuredClone(source);
  const i = source.eyeRegionMask.findIndex((value, j) => value && source.mask.data[j]);
  assert.ok(i >= 0);
  const x = i % source.w, y = Math.floor(i / source.w);
  const patch = Object.freeze({ x, y, rows: Object.freeze(["xa.", ".aa"]), palette: Object.freeze({ x: null, a: hex("#fae8bd") }) });
  const edited = editSpriteCluster2D(source, patch, { selection: { w: source.w, h: source.h, data: source.eyeRegionMask } });
  assert.equal(edited.pixels[i], 0); assert.equal(edited.mask.data[i], 0);
  for (let j = 0; j < source.pixels.length; j++) {
    const xx = j % source.w - x, yy = Math.floor(j / source.w) - y;
    const symbol = patch.rows[yy]?.[xx];
    if (!source.eyeRegionMask[j] || (symbol !== "x" && symbol !== "a")) {
      assert.equal(edited.pixels[j], source.pixels[j]); assert.equal(edited.mask.data[j], source.mask.data[j]);
    }
  }
  assert.deepEqual(source, before);
  assert.equal(edited.eyeAnchors, source.eyeAnchors); assert.equal(edited.eyeMask, source.eyeMask, "semantic regions are not automatically redrawn");
  assert.deepEqual(editSpriteCluster2D(edited, patch, { selection: { w: source.w, h: source.h, data: source.eyeRegionMask } }), edited);
  const clipped = editSpriteCluster2D(sprite(2, 2), { x: -1, y: -1, rows: ["aaa", "aa", ".aa"], palette: { a: hex("#fff") } });
  assert.deepEqual([...clipped.mask.data], [1, 0, 1, 1]);
});

test("invalid cluster geometry, palette and buffer shapes reject without changing the source", () => {
  const source = sprite(), before = structuredClone(source), patch = { x: 0, y: 0, rows: ["a"], palette: { a: hex("#fff") } };
  for (const change of [{ x: .5 }, { y: Infinity }, { x: Number.MAX_SAFE_INTEGER }, { rows: [1] },
    { palette: { aa: 0xffffffff } }, { palette: { a: NaN } }, { palette: { a: 0x100000000 } }, { palette: { a: -.5 } }])
    assert.throws(() => editSpriteCluster2D(source, { ...patch, ...change }), RangeError);
  assert.throws(() => editSpriteCluster2D(source, patch, { selection: { w: 1, h: 1, data: [1] } }), RangeError);
  assert.throws(() => editSpriteCluster2D({ ...source, mask: { ...source.mask, data: new Uint8Array(1) } }, patch), RangeError);
  assert.deepEqual(source, before);
});
