import {
  compileAuthoredPixelTrack2D,
  createDitherSampler2D,
  cyclePalette2D,
  ditherSprite2D,
  indexSprite2D,
  renderIndexedSprite2D,
  selectiveOutline2D
} from "./chunk-G6VBW32E.js";

// src/core/pixel-quantize.ts
var LINEAR = Float64Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
var vector = (color) => [LINEAR[color & 255], LINEAR[color >>> 8 & 255], LINEAR[color >>> 16 & 255]];
var weights = [0.2126, 0.7152, 0.0722];
function createOrderedPaletteQuantizer2D(palette, strength = 1) {
  if (!Array.isArray(palette) || !palette.length || palette.length > 256 || !palette.every((c) => Number.isInteger(c) && c >= -2147483648 && c <= 4294967295)) throw new RangeError("Ordered quantization needs 1..256 RGB colors");
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) throw new RangeError("Color dither strength must be within 0..1");
  const colors = palette.map((c) => (c | 4278190080) >>> 0), exact = new Map(colors.map((c, i) => [c, i]));
  if (exact.size !== colors.length) throw new RangeError("Palette colors must be unique");
  const rgb = colors.map(vector), cache = /* @__PURE__ */ new Map();
  function mix(color) {
    const key = (color | 4278190080) >>> 0, hit = exact.get(key);
    if (hit !== void 0) return { a: hit, b: hit, amount: 0 };
    const cached = cache.get(key);
    if (cached) return cached;
    const q = vector(key);
    let nearest = 0, error = Infinity;
    for (let i = 0; i < rgb.length; i++) {
      let d = 0;
      for (let k = 0; k < 3; k++) d += (q[k] - rgb[i][k]) ** 2 * weights[k];
      if (d < error) {
        error = d;
        nearest = i;
      }
    }
    let best = { a: nearest, b: nearest, amount: 0 };
    const a = rgb[nearest];
    if (strength > 0) for (let b = 0; b < rgb.length; b++) {
      if (b === nearest) continue;
      let dot = 0, length = 0;
      for (let k = 0; k < 3; k++) {
        const v = rgb[b][k] - a[k];
        dot += (q[k] - a[k]) * v * weights[k];
        length += v * v * weights[k];
      }
      const t = Math.max(0, Math.min(1, dot / length));
      if (t <= 0) continue;
      let residual = 0;
      for (let k = 0; k < 3; k++) residual += (q[k] - a[k] - (rgb[b][k] - a[k]) * t) ** 2 * weights[k];
      const score = residual + length * t * (1 - t) * 0.025;
      if (score < error - 1e-15) {
        error = score;
        best = { a: nearest, b, amount: t * strength };
      }
    }
    if (cache.size < 8192) cache.set(key, best);
    return best;
  }
  return { palette: colors.slice(), index(source, options = { anchor: "object" }, context = {}, coverage = {}) {
    const { w, h } = source, n = w * h;
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || n > 16777216 || source.pixels.length !== n || source.mask.w !== w || source.mask.h !== h || source.mask.data.length !== n) throw new RangeError("Quantization requires matching native raster buffers");
    const threshold = createDitherSampler2D(options, context), indices = new Uint16Array(n), alpha = new Uint8Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, c = source.pixels[i];
      if (!source.mask.data[i] || !(c >>> 24)) continue;
      const a = (c >>> 24) / 255, t = threshold(x + (source.x ?? 0) + 0.5, y + (source.y ?? 0) + 0.5);
      if (coverage.ditherAlpha && t >= a) continue;
      const colorThreshold = coverage.ditherAlpha ? t / a : t, m = mix(c);
      indices[i] = m.amount > colorThreshold ? m.b : m.a;
      alpha[i] = coverage.ditherAlpha ? 255 : c >>> 24;
    }
    return { w, h, x: source.x ?? 0, y: source.y ?? 0, indices, alpha, palette: colors.slice() };
  } };
}
var PIXEL_PALETTE_PRESETS = Object.freeze({
  "ink-paper": Object.freeze([4280359712, 4284043602, 4288321168, 4293452501]),
  "moon-steel": Object.freeze([4280491031, 4283908404, 4286933842, 4290617475, 4293448631, 4294964447]),
  "ember-gold": Object.freeze([4280094751, 4281607265, 4281424555, 4281965028, 4287026687, 4292408831]),
  "glacier": Object.freeze([4281541916, 4285748016, 4289298504, 4291541362, 4292992949, 4293984241]),
  "arcane-orchid": Object.freeze([4281276200, 4284887358, 4288763758, 4291792294, 4292788188, 4293978879])
});

// src/core/pixel-style.ts
function createPixelStyleProfile2D(input = {}) {
  const p = { version: 1, name: "Native crisp", nativeResolution: [320, 180], presentation: "integer-device-pixels", sampling: "inverse-cell-nearest", surfaceColors: "authored-rgba", alpha: "coverage", dither: { anchor: "object", pattern: "bayer4" }, outline: "none", emission: "linear-hdr", finalColorPolicy: "cinematic", poseSampling: "continuous-raster", ...JSON.parse(JSON.stringify(input)) };
  if (p.version !== 1 || typeof p.name !== "string" || !p.name.length || p.nativeResolution.length !== 2 || !p.nativeResolution.every((n) => Number.isInteger(n) && n > 0 && n <= 4096)) throw new RangeError("Invalid pixel style identity or resolution");
  const choices = { presentation: ["integer-device-pixels", "fit-preview"], sampling: ["inverse-cell-nearest"], surfaceColors: ["indexed", "authored-rgba"], alpha: ["solid", "coverage", "authored-dither"], outline: ["none", "silhouette", "selective"], emission: ["none", "palette-stepped", "linear-hdr"], finalColorPolicy: ["palette-locked", "cinematic"], poseSampling: ["authored-cels", "quantized-rig", "continuous-raster"] };
  for (const [key, values] of Object.entries(choices)) if (!values.includes(p[key])) throw new RangeError("Invalid pixel style " + key);
  if (!["object", "world", "screen"].includes(p.dither.anchor)) throw new RangeError("Invalid dither anchor");
  if (p.finalColorPolicy === "palette-locked" && (!p.palette?.length || p.emission === "linear-hdr")) throw new RangeError("Palette-locked final output needs a palette and cannot claim unrestricted HDR emission");
  if (p.surfaceColors === "indexed" && !p.palette?.length) throw new RangeError("Indexed style needs an explicit palette");
  if (p.quantization !== void 0 && !["exact", "nearest", "ordered"].includes(p.quantization)) throw new RangeError("Unknown color quantization");
  if (p.colorDitherStrength !== void 0 && (!Number.isFinite(p.colorDitherStrength) || p.colorDitherStrength < 0 || p.colorDitherStrength > 1)) throw new RangeError("Color dither strength must be within 0..1");
  return p;
}
function compilePixelStyle2D(input) {
  const profile = createPixelStyleProfile2D(input), tracks = (profile.pixelTracks ?? []).map(compileAuthoredPixelTrack2D);
  createDitherSampler2D(profile.dither);
  if (profile.palette) {
    if (!Array.isArray(profile.palette)) throw new TypeError("Pixel palette must be an array");
    indexSprite2D({ w: 1, h: 1, pixels: new Uint32Array(1), mask: { w: 1, h: 1, data: new Uint8Array(1) } }, profile.palette);
  }
  if (profile.cycles) cyclePalette2D(profile.palette ?? [], profile.cycles, 0);
  const quantizer = profile.quantization === "ordered" && (profile.surfaceColors === "indexed" || profile.finalColorPolicy === "palette-locked") ? createOrderedPaletteQuantizer2D(profile.palette, profile.colorDitherStrength ?? 1) : void 0;
  return { profile, apply(source, time = 0, context = {}) {
    let out = { ...source, pixels: source.pixels.slice(), mask: { ...source.mask, data: source.mask.data.slice() } };
    for (const track of tracks) out = { ...out, ...track(out, time) };
    if (profile.outline !== "none") out = selectiveOutline2D(out, { shadow: 4281542181, ...profile.outlineStyle, ...profile.outline === "silhouette" ? { omitLit: false } : {} });
    if (profile.surfaceColors === "indexed" || profile.finalColorPolicy === "palette-locked") out = { ...out, ...renderIndexedSprite2D(quantizer ? quantizer.index(out, profile.dither, context, { ditherAlpha: profile.alpha === "authored-dither" }) : indexSprite2D(out, profile.palette, profile.quantization === "nearest" ? "nearest" : "exact"), time, profile.cycles) };
    if (profile.alpha === "authored-dither") out = ditherSprite2D(out, profile.dither, context);
    else if (profile.alpha === "solid") for (let i = 0; i < out.pixels.length; i++) {
      out.pixels[i] = out.pixels[i] >>> 24 ? (out.pixels[i] | 4278190080) >>> 0 : 0;
      out.mask.data[i] = out.pixels[i] >>> 24 ? 1 : 0;
    }
    return out;
  } };
}

// src/render/hdr.ts
function enableHDRLight(frame) {
  const count = frame.w * frame.h * 3;
  if (!frame.hdrLight || frame.hdrLight.length !== count)
    frame.hdrLight = new Float32Array(count);
  return frame;
}

// src/render/coverage.ts
function blendOver(destination, source, opacity) {
  const alpha = Math.min(1, Math.max(0, opacity)) * (source >>> 24) / 255;
  if (!(alpha > 0)) return destination;
  if (alpha >= 1) return source >>> 0;
  if (destination >>> 24 === 0) {
    const byteAlpha = Math.round(alpha * 255);
    return byteAlpha ? (byteAlpha << 24 | source & 16777215) >>> 0 : 0;
  }
  const behind = (destination >>> 24) / 255 * (1 - alpha);
  const outAlpha = alpha + behind;
  const r = Math.round(((source & 255) * alpha + (destination & 255) * behind) / outAlpha);
  const g = Math.round(((source >>> 8 & 255) * alpha + (destination >>> 8 & 255) * behind) / outAlpha);
  const b = Math.round(((source >>> 16 & 255) * alpha + (destination >>> 16 & 255) * behind) / outAlpha);
  return (Math.round(outAlpha * 255) << 24 | b << 16 | g << 8 | r) >>> 0;
}

export {
  blendOver,
  PIXEL_PALETTE_PRESETS,
  createPixelStyleProfile2D,
  compilePixelStyle2D,
  enableHDRLight
};
