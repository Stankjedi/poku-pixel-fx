import test from "node:test";
import assert from "node:assert/strict";
import { createFrame, clearFrame } from "../build/core/fx.js";
import { Painter } from "../build/core/painter.js";
import { drawArc } from "../build/fx/arcane/_lib.js";
import { oval } from "../build/fx/holy/_lib.js";
import { trace as lightningTrace } from "../build/fx/lightning/_lib.js";
import { sliver } from "../build/fx/melee/_lib.js";

const WHITE = 0xffffffff, ALPHA = 0.4, BYTE_ALPHA = Math.round(ALPHA * 255);
const occupied = frame => {
  const cells = new Set();
  frame.color.forEach((color, i) => { if (color >>> 24) cells.add(i); });
  return cells;
};
function assertConnected(frame) {
  const cells = occupied(frame);
  assert.ok(cells.size > 0, "stroke must remain visible");
  const pending = [cells.values().next().value];
  cells.delete(pending[0]);
  while (pending.length) {
    const cell = pending.pop(), x = cell % frame.w, y = Math.floor(cell / frame.w);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= frame.w || ny >= frame.h) continue;
      const next = ny * frame.w + nx;
      if (cells.delete(next)) pending.push(next);
    }
  }
  assert.equal(cells.size, 0, "stroke has disconnected cells");
}
function assertRectangle(frame, { tx, ty, flip, angle }, { x, y, w, h }, alpha = BYTE_ALPHA) {
  const cosine = Math.cos(angle), sine = Math.sin(angle), mirror = flip ? -1 : 1;
  let inside = 0;
  for (let row = 0; row < frame.h; row++) for (let col = 0; col < frame.w; col++) {
    const dx = frame.ox + col + 0.5 - tx, dy = frame.oy + row + 0.5 - ty;
    const lx = (dx * cosine + dy * sine) * mirror, ly = -dx * sine + dy * cosine;
    const expected = lx >= x && ly >= y && lx < x + w && ly < y + h;
    assert.equal(frame.color[row * frame.w + col] >>> 24, expected ? alpha : 0, `coverage at (${col}, ${row})`);
    if (expected) inside++;
  }
  assert.ok(inside > 10, "reference rectangle must occupy a meaningful area");
}

test("thin paths stay connected at fractional positions under rotations and mirroring", () => {
  const points = [[-14.4, -8.7], [-4.1, -4.3], [2.6, -8.1], [13.3, 7.7]];
  for (const width of [1.1, 1.4]) for (const angle of [0, 0.37, Math.PI / 4, 1.11]) for (const flip of [false, true]) {
    const frame = createFrame(64, 64), painter = new Painter(frame);
    painter.place(31.37, 29.23, flip, angle);
    painter.path(points, WHITE, ALPHA, width);
    assert.ok(occupied(frame).size > 20);
    assertConnected(frame);
    for (const pixel of frame.color) assert.ok((pixel >>> 24) <= BYTE_ALPHA);
    const [x, y] = points[0], dx = x * (flip ? -1 : 1);
    const sx = Math.floor(31.37 + dx * Math.cos(angle) - y * Math.sin(angle));
    const sy = Math.floor(29.23 + dx * Math.sin(angle) + y * Math.cos(angle));
    assert.ok(frame.color[sy * frame.w + sx] >>> 24, "continuous coordinates are transformed before snapping the endpoint");
  }
});

test("path joins, repeated samples and retraced segments cannot accumulate their own opacity", () => {
  const points = [[8.2, 9.3], [25.6, 9.3], [25.6, 9.3], [25.6, 23.7], [25.6, 9.3], [8.2, 9.3]];
  for (const width of [1, 1.4, 3.5]) {
    const frame = createFrame(40, 36), painter = new Painter(frame);
    painter.path(points, WHITE, ALPHA, width);
    assertConnected(frame);
    for (const pixel of frame.color) if (pixel >>> 24) assert.equal(pixel >>> 24, BYTE_ALPHA);
  }
});

test("path colors progress over total length while polyline retains per-segment gradients", () => {
  const points = [[4, 12], [12, 12], [36, 12]], color = u => (0xff000000 | Math.round(u * 240)) >>> 0;
  const frame = createFrame(40, 20), legacy = createFrame(40, 20);
  new Painter(frame).path(points, color);
  new Painter(legacy).polyline(points, color);
  const red = (f, x) => f.color[12 * f.w + x] & 255;
  assert.equal(red(frame, 8), 30);
  assert.equal(red(frame, 24), 150);
  assert.equal(red(legacy, 8), 120);
  assert.equal(red(legacy, 24), 120);
  for (let x = 5; x <= 36; x++) assert.ok(red(frame, x) >= red(frame, x - 1), "path gradient must not restart at its middle vertex");
});

test("rotated solid sprites and masks cover their inverse-mapped rectangle without pinholes", () => {
  const rows = Object.freeze(Array(6).fill("########")), mask = { w: 8, h: 6, data: new Uint8Array(48).fill(1) };
  for (const angle of [0.33, Math.PI / 4, 1.2]) for (const flip of [false, true]) {
    const placement = { tx: 2.31, ty: -1.72, flip, angle };
    for (const scale of [1, 1.5]) {
      const frame = createFrame(48, 48, -24, -24), painter = new Painter(frame);
      painter.place(placement.tx, placement.ty, flip, angle);
      painter.sprite(rows, { "#": WHITE }, -4, -3, { scale, a: ALPHA });
      assertRectangle(frame, placement, { x: -4, y: -3, w: 8 * scale, h: 6 * scale });
    }
    const frame = createFrame(48, 48, -24, -24), painter = new Painter(frame);
    painter.place(placement.tx, placement.ty, flip, angle);
    painter.mask(mask, -4, -3, WHITE, ALPHA);
    assertRectangle(frame, placement, { x: -4, y: -3, w: 8, h: 6 });
  }
});

test("adjacent fractional rectangles tile exactly once under placement and reflection", () => {
  for (const angle of [0, 0.37]) for (const flip of [false, true]) {
    const frame = createFrame(48, 48), painter = new Painter(frame);
    const placement = { tx: 25.35, ty: 24.6, flip, angle };
    const x = -10.15, y = -4.21, left = 7.35, right = 5.7, h = 6.6;
    painter.place(placement.tx, placement.ty, flip, angle);
    painter.rect(x, y, left, h, WHITE, ALPHA);
    painter.rect(x + left, y, right, h, WHITE, ALPHA);
    assertRectangle(frame, placement, { x, y, w: left + right, h });
  }
});

test("constant shaders stay inside their local box before and after rotation", () => {
  const unit = createFrame(6, 6);
  new Painter(unit).shade(0, 0, 1, 1, () => WHITE);
  assert.equal(occupied(unit).size, 1, "unit shader must not spill into neighboring cells");
  assert.equal(unit.color[0], WHITE);
  for (const angle of [0, 0.37, Math.PI / 4]) for (const flip of [false, true]) {
    const frame = createFrame(48, 48, -24, -24), painter = new Painter(frame);
    const placement = { tx: 2.31, ty: -1.72, flip, angle }, box = { x: -4.2, y: -3.1, w: 8.9, h: 6.75 };
    painter.place(placement.tx, placement.ty, flip, angle);
    painter.shade(box.x, box.y, box.x + box.w, box.y + box.h, () => WHITE);
    assertRectangle(frame, placement, box, 255);
  }
});

test("zero-radius discs are empty and tiny positive particles survive subpixel placement", () => {
  for (const method of ["circle", "disc"]) for (const radius of [-1, 0, 0.1, 0.6, 0.7]) {
    const frame = createFrame(16, 16), painter = new Painter(frame);
    painter.place(8.21, 8.37, true, 0.41);
    painter[method](-0.5, 0.3, radius, WHITE, ALPHA);
    const cells = occupied(frame);
    assert.equal(cells.size, radius > 0 ? 1 : 0);
    for (const cell of cells) assert.equal(frame.color[cell] >>> 24, BYTE_ALPHA);
  }
});

test("shared curve helpers render deterministically from frozen input with a reused painter", () => {
  const points = Object.freeze([[-14, -10], [-4, -17], [3, -10], [14, -14]].map(Object.freeze));
  const paths = Object.freeze([Object.freeze({ pts: points, w: 1 })]);
  const cols = Object.freeze({ core: WHITE, body: 0xffffcc88, halo: 0xffff8844, glow: 0xffffaa66 });
  const before = JSON.stringify(paths), frame = createFrame(64, 64), painter = new Painter(frame);
  const draw = () => {
    painter.place(32.3, 32.6, true, 0.4);
    drawArc(painter, paths, cols, 0.75, 0.2);
    lightningTrace(painter, points, WHITE, 0.35);
    oval(painter, 0, 0, 14, 4, g => Math.sin(g) > 0.5 ? WHITE : cols.body, 0.35, g => Math.sin(g) >= 0);
    sliver(painter, 0, 0, 0.2, 12, 1.1, cols.body, 0.5);
  };
  draw();
  const color = frame.color.slice(), light = frame.light.slice();
  assert.ok(color.some(value => value !== 0));
  clearFrame(frame);
  draw();
  assert.deepEqual(frame.color, color);
  assert.deepEqual(frame.light, light);
  assert.equal(JSON.stringify(paths), before);
});
