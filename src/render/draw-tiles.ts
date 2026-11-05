/** The tile size is shared with the canonical draw-ir/draw-tiles WGSL. */
export const DRAW_TILE_SIZE = 16;
export const DRAW_TILE_CAPACITY = 256;
export type DrawCullingMode = 'auto' | 'none' | 'tiled';
export interface DrawTileStats {
  mode: 'direct' | 'tiled';
  tiles: number;
  overflowTiles: number;
  maxCandidates: number;
  /** One candidate scan over native pixels, excluding actual material/alpha work. */
  candidatePixelVisits: number;
  directPixelVisits: number;
  /** Conservative upper bound; full bins stop scanning as soon as they overflow. */
  binningBoundsUpperBound: number;
}

/** Summarize explicitly captured bin headers. Never called by ordinary rendering. */
export function summarizeDrawTiles(width: number, height: number, count: number, data?: Uint32Array, capacity = DRAW_TILE_CAPACITY): DrawTileStats {
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0) || !Number.isSafeInteger(width * height) || !Number.isInteger(count) || count < 0 || count > 16384 || !Number.isInteger(capacity) || capacity < 1)
    throw new RangeError('Invalid DrawIR tile statistics dimensions');
  const directPixelVisits = width * height * count;
  if (!data) return { mode: 'direct', tiles: 0, overflowTiles: 0, maxCandidates: count, candidatePixelVisits: directPixelVisits, directPixelVisits, binningBoundsUpperBound: 0 };
  const columns = Math.ceil(width / DRAW_TILE_SIZE), rows = Math.ceil(height / DRAW_TILE_SIZE), tiles = columns * rows;
  if (data.length < tiles * (capacity + 1)) throw new RangeError('Tile statistics buffer is too small');
  let candidatePixelVisits = 0, overflowTiles = 0, maxCandidates = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const header = data[(y * columns + x) * (capacity + 1)], overflow = header === 0xffffffff;
    if (!overflow && (header > capacity || header > count)) throw new RangeError('Invalid tile candidate count');
    const candidates = overflow ? count : header;
    if (overflow) overflowTiles++;
    maxCandidates = Math.max(maxCandidates, candidates);
    candidatePixelVisits += candidates * Math.min(DRAW_TILE_SIZE, width - x * DRAW_TILE_SIZE) * Math.min(DRAW_TILE_SIZE, height - y * DRAW_TILE_SIZE);
  }
  return { mode: 'tiled', tiles, overflowTiles, maxCandidates, candidatePixelVisits, directPixelVisits, binningBoundsUpperBound: tiles * count };
}
