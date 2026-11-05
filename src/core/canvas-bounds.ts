import type { PaintFrame } from "./painter.js";

/** Integer world-space bounds. Right and bottom edges are exclusive. */
export interface CanvasBounds2D { x: number; y: number; w: number; h: number }
export interface CanvasBoundsOptions2D {
  /** Minimum color alpha byte, 1..255. Default 1 retains even faint coverage. */
  alphaThreshold?: number;
  /** Include nonzero packed RGB light and positive linear HDR light. Default true. */
  includeLight?: boolean;
  /** Transparent margin in native pixels. Default 0. Applied equally on all four sides. */
  padding?: number;
}

function validBounds(bounds: CanvasBounds2D) {
  const { x, y, w, h } = bounds;
  if (w < 1 || h < 1 || ![x, y, w, h, x + w, y + h, w * h].every(Number.isSafeInteger))
    throw new RangeError("Canvas bounds need safe integer coordinates and positive integer dimensions");
}
function validFrame(frame: PaintFrame) {
  validBounds({ x: frame.ox, y: frame.oy, w: frame.w, h: frame.h });
  const count = frame.w * frame.h;
  if (frame.color.length !== count || frame.light.length !== count || (frame.hdrLight && frame.hdrLight.length !== count * 3))
    throw new RangeError("Frame dimensions must match color/light buffers and three HDR channels per pixel");
}
function readOptions(options: CanvasBoundsOptions2D) {
  const alphaThreshold = options.alphaThreshold ?? 1, padding = options.padding ?? 0;
  if (!Number.isInteger(alphaThreshold) || alphaThreshold < 1 || alphaThreshold > 255)
    throw new RangeError("alphaThreshold must be an integer from 1 to 255");
  if (!Number.isSafeInteger(padding) || padding < 0) throw new RangeError("Padding must be a non-negative integer");
  return { alphaThreshold, padding, includeLight: options.includeLight ?? true };
}

/** Measure visible 2D content without changing it. Empty frames return null, never an invented pivot.
 * Coordinates are world positions (including ox/oy), not indices into the pixel arrays.
 */
export function frameBounds2D(frame: PaintFrame, options: CanvasBoundsOptions2D = {}): CanvasBounds2D | null {
  validFrame(frame);
  const { alphaThreshold, padding, includeLight } = readOptions(options);
  let minX = frame.w, minY = frame.h, maxX = -1, maxY = -1;
  for (let i = 0; i < frame.color.length; i++) {
    let visible = (frame.color[i] >>> 24) >= alphaThreshold;
    if (!visible && includeLight) {
      const hdr = frame.hdrLight, j = i * 3;
      visible = (frame.light[i] & 0xffffff) !== 0 || !!(hdr && (hdr[j] > 0 || hdr[j + 1] > 0 || hdr[j + 2] > 0));
    }
    if (!visible) continue;
    const x = i % frame.w, y = Math.floor(i / frame.w);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (maxX < 0) return null;
  const result = { x: frame.ox + minX - padding, y: frame.oy + minY - padding,
    w: maxX - minX + 1 + padding * 2, h: maxY - minY + 1 + padding * 2 };
  validBounds(result);
  return result;
}

/** One common world-space crop for all animation frames, preventing per-frame pivot jitter.
 * Frames can have different origins or sizes. Empty frames do not enlarge the result.
 */
export function animationBounds2D(frames: Iterable<PaintFrame>, options: CanvasBoundsOptions2D = {}): CanvasBounds2D | null {
  readOptions(options);
  let result: CanvasBounds2D | null = null;
  for (const frame of frames) {
    const bounds = frameBounds2D(frame, options);
    if (!bounds) continue;
    if (result === null) { result = bounds; continue; }
    const x = Math.min(result.x, bounds.x), y = Math.min(result.y, bounds.y);
    result = { x, y, w: Math.max(result.x + result.w, bounds.x + bounds.w) - x,
      h: Math.max(result.y + result.h, bounds.y + bounds.h) - y };
    validBounds(result);
  }
  return result;
}

/** Copy a world-space rectangle without resampling or moving the art.
 * Outside-source space is transparent. All three pixel buffers are independent copies;
 * non-buffer frame settings are retained by reference. Supports 2D frames, not 3D depth buffers.
 * Rejects output larger than 16,777,216 pixels before allocating.
 */
export function cropFrame2D(frame: PaintFrame, bounds: CanvasBounds2D): PaintFrame {
  validFrame(frame); validBounds(bounds);
  const { x, y, w, h } = bounds, count = w * h;
  if (count > 16_777_216) throw new RangeError("Cropped canvas exceeds the 16,777,216-pixel allocation limit");
  const result: PaintFrame = { ...frame, w, h, ox: x, oy: y,
    color: new Uint32Array(count), light: new Uint32Array(count) };
  if (frame.hdrLight) result.hdrLight = new Float32Array(count * 3);
  const left = Math.max(frame.ox, x), top = Math.max(frame.oy, y);
  const right = Math.min(frame.ox + frame.w, x + w), bottom = Math.min(frame.oy + frame.h, y + h);
  if (left >= right || top >= bottom) return result;
  const width = right - left;
  for (let row = top; row < bottom; row++) {
    const source = (row - frame.oy) * frame.w + left - frame.ox, target = (row - y) * w + left - x;
    result.color.set(frame.color.subarray(source, source + width), target);
    result.light.set(frame.light.subarray(source, source + width), target);
    if (frame.hdrLight && result.hdrLight)
      result.hdrLight.set(frame.hdrLight.subarray(source * 3, (source + width) * 3), target * 3);
  }
  return result;
}
