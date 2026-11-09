/** Explicit GIF preview backing. Source assets and renderer buffers stay unchanged. */
export function parseGIFBackground(value: string) {
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value))
    throw new RangeError('--gif-background requires a six-digit RGB color such as #15131d');
  const color = value.toLowerCase();
  return Object.freeze({ color, rgb: Object.freeze([1, 3, 5].map(at => Number.parseInt(color.slice(at, at + 2), 16))) });
}

/** Straight encoded-RGB source-over, like displaying the transparent asset on a solid backing.
 * This is not a linear-light scene re-render, HDR reconstruction, or transparency-preserving export. */
export function flattenGIFPreviewRGBA(rgba: Uint8ClampedArray, rgb: readonly number[]): Uint8ClampedArray {
  if (!(rgba instanceof Uint8ClampedArray) || rgba.length % 4 !== 0
    || !Array.isArray(rgb) || rgb.length !== 3 || rgb.some(v => !Number.isInteger(v) || v < 0 || v > 255))
    throw new RangeError('GIF preview backing requires RGBA bytes and three integer RGB components');
  const output = new Uint8ClampedArray(rgba.length);
  for (let k = 0; k < rgba.length; k += 4) {
    const alpha = rgba[k + 3];
    for (let c = 0; c < 3; c++) output[k + c] = Math.round((rgba[k + c] * alpha + rgb[c] * (255 - alpha)) / 255);
    output[k + 3] = 255;
  }
  return output;
}
