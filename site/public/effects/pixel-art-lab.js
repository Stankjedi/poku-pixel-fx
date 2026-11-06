import {
  encodeRGBAPNG
} from "./chunks/chunk-OHTBDYQJ.js";
import {
  PIXEL_MATERIAL_PALETTES_2D,
  combinePixelSelections2D,
  createOrganicSilhouette2D,
  createPixelMaterial2D,
  createPixelPaletteMapper2D,
  createPixelPaletteRamp2D,
  createPixelRelighter2D,
  diagnosePixelArt2D,
  exportPixelSurfaceMaps2D,
  extractPixelAnimationPalette2D,
  extractPixelPalette2D,
  paintPixelMask2D,
  pixelSelectionBounds2D,
  rasterizePixelBrush2D,
  rasterizePixelContour2D,
  rasterizePixelLasso2D,
  rasterizePixelShape2D,
  resizePixelSelection2D,
  selectPixelRegion2D,
  shadePixelMask2D,
  transformPixelSelection2D,
  validatePixelSelectionTransformOptions2D
} from "./chunks/chunk-7OMNYR2P.js";
import {
  hex
} from "./chunks/chunk-MBWWV6CB.js";
import "./chunks/chunk-G6VBW32E.js";
import "./chunks/chunk-WSFCRVEQ.js";

// src/examples/pixel-art-study.ts
function createPixelArtStudy2D(shape = "stone-path", seed = 41, organic = true) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295) throw new RangeError("Pixel art study seed must be uint32");
  if (typeof organic !== "boolean") throw new TypeError("Pixel art study organic mode must be boolean");
  if (!["stone-path", "boulder", "blade", "cloth", "crystal"].includes(shape)) throw new RangeError("Unknown pixel art study shape");
  const w = 192, h = 112, pixels = new Uint32Array(w * h), data = new Uint8Array(w * h), height = new Float32Array(w * h);
  const add = (mask2, ox, oy, tint, elevation) => {
    const color = hex(tint);
    for (let y = 0; y < mask2.h; y++) for (let x = 0; x < mask2.w; x++) {
      if (!mask2.data[y * mask2.w + x] || ox + x < 0 || ox + x >= w || oy + y < 0 || oy + y >= h) continue;
      const i = (oy + y) * w + ox + x;
      pixels[i] = color;
      data[i] = 1;
      height[i] = elevation(x, y);
    }
  };
  const rock = (x, y, rw, rh, id) => {
    const commands = [];
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7;
      commands.push({ kind: i ? "line" : "move", to: [rw / 2 + (rw / 2 - 2) * Math.cos(a), rh / 2 + (rh / 2 - 2) * Math.sin(a)] });
    }
    commands.push({ kind: "close" });
    const mask2 = organic ? createOrganicSilhouette2D(rw, rh, { seed: seed + id * 157 >>> 0, inset: 2, irregularity: 0.48, lobes: 5 }) : rasterizePixelContour2D(rw, rh, commands);
    add(mask2, x, y, ["#435563", "#4a5b67", "#3e505e", "#4b5966"][id % 4], (px, py) => {
      const u = (px + 0.5 - rw / 2) / (rw / 2), v = (py + 0.5 - rh / 2) / (rh / 2);
      return Math.sqrt(Math.max(0, 1 - u * u * 0.85 - v * v * 0.92)) * Math.min(17, rh * 0.36);
    });
  };
  if (shape === "stone-path") {
    rock(1, 16, 57, 39, 0);
    rock(54, 12, 67, 43, 1);
    rock(117, 17, 72, 39, 2);
    rock(-6, 51, 49, 41, 3);
    rock(39, 49, 73, 47, 4);
    rock(110, 52, 79, 46, 5);
  } else if (shape === "boulder") rock(24, 13, 143, 86, 2);
  else {
    const paths = {
      blade: [
        { kind: "move", to: [24, 80] },
        { kind: "line", to: [137, 27] },
        { kind: "quadratic", control: [158, 17], to: [177, 15] },
        { kind: "quadratic", control: [164, 35], to: [142, 48] },
        { kind: "line", to: [40, 94] },
        { kind: "quadratic", control: [29, 93], to: [24, 80] },
        { kind: "close" }
      ],
      cloth: [
        { kind: "move", to: [25, 20] },
        { kind: "cubic", control1: [77, 6], control2: [112, 33], to: [167, 18] },
        { kind: "line", to: [161, 87] },
        { kind: "cubic", control1: [112, 103], control2: [73, 80], to: [30, 96] },
        { kind: "quadratic", control: [35, 56], to: [25, 20] },
        { kind: "close" }
      ],
      crystal: [
        { kind: "move", to: [96, 8] },
        { kind: "line", to: [145, 41] },
        { kind: "line", to: [137, 82] },
        { kind: "line", to: [93, 105] },
        { kind: "line", to: [49, 79] },
        { kind: "line", to: [46, 42] },
        { kind: "close" }
      ]
    };
    const mask2 = rasterizePixelContour2D(w, h, paths[shape]);
    add(mask2, 0, 0, "#4a5b67", (x, y) => shape === "cloth" ? 4 + 6 * Math.sin(x / 23 + Math.sin(y / 29) * 0.7) + 0.02 * (h - y) : shape === "blade" ? Math.max(0, 7 - Math.abs(y - (95 - x * 0.43)) * 0.7) : Math.max(0, 24 - Math.abs(x - 96) * 0.48 - Math.abs(y - 57) * 0.15));
  }
  return { sprite: { w, h, pixels, mask: { w, h, data } }, height };
}

// src/authoring/pixel-art-project.ts
var MAX_CELLS = 1048576;
var MAX_LAYERS = 32;
var MAX_LAYER_CELLS = 16777216;
var MAX_JSON_BYTES = 64 * 1024 * 1024;
function rasterSize(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_CELLS)
    throw new RangeError("Pixel art projects need positive native dimensions and at most 1,048,576 cells");
  return width * height;
}
function pixelArtLayerLimit2D(width, height) {
  return Math.min(MAX_LAYERS, Math.floor(MAX_LAYER_CELLS / rasterSize(width, height)));
}
function name(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 160;
}
function mask(value, size, label) {
  if (value === void 0) return void 0;
  if (!Array.isArray(value) || value.length !== size)
    throw new RangeError(`${label} must have one binary value per native cell`);
  for (const v of value) if (v !== 0 && v !== 1)
    throw new RangeError(`${label} must have one binary value per native cell`);
  return value.slice();
}
function validatePixelArtProject2D(input2) {
  if (!input2 || typeof input2 !== "object") throw new TypeError("Expected a pixel art project");
  const p = input2;
  if (p.schema !== "poku-pixel-art/v1" || !name(p.name)) throw new RangeError("Invalid pixel art project identity");
  const n = rasterSize(p.width, p.height);
  if (!Array.isArray(p.pixels) || p.pixels.length !== n)
    throw new RangeError("Pixel art pixels must be packed unsigned ABGR values matching the native size");
  for (const c of p.pixels) if (!Number.isInteger(c) || c < 0 || c > 4294967295)
    throw new RangeError("Pixel art pixels must be packed unsigned ABGR values matching the native size");
  const sourceMask = mask(p.mask, n, "Source silhouette");
  if (!Array.isArray(p.layers) || p.layers.length > pixelArtLayerLimit2D(p.width, p.height))
    throw new RangeError("Pixel art material layer budget exceeded");
  const layers = Array.from(p.layers, (layer) => {
    if (!layer || !name(layer.name) || !layer.material || typeof layer.material !== "object")
      throw new RangeError("Material layers need a name and material settings");
    const material = createPixelMaterial2D(layer.material).options;
    if (layer.origin !== void 0 && (!Array.isArray(layer.origin) || layer.origin.length !== 2 || !Array.from(layer.origin).every((value) => Number.isFinite(value) && Math.abs(value) <= 1e9)))
      throw new RangeError("Material layer origin needs two finite native coordinates within \xB11e9");
    if (layer.height !== void 0 && (!Array.isArray(layer.height) || layer.height.length !== n || !Array.from(layer.height).every((value) => Number.isFinite(value) && Number.isFinite(Math.fround(value)))))
      throw new RangeError("Authored height must have one finite value per native cell");
    return {
      name: layer.name,
      material: structuredClone(material),
      ...layer.selection !== void 0 ? { selection: mask(layer.selection, n, "Material selection") } : {},
      ...layer.protectedMask !== void 0 ? { protectedMask: mask(layer.protectedMask, n, "Protected selection") } : {},
      ...layer.origin !== void 0 ? { origin: [...layer.origin] } : {},
      ...layer.height !== void 0 ? { height: layer.height.slice() } : {}
    };
  });
  return {
    schema: p.schema,
    name: p.name,
    width: p.width,
    height: p.height,
    pixels: p.pixels.slice(),
    ...sourceMask ? { mask: sourceMask } : {},
    layers
  };
}
function createPixelArtProject2D(source, projectName = "Native material study") {
  const n = rasterSize(source.w, source.h);
  if (source.pixels.length !== n || source.mask.w !== source.w || source.mask.h !== source.h || source.mask.data.length !== n)
    throw new RangeError("Source sprite pixels and silhouette must match");
  return validatePixelArtProject2D({
    schema: "poku-pixel-art/v1",
    name: projectName,
    width: source.w,
    height: source.h,
    pixels: Array.from(source.pixels, (c) => c >>> 0),
    mask: Array.from(source.mask.data, (value) => value ? 1 : 0),
    layers: []
  });
}

// src/authoring/pixel-art-document.ts
var MAX_BYTES = 64 * 1024 * 1024;
var validName = (value) => typeof value === "string" && value.length > 0 && value.length <= 160;
function cells(width, height) {
  pixelArtLayerLimit2D(width, height);
  return width * height;
}
function values(input2, n, label, valid) {
  if (!Array.isArray(input2) || input2.length !== n || !Array.from(input2).every(valid)) throw new RangeError(`${label} must have ${n} valid native values`);
  return input2.slice();
}
function binary(input2, n, label) {
  return input2 === void 0 ? void 0 : values(input2, n, label, (v) => v === 0 || v === 1);
}
var packed = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
var float = (v) => Number.isFinite(v) && Number.isFinite(Math.fround(v));
function origin(input2) {
  if (input2 === void 0) return void 0;
  if (!Array.isArray(input2) || input2.length !== 2 || !Array.from(input2).every((v) => Number.isFinite(v) && Math.abs(v) <= 1e9)) throw new RangeError("Origin needs two finite coordinates within \xB11e9");
  return [...input2];
}
function identity(layer) {
  if (!validName(layer.id) || !validName(layer.name) || layer.visible !== void 0 && typeof layer.visible !== "boolean" || layer.locked !== void 0 && typeof layer.locked !== "boolean") throw new RangeError("Every layer needs an ID, name and boolean visibility/lock");
  return { id: layer.id, name: layer.name, ...layer.visible !== void 0 ? { visible: layer.visible } : {}, ...layer.locked !== void 0 ? { locked: layer.locked } : {} };
}
function optionalMasks(layer, n) {
  return {
    ...layer.selection !== void 0 ? { selection: binary(layer.selection, n, "Selection") } : {},
    ...layer.protectedMask !== void 0 ? { protectedMask: binary(layer.protectedMask, n, "Protection") } : {}
  };
}
function upgradePixelArtProject2D(project2) {
  const p = validatePixelArtProject2D(project2);
  return { ...p, schema: "poku-pixel-art/v2", layers: p.layers.map((layer, i) => ({ ...layer, id: `material-${i + 1}`, kind: "material" })) };
}
function validatePixelArtDocument2D(input2) {
  if (!input2 || typeof input2 !== "object") throw new TypeError("Expected a pixel art document");
  if (input2.schema === "poku-pixel-art/v1") return upgradePixelArtProject2D(input2);
  const p = input2;
  if (p.schema !== "poku-pixel-art/v2" || !validName(p.name)) throw new RangeError("Invalid pixel art document identity");
  const n = cells(p.width, p.height), pixels = values(p.pixels, n, "Source pixels", packed), sourceMask = binary(p.mask, n, "Source mask");
  if (!Array.isArray(p.layers) || p.layers.length > pixelArtLayerLimit2D(p.width, p.height)) throw new RangeError("Pixel art layer budget exceeded");
  const ids = /* @__PURE__ */ new Set();
  const layers = Array.from(p.layers, (layer) => {
    if (!layer || typeof layer !== "object") throw new RangeError("Invalid pixel art layer");
    const common = identity(layer);
    if (ids.has(common.id)) throw new RangeError("Layer IDs must be unique");
    ids.add(common.id);
    if (layer.kind === "paint") {
      if (!Array.isArray(layer.indices) || layer.indices.length > n) throw new RangeError("Paint indices must fit the raster");
      let previous = -1;
      for (const i of layer.indices) {
        if (!Number.isInteger(i) || i <= previous || i >= n) throw new RangeError("Paint indices must be unique, sorted and inside the raster");
        previous = i;
      }
      if (layer.opacity !== void 0 && (!Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1)) throw new RangeError("Layer opacity must be within 0..1");
      return { ...common, kind: "paint", indices: layer.indices.slice(), pixels: values(layer.pixels, layer.indices.length, "Paint pixels", packed), ...layer.opacity !== void 0 ? { opacity: layer.opacity } : {} };
    }
    const masks = optionalMasks(layer, n);
    if (layer.kind === "transform") {
      const t = layer.transform;
      if (!t || typeof t !== "object" || !Array.isArray(layer.selection)) throw new RangeError("Transform layers need a selection and grid transform");
      const transform = validatePixelSelectionTransformOptions2D(t);
      return { ...common, kind: "transform", ...masks, selection: masks.selection, transform };
    }
    if (layer.kind === "relight") {
      if (!layer.lighting || typeof layer.lighting !== "object") throw new RangeError("Relight layers need lighting options");
      return { ...common, kind: "relight", lighting: structuredClone(createPixelRelighter2D(layer.lighting).options), ...masks };
    }
    const objectOrigin = origin(layer.origin);
    if (layer.kind === "palette") {
      const options = createPixelPaletteMapper2D(layer.palette, { dither: layer.dither, strength: layer.strength }).options;
      return { ...common, kind: "palette", palette: [...options.palette], dither: options.dither, strength: options.strength, ...masks, ...objectOrigin ? { origin: objectOrigin } : {} };
    }
    if (layer.kind !== "material" || !layer.material || typeof layer.material !== "object") throw new RangeError("Unknown pixel art layer kind");
    return {
      ...common,
      kind: "material",
      material: structuredClone(createPixelMaterial2D(layer.material).options),
      ...masks,
      ...objectOrigin ? { origin: objectOrigin } : {},
      ...layer.height !== void 0 ? { height: values(layer.height, n, "Authored height", float) } : {}
    };
  });
  let channels;
  if (p.channels !== void 0) {
    if (!p.channels || typeof p.channels !== "object") throw new RangeError("Invalid source material channels");
    channels = {
      material: values(p.channels.material, n, "Material IDs", (v) => Number.isInteger(v) && v >= 0 && v <= 65535),
      height: values(p.channels.height, n, "Source height", float),
      normal: values(p.channels.normal, n * 3, "Source normals", float)
    };
  }
  if (p.activeLayerId !== void 0 && !ids.has(p.activeLayerId)) throw new RangeError("Active layer must exist in the document");
  return {
    schema: "poku-pixel-art/v2",
    name: p.name,
    width: p.width,
    height: p.height,
    pixels,
    ...sourceMask ? { mask: sourceMask } : {},
    layers,
    ...channels ? { channels } : {},
    ...optionalMasks(p, n),
    ...p.authoredHeight !== void 0 ? { authoredHeight: values(p.authoredHeight, n, "Document height", float) } : {},
    ...p.activeLayerId !== void 0 ? { activeLayerId: p.activeLayerId } : {}
  };
}
function createPixelArtDocument2D(source, name2 = "Pixel artwork") {
  const document2 = upgradePixelArtProject2D(createPixelArtProject2D(source, name2));
  if (source.channels && (source.channels.w !== source.w || source.channels.h !== source.h)) throw new RangeError("Source geometry must match the native raster");
  if (source.channels) document2.channels = { material: Array.from(source.channels.material), height: Array.from(source.channels.height), normal: Array.from(source.channels.normal) };
  return validatePixelArtDocument2D(document2);
}
function createBlankPixelArtDocument2D(width, height, name2 = "Untitled pixel artwork") {
  if (!validName(name2)) throw new RangeError("Invalid pixel art document name");
  return { schema: "poku-pixel-art/v2", name: name2, width, height, pixels: new Array(cells(width, height)).fill(0), layers: [] };
}
function sourceRaster(p) {
  return {
    w: p.width,
    h: p.height,
    pixels: Uint32Array.from(p.pixels),
    mask: { w: p.width, h: p.height, data: p.mask ? Uint8Array.from(p.mask) : Uint8Array.from(p.pixels, (c) => c >>> 24 ? 1 : 0) },
    ...p.channels ? { channels: { w: p.width, h: p.height, material: Uint16Array.from(p.channels.material), height: Float32Array.from(p.channels.height), normal: Float32Array.from(p.channels.normal) } } : {}
  };
}
function replacement(a, b, t) {
  if (t === 1) return b;
  if (t === 0) return a;
  const aa = a >>> 24, ba = b >>> 24, alpha = aa * (1 - t) + ba * t, roundedAlpha = Math.round(alpha);
  if (!roundedAlpha) return 0;
  let c = roundedAlpha << 24 >>> 0;
  for (const shift of [0, 8, 16]) c |= Math.round(((a >>> shift & 255) * aa * (1 - t) + (b >>> shift & 255) * ba * t) / alpha) << shift;
  return c >>> 0;
}
function paintRaster(out, layer) {
  const t = layer.opacity ?? 1;
  if (!t) return out;
  const pixels = out.pixels.slice(), mask2 = { ...out.mask, data: out.mask.data.slice() };
  const channels = out.channels ? { ...out.channels, material: out.channels.material.slice(), height: out.channels.height.slice(), normal: out.channels.normal.slice() } : void 0;
  for (let j = 0; j < layer.indices.length; j++) {
    const i = layer.indices[j], before = mask2.data[i] && pixels[i] >>> 24;
    pixels[i] = replacement(mask2.data[i] ? pixels[i] : 0, layer.pixels[j], t);
    mask2.data[i] = pixels[i] >>> 24 ? 1 : 0;
    if (channels && (!before || !mask2.data[i])) {
      channels.material[i] = 0;
      channels.height[i] = 0;
      channels.normal.set([0, 0, 1], i * 3);
    }
  }
  return { ...out, pixels, mask: mask2, ...channels ? { channels } : {} };
}
function renderPixelArtAuthoredHeight2D(document2) {
  const p = validatePixelArtDocument2D(document2);
  if (!p.authoredHeight) return void 0;
  let out = sourceRaster(p);
  const n = p.width * p.height;
  out.channels = {
    w: p.width,
    h: p.height,
    material: out.channels?.material ?? new Uint16Array(n),
    height: Float32Array.from(p.authoredHeight),
    normal: out.channels?.normal ?? new Float32Array(n * 3)
  };
  for (const layer of p.layers) {
    if (layer.visible === false) continue;
    if (layer.kind === "transform") out = transformPixelSelection2D(out, layer.selection, { ...layer.transform, protectedMask: layer.protectedMask }).sprite;
    else if (layer.kind === "paint") out = paintRaster(out, layer);
  }
  return out.channels.height;
}
function renderPixelArtDocument2D(document2) {
  const p = validatePixelArtDocument2D(document2);
  let out = sourceRaster(p);
  for (const layer of p.layers) {
    if (layer.visible === false) continue;
    if (layer.kind === "material") {
      out = createPixelMaterial2D(layer.material).shade(out, layer);
      continue;
    }
    if (layer.kind === "palette") {
      out = createPixelPaletteMapper2D(layer.palette, layer).remap(out, layer);
      continue;
    }
    if (layer.kind === "transform") {
      out = transformPixelSelection2D(out, layer.selection, { ...layer.transform, protectedMask: layer.protectedMask }).sprite;
      continue;
    }
    if (layer.kind === "relight") {
      out = createPixelRelighter2D(layer.lighting).shade(out, layer);
      continue;
    }
    out = paintRaster(out, layer);
  }
  return out;
}
function writePixelArtPaintLayer2D(document2, source, touched, layerId) {
  const n = cells(document2.width, document2.height);
  if (source.w !== document2.width || source.h !== document2.height || !(source.pixels instanceof Uint32Array) || source.pixels.length !== n || source.mask.w !== source.w || source.mask.h !== source.h || !(source.mask.data instanceof Uint8Array) || source.mask.data.length !== n || touched.length !== n) throw new RangeError("Paint output and stroke mask must match the document");
  if (!(touched instanceof Uint8Array)) {
    for (let i = 0; i < n; i++) if (!Number.isFinite(touched[i])) throw new RangeError("Stroke mask must contain finite native values");
  }
  const index = layerId === void 0 ? -1 : document2.layers.findIndex((layer2) => layer2.id === layerId);
  if (layerId !== void 0 && index < 0) throw new RangeError("Paint layer does not exist");
  const existing = index < 0 ? void 0 : document2.layers[index];
  if (existing && (existing.kind !== "paint" || existing.locked || existing.visible === false)) throw new RangeError("Choose an unlocked visible paint layer");
  const changes = /* @__PURE__ */ new Map();
  if (existing?.kind === "paint") existing.indices.forEach((i, j) => changes.set(i, existing.pixels[j]));
  let changed2 = false;
  for (let i = 0; i < n; i++) if (touched[i]) {
    const c = source.mask.data[i] ? source.pixels[i] : 0;
    if (changes.get(i) !== c) changed2 = true;
    changes.set(i, c >>> 0);
  }
  if (!changed2) return document2;
  if (!existing && document2.layers.length >= pixelArtLayerLimit2D(document2.width, document2.height)) throw new RangeError("Pixel art layer budget exceeded");
  const id = existing?.id ?? nextPixelArtLayerId2D(document2, "paint"), indices = [...changes.keys()].sort((a, b) => a - b);
  const layer = { ...existing ?? { id, name: `Paint ${document2.layers.length + 1}` }, kind: "paint", indices, pixels: indices.map((i) => changes.get(i)) };
  const layers = document2.layers.slice();
  if (index < 0) layers.push(layer);
  else layers[index] = layer;
  return { ...document2, layers, activeLayerId: id };
}
function nextPixelArtLayerId2D(document2, prefix) {
  let i = 1;
  while (document2.layers.some((layer) => layer.id === `${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
}
function flattenPixelArtDocument2D(document2) {
  const p = validatePixelArtDocument2D(document2), out = createPixelArtDocument2D(renderPixelArtDocument2D(p), p.name);
  const authoredHeight2 = renderPixelArtAuthoredHeight2D(p);
  return { ...out, ...optionalMasks(p, p.width * p.height), ...authoredHeight2 ? { authoredHeight: Array.from(authoredHeight2) } : {} };
}
function checkBytes(json) {
  if (json.length > MAX_BYTES || new TextEncoder().encode(json).byteLength > MAX_BYTES) throw new RangeError("Pixel art document exceeds 64 MiB");
}
function serializePixelArtDocument2D(document2) {
  const json = JSON.stringify(validatePixelArtDocument2D(document2));
  checkBytes(json);
  return json;
}
function parsePixelArtDocument2D(json) {
  if (typeof json !== "string") throw new TypeError("Pixel art document JSON must be a string");
  checkBytes(json);
  return validatePixelArtDocument2D(JSON.parse(json));
}
var PixelArtDocumentHistory2D = class {
  constructor(document2, limit = 64, byteLimit = 32 * 1024 * 1024) {
    this.limit = limit;
    this.byteLimit = byteLimit;
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(byteLimit) || byteLimit < 1) throw new RangeError("History limits must be positive integers");
    this.current = serializePixelArtDocument2D(document2);
  }
  past = [];
  future = [];
  current;
  bytes = 0;
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  get value() {
    return parsePixelArtDocument2D(this.current);
  }
  commit(document2) {
    const next = serializePixelArtDocument2D(document2);
    if (next === this.current) return false;
    this.past.push(this.current);
    this.bytes += this.current.length * 2;
    this.current = next;
    this.future = [];
    this.bytes = this.past.reduce((sum, value) => sum + value.length * 2, 0);
    while (this.past.length && (this.past.length > this.limit || this.bytes > this.byteLimit)) this.bytes -= this.past.shift().length * 2;
    return true;
  }
  undo() {
    const previous = this.past.pop();
    if (previous !== void 0) {
      this.bytes -= previous.length * 2;
      this.future.push(this.current);
      this.current = previous;
      this.trimFuture();
    }
    return this.value;
  }
  redo() {
    const next = this.future.pop();
    if (next !== void 0) {
      this.past.push(this.current);
      this.bytes += this.current.length * 2;
      this.current = next;
      while (this.past.length && (this.past.length > this.limit || this.bytes > this.byteLimit)) this.bytes -= this.past.shift().length * 2;
    }
    return this.value;
  }
  trimFuture() {
    let size = this.bytes + this.future.reduce((sum, value) => sum + value.length * 2, 0);
    while (this.future.length && size > this.byteLimit) size -= this.future.shift().length * 2;
  }
};

// gallery/pixel-art-selection.ts
var el = (id) => document.getElementById(id);
var field = (id) => el(id);
var select = (id) => el(id);
var button = (id) => el(id);
var selectionDrawingTools = /* @__PURE__ */ new Set(["select-rectangle", "select-ellipse", "lasso", "move"]);
var sameMask = (a, b, count) => {
  if (a && a.length !== count || b && b.length !== count) return false;
  for (let i = 0; i < count; i++) if (!!a?.[i] !== !!b?.[i]) return false;
  return true;
};
var translationOnly = (transform) => !transform.copy && !transform.flipX && !transform.flipY && (transform.quarterTurns ?? 0) === 0;
function translationBase(doc, selected, transform) {
  const layer = doc.layers.at(-1), boundary = transform.boundary ?? "reject";
  if (!translationOnly(transform) || boundary === "clip" || layer?.kind !== "transform" || doc.activeLayerId !== layer.id || layer.locked || layer.visible === false || layer.transform.copy || (layer.transform.boundary ?? "reject") !== boundary || !sameMask(layer.protectedMask, transform.protectedMask, selected.length)) return;
  const { activeLayerId, ...input2 } = doc;
  const source = renderPixelArtDocument2D({ ...input2, layers: doc.layers.slice(0, -1) });
  const prior = transformPixelSelection2D(source, layer.selection, { ...layer.transform, protectedMask: layer.protectedMask });
  if (!sameMask(prior.selection, selected, selected.length)) return;
  return { layer, source };
}
function translatedLayer(base, transform) {
  if (!base || !translationOnly(transform) || (transform.boundary ?? "reject") !== (base.layer.transform.boundary ?? "reject") || !sameMask(base.layer.protectedMask, transform.protectedMask, base.source.pixels.length)) return;
  const previous = base.layer.transform.offset ?? [0, 0], step = transform.offset ?? [0, 0];
  const offset = [previous[0] + step[0], previous[1] + step[1]];
  if (transform.boundary === "wrap") {
    offset[0] %= base.source.w;
    offset[1] %= base.source.h;
  }
  if (!offset.every((v) => Number.isSafeInteger(v) && Math.abs(v) <= 1048576)) return;
  const layer = { ...base.layer, transform: { ...base.layer.transform, offset } };
  try {
    const result = transformPixelSelection2D(base.source, layer.selection, { ...layer.transform, protectedMask: layer.protectedMask });
    return { layer, result };
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
  }
}
function installPixelArtSelection(host, finishPaint) {
  const canvas2 = el("result");
  const overlay = document.createElement("canvas");
  overlay.className = "selection-overlay";
  overlay.setAttribute("aria-hidden", "true");
  canvas2.parentElement.append(overlay);
  const attempt2 = (fn) => {
    try {
      fn();
    } catch (error) {
      host.status(String(error instanceof Error ? error.message : error), true);
    }
  };
  let temporary;
  let drag;
  let queued2;
  const point2 = (event) => {
    const rect = canvas2.getBoundingClientRect();
    return { x: Math.floor((event.clientX - rect.left) * canvas2.width / rect.width), y: Math.floor((event.clientY - rect.top) * canvas2.height / rect.height) };
  };
  const options = () => ({
    copy: field("transform-copy").checked,
    boundary: select("transform-boundary").value,
    protectedMask: host.protection()
  });
  function commitTransform(doc, selected, transform2, result, combinedLayer) {
    const combined = combinedLayer && result ? { layer: combinedLayer, result } : translatedLayer(translationBase(doc, selected, transform2), transform2);
    const changed2 = combined?.result ?? result ?? transformPixelSelection2D(renderPixelArtDocument2D(doc), selected, transform2);
    if (!changed2.touched.some(Boolean)) {
      host.preview(void 0);
      host.setSelection(changed2.selection);
      return;
    }
    const { protectedMask: protectedMask2, ...grid } = transform2, id = combined?.layer.id ?? nextPixelArtLayerId2D(doc, "transform");
    const layers = combined ? [...doc.layers.slice(0, -1), combined.layer] : [...doc.layers, {
      kind: "transform",
      id,
      name: grid.copy ? "\uC120\uD0DD \uBCF5\uC81C / \uBCC0\uD615" : "\uC120\uD0DD \uC774\uB3D9 / \uBCC0\uD615",
      selection: Array.from(selected),
      ...protectedMask2 ? { protectedMask: Array.from(protectedMask2) } : {},
      transform: grid
    }];
    try {
      host.commit({
        ...doc,
        activeLayerId: id,
        selection: Array.from(changed2.selection),
        layers
      });
    } finally {
      host.preview(void 0);
    }
    host.setSelection(changed2.selection);
    if (changed2.clipped) host.status(`\uBA85\uC2DC\uD55C \uC790\uB974\uAE30 \uC124\uC815\uC73C\uB85C ${changed2.clipped}\uAC1C\uC758 \uC120\uD0DD \uC140\uC774 \uCE94\uBC84\uC2A4 \uBC16\uC5D0\uC11C \uC798\uB838\uC2B5\uB2C8\uB2E4.`);
  }
  function transform(extra) {
    finishPaint();
    finish();
    const doc = host.outputDocument(), selected = host.selection();
    if (!selected.some(Boolean)) throw new Error("\uBA3C\uC800 \uC62E\uAE30\uAC70\uB098 \uBCC0\uD615\uD560 \uC601\uC5ED\uC744 \uC120\uD0DD\uD558\uC138\uC694.");
    commitTransform(doc, selected, { ...options(), ...extra });
  }
  const bind = (id, operation) => {
    button(id).onclick = () => attempt2(() => transform(operation()));
  };
  bind("transform-apply", () => {
    const offset = [Number(field("transform-x").value), Number(field("transform-y").value)];
    if (!offset.every((v) => Number.isSafeInteger(v) && Math.abs(v) <= 1048576)) throw new Error("\uC774\uB3D9\uB7C9\uC740 \uC815\uC218 \uD53D\uC140\uB85C \uC785\uB825\uD558\uC138\uC694.");
    return { offset };
  });
  bind("flip-selection-x", () => ({ flipX: true }));
  bind("flip-selection-y", () => ({ flipY: true }));
  bind("rotate-selection-left", () => ({ quarterTurns: 3 }));
  bind("rotate-selection-right", () => ({ quarterTurns: 1 }));
  function preview() {
    queued2 = void 0;
    if (!drag) return;
    const d = drag, a = d.points[0], b = d.points.at(-1);
    if (d.tool === "move") {
      d.offset = [b.x - a.x, b.y - a.y];
      try {
        const transform2 = { ...options(), offset: d.offset }, combined = translatedLayer(d.translation, transform2);
        d.candidate = combined?.result ?? transformPixelSelection2D(d.source, d.original, transform2);
        d.combinedLayer = combined?.layer;
        d.error = void 0;
        temporary = d.candidate.selection;
        host.preview(d.candidate.sprite);
      } catch (error) {
        d.candidate = void 0;
        d.combinedLayer = void 0;
        d.error = error instanceof Error ? error.message : String(error);
        temporary = d.original;
        host.preview(d.source);
        host.status(d.error, true);
      }
    } else {
      const mask2 = d.tool === "lasso" ? rasterizePixelLasso2D(d.source.w, d.source.h, d.points) : rasterizePixelShape2D(d.source.w, d.source.h, d.tool === "select-rectangle" ? "rectangle" : "ellipse", [a.x, a.y], [b.x, b.y], { filled: true });
      temporary = combinePixelSelections2D(d.original, mask2, d.operation);
      sync();
    }
  }
  function cancel() {
    if (queued2 !== void 0) cancelAnimationFrame(queued2);
    queued2 = void 0;
    const previous = drag;
    drag = void 0;
    temporary = void 0;
    if (previous && canvas2.hasPointerCapture(previous.pointer)) canvas2.releasePointerCapture(previous.pointer);
    host.preview(void 0);
    sync();
  }
  function finish() {
    if (!drag) return;
    if (queued2 !== void 0) cancelAnimationFrame(queued2);
    preview();
    const completed = drag;
    drag = void 0;
    if (canvas2.hasPointerCapture(completed.pointer)) canvas2.releasePointerCapture(completed.pointer);
    const selected = temporary;
    temporary = void 0;
    if (completed.tool === "move") {
      if (completed.candidate && completed.offset.some(Boolean)) commitTransform(completed.document, completed.original, { ...options(), offset: completed.offset }, completed.candidate, completed.combinedLayer);
      else {
        host.preview(void 0);
        if (completed.error) host.status(completed.error, true);
      }
    } else if (selected) host.setSelection(selected);
    sync();
  }
  canvas2.addEventListener("pointerdown", (event) => attempt2(() => {
    const tool = select("paint-tool").value;
    if (event.button !== 0 || !selectionDrawingTools.has(tool)) return;
    event.preventDefault();
    finishPaint();
    const p = point2(event), doc = host.outputDocument(), source = renderPixelArtDocument2D(doc);
    if (p.x < 0 || p.y < 0 || p.x >= source.w || p.y >= source.h) return;
    if (tool === "move" && !host.selection().some(Boolean)) throw new Error("\uBA3C\uC800 \uC120\uD0DD \uB3C4\uAD6C\uB85C \uC774\uB3D9\uD560 \uC601\uC5ED\uC744 \uC9C0\uC815\uD558\uC138\uC694.");
    const operation = event.shiftKey && event.altKey ? "intersect" : event.shiftKey ? "add" : event.altKey ? "subtract" : select("selection-mode").value;
    const original = host.selection().slice();
    drag = {
      pointer: event.pointerId,
      tool,
      points: [p],
      original,
      document: doc,
      source,
      operation,
      offset: [0, 0],
      translation: tool === "move" ? translationBase(doc, original, options()) : void 0
    };
    canvas2.setPointerCapture(event.pointerId);
    preview();
  }));
  canvas2.addEventListener("pointermove", (event) => attempt2(() => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const samples = event.getCoalescedEvents?.();
    for (const sample of samples?.length ? samples : [event]) {
      const p = point2(sample), last = drag.points.at(-1);
      if (p.x !== last.x || p.y !== last.y) drag.points.push(p);
    }
    if (queued2 === void 0) queued2 = requestAnimationFrame(() => attempt2(preview));
  }));
  canvas2.addEventListener("pointerup", (event) => attempt2(() => {
    if (!drag || drag.pointer !== event.pointerId) return;
    drag.points.push(point2(event));
    finish();
  }));
  canvas2.addEventListener("pointercancel", () => {
    if (drag) cancel();
  });
  canvas2.addEventListener("lostpointercapture", () => {
    if (drag) cancel();
  });
  select("paint-tool").addEventListener("change", () => {
    if (drag) cancel();
  });
  window.addEventListener("keydown", (event) => {
    if (event.target.closest('input,select,textarea,[contenteditable="true"]')) return;
    if (event.key === "Escape" && drag) {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const shortcut = { m: "select-rectangle", q: "lasso", v: "move" };
    if (shortcut[event.key.toLowerCase()]) {
      event.preventDefault();
      select("paint-tool").value = shortcut[event.key.toLowerCase()];
      select("paint-tool").dispatchEvent(new Event("change"));
      host.refresh();
    }
    if (select("paint-tool").value !== "move") return;
    const step = event.shiftKey ? 10 : 1;
    const shifts = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (shifts[event.key]) {
      event.preventDefault();
      attempt2(() => transform({ offset: shifts[event.key] }));
    }
  });
  for (const id of [
    "save-png",
    "save-project",
    "undo",
    "redo",
    "new-canvas",
    "open-project",
    "import-png",
    "add-frame",
    "duplicate-frame",
    "save-animation-sheet",
    "save-normal",
    "save-height",
    "save-occlusion",
    "save-shadow",
    "save-map-info",
    "apply-material",
    "apply-palette",
    "apply-relight",
    "flatten-layers",
    "new-paint-layer"
  ])
    button(id).addEventListener("click", () => attempt2(finish), { capture: true });
  function sync() {
    const mask2 = temporary ?? host.selection(), w = canvas2.width, h = canvas2.height;
    overlay.width = w;
    overlay.height = h;
    overlay.style.width = canvas2.style.width;
    overlay.style.height = canvas2.style.height;
    const ctx = overlay.getContext("2d"), image = ctx.createImageData(w, h);
    const active2 = selectionDrawingTools.has(select("paint-tool").value) || field("paint-in-selection").checked;
    if (active2 && mask2.length === w * h) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask2[i] || x > 0 && x + 1 < w && y > 0 && y + 1 < h && mask2[i - 1] && mask2[i + 1] && mask2[i - w] && mask2[i + w]) continue;
      image.data.set((x + y) % 4 < 2 ? [226, 255, 206, 210] : [24, 45, 34, 210], i * 4);
    }
    ctx.putImageData(image, 0, 0);
    const bounds = pixelSelectionBounds2D(w, h, mask2);
    el("transform-info").textContent = bounds ? "\uC120\uD0DD\uD55C \uC140\uACFC \uB192\uC774\xB7\uBC95\uC120\uC744 \uD568\uAED8 \uBCC0\uD615\uD569\uB2C8\uB2E4. Shift + \uBC29\uD5A5\uD0A4\uB294 10px \uC774\uB3D9\uC785\uB2C8\uB2E4." : "\uC624\uB978\uCABD \uADF8\uB9BC\uC5D0\uC11C \uC0AC\uAC01\xB7\uD0C0\uC6D0\xB7\uC62C\uAC00\uBBF8\uB85C \uC601\uC5ED\uC744 \uC120\uD0DD\uD558\uC138\uC694.";
    for (const id of ["transform-apply", "flip-selection-x", "flip-selection-y", "rotate-selection-left", "rotate-selection-right"]) button(id).disabled = !bounds;
  }
  return { sync, finish, cancel };
}

// gallery/pixel-art-workbench.ts
var el2 = (id) => document.getElementById(id);
var field2 = (id) => el2(id);
var choice = (id) => el2(id);
var btn = (id) => el2(id);
var integer = (id, low, high) => {
  const value = Number(field2(id).value);
  if (!Number.isInteger(value) || value < low || value > high) throw new RangeError(`${low}~${high} \uBC94\uC704\uC758 \uC815\uC218\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.`);
  return value;
};
var cssColor = (c) => "#" + [c & 255, c >>> 8 & 255, c >>> 16 & 255].map((v) => v.toString(16).padStart(2, "0")).join("");
function installPixelArtWorkbench(host) {
  const result = el2("result");
  const attempt2 = (fn) => {
    try {
      fn();
    } catch (error) {
      host.status(error instanceof Error ? error.message : String(error), true);
    }
  };
  let rowsKey = "", authoredPalette, strokeFrame, stroke;
  const point2 = (event) => {
    const r = result.getBoundingClientRect();
    return {
      x: Math.floor((event.clientX - r.left) * result.width / r.width),
      y: Math.floor((event.clientY - r.top) * result.height / r.height),
      ...event.pointerType === "pen" && field2("pen-pressure").checked ? { pressure: event.pressure } : {}
    };
  };
  function brushOptions() {
    return {
      size: integer("paint-size", 1, 64),
      tip: choice("paint-tip").value,
      pixelPerfect: field2("pixel-perfect").checked,
      symmetry: choice("paint-symmetry").value
    };
  }
  function activePaint(document2) {
    const layer = document2.layers.find((layer2) => layer2.id === document2.activeLayerId) ?? document2.layers.at(-1);
    if (layer?.kind === "paint" && (layer.locked || layer.visible === false)) throw new Error("\uC120\uD0DD\uD55C \uADF8\uB9BC \uB808\uC774\uC5B4\uAC00 \uC7A0\uACA8 \uC788\uAC70\uB098 \uC228\uACA8\uC838 \uC788\uC2B5\uB2C8\uB2E4. \uD45C\uC2DC\uC640 \uC7A0\uAE08\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
    return layer?.kind === "paint" && !layer.locked && layer.visible !== false ? layer.id : void 0;
  }
  function paintLayerSource(doc, id, merged) {
    if (!id) return merged;
    const layer = doc.layers.find((layer2) => layer2.id === id);
    if (layer?.kind !== "paint") return merged;
    const pixels = new Uint32Array(doc.width * doc.height), data = new Uint8Array(pixels.length);
    layer.indices.forEach((i, j) => {
      pixels[i] = layer.pixels[j];
      data[i] = pixels[i] >>> 24 ? 1 : 0;
    });
    return { w: doc.width, h: doc.height, pixels, mask: { w: doc.width, h: doc.height, data } };
  }
  function painted(source, mask2, erase, merged, shadeStep = 0) {
    const baseline = source;
    const output = shadeStep ? shadePixelMask2D(baseline, mask2, authoredPalette ?? host.palette(), shadeStep, {
      protectedMask: host.protection(),
      selection: field2("paint-in-selection").checked ? host.selection() : void 0
    }) : paintPixelMask2D(source, mask2, erase ? null : hex(field2("paint-color").value), {
      mode: "replace",
      protectedMask: host.protection(),
      selection: field2("paint-in-selection").checked ? host.selection() : void 0,
      alphaLock: field2("alpha-lock").checked
    });
    const touched = Uint8Array.from(mask2, (v, i) => v && (baseline.pixels[i] !== output.pixels[i] || baseline.mask.data[i] !== output.mask.data[i]) ? 1 : 0);
    if (erase && merged && !field2("alpha-lock").checked) for (let i = 0; i < touched.length; i++) {
      if (mask2[i] && !host.protection()[i] && (!field2("paint-in-selection").checked || host.selection()[i]) && merged.mask.data[i] && merged.pixels[i] >>> 24) touched[i] = 1;
    }
    return { output, touched };
  }
  function previewStroke() {
    if (!stroke) return;
    const { document: doc, points, tool, source, merged, layerId } = stroke, options = brushOptions();
    const mask2 = ["line", "rectangle", "ellipse"].includes(tool) ? rasterizePixelShape2D(doc.width, doc.height, tool, [points[0].x, points[0].y], [points.at(-1).x, points.at(-1).y], { ...options, filled: field2("paint-filled").checked }) : rasterizePixelBrush2D(doc.width, doc.height, points, options);
    const { output, touched } = painted(source, mask2, tool === "eraser", merged, tool === "shade-light" ? 1 : tool === "shade-dark" ? -1 : 0);
    const next = writePixelArtPaintLayer2D(doc, output, touched, layerId);
    stroke.candidate = next;
    host.preview(!layerId ? output : renderPixelArtDocument2D(next));
  }
  result.addEventListener("pointerdown", (event) => attempt2(() => {
    const tool = choice("paint-tool").value;
    if (event.button !== 0 || tool === "inspect" || selectionDrawingTools.has(tool)) return;
    event.preventDefault();
    const p = point2(event), source = host.output(), doc = host.outputDocument();
    if (p.x < 0 || p.y < 0 || p.x >= source.w || p.y >= source.h) return;
    if (tool === "picker") {
      const i = p.y * source.w + p.x;
      if (source.mask.data[i] && source.pixels[i] >>> 24) field2("paint-color").value = cssColor(source.pixels[i]);
      return;
    }
    const layerId = activePaint(doc);
    if (!layerId && doc.layers.length >= pixelArtLayerLimit2D(doc.width, doc.height)) throw new RangeError("\uB808\uC774\uC5B4 \uD55C\uB3C4\uC785\uB2C8\uB2E4. \uADF8\uB9BC \uB808\uC774\uC5B4\uB97C \uC120\uD0DD\uD558\uAC70\uB098 \uD604\uC7AC \uBAA8\uC2B5\uC744 \uAD6C\uC6B4 \uB4A4 \uADF8\uB824 \uC8FC\uC138\uC694.");
    if (tool === "fill") {
      const mask2 = selectPixelRegion2D(source, p, {
        tolerance: integer("tolerance", 0, 100),
        includeTransparent: true,
        selection: field2("paint-in-selection").checked ? host.selection() : void 0
      });
      const { output, touched } = painted(paintLayerSource(doc, layerId, source), mask2, false);
      const next = writePixelArtPaintLayer2D(doc, output, touched, layerId);
      if (next !== doc) host.commit(next);
      return;
    }
    stroke = { pointer: event.pointerId, points: [p], tool, document: doc, source: paintLayerSource(doc, layerId, source), merged: source, layerId };
    result.setPointerCapture(event.pointerId);
    previewStroke();
  }));
  result.addEventListener("pointermove", (event) => attempt2(() => {
    const p = point2(event);
    el2("cursor-cell").textContent = p.x >= 0 && p.y >= 0 && p.x < result.width && p.y < result.height ? `x ${p.x} \xB7 y ${p.y}` : "";
    if (!stroke || stroke.pointer !== event.pointerId) return;
    for (const sample of event.getCoalescedEvents?.().length ? event.getCoalescedEvents() : [event]) {
      const next = point2(sample), last = stroke.points.at(-1);
      if (last.x !== next.x || last.y !== next.y || last.pressure !== next.pressure) stroke.points.push(next);
    }
    if (strokeFrame === void 0) strokeFrame = requestAnimationFrame(() => {
      strokeFrame = void 0;
      attempt2(previewStroke);
    });
  }));
  function finishStroke() {
    if (!stroke) return;
    if (strokeFrame !== void 0) {
      cancelAnimationFrame(strokeFrame);
      strokeFrame = void 0;
    }
    previewStroke();
    const completed = stroke;
    stroke = void 0;
    if (result.hasPointerCapture(completed.pointer)) result.releasePointerCapture(completed.pointer);
    if (completed.candidate && completed.candidate !== completed.document) host.commit(completed.candidate);
    else host.preview(void 0);
  }
  result.addEventListener("pointerup", (event) => attempt2(() => {
    if (!stroke || stroke.pointer !== event.pointerId) return;
    const next = point2(event), last = stroke.points.at(-1);
    if (event.pointerType === "pen") next.pressure = last.pressure;
    if (last.x !== next.x || last.y !== next.y) {
      stroke.points.push(next);
      previewStroke();
    }
    finishStroke();
  }));
  const cancelStroke = () => {
    if (strokeFrame !== void 0) {
      cancelAnimationFrame(strokeFrame);
      strokeFrame = void 0;
    }
    stroke = void 0;
    host.preview(void 0);
  };
  result.addEventListener("pointercancel", cancelStroke);
  result.addEventListener("lostpointercapture", () => {
    if (stroke) cancelStroke();
  });
  result.addEventListener("pointerleave", () => {
    if (!stroke) el2("cursor-cell").textContent = "";
  });
  choice("paint-tool").onchange = () => {
    if (stroke) cancelStroke();
    syncCursor();
  };
  function syncCursor() {
    const tool = choice("paint-tool").value;
    result.style.cursor = tool === "inspect" ? "default" : "crosshair";
    el2("paint-hint").textContent = tool === "inspect" ? "\uC624\uB978\uCABD \uCE94\uBC84\uC2A4\uC5D0 \uADF8\uB9BD\uB2C8\uB2E4. \uC67C\uCABD\uC5D0\uC11C\uB294 \uC120\uD0DD\uACFC \uBCF4\uD638 \uC601\uC5ED\uC744 \uD3B8\uC9D1\uD569\uB2C8\uB2E4." : tool === "move" ? "\uC120\uD0DD \uC601\uC5ED\uC744 \uB4DC\uB798\uADF8\uD558\uAC70\uB098 \uBC29\uD5A5\uD0A4\uB85C \uC62E\uAE30\uC138\uC694. Shift + \uBC29\uD5A5\uD0A4: 10px. Escape: \uCDE8\uC18C." : selectionDrawingTools.has(tool) ? "\uC601\uC5ED\uC744 \uB4DC\uB798\uADF8\uD558\uC138\uC694. Shift: \uCD94\uAC00 \xB7 Alt: \uBE7C\uAE30 \xB7 Shift + Alt: \uAD50\uCC28." : tool.startsWith("shade-") ? "\uC791\uC5C5 \uD314\uB808\uD2B8\uC5D0 \uC788\uB294 \uC0C9\uC744 \uD55C \uB2E8\uACC4 \uBC14\uAFC9\uB2C8\uB2E4. \uD314\uB808\uD2B8 \uBC16 \uC0C9\xB7\uC54C\uD30C\xB7\uBCF4\uD638 \uC601\uC5ED\uC740 \uC720\uC9C0\uB429\uB2C8\uB2E4." : tool === "picker" ? "\uC624\uB978\uCABD \uADF8\uB9BC\uC5D0\uC11C \uC0C9\uC744 \uACE0\uB978 \uB4A4 B\uB97C \uB204\uB974\uBA74 \uC5F0\uD544\uB85C \uB3CC\uC544\uAC11\uB2C8\uB2E4." : "\uC624\uB978\uCABD \uCE94\uBC84\uC2A4\uC5D0 \uADF8\uB9AC\uC138\uC694. \uD55C \uBC88\uC758 \uB4DC\uB798\uADF8\uAC00 \uD55C \uBC88\uC758 \uC2E4\uD589 \uCDE8\uC18C\uC5D0 \uB300\uC751\uD569\uB2C8\uB2E4. \uBCF4\uD638 \uC601\uC5ED\uC740 \uC720\uC9C0\uB429\uB2C8\uB2E4.";
  }
  function mutateLayer(id, fn) {
    const doc = host.document(), layers = structuredClone(doc.layers), index = layers.findIndex((layer) => layer.id === id);
    if (index < 0) return;
    fn(layers, index);
    const { activeLayerId, ...base } = doc;
    host.commit({ ...base, layers, ...activeLayerId && layers.some((layer) => layer.id === activeLayerId) ? { activeLayerId } : {} });
  }
  const actionButton = (label, title, action, disabled = false) => {
    const button4 = document.createElement("button");
    button4.type = "button";
    button4.textContent = label;
    button4.title = title;
    button4.setAttribute("aria-label", title);
    button4.disabled = disabled;
    button4.onclick = () => attempt2(action);
    return button4;
  };
  function syncLayers() {
    const doc = host.document(), key = JSON.stringify([doc.activeLayerId, doc.layers.map(({ id, name: name2, kind, visible, locked }) => ({ id, name: name2, kind, visible, locked }))]);
    const hasRoom = host.outputDocument().layers.length < pixelArtLayerLimit2D(doc.width, doc.height);
    btn("new-paint-layer").disabled = !hasRoom;
    btn("apply-palette").disabled = !hasRoom;
    btn("flatten-layers").disabled = !doc.layers.length;
    const selected = doc.layers.find((layer) => layer.id === doc.activeLayerId);
    el2("active-layer").textContent = selected ? `${selected.kind === "paint" ? "\uADF8\uB9AC\uB294 \uACF3" : "\uC120\uD0DD\uD55C \uB808\uC774\uC5B4"}: ${selected.name}${selected.locked ? " \xB7 \uC7A0\uAE40" : ""}` : "\uADF8\uB9AC\uBA74 \uB9E8 \uC704\uC5D0 \uADF8\uB9BC \uB808\uC774\uC5B4\uAC00 \uC0DD\uAE41\uB2C8\uB2E4.";
    if (key === rowsKey) return;
    rowsKey = key;
    el2("layer-list").replaceChildren(...doc.layers.map((layer, index) => {
      const li = document.createElement("li");
      li.dataset.layerId = layer.id;
      li.classList.toggle("active", doc.activeLayerId === layer.id);
      li.classList.toggle("hidden-layer", layer.visible === false);
      li.append(actionButton(layer.visible === false ? "\u25CB" : "\u25CF", `${layer.name} \uD45C\uC2DC \uC804\uD658`, () => mutateLayer(layer.id, (layers, i) => {
        layers[i].visible = layers[i].visible === false;
      })));
      const kind = document.createElement("span");
      kind.className = "layer-kind";
      kind.textContent = { material: "\uC7AC\uC9C8", paint: "\uADF8\uB9BC", palette: "\uC0C9\uC0C1", transform: "\uBCC0\uD615", relight: "\uC870\uBA85" }[layer.kind];
      li.append(kind);
      const name2 = document.createElement("input");
      name2.value = layer.name;
      name2.className = "layer-name";
      name2.maxLength = 160;
      name2.setAttribute("aria-label", `${layer.name} \uC774\uB984`);
      name2.onchange = () => attempt2(() => {
        if (!name2.value.trim()) {
          name2.value = layer.name;
          return;
        }
        mutateLayer(layer.id, (layers, i) => {
          layers[i].name = name2.value.trim();
        });
      });
      li.append(name2, actionButton("\uC120\uD0DD", `${layer.name} \uC120\uD0DD`, () => host.commit({ ...host.document(), activeLayerId: layer.id })));
      if (layer.kind === "material") li.append(actionButton("\uC124\uC815", `${layer.name} \uC7AC\uC9C8 \uC218\uC815`, () => host.editMaterial(layer.id), !!layer.locked));
      li.append(
        actionButton(layer.locked ? "\uC7A0\uAE40" : "\uC7A0\uAE08", `${layer.name} \uD3B8\uC9D1 \uC7A0\uAE08`, () => mutateLayer(layer.id, (layers, i) => {
          layers[i].locked = !layers[i].locked;
        })),
        actionButton("\u2191", `${layer.name} \uC704\uB85C`, () => mutateLayer(layer.id, (layers, i) => {
          [layers[i], layers[i + 1]] = [layers[i + 1], layers[i]];
        }), index === doc.layers.length - 1 || !!layer.locked),
        actionButton("\u2193", `${layer.name} \uC544\uB798\uB85C`, () => mutateLayer(layer.id, (layers, i) => {
          [layers[i], layers[i - 1]] = [layers[i - 1], layers[i]];
        }), index === 0 || !!layer.locked),
        actionButton("\xD7", `${layer.name} \uC0AD\uC81C`, () => mutateLayer(layer.id, (layers, i) => {
          layers.splice(i, 1);
        }), !!layer.locked)
      );
      return li;
    }));
  }
  btn("new-paint-layer").onclick = () => attempt2(() => {
    const doc = host.outputDocument(), id = nextPixelArtLayerId2D(doc, "paint");
    host.commit({ ...doc, activeLayerId: id, layers: [...doc.layers, { kind: "paint", id, name: `\uADF8\uB9BC ${doc.layers.length + 1}`, indices: [], pixels: [] }] });
    choice("paint-tool").value = "pencil";
    syncCursor();
  });
  btn("flatten-layers").onclick = () => attempt2(() => host.commit(flattenPixelArtDocument2D(host.outputDocument())));
  btn("new-canvas").onclick = () => attempt2(() => {
    const width = integer("new-width", 1, 512), height = integer("new-height", 1, 512);
    host.newCanvas(createBlankPixelArtDocument2D(width, height, `Artwork-${width}x${height}`));
    field2("paint-in-selection").checked = false;
    field2("alpha-lock").checked = false;
    choice("paint-tool").value = "pencil";
    syncCursor();
  });
  btn("invert-selection").onclick = () => host.setSelection(Uint8Array.from(host.selection(), (v) => v ? 0 : 1));
  for (const [id, radius] of [["grow-selection", 1], ["shrink-selection", -1]]) btn(id).onclick = () => attempt2(() => {
    const doc = host.document();
    host.setSelection(resizePixelSelection2D(doc.width, doc.height, host.selection(), radius));
  });
  function setAuthoredPalette(colors) {
    authoredPalette = colors;
    el2("workbench-palette").replaceChildren(...colors.map((color, i) => {
      const swatch = document.createElement("input");
      swatch.type = "color";
      swatch.value = cssColor(color);
      swatch.setAttribute("aria-label", `\uC791\uC5C5 \uD314\uB808\uD2B8 ${i + 1}`);
      swatch.oninput = () => {
        authoredPalette[i] = hex(swatch.value);
      };
      swatch.ondblclick = () => {
        field2("paint-color").value = swatch.value;
      };
      return swatch;
    }));
  }
  btn("extract-palette").onclick = () => attempt2(() => {
    const colors = extractPixelPalette2D(host.output(), {
      colors: integer("palette-count", 2, 64),
      locked: field2("lock-paint-color").checked ? [field2("paint-color").value] : [],
      ...field2("paint-in-selection").checked ? { selection: host.selection() } : {}
    });
    if (!colors.length) throw new Error("\uC0C9\uC744 \uCD94\uCD9C\uD560 \uBD88\uD22C\uBA85\uD55C \uD53D\uC140\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uBA3C\uC800 \uADF8\uB9AC\uAC70\uB098 PNG\uB97C \uAC00\uC838\uC624\uC138\uC694.");
    setAuthoredPalette(colors);
    el2("palette-note").textContent = `\uD604\uC7AC \uADF8\uB9BC\uC5D0\uC11C ${colors.length}\uC0C9\uC744 \uCD94\uCD9C\uD588\uC2B5\uB2C8\uB2E4. \uD314\uB808\uD2B8 \uC870\uC815 \uB808\uC774\uC5B4\uB85C \uC801\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`;
  });
  btn("generate-ramp").onclick = () => attempt2(() => {
    const colors = createPixelPaletteRamp2D({ shadow: field2("ramp-shadow").value, midtone: field2("ramp-midtone").value, highlight: field2("ramp-highlight").value, colors: integer("palette-count", 2, 64) });
    setAuthoredPalette(colors);
    el2("palette-note").textContent = `${colors.length}\uC0C9 \uBA85\uC554 \uD314\uB808\uD2B8 \xB7 \uADF8\uB9BC\uC790\uC640 \uBC1D\uC740 \uBA74 \uC0AC\uC774\uC5D0\uC11C \uC0C9\uC0C1\uACFC \uCC44\uB3C4\uB97C \uD568\uAED8 \uC870\uC808\uD588\uC2B5\uB2C8\uB2E4.`;
  });
  btn("use-material-palette").onclick = () => attempt2(() => host.setPalette(authoredPalette ?? host.palette()));
  btn("apply-palette").onclick = () => attempt2(() => {
    const doc = host.outputDocument(), id = nextPixelArtLayerId2D(doc, "palette"), palette2 = authoredPalette ?? host.palette();
    const layer = {
      kind: "palette",
      id,
      name: `\uD314\uB808\uD2B8 \xB7 ${palette2.length}\uC0C9`,
      palette: [...palette2],
      dither: choice("palette-dither").value,
      strength: 1,
      ...field2("paint-in-selection").checked ? { selection: Array.from(host.selection()) } : {},
      protectedMask: Array.from(host.protection())
    };
    host.commit({ ...doc, activeLayerId: id, layers: [...doc.layers, layer] });
  });
  const relightRanges = ["angle", "elevation", "intensity", "fill", "ambient", "roughness", "ao", "shadow", "strength"];
  function showRelightValues() {
    for (const name2 of relightRanges) {
      const value = Number(field2(`relight-${name2}`).value);
      el2(`relight-${name2}-value`).textContent = `${Math.round(value * 1e3) / 1e3}${name2 === "angle" || name2 === "elevation" ? "\xB0" : ""}`;
    }
  }
  for (const name2 of relightRanges) field2(`relight-${name2}`).addEventListener("input", showRelightValues);
  showRelightValues();
  btn("apply-relight").onclick = () => attempt2(() => {
    finishStroke();
    const doc = host.outputDocument(), source = renderPixelArtDocument2D(doc);
    if (!source.channels) throw new Error("\uC7AC\uC9C8 \uB808\uC774\uC5B4\uB97C \uC801\uC6A9\uD574 \uB192\uC774\xB7\uBC95\uC120\uC744 \uB9CC\uB4E0 \uB4A4 \uC7AC\uC870\uBA85\uC744 \uC0AC\uC6A9\uD558\uC138\uC694.");
    const angle = Number(field2("relight-angle").value) * Math.PI / 180, elevation = Number(field2("relight-elevation").value) * Math.PI / 180;
    const lighting = createPixelRelighter2D({
      lights: [
        { direction: [Math.cos(angle) * Math.cos(elevation), Math.sin(angle) * Math.cos(elevation), Math.sin(elevation)], color: field2("relight-key-color").value, intensity: Number(field2("relight-intensity").value), castShadow: Number(field2("relight-shadow").value) },
        { direction: [-Math.cos(angle), -Math.sin(angle), 0.7], color: field2("relight-fill-color").value, intensity: Number(field2("relight-fill").value) }
      ],
      ambient: Number(field2("relight-ambient").value),
      diffuseBands: integer("relight-bands", 2, 64),
      roughness: Number(field2("relight-roughness").value),
      ambientOcclusion: Number(field2("relight-ao").value),
      strength: Number(field2("relight-strength").value),
      wrap: field2("relight-wrap").checked,
      ...field2("relight-palette").checked ? { palette: [...authoredPalette ?? host.palette()] } : {}
    }).options;
    const id = nextPixelArtLayerId2D(doc, "relight");
    host.commit({ ...doc, activeLayerId: id, layers: [...doc.layers, {
      kind: "relight",
      id,
      name: "\uC6D0\uD654 \uC0C9 \uC720\uC9C0 \xB7 \uC7AC\uC870\uBA85",
      lighting,
      ...field2("paint-in-selection").checked ? { selection: Array.from(host.selection()) } : {},
      protectedMask: Array.from(host.protection())
    }] });
  });
  function spriteCanvas(sprite) {
    const c = document.createElement("canvas");
    c.width = sprite.w;
    c.height = sprite.h;
    const ctx = c.getContext("2d"), image = ctx.createImageData(c.width, c.height);
    for (let i = 0; i < sprite.pixels.length; i++) {
      const v = sprite.pixels[i];
      image.data.set([v & 255, v >>> 8 & 255, v >>> 16 & 255, sprite.mask.data[i] ? v >>> 24 : 0], i * 4);
    }
    ctx.putImageData(image, 0, 0);
    return c;
  }
  async function downloadSprite(sprite, name2) {
    const rgba = new Uint8Array(sprite.w * sprite.h * 4);
    for (let i = 0; i < sprite.pixels.length; i++) {
      const c = sprite.pixels[i];
      rgba.set([c & 255, c >>> 8 & 255, c >>> 16 & 255, sprite.mask.data[i] ? c >>> 24 : 0], i * 4);
    }
    host.download(await encodeRGBAPNG(sprite.w, sprite.h, rgba), name2);
  }
  const grids = ["source", "result"].map((id) => {
    const c = el2(id), wrapper = document.createElement("div"), grid = document.createElement("div");
    wrapper.className = "canvas-wrap";
    grid.className = "pixel-grid";
    grid.setAttribute("aria-hidden", "true");
    c.parentNode.insertBefore(wrapper, c);
    wrapper.append(c, grid);
    return { c, grid };
  });
  const tileHost = document.createElement("section"), tileLabel = document.createElement("div"), tileCanvas = document.createElement("canvas");
  tileHost.className = "tile-proof";
  tileLabel.className = "tile-proof-label";
  tileLabel.textContent = "\uBC18\uBCF5 \uACBD\uACC4 \uD655\uC778 \xB7 3 \xD7 3 \xB7 \uC6D0\uBCF8\uC744 \uBC14\uAFB8\uC9C0 \uC54A\uB294 \uD0C0\uC77C \uBBF8\uB9AC\uBCF4\uAE30";
  tileHost.append(tileLabel, tileCanvas);
  el2("result-host").closest(".comparison").after(tileHost);
  field2("show-grid").onchange = () => syncOverlays();
  field2("tile-preview").onchange = () => syncOverlays();
  function syncOverlays() {
    for (const { c, grid } of grids) {
      const rect = c.getBoundingClientRect(), step = rect.width / c.width;
      grid.style.backgroundSize = `${step}px ${rect.height / c.height}px`;
      grid.classList.toggle("visible", field2("show-grid").checked && step >= 4);
    }
    tileHost.classList.toggle("visible", field2("tile-preview").checked);
    if (field2("tile-preview").checked && host.output()) {
      const sprite = host.output(), source = spriteCanvas(sprite);
      tileCanvas.width = sprite.w * 3;
      tileCanvas.height = sprite.h * 3;
      const ctx = tileCanvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) ctx.drawImage(source, x * sprite.w, y * sprite.h);
    }
  }
  new ResizeObserver(syncOverlays).observe(el2("result-host"));
  function surfaceMaps() {
    const doc = host.outputDocument(), lastMaterial = doc.layers.filter((layer) => layer.kind === "material" && layer.visible !== false).at(-1);
    const tileSize = lastMaterial?.material.tileSize;
    return exportPixelSurfaceMaps2D(renderPixelArtDocument2D(doc), {
      normalConvention: choice("normal-convention").value,
      lighting: {
        light: lastMaterial?.material.light ?? [-0.6, -0.7, 1],
        ambientOcclusion: 1,
        castShadow: 1,
        wrap: !!tileSize && tileSize[0] === doc.width && tileSize[1] === doc.height && (lastMaterial?.material.bevel ?? 0) === 0,
        occlusionRadius: lastMaterial?.material.occlusionRadius,
        shadowDistance: lastMaterial?.material.shadowDistance
      }
    });
  }
  for (const kind of ["normal", "height", "occlusion", "shadow"]) btn(`save-${kind}`).onclick = () => attempt2(() => {
    const maps = surfaceMaps(), name2 = `${host.filename()}-${kind}${kind === "normal" ? "-" + maps.normalConvention : ""}.png`;
    void downloadSprite(maps[kind], name2).catch((error) => host.status(String(error), true));
  });
  btn("save-map-info").onclick = () => attempt2(() => {
    const maps = surfaceMaps(), source = host.output();
    const info = {
      schema: "poku-pixel-surface-maps/v1",
      width: source.w,
      height: source.h,
      normalConvention: maps.normalConvention,
      heightRange: maps.heightRange,
      heightUnits: "native pixel units",
      heightEncoding: "8-bit: value = min + byte/255 * (max-min)",
      sourceAxes: { x: "right", y: "down", z: "toward viewer" },
      normalEncoding: maps.normalConvention === "opengl" ? "RGB = round(([Nx, -Ny, Nz] + 1) * 127.5)" : "RGB = round(([Nx, Ny, Nz] + 1) * 127.5)",
      mask: "source alpha retained",
      occlusion: "white is unoccluded; black is fully occluded",
      shadow: "white receives direct light; black is shadowed",
      geometry: "explicit authored and procedural height; no depth inferred from RGB"
    };
    host.download(new Blob([JSON.stringify(info, null, 2)], { type: "application/json" }), host.filename() + "-surface-maps.json");
  });
  for (const id of ["save-png", "save-project", "undo", "redo", "save-normal", "save-height", "save-occlusion", "save-shadow", "save-map-info", "new-canvas", "import-png", "open-project", "apply-palette", "apply-material", "apply-relight", "flatten-layers"])
    btn(id).addEventListener("click", () => attempt2(finishStroke), { capture: true });
  window.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target.closest('input,select,textarea,[contenteditable="true"]')) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      btn(event.shiftKey ? "redo" : "undo").click();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      btn("save-project").click();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape") {
      if (stroke) cancelStroke();
      else {
        choice("paint-tool").value = "inspect";
        syncCursor();
      }
      return;
    }
    const shortcuts = { b: "pencil", e: "eraser", l: "line", r: "rectangle", o: "ellipse", g: "fill", i: "picker" };
    const tool = shortcuts[event.key.toLowerCase()];
    if (tool) {
      event.preventDefault();
      choice("paint-tool").value = tool;
      syncCursor();
    }
  });
  const selections = installPixelArtSelection(host, finishStroke);
  return { finishStroke() {
    finishStroke();
    selections.finish();
  }, setAuthoredPalette, palette: () => authoredPalette ?? host.palette(), sync() {
    syncLayers();
    syncOverlays();
    syncCursor();
    selections.sync();
    const mapsAvailable = !!host.output()?.channels;
    btn("apply-relight").disabled = !mapsAvailable || host.outputDocument().layers.length >= pixelArtLayerLimit2D(host.document().width, host.document().height);
    choice("normal-convention").disabled = !mapsAvailable;
    for (const id of ["save-normal", "save-height", "save-occlusion", "save-shadow", "save-map-info"]) btn(id).disabled = !mapsAvailable;
  } };
}

// src/authoring/pixel-art-animation.ts
var PIXEL_ART_ANIMATION_LIMITS_2D = Object.freeze({
  frames: 256,
  nativeCells: 8388608,
  storedValues: 16777216,
  renderCells: 67108864,
  jsonBytes: 64 * 1024 * 1024,
  sheetCells: 16777216,
  sheetDimension: 16384
});
var validName2 = (value) => typeof value === "string" && value.length > 0 && value.length <= 160;
var validDuration = (value) => typeof value === "number" && Number.isFinite(value) && value / 1e3 > 0;
var directions = ["forward", "reverse", "pingpong"];
var object = (value) => !!value && typeof value === "object" && !Array.isArray(value);
function checkedOptions(options) {
  if (!object(options) || options.name !== void 0 && !validName2(options.name)) throw new RangeError("Animation needs a valid name");
  const durationMs = options.durationMs ?? 100, loop = options.loop ?? true, direction = options.direction ?? "forward";
  if (!validDuration(durationMs) || typeof loop !== "boolean" || !directions.includes(direction)) throw new RangeError("Animation needs positive finite durations, a boolean loop flag and a supported direction");
  return { durationMs, loop, direction };
}
function pixelArtAnimationFrameLimit2D(width, height) {
  pixelArtLayerLimit2D(width, height);
  return Math.min(PIXEL_ART_ANIMATION_LIMITS_2D.frames, Math.floor(PIXEL_ART_ANIMATION_LIMITS_2D.nativeCells / (width * height)));
}
function arrayLength(value) {
  return Array.isArray(value) ? value.length : 0;
}
function documentFootprint(document2) {
  if (!object(document2) || !Array.isArray(document2.layers) || !Array.isArray(document2.pixels)) throw new RangeError("Animation frames need editable pixel documents");
  let stored = 0;
  for (const value of Object.values(document2)) if (Array.isArray(value) && value !== document2.layers) stored += value.length;
  if (object(document2.channels)) for (const value of Object.values(document2.channels)) stored += arrayLength(value);
  for (const layer of document2.layers) {
    if (!object(layer)) throw new RangeError("Animation contains an invalid layer");
    for (const value of Object.values(layer)) {
      stored += arrayLength(value);
      if (object(value)) for (const option of Object.values(value)) stored += arrayLength(option);
    }
  }
  return { stored, render: document2.width * document2.height * (1 + document2.layers.length) };
}
function checkAnimation(animation) {
  if (!object(animation) || animation.schema !== "poku-pixel-art/v3" || !validName2(animation.name)) throw new RangeError("Invalid pixel art animation identity");
  const limit = pixelArtAnimationFrameLimit2D(animation.width, animation.height), n = animation.width * animation.height;
  if (!Array.isArray(animation.frames) || animation.frames.length < 1 || animation.frames.length > limit) throw new RangeError(`Pixel art animation frame budget exceeded (maximum ${limit} at this size)`);
  if (typeof animation.loop !== "boolean" || !directions.includes(animation.direction)) throw new RangeError("Animation needs a boolean loop flag and a supported direction");
  const ids = /* @__PURE__ */ new Set();
  let stored = 0, render = 0;
  for (const frame of animation.frames) {
    if (!object(frame) || !validName2(frame.id) || !validName2(frame.name) || ids.has(frame.id) || !validDuration(frame.durationMs)) throw new RangeError("Frames need unique IDs, valid names and positive finite durations");
    ids.add(frame.id);
    const doc = frame.document;
    if (!object(doc) || doc.width !== animation.width || doc.height !== animation.height || !Array.isArray(doc.pixels) || doc.pixels.length !== n) throw new RangeError("Every animation cel must have the same native dimensions");
    if (!Array.isArray(doc.layers) || doc.layers.length > pixelArtLayerLimit2D(doc.width, doc.height)) throw new RangeError("Animation cel layer budget exceeded");
    const footprint = documentFootprint(doc);
    stored += footprint.stored;
    render += footprint.render;
    if (stored > PIXEL_ART_ANIMATION_LIMITS_2D.storedValues || render > PIXEL_ART_ANIMATION_LIMITS_2D.renderCells) throw new RangeError("Pixel art animation aggregate storage or render budget exceeded");
  }
  if (!ids.has(animation.activeFrameId)) throw new RangeError("Active animation frame must exist");
  let duration = 0;
  const addDuration = (index) => {
    const next = duration + animation.frames[index].durationMs;
    if (!Number.isFinite(next) || next <= duration || next / 1e3 <= duration / 1e3) throw new RangeError("Animation durations must have finite distinguishable boundaries");
    duration = next;
  };
  for (let i = 0; i < animation.frames.length; i++) addDuration(animation.direction === "reverse" ? animation.frames.length - 1 - i : i);
  if (animation.direction === "pingpong") for (let i = animation.frames.length - 2; i > 0; i--) addDuration(i);
}
function validatePixelArtAnimation2D(input2) {
  if (!object(input2)) throw new TypeError("Expected a pixel art animation");
  const schema = input2.schema;
  if (schema === "poku-pixel-art/v1" || schema === "poku-pixel-art/v2") return createPixelArtAnimation2D(validatePixelArtDocument2D(input2));
  const p = input2;
  checkAnimation(p);
  return {
    schema: "poku-pixel-art/v3",
    name: p.name,
    width: p.width,
    height: p.height,
    activeFrameId: p.activeFrameId,
    loop: p.loop,
    direction: p.direction,
    frames: p.frames.map((frame) => ({ id: frame.id, name: frame.name, durationMs: frame.durationMs, document: validatePixelArtDocument2D(frame.document) }))
  };
}
function createPixelArtAnimation2D(document2, options = {}) {
  const settings2 = checkedOptions(options), cel = validatePixelArtDocument2D(document2);
  const animation = {
    schema: "poku-pixel-art/v3",
    name: options.name ?? cel.name,
    width: cel.width,
    height: cel.height,
    frames: [{ id: "frame-1", name: "Frame 1", durationMs: settings2.durationMs, document: cel }],
    activeFrameId: "frame-1",
    loop: settings2.loop,
    direction: settings2.direction
  };
  checkAnimation(animation);
  return animation;
}
function frameIndex(animation, frameId) {
  const index = animation.frames.findIndex((frame) => frame.id === frameId);
  if (index < 0) throw new RangeError(`Unknown animation frame: ${frameId}`);
  return index;
}
function getPixelArtAnimationFrame2D(animation, frameId = animation.activeFrameId) {
  return animation.frames[frameIndex(animation, frameId)];
}
function nextPixelArtAnimationFrameId2D(animation) {
  const ids = new Set(animation.frames.map((frame) => frame.id));
  let i = 1;
  while (ids.has(`frame-${i}`)) i++;
  return `frame-${i}`;
}
function replacePixelArtAnimationFrame2D(animation, document2, frameId = animation.activeFrameId) {
  const index = frameIndex(animation, frameId);
  if (document2 === animation.frames[index].document) return animation;
  const frames = animation.frames.slice();
  frames[index] = { ...frames[index], document: document2 };
  const next = { ...animation, frames };
  checkAnimation(next);
  frames[index] = { ...frames[index], document: validatePixelArtDocument2D(document2) };
  return next;
}
function addPixelArtAnimationFrame2D(animation, document2, options = {}) {
  if (!object(options)) throw new RangeError("Animation insertion options must be an object");
  const active2 = getPixelArtAnimationFrame2D(animation), index = options.index ?? frameIndex(animation, animation.activeFrameId) + 1;
  if (!Number.isSafeInteger(index) || index < 0 || index > animation.frames.length) throw new RangeError("Animation insertion index is outside the frame list");
  if (animation.frames.length >= pixelArtAnimationFrameLimit2D(animation.width, animation.height)) throw new RangeError("Pixel art animation frame budget exceeded");
  const name2 = options.name ?? `Frame ${animation.frames.length + 1}`, durationMs = options.durationMs ?? active2.durationMs;
  if (!validName2(name2) || !validDuration(durationMs)) throw new RangeError("Frame needs a valid name and positive finite duration");
  const id = nextPixelArtAnimationFrameId2D(animation), cel = document2 ?? createBlankPixelArtDocument2D(animation.width, animation.height, name2);
  const frames = animation.frames.slice();
  frames.splice(index, 0, { id, name: name2, durationMs, document: cel });
  const next = { ...animation, frames, activeFrameId: id };
  checkAnimation(next);
  frames[index] = { ...frames[index], document: validatePixelArtDocument2D(cel) };
  return next;
}
function copiedName(name2) {
  const suffix = " copy";
  let prefix = "";
  for (const codepoint of name2) {
    if (prefix.length + codepoint.length + suffix.length > 160) break;
    prefix += codepoint;
  }
  return prefix + suffix;
}
function duplicatePixelArtAnimationFrame2D(animation, frameId = animation.activeFrameId) {
  const index = frameIndex(animation, frameId), frame = animation.frames[index];
  return addPixelArtAnimationFrame2D(animation, frame.document, { index: index + 1, name: copiedName(frame.name), durationMs: frame.durationMs });
}
function removePixelArtAnimationFrame2D(animation, frameId = animation.activeFrameId) {
  const index = frameIndex(animation, frameId);
  if (animation.frames.length === 1) throw new RangeError("Keep at least one animation frame");
  const frames = animation.frames.slice();
  frames.splice(index, 1);
  const next = { ...animation, frames, activeFrameId: animation.activeFrameId === frameId ? frames[Math.min(index, frames.length - 1)].id : animation.activeFrameId };
  checkAnimation(next);
  return next;
}
function movePixelArtAnimationFrame2D(animation, frameId, index) {
  const from = frameIndex(animation, frameId);
  if (!Number.isSafeInteger(index) || index < 0 || index >= animation.frames.length) throw new RangeError("Animation destination index is outside the frame list");
  if (from === index) return animation;
  const frames = animation.frames.slice(), [frame] = frames.splice(from, 1);
  frames.splice(index, 0, frame);
  const next = { ...animation, frames };
  checkAnimation(next);
  return next;
}
function updatePixelArtAnimationFrame2D(animation, frameId, changes) {
  if (!object(changes)) throw new RangeError("Animation frame changes must be an object");
  const index = frameIndex(animation, frameId), frame = animation.frames[index];
  const name2 = changes.name ?? frame.name, durationMs = changes.durationMs ?? frame.durationMs;
  if (!validName2(name2) || !validDuration(durationMs)) throw new RangeError("Frame needs a valid name and positive finite duration");
  if (name2 === frame.name && durationMs === frame.durationMs) return animation;
  const frames = animation.frames.slice();
  frames[index] = { ...frame, name: name2, durationMs };
  const next = { ...animation, frames };
  checkAnimation(next);
  return next;
}
function createPixelArtAnimationTimeline2D(animation) {
  checkAnimation(animation);
  const count = animation.frames.length, sequence = Array.from({ length: count }, (_, i) => animation.direction === "reverse" ? count - 1 - i : i);
  if (animation.direction === "pingpong") for (let i = count - 2; i > 0; i--) sequence.push(i);
  const starts = [], ends = [];
  let durationMs = 0;
  for (const index of sequence) {
    starts.push(durationMs);
    const next = durationMs + animation.frames[index].durationMs;
    if (!Number.isFinite(next) || next <= durationMs) throw new RangeError("Animation playback boundaries must be finite and distinguishable");
    ends.push(next);
    durationMs = next;
  }
  const loop = animation.loop;
  const at = (time) => {
    let low = 0, high = ends.length - 1;
    while (low < high) {
      const middle = low + high >>> 1;
      if (time < ends[middle]) high = middle;
      else low = middle + 1;
    }
    return sequence[low];
  };
  return Object.freeze({
    durationMs,
    sequence: Object.freeze(sequence),
    startsMs: Object.freeze(starts),
    endsMs: Object.freeze(ends),
    frameAt(timeMs) {
      if (!Number.isFinite(timeMs) || timeMs < 0 || !loop && timeMs >= durationMs) return -1;
      return at(loop ? timeMs % durationMs : timeMs);
    },
    frameAtPhase(phase) {
      return !Number.isFinite(phase) || phase < 0 || phase > 1 ? -1 : phase === 1 ? sequence[sequence.length - 1] : at(phase * durationMs);
    }
  });
}
function checkRaster(sprite, width, height) {
  if (!sprite || sprite.w !== width || sprite.h !== height || !(sprite.pixels instanceof Uint32Array) || sprite.pixels.length !== width * height || !sprite.mask || sprite.mask.w !== width || sprite.mask.h !== height || !(sprite.mask.data instanceof Uint8Array) || sprite.mask.data.length !== width * height) throw new RangeError("Onion skin cels must share matching native buffers");
}
function createPixelArtOnionSkin2D(frames, activeIndex, options = {}) {
  if (!Array.isArray(frames) || !frames.length || frames.length > PIXEL_ART_ANIMATION_LIMITS_2D.frames || !Number.isSafeInteger(activeIndex) || activeIndex < 0 || activeIndex >= frames.length || !object(options)) throw new RangeError("Onion skin needs an active cel and a valid frame list");
  const previous = options.previous ?? 1, next = options.next ?? 1, opacity = options.opacity ?? 0.28, loop = options.loop ?? false;
  const previousColor = options.previousColor ?? 4287461869, nextColor = options.nextColor ?? 4294163052;
  if (![previous, next].every((v) => Number.isSafeInteger(v) && v >= 0 && v <= 8) || !Number.isFinite(opacity) || opacity < 0 || opacity > 1 || typeof loop !== "boolean" || ![previousColor, nextColor].every((v) => Number.isInteger(v) && v >= -2147483648 && v <= 4294967295)) throw new RangeError("Onion skin needs 0..8 neighbours, opacity within 0..1 and valid tint colors");
  const active2 = frames[activeIndex];
  pixelArtLayerLimit2D(active2?.w, active2?.h);
  const w = active2.w, h = active2.h, n = w * h;
  checkRaster(active2, w, h);
  const pixels = new Uint32Array(n), data = new Uint8Array(n), seen = /* @__PURE__ */ new Set([activeIndex]);
  const neighbours = [];
  for (let distance = 1; distance <= Math.max(previous, next); distance++) for (const side of [-1, 1]) {
    if (distance > (side < 0 ? previous : next)) continue;
    const raw = activeIndex + side * distance, index = loop ? (raw % frames.length + frames.length) % frames.length : raw;
    if (index < 0 || index >= frames.length || seen.has(index)) continue;
    seen.add(index);
    checkRaster(frames[index], w, h);
    neighbours.push({ index, distance, tint: side < 0 ? previousColor : nextColor });
  }
  for (const { index, distance, tint } of neighbours.reverse()) {
    const frame = frames[index];
    for (let i = 0; i < n; i++) {
      const c = frame.pixels[i];
      if (!frame.mask.data[i] || !(c >>> 24)) continue;
      const alpha = (c >>> 24) / 255 * opacity / distance;
      if (!alpha) continue;
      const old = pixels[i], oldAlpha = (old >>> 24) / 255, outAlpha = alpha + oldAlpha * (1 - alpha), a = Math.round(outAlpha * 255);
      if (!a) continue;
      const brightness = 0.35 + 0.65 * ((c & 255) * 0.2126 + (c >>> 8 & 255) * 0.7152 + (c >>> 16 & 255) * 0.0722) / 255;
      const weight = brightness * alpha, retained = oldAlpha * (1 - alpha);
      const r = Math.round(((tint & 255) * weight + (old & 255) * retained) / outAlpha);
      const g = Math.round(((tint >>> 8 & 255) * weight + (old >>> 8 & 255) * retained) / outAlpha);
      const b = Math.round(((tint >>> 16 & 255) * weight + (old >>> 16 & 255) * retained) / outAlpha);
      pixels[i] = (a << 24 | b << 16 | g << 8 | r) >>> 0;
      data[i] = 1;
    }
  }
  return { w, h, pixels, mask: { w, h, data } };
}
function visualColor(sprite, index) {
  return sprite.mask.data[index] ? sprite.pixels[index] : sprite.pixels[index] & 16777215;
}
function exportPixelArtAnimationSheet2D(animation, options = {}) {
  checkAnimation(animation);
  if (!object(options)) throw new RangeError("Animation sheet options must be an object");
  const count = animation.frames.length, columns = options.columns ?? Math.min(count, Math.max(1, Math.ceil(Math.sqrt(count * animation.height / animation.width)))), padding = options.padding ?? 1;
  if (!Number.isSafeInteger(columns) || columns < 1 || columns > count || !Number.isSafeInteger(padding) || padding < 0 || padding > 32) throw new RangeError("Sheet needs 1..frame-count columns and 0..32 native pixels of padding");
  const cellW = animation.width + padding * 2, cellH = animation.height + padding * 2, w = cellW * columns, h = cellH * Math.ceil(count / columns);
  if (w > PIXEL_ART_ANIMATION_LIMITS_2D.sheetDimension || h > PIXEL_ART_ANIMATION_LIMITS_2D.sheetDimension || w * h > PIXEL_ART_ANIMATION_LIMITS_2D.sheetCells) throw new RangeError("Animation sheet exceeds its native image budget; reduce columns/padding or export fewer cels");
  const timeline2 = createPixelArtAnimationTimeline2D(animation), pixels = new Uint32Array(w * h), data = new Uint8Array(w * h), rgba = new Uint8Array(w * h * 4);
  const manifest = {
    schema: "poku-pixel-art-atlas/v1",
    name: animation.name,
    width: w,
    height: h,
    frameWidth: animation.width,
    frameHeight: animation.height,
    columns,
    padding,
    loop: animation.loop,
    direction: animation.direction,
    durationMs: timeline2.durationMs,
    sequence: [...timeline2.sequence],
    startsMs: [...timeline2.startsMs],
    frames: []
  };
  for (let frame = 0; frame < count; frame++) {
    const cel = animation.frames[frame], raster = renderPixelArtDocument2D(cel.document), x = frame % columns * cellW + padding, y = Math.floor(frame / columns) * cellH + padding;
    manifest.frames.push({ id: cel.id, name: cel.name, x, y, width: animation.width, height: animation.height, durationMs: cel.durationMs });
    for (let py = 0; py < raster.h; py++) for (let px = 0; px < raster.w; px++) {
      const source = py * raster.w + px, target = (y + py) * w + x + px, c = visualColor(raster, source);
      pixels[target] = c;
      data[target] = c >>> 24 ? 1 : 0;
      rgba[target * 4] = c & 255;
      rgba[target * 4 + 1] = c >>> 8 & 255;
      rgba[target * 4 + 2] = c >>> 16 & 255;
      rgba[target * 4 + 3] = c >>> 24;
    }
  }
  return { sprite: { w, h, pixels, mask: { w, h, data } }, rgba, manifest };
}
function exportPixelArtAnimationClip2D(animation, options = {}) {
  checkAnimation(animation);
  if (!object(options)) throw new RangeError("Animation clip options must be an object");
  const pivot = options.pivot ?? [animation.width / 2, animation.height / 2];
  if (!Array.isArray(pivot) || pivot.length !== 2 || !Array.from(pivot).every(Number.isFinite)) throw new RangeError("Sprite clip pivot needs two finite native coordinates");
  if (animation.width > 4096 || animation.height > 4096) throw new RangeError("Runtime sprite clips support dimensions up to 4096");
  const timeline2 = createPixelArtAnimationTimeline2D(animation), frames = [];
  let stored = 0;
  for (const frame of animation.frames) {
    const sprite = renderPixelArtDocument2D(frame.document), runs = [];
    let color = visualColor(sprite, 0), count = 0;
    for (let i = 0; i < sprite.pixels.length; i++) {
      const c = visualColor(sprite, i);
      if (c === color) count++;
      else {
        runs.push(count, color);
        count = 1;
        color = c;
      }
    }
    runs.push(count, color);
    stored += runs.length;
    if (stored > PIXEL_ART_ANIMATION_LIMITS_2D.storedValues) throw new RangeError("Runtime animation encoded cell budget exceeded");
    frames.push({ durationMs: frame.durationMs, runs });
  }
  return {
    version: 1,
    width: animation.width,
    height: animation.height,
    pivot: [pivot[0], pivot[1]],
    frames: timeline2.sequence.map((index) => frames[index]),
    source: { authoringSchema: animation.schema, name: animation.name, loop: animation.loop, direction: animation.direction, frameIds: timeline2.sequence.map((index) => animation.frames[index].id) }
  };
}
function checkBytes2(json) {
  if (json.length > PIXEL_ART_ANIMATION_LIMITS_2D.jsonBytes || new TextEncoder().encode(json).byteLength > PIXEL_ART_ANIMATION_LIMITS_2D.jsonBytes) throw new RangeError("Pixel art animation exceeds 64 MiB");
}
function serializePixelArtAnimation2D(animation) {
  const json = JSON.stringify(validatePixelArtAnimation2D(animation));
  checkBytes2(json);
  return json;
}
function parsePixelArtAnimation2D(json) {
  if (typeof json !== "string") throw new TypeError("Pixel art animation JSON must be a string");
  checkBytes2(json);
  return validatePixelArtAnimation2D(JSON.parse(json));
}
function snapshot(animation) {
  const p = validatePixelArtAnimation2D(animation), activeFrameId = p.activeFrameId, ids = p.frames.map((frame) => frame.id);
  p.activeFrameId = ids[0];
  const json = JSON.stringify(p);
  checkBytes2(json);
  return { json, activeFrameId, ids };
}
var PixelArtAnimationHistory2D = class {
  constructor(animation, limit = 64, byteLimit = 32 * 1024 * 1024) {
    this.limit = limit;
    this.byteLimit = byteLimit;
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(byteLimit) || byteLimit < 1) throw new RangeError("History limits must be positive integers");
    this.current = snapshot(animation);
  }
  past = [];
  future = [];
  current;
  bytes = 0;
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  get value() {
    const value = parsePixelArtAnimation2D(this.current.json);
    value.activeFrameId = this.current.activeFrameId;
    return value;
  }
  /** Updates navigation only; callers already holding the immutable animation can also
   * replace its activeFrameId locally instead of retrieving a cloned value here. */
  selectFrame(frameId) {
    if (!this.current.ids.includes(frameId)) throw new RangeError("Selected animation frame must exist");
    this.current = { ...this.current, activeFrameId: frameId };
  }
  commit(animation) {
    const next = snapshot(animation);
    if (next.json === this.current.json) {
      this.current = next;
      return false;
    }
    this.past.push(this.current);
    this.current = next;
    this.future = [];
    this.trim();
    return true;
  }
  undo() {
    const previous = this.past.pop();
    if (previous) {
      this.future.push(this.current);
      this.current = previous;
      this.trim();
    }
    return this.value;
  }
  redo() {
    const next = this.future.pop();
    if (next) {
      this.past.push(this.current);
      this.current = next;
      this.trim();
    }
    return this.value;
  }
  reset(animation) {
    this.current = snapshot(animation);
    this.past = [];
    this.future = [];
    this.bytes = 0;
  }
  trim() {
    this.bytes = [...this.past, ...this.future].reduce((sum, entry) => sum + entry.json.length * 2, 0);
    while ((this.past.length || this.future.length) && (this.past.length + this.future.length > this.limit || this.bytes > this.byteLimit)) {
      const removed = this.past.length ? this.past.shift() : this.future.shift();
      this.bytes -= removed.json.length * 2;
    }
  }
};

// gallery/pixel-art-timeline.ts
var el3 = (id) => document.getElementById(id);
var field3 = (id) => el3(id);
var select2 = (id) => el3(id);
var button2 = (id) => el3(id);
var active = (animation) => animation.frames.find((frame) => frame.id === animation.activeFrameId);
function draw(canvas2, sprite, thumbnail = false) {
  const source = thumbnail ? document.createElement("canvas") : canvas2;
  source.width = sprite.w;
  source.height = sprite.h;
  const ctx = source.getContext("2d"), pixels = ctx.createImageData(sprite.w, sprite.h);
  for (let i = 0; i < sprite.pixels.length; i++) {
    const c = sprite.pixels[i];
    pixels.data.set([c & 255, c >>> 8 & 255, c >>> 16 & 255, sprite.mask.data[i] ? c >>> 24 : 0], i * 4);
  }
  ctx.putImageData(pixels, 0, 0);
  if (thumbnail) {
    canvas2.width = 56;
    canvas2.height = 56;
    const output = canvas2.getContext("2d");
    output.imageSmoothingEnabled = false;
    const scale = Math.min(52 / source.width, 52 / source.height), w = Math.max(1, Math.round(source.width * scale)), h = Math.max(1, Math.round(source.height * scale));
    output.drawImage(source, Math.floor((56 - w) / 2), Math.floor((56 - h) / 2), w, h);
  }
}
function installPixelArtTimeline(host) {
  let state, history2;
  let version = 0, syncedVersion = -1, onionVersion = "", playing = false, raf = 0, started = 0, lastPlaybackIndex = -1;
  let clock;
  let playbackFrames;
  const cache = /* @__PURE__ */ new Map();
  let cacheBytes = 0;
  const dirtyThumbnails = /* @__PURE__ */ new Set();
  const result = el3("result");
  const onion = document.createElement("canvas");
  onion.className = "onion-overlay";
  onion.setAttribute("aria-hidden", "true");
  result.parentElement.insertBefore(onion, result);
  const player = el3("animation-preview");
  const attempt2 = (fn) => {
    try {
      fn();
    } catch (error) {
      host.status(error instanceof Error ? error.message : String(error), true);
    }
  };
  function rasterForFrame(frame) {
    const old = cache.get(frame.id);
    const sameRaster = old && (old.document === frame.document || old.document.width === frame.document.width && old.document.height === frame.document.height && old.document.pixels === frame.document.pixels && old.document.mask === frame.document.mask && old.document.channels === frame.document.channels && old.document.layers === frame.document.layers);
    if (sameRaster) {
      cache.delete(frame.id);
      cache.set(frame.id, old);
      return old.sprite;
    }
    const sprite = renderPixelArtDocument2D(frame.document);
    if (old) {
      cache.delete(frame.id);
      cacheBytes -= old.bytes;
    }
    const bytes = sprite.pixels.byteLength + sprite.mask.data.byteLength + (sprite.channels ? sprite.channels.material.byteLength + sprite.channels.height.byteLength + sprite.channels.normal.byteLength : 0);
    while (cache.size && cacheBytes + bytes > 32 * 1024 * 1024) {
      const [key, entry] = cache.entries().next().value;
      cache.delete(key);
      cacheBytes -= entry.bytes;
    }
    if (bytes <= 32 * 1024 * 1024) {
      cache.set(frame.id, { document: frame.document, sprite, bytes });
      cacheBytes += bytes;
    }
    return sprite;
  }
  function frameRaster(index) {
    return rasterForFrame(state.frames[index]);
  }
  function stop() {
    playing = false;
    cancelAnimationFrame(raf);
    raf = 0;
    lastPlaybackIndex = -1;
    button2("play-animation").textContent = "\uC7AC\uC0DD";
    button2("play-animation").setAttribute("aria-pressed", "false");
  }
  function showActive(raster) {
    if (!state) return;
    const frame = active(state);
    host.restore(frame.document, raster ?? rasterForFrame(frame));
    version++;
    clock = void 0;
    host.refresh();
  }
  function ensure() {
    if (!state) {
      const next = createPixelArtAnimation2D(host.outputDocument()), raster = rasterForFrame(active(next));
      const nextHistory = new PixelArtAnimationHistory2D(next);
      state = next;
      history2 = nextHistory;
      for (const frame of state.frames) dirtyThumbnails.add(frame.id);
      showActive(raster);
    }
    return state;
  }
  function commit(next, allDirty = false) {
    stop();
    const raster = rasterForFrame(active(next));
    if (history2.commit(next)) {
      playbackFrames = void 0;
      state = next;
      const ids = new Set(state.frames.map((frame) => frame.id));
      for (const [id, entry] of cache) if (!ids.has(id)) {
        cache.delete(id);
        cacheBytes -= entry.bytes;
      }
      if (allDirty) for (const frame of state.frames) dirtyThumbnails.add(frame.id);
      else dirtyThumbnails.add(state.activeFrameId);
      showActive(raster);
    }
  }
  function capture() {
    host.finishStroke();
    if (state) commit(replacePixelArtAnimationFrame2D(state, host.outputDocument()));
  }
  function choose(id) {
    capture();
    if (!state || state.activeFrameId === id) return;
    const candidate = state.frames.find((frame) => frame.id === id);
    if (!candidate) throw new RangeError("\uC120\uD0DD\uD560 \uD504\uB808\uC784\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const raster = rasterForFrame(candidate);
    stop();
    history2.selectFrame(id);
    state = { ...state, activeFrameId: id };
    showActive(raster);
  }
  function play() {
    capture();
    ensure();
    stop();
    clock = createPixelArtAnimationTimeline2D(state);
    playbackFrames ??= state.frames.map((_, i) => {
      const sprite = frameRaster(i);
      return { w: sprite.w, h: sprite.h, pixels: sprite.pixels, mask: sprite.mask };
    });
    started = performance.now();
    playing = true;
    button2("play-animation").textContent = "\uC815\uC9C0";
    button2("play-animation").setAttribute("aria-pressed", "true");
    const tick = (now) => {
      if (!playing || !state || !clock) return;
      try {
        const elapsed = now - started, finished = !state.loop && elapsed >= clock.durationMs;
        const index = finished ? clock.frameAtPhase(1) : clock.frameAt(elapsed);
        if (index >= 0 && index !== lastPlaybackIndex) {
          draw(player, playbackFrames[index]);
          lastPlaybackIndex = index;
        }
        const time = finished ? clock.durationMs : elapsed % clock.durationMs;
        el3("animation-playhead").textContent = `${index + 1} / ${state.frames.length} \xB7 ${Math.floor(time)} ms`;
        if (finished) {
          stop();
          return;
        }
        raf = requestAnimationFrame(tick);
      } catch (error) {
        stop();
        host.status(error instanceof Error ? error.message : String(error), true);
      }
    };
    raf = requestAnimationFrame(tick);
  }
  button2("play-animation").onclick = () => attempt2(() => playing ? stop() : play());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  button2("add-frame").onclick = () => attempt2(() => {
    capture();
    commit(addPixelArtAnimationFrame2D(ensure()));
  });
  button2("duplicate-frame").onclick = () => attempt2(() => {
    capture();
    commit(duplicatePixelArtAnimationFrame2D(ensure()));
  });
  button2("remove-frame").onclick = () => attempt2(() => {
    capture();
    commit(removePixelArtAnimationFrame2D(ensure()), true);
  });
  for (const [id, delta] of [["frame-left", -1], ["frame-right", 1]]) button2(id).onclick = () => attempt2(() => {
    capture();
    const animation = ensure(), index = animation.frames.findIndex((frame) => frame.id === animation.activeFrameId);
    if (index + delta >= 0 && index + delta < animation.frames.length) commit(movePixelArtAnimationFrame2D(animation, animation.activeFrameId, index + delta));
  });
  field3("frame-duration").onchange = () => attempt2(() => {
    const durationMs = Number(field3("frame-duration").value);
    capture();
    const animation = ensure();
    commit(updatePixelArtAnimationFrame2D(animation, animation.activeFrameId, { durationMs }));
  });
  field3("frame-name").onchange = () => attempt2(() => {
    const name2 = field3("frame-name").value.trim();
    capture();
    const animation = ensure();
    commit(updatePixelArtAnimationFrame2D(animation, animation.activeFrameId, { name: name2 }));
  });
  for (const id of ["animation-loop", "animation-direction"]) el3(id).addEventListener("change", () => attempt2(() => {
    const loop = field3("animation-loop").checked, direction = select2("animation-direction").value;
    capture();
    commit({ ...ensure(), loop, direction });
  }));
  for (const id of ["onion-skin", "onion-opacity"]) el3(id).addEventListener("input", () => {
    onionVersion = "";
    sync();
  });
  button2("extract-animation-palette").onclick = () => attempt2(() => {
    capture();
    const animation = ensure(), count = Number(field3("palette-count").value);
    const palette2 = extractPixelAnimationPalette2D(animation.frames.map((frame, i) => ({ sprite: frameRaster(i), duration: frame.durationMs })), { colors: count, weighting: "equal-frame" });
    if (!palette2.length) throw new Error("\uC0C9\uC744 \uCD94\uCD9C\uD560 \uD504\uB808\uC784\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
    host.setPalette(palette2);
    el3("palette-note").textContent = `${animation.frames.length}\uAC1C \uD504\uB808\uC784\uC5D0\uC11C \uACF5\uD1B5 ${palette2.length}\uC0C9\uC744 \uCD94\uCD9C\uD588\uC2B5\uB2C8\uB2E4. \uD504\uB808\uC784\uB9C8\uB2E4 \uD314\uB808\uD2B8\uAC00 \uB2EC\uB77C\uC9C0\uB294 \uD604\uC0C1\uC744 \uC904\uC77C \uC218 \uC788\uC2B5\uB2C8\uB2E4.`;
  });
  button2("apply-animation-palette").onclick = () => attempt2(() => {
    capture();
    const animation = ensure(), palette2 = [...host.palette()];
    const frames = animation.frames.map((frame) => {
      const doc = frame.document, id = nextPixelArtLayerId2D(doc, "palette");
      const document2 = { ...doc, activeLayerId: id, layers: [...doc.layers, {
        kind: "palette",
        id,
        name: `\uACF5\uD1B5 \uD314\uB808\uD2B8 \xB7 ${palette2.length}\uC0C9`,
        palette: palette2,
        dither: select2("palette-dither").value,
        strength: 1,
        ...doc.protectedMask ? { protectedMask: doc.protectedMask } : {}
      }] };
      return { ...frame, document: document2 };
    });
    commit({ ...animation, frames }, true);
  });
  button2("save-animation-sheet").onclick = () => attempt2(() => {
    const requestedColumns = Number(field3("sheet-columns").value), padding = Number(field3("sheet-padding").value);
    capture();
    const animation = ensure(), columns = Math.min(animation.frames.length, requestedColumns);
    const sheet = exportPixelArtAnimationSheet2D(animation, { columns, padding }), filename2 = host.filename();
    const manifest = { ...sheet.manifest, image: filename2 + "-sheet.png" };
    void encodeRGBAPNG(sheet.sprite.w, sheet.sprite.h, sheet.rgba).then((blob) => {
      host.download(blob, filename2 + "-sheet.png");
      host.download(new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }), filename2 + "-sheet.json");
    }).catch((error) => host.status(String(error), true));
  });
  button2("save-animation-clip").onclick = () => attempt2(() => {
    capture();
    host.download(new Blob([JSON.stringify(exportPixelArtAnimationClip2D(ensure()))], { type: "application/json" }), host.filename() + ".sprite-clip.json");
  });
  window.addEventListener("keydown", (event) => {
    if (event.target.closest('input,select,textarea,[contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === "Space" && state) {
      event.preventDefault();
      attempt2(() => playing ? stop() : play());
    }
    if (state && (event.key === "," || event.key === ".")) {
      event.preventDefault();
      const index = state.frames.findIndex((frame) => frame.id === state.activeFrameId), next = index + (event.key === "," ? -1 : 1);
      if (state.frames[next]) attempt2(() => choose(state.frames[next].id));
    }
  });
  function sync() {
    el3("timeline-state").textContent = state ? `${state.frames.length} FRAMES` : "STILL IMAGE";
    if (syncedVersion !== version) {
      syncedVersion = version;
      const rows = new Map(Array.from(el3("frame-list").querySelectorAll("button")).map((row) => [row.dataset.frameId, row]));
      el3("frame-list").replaceChildren(...(state?.frames ?? []).map((frame2, i) => {
        let row = rows.get(frame2.id);
        if (!row) {
          row = document.createElement("button");
          row.type = "button";
          row.className = "frame-card";
          row.dataset.frameId = frame2.id;
          row.append(document.createElement("canvas"), document.createElement("strong"), document.createElement("span"));
          row.onclick = () => attempt2(() => choose(frame2.id));
          dirtyThumbnails.add(frame2.id);
        }
        row.classList.toggle("active", frame2.id === state.activeFrameId);
        row.setAttribute("aria-pressed", String(frame2.id === state.activeFrameId));
        row.setAttribute("aria-label", `${i + 1}. ${frame2.name} \xB7 ${frame2.durationMs} ms`);
        row.querySelector("strong").textContent = `${i + 1} \xB7 ${frame2.name}`;
        row.querySelector("span").textContent = `${frame2.durationMs} ms`;
        if (dirtyThumbnails.has(frame2.id)) draw(row.querySelector("canvas"), frameRaster(i), true);
        return row;
      }));
      dirtyThumbnails.clear();
      const frame = state ? active(state) : void 0;
      field3("frame-duration").value = String(frame?.durationMs ?? 100);
      field3("frame-name").value = frame?.name ?? "Frame 1";
      field3("animation-loop").checked = state?.loop ?? true;
      select2("animation-direction").value = state?.direction ?? "forward";
      const index = state?.frames.findIndex((frame2) => frame2.id === state.activeFrameId) ?? 0;
      button2("remove-frame").disabled = !state || state.frames.length <= 1;
      button2("frame-left").disabled = !state || index === 0;
      button2("frame-right").disabled = !state || index === state.frames.length - 1;
      if (state && !playing) {
        draw(player, frameRaster(index));
        el3("animation-playhead").textContent = `${index + 1} / ${state.frames.length}`;
      }
    }
    const key = `${version}:${field3("onion-skin").checked}:${field3("onion-opacity").value}`;
    if (key !== onionVersion) {
      onionVersion = key;
      onion.hidden = !state || !field3("onion-skin").checked;
      if (state && !onion.hidden) {
        const index = state.frames.findIndex((frame) => frame.id === state.activeFrameId);
        const neighbors = [], previous = Math.max(0, index - 1), next = Math.min(state.frames.length - 1, index + 1);
        for (let i = previous; i <= next; i++) neighbors.push(frameRaster(i));
        draw(onion, createPixelArtOnionSkin2D(neighbors, index - previous, { previous: 1, next: 1, opacity: Number(field3("onion-opacity").value) }));
      }
    }
    onion.style.width = result.style.width;
    onion.style.height = result.style.height;
    if (state) {
      button2("undo").disabled = !history2.canUndo;
      button2("redo").disabled = !history2.canRedo;
    }
  }
  return {
    get enabled() {
      return !!state;
    },
    sync,
    stop,
    commitFrame(document2) {
      if (state) commit(replacePixelArtAnimationFrame2D(state, document2));
    },
    newDocument(document2) {
      if (state) commit(createPixelArtAnimation2D(document2), true);
    },
    close() {
      stop();
      state = void 0;
      history2 = void 0;
      playbackFrames = void 0;
      cache.clear();
      cacheBytes = 0;
      version++;
      onionVersion = "";
      player.getContext("2d").clearRect(0, 0, player.width, player.height);
      el3("animation-playhead").textContent = "\uD504\uB808\uC784\uC744 \uCD94\uAC00\uD558\uAC70\uB098 \uBCF5\uC81C\uD558\uC138\uC694";
      host.refresh();
    },
    open(json) {
      const next = parsePixelArtAnimation2D(json);
      if (next.width > 4096 || next.height > 4096) throw new RangeError("\uBE0C\uB77C\uC6B0\uC800 \uC791\uC5C5\uC2E4\uC5D0\uC11C\uB294 \uAC00\uB85C\xB7\uC138\uB85C 4096\uD53D\uC140 \uC774\uD558\uC758 \uD504\uB85C\uC81D\uD2B8\uB97C \uC0AC\uC6A9\uD574 \uC8FC\uC138\uC694.");
      const raster = renderPixelArtDocument2D(active(next).document), nextHistory = new PixelArtAnimationHistory2D(next);
      stop();
      playbackFrames = void 0;
      state = next;
      history2 = nextHistory;
      cache.clear();
      cacheBytes = 0;
      for (const frame of state.frames) dirtyThumbnails.add(frame.id);
      showActive(raster);
    },
    serialize() {
      return state ? serializePixelArtAnimation2D(replacePixelArtAnimationFrame2D(state, host.outputDocument())) : void 0;
    },
    undo() {
      if (history2) {
        stop();
        playbackFrames = void 0;
        state = history2.undo();
        for (const frame of state.frames) dirtyThumbnails.add(frame.id);
        showActive();
      }
    },
    redo() {
      if (history2) {
        stop();
        playbackFrames = void 0;
        state = history2.redo();
        for (const frame of state.frames) dirtyThumbnails.add(frame.id);
        showActive();
      }
    }
  };
}

// gallery/pixel-art-viewport.ts
function installPixelArtViewport() {
  const zoom = document.getElementById("zoom");
  const levels = [1, 2, 4, 8, 16, 32];
  function changeZoom(direction, host, at) {
    const canvas2 = host?.querySelector("canvas#source,canvas#result") ?? document.getElementById("result");
    const rect = canvas2.getBoundingClientRect(), current = zoom.value === "auto" ? rect.width / canvas2.width : Number(zoom.value);
    const next = direction > 0 ? levels.find((n) => n > current) ?? levels.at(-1) : [...levels].reverse().find((n) => n < current) ?? 1;
    const anchor = at ? { x: (at.x - rect.left) / rect.width, y: (at.y - rect.top) / rect.height } : void 0;
    zoom.value = String(next);
    zoom.dispatchEvent(new Event("change"));
    if (host && at && anchor) requestAnimationFrame(() => {
      const after = canvas2.getBoundingClientRect();
      host.scrollLeft += after.left + anchor.x * after.width - at.x;
      host.scrollTop += after.top + anchor.y * after.height - at.y;
    });
  }
  for (const id of ["source-host", "result-host"]) {
    const host = document.getElementById(id);
    let pan;
    host.addEventListener("pointerdown", (event) => {
      if (event.button !== 1) return;
      event.preventDefault();
      pan = { id: event.pointerId, x: event.clientX, y: event.clientY, left: host.scrollLeft, top: host.scrollTop };
      host.setPointerCapture(event.pointerId);
      host.classList.add("panning");
    });
    host.addEventListener("pointermove", (event) => {
      if (!pan || pan.id !== event.pointerId) return;
      host.scrollLeft = pan.left + pan.x - event.clientX;
      host.scrollTop = pan.top + pan.y - event.clientY;
    });
    const release = () => {
      const previous = pan;
      pan = void 0;
      host.classList.remove("panning");
      if (previous && host.hasPointerCapture(previous.id)) host.releasePointerCapture(previous.id);
    };
    host.addEventListener("pointerup", release);
    host.addEventListener("pointercancel", release);
    host.addEventListener("lostpointercapture", release);
    host.addEventListener("wheel", (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      changeZoom(event.deltaY < 0 ? 1 : -1, host, { x: event.clientX, y: event.clientY });
    }, { passive: false });
  }
  window.addEventListener("keydown", (event) => {
    if (event.target.closest('input,select,textarea,[contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      changeZoom(1);
    }
    if (event.key === "-") {
      event.preventDefault();
      changeZoom(-1);
    }
    if (event.key === "1") {
      event.preventDefault();
      zoom.value = "1";
      zoom.dispatchEvent(new Event("change"));
    }
    if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      const size = document.getElementById("paint-size");
      size.value = String(Math.max(1, Math.min(64, Number(size.value) + (event.key === "[" ? -1 : 1))));
    }
  });
}

// gallery/png-import.ts
var MAX_FILE_BYTES = 16 * 1024 * 1024;
var MAX_DIMENSION = 512;
var SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
var CRC = new Uint32Array(256);
for (let n = 0; n < CRC.length; n++) {
  let c = n;
  for (let bit = 0; bit < 8; bit++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
  CRC[n] = c >>> 0;
}
function crc32(bytes) {
  let crc = 4294967295;
  for (const byte of bytes) crc = CRC[(crc ^ byte) & 255] ^ crc >>> 8;
  return (crc ^ 4294967295) >>> 0;
}
function paeth(a, b, c) {
  const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
}
function view(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
async function inflate(blocks, expected) {
  if (typeof DecompressionStream === "undefined") throw new Error("Native PNG import requires DecompressionStream support.");
  const compressed = new Uint8Array(blocks.reduce((sum, block) => sum + block.length, 0));
  let end = 0;
  for (const block of blocks) {
    compressed.set(block, end);
    end += block.length;
  }
  let position = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (position === compressed.length) {
        controller.close();
        return;
      }
      const next = Math.min(position + 4096, compressed.length);
      controller.enqueue(compressed.subarray(position, next));
      position = next;
    }
  }).pipeThrough(new DecompressionStream("deflate"));
  const reader = stream.getReader(), raw = new Uint8Array(expected);
  let written = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value.length > expected - written) throw new Error("PNG inflated data exceeds its declared dimensions.");
      raw.set(value, written);
      written += value.length;
    }
  } catch (error) {
    await reader.cancel().catch(() => {
    });
    if (error instanceof Error && error.message.startsWith("PNG inflated data")) throw error;
    throw new Error("Invalid or truncated PNG compressed data.");
  } finally {
    reader.releaseLock();
  }
  if (written !== expected) throw new Error("PNG inflated data length does not match its dimensions.");
  return raw;
}
function passesFor(w, h, channels, depth, interlace) {
  const patterns = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  return patterns.map(([x, y, dx, dy]) => {
    const width = Math.max(0, Math.ceil((w - x) / dx)), height = Math.max(0, Math.ceil((h - y) / dy));
    return { w: width, h: height, rowBytes: Math.ceil(width * channels * depth / 8) };
  }).filter((pass) => pass.w > 0 && pass.h > 0);
}
async function decodePixelArtPNG(png) {
  if (!(png instanceof Uint8Array) || png.length < 8 || SIGNATURE.some((value, i) => png[i] !== value))
    throw new Error("Invalid PNG signature.");
  if (png.length > MAX_FILE_BYTES) throw new Error("PNG exceeds the 16 MiB file limit.");
  const bytes = view(png);
  let w = 0, h = 0, depth = 0, color = -1, channels = 0, interlace = 0;
  let seenHeader = false, seenData = false, dataEnded = false, seenEnd = false, chunkCount = 0;
  let palette2, transparency;
  const blocks = [], profiles = /* @__PURE__ */ new Set();
  for (let offset2 = 8; offset2 < png.length; ) {
    if (++chunkCount > 65536) throw new Error("PNG exceeds the 65,536 chunk import limit.");
    if (png.length - offset2 < 12) throw new Error("Truncated PNG chunk header or CRC.");
    const length = bytes.getUint32(offset2);
    if (length > 2147483647 || length > png.length - offset2 - 12) throw new Error("PNG chunk length exceeds file bounds.");
    const typeBytes = png.subarray(offset2 + 4, offset2 + 8), type = String.fromCharCode(...typeBytes);
    if (typeBytes.some((value) => !(value >= 65 && value <= 90 || value >= 97 && value <= 122)) || typeBytes[2] & 32)
      throw new Error("Invalid PNG chunk type.");
    const data = png.subarray(offset2 + 8, offset2 + 8 + length);
    if (crc32(png.subarray(offset2 + 4, offset2 + 8 + length)) !== bytes.getUint32(offset2 + 8 + length))
      throw new Error(`PNG CRC mismatch in ${type}.`);
    if (!seenHeader && type !== "IHDR") throw new Error("PNG IHDR must be the first chunk.");
    if (seenData && type !== "IDAT") dataEnded = true;
    if (type === "acTL" || type === "fcTL" || type === "fdAT")
      throw new Error("Animated PNG (APNG) is not a single artwork; import a PNG sprite sheet instead.");
    switch (type) {
      case "IHDR": {
        if (seenHeader || length !== 13) throw new Error("PNG requires exactly one 13-byte IHDR.");
        seenHeader = true;
        w = view(data).getUint32(0);
        h = view(data).getUint32(4);
        depth = data[8];
        color = data[9];
        interlace = data[12];
        if (!w || !h || w > MAX_DIMENSION || h > MAX_DIMENSION)
          throw new Error("PNG dimensions must be within 1..512 native cells per axis.");
        if (data[10] !== 0 || data[11] !== 0) throw new Error("Invalid PNG compression or filter method.");
        if (interlace !== 0 && interlace !== 1) throw new Error("Invalid PNG interlace method.");
        const allowed = color === 0 ? [1, 2, 4, 8, 16] : color === 3 ? [1, 2, 4, 8] : [2, 4, 6].includes(color) ? [8, 16] : [];
        if (!allowed.includes(depth)) throw new Error(`Invalid PNG color type ${color} / bit depth ${depth}.`);
        channels = color === 0 || color === 3 ? 1 : color === 2 ? 3 : color === 4 ? 2 : 4;
        break;
      }
      case "PLTE":
        if (palette2 || seenData || transparency || color === 0 || color === 4 || !length || length % 3 || length > 768 || color === 3 && length / 3 > 2 ** depth)
          throw new Error("Invalid PNG palette size, color type, or chunk order.");
        palette2 = data.slice();
        break;
      case "tRNS":
        if (transparency || seenData) throw new Error("Duplicate or misplaced PNG tRNS chunk.");
        if (color === 3 ? !palette2 || length > palette2.length / 3 : color === 0 ? length !== 2 : color === 2 ? length !== 6 : true)
          throw new Error("Invalid PNG tRNS transparency for its color type.");
        transparency = data.slice();
        break;
      case "IDAT":
        if (dataEnded) throw new Error("PNG IDAT chunks must be consecutive.");
        if (color === 3 && !palette2) throw new Error("Indexed PNG is missing its PLTE palette.");
        seenData = true;
        blocks.push(data);
        break;
      case "IEND":
        if (length !== 0 || !seenData) throw new Error("Invalid PNG IEND or missing image data.");
        if (offset2 + 12 !== png.length) throw new Error("Unexpected bytes after PNG IEND.");
        seenEnd = true;
        break;
      default:
        if (!(typeBytes[0] & 32)) throw new Error(`Unsupported critical PNG chunk ${type}.`);
        if (["iCCP", "sRGB", "gAMA", "cHRM", "cICP", "mDCV", "cLLI"].includes(type)) profiles.add(type);
    }
    offset2 += length + 12;
  }
  if (!seenEnd) throw new Error("PNG is missing IEND.");
  const passes = passesFor(w, h, channels, depth, interlace);
  const expected = passes.reduce((sum, pass) => sum + (pass.rowBytes + 1) * pass.h, 0);
  const raw = await inflate(blocks, expected), bytesPerPixel = Math.max(1, Math.ceil(channels * depth / 8));
  let offset = 0;
  for (const pass of passes) {
    for (let y = 0; y < pass.h; y++) {
      const start = offset + y * (pass.rowBytes + 1) + 1, previous = start - pass.rowBytes - 1, filter = raw[start - 1];
      if (filter > 4) throw new Error(`Invalid PNG row filter ${filter}.`);
      for (let x = 0; x < pass.rowBytes; x++) {
        const left = x >= bytesPerPixel ? raw[start + x - bytesPerPixel] : 0;
        const up = y ? raw[previous + x] : 0, upperLeft = y && x >= bytesPerPixel ? raw[previous + x - bytesPerPixel] : 0;
        const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, upperLeft);
        raw[start + x] = raw[start + x] + predictor & 255;
      }
      if (color === 3) for (let x = 0; x < pass.w; x++) {
        const bit = x * depth, index = raw[start + (bit >>> 3)] >>> 8 - depth - (bit & 7) & (1 << depth) - 1;
        if (index * 3 >= palette2.length) throw new Error(`PNG palette index ${index} is out of bounds.`);
      }
    }
    offset += (pass.rowBytes + 1) * pass.h;
  }
  const warnings = profiles.size ? [`PNG color-profile chunks (${[...profiles].join(", ")}) were not transformed; encoded straight samples are preserved.`] : [];
  if (depth === 16 || interlace === 1)
    return { kind: "unsupported", w, h, reason: depth === 16 ? "16-bit" : "adam7", warnings };
  const pixels = new Uint32Array(w * h), rowBytes = passes[0].rowBytes, sampleMask = (1 << depth) - 1;
  const keys = transparency && color !== 3 ? Array.from({ length: color === 0 ? 1 : 3 }, (_, i) => view(transparency).getUint16(i * 2) & sampleMask) : void 0;
  for (let y = 0; y < h; y++) {
    const start = y * (rowBytes + 1) + 1;
    for (let x = 0; x < w; x++) {
      const input2 = start + x * channels;
      let r, g, b, a;
      if (color === 3) {
        const bit = x * depth, index = raw[start + (bit >>> 3)] >>> 8 - depth - (bit & 7) & sampleMask;
        r = palette2[index * 3];
        g = palette2[index * 3 + 1];
        b = palette2[index * 3 + 2];
        a = transparency && index < transparency.length ? transparency[index] : 255;
      } else if (color === 0 || color === 4) {
        const bit = x * depth, sample = depth < 8 ? raw[start + (bit >>> 3)] >>> 8 - depth - (bit & 7) & sampleMask : raw[input2];
        r = g = b = Math.round(sample * 255 / sampleMask);
        a = color === 4 ? raw[input2 + 1] : keys && sample === keys[0] ? 0 : 255;
      } else {
        r = raw[input2];
        g = raw[input2 + 1];
        b = raw[input2 + 2];
        a = color === 6 ? raw[input2 + 3] : keys && r === keys[0] && g === keys[1] && b === keys[2] ? 0 : 255;
      }
      pixels[y * w + x] = (r | g << 8 | b << 16 | a << 24) >>> 0;
    }
  }
  return { kind: "decoded", w, h, pixels, warnings };
}

// gallery/pixel-art-lab.ts
var element = (id) => document.getElementById(id);
var input = (id) => element(id);
var select3 = (id) => element(id);
var button3 = (id) => element(id);
var number = (id) => Number(input(id).value);
var canvas = (id) => element(id);
var labels = { stone: "\uB3CC", metal: "\uAE08\uC18D", wood: "\uB098\uBB34", fabric: "\uCC9C", crystal: "\uC218\uC815" };
var rangeIds = ["scale", "detail", "relief", "bevel", "roughness", "light-angle", "light-height", "ambient", "grain-angle", "ambient-occlusion", "cast-shadow"];
var project;
var committed;
var rendered;
var selection;
var protectedMask;
var authoredHeight;
var sourceAuthoredHeight;
var draft = true;
var queued = false;
var busy = false;
var workingOptions = {};
var materialOrigin;
var history;
var revision = 0;
var renderedRevision = -1;
var paintPreview;
var editingMaterialId;
var workbench;
var timeline;
var protectionVersion = 0;
var beforeAnalysisKey = "";
var beforeAnalysis;
var previewVersion = 0;
var outputKey = "";
var cachedOutput;
var afterAnalysis;
var analysisSource;
var analysisKey = "";
var outputDocumentKey = "";
var outputDocumentCache;
var urls = [];
function status(message, error = false) {
  element("status").textContent = message;
  element("status").classList.toggle("error", error);
}
function attempt(fn) {
  try {
    fn();
  } catch (error) {
    status(error instanceof Error ? error.message : String(error), true);
  }
}
function colorHex(c) {
  return typeof c === "string" ? c : "#" + [c & 255, c >>> 8 & 255, c >>> 16 & 255].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function palette(colors) {
  element("palette").replaceChildren(...colors.map((c, i) => {
    const swatch = document.createElement("input");
    swatch.type = "color";
    swatch.value = colorHex(c);
    swatch.setAttribute("aria-label", `\uD314\uB808\uD2B8 ${i + 1}`);
    swatch.title = `\uD314\uB808\uD2B8 ${i + 1}`;
    swatch.addEventListener("input", () => {
      workingOptions.palette = Array.from(element("palette").querySelectorAll("input"), (v) => v.value);
      changed();
    });
    return swatch;
  }));
}
function settings() {
  return structuredClone(workingOptions);
}
function matchTilePeriodToCanvas() {
  if (project.width < 2 || project.height < 2) {
    delete workingOptions.tileSize;
    input("seamless-material").checked = false;
    element("tile-material-note").textContent = "\uBC18\uBCF5 \uC7AC\uC9C8\uC740 \uAC00\uB85C\xB7\uC138\uB85C\uAC00 \uBAA8\uB450 2\uD53D\uC140 \uC774\uC0C1\uC778 \uCE94\uBC84\uC2A4\uC5D0\uC11C \uC0AC\uC6A9\uD569\uB2C8\uB2E4.";
    return;
  }
  workingOptions = { ...workingOptions, tileSize: [project.width, project.height], bevel: 0 };
  input("seamless-material").checked = true;
  input("bevel").value = "0";
  element("tile-material-note").textContent = `${project.width} \xD7 ${project.height} px \uAC04\uACA9\uC73C\uB85C \uBB34\uB2AC\uAC00 \uBC18\uBCF5\uB429\uB2C8\uB2E4. \uC804\uCCB4\uB97C \uCC44\uC6B4 \uD0C0\uC77C\uC5D0\uC11C \uC0AC\uC6A9\uD558\uC138\uC694.`;
}
function loadSettings(options) {
  const p = createPixelMaterial2D(options).options;
  workingOptions = structuredClone(p);
  for (const id of rangeIds) input(id).step = "any";
  select3("material").value = p.kind;
  for (const id of ["seed", "scale", "detail", "relief", "bevel", "roughness", "ambient"]) {
    const control = input(id), value = Number(p[id]);
    if (control.type === "range") {
      control.min = String(Math.min(Number(control.min), value));
      control.max = String(Math.max(Number(control.max), value));
    }
    control.value = String(value);
  }
  input("light-angle").value = String(Math.atan2(p.light[1], p.light[0]) * 180 / Math.PI);
  input("light-height").value = String(Math.atan2(p.light[2], Math.hypot(p.light[0], p.light[1])) * 180 / Math.PI);
  input("grain-angle").value = String(((p.grainAngle * 180 / Math.PI + 180) % 360 + 360) % 360 - 180);
  input("ambient-occlusion").value = String(p.ambientOcclusion);
  input("cast-shadow").value = String(p.castShadow);
  input("seamless-material").checked = !!p.tileSize;
  element("tile-material-note").textContent = p.tileSize ? `${p.tileSize[0]} \xD7 ${p.tileSize[1]} px \uAC04\uACA9\uC73C\uB85C \uBB34\uB2AC\uAC00 \uBC18\uBCF5\uB429\uB2C8\uB2E4. 3 \xD7 3 \uD0C0\uC77C \uBCF4\uAE30\uB85C \uACBD\uACC4\uB97C \uD655\uC778\uD558\uC138\uC694.` : "\uBC18\uBCF5 \uBB34\uB2AC\uB97C \uB9CC\uB4E4 \uB54C \uC0AC\uC6A9\uD569\uB2C8\uB2E4. \uCF1C\uBA74 \uAC00\uC7A5\uC790\uB9AC \uC785\uCCB4\uAC10\uC740 0\uC774 \uB429\uB2C8\uB2E4.";
  palette(p.palette);
}
function editSetting(id) {
  if (input(id).type === "range") input(id).value = String(Math.round(number(id) * 1e3) / 1e3);
  if (id === "light-angle" || id === "light-height") {
    const a = number("light-angle") * Math.PI / 180, e = number("light-height") * Math.PI / 180;
    workingOptions.light = [Math.cos(a) * Math.cos(e), Math.sin(a) * Math.cos(e), Math.sin(e)];
  } else if (id === "grain-angle") workingOptions.grainAngle = number(id) * Math.PI / 180;
  else if (id === "ambient-occlusion") workingOptions.ambientOcclusion = number(id);
  else if (id === "cast-shadow") workingOptions.castShadow = number(id);
  else if (id === "seamless-material") {
    if (input(id).checked) matchTilePeriodToCanvas();
    else {
      delete workingOptions.tileSize;
      element("tile-material-note").textContent = "\uBC18\uBCF5 \uC7AC\uC9C8\uC744 \uAED0\uC2B5\uB2C8\uB2E4.";
    }
  } else if (id !== "use-height") workingOptions = { ...workingOptions, [id]: number(id) };
  changed();
}
function pendingLayer() {
  const existing = project.layers.find((layer) => layer.id === editingMaterialId);
  return {
    kind: "material",
    id: editingMaterialId ?? nextPixelArtLayerId2D(project, "material"),
    name: existing?.name ?? `${labels[select3("material").value]} \xB7 ${number("seed")}`,
    ...existing?.visible !== void 0 ? { visible: existing.visible } : {},
    ...existing?.locked !== void 0 ? { locked: existing.locked } : {},
    material: settings(),
    selection: Array.from(selection),
    protectedMask: Array.from(protectedMask),
    ...materialOrigin ? { origin: [...materialOrigin] } : {},
    ...input("use-height").checked && authoredHeight ? { height: Array.from(authoredHeight) } : {}
  };
}
function canAddLayer() {
  return !!editingMaterialId || !project || project.layers.length < pixelArtLayerLimit2D(project.width, project.height);
}
function canEditMasks() {
  return canAddLayer() || project.layers.some((layer) => layer.kind === "paint" && !layer.locked && layer.visible !== false);
}
function outputProject() {
  const key = `${revision}:${previewVersion}:${draft}:${editingMaterialId ?? ""}`;
  if (outputDocumentCache && outputDocumentKey === key) return outputDocumentCache;
  const layers = draft && canAddLayer() ? editingMaterialId ? project.layers.map((layer) => layer.id === editingMaterialId ? pendingLayer() : layer) : [...project.layers, pendingLayer()] : project.layers;
  outputDocumentKey = key;
  return outputDocumentCache = { ...project, layers, selection: Array.from(selection), protectedMask: Array.from(protectedMask), ...sourceAuthoredHeight ? { authoredHeight: Array.from(sourceAuthoredHeight) } : {} };
}
function resetHistory() {
  const { activeLayerId, ...base } = project;
  history = new PixelArtDocumentHistory2D({ ...base, layers: [] });
  for (let i = 1; i <= project.layers.length; i++) history.commit({ ...base, layers: project.layers.slice(0, i), ...activeLayerId && project.layers.slice(0, i).some((layer) => layer.id === activeLayerId) ? { activeLayerId } : {} });
  if (!project.layers.length) history = new PixelArtDocumentHistory2D(project);
}
function commitDocument(next) {
  if (timeline?.enabled) {
    timeline.commitFrame(next);
    return;
  }
  const raster = renderPixelArtDocument2D(next);
  element("status").classList.remove("error");
  if (history.commit(next)) {
    project = history.value;
    revision++;
    committed = raster;
    renderedRevision = revision;
  }
  if (next.selection) selection = Uint8Array.from(next.selection);
  if (next.protectedMask) {
    protectedMask = Uint8Array.from(next.protectedMask);
    protectionVersion++;
  }
  sourceAuthoredHeight = next.authoredHeight ? Float32Array.from(next.authoredHeight) : void 0;
  authoredHeight = renderPixelArtAuthoredHeight2D(next);
  draft = false;
  editingMaterialId = void 0;
  paintPreview = void 0;
  schedule();
}
function moveHistory(direction) {
  if (timeline?.enabled) {
    timeline[direction]();
    return;
  }
  prepareImported(direction === "undo" ? history.undo() : history.redo(), false);
}
function sizeCanvases() {
  const dpr = window.devicePixelRatio || 1, requested = select3("zoom").value;
  for (const id of ["source", "result"]) {
    const c = canvas(id), host = element(id + "-host");
    const scale = requested === "auto" ? Math.max(1, Math.floor(Math.min((host.clientWidth - 12) * dpr / c.width, (host.clientHeight - 12) * dpr / c.height))) : Number(requested) * dpr;
    const integerScale = Math.max(1, Math.floor(scale));
    c.style.width = `${c.width * integerScale / dpr}px`;
    c.style.height = `${c.height * integerScale / dpr}px`;
    host.style.justifyContent = c.width * integerScale / dpr > host.clientWidth ? "flex-start" : "center";
    host.style.alignItems = c.height * integerScale / dpr > host.clientHeight ? "flex-start" : "center";
  }
}
function paint(id, sprite, mode = "color", heatmap) {
  const c = canvas(id);
  c.width = sprite.w;
  c.height = sprite.h;
  const ctx = c.getContext("2d"), image = ctx.createImageData(c.width, c.height);
  const channels = sprite.channels;
  let low = Infinity, high = -Infinity;
  if (mode === "height" && channels) {
    for (let i = 0; i < sprite.pixels.length; i++) if (sprite.pixels[i] >>> 24) {
      low = Math.min(low, channels.height[i]);
      high = Math.max(high, channels.height[i]);
    }
  }
  for (let i = 0; i < sprite.pixels.length; i++) {
    const packed2 = sprite.pixels[i], j = i * 4, x = i % sprite.w, y = Math.floor(i / sprite.w);
    let r = packed2 & 255, g = packed2 >>> 8 & 255, b = packed2 >>> 16 & 255;
    if (mode === "value") r = g = b = Math.round(r * 0.2126 + g * 0.7152 + b * 0.0722);
    if (mode === "height") r = g = b = channels ? Math.round((channels.height[i] - low) / (high - low || 1) * 255) : 0;
    if (mode === "normal") {
      r = channels ? Math.round((channels.normal[i * 3] + 1) * 127.5) : 127;
      g = channels ? Math.round((channels.normal[i * 3 + 1] + 1) * 127.5) : 127;
      b = channels ? Math.round((channels.normal[i * 3 + 2] + 1) * 127.5) : 255;
    }
    if (mode === "analysis" && heatmap?.[i]) {
      const flag = heatmap[i];
      r = flag & 1 ? 235 : 100;
      g = flag & 2 ? 207 : 119;
      b = flag & 4 ? 240 : 80;
    }
    if (id === "source" && packed2 >>> 24) {
      if (protectedMask[i]) {
        r = Math.round(r * 0.35 + 206 * 0.65);
        g = Math.round(g * 0.35 + 139 * 0.65);
        b = Math.round(b * 0.35 + 248 * 0.65);
      } else if (selection[i] && (x > 0 && !selection[i - 1] || x + 1 < sprite.w && !selection[i + 1] || y > 0 && !selection[i - sprite.w] || y + 1 < sprite.h && !selection[i + sprite.w])) {
        r = 160;
        g = 223;
        b = 188;
      }
    }
    image.data.set([r, g, b, sprite.mask.data[i] ? packed2 >>> 24 : 0], j);
  }
  ctx.putImageData(image, 0, 0);
}
function update() {
  queued = false;
  let valid = false;
  attempt(() => {
    const hasLayerRoom = canAddLayer();
    if (!hasLayerRoom) draft = false;
    for (const control of document.querySelectorAll(".inspector input,.inspector select,#new-seed,#reset-palette")) control.disabled = !hasLayerRoom;
    for (const control of document.querySelectorAll(".selection-bar input,.selection-bar select,.selection-bar button")) control.disabled = !canEditMasks();
    input("use-height").disabled = !hasLayerRoom || !authoredHeight;
    canvas("source").setAttribute("aria-disabled", String(!canEditMasks()));
    canvas("source").style.cursor = canEditMasks() ? "crosshair" : "default";
    for (const id of rangeIds) {
      const out = element(id + "-value"), value = number(id), rounded = Math.round(value * 1e3) / 1e3;
      out.textContent = (value !== rounded ? "\u2248" : "") + String(rounded) + (["light-angle", "light-height", "grain-angle"].includes(id) ? "\xB0" : id === "scale" || id === "bevel" ? " px" : "");
      out.title = String(value);
    }
    const started = performance.now();
    if (renderedRevision !== revision) {
      committed = renderPixelArtDocument2D(project);
      renderedRevision = revision;
    }
    const nextOutputKey = `${revision}:${previewVersion}:${draft}:${editingMaterialId ?? ""}`;
    if (!cachedOutput || outputKey !== nextOutputKey) {
      cachedOutput = draft ? editingMaterialId ? renderPixelArtDocument2D(outputProject()) : createPixelMaterial2D(settings()).shade(committed, pendingLayer()) : committed;
      outputKey = nextOutputKey;
    }
    rendered = paintPreview ?? cachedOutput;
    const style = select3("expected-style").value;
    const options = { expectedStyle: style, protected: protectedMask };
    const key = `${revision}:${style}:${protectionVersion}`;
    if (key !== beforeAnalysisKey || !beforeAnalysis) {
      beforeAnalysis = diagnosePixelArt2D(committed, options);
      beforeAnalysisKey = key;
    }
    if (!afterAnalysis || !paintPreview && (analysisSource !== rendered || analysisKey !== key)) {
      afterAnalysis = diagnosePixelArt2D(rendered, options);
      analysisSource = rendered;
      analysisKey = key;
    }
    const before = beforeAnalysis, after = afterAnalysis;
    paint("source", committed);
    paint("result", rendered, select3("view").value, after.heatmap);
    sizeCanvases();
    element("source-size").textContent = `${project.width} \xD7 ${project.height}`;
    element("metric-flat").textContent = `${(after.metrics.dominantFlatRegionRatio * 100).toFixed(1)}%`;
    element("metric-flat-before").textContent = `\uC801\uC6A9 \uC804 ${(before.metrics.dominantFlatRegionRatio * 100).toFixed(1)}%`;
    element("metric-colors").textContent = String(after.metrics.paletteSize);
    element("metric-colors-before").textContent = `\uC801\uC6A9 \uC804 ${before.metrics.paletteSize}\uC0C9`;
    element("metric-edge").textContent = `${after.metrics.longestStraightRun} px`;
    element("metric-noise").textContent = `${(after.metrics.isolatedColorRatio * 100).toFixed(1)}%`;
    const descriptions = { "flat-region": "\uBE44\uC2B7\uD55C \uC0C9\uC774 \uC5F0\uACB0\uB41C \uB113\uC740 \uBA74", "straight-contour": "\uAE38\uAC8C \uC774\uC5B4\uC9C0\uB294 \uC9C1\uC120 \uC724\uACFD", "color-noise": "\uC8FC\uBCC0\uACFC \uB5A8\uC5B4\uC9C4 \uC791\uC740 \uC0C9 \uC810" };
    element("issues").replaceChildren(...after.issues.slice(0, 5).map((issue) => {
      const li = document.createElement("li");
      li.textContent = `${descriptions[issue.kind]} \xB7 (${issue.x}, ${issue.y}) \xB7 ${issue.area} px`;
      return li;
    }));
    if (!after.issues.length) {
      const li = document.createElement("li");
      li.textContent = "\uD604\uC7AC \uAE30\uC900\uC5D0\uC11C \uBCC4\uB3C4\uB85C \uD45C\uC2DC\uD560 \uAC80\uD1A0 \uC704\uCE58\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.";
      element("issues").append(li);
    }
    const count = selection.reduce((n, v, i) => n + Number(v > 0 && !protectedMask[i] && committed.mask.data[i] > 0 && committed.pixels[i] >>> 24 > 0), 0);
    element("selection-count").textContent = `\uC120\uD0DD ${count.toLocaleString()} px \xB7 \uBCF4\uD638 ${protectedMask.reduce((n, v) => n + Number(v > 0), 0).toLocaleString()} px`;
    element("render-state").textContent = draft ? "PREVIEW" : "APPLIED";
    element("result-caption").textContent = !hasLayerRoom ? "\uC801\uC6A9\uD55C \uACB0\uACFC\uB97C \uD45C\uC2DC\uD569\uB2C8\uB2E4. \uC2E4\uD589 \uCDE8\uC18C\uB85C \uB808\uC774\uC5B4\uB97C \uC904\uC774\uBA74 \uC7AC\uC9C8 \uD3B8\uC9D1\uC744 \uACC4\uC18D\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." : draft ? "\uC124\uC815\uC744 \uBC14\uAFD4 \uBE44\uAD50\uD55C \uB4A4, \uC120\uD0DD \uC601\uC5ED\uC5D0 \uC7AC\uC9C8\uC744 \uC801\uC6A9\uD558\uC138\uC694." : "\uC801\uC6A9\uD55C \uB808\uC774\uC5B4\uB97C \uC6D0\uBCF8\uC5D0\uC11C \uB2E4\uC2DC \uACC4\uC0B0\uD55C \uACB0\uACFC\uC785\uB2C8\uB2E4.";
    element("layer-count").textContent = String(project.layers.length);
    workbench?.sync();
    element("empty-layers").hidden = project.layers.length > 0;
    button3("undo").disabled = !history.canUndo;
    button3("redo").disabled = !history.canRedo;
    timeline?.sync();
    button3("apply-material").disabled = !draft || !count || !hasLayerRoom;
    button3("apply-material").textContent = editingMaterialId ? "\uC218\uC815\uD55C \uC7AC\uC9C8 \uC801\uC6A9" : "\uC120\uD0DD \uC601\uC5ED\uC5D0 \uC7AC\uC9C8 \uC801\uC6A9";
    button3("cancel-preview").disabled = !draft;
    if (!element("status").classList.contains("error")) status(hasLayerRoom ? `${paintPreview ? "\uD3B8\uC9D1 \uC911" : draft ? "\uBBF8\uB9AC\uBCF4\uAE30" : "\uC801\uC6A9 \uC644\uB8CC"} \xB7 ${Math.round(performance.now() - started)} ms \xB7 ${after.metrics.paletteSize}\uC0C9` : `\uC774 \uD574\uC0C1\uB3C4\uC758 \uB808\uC774\uC5B4 \uD55C\uB3C4 ${pixelArtLayerLimit2D(project.width, project.height)}\uAC1C \xB7 \uC2E4\uD589 \uCDE8\uC18C\uD558\uBA74 \uACC4\uC18D \uD3B8\uC9D1\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`);
    element("result").dataset.ready = "true";
    valid = true;
  });
  return valid;
}
function schedule() {
  if (!queued) {
    queued = true;
    requestAnimationFrame(update);
  }
}
function changed() {
  element("status").classList.remove("error");
  paintPreview = void 0;
  previewVersion++;
  draft = canAddLayer();
  schedule();
}
function study() {
  const shape = select3("shape").value;
  if (shape === "imported") return;
  timeline?.close();
  const result = createPixelArtStudy2D(shape, number("seed"), input("organic").checked);
  project = { ...createPixelArtDocument2D(result.sprite, `POKU ${shape}`), authoredHeight: Array.from(result.height) };
  sourceAuthoredHeight = result.height;
  authoredHeight = result.height;
  materialOrigin = void 0;
  editingMaterialId = void 0;
  paintPreview = void 0;
  selection = result.sprite.mask.data.slice();
  protectedMask = new Uint8Array(selection.length);
  resetHistory();
  revision++;
  draft = true;
  input("use-height").disabled = false;
  input("use-height").checked = true;
  input("organic").disabled = !["stone-path", "boulder"].includes(shape);
  schedule();
}
function resetMaterial() {
  const kind = select3("material").value;
  const seed = number("seed");
  loadSettings({ kind, seed, roughness: kind === "metal" ? 0.25 : kind === "crystal" ? 0.3 : 0.65, scale: kind === "fabric" ? 12 : 15, light: [-0.67, -0.74, 0.8], ambient: 0.18 });
  changed();
}
function addDownload(blob, filename2) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  urls.push(url);
  a.href = url;
  a.download = filename2;
  a.textContent = filename2;
  element("downloads").prepend(a);
  a.click();
  while (urls.length > 8) {
    URL.revokeObjectURL(urls.shift());
    element("downloads").lastElementChild?.remove();
  }
  status(`\uC800\uC7A5 \uC900\uBE44 \uC644\uB8CC \xB7 ${filename2}`);
}
function filename() {
  return (project.name.replace(/[^a-z0-9가-힣_-]+/gi, "-").replace(/^-|-$/g, "") || "poku-pixel-art").slice(0, 80);
}
function savePNG() {
  if (!update()) return;
  const rgba = new Uint8Array(rendered.w * rendered.h * 4), name2 = filename() + ".png";
  status("\uB124\uC774\uD2F0\uBE0C PNG \uC778\uCF54\uB529 \uC911\u2026");
  for (let i = 0; i < rendered.pixels.length; i++) {
    const c = rendered.pixels[i];
    rgba.set([c & 255, c >>> 8 & 255, c >>> 16 & 255, rendered.mask.data[i] ? c >>> 24 : 0], i * 4);
  }
  void encodeRGBAPNG(rendered.w, rendered.h, rgba).then((blob) => addDownload(blob, name2)).catch((error) => status(String(error), true));
}
for (const id of [...rangeIds, "seed", "use-height", "seamless-material"]) element(id).addEventListener("input", () => editSetting(id));
for (const id of ["view", "expected-style", "zoom"]) element(id).addEventListener("change", schedule);
select3("material").addEventListener("change", () => attempt(resetMaterial));
select3("shape").addEventListener("change", () => attempt(() => {
  const shape = select3("shape").value;
  if (shape !== "imported") {
    select3("material").value = shape === "blade" ? "metal" : shape === "cloth" ? "fabric" : shape === "crystal" ? "crystal" : "stone";
    select3("expected-style").value = shape === "crystal" ? "geometric" : "organic";
    resetMaterial();
    study();
  }
}));
input("organic").addEventListener("change", () => attempt(study));
button3("new-seed").onclick = () => attempt(() => {
  input("seed").value = String(number("seed") + 1 >>> 0);
  editSetting("seed");
});
button3("reset-palette").onclick = () => attempt(() => {
  workingOptions.palette = [...PIXEL_MATERIAL_PALETTES_2D[select3("material").value]];
  delete workingOptions.thresholds;
  palette(workingOptions.palette);
  changed();
});
button3("select-all").onclick = () => {
  selection = Uint8Array.from(committed.pixels, (c, i) => committed.mask.data[i] && c >>> 24 ? 1 : 0);
  changed();
};
button3("clear-selection").onclick = () => {
  selection.fill(0);
  changed();
};
button3("clear-protection").onclick = () => {
  protectedMask.fill(0);
  protectionVersion++;
  changed();
};
button3("apply-material").onclick = () => attempt(() => {
  if (draft) commitDocument(outputProject());
});
button3("cancel-preview").onclick = () => {
  draft = false;
  editingMaterialId = void 0;
  paintPreview = void 0;
  schedule();
};
button3("undo").onclick = () => attempt(() => moveHistory("undo"));
button3("redo").onclick = () => attempt(() => moveHistory("redo"));
button3("save-png").onclick = () => attempt(savePNG);
button3("save-project").onclick = () => attempt(() => {
  if (update()) addDownload(new Blob([timeline?.serialize() ?? serializePixelArtDocument2D(outputProject())], { type: "application/json" }), filename() + ".poku-pixel-art.json");
});
button3("focus-workspace").onclick = () => {
  const enabled = document.body.classList.toggle("focus-mode");
  button3("focus-workspace").setAttribute("aria-pressed", String(enabled));
  button3("focus-workspace").textContent = enabled ? "\uBE44\uAD50 \uD654\uBA74\uC73C\uB85C" : "\uC791\uC5C5 \uD654\uBA74 \uD655\uB300";
  schedule();
};
button3("import-png").onclick = () => input("png-file").click();
button3("open-project").onclick = () => input("project-file").click();
function prepareImported(next, replaceHistory = true, preparedRaster) {
  if (next.width > 4096 || next.height > 4096) throw new RangeError("\uBE0C\uB77C\uC6B0\uC800 \uC791\uC5C5\uC2E4\uC5D0\uC11C\uB294 \uAC00\uB85C\xB7\uC138\uB85C 4096\uD53D\uC140 \uC774\uD558\uC758 \uD504\uB85C\uC81D\uD2B8\uB97C \uC0AC\uC6A9\uD574 \uC8FC\uC138\uC694.");
  serializePixelArtDocument2D(next);
  const raster = preparedRaster ?? renderPixelArtDocument2D(next);
  element("status").classList.remove("error");
  project = next;
  select3("shape").value = "imported";
  input("organic").disabled = true;
  const last = project.layers.filter((layer) => layer.kind === "material").at(-1);
  sourceAuthoredHeight = next.authoredHeight ? Float32Array.from(next.authoredHeight) : last?.height ? Float32Array.from(last.height) : void 0;
  authoredHeight = renderPixelArtAuthoredHeight2D(sourceAuthoredHeight && !next.authoredHeight ? { ...next, authoredHeight: Array.from(sourceAuthoredHeight) } : next);
  materialOrigin = last?.origin ? [...last.origin] : void 0;
  input("use-height").checked = !!authoredHeight;
  input("use-height").disabled = !authoredHeight;
  selection = next.selection ? Uint8Array.from(next.selection) : last?.selection ? Uint8Array.from(last.selection) : Uint8Array.from(project.pixels, (c, i) => (project.mask?.[i] ?? 1) && c >>> 24 ? 1 : 0);
  protectedMask = next.protectedMask ? Uint8Array.from(next.protectedMask) : last?.protectedMask ? Uint8Array.from(last.protectedMask) : new Uint8Array(selection.length);
  protectionVersion++;
  if (last) loadSettings(last.material);
  else if (workingOptions.tileSize) {
    matchTilePeriodToCanvas();
  }
  if (replaceHistory) resetHistory();
  revision++;
  committed = raster;
  renderedRevision = revision;
  draft = false;
  editingMaterialId = void 0;
  paintPreview = void 0;
  schedule();
}
input("project-file").onchange = async () => {
  const file = input("project-file").files?.[0];
  if (!file || busy) return;
  busy = true;
  try {
    if (file.size > 64 * 1024 * 1024) throw new RangeError("\uD504\uB85C\uC81D\uD2B8\uB294 64 MiB \uC774\uD558\uB85C \uC5F4\uC5B4 \uC8FC\uC138\uC694.");
    const json = await file.text(), header = JSON.parse(json);
    if (header?.schema === "poku-pixel-art/v3") timeline.open(json);
    else {
      const next = parsePixelArtDocument2D(json);
      if (next.width > 4096 || next.height > 4096) throw new RangeError("\uBE0C\uB77C\uC6B0\uC800 \uC791\uC5C5\uC2E4\uC5D0\uC11C\uB294 \uAC00\uB85C\xB7\uC138\uB85C 4096\uD53D\uC140 \uC774\uD558\uC758 \uD504\uB85C\uC81D\uD2B8\uB97C \uC0AC\uC6A9\uD574 \uC8FC\uC138\uC694.");
      const raster = renderPixelArtDocument2D(next);
      timeline?.close();
      prepareImported(next, true, raster);
    }
  } catch (error) {
    status(String(error), true);
  } finally {
    busy = false;
    input("project-file").value = "";
  }
};
input("png-file").onchange = async () => {
  const file = input("png-file").files?.[0];
  if (!file || busy) return;
  busy = true;
  let bitmap;
  try {
    if (file.size > 16 * 1024 * 1024) throw new RangeError("PNG\uB294 16 MiB \uC774\uD558\uB85C \uC5F4\uC5B4 \uC8FC\uC138\uC694.");
    const decoded = await decodePixelArtPNG(new Uint8Array(await file.arrayBuffer())), { w, h } = decoded;
    let pixels;
    if (decoded.kind === "decoded") pixels = decoded.pixels;
    else {
      bitmap = await createImageBitmap(file);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      const rgba = ctx.getImageData(0, 0, w, h).data;
      pixels = new Uint32Array(w * h);
      for (let i = 0; i < pixels.length; i++) pixels[i] = (rgba[i * 4] | rgba[i * 4 + 1] << 8 | rgba[i * 4 + 2] << 16 | rgba[i * 4 + 3] << 24) >>> 0;
    }
    const next = createPixelArtDocument2D({ w, h, pixels, mask: { w, h, data: Uint8Array.from(pixels, (p) => p >>> 24 ? 1 : 0) } }, file.name.replace(/\.png$/i, ""));
    timeline?.close();
    prepareImported(next);
    element("import-note").textContent = decoded.kind === "decoded" ? `PNG \uC6D0\uBCF8 RGB\xB7\uC54C\uD30C\uB97C \uADF8\uB300\uB85C \uAC00\uC838\uC654\uC2B5\uB2C8\uB2E4.${decoded.warnings.length ? " \uC0C9\uC0C1 \uD504\uB85C\uD30C\uC77C\uC740 \uC6D0\uBCF8 \uC218\uCE58 \uBCF4\uC874\uC744 \uC704\uD574 \uBCC0\uD658\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." : ""}` : `${decoded.reason === "16-bit" ? "16\uBE44\uD2B8" : "Adam7 \uC778\uD130\uB808\uC774\uC2A4"} PNG\uB97C \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C \uBCC0\uD658\uD588\uC2B5\uB2C8\uB2E4. \uC6D0\uBCF8 \uC218\uCE58\uB97C \uADF8\uB300\uB85C \uD3B8\uC9D1\uD558\uB824\uBA74 \uBE44\uC778\uD130\uB808\uC774\uC2A4 8\uBE44\uD2B8 PNG\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.`;
  } catch (error) {
    status(String(error), true);
  } finally {
    bitmap?.close();
    busy = false;
    input("png-file").value = "";
  }
};
function point(event) {
  const c = canvas("source"), r = c.getBoundingClientRect();
  return [Math.floor((event.clientX - r.left) * c.width / r.width), Math.floor((event.clientY - r.top) * c.height / r.height)];
}
function connected(x, y, add) {
  const w = project.width, h = project.height;
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const start = y * w + x, reference = committed.pixels[start];
  if (!(reference >>> 24) || !committed.mask.data[start]) return;
  const tolerance = Math.max(0, Math.min(100, number("tolerance"))), seen = new Uint8Array(w * h), queue = new Uint32Array(w * h);
  let head = 0, tail = 0;
  queue[tail++] = start;
  seen[start] = 1;
  if (!add) selection.fill(0);
  while (head < tail) {
    const i = queue[head++], c = committed.pixels[i];
    if (!(c >>> 24) || !committed.mask.data[i] || Math.max(Math.abs((c & 255) - (reference & 255)), Math.abs((c >>> 8 & 255) - (reference >>> 8 & 255)), Math.abs((c >>> 16 & 255) - (reference >>> 16 & 255))) > tolerance) continue;
    selection[i] = 1;
    const px = i % w, py = Math.floor(i / w);
    for (const n of [px > 0 ? i - 1 : -1, px + 1 < w ? i + 1 : -1, py > 0 ? i - w : -1, py + 1 < h ? i + w : -1]) if (n >= 0 && !seen[n]) {
      seen[n] = 1;
      queue[tail++] = n;
    }
  }
}
function brush(x, y) {
  const tool = select3("selection-tool").value, r = Math.max(1, Math.min(32, number("brush-size"))) / 2;
  const target = tool === "protect" || tool === "unprotect" ? protectedMask : selection, value = tool === "erase" || tool === "unprotect" ? 0 : 1;
  if (target === protectedMask) protectionVersion++;
  for (let py = Math.max(0, Math.floor(y - r)); py <= Math.min(project.height - 1, Math.ceil(y + r)); py++) for (let px = Math.max(0, Math.floor(x - r)); px <= Math.min(project.width - 1, Math.ceil(x + r)); px++) {
    const i = py * project.width + px;
    if ((px - x) ** 2 + (py - y) ** 2 <= r * r && committed.mask.data[i] && committed.pixels[i] >>> 24) target[i] = value;
  }
}
var pointer;
var lastPoint;
canvas("source").onpointerdown = (event) => {
  if (event.button !== 0 || !canEditMasks()) return;
  const [x, y] = point(event);
  event.preventDefault();
  if (select3("selection-tool").value === "connected") {
    connected(x, y, event.shiftKey);
    changed();
    return;
  }
  pointer = event.pointerId;
  lastPoint = [x, y];
  canvas("source").setPointerCapture(pointer);
  brush(x, y);
  changed();
};
canvas("source").onpointermove = (event) => {
  if (pointer !== event.pointerId || !lastPoint || !canEditMasks()) return;
  const next = point(event), dx = next[0] - lastPoint[0], dy = next[1] - lastPoint[1], steps = Math.max(1, Math.abs(dx), Math.abs(dy));
  for (let i = 1; i <= steps; i++) brush(Math.round(lastPoint[0] + dx * i / steps), Math.round(lastPoint[1] + dy * i / steps));
  lastPoint = next;
  changed();
};
var endStroke = () => {
  pointer = void 0;
  lastPoint = void 0;
};
canvas("source").onpointerup = endStroke;
canvas("source").onpointercancel = endStroke;
new ResizeObserver(schedule).observe(element("source-host"));
window.addEventListener("resize", schedule);
window.addEventListener("beforeunload", () => urls.forEach((url) => URL.revokeObjectURL(url)));
workbench = installPixelArtWorkbench({
  document: () => project,
  outputDocument: outputProject,
  committed: () => committed,
  output: () => rendered,
  selection: () => selection,
  protection: () => protectedMask,
  palette: () => createPixelMaterial2D(settings()).options.palette,
  setPalette: (colors) => {
    workingOptions.palette = [...colors];
    delete workingOptions.thresholds;
    palette(colors);
    changed();
  },
  setSelection: (mask2) => {
    selection = mask2;
    previewVersion++;
    element("status").classList.remove("error");
    schedule();
  },
  commit: commitDocument,
  load: prepareImported,
  newCanvas: (next) => {
    if (timeline?.enabled) {
      timeline.newDocument(next);
      return;
    }
    history.commit(outputProject());
    prepareImported(next, false);
    history.commit(project);
  },
  preview: (sprite) => {
    paintPreview = sprite;
    if (sprite) element("status").classList.remove("error");
    schedule();
  },
  refresh: schedule,
  status,
  download: addDownload,
  filename,
  editMaterial: (id) => attempt(() => {
    const layer = project.layers.find((layer2) => layer2.id === id && layer2.kind === "material");
    if (!layer || layer.locked) return;
    editingMaterialId = id;
    loadSettings(layer.material);
    selection = layer.selection ? Uint8Array.from(layer.selection) : new Uint8Array(project.width * project.height).fill(1);
    protectedMask = layer.protectedMask ? Uint8Array.from(layer.protectedMask) : new Uint8Array(selection.length);
    protectionVersion++;
    authoredHeight = layer.height ? Float32Array.from(layer.height) : void 0;
    materialOrigin = layer.origin ? [...layer.origin] : void 0;
    input("use-height").checked = !!authoredHeight;
    previewVersion++;
    draft = true;
    schedule();
  })
});
timeline = installPixelArtTimeline({
  outputDocument: outputProject,
  restore: (next, raster) => prepareImported(next, false, raster),
  finishStroke: () => workbench?.finishStroke(),
  palette: () => workbench.palette(),
  setPalette: (colors) => workbench.setAuthoredPalette(colors),
  refresh: schedule,
  status,
  download: addDownload,
  filename
});
installPixelArtViewport();
attempt(() => {
  resetMaterial();
  study();
});
