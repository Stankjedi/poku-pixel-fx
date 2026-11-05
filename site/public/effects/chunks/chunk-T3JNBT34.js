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
var BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
var DISPERSED8 = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
function patternTransform(options, context) {
  if (!["object", "world", "screen"].includes(options.anchor) || options.pattern !== void 0 && !["bayer4", "dispersed8"].includes(options.pattern) || options.phase !== void 0 && (options.phase.length !== 2 || !options.phase.every(Number.isFinite)) || !Number.isFinite(options.scale ?? 1) || (options.scale ?? 1) <= 0) throw new RangeError("Invalid pattern coordinates");
  let matrix = context.rasterToObject ?? IDENTITY_PIXEL_TRANSFORM;
  if (options.anchor !== "object") matrix = context.rasterToWorld ?? composePixelTransform2D(context.objectToWorld ?? IDENTITY_PIXEL_TRANSFORM, matrix);
  if (options.anchor === "screen") matrix = context.rasterToScreen ?? composePixelTransform2D(context.worldToScreen ?? IDENTITY_PIXEL_TRANSFORM, matrix);
  if (matrix.length !== 6 || !matrix.every(Number.isFinite)) throw new RangeError("Pattern transform must be finite");
  return matrix;
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
  const m = patternTransform(options, context), scale = options.scale ?? 1, px = options.phase?.[0] ?? 0, py = options.phase?.[1] ?? 0, wide = options.pattern === "dispersed8", n = wide ? 8 : 4, table = wide ? DISPERSED8 : BAYER4;
  for (let y = 0; y < source.h; y++) for (let x = 0; x < source.w; x++) {
    const i = y * source.w + x, c = source.pixels[i], a = (c >>> 24) / 255;
    const sx = (source.x ?? 0) + x + 0.5, sy = (source.y ?? 0) + y + 0.5, xx = Math.floor((m[0] * sx + m[2] * sy + m[4]) / scale + px), yy = Math.floor((m[1] * sx + m[3] * sy + m[5]) / scale + py);
    const threshold = (table[(yy % n + n) % n * n + (xx % n + n) % n] + 0.5) / (n * n);
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

// src/core/pixel-style.ts
function createPixelStyleProfile2D(input = {}) {
  const p = { version: 1, name: "Native crisp", nativeResolution: [320, 180], presentation: "integer-device-pixels", sampling: "inverse-cell-nearest", surfaceColors: "authored-rgba", alpha: "coverage", dither: { anchor: "object", pattern: "bayer4" }, outline: "none", emission: "linear-hdr", finalColorPolicy: "cinematic", poseSampling: "continuous-raster", ...JSON.parse(JSON.stringify(input)) };
  if (p.version !== 1 || typeof p.name !== "string" || !p.name.length || p.nativeResolution.length !== 2 || !p.nativeResolution.every((n) => Number.isInteger(n) && n > 0 && n <= 4096)) throw new RangeError("Invalid pixel style identity or resolution");
  const choices = { presentation: ["integer-device-pixels", "fit-preview"], sampling: ["inverse-cell-nearest"], surfaceColors: ["indexed", "authored-rgba"], alpha: ["solid", "coverage", "authored-dither"], outline: ["none", "silhouette", "selective"], emission: ["none", "palette-stepped", "linear-hdr"], finalColorPolicy: ["palette-locked", "cinematic"], poseSampling: ["authored-cels", "quantized-rig", "continuous-raster"] };
  for (const [key, values] of Object.entries(choices)) if (!values.includes(p[key])) throw new RangeError("Invalid pixel style " + key);
  if (!["object", "world", "screen"].includes(p.dither.anchor)) throw new RangeError("Invalid dither anchor");
  if (p.finalColorPolicy === "palette-locked" && (!p.palette?.length || p.emission === "linear-hdr")) throw new RangeError("Palette-locked final output needs a palette and cannot claim unrestricted HDR emission");
  if (p.surfaceColors === "indexed" && !p.palette?.length) throw new RangeError("Indexed style needs an explicit palette");
  return p;
}
function compilePixelStyle2D(input) {
  const profile = createPixelStyleProfile2D(input), tracks = (profile.pixelTracks ?? []).map(compileAuthoredPixelTrack2D);
  return { profile, apply(source, time = 0, context = {}) {
    let out = { ...source, pixels: source.pixels.slice(), mask: { ...source.mask, data: source.mask.data.slice() } };
    for (const track of tracks) out = { ...out, ...track(out, time) };
    if (profile.outline !== "none") out = selectiveOutline2D(out, { shadow: 4281542181, ...profile.outlineStyle, ...profile.outline === "silhouette" ? { omitLit: false } : {} });
    if (profile.surfaceColors === "indexed" || profile.finalColorPolicy === "palette-locked") out = { ...out, ...renderIndexedSprite2D(indexSprite2D(out, profile.palette, profile.quantization ?? "exact"), time, profile.cycles) };
    if (profile.alpha === "authored-dither") out = ditherSprite2D(out, profile.dither, context);
    else if (profile.alpha === "solid") for (let i = 0; i < out.pixels.length; i++) {
      out.pixels[i] = out.pixels[i] >>> 24 ? (out.pixels[i] | 4278190080) >>> 0 : 0;
      out.mask.data[i] = out.pixels[i] >>> 24 ? 1 : 0;
    }
    return out;
  } };
}

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
    const opaque2 = bg !== null, flat = typeof bg === "number";
    const lightStrength = Math.max(0, options.lightStrength ?? 1);
    const extra = options.radiance, nativeHDR = frame.hdrLight, legacy = options.legacyLight, ao = options.occlusion;
    for (let i = 0; i < n; i++) {
      const j = i * 3, c = color[i], l = light[i], a = (c >>> 24) / 255;
      const k = opaque2 ? flat ? bg : bg[i] : 0;
      const shade = ao ? clamp01(ao[i]) : 1;
      this.alpha[i] = opaque2 ? 1 : a;
      for (let ch = 0; ch < 3; ch++) {
        const shift = ch * 8, v = channel(c, shift);
        this.base[j + ch] = (opaque2 ? v * a + channel(k, shift) * (1 - a) : v * a) * shade;
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
      if (!opaque2) alpha = Math.max(alpha, clamp01(Math.max(r, g, b) * 0.85));
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
  SRGB_TO_LINEAR,
  channelToLinear,
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
  createPixelStyleProfile2D,
  compilePixelStyle2D,
  CinematicCompositor,
  enableHDRLight
};
