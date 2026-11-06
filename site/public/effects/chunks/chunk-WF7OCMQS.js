import {
  TAU,
  clamp,
  cubicBezier,
  fract,
  hex,
  noise2,
  quadraticBezier,
  rand,
  smooth
} from "./chunk-MBWWV6CB.js";

// src/core/material-ramp.ts
function opaque(color) {
  if (typeof color === "string") {
    if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) throw new RangeError("Material colors must be #rgb or #rrggbb");
    return hex(color) >>> 0;
  }
  if (!Number.isInteger(color) || color < -2147483648 || color > 4294967295 || color >>> 24 !== 255)
    throw new RangeError("Packed material colors must be opaque ABGR integers");
  return color >>> 0;
}
function createMaterialRamp2D(palette, options = {}) {
  if (!Array.isArray(palette) || palette.length < 1 || palette.length > 256)
    throw new RangeError("Material palette needs 1 to 256 colors");
  const colors = Array.from(palette, opaque);
  const thresholds = options.thresholds === void 0 ? Array.from({ length: colors.length - 1 }, (_, i) => (i + 1) / colors.length) : Array.from(options.thresholds);
  if (thresholds.length !== colors.length - 1 || thresholds.some((t, i) => !Number.isFinite(t) || t <= 0 || t >= 1 || i > 0 && t <= thresholds[i - 1]))
    throw new RangeError("Material thresholds must ascend strictly inside 0..1, with one fewer than palette colors");
  const highlight = options.highlight ? { color: opaque(options.highlight.color), threshold: options.highlight.threshold } : void 0;
  if (highlight && (!Number.isFinite(highlight.threshold) || highlight.threshold <= 0 || highlight.threshold > 1))
    throw new RangeError("Highlight threshold must be above zero and at most one");
  return (diffuse, specular = 0) => {
    if (!Number.isFinite(diffuse) || !Number.isFinite(specular)) throw new RangeError("Material light responses must be finite");
    if (highlight && diffuse > 0 && specular >= highlight.threshold) return highlight.color;
    let index = 0;
    while (index < thresholds.length && diffuse >= thresholds[index]) index++;
    return colors[index];
  };
}

// src/core/pixel-material.ts
var PIXEL_MATERIAL_PALETTES_2D = Object.freeze({
  stone: Object.freeze(["#121a25", "#1c2936", "#283b49", "#344e59", "#42616a", "#54777b", "#698c8b", "#82a09a", "#9db5a7", "#b9c8b3", "#d3d7c1", "#eee6cf"]),
  metal: Object.freeze(["#121322", "#22263a", "#353c52", "#49566b", "#62768a", "#7f95a6", "#9badb7", "#b7c6c7", "#d0d8cf", "#e6e5d6", "#f7efda", "#fffbed"]),
  wood: Object.freeze(["#20151e", "#33202a", "#4c2b30", "#683936", "#854b3d", "#a16147", "#b87a55", "#cb9568", "#d9af7e", "#e5c395", "#eed6b0", "#f8e9ce"]),
  fabric: Object.freeze(["#21162f", "#352041", "#4c2a50", "#68365c", "#854568", "#a45978", "#bc7288", "#cf8c9d", "#dea7b0", "#eac1c3", "#f2d8d4", "#fceee2"]),
  crystal: Object.freeze(["#131c36", "#202d53", "#29446d", "#2d6083", "#347f98", "#479eae", "#66b8be", "#8ccdd0", "#b1dedc", "#d0ebe5", "#e8f6ee", "#fcfff2"])
});
var KIND_RESPONSE = {
  stone: { roughness: 0.78, reflection: 0.055, wear: 0.1 },
  metal: { roughness: 0.28, reflection: 0.78, wear: 0.16 },
  wood: { roughness: 0.65, reflection: 0.13, wear: 0.07 },
  fabric: { roughness: 0.92, reflection: 0.035, wear: 0 },
  crystal: { roughness: 0.18, reflection: 0.52, wear: 0.06 }
};
function inRange(value, minimum, maximum, name) {
  if (!Number.isFinite(value) || value < minimum || value > maximum)
    throw new RangeError(`${name} must be finite and within ${minimum}..${maximum}`);
  return value;
}
function resolveOptions(input) {
  const kind = input.kind ?? "stone";
  if (!Object.hasOwn(KIND_RESPONSE, kind)) throw new RangeError("Unknown pixel material kind");
  const seed = input.seed ?? 17, materialId = input.materialId ?? 1;
  if (!Number.isInteger(seed) || seed < -2147483648 || seed > 4294967295)
    throw new RangeError("Pixel material seed must be a 32-bit integer");
  if (!Number.isInteger(materialId) || materialId < 1 || materialId > 65535)
    throw new RangeError("Pixel material ID must be within 1..65535");
  const palette = input.palette ?? PIXEL_MATERIAL_PALETTES_2D[kind];
  createMaterialRamp2D(palette, { thresholds: input.thresholds });
  const light = input.light ?? [-0.6, -0.7, 1];
  if (light.length !== 3 || !light.every(Number.isFinite) || !(Math.hypot(...light) > 0) || !Number.isFinite(Math.hypot(...light)))
    throw new RangeError("Pixel material light must be a finite nonzero 3-vector");
  const grainAngle = input.grainAngle ?? 0;
  if (!Number.isFinite(grainAngle)) throw new RangeError("Grain angle must be finite");
  return Object.freeze({
    kind,
    seed: seed >>> 0,
    materialId,
    palette: Object.freeze(Array.from(palette, (color) => hex(color) >>> 0)),
    ...input.thresholds ? { thresholds: Object.freeze(Array.from(input.thresholds)) } : {},
    scale: inRange(input.scale ?? 14, 2, 4096, "Material feature scale"),
    detail: inRange(input.detail ?? 0.65, 0, 1, "Material detail"),
    relief: inRange(input.relief ?? 3, 0, 4096, "Material relief"),
    bevel: inRange(input.bevel ?? 5, 0, 4096, "Material bevel"),
    roughness: inRange(input.roughness ?? KIND_RESPONSE[kind].roughness, 0, 1, "Material roughness"),
    light: Object.freeze([...light]),
    ambient: inRange(input.ambient ?? 0.2, 0, 1, "Material ambient"),
    grainAngle
  });
}
function checkSprite(source) {
  const { w, h } = source, count = w * h;
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1 || count > 16777216 || !(source.pixels instanceof Uint32Array) || source.pixels.length !== count || source.mask.w !== w || source.mask.h !== h || !(source.mask.data instanceof Uint8Array) || source.mask.data.length !== count)
    throw new RangeError("Pixel material sprite dimensions must match native pixel and mask buffers");
  return count;
}
function checkArray(values, count, name, height = false) {
  if (values === void 0) return;
  if (values.length !== count) throw new RangeError(`${name} must match native sprite dimensions`);
  for (let i = 0; i < count; i++) {
    if (!Number.isFinite(values[i]) || height && !Number.isFinite(Math.fround(values[i])))
      throw new RangeError(`${name} must contain finite${height ? " float32" : ""} values`);
  }
}
function copyChannels(source, count) {
  const existing = source.channels;
  if (existing) {
    if (existing.w !== source.w || existing.h !== source.h || !(existing.material instanceof Uint16Array) || !(existing.height instanceof Float32Array) || !(existing.normal instanceof Float32Array) || existing.material.length !== count || existing.height.length !== count || existing.normal.length !== count * 3 || !existing.height.every(Number.isFinite) || !existing.normal.every(Number.isFinite))
      throw new RangeError("Existing material channels must match the sprite and contain finite values");
    return { w: source.w, h: source.h, material: existing.material.slice(), height: existing.height.slice(), normal: existing.normal.slice() };
  }
  const normal = new Float32Array(count * 3);
  for (let i = 2; i < normal.length; i += 3) normal[i] = 1;
  return { w: source.w, h: source.h, material: new Uint16Array(count), height: new Float32Array(count), normal };
}
function distanceLine(f, result, sites, boundaries, length) {
  let k = 0;
  sites[0] = 0;
  boundaries[0] = -Infinity;
  boundaries[1] = Infinity;
  for (let q = 1; q < length; q++) {
    let p = sites[k], crossing = (f[q] + q * q - (f[p] + p * p)) / (2 * (q - p));
    while (crossing <= boundaries[k]) {
      p = sites[--k];
      crossing = (f[q] + q * q - (f[p] + p * p)) / (2 * (q - p));
    }
    sites[++k] = q;
    boundaries[k] = crossing;
    boundaries[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < length; q++) {
    while (boundaries[k + 1] < q) k++;
    const delta = q - sites[k];
    result[q] = delta * delta + f[sites[k]];
  }
}
function silhouetteDistance(occupied, w, h) {
  const size = Math.max(w, h) + 2, f = new Float64Array(size), line = new Float64Array(size);
  const sites = new Int32Array(size), boundaries = new Float64Array(size + 1);
  const horizontal = new Float64Array(w * h), distance = new Float32Array(w * h), far = (w + h + 2) ** 2;
  for (let y = 0; y < h; y++) {
    f[0] = f[w + 1] = 0;
    for (let x = 0; x < w; x++) f[x + 1] = occupied[y * w + x] ? far : 0;
    distanceLine(f, line, sites, boundaries, w + 2);
    for (let x = 0; x < w; x++) horizontal[y * w + x] = line[x + 1];
  }
  for (let x = 0; x < w; x++) {
    f[0] = f[h + 1] = 0;
    for (let y = 0; y < h; y++) f[y + 1] = horizontal[y * w + x];
    distanceLine(f, line, sites, boundaries, h + 2);
    for (let y = 0; y < h; y++) distance[y * w + x] = Math.max(0, Math.sqrt(line[y + 1]) - 0.5);
  }
  return distance;
}
function materialField(options) {
  const { kind, seed, scale, grainAngle } = options, cs = Math.cos(grainAngle), sn = Math.sin(grainAngle);
  return (x, y, out) => {
    const u = (x * cs + y * sn) / scale, v = (-x * sn + y * cs) / scale;
    const warpX = noise2(u * 0.48 + 17, v * 0.48 - 11, seed + 31);
    const warpY = noise2(u * 0.48 - 7, v * 0.48 + 23, seed + 47);
    const a = u + warpX * 0.55, b = v + warpY * 0.55;
    const broad = noise2(a * 0.67 + 2, b * 0.67 - 3, seed + 11);
    out.cavity = 0;
    out.accent = 0;
    if (kind === "stone") {
      const middle = noise2(a * 1.9 - 3, b * 1.9 + 8, seed + 101);
      const fine = noise2(a * 4.3 + 5, b * 4.3 - 2, seed + 211);
      const vein = Math.abs(noise2(a * 0.93 - 13, b * 0.93 + 4, seed + 307));
      const broken = smooth(-0.32, 0.32, noise2(a * 1.3 + 7, b * 1.3 + 2, seed + 401));
      const fissure = (1 - smooth(0.018, 0.085, vein)) * broken;
      const pits = smooth(0.48, 0.82, fine), mineral = smooth(0.38, 0.8, middle) * smooth(-0.1, 0.5, fine);
      out.height = 0.52 * broad + 0.25 * middle + 0.065 * fine - 0.25 * fissure - 0.07 * pits;
      out.tone = 0.31 * broad + 0.18 * middle + 0.055 * fine - 0.12 * fissure;
      out.cavity = 0.8 * fissure + 0.25 * pits;
      out.accent = mineral;
    } else if (kind === "wood") {
      const drift = noise2(u * 0.45 + 5, v * 0.16, seed + 101) * 0.85 + noise2(u * 0.9, v * 0.31, seed + 211) * 0.2;
      const phase = u * 1.35 + drift, growth = Math.sin(phase * TAU);
      const fiber = noise2(u * 5 + drift * 2, v * 0.5, seed + 307);
      const groove = (1 - smooth(0.025, 0.19, Math.abs(Math.sin(phase * Math.PI)))) * smooth(-0.7, 0.1, noise2(u * 0.6, v * 0.45, seed + 401));
      out.height = 0.22 * broad + 0.14 * growth + 0.035 * fiber - 0.14 * groove;
      out.tone = 0.26 * broad + 0.16 * growth + 0.055 * fiber - 0.12 * groove;
      out.cavity = groove * 0.6;
      out.accent = smooth(0.4, 0.9, growth) * smooth(0.1, 0.6, fiber);
    } else if (kind === "fabric") {
      const thread = Math.max(1.5, scale * 0.23);
      const tx = (x * cs + y * sn) / thread, ty = (-x * sn + y * cs) / thread;
      const warp = Math.sin(fract(tx) * Math.PI), weft = Math.sin(fract(ty) * Math.PI);
      const over = Math.floor(tx) + Math.floor(ty) & 1 ? warp : weft;
      const crossing = (1 - warp) * (1 - weft);
      const nap = noise2(a * 3.1, b * 3.1, seed + 101);
      out.height = 0.22 * broad + 0.075 * over - 0.04 * crossing;
      out.tone = 0.26 * broad + 0.09 * (over - 0.5) + 0.04 * nap;
      out.cavity = crossing * 0.3;
      out.accent = over * 0.18;
    } else if (kind === "metal") {
      const brushed = noise2(u * 6 + warpX * 0.8, v * 0.22, seed + 101);
      const scratchField = Math.abs(noise2(u * 2.8 + warpY * 0.25, v * 0.13, seed + 211));
      const scratch = (1 - smooth(0.012, 0.065, scratchField)) * smooth(0.1, 0.55, noise2(u * 1.2, v * 0.8, seed + 307));
      out.height = 0.18 * broad + 0.055 * brushed - 0.13 * scratch;
      out.tone = 0.22 * broad + 0.08 * brushed - 0.07 * scratch;
      out.cavity = scratch * 0.55;
      out.accent = smooth(0.45, 0.85, brushed) * 0.35;
    } else {
      const middle = noise2(a * 1.6 - 3, b * 1.6 + 6, seed + 101);
      const flowing = Math.abs(Math.sin((u * 0.53 + v * 0.39 + warpX * 0.3 + warpY * 0.3) * Math.PI));
      const vein = (1 - smooth(0.035, 0.16, flowing)) * smooth(-0.3, 0.4, middle);
      const inclusion = smooth(0.48, 0.8, noise2(a * 3.3, b * 3.3, seed + 211));
      out.height = 0.2 * broad + 0.12 * middle + 0.05 * vein;
      out.tone = 0.29 * broad + 0.15 * middle + 0.13 * vein - 0.12 * inclusion;
      out.cavity = inclusion * 0.3;
      out.accent = vein;
    }
  };
}
function createPixelMaterial2D(input = {}) {
  const options = resolveOptions(input), field = materialField(options);
  const ramp = createMaterialRamp2D(options.palette, { thresholds: options.thresholds });
  const lightLength = Math.hypot(...options.light), [lx, ly, lz] = options.light.map((v) => v / lightLength);
  const halfLength = Math.hypot(lx, ly, lz + 1), hx = halfLength ? lx / halfLength : 0;
  const hy = halfLength ? ly / halfLength : 0, hz = halfLength ? (lz + 1) / halfLength : 0;
  const response = KIND_RESPONSE[options.kind], exponent = 10 + 100 * (1 - options.roughness) ** 2;
  const reflection = response.reflection * (1 - options.roughness * 0.65);
  const bevelHeight = Math.min(options.bevel, options.relief * 1.5);
  return {
    options,
    shade(source, edit = {}) {
      const count = checkSprite(source), { w, h } = source;
      checkArray(edit.selection, count, "Material selection");
      checkArray(edit.protectedMask, count, "Protected material mask");
      checkArray(edit.height, count, "Authored height map", true);
      const origin = edit.origin ?? [0, 0];
      if (origin.length !== 2 || !origin.every((v) => Number.isFinite(v) && Math.abs(v) <= 1e9))
        throw new RangeError("Object origin must be two finite native coordinates within \xB11e9");
      const pixels = source.pixels.slice(), mask = { ...source.mask, data: source.mask.data.slice() };
      const channels = copyChannels(source, count), occupied = new Uint8Array(count), editable = new Uint8Array(count);
      let changed = 0;
      for (let i = 0; i < count; i++) {
        occupied[i] = source.mask.data[i] && source.pixels[i] >>> 24 ? 1 : 0;
        editable[i] = occupied[i] && (!edit.selection || edit.selection[i]) && !edit.protectedMask?.[i] ? 1 : 0;
        changed += editable[i];
      }
      if (!changed) return { ...source, pixels, mask, channels };
      const distance = options.bevel ? silhouetteDistance(occupied, w, h) : void 0;
      const heights = new Float32Array(count), sample = { height: 0, tone: 0, cavity: 0, accent: 0 };
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, edge = distance ? clamp(distance[i] / options.bevel) : 1;
        if (distance && !occupied[i]) continue;
        field(x + origin[0] + 0.5, y + origin[1] + 0.5, sample);
        heights[i] = (edit.height?.[i] ?? 0) + sample.height * options.relief * options.detail * Math.sqrt(edge) + bevelHeight * Math.sin(edge * Math.PI * 0.5);
      }
      const outsideSample = { height: 0, tone: 0, cavity: 0, accent: 0 };
      const sampleHeight = (x, y) => {
        if (x >= 0 && y >= 0 && x < w && y < h) return heights[y * w + x];
        if (distance) return 0;
        field(x + origin[0] + 0.5, y + origin[1] + 0.5, outsideSample);
        const authored = edit.height?.[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)] ?? 0;
        return Math.fround(authored + outsideSample.height * options.relief * options.detail);
      };
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!editable[i]) continue;
        const dx = (sampleHeight(x - 1, y) - sampleHeight(x + 1, y)) * 0.5;
        const dy = (sampleHeight(x, y - 1) - sampleHeight(x, y + 1)) * 0.5;
        const length = Math.hypot(dx, dy, 1), nx = dx / length, ny = dy / length, nz = 1 / length;
        const diffuse = Math.max(0, nx * lx + ny * ly + nz * lz);
        const specular = diffuse > 0 ? Math.max(0, nx * hx + ny * hy + nz * hz) ** exponent : 0;
        field(x + origin[0] + 0.5, y + origin[1] + 0.5, sample);
        const edgeWear = distance ? (1 - smooth(0.5, Math.max(1.5, options.bevel * 0.65), distance[i])) * smooth(0.42, 0.88, diffuse) * clamp(0.6 + sample.tone) : 0;
        const tone = options.ambient + (1 - options.ambient) * diffuse * 0.72 + options.detail * (sample.tone - 0.24 * sample.cavity + sample.accent * (0.05 + response.reflection * 0.08) * smooth(0.5, 0.9, diffuse) + response.wear * edgeWear) + reflection * specular;
        pixels[i] = (ramp(tone) & 16777215 | source.pixels[i] & 4278190080) >>> 0;
        channels.material[i] = options.materialId;
        channels.height[i] = heights[i];
        channels.normal[i * 3] = nx;
        channels.normal[i * 3 + 1] = ny;
        channels.normal[i * 3 + 2] = nz;
      }
      return { ...source, pixels, mask, channels };
    }
  };
}

// src/core/pixel-art-analysis.ts
var TOP = 1;
var RIGHT = 2;
var BOTTOM = 4;
var LEFT = 8;
var NOISE = 16;
function validateSprite(source) {
  const count = source.w * source.h;
  if (!Number.isSafeInteger(source.w) || !Number.isSafeInteger(source.h) || source.w < 1 || source.h < 1 || count > 16777216 || !(source.pixels instanceof Uint32Array) || source.pixels.length !== count || source.mask.w !== source.w || source.mask.h !== source.h || !(source.mask.data instanceof Uint8Array) || source.mask.data.length !== count)
    throw new RangeError("Pixel-art analysis requires matching native sprite buffers");
  return count;
}
function withinColor(a, b, tolerance) {
  return Math.abs((a & 255) - (b & 255)) <= tolerance && Math.abs((a >>> 8 & 255) - (b >>> 8 & 255)) <= tolerance && Math.abs((a >>> 16 & 255) - (b >>> 16 & 255)) <= tolerance;
}
function diagnosePixelArt2D(source, options = {}) {
  const n = validateSprite(source), { w, h, pixels } = source;
  const style = options.expectedStyle, protection = options.protected;
  const tolerance = options.colorTolerance ?? 10;
  const minArea = options.minFlatArea ?? 48;
  const minRatio = options.flatRegionRatio ?? 0.12;
  const minRun = options.minStraightRun ?? 12;
  const noiseLimit = options.maxIsolatedColorRatio ?? 0.05;
  const maxIssues = options.maxIssues ?? 128;
  if (style !== void 0 && !["organic", "cel-shaded", "geometric"].includes(style) || protection !== void 0 && protection.length !== n)
    throw new RangeError("Pixel-art expectation and protected mask must match the native raster");
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 255 || !Number.isSafeInteger(minArea) || minArea < 1 || !Number.isFinite(minRatio) || minRatio < 0 || minRatio > 1 || !Number.isSafeInteger(minRun) || minRun < 2 || !Number.isFinite(noiseLimit) || noiseLimit < 0 || noiseLimit > 1 || !Number.isSafeInteger(maxIssues) || maxIssues < 1 || maxIssues > 4096)
    throw new RangeError("Pixel-art thresholds must be finite and within their documented ranges");
  const occupancy = new Uint8Array(n), seen = new Uint8Array(n);
  const boundary = new Uint8Array(n), queue = new Uint32Array(n);
  const heatmap = new Uint8Array(n), issues = [];
  const palette = /* @__PURE__ */ new Set();
  let occupied = 0, analyzed = 0, totalIssues = 0;
  for (let i = 0; i < n; i++) {
    if (!source.mask.data[i] || !(pixels[i] >>> 24)) continue;
    occupied++;
    if (protection?.[i]) occupancy[i] = 1;
    else {
      occupancy[i] = 2;
      analyzed++;
      palette.add(pixels[i] & 16777215);
    }
  }
  const add = (issue) => {
    totalIssues++;
    if (issues.length < maxIssues) issues.push({ confidence: "heuristic", ...issue });
  };
  let largestFlatRegion = 0, nearFlatRegionCount = 0;
  for (let seed = 0; seed < n; seed++) {
    if (occupancy[seed] !== 2 || seen[seed]) continue;
    const color = pixels[seed];
    queue[0] = seed;
    seen[seed] = 1;
    let length = 1;
    let minX = seed % w, maxX = minX, minY = Math.floor(seed / w), maxY = minY;
    let minR = color & 255, maxR = minR, minG = color >>> 8 & 255, maxG = minG;
    let minB = color >>> 16 & 255, maxB = minB;
    const visit = (index) => {
      if (occupancy[index] === 2 && !seen[index] && withinColor(color, pixels[index], tolerance)) {
        seen[index] = 1;
        queue[length++] = index;
      }
    };
    for (let cursor = 0; cursor < length; cursor++) {
      const i = queue[cursor], x = i % w, y = Math.floor(i / w), c = pixels[i];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minR = Math.min(minR, c & 255);
      maxR = Math.max(maxR, c & 255);
      minG = Math.min(minG, c >>> 8 & 255);
      maxG = Math.max(maxG, c >>> 8 & 255);
      minB = Math.min(minB, c >>> 16 & 255);
      maxB = Math.max(maxB, c >>> 16 & 255);
      if (x > 0) visit(i - 1);
      if (x + 1 < w) visit(i + 1);
      if (y > 0) visit(i - w);
      if (y + 1 < h) visit(i + w);
    }
    largestFlatRegion = Math.max(largestFlatRegion, length);
    if (length >= minArea) nearFlatRegionCount++;
    if (style === "organic" && length >= minArea && length / analyzed >= minRatio) {
      add({
        kind: "flat-region",
        x: seed % w,
        y: Math.floor(seed / w),
        area: length,
        bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
        message: "Large connected near-color region; inspect whether the intended material needs more authored value groups.",
        evidence: {
          cells: length,
          ratio: length / analyzed,
          colorTolerance: tolerance,
          maxChannelSpread: Math.max(maxR - minR, maxG - minG, maxB - minB)
        }
      });
      for (let cursor = 0; cursor < length; cursor++) heatmap[queue[cursor]] |= 1;
    }
  }
  let silhouetteCells = 0, interiorCells = 0, isolatedColorCells = 0;
  let noiseMinX = w, noiseMinY = h, noiseMaxX = -1, noiseMaxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (occupancy[i] !== 2) continue;
    let edges = 0;
    if (y === 0 || !occupancy[i - w]) edges |= TOP;
    if (x === w - 1 || !occupancy[i + 1]) edges |= RIGHT;
    if (y === h - 1 || !occupancy[i + w]) edges |= BOTTOM;
    if (x === 0 || !occupancy[i - 1]) edges |= LEFT;
    boundary[i] = edges;
    if (edges) silhouetteCells++;
    if (!x || !y || x === w - 1 || y === h - 1) continue;
    let interior = true, similar = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const j = i + dy * w + dx;
      if (occupancy[j] !== 2) interior = false;
      if (withinColor(pixels[i], pixels[j], tolerance)) similar = true;
    }
    if (!interior) continue;
    interiorCells++;
    if (similar) continue;
    boundary[i] |= NOISE;
    isolatedColorCells++;
    noiseMinX = Math.min(noiseMinX, x);
    noiseMaxX = Math.max(noiseMaxX, x);
    noiseMinY = Math.min(noiseMinY, y);
    noiseMaxY = Math.max(noiseMaxY, y);
  }
  let longestStraightRun = 0;
  const inspectContours = style === "organic" || style === "cel-shaded";
  const scan = (x0, y0, dx, dy, faceMask, direction) => {
    let startX = x0, startY = y0, length = 0, commonFaces = 0;
    const finish = () => {
      if (!length) return;
      longestStraightRun = Math.max(longestStraightRun, length);
      if (!inspectContours || length < minRun) return;
      const endX = startX + (length - 1) * dx, endY = startY + (length - 1) * dy;
      const sides = [
        commonFaces & TOP ? "top" : "",
        commonFaces & RIGHT ? "right" : "",
        commonFaces & BOTTOM ? "bottom" : "",
        commonFaces & LEFT ? "left" : ""
      ].filter(Boolean).join("+");
      add({
        kind: "straight-contour",
        x: startX,
        y: startY,
        area: length,
        bounds: {
          x: Math.min(startX, endX),
          y: Math.min(startY, endY),
          w: Math.abs(endX - startX) + 1,
          h: Math.abs(endY - startY) + 1
        },
        message: "Long straight native-cell contour; inspect whether this edge should be curved, worn or deliberately geometric.",
        evidence: { cells: length, direction, exposedSide: sides }
      });
      for (let k = 0; k < length; k++) heatmap[(startY + k * dy) * w + startX + k * dx] |= 2;
    };
    for (let x = x0, y = y0; x >= 0 && y >= 0 && x < w && y < h; x += dx, y += dy) {
      const faces = boundary[y * w + x] & faceMask;
      if (length && (!faces || !(faces & commonFaces))) {
        finish();
        length = 0;
      }
      if (!faces) continue;
      if (!length) {
        startX = x;
        startY = y;
        commonFaces = faces;
      } else commonFaces &= faces;
      length++;
    }
    finish();
  };
  for (let y = 0; y < h; y++) scan(0, y, 1, 0, TOP | BOTTOM, "horizontal");
  for (let x = 0; x < w; x++) scan(x, 0, 0, 1, LEFT | RIGHT, "vertical");
  for (let x = 0; x < w; x++) scan(x, 0, 1, 1, 15, "diagonal-down");
  for (let y = 1; y < h; y++) scan(0, y, 1, 1, 15, "diagonal-down");
  for (let x = 0; x < w; x++) scan(x, h - 1, 1, -1, 15, "diagonal-up");
  for (let y = 0; y < h - 1; y++) scan(0, y, 1, -1, 15, "diagonal-up");
  const isolatedColorRatio = analyzed ? isolatedColorCells / analyzed : 0;
  if (style !== void 0 && isolatedColorCells >= 4 && isolatedColorRatio > noiseLimit) {
    add({
      kind: "color-noise",
      x: noiseMinX,
      y: noiseMinY,
      area: isolatedColorCells,
      bounds: { x: noiseMinX, y: noiseMinY, w: noiseMaxX - noiseMinX + 1, h: noiseMaxY - noiseMinY + 1 },
      message: "Many isolated interior color cells; inspect cluster readability and protect intentional glints or stippling.",
      evidence: { cells: isolatedColorCells, ratio: isolatedColorRatio, interiorCells, colorTolerance: tolerance }
    });
    for (let i = 0; i < n; i++) if (boundary[i] & NOISE) heatmap[i] |= 4;
  }
  return {
    metrics: {
      occupied,
      analyzed,
      paletteSize: palette.size,
      nearFlatRegionCount,
      largestFlatRegion,
      dominantFlatRegionRatio: analyzed ? largestFlatRegion / analyzed : 0,
      silhouetteCells,
      longestStraightRun,
      interiorCells,
      isolatedColorCells,
      isolatedColorRatio
    },
    issues,
    totalIssues,
    heatmap
  };
}

// src/core/pixel-contour.ts
var MAX_DIMENSION = 4096;
var MAX_COMMANDS = 4096;
var MAX_SEGMENTS = 65536;
var MAX_SCANLINE_CROSSINGS = 8388608;
var MAX_COORDINATE = 1048576;
function rasterSize(w, h) {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > MAX_DIMENSION || h > MAX_DIMENSION)
    throw new RangeError("Contour dimensions must be integers within 1..4096 native cells");
  return w * h;
}
function point(value, label) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every((n) => Number.isFinite(n) && Math.abs(n) <= MAX_COORDINATE))
    throw new RangeError(`${label} must contain two finite coordinates within +/-1048576`);
  return [value[0], value[1]];
}
function rasterizePixelContour2D(w, h, commands, options = {}) {
  const size = rasterSize(w, h), tolerance = options.tolerance ?? 0.125;
  if (!Number.isFinite(tolerance) || tolerance < 1 / 256 || tolerance > 1)
    throw new RangeError("Contour tolerance must be within 1/256..1 native cells");
  if (!Array.isArray(commands) || commands.length > MAX_COMMANDS)
    throw new RangeError("Contour needs an array of at most 4096 commands");
  const starts = Array.from({ length: h }, () => []);
  let segmentCount = 0, crossings = 0, current, first;
  const edge = (a, b) => {
    if (++segmentCount > MAX_SEGMENTS) throw new RangeError("Contour exceeds its 65536 flattened-segment budget");
    if (a[1] === b[1]) return;
    const low = a[1] < b[1] ? a : b, high = a[1] < b[1] ? b : a;
    const start = Math.max(0, Math.ceil(low[1] - 0.5)), end = Math.min(h, Math.ceil(high[1] - 0.5));
    if (start >= end) return;
    crossings += end - start;
    if (crossings > MAX_SCANLINE_CROSSINGS) throw new RangeError("Contour exceeds its scanline-crossing budget");
    const slope = (high[0] - low[0]) / (high[1] - low[1]);
    starts[start].push({ first: start, end, x: low[0] + (start + 0.5 - low[1]) * slope, slope });
  };
  const close = () => {
    if (current && first) edge(current, first);
    current = first = void 0;
  };
  const append = (points) => {
    for (let i = 1; i < points.length; i++) edge(points[i - 1], points[i]);
    current = points[points.length - 1];
  };
  for (const command of commands) {
    if (!command || typeof command !== "object") throw new RangeError("Invalid contour command");
    if (command.kind === "move") {
      const next = point(command.to, "Move");
      close();
      current = first = next;
      continue;
    }
    if (command.kind === "close") {
      if (!current) throw new RangeError("Contour close needs an open subpath");
      close();
      continue;
    }
    if (!current) throw new RangeError("A contour drawing command needs a preceding move");
    switch (command.kind) {
      case "line": {
        const next = point(command.to, "Line");
        edge(current, next);
        current = next;
        break;
      }
      case "quadratic":
        append(quadraticBezier(current, point(command.control, "Quadratic control"), point(command.to, "Quadratic endpoint"), tolerance));
        break;
      case "cubic":
        append(cubicBezier(current, point(command.control1, "Cubic control 1"), point(command.control2, "Cubic control 2"), point(command.to, "Cubic endpoint"), tolerance));
        break;
      default:
        throw new RangeError("Unknown contour command");
    }
  }
  close();
  const data = new Uint8Array(size), active = [], intersections = [];
  for (let y = 0; y < h; y++) {
    let count = 0;
    for (const e of active) if (y < e.end) active[count++] = e;
    active.length = count;
    for (const e of starts[y]) active.push(e);
    intersections.length = 0;
    for (const e of active) intersections.push(e.x + (y - e.first) * e.slope);
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const left = Math.max(0, Math.ceil(intersections[i] - 0.5));
      const right = Math.min(w, Math.ceil(intersections[i + 1] - 0.5));
      if (right > left) data.fill(1, y * w + left, y * w + right);
    }
  }
  return { w, h, data };
}
function createOrganicSilhouette2D(w, h, options = {}) {
  const size = rasterSize(w, h), seed = options.seed ?? 1;
  const inset = options.inset ?? Math.min(1, Math.min(w, h) / 4);
  const irregularity = options.irregularity ?? 0.45, lobes = options.lobes ?? 3;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295)
    throw new RangeError("Organic silhouette seed must be uint32");
  if (!Number.isFinite(inset) || inset < 0 || inset >= Math.min(w, h) / 2)
    throw new RangeError("Organic silhouette inset must leave positive interior radii");
  if (!Number.isFinite(irregularity) || irregularity < 0 || irregularity > 1)
    throw new RangeError("Organic silhouette irregularity must be within 0..1");
  if (!Number.isInteger(lobes) || lobes < 2 || lobes > 12)
    throw new RangeError("Organic silhouette lobes must be an integer within 2..12");
  const data = new Uint8Array(size), cx = w / 2, cy = h / 2, rx = cx - inset, ry = cy - inset;
  const amplitude = 0.35 * irregularity, innerSquared = (1 - amplitude) ** 2;
  const phases = [rand(seed, 0), rand(seed, 1), rand(seed, 2)].map((value) => value * Math.PI * 2);
  for (let y = 0; y < h; y++) {
    const ny = (y + 0.5 - cy) / ry;
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5 - cx) / rx, distanceSquared = nx * nx + ny * ny;
      if (distanceSquared > 1) continue;
      if (distanceSquared <= innerSquared) {
        data[y * w + x] = 1;
        continue;
      }
      const angle = Math.atan2(ny, nx);
      const wave = 0.6 * Math.sin(lobes * angle + phases[0]) + 0.27 * Math.sin((lobes + 1) * angle + phases[1]) + 0.13 * Math.sin((2 * lobes - 1) * angle + phases[2]);
      const radius = 1 - amplitude * (0.5 + 0.5 * wave);
      if (distanceSquared <= radius * radius) data[y * w + x] = 1;
    }
  }
  return { w, h, data };
}

export {
  rasterizePixelContour2D,
  createOrganicSilhouette2D,
  PIXEL_MATERIAL_PALETTES_2D,
  createPixelMaterial2D,
  diagnosePixelArt2D
};
