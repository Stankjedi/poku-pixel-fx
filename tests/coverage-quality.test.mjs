import test from "node:test";
import assert from "node:assert/strict";
import { createFrame, painterFor, clearFrame, composite, hex } from "../build/core/index.js";
import { blendOver } from "../build/render/coverage.js";

test("fading a filled shape retains every pixel and accumulates overlapping coverage", () => {
  const f = createFrame(4, 4), p = painterFor(f), color = hex("#7854df");
  p.rect(0, 0, 4, 4, color, 0.5);
  assert.ok(f.color.every(c => (c >>> 24) === 128));
  assert.ok(f.color.every(c => (c & 0xffffff) === (color & 0xffffff)));
  p.rect(0, 0, 4, 4, color, 0.5);
  assert.ok(f.color.every(c => (c >>> 24) === 192));
  const out = composite(f, new Uint8Array(64), hex("#000000"));
  for (let i = 1; i < 16; i++) assert.deepEqual(out.subarray(i * 4, i * 4 + 4), out.subarray(0, 4));
});

test("artistic ordered dithering remains explicit and opaque palette pixels stay exact", () => {
  const f = createFrame(4, 4), p = painterFor(f), color = hex("#ffba43");
  f.alphaMode = "dither";
  p.rect(0, 0, 4, 4, color, 0.5);
  assert.equal(f.color.filter(Boolean).length, 8);
  const legacy = f.color.slice();
  clearFrame(f); f.alphaMode = "coverage";
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) p.dither(x, y, color, 0.5);
  assert.deepEqual(f.color, legacy);
  clearFrame(f); p.rect(0, 0, 4, 4, color);
  assert.ok(f.color.every(c => c === (color >>> 0)));
});

test("source alpha and painter fade are applied once without wraparound or dark transparent fringes", () => {
  const f = createFrame(1, 1), p = painterFor(f), red = hex("#ff0000");
  p.fade = 0.5;
  p.dot(0, 0, red, 0.5);
  assert.equal(f.color[0] >>> 24, 64);
  assert.equal(f.color[0] & 255, 255);
  clearFrame(f); p.fade = 1;
  p.blend(0, 0, red, 2);
  assert.equal(f.color[0], red >>> 0);
  assert.equal(blendOver(0, 0x800000ff, 0.5) >>> 24, 64);
  assert.equal(blendOver(red, 0, 1), red);
});
