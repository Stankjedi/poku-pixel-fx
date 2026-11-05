import test from "node:test";
import assert from "node:assert/strict";
import { createFrame } from "../build/core/fx.js";
import { Painter } from "../build/core/painter.js";

const rows = ["ab.a", ".bab", "aa"], palette = { a: 0xff3355ee, b: 0xffee9955 };
const mask = { w: 4, h: 3, data: new Uint8Array([1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 0]) };
const color = (x, y) => (0xff001122 | ((x + y + 2) * 17 << 16)) >>> 0;
const alpha = .4;
function render(kind, { x = .75, y = .75, tx = 8, ty = 8, flip = false, angle = 0, options = {} } = {}) {
  const frame = createFrame(32, 32), p = new Painter(frame).place(tx, ty, flip, angle);
  if (kind === "sprite") p.sprite(rows, palette, x, y, { a: alpha, ...options });
  else p[kind](mask, x, y, color, alpha);
  return frame.color;
}

test("fractional sprite, mask and outline anchors do not jump at the zero-rotation branch", () => {
  for (const kind of ["sprite", "mask", "outline"]) for (const flip of [false, true]) {
    const base = render(kind, { flip });
    for (const angle of [-1e-10, 1e-10]) assert.deepEqual(render(kind, { flip, angle }), base, `${kind}, flip=${flip}, angle=${angle}`);
    assert.ok(base.some(Boolean));
    for (const c of base) if (c) assert.equal(c >>> 24, Math.round(alpha * 255), "each source cell is composited once");
  }
});

test("local and parent translations describe the same pixel placement", () => {
  for (const kind of ["sprite", "mask", "outline"]) for (const flip of [false, true]) {
    for (const [x, y, tx, ty] of [[.75, .75, 8, 8], [-1.2, -2.7, 13.1, 12.2], [1.25, -2.25, 8.5, 12.5]]) {
      const options = { flip: true, flipY: true };
      assert.deepEqual(render(kind, { x, y, tx, ty, flip, options }), render(kind, {
        x: 0, y: 0, tx: tx + (flip ? -x : x), ty: ty + y, flip, options,
      }), `${kind}, flip=${flip}, anchor=${x},${y}`);
    }
  }
});

test("integer anchors retain legacy pixels with mirrors, sparse rows, tint and dither", () => {
  for (const kind of ["sprite", "mask", "outline"]) for (const flip of [false, true]) {
    for (const mode of ["coverage", "dither"]) for (const tint of [undefined, 0xffaaaaff]) {
      const actual = createFrame(24, 24, -12, -12), expected = createFrame(24, 24, -12, -12);
      actual.alphaMode = expected.alphaMode = mode;
      const a = new Painter(actual).place(2, -1, flip), b = new Painter(expected).place(2, -1, flip);
      const x = -3, y = -2;
      a.fade = b.fade = .8;
      if (kind === "sprite") {
        a.sprite(rows, palette, x, y, { a: alpha, flip: true, flipY: true, tint });
        for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
          const ch = rows[r][c]; if (ch === ".") continue;
          b.dot(x + 3 - c, y + rows.length - 1 - r, tint ?? palette[ch], alpha);
        }
      } else {
        a[kind](mask, x, y, color, alpha);
        const at = (xx, yy) => xx >= 0 && yy >= 0 && xx < mask.w && yy < mask.h && mask.data[yy * mask.w + xx];
        for (let yy = -1; yy <= mask.h; yy++) for (let xx = -1; xx <= mask.w; xx++) {
          const draw = kind === "mask" ? at(xx, yy) : !at(xx, yy) && (at(xx - 1, yy) || at(xx + 1, yy) || at(xx, yy - 1) || at(xx, yy + 1));
          if (draw) b.dot(x + xx, y + yy, color(xx, yy), alpha);
        }
      }
      assert.deepEqual(actual.color, expected.color, `${kind}, flip=${flip}, mode=${mode}`);
      assert.deepEqual(actual.light, expected.light);
    }
  }
});
