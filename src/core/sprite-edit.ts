import type { Mask } from "./painter.js";

/** Common native-pixel data carried by HumanSprite, HumanPortraitSprite and stock actors. */
export interface EditableSprite2D {
  w: number;
  h: number;
  pixels: Uint32Array;
  mask: { w: number; h: number; data: Uint8Array };
}

export interface SpriteClusterPatch2D {
  /** Integer coordinates within the sprite's own pixel buffer, independent of its world origin. */
  x: number;
  y: number;
  /** One Unicode code point per native cell. Ragged rows are allowed. */
  rows: readonly string[];
  /** Packed engine RGBA (for example hex("#eac5a0")); null explicitly erases.
   * Symbols absent from this palette leave existing pixels untouched, including "." by default. */
  palette: Readonly<Record<string, number | null>>;
}

export interface SpriteClusterEditOptions2D {
  /** Optional selection in the full sprite's buffer coordinates; nonzero entries allow edits. */
  selection?: Mask;
}

/** Apply a hand-authored cluster to a copy. Touched colors and silhouette occupancy change together,
 * so erasure cannot leave an occupied mask cell behind. Source pixels/mask and the patch are untouched.
 * Other metadata, including anatomical/semantic masks and rig data, is retained by reference.
 * This edits one raster sprite, not a source illustration, animation rig or light buffer. */
export function editSpriteCluster2D<T extends EditableSprite2D>(source: T, patch: SpriteClusterPatch2D,
  options: SpriteClusterEditOptions2D = {}): T {
  const count = source.w * source.h;
  if (![source.w, source.h, count].every(Number.isSafeInteger) || source.w < 1 || source.h < 1 || count > 16_777_216
    || !(source.pixels instanceof Uint32Array) || source.pixels.length !== count
    || source.mask.w !== source.w || source.mask.h !== source.h
    || !(source.mask.data instanceof Uint8Array) || source.mask.data.length !== count)
    throw new RangeError("Sprite dimensions must match its pixel and silhouette buffers (at most 16,777,216 cells)");
  const selection = options.selection;
  if (selection && (selection.w !== source.w || selection.h !== source.h || selection.data.length !== count))
    throw new RangeError("Selection must match the full sprite dimensions");
  if (!Number.isSafeInteger(patch.x) || !Number.isSafeInteger(patch.y)
    || !Array.isArray(patch.rows) || !patch.rows.every(row => typeof row === "string"))
    throw new RangeError("Cluster needs safe integer coordinates and string rows");
  const rows = patch.rows.map(row => [...row]);
  if (!Number.isSafeInteger(patch.y + rows.length) || rows.some(row => !Number.isSafeInteger(patch.x + row.length)))
    throw new RangeError("Cluster extents must be safe integers");
  const palette = new Map<string, number>();
  for (const [symbol, value] of Object.entries(patch.palette)) {
    if ([...symbol].length !== 1 || (value !== null && (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff)))
      throw new RangeError("Cluster palette keys must be single code points and colors must be packed 32-bit RGBA or null");
    const color = value === null ? 0 : value >>> 0;
    palette.set(symbol, color >>> 24 ? color : 0);
  }
  const pixels = source.pixels.slice(), mask = { ...source.mask, data: source.mask.data.slice() };
  for (let row = 0; row < rows.length; row++) {
    const y = patch.y + row;
    if (y < 0 || y >= source.h) continue;
    for (let col = 0; col < rows[row].length; col++) {
      const x = patch.x + col, color = palette.get(rows[row][col]);
      if (color === undefined || x < 0 || x >= source.w) continue;
      const i = y * source.w + x;
      if (selection && !selection.data[i]) continue;
      pixels[i] = color;
      mask.data[i] = color >>> 24 ? 1 : 0;
    }
  }
  return { ...source, pixels, mask };
}
