// src/core/sprite-raster.ts
var IDENTITY_PIXEL_TRANSFORM = Object.freeze([1, 0, 0, 1, 0, 0]);
function pixelTransform2D(x = 0, y = 0, angle = 0, flip = false) {
  if (![x, y, angle].every(Number.isFinite)) throw new RangeError("Pixel transform must be finite");
  const c = Math.cos(angle), s = Math.sin(angle), f = flip ? -1 : 1;
  return [c * f, s * f, -s, c, x, y];
}
function composePixelTransform2D(parent, child) {
  const [a, b, c, d, x, y] = parent, [e, f, g, h, u, v] = child;
  return [a * e + c * f, b * e + d * f, a * g + c * h, b * g + d * h, a * u + c * v + x, b * u + d * v + y];
}
function transformPixelPoint2D(m, p) {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}
function invertPixelTransform2D(m) {
  const [a, b, c, d, x, y] = m, det = a * d - b * c;
  if (!m.every(Number.isFinite) || !Number.isFinite(det) || Math.abs(det) < 1e-12) throw new RangeError("Pixel transform must be finite and invertible");
  return [d / det, -b / det, -c / det, a / det, (c * y - d * x) / det, (b * x - a * y) / det];
}
function blitSprite2D(p, sprite, alpha = 1) {
  p.mask(sprite.mask, sprite.x ?? 0, sprite.y ?? 0, (x, y) => sprite.pixels[y * sprite.w + x], alpha);
}
function transformSprite2D(sprite, transform) {
  const inverse = invertPixelTransform2D(transform);
  const corners = [[sprite.x, sprite.y], [sprite.x + sprite.w, sprite.y], [sprite.x, sprite.y + sprite.h], [sprite.x + sprite.w, sprite.y + sprite.h]];
  const points = corners.map((q) => transformPixelPoint2D(transform, q));
  const x = Math.floor(Math.min(...points.map((p) => p[0]))), y = Math.floor(Math.min(...points.map((p) => p[1])));
  const w = Math.max(1, Math.ceil(Math.max(...points.map((p) => p[0]))) - x), h = Math.max(1, Math.ceil(Math.max(...points.map((p) => p[1]))) - y);
  if (!Number.isSafeInteger(w * h) || w * h > 16777216) throw new RangeError("Transformed sprite exceeds the native raster budget");
  const pixels = new Uint32Array(w * h), data = new Uint8Array(w * h);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const q = transformPixelPoint2D(inverse, [x + xx + 0.5, y + yy + 0.5]), sx = Math.floor(q[0] - sprite.x), sy = Math.floor(q[1] - sprite.y);
    if (sx < 0 || sy < 0 || sx >= sprite.w || sy >= sprite.h) continue;
    const source = sy * sprite.w + sx, i = yy * w + xx;
    if (sprite.mask.data[source]) {
      pixels[i] = sprite.pixels[source];
      data[i] = pixels[i] >>> 24 ? 1 : 0;
    }
  }
  return { x, y, w, h, pixels, mask: { w, h, data } };
}
function encodeSpritePixels2D(pixels) {
  const runs = [];
  let color = -1, count = 0;
  for (let i = 0; i < pixels.length; i++) {
    const next = pixels[i] >>> 0;
    if (next === color) count++;
    else {
      if (count) runs.push(count, color);
      color = next;
      count = 1;
    }
  }
  if (count) runs.push(count, color);
  return runs;
}

// src/core/sprite-edit.ts
function editSpriteCluster2D(source, patch, options = {}) {
  const count = source.w * source.h;
  if (![source.w, source.h, count].every(Number.isSafeInteger) || source.w < 1 || source.h < 1 || count > 16777216 || !(source.pixels instanceof Uint32Array) || source.pixels.length !== count || source.mask.w !== source.w || source.mask.h !== source.h || !(source.mask.data instanceof Uint8Array) || source.mask.data.length !== count)
    throw new RangeError("Sprite dimensions must match its pixel and silhouette buffers (at most 16,777,216 cells)");
  const selection = options.selection;
  if (selection && (selection.w !== source.w || selection.h !== source.h || selection.data.length !== count))
    throw new RangeError("Selection must match the full sprite dimensions");
  if (!Number.isSafeInteger(patch.x) || !Number.isSafeInteger(patch.y) || !Array.isArray(patch.rows) || !patch.rows.every((row) => typeof row === "string"))
    throw new RangeError("Cluster needs safe integer coordinates and string rows");
  const rows = patch.rows.map((row) => [...row]);
  if (!Number.isSafeInteger(patch.y + rows.length) || rows.some((row) => !Number.isSafeInteger(patch.x + row.length)))
    throw new RangeError("Cluster extents must be safe integers");
  const palette = /* @__PURE__ */ new Map();
  for (const [symbol, value] of Object.entries(patch.palette)) {
    if ([...symbol].length !== 1 || value !== null && (!Number.isInteger(value) || value < -2147483648 || value > 4294967295))
      throw new RangeError("Cluster palette keys must be single code points and colors must be packed 32-bit RGBA or null");
    const color = value === null ? 0 : value >>> 0;
    palette.set(symbol, color >>> 24 ? color : 0);
  }
  const pixels = source.pixels.slice(), mask = { ...source.mask, data: source.mask.data.slice() };
  for (let row = 0; row < rows.length; row++) {
    const y = patch.y + row;
    if (y < 0 || y >= source.h) continue;
    for (let col = 0; col < rows[row].length; col++) {
      const x = patch.x + col, color = palette.get(rows[row][col]);
      if (color === void 0 || x < 0 || x >= source.w) continue;
      const i = y * source.w + x;
      if (selection && !selection.data[i]) continue;
      pixels[i] = color;
      mask.data[i] = color >>> 24 ? 1 : 0;
    }
  }
  return { ...source, pixels, mask };
}

// src/core/pixel-tools.ts
var opaque = (c) => (c | 4278190080) >>> 0;
function rasterSize(sprite) {
  if (!Number.isInteger(sprite.w) || !Number.isInteger(sprite.h) || sprite.w < 1 || sprite.h < 1 || sprite.w * sprite.h > 16777216 || sprite.pixels.length !== sprite.w * sprite.h || sprite.mask.data.length !== sprite.pixels.length || sprite.mask.w !== sprite.w || sprite.mask.h !== sprite.h) throw new RangeError("Pixel tools require matching native raster buffers");
}
function clone(sprite) {
  return { ...sprite, pixels: sprite.pixels.slice(), mask: { ...sprite.mask, data: sprite.mask.data.slice() } };
}
function colorDistance(a, b) {
  const r = (a & 255) - (b & 255), g = (a >>> 8 & 255) - (b >>> 8 & 255), v = (a >>> 16 & 255) - (b >>> 16 & 255);
  return r * r * 2 + g * g * 3 + v * v;
}
function indexSprite2D(sprite, palette, mode = "exact") {
  rasterSize(sprite);
  if (!["exact", "nearest"].includes(mode) || palette && !palette.every((c) => Number.isInteger(c) && c >= -2147483648 && c <= 4294967295)) throw new RangeError("Invalid palette or quantization mode");
  const colors = palette ? Array.from(palette, opaque) : [], map = new Map(colors.map((c, i) => [c, i]));
  if (colors.length > 256 || new Set(colors).size !== colors.length) throw new RangeError("Palette must contain at most 256 unique RGB colors");
  const indices = new Uint16Array(sprite.pixels.length), alpha = new Uint8Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    const c = sprite.pixels[i], a = c >>> 24;
    if (!a || !sprite.mask.data[i]) continue;
    alpha[i] = a;
    const rgb = opaque(c);
    let index = map.get(rgb);
    if (index === void 0) {
      if (!palette) {
        if (colors.length >= 256) throw new RangeError("Sprite exceeds 256 colors; choose an explicit palette");
        index = colors.length;
        colors.push(rgb);
        map.set(rgb, index);
      } else if (mode === "exact") throw new RangeError("Sprite contains an RGB color outside the supplied palette");
      else {
        if (!colors.length) throw new RangeError("Cannot quantize into an empty palette");
        let distance = Infinity;
        index = 0;
        colors.forEach((q, j) => {
          const d = colorDistance(c, q);
          if (d < distance) {
            index = j;
            distance = d;
          }
        });
      }
    }
    indices[i] = index;
  }
  return { w: sprite.w, h: sprite.h, x: sprite.x ?? 0, y: sprite.y ?? 0, indices, alpha, palette: colors };
}
function cyclePalette2D(palette, cycles, time) {
  if (!Number.isFinite(time)) throw new RangeError("Palette time must be finite");
  const out = Array.from(palette, opaque), used = /* @__PURE__ */ new Set();
  for (const cycle of cycles) {
    if (!Number.isFinite(cycle.fps) || cycle.fps < 0 || !Number.isFinite(cycle.phase ?? 0) || !cycle.indices.length) throw new RangeError("Invalid palette cycle");
    for (const i of cycle.indices) {
      if (!Number.isInteger(i) || i < 0 || i >= out.length || used.has(i)) throw new RangeError("Palette cycle indices must be valid and disjoint");
      used.add(i);
    }
    const n = cycle.indices.length, raw = Math.floor(time * cycle.fps + (cycle.phase ?? 0)) * (cycle.reverse ? -1 : 1), step = (raw % n + n) % n;
    cycle.indices.forEach((index, i) => out[index] = opaque(palette[cycle.indices[(i - step + n) % n]]));
  }
  return out;
}
function renderIndexedSprite2D(sprite, time = 0, cycles = []) {
  const palette = cyclePalette2D(sprite.palette, cycles, time), pixels = new Uint32Array(sprite.w * sprite.h), data = new Uint8Array(pixels.length);
  if (sprite.indices.length !== pixels.length || sprite.alpha.length !== pixels.length) throw new RangeError("Indexed buffers do not match dimensions");
  for (let i = 0; i < pixels.length; i++) if (sprite.alpha[i]) {
    const c = palette[sprite.indices[i]];
    if (c === void 0) throw new RangeError("Indexed cell is outside the palette");
    pixels[i] = (c & 16777215 | sprite.alpha[i] << 24) >>> 0;
    data[i] = 1;
  }
  return { w: sprite.w, h: sprite.h, x: sprite.x, y: sprite.y, pixels, mask: { w: sprite.w, h: sprite.h, data } };
}
var BAYER2 = Object.freeze([0, 2, 3, 1]);
var BAYER4 = Object.freeze([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
var DISPERSED8 = Object.freeze([0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21]);
var CLUSTER4 = Object.freeze([12, 5, 6, 13, 4, 0, 1, 7, 11, 3, 2, 8, 15, 10, 9, 14]);
function ditherPattern2D(pattern = "bayer4") {
  if (pattern === "bayer2") return { size: 2, values: BAYER2 };
  if (pattern === "bayer4") return { size: 4, values: BAYER4 };
  if (pattern === "dispersed8") return { size: 8, values: DISPERSED8 };
  if (pattern === "cluster4") return { size: 4, values: CLUSTER4 };
  throw new RangeError("Unknown dither pattern");
}
function patternTransform(options, context) {
  if (!["object", "world", "screen"].includes(options.anchor) || options.pattern !== void 0 && !["bayer2", "bayer4", "dispersed8", "cluster4"].includes(options.pattern) || options.phase !== void 0 && (options.phase.length !== 2 || !options.phase.every(Number.isFinite)) || !Number.isFinite(options.scale ?? 1) || (options.scale ?? 1) <= 0) throw new RangeError("Invalid pattern coordinates");
  let matrix = context.rasterToObject ?? IDENTITY_PIXEL_TRANSFORM;
  if (options.anchor !== "object") matrix = context.rasterToWorld ?? composePixelTransform2D(context.objectToWorld ?? IDENTITY_PIXEL_TRANSFORM, matrix);
  if (options.anchor === "screen") matrix = context.rasterToScreen ?? composePixelTransform2D(context.worldToScreen ?? IDENTITY_PIXEL_TRANSFORM, matrix);
  if (matrix.length !== 6 || !matrix.every(Number.isFinite)) throw new RangeError("Pattern transform must be finite");
  return matrix;
}
function createDitherSampler2D(options, context = {}) {
  const m = patternTransform(options, context), scale = options.scale ?? 1, px = options.phase?.[0] ?? 0, py = options.phase?.[1] ?? 0, { size: n, values } = ditherPattern2D(options.pattern);
  return (x, y) => {
    const a = Math.floor((m[0] * x + m[2] * y + m[4]) / scale + px), b = Math.floor((m[1] * x + m[3] * y + m[5]) / scale + py);
    return (values[(b % n + n) % n * n + (a % n + n) % n] + 0.5) / (n * n);
  };
}
function ditherSprite2D(source, options, context = {}) {
  const out = clone(source);
  ditherSprite2DInto(source, out, options, context);
  return out;
}
function ditherSprite2DInto(source, out, options, context = {}) {
  rasterSize(source);
  rasterSize(out);
  if (source.w !== out.w || source.h !== out.h) throw new RangeError("Dither destination must match source dimensions");
  const thresholdAt = createDitherSampler2D(options, context);
  for (let y = 0; y < source.h; y++) for (let x = 0; x < source.w; x++) {
    const i = y * source.w + x, c = source.pixels[i], a = (c >>> 24) / 255;
    const threshold = thresholdAt((source.x ?? 0) + x + 0.5, (source.y ?? 0) + y + 0.5);
    const keep = !!source.mask.data[i] && a > threshold;
    out.pixels[i] = keep ? opaque(c) : 0;
    out.mask.data[i] = keep ? 1 : 0;
  }
}
function selectiveOutline2D(source, options) {
  rasterSize(source);
  if (options.selection && options.selection.length !== source.w * source.h || options.protected && options.protected.length !== source.w * source.h || options.lightDirection && !options.lightDirection.every(Number.isFinite)) throw new RangeError("Outline selections and direction must match the native canvas");
  const out = clone(source), [lx, ly] = options.lightDirection ?? [-1, -1], length = Math.hypot(lx, ly) || 1;
  const at = (x, y) => x >= 0 && y >= 0 && x < source.w && y < source.h && source.mask.data[y * source.w + x] !== 0;
  for (let y = 0; y < source.h; y++) for (let x = 0; x < source.w; x++) {
    const i = y * source.w + x;
    if (at(x, y) || options.protected?.[i] || options.selection && !options.selection[i]) continue;
    let nx = 0, ny = 0, n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(x - dx, y - dy)) {
      nx += dx;
      ny += dy;
      n++;
    }
    if (!n) continue;
    const facing = (nx * lx + ny * ly) / (Math.hypot(nx, ny) * length || 1);
    if (options.omitLit && facing > 0.35) continue;
    const color = facing > 0.35 ? options.light ?? options.shadow : facing < -0.35 ? options.shadow : options.side ?? options.shadow;
    out.pixels[i] = color >>> 0;
    out.mask.data[i] = color >>> 24 ? 1 : 0;
  }
  return out;
}
function compileAuthoredPixelTrack2D(track) {
  if (!Number.isFinite(track.duration) || track.duration <= 0 || !track.keys.length) throw new RangeError("Pixel track needs a positive duration and keys");
  const duration = track.duration, loop = track.loop ?? false;
  const keys = JSON.parse(JSON.stringify(track.keys)), allowed = track.allowedColors ? new Set(track.allowedColors.map((c) => c >>> 0)) : null;
  keys.forEach((key, i) => {
    if (!Number.isFinite(key.at) || key.at < 0 || key.at > track.duration || i && key.at <= keys[i - 1].at) throw new RangeError("Pixel keys must be strictly ordered within duration");
    if (allowed) {
      for (const patch of key.patches) for (const color of Object.values(patch.palette)) if (color !== null && !allowed.has(color >>> 0)) throw new RangeError("Authored pixel color is outside the allowed set");
    }
  });
  return (source, time) => {
    if (!Number.isFinite(time)) throw new RangeError("Pixel track time must be finite");
    const t = loop ? (time % duration + duration) % duration : Math.max(0, Math.min(duration, time));
    let key;
    for (const candidate of keys) {
      if (candidate.at > t) break;
      key = candidate;
    }
    let out = clone(source);
    for (const patch of key?.patches ?? []) out = editSpriteCluster2D(out, patch);
    return out;
  };
}
function diagnosePixelSprite2D(source, options = {}) {
  rasterSize(source);
  const { w, h } = source, n = w * h, issues = [], heatmap = new Uint8Array(n), m = options.masks ?? {}, colors = /* @__PURE__ */ new Set();
  for (const mask of Object.values(m)) if (mask && mask.length !== n) throw new RangeError("Diagnostic semantic masks must match native dimensions");
  const palette = options.palette ? new Set(options.palette.map(opaque)) : null, occupied = new Uint8Array(n);
  const add = (kind, x, y, area, confidence, message) => {
    issues.push({ kind, x, y, area, confidence, message });
    heatmap[y * w + x] = confidence === "contract" ? 255 : 128;
  };
  for (let i = 0; i < n; i++) {
    occupied[i] = source.mask.data[i] && source.pixels[i] >>> 24 ? 1 : 0;
    if (occupied[i]) colors.add(opaque(source.pixels[i]));
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, protectedCell = m.featureMask?.[i] || m.negativeSpace?.[i];
    if (m.solidSubject?.[i] && !occupied[i] && !protectedCell) add("solid-gap", x, y, 1, "contract", "Expected solid subject cell is transparent");
    if (!occupied[i]) continue;
    if (palette && !palette.has(opaque(source.pixels[i]))) add("palette-escape", x, y, 1, "contract", "Surface color is outside the selected palette");
    const neighbors = (x > 0 ? occupied[i - 1] : 0) + (x + 1 < w ? occupied[i + 1] : 0) + (y > 0 ? occupied[i - w] : 0) + (y + 1 < h ? occupied[i + w] : 0);
    if (!neighbors && !protectedCell && !m.sparkAccent?.[i]) add("isolated-cell", x, y, 1, "heuristic", "Isolated cell; inspect whether it is an intentional accent");
  }
  const seen = new Uint8Array(n), queue = [];
  for (let i = 0; i < n; i++) if (!occupied[i] && !seen[i]) {
    queue.length = 0;
    queue.push(i);
    seen[i] = 1;
    let open = false, protectedRegion = false;
    for (let q = 0; q < queue.length; q++) {
      const j = queue[q], x = j % w, y = Math.floor(j / w);
      if (!x || !y || x === w - 1 || y === h - 1) open = true;
      if (m.negativeSpace?.[j] || m.featureMask?.[j]) protectedRegion = true;
      for (const k of [x > 0 ? j - 1 : -1, x + 1 < w ? j + 1 : -1, y > 0 ? j - w : -1, y + 1 < h ? j + w : -1]) if (k >= 0 && !occupied[k] && !seen[k]) {
        seen[k] = 1;
        queue.push(k);
      }
    }
    if (!open && !protectedRegion && queue.length <= (options.maxHoleArea ?? 8)) {
      const j = queue[0];
      add("enclosed-hole", j % w, Math.floor(j / w), queue.length, "heuristic", "Small enclosed negative space; inspect before repairing");
    }
  }
  const left = Array(h).fill(-1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (occupied[y * w + x]) {
    left[y] = x;
    break;
  }
  for (let y = 2; y < h - 1; y++) {
    if (left[y - 2] < 0 || left[y - 1] < 0 || left[y] < 0 || left[y + 1] < 0) continue;
    const a = left[y - 1] - left[y - 2], b = left[y] - left[y - 1], c = left[y + 1] - left[y];
    if (Math.abs(b) >= 3 && Math.abs(a) <= 1 && Math.abs(c) <= 1 && !m.featureMask?.[y * w + left[y]]) add("jaggy-candidate", left[y], y, 1, "heuristic", "Abrupt stair-step length in the left silhouette");
  }
  for (let y = 0; y < h - 2; y++) for (let x = 0; x < w - 3; x++) {
    const i = y * w + x;
    if (m.featureMask?.[i] || !occupied[i] || !occupied[i + 1] || source.pixels[i] === source.pixels[i + 1]) continue;
    if (source.pixels[i] === source.pixels[i + w + 1] && source.pixels[i] === source.pixels[i + 2 * w + 2] && source.pixels[i + 1] === source.pixels[i + w + 2] && source.pixels[i + 1] === source.pixels[i + 2 * w + 3]) add("banding-candidate", x, y, 3, "heuristic", "Parallel adjacent staircase colors; inspect deliberate material banding");
  }
  return { issues, heatmap, occupied: occupied.reduce((a, b) => a + b, 0), paletteSize: colors.size };
}
function diagnosePixelMotion2D(frames, options = {}) {
  if (!frames.length || frames.length > 4096) throw new RangeError("Motion diagnosis needs 1..4096 frames");
  const points = [];
  for (const f of frames) {
    rasterSize(f.sprite);
    if (!Number.isFinite(f.time)) throw new RangeError("Motion times must be finite");
    const s = f.sprite, x = s.x ?? 0, y = s.y ?? 0;
    for (const q of [[x, y], [x + s.w, y], [x, y + s.h], [x + s.w, y + s.h]]) points.push(transformPixelPoint2D(f.transform ?? IDENTITY_PIXEL_TRANSFORM, q));
  }
  const x0 = Math.floor(Math.min(...points.map((p) => p[0]))), y0 = Math.floor(Math.min(...points.map((p) => p[1]))), w = Math.ceil(Math.max(...points.map((p) => p[0]))) - x0, h = Math.ceil(Math.max(...points.map((p) => p[1]))) - y0;
  if (!Number.isSafeInteger(w * h) || w * h < 1 || w * h > 16777216 || options.protectedMask && options.protectedMask.length !== w * h) throw new RangeError("Motion diagnostic canvas exceeds its budget or selection size");
  const heatmap = new Uint32Array(w * h), pairs = [];
  const inverses = new Map(frames.map((f) => [f, invertPixelTransform2D(f.transform ?? IDENTITY_PIXEL_TRANSFORM)]));
  const at = (f, world) => {
    const q = transformPixelPoint2D(inverses.get(f), world), x = Math.floor(q[0] - (f.sprite.x ?? 0)), y = Math.floor(q[1] - (f.sprite.y ?? 0));
    return x < 0 || y < 0 || x >= f.sprite.w || y >= f.sprite.h ? 0 : f.sprite.pixels[y * f.sprite.w + x];
  };
  for (let k = 1; k < frames.length; k++) {
    let changed = 0, silhouetteChanged = 0;
    const a = frames[k - 1], b = frames[k];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (options.protectedMask?.[i]) continue;
      const q = [x0 + x + 0.5, y0 + y + 0.5], ca = at(a, q), cb = at(b, q);
      if (ca !== cb) {
        changed++;
        heatmap[i]++;
      }
      if (!!(ca >>> 24) !== !!(cb >>> 24)) silhouetteChanged++;
    }
    pairs.push({ from: a.time, to: b.time, changed, silhouetteChanged, unexpected: !!options.expectedStill && changed > 0 });
  }
  return { pairs, heatmap, width: w, height: h, x: x0, y: y0 };
}

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
  pixelTransform2D,
  composePixelTransform2D,
  transformPixelPoint2D,
  invertPixelTransform2D,
  blitSprite2D,
  transformSprite2D,
  encodeSpritePixels2D,
  ditherSprite2DInto,
  diagnosePixelSprite2D,
  diagnosePixelMotion2D,
  PIXEL_PALETTE_PRESETS,
  createPixelStyleProfile2D,
  compilePixelStyle2D,
  enableHDRLight
};
