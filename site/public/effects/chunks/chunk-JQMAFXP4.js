// src/render/linear.ts
var SRGB_TO_LINEAR = Float32Array.from({ length: 256 }, (_, i) => {
  const s = i / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
});
var channelToLinear = (color, offset) => SRGB_TO_LINEAR[color >>> offset & 255];

// src/render/cinematic.ts
var clamp01 = (x) => Math.max(0, Math.min(1, x));
var channel = channelToLinear;
var toSRGB = (v) => {
  const x = clamp01(v);
  return Math.round(255 * (x <= 31308e-7 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055));
};
var tone = (v, mode) => {
  const x = Math.max(0, v);
  if (mode === "none") return x;
  if (mode === "reinhard") return x / (1 + x);
  return clamp01(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14));
};
var CinematicCompositor = class {
  w = 0;
  h = 0;
  base = new Float32Array(0);
  emission = new Float32Array(0);
  extracted = new Float32Array(0);
  alpha = new Float32Array(0);
  levels = [];
  prepare(w, h, count) {
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.base = new Float32Array(w * h * 3);
      this.emission = new Float32Array(w * h * 3);
      this.extracted = new Float32Array(w * h * 3);
      this.alpha = new Float32Array(w * h);
      this.levels = [];
    }
    let lw = w, lh = h;
    for (let i = 0; i < count; i++) {
      lw = Math.max(1, Math.ceil(lw / 2));
      lh = Math.max(1, Math.ceil(lh / 2));
      if (!this.levels[i] || this.levels[i].w !== lw || this.levels[i].h !== lh) {
        this.levels[i] = {
          w: lw,
          h: lh,
          data: new Float32Array(lw * lh * 3),
          scratch: new Float32Array(lw * lh * 3)
        };
      }
    }
    this.levels.length = count;
  }
  buildBloom(threshold, knee) {
    const e = this.emission, extract = this.extracted;
    const k = Math.max(1e-6, knee);
    for (let i = 0; i < e.length; i += 3) {
      const brightness = Math.max(e[i], e[i + 1], e[i + 2]);
      const above = Math.max(0, brightness - threshold);
      const q = Math.max(0, Math.min(2 * k, brightness - threshold + k));
      const soft = q * q / (4 * k);
      const scale = brightness > 0 ? Math.min(1, Math.max(above, soft) / brightness) : 0;
      extract[i] = e[i] * scale;
      extract[i + 1] = e[i + 1] * scale;
      extract[i + 2] = e[i + 2] * scale;
    }
    let source = extract;
    let sw = this.w, sh = this.h;
    for (const level of this.levels) {
      const { w, h, data, scratch } = level;
      for (let y = 0; y < h; y++) {
        const y0 = Math.min(sh - 1, y * 2), y1 = Math.min(sh - 1, y0 + 1);
        for (let x = 0; x < w; x++) {
          const x0 = Math.min(sw - 1, x * 2), x1 = Math.min(sw - 1, x0 + 1);
          const a = (y0 * sw + x0) * 3, b = (y0 * sw + x1) * 3;
          const c = (y1 * sw + x0) * 3, d = (y1 * sw + x1) * 3;
          const o = (y * w + x) * 3;
          for (let ch = 0; ch < 3; ch++)
            data[o + ch] = (source[a + ch] + source[b + ch] + source[c + ch] + source[d + ch]) * 0.25;
        }
      }
      const weights = [1, 4, 6, 4, 1];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 3;
        for (let ch = 0; ch < 3; ch++) {
          let sum = 0;
          for (let tap = -2; tap <= 2; tap++) {
            const xx = Math.max(0, Math.min(w - 1, x + tap));
            sum += data[(y * w + xx) * 3 + ch] * weights[tap + 2];
          }
          scratch[o + ch] = sum / 16;
        }
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 3;
        for (let ch = 0; ch < 3; ch++) {
          let sum = 0;
          for (let tap = -2; tap <= 2; tap++) {
            const yy = Math.max(0, Math.min(h - 1, y + tap));
            sum += scratch[(yy * w + x) * 3 + ch] * weights[tap + 2];
          }
          data[o + ch] = sum / 16;
        }
      }
      source = data;
      sw = w;
      sh = h;
    }
  }
  sample(level, x, y, ch) {
    const xx = Math.max(0, Math.min(level.w - 1, x));
    const yy = Math.max(0, Math.min(level.h - 1, y));
    const x0 = Math.floor(xx), y0 = Math.floor(yy);
    const x1 = Math.min(level.w - 1, x0 + 1), y1 = Math.min(level.h - 1, y0 + 1);
    const tx = xx - x0, ty = yy - y0, d = level.data, w = level.w;
    const a = d[(y0 * w + x0) * 3 + ch] * (1 - tx) + d[(y0 * w + x1) * 3 + ch] * tx;
    const b = d[(y1 * w + x0) * 3 + ch] * (1 - tx) + d[(y1 * w + x1) * 3 + ch] * tx;
    return a * (1 - ty) + b * ty;
  }
  /**
   * Resolve packed color + emissive buffers to RGBA, without modifying the input.
   * Pass a reusable output byte array; it is safe to reuse the same compositor each frame.
   * Bloom operates on explicit emission, not bright opaque art, to preserve painted detail.
   */
  render(frame, out, options = {}) {
    const { w, h, color, light } = frame, n = w * h;
    if (out.length < n * 4) throw new RangeError("Output RGBA buffer is too small");
    if (color.length < n || light.length < n) throw new RangeError("Invalid frame buffers");
    if (options.radiance && options.radiance.length < n * 3) throw new RangeError("HDR radiance buffer is too small");
    if (options.legacyLight && options.legacyLight.length < n) throw new RangeError("Additional packed light buffer is too small");
    if (frame.hdrLight && frame.hdrLight.length < n * 3) throw new RangeError("HDR emission buffer is too small");
    if (options.occlusion && options.occlusion.length < n) throw new RangeError("Occlusion buffer is too small");
    if (options.finalPalette && (!options.finalPalette.length || options.finalPalette.length > 256 || !options.finalPalette.every((c) => Number.isInteger(c) && c >= -2147483648 && c <= 4294967295))) throw new RangeError("Final palette needs 1..256 packed RGB colors");
    const bloom = options.bloom === false ? null : options.bloom ?? {};
    const count = bloom ? Math.max(1, Math.min(6, Math.floor(bloom.levels ?? 4))) : 0;
    this.prepare(w, h, count);
    const bg = options.background ?? null;
    const opaque = bg !== null, flat = typeof bg === "number";
    const lightStrength = Math.max(0, options.lightStrength ?? 1);
    const extra = options.radiance, nativeHDR = frame.hdrLight, legacy = options.legacyLight, ao = options.occlusion;
    for (let i = 0; i < n; i++) {
      const j = i * 3, c = color[i], l = light[i], a = (c >>> 24) / 255;
      const k = opaque ? flat ? bg : bg[i] : 0;
      const shade = ao ? clamp01(ao[i]) : 1;
      this.alpha[i] = opaque ? 1 : a;
      for (let ch = 0; ch < 3; ch++) {
        const shift = ch * 8, v = channel(c, shift);
        this.base[j + ch] = (opaque ? v * a + channel(k, shift) * (1 - a) : v * a) * shade;
        this.emission[j + ch] = ((nativeHDR ? nativeHDR[j + ch] : channel(l, shift)) + (legacy ? channel(legacy[i], shift) : 0)) * lightStrength + (extra?.[j + ch] ?? 0);
      }
    }
    if (bloom && n) this.buildBloom(Math.max(0, bloom.threshold ?? 0.16), Math.max(0, bloom.knee ?? 0.18));
    const mapper = options.toneMap ?? "aces", exposure = Math.max(0, options.exposure ?? 1.15);
    const highlightColor = clamp01(options.highlightColor ?? 0);
    const saturation = Math.max(0, options.saturation ?? 1.08);
    const contrast = Math.max(0, options.contrast ?? 1.04);
    const vignette = clamp01(options.vignette ?? 0.08);
    const bloomIntensity = Math.max(0, bloom?.intensity ?? 0.9);
    const fringe = Math.max(0, options.chromaticFringe ?? 0.45);
    const cx = (w - 1) * 0.5, cy = (h - 1) * 0.5;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, j = i * 3;
      const nx = (x - cx) / Math.max(1, cx), ny = (y - cy) / Math.max(1, cy);
      const edge = Math.min(1, (nx * nx + ny * ny) * 0.5);
      const fringeX = nx * fringe, fringeY = ny * fringe;
      let r = this.base[j] + this.emission[j], g = this.base[j + 1] + this.emission[j + 1];
      let b = this.base[j + 2] + this.emission[j + 2];
      if (bloom) {
        let stride = 2, rr = 0, gg = 0, bb = 0;
        const normalizer = (1 - 0.58 ** this.levels.length) / (1 - 0.58);
        let weight = 1 / normalizer;
        for (const level of this.levels) {
          const px = (x + 0.5) / stride - 0.5, py = (y + 0.5) / stride - 0.5;
          rr += this.sample(level, px + fringeX / stride, py + fringeY / stride, 0) * weight;
          gg += this.sample(level, px, py, 1) * weight;
          bb += this.sample(level, px - fringeX / stride, py - fringeY / stride, 2) * weight;
          weight *= 0.58;
          stride *= 2;
        }
        r += rr * bloomIntensity;
        g += gg * bloomIntensity;
        b += bb * bloomIntensity;
      }
      let alpha = this.alpha[i];
      if (!opaque) alpha = Math.max(alpha, clamp01(Math.max(r, g, b) * 0.85));
      const invA = alpha > 0 ? 1 / alpha : 0;
      if (highlightColor > 0 && mapper !== "none") {
        r = r * exposure * invA;
        g = g * exposure * invA;
        b = b * exposure * invA;
        const peak = Math.max(r, g, b), onset = clamp01((peak - 1) / 3);
        const preserve = highlightColor * onset * onset * (3 - 2 * onset);
        if (preserve > 0) {
          const scale = tone(peak, mapper) / peak;
          r = tone(r, mapper) * (1 - preserve) + r * scale * preserve;
          g = tone(g, mapper) * (1 - preserve) + g * scale * preserve;
          b = tone(b, mapper) * (1 - preserve) + b * scale * preserve;
        } else {
          r = tone(r, mapper);
          g = tone(g, mapper);
          b = tone(b, mapper);
        }
      } else {
        r = tone(r * exposure * invA, mapper);
        g = tone(g * exposure * invA, mapper);
        b = tone(b * exposure * invA, mapper);
      }
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const fade = 1 - vignette * edge * edge;
      r = (luminance + (r - luminance) * saturation - 0.18) * contrast + 0.18;
      g = (luminance + (g - luminance) * saturation - 0.18) * contrast + 0.18;
      b = (luminance + (b - luminance) * saturation - 0.18) * contrast + 0.18;
      const o = i * 4;
      out[o] = toSRGB(r * fade);
      out[o + 1] = toSRGB(g * fade);
      out[o + 2] = toSRGB(b * fade);
      out[o + 3] = Math.round(alpha * 255);
      if (options.finalPalette && out[o + 3]) {
        let best = options.finalPalette[0], distance = Infinity;
        for (const color2 of options.finalPalette) {
          const d = (out[o] - (color2 & 255)) ** 2 + (out[o + 1] - (color2 >>> 8 & 255)) ** 2 + (out[o + 2] - (color2 >>> 16 & 255)) ** 2;
          if (d < distance) {
            distance = d;
            best = color2;
          }
        }
        out[o] = best & 255;
        out[o + 1] = best >>> 8 & 255;
        out[o + 2] = best >>> 16 & 255;
      }
    }
    return out;
  }
};

export {
  SRGB_TO_LINEAR,
  channelToLinear,
  CinematicCompositor
};
