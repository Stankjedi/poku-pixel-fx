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
import {
  ditherPattern2D
} from "./chunk-G6VBW32E.js";

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

// src/core/pixel-surface-maps.ts
var MAX_CELLS = 16777216;
var MAX_RAY_VISITS = 134217728;
var clamp01 = (v) => Math.max(0, Math.min(1, v));
function dimensions(w, h) {
  const n = w * h;
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1 || n > MAX_CELLS)
    throw new RangeError("Surface maps require positive native dimensions and at most 16,777,216 cells");
  return n;
}
function bounded(value, min, max, name, integer = false) {
  if (!Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value))
    throw new RangeError(`${name} must be ${integer ? "an integer" : "finite"} within ${min}..${max}`);
  return value;
}
var horizonCache = /* @__PURE__ */ new Map();
function horizonRays(radius) {
  const cached = horizonCache.get(radius);
  if (cached) return cached;
  const rays = [], round = (v) => Math.sign(v) * Math.round(Math.abs(v));
  for (let direction = 0; direction < 16; direction++) {
    const a = direction * Math.PI / 8, dx = Math.cos(a), dy = Math.sin(a), ray = [];
    let lastX = 0, lastY = 0;
    for (let step = 1; step <= radius; step++) {
      const x = round(dx * step), y = round(dy * step), d2 = x * x + y * y;
      if (x === lastX && y === lastY || d2 > radius * radius) continue;
      ray.push({ x, y, d2 });
      lastX = x;
      lastY = y;
    }
    rays.push(ray);
  }
  horizonCache.set(radius, rays);
  return rays;
}
function limitedSlope(backward, forward) {
  return backward * forward > 0 ? Math.sign(backward) * Math.min(Math.abs(backward), Math.abs(forward)) : 0;
}
function shadowRay(dx, dy, distance) {
  const stepX = Math.sign(dx), stepY = Math.sign(dy);
  const deltaX = dx ? Math.abs(1 / dx) : Infinity, deltaY = dy ? Math.abs(1 / dy) : Infinity;
  let nextX = deltaX * 0.5, nextY = deltaY * 0.5, x = 0, y = 0;
  const cells = [];
  while (Math.min(nextX, nextY) < distance) {
    const enter = Math.min(nextX, nextY);
    const crossX = nextX <= nextY + 1e-12, crossY = nextY <= nextX + 1e-12;
    if (crossX) {
      x += stepX;
      nextX += deltaX;
    }
    if (crossY) {
      y += stepY;
      nextY += deltaY;
    }
    cells.push({ x, y, enter, exit: Math.min(distance, nextX, nextY) });
  }
  return cells;
}
function bakePixelSurfaceLighting2D(w, h, height, options = {}) {
  const n = dimensions(w, h), mask = options.mask;
  if (height.length !== n || mask && mask.length !== n)
    throw new RangeError("Surface height and mask buffers must match native dimensions");
  let occupied = 0;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(height[i]) || !Number.isFinite(Math.fround(height[i])))
      throw new RangeError("Surface heights must contain finite float32 values");
    if (mask && !Number.isFinite(mask[i])) throw new RangeError("Surface mask values must be finite");
    if (!mask || mask[i]) occupied++;
  }
  const ao = bounded(options.ambientOcclusion ?? 1, 0, 1, "Ambient occlusion");
  const radius = bounded(options.occlusionRadius ?? 8, 1, 32, "Occlusion radius", true);
  const strength = bounded(options.castShadow ?? 1, 0, 1, "Cast shadow");
  const distance = bounded(options.shadowDistance ?? 32, 1, 128, "Shadow distance", true);
  const bias = bounded(options.bias ?? 0.02, 0, 16, "Surface visibility bias");
  const light = options.light ?? [-0.6, -0.7, 1];
  if (light.length !== 3 || !light.every(Number.isFinite) || !(Math.hypot(...light) > 0) || !Number.isFinite(Math.hypot(...light)))
    throw new RangeError("Surface light must be a finite nonzero 3-vector");
  const planar = Math.hypot(light[0], light[1]), slope = planar ? light[2] / planar : light[2] > 0 ? Infinity : -Infinity;
  const rays = ao ? horizonRays(radius) : [];
  const shadowCells = strength && planar && Number.isFinite(slope) ? shadowRay(light[0] / planar, light[1] / planar, distance) : [];
  const visits = occupied * (rays.reduce((sum, ray) => sum + ray.length, 0) + shadowCells.length);
  if (visits > MAX_RAY_VISITS)
    throw new RangeError("Surface visibility exceeds 134,217,728 ray visits; reduce the occlusion radius or shadow distance");
  const occlusion = new Float32Array(n).fill(1), shadow = new Float32Array(n).fill(1);
  const needGradient = ao > 0 || shadowCells.length > 0;
  const gradientX = needGradient ? new Float64Array(n) : void 0, gradientY = needGradient ? new Float64Array(n) : void 0;
  if (gradientX && gradientY) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (mask && !mask[i]) continue;
    const center = height[i];
    const left = x > 0 && (!mask || mask[i - 1]), right = x + 1 < w && (!mask || mask[i + 1]);
    const up = y > 0 && (!mask || mask[i - w]), down = y + 1 < h && (!mask || mask[i + w]);
    gradientX[i] = left && right ? limitedSlope(center - height[i - 1], height[i + 1] - center) : right ? height[i + 1] - center : left ? center - height[i - 1] : 0;
    gradientY[i] = up && down ? limitedSlope(center - height[i - w], height[i + w] - center) : down ? height[i + w] - center : up ? center - height[i - w] : 0;
  }
  const rayX = planar ? light[0] / planar : 0, rayY = planar ? light[1] / planar : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (mask && !mask[i]) continue;
    const center = height[i];
    if (ao) {
      const gx = gradientX[i], gy = gradientY[i];
      let blocked = 0;
      for (const ray of rays) {
        let horizon = 0;
        for (const offset of ray) {
          const sx = x + offset.x, sy = y + offset.y;
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) break;
          const j = sy * w + sx;
          if (mask && !mask[j]) continue;
          const elevation = height[j] - center - bias, tangent = gx * offset.x + gy * offset.y;
          const rise = elevation - tangent;
          if (rise <= 0) continue;
          if (offset.d2 + elevation * tangent <= 0) {
            horizon = 1;
            break;
          }
          const amount = rise * rise * offset.d2 / ((offset.d2 + elevation * elevation) * (offset.d2 + tangent * tangent));
          horizon = Math.max(horizon, amount);
        }
        blocked += horizon;
      }
      occlusion[i] = 1 - ao * clamp01(blocked / rays.length);
    }
    if (strength) {
      let blocked = slope === -Infinity;
      if (!blocked) for (const cell of shadowCells) {
        const sx = x + cell.x, sy = y + cell.y;
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) break;
        const j = sy * w + sx;
        if (mask && !mask[j]) continue;
        const gx = gradientX[j], gy = gradientY[j];
        const base = height[j] - center - gx * cell.x - gy * cell.y;
        const relativeSlope = gx * rayX + gy * rayY - slope;
        if (base + relativeSlope * (relativeSlope > 0 ? cell.exit : cell.enter) > bias) {
          blocked = true;
          break;
        }
      }
      if (blocked) shadow[i] = 1 - strength;
    }
  }
  return { w, h, occlusion, shadow };
}
function exportPixelSurfaceMaps2D(source, options = {}) {
  const { w, h, channels } = source, n = dimensions(w, h);
  if (!(source.pixels instanceof Uint32Array) || source.pixels.length !== n || source.mask.w !== w || source.mask.h !== h || !(source.mask.data instanceof Uint8Array) || source.mask.data.length !== n)
    throw new RangeError("Surface map source must have matching native pixel and mask buffers");
  if (!channels || channels.w !== w || channels.h !== h || !(channels.height instanceof Float32Array) || channels.height.length !== n || !(channels.normal instanceof Float32Array) || channels.normal.length !== n * 3 || !channels.height.every(Number.isFinite) || !channels.normal.every(Number.isFinite))
    throw new RangeError("Surface maps need matching authored height and normal channels; RGB is not geometry");
  const convention = options.normalConvention ?? "opengl";
  if (convention !== "opengl" && convention !== "directx") throw new RangeError("Normal convention must be opengl or directx");
  const mask = new Uint8Array(n);
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < n; i++) if (source.mask.data[i] && source.pixels[i] >>> 24) {
    mask[i] = 1;
    low = Math.min(low, channels.height[i]);
    high = Math.max(high, channels.height[i]);
  }
  if (options.heightRange) {
    if (options.heightRange.length !== 2 || !options.heightRange.every(Number.isFinite) || options.heightRange[1] < options.heightRange[0] || !Number.isFinite(options.heightRange[1] - options.heightRange[0]))
      throw new RangeError("Height map range must be two finite heights in ascending order");
    [low, high] = options.heightRange;
  } else if (low === Infinity) low = high = 0;
  const lighting = bakePixelSurfaceLighting2D(w, h, channels.height, { ...options.lighting, mask });
  const normal = new Uint32Array(n), height = new Uint32Array(n), occlusion = new Uint32Array(n), shadow = new Uint32Array(n);
  const gray = (value, alpha) => {
    const byte = Math.round(clamp01(value) * 255);
    return (alpha | byte | byte << 8 | byte << 16) >>> 0;
  };
  for (let i = 0; i < n; i++) if (mask[i]) {
    const j = i * 3, alpha = source.pixels[i] & 4278190080;
    const nx = channels.normal[j], ny = channels.normal[j + 1], nz = channels.normal[j + 2], length = Math.hypot(nx, ny, nz);
    const r = Math.round(clamp01((length ? nx / length : 0) * 0.5 + 0.5) * 255);
    const g = Math.round(clamp01((length ? ny / length : 0) * (convention === "opengl" ? -0.5 : 0.5) + 0.5) * 255);
    const b = Math.round(clamp01((length ? nz / length : 1) * 0.5 + 0.5) * 255);
    normal[i] = (alpha | r | g << 8 | b << 16) >>> 0;
    height[i] = gray(high > low ? (channels.height[i] - low) / (high - low) : 0, alpha);
    occlusion[i] = gray(lighting.occlusion[i], alpha);
    shadow[i] = gray(lighting.shadow[i], alpha);
  }
  const raster = (pixels) => ({ w, h, pixels, mask: { ...source.mask, data: source.mask.data.slice() } });
  return {
    normal: raster(normal),
    height: raster(height),
    occlusion: raster(occlusion),
    shadow: raster(shadow),
    heightRange: [low, high],
    normalConvention: convention,
    lighting
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
  const occlusionRadius = input.occlusionRadius ?? 8, shadowDistance = input.shadowDistance ?? 32;
  if (!Number.isInteger(occlusionRadius) || !Number.isInteger(shadowDistance))
    throw new RangeError("Occlusion radius and shadow distance must be native-cell integers");
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
    grainAngle,
    ambientOcclusion: inRange(input.ambientOcclusion ?? 0, 0, 1, "Material ambient occlusion"),
    occlusionRadius: inRange(occlusionRadius, 1, 32, "Material occlusion radius"),
    castShadow: inRange(input.castShadow ?? 0, 0, 1, "Material cast shadow"),
    shadowDistance: inRange(shadowDistance, 1, 128, "Material shadow distance")
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
      const visibility = options.ambientOcclusion || options.castShadow ? bakePixelSurfaceLighting2D(w, h, heights, {
        mask: occupied,
        light: options.light,
        ambientOcclusion: options.ambientOcclusion,
        occlusionRadius: options.occlusionRadius,
        castShadow: options.castShadow,
        shadowDistance: options.shadowDistance
      }) : void 0;
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
        let tone = options.ambient + (1 - options.ambient) * diffuse * 0.72 + options.detail * (sample.tone - 0.24 * sample.cavity + sample.accent * (0.05 + response.reflection * 0.08) * smooth(0.5, 0.9, diffuse) + response.wear * edgeWear) + reflection * specular;
        if (visibility) {
          const ambient = options.ambient * visibility.occlusion[i], direct = visibility.shadow[i];
          const structure = options.detail * (sample.tone - 0.24 * sample.cavity + sample.accent * (0.05 + response.reflection * 0.08) * smooth(0.5, 0.9, diffuse) + response.wear * edgeWear);
          tone = ambient + (1 - options.ambient) * diffuse * 0.72 * direct + structure * (ambient + (1 - options.ambient) * direct) + reflection * specular * direct;
        }
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
      const nx = (x + 0.5 - cx) / rx, distanceSquared2 = nx * nx + ny * ny;
      if (distanceSquared2 > 1) continue;
      if (distanceSquared2 <= innerSquared) {
        data[y * w + x] = 1;
        continue;
      }
      const angle = Math.atan2(ny, nx);
      const wave = 0.6 * Math.sin(lobes * angle + phases[0]) + 0.27 * Math.sin((lobes + 1) * angle + phases[1]) + 0.13 * Math.sin((2 * lobes - 1) * angle + phases[2]);
      const radius = 1 - amplitude * (0.5 + 0.5 * wave);
      if (distanceSquared2 <= radius * radius) data[y * w + x] = 1;
    }
  }
  return { w, h, data };
}

// src/core/pixel-brush.ts
var MAX_DIMENSION2 = 4096;
var MAX_CELLS2 = MAX_DIMENSION2 * MAX_DIMENSION2;
var MAX_COORDINATE2 = 1048576;
var MAX_POINTS = 65536;
var MAX_SAMPLES = 4194304;
var MAX_STAMP_SPANS = 8388608;
function rasterSize2(w, h) {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > MAX_DIMENSION2 || h > MAX_DIMENSION2)
    throw new RangeError("Pixel brush dimensions must be integers within 1..4096 native cells");
  return w * h;
}
function checkSprite2(source) {
  const count = rasterSize2(source.w, source.h);
  if (!(source.pixels instanceof Uint32Array) || source.pixels.length !== count || source.mask.w !== source.w || source.mask.h !== source.h || !(source.mask.data instanceof Uint8Array) || source.mask.data.length !== count)
    throw new RangeError("Pixel paint requires matching native pixel and silhouette buffers");
  return count;
}
function checkMask(mask, count, label) {
  if (!mask || mask.length !== count) throw new RangeError(`${label} must match the native cell count`);
  if (mask instanceof Uint8Array) return;
  for (let i = 0; i < count; i++) if (!Number.isFinite(mask[i])) throw new RangeError(`${label} must contain finite values`);
}
function coordinate(value) {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_COORDINATE2)
    throw new RangeError("Pixel coordinates must be finite and within +/-1048576");
  return Math.floor(value);
}
function brushOptions(input) {
  const size = input.size ?? 1, tip = input.tip ?? "round", symmetry = input.symmetry ?? "none";
  if (!Number.isInteger(size) || size < 1 || size > 256) throw new RangeError("Pixel brush size must be an integer within 1..256");
  if (tip !== "round" && tip !== "square") throw new RangeError("Unknown pixel brush tip");
  if (!["none", "x", "y", "xy"].includes(symmetry)) throw new RangeError("Unknown pixel brush symmetry");
  return { size, tip, symmetry, pixelPerfect: input.pixelPerfect ?? false };
}
function reflectMask(mask, w, h, symmetry) {
  if (symmetry === "x" || symmetry === "xy") for (let y = 0; y < h; y++) for (let x = 0; x < w / 2; x++) {
    const a = y * w + x, b = y * w + w - 1 - x;
    if (mask[a] || mask[b]) mask[a] = mask[b] = 1;
  }
  if (symmetry === "y" || symmetry === "xy") for (let y = 0; y < h / 2; y++) for (let x = 0; x < w; x++) {
    const a = y * w + x, b = (h - 1 - y) * w + x;
    if (mask[a] || mask[b]) mask[a] = mask[b] = 1;
  }
  return mask;
}
function rasterizePixelBrush2D(w, h, points, input = {}) {
  const count = rasterSize2(w, h), options = brushOptions(input);
  if (!Array.isArray(points) || points.length > MAX_POINTS) throw new RangeError("A pixel stroke supports at most 65536 pointer samples");
  const native = points.map((p) => {
    if (!p || typeof p !== "object") throw new RangeError("Invalid pixel brush point");
    const pressure = p.pressure ?? 1;
    if (!Number.isFinite(pressure) || pressure < 0 || pressure > 1) throw new RangeError("Pixel brush pressure must be within 0..1");
    return { x: coordinate(p.x), y: coordinate(p.y), pressure };
  });
  const mask = new Uint8Array(count);
  if (!native.length) return mask;
  let samples = 0, spans = 0;
  const tips = /* @__PURE__ */ new Map();
  const stamp = (x, y, pressure) => {
    if (!(pressure > 0)) return;
    const size = Math.max(1, Math.round(options.size * pressure));
    let rows = tips.get(size);
    if (!rows) {
      const values = [], low = -Math.floor((size - 1) / 2);
      const center = size % 2 ? 0 : 0.5, radius = size / 2;
      for (let yy = low; yy < low + size; yy++) {
        const half = options.tip === "round" ? Math.sqrt(Math.max(0, radius * radius - (yy - center) ** 2)) : Infinity;
        const left = Math.max(low, Math.ceil(center - half)), right = Math.min(low + size - 1, Math.floor(center + half));
        if (right >= left) values.push([yy, left, right]);
      }
      tips.set(size, rows = values);
    }
    for (const [dy, left, right] of rows) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      const x0 = Math.max(0, x + left), x1 = Math.min(w, x + right + 1);
      if (x0 >= x1) continue;
      if (++spans > MAX_STAMP_SPANS) throw new RangeError("Pixel stroke exceeds its 8388608 clipped brush-span budget");
      mask.fill(1, yy * w + x0, yy * w + x1);
    }
  };
  const clean = options.pixelPerfect && options.size === 1;
  const trace = [];
  let runStart = 0;
  const sample = (x, y, pressure) => {
    if (++samples > MAX_SAMPLES) throw new RangeError("Pixel stroke exceeds its 4194304 interpolated-cell budget");
    if (!clean) {
      stamp(x, y, pressure);
      return;
    }
    if (!(pressure > 0)) {
      runStart = trace.length;
      return;
    }
    const b = trace[trace.length - 1], a = trace.length - runStart > 1 ? trace[trace.length - 2] : void 0;
    if (b && trace.length > runStart && b.x === x && b.y === y) return;
    if (a && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1 && Math.abs(b.x - x) + Math.abs(b.y - y) === 1 && Math.abs(a.x - x) === 1 && Math.abs(a.y - y) === 1) trace.pop();
    trace.push({ x, y });
  };
  const segment = (a, b) => {
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y), xMajor = dx >= dy, steps = Math.max(dx, dy);
    if (!steps) {
      sample(a.x, a.y, Math.max(a.pressure, b.pressure));
      return;
    }
    const increasing = xMajor ? b.x >= a.x : b.y >= a.y;
    const start = increasing ? a : b, end = increasing ? b : a;
    const major = xMajor ? start.x : start.y, minor = xMajor ? start.y : start.x;
    const minorDelta = (xMajor ? end.y : end.x) - minor, sign = Math.sign(minorDelta);
    const pad = Math.ceil(options.size / 2) + 1;
    const first = Math.max(0, -pad - major), last = Math.min(steps, (xMajor ? w : h) - 1 + pad - major);
    if (first > last) {
      runStart = trace.length;
      return;
    }
    const begin = increasing ? first : last, finish = increasing ? last : first, direction = increasing ? 1 : -1;
    for (let k = begin; increasing ? k <= finish : k >= finish; k += direction) {
      const q = minor + sign * Math.floor((Math.abs(minorDelta) * k + steps / 2) / steps);
      const x = xMajor ? major + k : q, y = xMajor ? q : major + k;
      if (x < -pad || y < -pad || x >= w + pad || y >= h + pad) {
        runStart = trace.length;
        continue;
      }
      const t = increasing ? k / steps : 1 - k / steps;
      sample(x, y, a.pressure + (b.pressure - a.pressure) * t);
    }
  };
  if (native.length === 1) sample(native[0].x, native[0].y, native[0].pressure);
  else for (let i = 1; i < native.length; i++) segment(native[i - 1], native[i]);
  if (clean) for (const p of trace) stamp(p.x, p.y, 1);
  return reflectMask(mask, w, h, options.symmetry);
}
function rasterizePixelShape2D(w, h, kind, from, to, input = {}) {
  const count = rasterSize2(w, h), options = brushOptions(input);
  if (!["line", "rectangle", "ellipse"].includes(kind)) throw new RangeError("Unknown native pixel shape");
  if (!from || !to || from.length !== 2 || to.length !== 2) throw new RangeError("Pixel shapes require two coordinate pairs");
  const ax = coordinate(from[0]), ay = coordinate(from[1]), bx = coordinate(to[0]), by = coordinate(to[1]);
  if (kind === "line") return rasterizePixelBrush2D(w, h, [{ x: ax, y: ay }, { x: bx, y: by }], options);
  const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
  const left = Math.max(0, x0), right = Math.min(w - 1, x1), top = Math.max(0, y0), bottom = Math.min(h - 1, y1);
  const mask = new Uint8Array(count), filled = input.filled ?? false;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0 + 1) / 2, ry = (y1 - y0 + 1) / 2;
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    if (kind === "rectangle") {
      if (filled || x - x0 < options.size || x1 - x < options.size || y - y0 < options.size || y1 - y < options.size)
        mask[y * w + x] = 1;
    } else {
      const dx = Math.abs(x - cx), dy = Math.abs(y - cy), nx = dx * dx / (rx * rx), ny = dy * dy / (ry * ry);
      if (nx + ny > 1) continue;
      if (filled || (dx + options.size) ** 2 / (rx * rx) + ny > 1 || nx + (dy + options.size) ** 2 / (ry * ry) > 1)
        mask[y * w + x] = 1;
    }
  }
  return reflectMask(mask, w, h, options.symmetry);
}
function paintPixelMask2D(source, mask, color, options = {}) {
  const count = checkSprite2(source), mode = options.mode ?? "replace";
  checkMask(mask, count, "Paint mask");
  if (options.selection) checkMask(options.selection, count, "Paint selection");
  if (options.protectedMask) checkMask(options.protectedMask, count, "Protected mask");
  if (mode !== "replace" && mode !== "over") throw new RangeError("Unknown pixel paint mode");
  if (color !== null && (!Number.isInteger(color) || color < -2147483648 || color > 4294967295))
    throw new RangeError("Pixel paint color must be a packed 32-bit engine color or null");
  const ink = color === null ? 0 : color >>> 0, sa = ink >>> 24;
  const pixels = source.pixels.slice(), silhouette = source.mask.data.slice();
  for (let i = 0; i < count; i++) {
    if (!mask[i] || options.selection && !options.selection[i] || options.protectedMask?.[i]) continue;
    const before = source.pixels[i], da = source.mask.data[i] ? before >>> 24 : 0;
    if (options.alphaLock && (!da || !sa)) continue;
    if (color === null || mode === "replace") {
      pixels[i] = sa ? options.alphaLock ? (ink & 16777215 | before & 4278190080) >>> 0 : ink : 0;
      silhouette[i] = options.alphaLock ? source.mask.data[i] : pixels[i] >>> 24 ? 1 : 0;
      continue;
    }
    if (!sa) continue;
    if (!da) {
      pixels[i] = ink;
      silhouette[i] = 1;
      continue;
    }
    const alpha = sa * 255 + da * (255 - sa);
    let mixed = (options.alphaLock ? da : Math.round(alpha / 255)) << 24;
    for (let channel = 0; channel < 24; channel += 8) {
      const src = ink >>> channel & 255, dst = before >>> channel & 255;
      const value = options.alphaLock ? (src * sa + dst * (255 - sa)) / 255 : (src * sa * 255 + dst * da * (255 - sa)) / alpha;
      mixed |= Math.round(value) << channel;
    }
    pixels[i] = mixed >>> 0;
    silhouette[i] = options.alphaLock ? source.mask.data[i] : 1;
  }
  return { ...source, pixels, mask: { ...source.mask, data: silhouette } };
}
function selectPixelRegion2D(source, point2, options = {}) {
  const count = checkSprite2(source), tolerance = options.tolerance ?? 0, connectivity = options.connectivity ?? 4;
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 255) throw new RangeError("Selection tolerance must be within 0..255");
  if (connectivity !== 4 && connectivity !== 8) throw new RangeError("Selection connectivity must be 4 or 8");
  if (options.selection) checkMask(options.selection, count, "Region constraint");
  const x = coordinate(point2.x), y = coordinate(point2.y), mask = new Uint8Array(count), { w, h } = source;
  if (x < 0 || y < 0 || x >= w || y >= h) return mask;
  const seed = y * w + x, reference = source.pixels[seed];
  const referenceAlpha = source.mask.data[seed] ? reference >>> 24 : 0;
  if (!referenceAlpha && !options.includeTransparent || options.selection && !options.selection[seed]) return mask;
  const matches = (i) => {
    if (options.selection && !options.selection[i]) return false;
    const color = source.pixels[i], alpha = source.mask.data[i] ? color >>> 24 : 0;
    if (!referenceAlpha) return alpha === 0;
    if (!alpha || options.matchAlpha && Math.abs(alpha - referenceAlpha) > tolerance) return false;
    return Math.abs((color & 255) - (reference & 255)) <= tolerance && Math.abs((color >>> 8 & 255) - (reference >>> 8 & 255)) <= tolerance && Math.abs((color >>> 16 & 255) - (reference >>> 16 & 255)) <= tolerance;
  };
  if (options.contiguous === false) {
    for (let i = 0; i < count; i++) if (matches(i)) mask[i] = 1;
    return mask;
  }
  const queue = new Uint32Array(count);
  let head = 0, tail = 1;
  queue[0] = seed;
  mask[seed] = 1;
  const enqueue = (i) => {
    if (!mask[i] && matches(i)) {
      mask[i] = 1;
      queue[tail++] = i;
    }
  };
  while (head < tail) {
    const i = queue[head++], xx = i % w, yy = Math.floor(i / w);
    if (xx) enqueue(i - 1);
    if (xx + 1 < w) enqueue(i + 1);
    if (yy) enqueue(i - w);
    if (yy + 1 < h) enqueue(i + w);
    if (connectivity === 8) {
      if (xx && yy) enqueue(i - w - 1);
      if (xx + 1 < w && yy) enqueue(i - w + 1);
      if (xx && yy + 1 < h) enqueue(i + w - 1);
      if (xx + 1 < w && yy + 1 < h) enqueue(i + w + 1);
    }
  }
  return mask;
}
function distanceLine2(f, out, sites, boundaries, length) {
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
    out[q] = (q - sites[k]) ** 2 + f[sites[k]];
  }
}
function resizePixelSelection2D(w, h, mask, radius) {
  const count = rasterSize2(w, h);
  checkMask(mask, count, "Selection");
  if (!Number.isInteger(radius) || Math.abs(radius) > MAX_DIMENSION2) throw new RangeError("Selection radius must be an integer within -4096..4096");
  const out = Uint8Array.from(mask, (v) => v ? 1 : 0);
  if (!radius || !out.some(Boolean) || radius > 0 && out.every(Boolean)) return out;
  const erosion = radius < 0, far = (w + h + 2) ** 2;
  const size = Math.max(w, h) + 2, f = new Float64Array(size), d = new Float64Array(size);
  const sites = new Int32Array(size), boundaries = new Float64Array(size + 1), horizontal = new Uint32Array(count);
  for (let y = 0; y < h; y++) {
    f[0] = f[w + 1] = erosion ? 0 : far;
    for (let x = 0; x < w; x++) f[x + 1] = !!mask[y * w + x] === !erosion ? 0 : far;
    distanceLine2(f, d, sites, boundaries, w + 2);
    for (let x = 0; x < w; x++) horizontal[y * w + x] = d[x + 1];
  }
  const squared = radius * radius;
  for (let x = 0; x < w; x++) {
    f[0] = f[h + 1] = erosion ? 0 : far;
    for (let y = 0; y < h; y++) f[y + 1] = horizontal[y * w + x];
    distanceLine2(f, d, sites, boundaries, h + 2);
    for (let y = 0; y < h; y++) out[y * w + x] = Number(erosion ? !!mask[y * w + x] && d[y + 1] > squared : d[y + 1] <= squared);
  }
  return out;
}

// src/core/pixel-palette.ts
var LINEAR = Float64Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
var MAX_EXACT_COLORS = 8192;
var HISTOGRAM_BINS = 32 ** 3;
var MAX_MAPPING_CACHE = 8192;
function opaqueColor(value) {
  if (typeof value === "string") {
    if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value))
      throw new RangeError("Pixel palette colors must be #rgb or #rrggbb");
    return hex(value) >>> 0;
  }
  if (!Number.isInteger(value) || value < -2147483648 || value > 4294967295 || value >>> 24 !== 255)
    throw new RangeError("Packed pixel palette colors must be opaque ABGR integers");
  return value >>> 0;
}
function countInRange(value, minimum, maximum, name) {
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new RangeError(`${name} must be an integer within ${minimum}..${maximum}`);
  return value;
}
function validateRegion(source, region) {
  const { w, h } = source, count = w * h;
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1 || count > 16777216 || !(source.pixels instanceof Uint32Array) || source.pixels.length !== count || source.mask.w !== w || source.mask.h !== h || !(source.mask.data instanceof Uint8Array) || source.mask.data.length !== count)
    throw new RangeError("Pixel palette tools need matching native pixel and silhouette buffers");
  for (const [name, mask] of [["Selection", region.selection], ["Protected mask", region.protectedMask]]) {
    if (mask === void 0) continue;
    if (mask.length !== count) throw new RangeError(`${name} must match native raster dimensions`);
    for (let i = 0; i < count; i++) if (!Number.isFinite(mask[i]))
      throw new RangeError(`${name} must contain finite values`);
  }
  return count;
}
function linearRGB(color) {
  return [LINEAR[color & 255], LINEAR[color >>> 8 & 255], LINEAR[color >>> 16 & 255]];
}
function linearToLab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
}
function colorToLab(color) {
  return linearToLab(LINEAR[color & 255], LINEAR[color >>> 8 & 255], LINEAR[color >>> 16 & 255]);
}
function labToLinear(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
}
var distanceSquared = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
function inGamut(rgb) {
  return rgb.every((value) => value >= -1e-7 && value <= 1 + 1e-7);
}
function encodeChannel(linear) {
  const value = Math.max(0, Math.min(1, linear));
  return Math.round(255 * (value <= 31308e-7 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055));
}
function labToColor(lab) {
  const [L, a, b] = lab;
  let rgb = labToLinear(L, a, b);
  if (!inGamut(rgb)) {
    let low = 0, high = 1;
    for (let step = 0; step < 20; step++) {
      const middle = (low + high) / 2;
      if (inGamut(labToLinear(L, a * middle, b * middle))) low = middle;
      else high = middle;
    }
    rgb = labToLinear(L, a * low, b * low);
  }
  return (4278190080 | encodeChannel(rgb[2]) << 16 | encodeChannel(rgb[1]) << 8 | encodeChannel(rgb[0])) >>> 0;
}
function samplesFrom(source, region) {
  let exact = /* @__PURE__ */ new Map();
  let weight, red;
  let green, blue;
  const addBin = (color, alpha) => {
    const r = color & 255, g = color >>> 8 & 255, b = color >>> 16 & 255;
    const bin = r >>> 3 | g >>> 3 << 5 | b >>> 3 << 10;
    weight[bin] += alpha;
    red[bin] += r * alpha;
    green[bin] += g * alpha;
    blue[bin] += b * alpha;
  };
  for (let i = 0; i < source.pixels.length; i++) {
    const packed = source.pixels[i], alpha = packed >>> 24;
    if (!alpha || !source.mask.data[i] || region.selection && !region.selection[i] || region.protectedMask?.[i]) continue;
    const color = (packed | 4278190080) >>> 0;
    if (exact) {
      const previous = exact.get(color);
      if (previous !== void 0) {
        exact.set(color, previous + alpha);
        continue;
      }
      if (exact.size < MAX_EXACT_COLORS) {
        exact.set(color, alpha);
        continue;
      }
      weight = new Float64Array(HISTOGRAM_BINS);
      red = new Float64Array(HISTOGRAM_BINS);
      green = new Float64Array(HISTOGRAM_BINS);
      blue = new Float64Array(HISTOGRAM_BINS);
      for (const [entry, coverage] of exact) addBin(entry, coverage);
      exact = void 0;
    }
    addBin(color, alpha);
  }
  if (exact) return [...exact].sort((a, b) => a[0] - b[0]).map(([color, weight2]) => ({ color, weight: weight2, lab: colorToLab(color) }));
  const samples = [];
  for (let bin = 0; bin < HISTOGRAM_BINS; bin++) {
    const coverage = weight[bin];
    if (!coverage) continue;
    const color = (4278190080 | Math.round(blue[bin] / coverage) << 16 | Math.round(green[bin] / coverage) << 8 | Math.round(red[bin] / coverage)) >>> 0;
    samples.push({ color, weight: coverage, lab: colorToLab(color) });
  }
  return samples;
}
function sortByLightness(colors) {
  return colors.map((color) => ({ color, lab: colorToLab(color) })).sort((a, b) => a.lab[0] - b.lab[0] || a.color - b.color).map((entry) => entry.color);
}
function extractPixelPalette2D(source, options = {}) {
  validateRegion(source, options);
  const colors = countInRange(options.colors ?? 16, 1, 256, "Pixel palette size");
  const iterations = countInRange(options.iterations ?? 4, 1, 16, "Palette refinement passes");
  if (options.locked !== void 0 && !Array.isArray(options.locked))
    throw new RangeError("Locked pixel palette colors must be an array");
  const locked = Array.from(new Set((options.locked ?? []).map(opaqueColor)));
  if (locked.length > colors) throw new RangeError("Locked colors exceed the requested palette size");
  if (locked.length === colors) return locked;
  const samples = samplesFrom(source, options), used = new Set(locked);
  if (!samples.length) return locked;
  const unpinned = samples.filter((sample) => !used.has(sample.color));
  if (unpinned.length + locked.length <= colors)
    return [...locked, ...sortByLightness(unpinned.map((sample) => sample.color))];
  const centers = locked.map(colorToLab);
  if (!centers.length) {
    let total = 0, L = 0, a = 0, b = 0;
    for (const sample of samples) {
      total += sample.weight;
      L += sample.lab[0] * sample.weight;
      a += sample.lab[1] * sample.weight;
      b += sample.lab[2] * sample.weight;
    }
    centers.push([L / total, a / total, b / total]);
  }
  const nearest = new Float64Array(samples.length).fill(Infinity);
  const includeCenter = (center) => {
    for (let i = 0; i < samples.length; i++)
      nearest[i] = Math.min(nearest[i], distanceSquared(samples[i].lab, center));
  };
  for (const center of centers) includeCenter(center);
  while (centers.length < colors) {
    let best = -1, error = 0;
    for (let i = 0; i < samples.length; i++) {
      const candidate = nearest[i] * samples[i].weight;
      if (candidate > error) {
        error = candidate;
        best = i;
      }
    }
    if (best < 0 || error <= 1e-20) break;
    const center = [...samples[best].lab];
    centers.push(center);
    includeCenter(center);
  }
  const totals = new Float64Array(centers.length * 4);
  for (let iteration = 0; iteration < iterations; iteration++) {
    totals.fill(0);
    for (const sample of samples) {
      let best = 0, error = Infinity;
      for (let i = 0; i < centers.length; i++) {
        const candidate = distanceSquared(sample.lab, centers[i]);
        if (candidate < error) {
          error = candidate;
          best = i;
        }
      }
      const offset = best * 4;
      totals[offset] += sample.weight;
      for (let channel = 0; channel < 3; channel++) totals[offset + channel + 1] += sample.lab[channel] * sample.weight;
    }
    let movement = 0;
    for (let i = locked.length; i < centers.length; i++) {
      const offset = i * 4, total = totals[offset];
      if (!total) continue;
      const next = [totals[offset + 1] / total, totals[offset + 2] / total, totals[offset + 3] / total];
      movement = Math.max(movement, distanceSquared(centers[i], next));
      centers[i] = next;
    }
    if (movement < 1e-14) break;
  }
  const additions = [];
  for (let i = locked.length; i < centers.length; i++) {
    const color = labToColor(centers[i]);
    if (!used.has(color)) {
      used.add(color);
      additions.push(color);
    }
  }
  return [...locked, ...sortByLightness(additions)];
}
function createPixelPaletteMapper2D(palette, input = {}) {
  if (!Array.isArray(palette) || !palette.length || palette.length > 256)
    throw new RangeError("Pixel palette mapping needs 1..256 colors");
  const colors = Object.freeze(Array.from(palette, opaqueColor)), dither = input.dither ?? "none", strength = input.strength ?? 1;
  if (!["none", "bayer4", "bayer8"].includes(dither)) throw new RangeError("Unknown pixel palette dither");
  if (!Number.isFinite(strength) || strength < 0 || strength > 1)
    throw new RangeError("Pixel palette dither strength must be within 0..1");
  const options = Object.freeze({ palette: colors, dither, strength });
  const exact = /* @__PURE__ */ new Map();
  colors.forEach((color, index) => {
    if (!exact.has(color)) exact.set(color, index);
  });
  const labs = colors.map(colorToLab), linear = colors.map(linearRGB), cache = /* @__PURE__ */ new Map();
  const pattern = dither === "none" ? void 0 : ditherPattern2D(dither === "bayer8" ? "dispersed8" : "bayer4");
  const mixture = (color) => {
    const key = (color | 4278190080) >>> 0, known = exact.get(key);
    if (known !== void 0) return { a: known, b: known, amount: 0 };
    const hit = cache.get(key);
    if (hit) return hit;
    const target = colorToLab(key);
    let nearest = 0, bestScore = Infinity;
    for (let i = 0; i < colors.length; i++) {
      const error = distanceSquared(target, labs[i]);
      if (error < bestScore) {
        bestScore = error;
        nearest = i;
      }
    }
    let result = { a: nearest, b: nearest, amount: 0 };
    if (pattern && strength > 0) {
      const q = linearRGB(key), base = linear[nearest];
      for (let partner = 0; partner < colors.length; partner++) {
        if (partner === nearest) continue;
        const other = linear[partner], dr = other[0] - base[0], dg = other[1] - base[1], db = other[2] - base[2];
        const length = 0.2126 * dr * dr + 0.7152 * dg * dg + 0.0722 * db * db;
        if (length < 1e-20) continue;
        const t = Math.max(0, Math.min(1, (0.2126 * (q[0] - base[0]) * dr + 0.7152 * (q[1] - base[1]) * dg + 0.0722 * (q[2] - base[2]) * db) / length));
        if (t <= 0 || t >= 1) continue;
        const mixed = linearToLab(base[0] + dr * t, base[1] + dg * t, base[2] + db * t);
        const score = distanceSquared(target, mixed) + 0.04 * distanceSquared(labs[nearest], labs[partner]) * t * (1 - t);
        if (score < bestScore - 1e-16) {
          bestScore = score;
          result = { a: nearest, b: partner, amount: t * strength };
        }
      }
    }
    if (cache.size < MAX_MAPPING_CACHE) cache.set(key, result);
    return result;
  };
  return {
    options,
    palette: colors,
    remap(source, region = {}) {
      const count = validateRegion(source, region), origin = region.origin ?? [0, 0];
      if (origin.length !== 2 || !origin.every((value) => Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER - Math.max(source.w, source.h)))
        throw new RangeError("Pixel palette origin must be a finite two-vector with exact native-cell increments");
      const pixels = source.pixels.slice(), mask = { ...source.mask, data: source.mask.data.slice() };
      const size = pattern?.size ?? 1, levels = size * size;
      const ox = Math.floor(origin[0]), oy = Math.floor(origin[1]);
      for (let i = 0; i < count; i++) {
        const color = source.pixels[i], alpha = color >>> 24;
        if (!alpha || !source.mask.data[i] || region.selection && !region.selection[i] || region.protectedMask?.[i]) continue;
        const mix = mixture(color);
        let index = mix.a;
        if (pattern && mix.amount > 0) {
          const x = (i % source.w + ox) % size, y = (Math.floor(i / source.w) + oy) % size;
          const threshold = (pattern.values[(y + size) % size * size + (x + size) % size] + 0.5) / levels;
          if (mix.amount > threshold) index = mix.b;
        }
        pixels[i] = (colors[index] & 16777215 | alpha << 24) >>> 0;
      }
      return { ...source, pixels, mask };
    }
  };
}
function createPixelPaletteRamp2D(options) {
  const count = countInRange(options.colors ?? 12, 2, 256, "Pixel ramp size");
  const shadow = opaqueColor(options.shadow), highlight = opaqueColor(options.highlight);
  const middle = options.midtone === void 0 ? void 0 : opaqueColor(options.midtone);
  const midpoint = options.midpoint ?? 0.5;
  if (!Number.isFinite(midpoint) || midpoint <= 0 || midpoint >= 1)
    throw new RangeError("Pixel ramp midpoint must be strictly inside 0..1");
  const interpolate = (start, end) => {
    const a = colorToLab(start), b = colorToLab(end), ca = Math.hypot(a[1], a[2]), cb = Math.hypot(b[1], b[2]);
    let ha = Math.atan2(a[2], a[1]), hb = Math.atan2(b[2], b[1]);
    if (ca < 1e-6) ha = hb;
    if (cb < 1e-6) hb = ha;
    const arc = Math.atan2(Math.sin(hb - ha), Math.cos(hb - ha));
    return (t) => {
      if (t <= 0) return start;
      if (t >= 1) return end;
      const L = a[0] + (b[0] - a[0]) * t, C = ca + (cb - ca) * t, hue = ha + arc * t;
      return labToColor([L, C * Math.cos(hue), C * Math.sin(hue)]);
    };
  };
  const first = interpolate(shadow, middle ?? highlight), last = middle === void 0 ? first : interpolate(middle, highlight);
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    if (middle === void 0) return first(t);
    return t <= midpoint ? first(t / midpoint) : last((t - midpoint) / (1 - midpoint));
  });
}

export {
  rasterizePixelContour2D,
  createOrganicSilhouette2D,
  exportPixelSurfaceMaps2D,
  PIXEL_MATERIAL_PALETTES_2D,
  createPixelMaterial2D,
  diagnosePixelArt2D,
  rasterizePixelBrush2D,
  rasterizePixelShape2D,
  paintPixelMask2D,
  selectPixelRegion2D,
  resizePixelSelection2D,
  extractPixelPalette2D,
  createPixelPaletteMapper2D,
  createPixelPaletteRamp2D
};
