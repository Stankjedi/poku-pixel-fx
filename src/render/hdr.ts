/** Enable optional unclamped, per-channel HDR emission on existing 2D or 3D frames. */
import { channelToLinear } from "./linear.js";
export interface HDRLightFrame {
  readonly w: number;
  readonly h: number;
  hdrLight?: Float32Array;
}

/**
 * Opt-in, in place: original color/light/depth buffers and legacy compositors
 * still work exactly as before. Enable before drawing; Painter emission also accumulates in hdrLight.
 * HDR-aware compositors use hdrLight as authoritative and light only as a legacy mirror.
 * clearFrame()/clearFrame3D() reset the HDR buffer between frames.
 */
export function enableHDRLight<T extends HDRLightFrame>(frame: T): T {
  const count = frame.w * frame.h * 3;
  if (!frame.hdrLight || frame.hdrLight.length !== count)
    frame.hdrLight = new Float32Array(count);
  return frame;
}

/**
 * Explicit bridge for a legacy packed-only writer. `add` imports only NEW light
 * from a separate buffer; `replace` converts a complete packed legacy result.
 * This does not modify the packed buffer, and must not re-add an HDR mirror.
 * Conversion preserves the available 8-bit energy; it cannot recover clipped HDR.
 */
export function importPackedLight<T extends HDRLightFrame>(frame: T, packed: Uint32Array, mode: "add" | "replace" = "add"): T {
  const n = frame.w * frame.h;
  if (packed.length !== n) throw new RangeError("Packed light dimensions must match the frame");
  enableHDRLight(frame);
  const hdr = frame.hdrLight!;
  for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) {
    const j = i * 3 + ch, value = channelToLinear(packed[i], ch * 8);
    hdr[j] = mode === "replace" ? value : hdr[j] + value;
  }
  return frame;
}
