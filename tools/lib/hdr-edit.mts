/** 8-bit editing proxy with an exact untouched HDR sidecar. */
export function emissionProxy(emission: Float32Array, scale?: number) {
  let peak = 0;
  for (const value of emission) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError("Emission must be finite and non-negative");
    peak = Math.max(peak, value);
  }
  const exposure = scale ?? Math.max(1, peak);
  if (!Number.isFinite(exposure) || exposure <= 0 || peak > exposure) throw new RangeError("Proxy scale must cover the linear HDR range");
  if (emission.length % 3) throw new RangeError("Emission needs RGB triples");
  const rgba = new Uint8Array(emission.length / 3 * 4);
  for (let i = 0; i < emission.length / 3; i++) {
    let visible = false;
    for (let c = 0; c < 3; c++) {
      const linear = emission[i * 3 + c] / exposure;
      const srgb = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
      rgba[i * 4 + c] = Math.round(srgb * 255); visible ||= emission[i * 3 + c] > 0;
    }
    rgba[i * 4 + 3] = visible ? 255 : 0;
  }
  return { rgba, scale: exposure };
}

/** Alpha weights authored proxy energy once. Color-layer coverage is deliberately independent. */
export function restoreEmissionProxy(edited: Uint8Array | Uint8ClampedArray,
  originalProxy: Uint8Array | Uint8ClampedArray | undefined, original: Float32Array | undefined, scale: number, gain = 1) {
  if (edited.length % 4 || !Number.isFinite(scale) || scale <= 0 || !Number.isFinite(gain) || gain < 0
    || (originalProxy && originalProxy.length !== edited.length) || (original && original.length !== edited.length / 4 * 3))
    throw new RangeError("Invalid emission editing buffers or scale");
  const out = new Float32Array(edited.length / 4 * 3);
  for (let i = 0; i < edited.length / 4; i++) {
    const p = i * 4, untouched = original && originalProxy && [0, 1, 2, 3].every(c => edited[p + c] === originalProxy[p + c]);
    for (let c = 0; c < 3; c++) {
      const s = edited[p + c] / 255;
      out[i * 3 + c] = (untouched ? original![i * 3 + c]
        : (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4) * scale * edited[p + 3] / 255) * gain;
    }
  }
  return out;
}

export function decodeLinearRGB(bytes: Uint8Array): Float32Array {
  if (bytes.byteLength % 12) throw new RangeError("Linear RGB sidecar must contain float32 RGB triples");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), values = new Float32Array(bytes.byteLength / 4);
  for (let i = 0; i < values.length; i++) {
    const value = view.getFloat32(i * 4, true);
    if (!Number.isFinite(value) || value < 0) throw new RangeError("Invalid linear RGB sidecar value");
    values[i] = value;
  }
  return values;
}
