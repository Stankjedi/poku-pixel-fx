import { hex } from "./color.js";
import type { Mask, PaintValue } from "./painter.js";
import type { EditableSprite2D } from "./sprite-edit.js";
// A stock character to try effects on: status effects wrap its silhouette, hits land on it, auras sit
// behind it. Previews and the gallery draw it; effects only read its mask through o.actor.

const HERO = [
  "....kkkkk...",
  "..kkhhhhhk..",
  ".khhhhhhhhk.",
  ".khhhhhhhhhk",
  ".khhssssshhk",
  ".khsessesshk",
  ".khsessesshk",
  "..ksssssssk.",
  "...kkSSSkk..",
  "..kttttttk..",
  ".kttTttTttk.",
  ".ksttTTttsk.",
  ".kstttttttk.",
  "..kbbbbbbk..",
  "..kppkkppk..",
  "..kppk.kppk.",
  "..kppk.kppk.",
  "..koook.kook",
  "..kkkkk.kkkk",
];
const HERO_PAL = {
  k: "#17121f", h: "#7a4128", s: "#f3c49d", S: "#c98b6c", e: "#17121f",
  t: "#5f6f94", T: "#46536f", b: "#8a5a32", p: "#38334a", o: "#6a4030",
  // the 2x character's extra detail
  H: "#a35d34", w: "#ffffff", m: "#a3564a", g: "#e8c060", L: "#7f90b6", O: "#8f5a3f", P: "#4b4560",
  // the scarf
  c: "#f53cd1", C: "#ff8fe6", D: "#a31f8a",
};
// the dummy: a neutral shell that lets any effect's colors do the talking, near and far limbs, dark bands at the joints, a small mark
const DUMMY_PAL = {
  k: "#0e0c14", A: "#e4e6ec", B: "#b6b9c3", C: "#868995", D: "#5c5e6a", E: "#6e707c", F: "#4b4d58", G: "#34353f", J: "#2a2b33", m: "#f53cd1",
};
// The same character at twice the size (24 x 38), standing easy: the rest pose of src/core/rig.js, baked.
const HERO2 = [
  "...........kkk..........",
  "..........kAABk.........",
  ".........kAAABJk........",
  ".........kABBJJk........",
  ".........kBBBJCDk.......",
  ".........kBCJDDDk.......",
  ".........kkJJJDk........",
  ".......kkkkABBJCkk......",
  "......kAABCJBCCCkDk.....",
  "......kABBCJCCCmDkDk....",
  "......kBBCDDJCDDDkDk....",
  "......kABCDJDDDDDkk.....",
  ".....kAABDkDDDDJkk......",
  ".....kABCDkDDJJGkk......",
  ".....kABCkJJJGGGkk......",
  "....kJJCDkFFFGGGk.......",
  "....kAJJDkJJJGGGk.......",
  "....kJCJJkABBJGGk.......",
  ".....kJCCkBBCDJJJk......",
  ".....kCCCJBBCDJJDk......",
  ".....kCCCDJCCDkJDDk.....",
  "......kCDDJBCDkDDDk.....",
  ".......kDJJJCDkDDDkk....",
  ".......kJBCJCDkDDDkk....",
  ".......kBDJBCDkCDDkk....",
  "........kJJBCDkCDDk.....",
  "........kBBBCDkCCDDk....",
  "........kBBBCDkCCDDk....",
  ".........kBBCDkJDDDk....",
  "........kBJJJJkCJJJk....",
  "........kBBCCDkCCDDk....",
  "........kBBCDDkCDDk.....",
  "........kBBCDkCCDDk.....",
  "........kBCCDkCCDDk.....",
  "........kBCDDkCDDDk.....",
  ".......kJBCJkkkDJkkkk...",
  ".......kAJJAAAAkCCCCCk..",
  "........kkkkkkkkkkkkk...",
];


function maskOf(rows: readonly string[], k = 1) {
  const h = rows.length * k, w = rows[0].length * k, data = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === ".") return;
    for (let j = 0; j < k * k; j++) data[(y * k + ((j / k) | 0)) * w + x * k + (j % k)] = 1;
  }));
  return { w, h, data };
}

const MASKS = { 1: maskOf(HERO, 1), 2: maskOf(HERO2, 1) };
const SPRITES = { 1: HERO, 2: HERO2 };
// the character's own colors, row by row (0 where empty), for effects that recolor it: frozen, poisoned, stone
function pixelsOf(rows: readonly string[], pal: Record<string, string>) {
  const w = rows[0].length, data = new Uint32Array(w * rows.length);
  rows.forEach((r, y) => [...r].forEach((ch, x) => (data[y * w + x] = ch === "." ? 0 : hex(pal[ch]))));
  return data;
}
const PIXELS = { 1: pixelsOf(HERO, HERO_PAL), 2: pixelsOf(HERO2, DUMMY_PAL) };

/**
 * The stock actor at scale k (1: 12 x 19 px, 2: 24 x 38 px), in local space with its feet at (0, 0):
 * { mask, x, y (top-left of the mask), w, h, k, head: [x, y] (top of the head), chest: [x, y] }.
 */
export function stockActor(k = 1) {
  k = k === 2 ? 2 : 1;
  const m = MASKS[k as 1 | 2], x = -Math.floor(m.w / 2), y = -m.h;
  return { mask: m, pixels: PIXELS[k as 1 | 2], x, y, w: m.w, h: m.h, k, head: [0, y], chest: [0, k === 2 ? -26 : y + 11], ...(k === 2 ? { eyes: [[13, 3], [15, 3]] } : {}) };
}

/** A native raster actor whose local top-left is explicit. Extra anchors/rig metadata are optional
 * for drawing, but effects using them still need the appropriate original actor metadata. */
export interface PixelActor2D extends EditableSprite2D {
  x: number;
  y: number;
  readonly renderSource: "pixels";
}

function validateActorPixels(actor: EditableSprite2D & { x: number; y: number }) {
  const count = actor.w * actor.h;
  if (![actor.w, actor.h, count].every(Number.isSafeInteger) || actor.w < 1 || actor.h < 1 || count > 16_777_216
    || !Number.isFinite(actor.x) || !Number.isFinite(actor.y)
    || !(actor.pixels instanceof Uint32Array) || actor.pixels.length !== count
    || !actor.mask || actor.mask.w !== actor.w || actor.mask.h !== actor.h
    || !(actor.mask.data instanceof Uint8Array) || actor.mask.data.length !== count)
    throw new RangeError("Pixel actor needs finite x/y and matching native pixel/mask buffers");
}

/** Explicitly draw this actor's pixel buffer instead of stock row art. Returns a shallow wrapper:
 * buffers and metadata are retained, not copied or normalized. Pair with editSpriteCluster2D for
 * non-destructive edits. The marker survives further cluster edits and actor-option forwarding. */
export function withActorPixels<T extends EditableSprite2D & { x: number; y: number }>(actor: T): T & PixelActor2D {
  validateActorPixels(actor);
  return { ...actor, renderSource: "pixels" };
}

interface ActorPainter {
  sprite: (rows: string[], palette: Record<string, string>, x: number, y: number, options: { a: number }) => unknown;
  mask?: (mask: Mask, x: number, y: number, color: PaintValue, alpha?: PaintValue) => unknown;
}

/** Draw an actor at its local x/y. Stock calls retain their original row-art path. A pixel actor
 * explicitly opts into its current pixels/mask, using the painter's transform, fade and alpha mode. */
export function drawActor(p: ActorPainter, actor: ReturnType<typeof stockActor> | PixelActor2D = stockActor(), a = 1) {
  if ("renderSource" in actor && actor.renderSource === "pixels") {
    validateActorPixels(actor);
    if (!Number.isFinite(a)) throw new RangeError("Pixel actor alpha must be finite");
    if (a <= 0) return;
    if (typeof p.mask !== "function") throw new TypeError("Drawing pixel actors requires a painter with mask()");
    p.mask(actor.mask, actor.x, actor.y, (x, y) => actor.pixels[y * actor.w + x], a);
    return;
  }
  // Do not infer opt-in from a different buffer reference: legacy actors keep identical output.
  const k = "k" in actor && actor.k === 2 ? 2 : 1;
  if (a > 0) p.sprite(SPRITES[k], k === 2 ? DUMMY_PAL : HERO_PAL, actor.x, actor.y, { a });
}
/** How visible an effect wants the stand-in character at time t (effects may export actorAlpha). */
export const actorAlphaOf = (mod: { actorAlpha?: (t: number, options: any) => number }, t: number, o: any) => (typeof mod.actorAlpha === "function" ? mod.actorAlpha(t, o) : 1);

export { HERO, HERO2, HERO_PAL, DUMMY_PAL };
