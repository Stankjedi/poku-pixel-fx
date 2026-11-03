/** Pixel buffer format matches the 2D engine: color/light are packed ABGR Uint32. */
export type Color3D = number | string;
export interface Frame3D {
  w: number;
  h: number;
  color: Uint32Array;
  light: Uint32Array;
  /** Optional unclamped linear RGB emission for cinematic output. */
  hdrLight?: Float32Array;
  /** Camera depth; larger means nearer. */
  depth: Float32Array;
}

export function color3D(color: Color3D): number {
  if (typeof color === "number") return color >>> 0;
  const hex = color.replace(/^#/, "");
  const value = hex.length === 3 ? hex.split("").map(c => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(value)) throw new Error(`Expected #rgb or #rrggbb: ${color}`);
  const rgb = parseInt(value, 16);
  return (0xff000000 | ((rgb & 255) << 16) | (rgb & 0x00ff00) | ((rgb >>> 16) & 255)) >>> 0;
}
export function createFrame3D(w: number, h: number): Frame3D {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) throw new RangeError("Invalid 3D frame dimensions");
  return { w, h, color: new Uint32Array(w * h), light: new Uint32Array(w * h), depth: new Float32Array(w * h) };
}
export function clearFrame3D(frame: Frame3D, background: Color3D = "#0a1424"): Frame3D {
  frame.color.fill(color3D(background));
  frame.light.fill(0);
  frame.hdrLight?.fill(0);
  frame.depth.fill(-Infinity);
  return frame;
}
/** Output can be a Uint8ClampedArray or an ImageData.data buffer. */
export function compositeFrame3D<T extends Uint8Array | Uint8ClampedArray>(frame: Frame3D, out: T, glow = 1): T {
  if (out.length < frame.w * frame.h * 4) throw new RangeError("RGBA output buffer is too small");
  for (let i = 0, o = 0; i < frame.color.length; i++, o += 4) {
    const c = frame.color[i], l = frame.light[i];
    out[o] = Math.min(255, (c & 255) + (l & 255) * glow);
    out[o + 1] = Math.min(255, ((c >>> 8) & 255) + ((l >>> 8) & 255) * glow);
    out[o + 2] = Math.min(255, ((c >>> 16) & 255) + ((l >>> 16) & 255) * glow);
    out[o + 3] = 255;
  }
  return out;
}
