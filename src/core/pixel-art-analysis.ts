import type { EditableSprite2D } from './sprite-edit.js';

export type PixelArtExpectation2D = 'organic' | 'cel-shaded' | 'geometric';

export interface PixelArtAnalysisOptions2D {
  /** Omit to measure only. Organic reviews flat regions, straight contours and color noise;
   * cel-shaded permits flat fills; geometric also permits straight contours. */
  expectedStyle?: PixelArtExpectation2D;
  /** Native cells containing intentional accents, straight edges or flat fills. These cells
   * are excluded from analysis, but remain occupied when finding the physical contour. */
  protected?: ArrayLike<number>;
  /** Maximum difference in each sRGB byte channel from a region's first cell, 0..255.
   * Comparing with the seed prevents small steps from merging an entire value ramp. */
  colorTolerance?: number;
  /** Minimum connected near-color area before suggesting a flat-region review. Default 48. */
  minFlatArea?: number;
  /** Minimum fraction of analyzed visible cells in a flat-region review. Default 0.12. */
  flatRegionRatio?: number;
  /** Minimum straight contour length in native cells. Default 12. */
  minStraightRun?: number;
  /** Maximum isolated interior color cells / analyzed visible cells. Default 0.05.
   * A noise suggestion additionally needs at least four cells, not a single highlight. */
  maxIsolatedColorRatio?: number;
  /** Bound the returned descriptions, not the measurements or heatmap. Default 128. */
  maxIssues?: number;
}

export interface PixelArtAnalysisMetrics2D {
  /** Occupied mask cells with nonzero alpha, including protected cells. */
  occupied: number;
  /** Visible unprotected cells; the denominator for all region/noise ratios. */
  analyzed: number;
  /** Distinct RGB values in analyzed cells. Different coverage values are not new colors. */
  paletteSize: number;
  /** Seed-relative near-color components containing at least minFlatArea cells. */
  nearFlatRegionCount: number;
  largestFlatRegion: number;
  dominantFlatRegionRatio: number;
  /** Unprotected occupied cells adjacent to empty space in the four cardinal directions. */
  silhouetteCells: number;
  /** Longest horizontal, vertical or 45-degree contour run, measured in occupied cells. */
  longestStraightRun: number;
  /** Unprotected cells surrounded by eight other visible unprotected cells. */
  interiorCells: number;
  /** Interior cells with no similarly colored neighbor in their eight-cell neighborhood. */
  isolatedColorCells: number;
  isolatedColorRatio: number;
}

export interface PixelArtReviewIssue2D {
  kind: 'flat-region' | 'straight-contour' | 'color-noise';
  confidence: 'heuristic';
  x: number;
  y: number;
  area: number;
  bounds: { x: number; y: number; w: number; h: number };
  message: string;
  evidence: Record<string, number | string>;
}

export interface PixelArtAnalysis2D {
  metrics: PixelArtAnalysisMetrics2D;
  issues: PixelArtReviewIssue2D[];
  /** Number of suggestions before maxIssues truncation; every suggestion remains in heatmap. */
  totalIssues: number;
  /** Per native cell flags: 1 = near-flat region, 2 = straight contour, 4 = color noise.
   * Zero everywhere in measurement-only mode. Protected cells are always zero. */
  heatmap: Uint8Array;
}

const TOP = 1, RIGHT = 2, BOTTOM = 4, LEFT = 8;
const NOISE = 16;

function validateSprite(source: EditableSprite2D): number {
  const count = source.w * source.h;
  if (!Number.isSafeInteger(source.w) || !Number.isSafeInteger(source.h)
    || source.w < 1 || source.h < 1 || count > 16_777_216
    || !(source.pixels instanceof Uint32Array) || source.pixels.length !== count
    || source.mask.w !== source.w || source.mask.h !== source.h
    || !(source.mask.data instanceof Uint8Array) || source.mask.data.length !== count)
    throw new RangeError('Pixel-art analysis requires matching native sprite buffers');
  return count;
}

function withinColor(a: number, b: number, tolerance: number): boolean {
  return Math.abs((a & 255) - (b & 255)) <= tolerance
    && Math.abs((a >>> 8 & 255) - (b >>> 8 & 255)) <= tolerance
    && Math.abs((a >>> 16 & 255) - (b >>> 16 & 255)) <= tolerance;
}

/** Explainable native-raster measurements and opt-in review suggestions, never a beauty score.
 * The source, silhouette, palette, alpha, semantic masks and emission are not modified.
 * All positions are local to the supplied raster, independent of any actor/world origin.
 * Complexity is O(w*h): a four-connected flood fill, four directional contour scans and
 * bounded eight-neighbor comparisons. No image matching or learned aesthetic classifier. */
export function diagnosePixelArt2D(source: EditableSprite2D,
  options: PixelArtAnalysisOptions2D = {}): PixelArtAnalysis2D {
  const n = validateSprite(source), { w, h, pixels } = source;
  const style = options.expectedStyle, protection = options.protected;
  const tolerance = options.colorTolerance ?? 10;
  const minArea = options.minFlatArea ?? 48;
  const minRatio = options.flatRegionRatio ?? .12;
  const minRun = options.minStraightRun ?? 12;
  const noiseLimit = options.maxIsolatedColorRatio ?? .05;
  const maxIssues = options.maxIssues ?? 128;
  if (style !== undefined && !['organic', 'cel-shaded', 'geometric'].includes(style)
    || protection !== undefined && protection.length !== n)
    throw new RangeError('Pixel-art expectation and protected mask must match the native raster');
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 255
    || !Number.isSafeInteger(minArea) || minArea < 1
    || !Number.isFinite(minRatio) || minRatio < 0 || minRatio > 1
    || !Number.isSafeInteger(minRun) || minRun < 2
    || !Number.isFinite(noiseLimit) || noiseLimit < 0 || noiseLimit > 1
    || !Number.isSafeInteger(maxIssues) || maxIssues < 1 || maxIssues > 4096)
    throw new RangeError('Pixel-art thresholds must be finite and within their documented ranges');

  // 1 = visible protected, 2 = visible analyzable. Keeping physical occupancy separate
  // avoids turning a protected eye, edge or tile boundary into a new silhouette hole.
  const occupancy = new Uint8Array(n), seen = new Uint8Array(n);
  const boundary = new Uint8Array(n), queue = new Uint32Array(n);
  const heatmap = new Uint8Array(n), issues: PixelArtReviewIssue2D[] = [];
  const palette = new Set<number>();
  let occupied = 0, analyzed = 0, totalIssues = 0;
  for (let i = 0; i < n; i++) {
    if (!source.mask.data[i] || !(pixels[i] >>> 24)) continue;
    occupied++;
    if (protection?.[i]) occupancy[i] = 1;
    else { occupancy[i] = 2; analyzed++; palette.add(pixels[i] & 0xffffff); }
  }
  const add = (issue: Omit<PixelArtReviewIssue2D, 'confidence'>) => {
    totalIssues++;
    if (issues.length < maxIssues) issues.push({ confidence: 'heuristic', ...issue });
  };

  let largestFlatRegion = 0, nearFlatRegionCount = 0;
  for (let seed = 0; seed < n; seed++) {
    if (occupancy[seed] !== 2 || seen[seed]) continue;
    const color = pixels[seed];
    queue[0] = seed; seen[seed] = 1;
    let length = 1;
    let minX = seed % w, maxX = minX, minY = Math.floor(seed / w), maxY = minY;
    let minR = color & 255, maxR = minR, minG = color >>> 8 & 255, maxG = minG;
    let minB = color >>> 16 & 255, maxB = minB;
    const visit = (index: number) => {
      if (occupancy[index] === 2 && !seen[index] && withinColor(color, pixels[index], tolerance)) {
        seen[index] = 1; queue[length++] = index;
      }
    };
    for (let cursor = 0; cursor < length; cursor++) {
      const i = queue[cursor], x = i % w, y = Math.floor(i / w), c = pixels[i];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minR = Math.min(minR, c & 255); maxR = Math.max(maxR, c & 255);
      minG = Math.min(minG, c >>> 8 & 255); maxG = Math.max(maxG, c >>> 8 & 255);
      minB = Math.min(minB, c >>> 16 & 255); maxB = Math.max(maxB, c >>> 16 & 255);
      if (x > 0) visit(i - 1);
      if (x + 1 < w) visit(i + 1);
      if (y > 0) visit(i - w);
      if (y + 1 < h) visit(i + w);
    }
    largestFlatRegion = Math.max(largestFlatRegion, length);
    if (length >= minArea) nearFlatRegionCount++;
    if (style === 'organic' && length >= minArea && length / analyzed >= minRatio) {
      add({ kind: 'flat-region', x: seed % w, y: Math.floor(seed / w), area: length,
        bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
        message: 'Large connected near-color region; inspect whether the intended material needs more authored value groups.',
        evidence: { cells: length, ratio: length / analyzed, colorTolerance: tolerance,
          maxChannelSpread: Math.max(maxR - minR, maxG - minG, maxB - minB) } });
      for (let cursor = 0; cursor < length; cursor++) heatmap[queue[cursor]] |= 1;
    }
  }

  let silhouetteCells = 0, interiorCells = 0, isolatedColorCells = 0;
  let noiseMinX = w, noiseMinY = h, noiseMaxX = -1, noiseMaxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (occupancy[i] !== 2) continue;
    let edges = 0;
    if (y === 0 || !occupancy[i - w]) edges |= TOP;
    if (x === w - 1 || !occupancy[i + 1]) edges |= RIGHT;
    if (y === h - 1 || !occupancy[i + w]) edges |= BOTTOM;
    if (x === 0 || !occupancy[i - 1]) edges |= LEFT;
    boundary[i] = edges;
    if (edges) silhouetteCells++;
    if (!x || !y || x === w - 1 || y === h - 1) continue;
    let interior = true, similar = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const j = i + dy * w + dx;
      if (occupancy[j] !== 2) interior = false;
      if (withinColor(pixels[i], pixels[j], tolerance)) similar = true;
    }
    if (!interior) continue;
    interiorCells++;
    if (similar) continue;
    boundary[i] |= NOISE; isolatedColorCells++;
    noiseMinX = Math.min(noiseMinX, x); noiseMaxX = Math.max(noiseMaxX, x);
    noiseMinY = Math.min(noiseMinY, y); noiseMaxY = Math.max(noiseMaxY, y);
  }

  let longestStraightRun = 0;
  const inspectContours = style === 'organic' || style === 'cel-shaded';
  const scan = (x0: number, y0: number, dx: number, dy: number,
    faceMask: number, direction: string) => {
    let startX = x0, startY = y0, length = 0, commonFaces = 0;
    const finish = () => {
      if (!length) return;
      longestStraightRun = Math.max(longestStraightRun, length);
      if (!inspectContours || length < minRun) return;
      const endX = startX + (length - 1) * dx, endY = startY + (length - 1) * dy;
      const sides = [commonFaces & TOP ? 'top' : '', commonFaces & RIGHT ? 'right' : '',
        commonFaces & BOTTOM ? 'bottom' : '', commonFaces & LEFT ? 'left' : ''].filter(Boolean).join('+');
      add({ kind: 'straight-contour', x: startX, y: startY, area: length,
        bounds: { x: Math.min(startX, endX), y: Math.min(startY, endY),
          w: Math.abs(endX - startX) + 1, h: Math.abs(endY - startY) + 1 },
        message: 'Long straight native-cell contour; inspect whether this edge should be curved, worn or deliberately geometric.',
        evidence: { cells: length, direction, exposedSide: sides } });
      for (let k = 0; k < length; k++) heatmap[(startY + k * dy) * w + startX + k * dx] |= 2;
    };
    for (let x = x0, y = y0; x >= 0 && y >= 0 && x < w && y < h; x += dx, y += dy) {
      const faces = boundary[y * w + x] & faceMask;
      if (length && (!faces || !(faces & commonFaces))) { finish(); length = 0; }
      if (!faces) continue;
      if (!length) { startX = x; startY = y; commonFaces = faces; }
      else commonFaces &= faces;
      length++;
    }
    finish();
  };
  for (let y = 0; y < h; y++) scan(0, y, 1, 0, TOP | BOTTOM, 'horizontal');
  for (let x = 0; x < w; x++) scan(x, 0, 0, 1, LEFT | RIGHT, 'vertical');
  for (let x = 0; x < w; x++) scan(x, 0, 1, 1, 15, 'diagonal-down');
  for (let y = 1; y < h; y++) scan(0, y, 1, 1, 15, 'diagonal-down');
  for (let x = 0; x < w; x++) scan(x, h - 1, 1, -1, 15, 'diagonal-up');
  for (let y = 0; y < h - 1; y++) scan(0, y, 1, -1, 15, 'diagonal-up');

  const isolatedColorRatio = analyzed ? isolatedColorCells / analyzed : 0;
  if (style !== undefined && isolatedColorCells >= 4 && isolatedColorRatio > noiseLimit) {
    add({ kind: 'color-noise', x: noiseMinX, y: noiseMinY, area: isolatedColorCells,
      bounds: { x: noiseMinX, y: noiseMinY, w: noiseMaxX - noiseMinX + 1, h: noiseMaxY - noiseMinY + 1 },
      message: 'Many isolated interior color cells; inspect cluster readability and protect intentional glints or stippling.',
      evidence: { cells: isolatedColorCells, ratio: isolatedColorRatio, interiorCells, colorTolerance: tolerance } });
    for (let i = 0; i < n; i++) if (boundary[i] & NOISE) heatmap[i] |= 4;
  }

  return {
    metrics: { occupied, analyzed, paletteSize: palette.size, nearFlatRegionCount,
      largestFlatRegion, dominantFlatRegionRatio: analyzed ? largestFlatRegion / analyzed : 0,
      silhouetteCells, longestStraightRun, interiorCells, isolatedColorCells, isolatedColorRatio },
    issues, totalIssues, heatmap,
  };
}
