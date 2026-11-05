// src/render/draw-ir.ts
var DRAW_IR_STRIDE = 128;
var DRAW_IR_ALPHA_LIMIT = 64;
var blendIds = { opaque: 0, alpha: 1, cutout: 2, additive: 3 };
var clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
function point(p) {
  if (p.length !== 3 || !p.every(Number.isFinite)) throw new RangeError("DrawIR points need finite x, y and depth");
}
function compileDrawScene(scene, previous) {
  if (scene.schema !== "poku-draw/v1") throw new RangeError("Unsupported DrawIR schema");
  if (![scene.width, scene.height].every((n) => Number.isSafeInteger(n) && n > 0)) throw new RangeError("Invalid DrawIR dimensions");
  const flat = [];
  for (const c of scene.commands) {
    if (c.op === "ribbon") {
      if (!Number.isFinite(c.width) || c.width <= 0) throw new RangeError("Ribbon width must be positive");
      for (let i = 1; i < c.points.length; i++) flat.push({ op: "segment", from: c.points[i - 1], to: c.points[i], width: c.width, material: c.material });
    } else if (c.op === "mesh") {
      if (c.indices.length % 3) throw new RangeError("Mesh indices must form triangles");
      for (let i = 0; i < c.indices.length; i += 3) {
        const indices = c.indices.slice(i, i + 3);
        if (indices.some((n) => !Number.isInteger(n) || n < 0 || n >= c.vertices.length)) throw new RangeError("Mesh index outside vertices");
        flat.push({ op: "triangle", vertices: indices.map((n) => c.vertices[n]), material: c.material });
      }
    } else flat.push(c);
  }
  if (flat.length > 16384) throw new RangeError("DrawIR primitive budget (16384) exceeded");
  const assetMap = /* @__PURE__ */ new Map();
  let total = 0;
  for (const asset of scene.assets ?? []) {
    if (!asset.id || assetMap.has(asset.id)) throw new RangeError("DrawIR asset IDs must be nonempty and unique");
    if (![asset.width, asset.height].every((n) => Number.isSafeInteger(n) && n > 0)) throw new RangeError("Invalid asset dimensions");
    const size = asset.width * asset.height;
    if (asset.color.length !== size || asset.emission && asset.emission.length !== size * 3) throw new RangeError("DrawIR asset buffer size mismatch");
    assetMap.set(asset.id, { asset, offset: total });
    total += size;
  }
  const assetRevision = JSON.stringify((scene.assets ?? []).map((a) => [a.id, a.revision, a.width, a.height, !!a.emission]));
  let color, emission;
  if (previous?.assetRevision === assetRevision) {
    color = previous.color;
    emission = previous.emission;
  } else {
    color = new Uint32Array(Math.max(1, total));
    emission = new Float32Array(Math.max(3, total * 3));
    for (const { asset, offset } of assetMap.values()) {
      color.set(Array.from(asset.color), offset);
      if (asset.emission) {
        const values = Array.from(asset.emission);
        if (!values.every((n) => Number.isFinite(n) && n >= 0)) throw new RangeError("Asset emission must be finite nonnegative linear RGB");
        emission.set(values, offset * 3);
      }
    }
  }
  const commands = new ArrayBuffer(Math.max(DRAW_IR_STRIDE, flat.length * DRAW_IR_STRIDE)), u = new Uint32Array(commands), f = new Float32Array(commands);
  let alphaPrimitives = 0;
  flat.forEach((c, index) => {
    const i = index * 32, m = c.material, opacity = m.opacity ?? 1, blend = m.blend ?? "alpha", cutoff = m.cutoff ?? 0.5;
    if (!(blend in blendIds) || !Number.isFinite(opacity) || opacity < 0 || opacity > 1 || !Number.isFinite(cutoff) || cutoff < 0 || cutoff > 1 || !Number.isInteger(m.color) || m.color < 0 || m.color > 4294967295) throw new RangeError("Invalid DrawIR material");
    if (m.emission && (m.emission.length !== 3 || !m.emission.every((v) => Number.isFinite(v) && v >= 0))) throw new RangeError("DrawIR emission must be finite nonnegative linear RGB");
    if (m.emissionKind && !["surface", "optical"].includes(m.emissionKind)) throw new RangeError("Unknown emission kind");
    if (blend === "alpha") alphaPrimitives++;
    u[i + 1] = m.color;
    u[i + 2] = blendIds[blend];
    u[i + 3] = m.emissionKind === "optical" ? 1 : 0;
    f[i + 16] = opacity;
    f[i + 17] = cutoff;
    f.set(m.emission ?? [0, 0, 0], i + 20);
    if (c.op === "rect") {
      point(c.origin);
      if (!c.size.every((v) => Number.isFinite(v) && v > 0)) throw new RangeError("Invalid rectangle size");
      u[i] = 0;
      f.set(c.origin, i + 4);
      f[i + 7] = c.size[0];
      f[i + 11] = c.size[1];
    } else if (c.op === "disc") {
      point(c.center);
      if (!(c.radius >= 0) || !Number.isFinite(c.radius)) throw new RangeError("Invalid radius");
      u[i] = 1;
      f.set(c.center, i + 4);
      f[i + 7] = c.radius;
    } else if (c.op === "segment") {
      point(c.from);
      point(c.to);
      if (!(c.width > 0) || !Number.isFinite(c.width)) throw new RangeError("Invalid segment width");
      u[i] = 2;
      f.set(c.from, i + 4);
      f.set(c.to, i + 8);
      f[i + 7] = c.width / 2;
    } else if (c.op === "triangle") {
      c.vertices.forEach(point);
      u[i] = 3;
      c.vertices.forEach((v, k) => f.set(v, i + 4 + k * 4));
    } else if (c.op === "sprite") {
      point(c.origin);
      const entry = assetMap.get(c.asset);
      if (!entry) throw new RangeError(`Missing sprite asset ${c.asset}`);
      const x = c.axisX ?? [1, 0], y = c.axisY ?? [0, 1];
      if (![...x, ...y].every(Number.isFinite) || Math.abs(x[0] * y[1] - x[1] * y[0]) < 1e-8) throw new RangeError("Sprite transform must be finite and invertible");
      const region = c.region ?? { x: 0, y: 0, w: entry.asset.width, h: entry.asset.height };
      if (![region.x, region.y, region.w, region.h].every(Number.isSafeInteger) || region.x < 0 || region.y < 0 || region.w <= 0 || region.h <= 0 || region.x + region.w > entry.asset.width || region.y + region.h > entry.asset.height) throw new RangeError("Sprite region is outside its asset");
      u[i] = 4;
      f.set(c.origin, i + 4);
      f.set(x, i + 8);
      f.set(y, i + 12);
      f[i + 18] = region.w;
      f[i + 19] = region.h;
      u[i + 24] = entry.offset;
      u[i + 25] = entry.asset.width;
      u[i + 26] = region.x;
      u[i + 27] = region.y;
      if (entry.asset.emission) u[i + 3] |= 2;
    } else throw new RangeError("Unknown DrawIR operation");
  });
  if (alphaPrimitives > DRAW_IR_ALPHA_LIMIT) throw new RangeError(`Exact alpha primitive budget (${DRAW_IR_ALPHA_LIMIT}) exceeded; split nonoverlapping scenes or choose explicit cutout/additive materials`);
  return { width: scene.width, height: scene.height, count: flat.length, commands, color, emission, assetRevision, alphaPrimitives };
}
var unpack = (c) => [(c & 255) / 255, (c >>> 8 & 255) / 255, (c >>> 16 & 255) / 255, (c >>> 24) / 255];
function sample(c, index, x, y) {
  const f = new Float32Array(c.commands), u = new Uint32Array(c.commands), i = index * 32, op = u[i];
  const px = f[i + 4], py = f[i + 5];
  let depth = f[i + 6], rgba = unpack(u[i + 1]), assetIndex = -1;
  if (op === 0) {
    if (x < px || y < py || x >= px + f[i + 7] || y >= py + f[i + 11]) return null;
  } else if (op === 1) {
    if ((x - px) ** 2 + (y - py) ** 2 > f[i + 7] ** 2) return null;
  } else if (op === 2) {
    const vx = f[i + 8] - px, vy = f[i + 9] - py, len = vx * vx + vy * vy, t = len ? clamp(((x - px) * vx + (y - py) * vy) / len) : 0;
    if ((x - px - vx * t) ** 2 + (y - py - vy * t) ** 2 > f[i + 7] ** 2) return null;
    depth += (f[i + 10] - depth) * t;
  } else if (op === 3) {
    const ax = f[i + 8] - px, ay = f[i + 9] - py, bx = f[i + 12] - px, by = f[i + 13] - py, det = ax * by - ay * bx;
    if (Math.abs(det) < 1e-8) return null;
    const a2 = ((x - px) * by - (y - py) * bx) / det, b = (ax * (y - py) - ay * (x - px)) / det;
    if (a2 < 0 || b < 0 || a2 + b > 1) return null;
    const vertices = [[px, py], [f[i + 8], f[i + 9]], [f[i + 12], f[i + 13]]], sign = det > 0 ? 1 : -1;
    for (let k = 0; k < 3; k++) {
      const v = vertices[k], next = vertices[(k + 1) % 3], dx = (next[0] - v[0]) * sign, dy = (next[1] - v[1]) * sign, edge = dx * (y - v[1]) - dy * (x - v[0]);
      if (edge === 0 && !(dy < 0 || dy === 0 && dx > 0)) return null;
    }
    depth += (f[i + 10] - depth) * a2 + (f[i + 14] - depth) * b;
  } else {
    const ax = f[i + 8], ay = f[i + 9], bx = f[i + 12], by = f[i + 13], det = ax * by - ay * bx;
    const sx = Math.floor(((x - px) * by - (y - py) * bx) / det), sy = Math.floor((ax * (y - py) - ay * (x - px)) / det);
    if (sx < 0 || sy < 0 || sx >= f[i + 18] || sy >= f[i + 19]) return null;
    assetIndex = u[i + 24] + (sy + u[i + 27]) * u[i + 25] + sx + u[i + 26];
    const src = unpack(c.color[assetIndex]);
    rgba = rgba.map((v, k) => v * src[k]);
  }
  const rawAlpha = rgba[3] * f[i + 16], blend = u[i + 2];
  if (blend === 2 && rawAlpha < f[i + 17] || (blend === 0 || blend === 2) && rawAlpha <= 0) return null;
  const a = blend === 0 || blend === 2 ? 1 : rawAlpha;
  rgba[3] = a;
  const light = [0, 1, 2].map((k) => f[i + 20 + k] * a + (assetIndex >= 0 && u[i + 3] & 2 ? c.emission[assetIndex * 3 + k] * f[i + 16] : 0));
  return { depth: Math.fround(depth), rgba, light, blend, optical: !!(u[i + 3] & 1), order: index };
}
function renderDrawSceneCPU(scene) {
  const c = "schema" in scene ? compileDrawScene(scene) : scene, n = c.width * c.height;
  const out = { w: c.width, h: c.height, color: new Uint32Array(n), light: new Uint32Array(n), hdrLight: new Float32Array(n * 3), depth: new Float32Array(n).fill(-Infinity) };
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const samples = [];
    let opaque = null;
    const optical = [0, 0, 0], additive = [0, 0, 0];
    for (let j = 0; j < c.count; j++) {
      const s = sample(c, j, x + 0.5, y + 0.5);
      if (!s) continue;
      samples.push(s);
      if ((s.blend === 0 || s.blend === 2) && (!opaque || s.depth >= opaque.depth)) opaque = s;
      if (s.optical) s.light.forEach((v, k) => optical[k] += v);
    }
    const rgba = opaque ? [...opaque.rgba] : [0, 0, 0, 0], hdr = opaque && !opaque.optical ? [...opaque.light] : [0, 0, 0];
    const nearest = opaque?.depth ?? -Infinity;
    const transparent = samples.filter((s) => s.blend === 1 && (s.depth > nearest || s.depth === nearest && s.order > (opaque?.order ?? -1))).sort((a, b) => a.depth - b.depth || a.order - b.order);
    for (const s of samples) if (s.blend === 3 && s.depth >= nearest && !s.optical) {
      const transmission = transparent.reduce((t, front) => front.depth > s.depth || front.depth === s.depth && front.order > s.order ? t * (1 - front.rgba[3]) : t, 1);
      s.light.forEach((v, k) => additive[k] += v * transmission);
    }
    for (const s of transparent) {
      const a = s.rgba[3], inv = 1 - a;
      for (let k = 0; k < 3; k++) {
        rgba[k] = s.rgba[k] * a + rgba[k] * inv;
        hdr[k] = (s.optical ? 0 : s.light[k]) + hdr[k] * inv;
      }
      rgba[3] = a + rgba[3] * inv;
    }
    const i = y * c.width + x, alpha = rgba[3];
    const pack = (v) => (Math.round(clamp(v[0]) * 255) | Math.round(clamp(v[1]) * 255) << 8 | Math.round(clamp(v[2]) * 255) << 16 | Math.round(clamp(v[3]) * 255) << 24) >>> 0;
    out.color[i] = pack([alpha ? rgba[0] / alpha : 0, alpha ? rgba[1] / alpha : 0, alpha ? rgba[2] / alpha : 0, alpha]);
    const total = hdr.map((v, k) => v + optical[k] + additive[k]);
    out.hdrLight.set(total, i * 3);
    out.light[i] = pack([...total.map((v) => v <= 31308e-7 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055), total.some((v) => v > 0) ? 1 : 0]);
    out.depth[i] = transparent.length ? Math.max(nearest, transparent[transparent.length - 1].depth) : nearest;
  }
  return out;
}
function serializeDrawScene(scene) {
  compileDrawScene(scene);
  return JSON.stringify({ ...scene, assets: scene.assets?.map((a) => ({ ...a, color: Array.from(a.color), emission: a.emission ? Array.from(a.emission) : void 0 })) }, null, 2);
}
function parseDrawScene(json) {
  const scene = JSON.parse(json);
  compileDrawScene(scene);
  return scene;
}

export {
  compileDrawScene,
  renderDrawSceneCPU,
  serializeDrawScene,
  parseDrawScene
};
