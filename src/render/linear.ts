/** Shared sRGB decode table for HDR light accumulation and filmic compositing. */
export const SRGB_TO_LINEAR = Float32Array.from({ length: 256 }, (_, i) => {
  const s = i / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
});
export const channelToLinear = (color: number, offset: number) =>
  SRGB_TO_LINEAR[(color >>> offset) & 255];
