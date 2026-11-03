/** Enable optional unclamped, per-channel HDR emission on existing 2D or 3D frames. */
export interface HDRLightFrame {
  readonly w: number;
  readonly h: number;
  hdrLight?: Float32Array;
}

/**
 * Opt-in, in place: original color/light/depth buffers and legacy compositors
 * still work exactly as before. Painter emission also accumulates in hdrLight.
 * clearFrame()/clearFrame3D() reset the HDR buffer between frames.
 */
export function enableHDRLight<T extends HDRLightFrame>(frame: T): T {
  const count = frame.w * frame.h * 3;
  if (!frame.hdrLight || frame.hdrLight.length !== count)
    frame.hdrLight = new Float32Array(count);
  return frame;
}
