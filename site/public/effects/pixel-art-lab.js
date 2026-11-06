import {
  encodeRGBAPNG
} from "./chunks/chunk-OHTBDYQJ.js";
import {
  PIXEL_MATERIAL_PALETTES_2D,
  createOrganicSilhouette2D,
  createPixelMaterial2D,
  createPixelPaletteMapper2D,
  createPixelPaletteRamp2D,
  diagnosePixelArt2D,
  exportPixelSurfaceMaps2D,
  extractPixelPalette2D,
  paintPixelMask2D,
  rasterizePixelBrush2D,
  rasterizePixelContour2D,
  rasterizePixelShape2D,
  resizePixelSelection2D,
  selectPixelRegion2D
} from "./chunks/chunk-LK75UMZK.js";
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
    const masks = optionalMasks(layer, n), objectOrigin = origin(layer.origin);
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
    const t = layer.opacity ?? 1;
    if (!t) continue;
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
    out = { ...out, pixels, mask: mask2, ...channels ? { channels } : {} };
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
  return { ...out, ...optionalMasks(p, p.width * p.height), ...p.authoredHeight ? { authoredHeight: p.authoredHeight.slice() } : {} };
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

// gallery/pixel-art-workbench.ts
var el = (id) => document.getElementById(id);
var field = (id) => el(id);
var choice = (id) => el(id);
var btn = (id) => el(id);
var integer = (id, low, high) => {
  const value = Number(field(id).value);
  if (!Number.isInteger(value) || value < low || value > high) throw new RangeError(`${low}~${high} \uBC94\uC704\uC758 \uC815\uC218\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.`);
  return value;
};
var cssColor = (c) => "#" + [c & 255, c >>> 8 & 255, c >>> 16 & 255].map((v) => v.toString(16).padStart(2, "0")).join("");
function installPixelArtWorkbench(host) {
  const result = el("result");
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
    return { x: Math.floor((event.clientX - r.left) * result.width / r.width), y: Math.floor((event.clientY - r.top) * result.height / r.height) };
  };
  function brushOptions() {
    return {
      size: integer("paint-size", 1, 64),
      tip: choice("paint-tip").value,
      pixelPerfect: field("pixel-perfect").checked,
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
  function painted(source, mask2, erase, merged) {
    const output = paintPixelMask2D(source, mask2, erase ? null : hex(field("paint-color").value), {
      mode: "replace",
      protectedMask: host.protection(),
      selection: field("paint-in-selection").checked ? host.selection() : void 0,
      alphaLock: field("alpha-lock").checked
    });
    const touched = Uint8Array.from(mask2, (v, i) => v && (source.pixels[i] !== output.pixels[i] || source.mask.data[i] !== output.mask.data[i]) ? 1 : 0);
    if (erase && merged && !field("alpha-lock").checked) for (let i = 0; i < touched.length; i++) {
      if (mask2[i] && !host.protection()[i] && (!field("paint-in-selection").checked || host.selection()[i]) && merged.mask.data[i] && merged.pixels[i] >>> 24) touched[i] = 1;
    }
    return { output, touched };
  }
  function previewStroke() {
    if (!stroke) return;
    const { document: doc, points, tool, source, merged, layerId } = stroke, options = brushOptions();
    const mask2 = ["line", "rectangle", "ellipse"].includes(tool) ? rasterizePixelShape2D(doc.width, doc.height, tool, [points[0].x, points[0].y], [points.at(-1).x, points.at(-1).y], { ...options, filled: field("paint-filled").checked }) : rasterizePixelBrush2D(doc.width, doc.height, points, options);
    const { output, touched } = painted(source, mask2, tool === "eraser", merged);
    const next = writePixelArtPaintLayer2D(doc, output, touched, layerId);
    stroke.candidate = next;
    host.preview(!layerId ? output : renderPixelArtDocument2D(next));
  }
  result.addEventListener("pointerdown", (event) => attempt2(() => {
    const tool = choice("paint-tool").value;
    if (event.button !== 0 || tool === "inspect") return;
    event.preventDefault();
    const p = point2(event), source = host.output(), doc = host.outputDocument();
    if (p.x < 0 || p.y < 0 || p.x >= source.w || p.y >= source.h) return;
    if (tool === "picker") {
      const i = p.y * source.w + p.x;
      if (source.mask.data[i] && source.pixels[i] >>> 24) field("paint-color").value = cssColor(source.pixels[i]);
      return;
    }
    const layerId = activePaint(doc);
    if (!layerId && doc.layers.length >= pixelArtLayerLimit2D(doc.width, doc.height)) throw new RangeError("\uB808\uC774\uC5B4 \uD55C\uB3C4\uC785\uB2C8\uB2E4. \uADF8\uB9BC \uB808\uC774\uC5B4\uB97C \uC120\uD0DD\uD558\uAC70\uB098 \uD604\uC7AC \uBAA8\uC2B5\uC744 \uAD6C\uC6B4 \uB4A4 \uADF8\uB824 \uC8FC\uC138\uC694.");
    if (tool === "fill") {
      const mask2 = selectPixelRegion2D(source, p, {
        tolerance: integer("tolerance", 0, 100),
        includeTransparent: true,
        selection: field("paint-in-selection").checked ? host.selection() : void 0
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
    el("cursor-cell").textContent = p.x >= 0 && p.y >= 0 && p.x < result.width && p.y < result.height ? `x ${p.x} \xB7 y ${p.y}` : "";
    if (!stroke || stroke.pointer !== event.pointerId) return;
    for (const sample of event.getCoalescedEvents?.().length ? event.getCoalescedEvents() : [event]) {
      const next = point2(sample), last = stroke.points.at(-1);
      if (last.x !== next.x || last.y !== next.y) stroke.points.push(next);
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
    if (!stroke) el("cursor-cell").textContent = "";
  });
  choice("paint-tool").onchange = () => {
    if (stroke) cancelStroke();
    syncCursor();
  };
  function syncCursor() {
    const tool = choice("paint-tool").value;
    result.style.cursor = tool === "inspect" ? "default" : "crosshair";
    el("paint-hint").textContent = tool === "inspect" ? "\uC624\uB978\uCABD \uCE94\uBC84\uC2A4\uC5D0 \uADF8\uB9BD\uB2C8\uB2E4. \uC67C\uCABD\uC5D0\uC11C\uB294 \uC120\uD0DD\uACFC \uBCF4\uD638 \uC601\uC5ED\uC744 \uD3B8\uC9D1\uD569\uB2C8\uB2E4." : tool === "picker" ? "\uC624\uB978\uCABD \uADF8\uB9BC\uC5D0\uC11C \uC0C9\uC744 \uACE0\uB978 \uB4A4 B\uB97C \uB204\uB974\uBA74 \uC5F0\uD544\uB85C \uB3CC\uC544\uAC11\uB2C8\uB2E4." : "\uC624\uB978\uCABD \uCE94\uBC84\uC2A4\uC5D0 \uADF8\uB9AC\uC138\uC694. \uD55C \uBC88\uC758 \uB4DC\uB798\uADF8\uAC00 \uD55C \uBC88\uC758 \uC2E4\uD589 \uCDE8\uC18C\uC5D0 \uB300\uC751\uD569\uB2C8\uB2E4. \uBCF4\uD638 \uC601\uC5ED\uC740 \uC720\uC9C0\uB429\uB2C8\uB2E4.";
  }
  function mutateLayer(id, fn) {
    const doc = host.document(), layers = structuredClone(doc.layers), index = layers.findIndex((layer) => layer.id === id);
    if (index < 0) return;
    fn(layers, index);
    const { activeLayerId, ...base } = doc;
    host.commit({ ...base, layers, ...activeLayerId && layers.some((layer) => layer.id === activeLayerId) ? { activeLayerId } : {} });
  }
  const actionButton = (label, title, action, disabled = false) => {
    const button2 = document.createElement("button");
    button2.type = "button";
    button2.textContent = label;
    button2.title = title;
    button2.setAttribute("aria-label", title);
    button2.disabled = disabled;
    button2.onclick = () => attempt2(action);
    return button2;
  };
  function syncLayers() {
    const doc = host.document(), key = JSON.stringify([doc.activeLayerId, doc.layers.map(({ id, name: name2, kind, visible, locked }) => ({ id, name: name2, kind, visible, locked }))]);
    const hasRoom = host.outputDocument().layers.length < pixelArtLayerLimit2D(doc.width, doc.height);
    btn("new-paint-layer").disabled = !hasRoom;
    btn("apply-palette").disabled = !hasRoom;
    btn("flatten-layers").disabled = !doc.layers.length;
    const selected = doc.layers.find((layer) => layer.id === doc.activeLayerId);
    el("active-layer").textContent = selected ? `${selected.kind === "paint" ? "\uADF8\uB9AC\uB294 \uACF3" : "\uC120\uD0DD\uD55C \uB808\uC774\uC5B4"}: ${selected.name}${selected.locked ? " \xB7 \uC7A0\uAE40" : ""}` : "\uADF8\uB9AC\uBA74 \uB9E8 \uC704\uC5D0 \uADF8\uB9BC \uB808\uC774\uC5B4\uAC00 \uC0DD\uAE41\uB2C8\uB2E4.";
    if (key === rowsKey) return;
    rowsKey = key;
    el("layer-list").replaceChildren(...doc.layers.map((layer, index) => {
      const li = document.createElement("li");
      li.dataset.layerId = layer.id;
      li.classList.toggle("active", doc.activeLayerId === layer.id);
      li.classList.toggle("hidden-layer", layer.visible === false);
      li.append(actionButton(layer.visible === false ? "\u25CB" : "\u25CF", `${layer.name} \uD45C\uC2DC \uC804\uD658`, () => mutateLayer(layer.id, (layers, i) => {
        layers[i].visible = layers[i].visible === false;
      })));
      const kind = document.createElement("span");
      kind.className = "layer-kind";
      kind.textContent = { material: "\uC7AC\uC9C8", paint: "\uADF8\uB9BC", palette: "\uC0C9\uC0C1" }[layer.kind];
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
    field("paint-in-selection").checked = false;
    field("alpha-lock").checked = false;
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
    el("workbench-palette").replaceChildren(...colors.map((color, i) => {
      const swatch = document.createElement("input");
      swatch.type = "color";
      swatch.value = cssColor(color);
      swatch.setAttribute("aria-label", `\uC791\uC5C5 \uD314\uB808\uD2B8 ${i + 1}`);
      swatch.oninput = () => {
        authoredPalette[i] = hex(swatch.value);
      };
      swatch.ondblclick = () => {
        field("paint-color").value = swatch.value;
      };
      return swatch;
    }));
  }
  btn("extract-palette").onclick = () => attempt2(() => {
    const colors = extractPixelPalette2D(host.output(), {
      colors: integer("palette-count", 2, 64),
      locked: field("lock-paint-color").checked ? [field("paint-color").value] : [],
      ...field("paint-in-selection").checked ? { selection: host.selection() } : {}
    });
    if (!colors.length) throw new Error("\uC0C9\uC744 \uCD94\uCD9C\uD560 \uBD88\uD22C\uBA85\uD55C \uD53D\uC140\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uBA3C\uC800 \uADF8\uB9AC\uAC70\uB098 PNG\uB97C \uAC00\uC838\uC624\uC138\uC694.");
    setAuthoredPalette(colors);
    el("palette-note").textContent = `\uD604\uC7AC \uADF8\uB9BC\uC5D0\uC11C ${colors.length}\uC0C9\uC744 \uCD94\uCD9C\uD588\uC2B5\uB2C8\uB2E4. \uD314\uB808\uD2B8 \uC870\uC815 \uB808\uC774\uC5B4\uB85C \uC801\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`;
  });
  btn("generate-ramp").onclick = () => attempt2(() => {
    const colors = createPixelPaletteRamp2D({ shadow: field("ramp-shadow").value, midtone: field("ramp-midtone").value, highlight: field("ramp-highlight").value, colors: integer("palette-count", 2, 64) });
    setAuthoredPalette(colors);
    el("palette-note").textContent = `${colors.length}\uC0C9 \uBA85\uC554 \uD314\uB808\uD2B8 \xB7 \uADF8\uB9BC\uC790\uC640 \uBC1D\uC740 \uBA74 \uC0AC\uC774\uC5D0\uC11C \uC0C9\uC0C1\uACFC \uCC44\uB3C4\uB97C \uD568\uAED8 \uC870\uC808\uD588\uC2B5\uB2C8\uB2E4.`;
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
      ...field("paint-in-selection").checked ? { selection: Array.from(host.selection()) } : {},
      protectedMask: Array.from(host.protection())
    };
    host.commit({ ...doc, activeLayerId: id, layers: [...doc.layers, layer] });
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
    const c = el(id), wrapper = document.createElement("div"), grid = document.createElement("div");
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
  el("result-host").closest(".comparison").after(tileHost);
  field("show-grid").onchange = () => syncOverlays();
  field("tile-preview").onchange = () => syncOverlays();
  function syncOverlays() {
    for (const { c, grid } of grids) {
      const rect = c.getBoundingClientRect(), step = rect.width / c.width;
      grid.style.backgroundSize = `${step}px ${rect.height / c.height}px`;
      grid.classList.toggle("visible", field("show-grid").checked && step >= 4);
    }
    tileHost.classList.toggle("visible", field("tile-preview").checked);
    if (field("tile-preview").checked && host.output()) {
      const sprite = host.output(), source = spriteCanvas(sprite);
      tileCanvas.width = sprite.w * 3;
      tileCanvas.height = sprite.h * 3;
      const ctx = tileCanvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) ctx.drawImage(source, x * sprite.w, y * sprite.h);
    }
  }
  new ResizeObserver(syncOverlays).observe(el("result-host"));
  function surfaceMaps() {
    const doc = host.outputDocument(), lastMaterial = doc.layers.filter((layer) => layer.kind === "material" && layer.visible !== false).at(-1);
    return exportPixelSurfaceMaps2D(renderPixelArtDocument2D(doc), {
      normalConvention: choice("normal-convention").value,
      lighting: {
        light: lastMaterial?.material.light ?? [-0.6, -0.7, 1],
        ambientOcclusion: 1,
        castShadow: 1,
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
  for (const id of ["save-png", "save-project", "undo", "redo", "save-normal", "save-height", "save-occlusion", "save-shadow", "save-map-info", "new-canvas", "import-png", "open-project"])
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
  return { sync() {
    syncLayers();
    syncOverlays();
    syncCursor();
    const mapsAvailable = !!host.output()?.channels;
    choice("normal-convention").disabled = !mapsAvailable;
    for (const id of ["save-normal", "save-height", "save-occlusion", "save-shadow", "save-map-info"]) btn(id).disabled = !mapsAvailable;
  } };
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
var select = (id) => element(id);
var button = (id) => element(id);
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
var protectionVersion = 0;
var beforeAnalysisKey = "";
var beforeAnalysis;
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
function loadSettings(options) {
  const p = createPixelMaterial2D(options).options;
  workingOptions = structuredClone(p);
  for (const id of rangeIds) input(id).step = "any";
  select("material").value = p.kind;
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
  else if (id !== "use-height") workingOptions = { ...workingOptions, [id]: number(id) };
  changed();
}
function pendingLayer() {
  const existing = project.layers.find((layer) => layer.id === editingMaterialId);
  return {
    kind: "material",
    id: editingMaterialId ?? nextPixelArtLayerId2D(project, "material"),
    name: existing?.name ?? `${labels[select("material").value]} \xB7 ${number("seed")}`,
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
  const layers = draft && canAddLayer() ? editingMaterialId ? project.layers.map((layer) => layer.id === editingMaterialId ? pendingLayer() : layer) : [...project.layers, pendingLayer()] : project.layers;
  return { ...project, layers, selection: Array.from(selection), protectedMask: Array.from(protectedMask), ...authoredHeight ? { authoredHeight: Array.from(authoredHeight) } : {} };
}
function resetHistory() {
  const { activeLayerId, ...base } = project;
  history = new PixelArtDocumentHistory2D({ ...base, layers: [] });
  for (let i = 1; i <= project.layers.length; i++) history.commit({ ...base, layers: project.layers.slice(0, i), ...activeLayerId && project.layers.slice(0, i).some((layer) => layer.id === activeLayerId) ? { activeLayerId } : {} });
  if (!project.layers.length) history = new PixelArtDocumentHistory2D(project);
}
function commitDocument(next) {
  const raster = renderPixelArtDocument2D(next);
  if (history.commit(next)) {
    project = history.value;
    revision++;
    committed = raster;
    renderedRevision = revision;
  }
  draft = false;
  editingMaterialId = void 0;
  paintPreview = void 0;
  schedule();
}
function moveHistory(direction) {
  prepareImported(direction === "undo" ? history.undo() : history.redo(), false);
}
function sizeCanvases() {
  const dpr = window.devicePixelRatio || 1, requested = select("zoom").value;
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
    rendered = paintPreview ?? (draft ? editingMaterialId ? renderPixelArtDocument2D(outputProject()) : createPixelMaterial2D(settings()).shade(committed, pendingLayer()) : committed);
    const style = select("expected-style").value;
    const options = { expectedStyle: style, protected: protectedMask };
    const key = `${revision}:${style}:${protectionVersion}`;
    if (key !== beforeAnalysisKey || !beforeAnalysis) {
      beforeAnalysis = diagnosePixelArt2D(committed, options);
      beforeAnalysisKey = key;
    }
    const before = beforeAnalysis, after = diagnosePixelArt2D(rendered, options);
    paint("source", committed);
    paint("result", rendered, select("view").value, after.heatmap);
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
    button("undo").disabled = !history.canUndo;
    button("redo").disabled = !history.canRedo;
    button("apply-material").disabled = !draft || !count || !hasLayerRoom;
    button("apply-material").textContent = editingMaterialId ? "\uC218\uC815\uD55C \uC7AC\uC9C8 \uC801\uC6A9" : "\uC120\uD0DD \uC601\uC5ED\uC5D0 \uC7AC\uC9C8 \uC801\uC6A9";
    button("cancel-preview").disabled = !draft;
    status(hasLayerRoom ? `${draft ? "\uBBF8\uB9AC\uBCF4\uAE30" : "\uC801\uC6A9 \uC644\uB8CC"} \xB7 ${Math.round(performance.now() - started)} ms \xB7 ${after.metrics.paletteSize}\uC0C9` : `\uC774 \uD574\uC0C1\uB3C4\uC758 \uB808\uC774\uC5B4 \uD55C\uB3C4 ${pixelArtLayerLimit2D(project.width, project.height)}\uAC1C \xB7 \uC2E4\uD589 \uCDE8\uC18C\uD558\uBA74 \uACC4\uC18D \uD3B8\uC9D1\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`);
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
  paintPreview = void 0;
  draft = canAddLayer();
  schedule();
}
function study() {
  const shape = select("shape").value;
  if (shape === "imported") return;
  const result = createPixelArtStudy2D(shape, number("seed"), input("organic").checked);
  project = createPixelArtDocument2D(result.sprite, `POKU ${shape}`);
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
  const kind = select("material").value;
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
}
function filename() {
  return (project.name.replace(/[^a-z0-9가-힣_-]+/gi, "-").replace(/^-|-$/g, "") || "poku-pixel-art").slice(0, 80);
}
function savePNG() {
  if (!update()) return;
  const rgba = new Uint8Array(rendered.w * rendered.h * 4), name2 = filename() + ".png";
  for (let i = 0; i < rendered.pixels.length; i++) {
    const c = rendered.pixels[i];
    rgba.set([c & 255, c >>> 8 & 255, c >>> 16 & 255, rendered.mask.data[i] ? c >>> 24 : 0], i * 4);
  }
  void encodeRGBAPNG(rendered.w, rendered.h, rgba).then((blob) => addDownload(blob, name2)).catch((error) => status(String(error), true));
}
for (const id of [...rangeIds, "seed", "use-height"]) element(id).addEventListener("input", () => editSetting(id));
for (const id of ["view", "expected-style", "zoom"]) element(id).addEventListener("change", schedule);
select("material").addEventListener("change", () => attempt(resetMaterial));
select("shape").addEventListener("change", () => attempt(() => {
  const shape = select("shape").value;
  if (shape !== "imported") {
    select("material").value = shape === "blade" ? "metal" : shape === "cloth" ? "fabric" : shape === "crystal" ? "crystal" : "stone";
    select("expected-style").value = shape === "crystal" ? "geometric" : "organic";
    resetMaterial();
    study();
  }
}));
input("organic").addEventListener("change", () => attempt(study));
button("new-seed").onclick = () => attempt(() => {
  input("seed").value = String(number("seed") + 1 >>> 0);
  editSetting("seed");
});
button("reset-palette").onclick = () => attempt(() => {
  workingOptions.palette = [...PIXEL_MATERIAL_PALETTES_2D[select("material").value]];
  delete workingOptions.thresholds;
  palette(workingOptions.palette);
  changed();
});
button("select-all").onclick = () => {
  selection = Uint8Array.from(committed.pixels, (c, i) => committed.mask.data[i] && c >>> 24 ? 1 : 0);
  changed();
};
button("clear-selection").onclick = () => {
  selection.fill(0);
  changed();
};
button("clear-protection").onclick = () => {
  protectedMask.fill(0);
  protectionVersion++;
  changed();
};
button("apply-material").onclick = () => attempt(() => {
  if (draft) commitDocument(outputProject());
});
button("cancel-preview").onclick = () => {
  draft = false;
  editingMaterialId = void 0;
  paintPreview = void 0;
  schedule();
};
button("undo").onclick = () => attempt(() => moveHistory("undo"));
button("redo").onclick = () => attempt(() => moveHistory("redo"));
button("save-png").onclick = () => attempt(savePNG);
button("save-project").onclick = () => attempt(() => {
  if (update()) addDownload(new Blob([serializePixelArtDocument2D(outputProject())], { type: "application/json" }), filename() + ".poku-pixel-art.json");
});
button("import-png").onclick = () => input("png-file").click();
button("open-project").onclick = () => input("project-file").click();
function prepareImported(next, replaceHistory = true) {
  if (next.width > 4096 || next.height > 4096) throw new RangeError("\uBE0C\uB77C\uC6B0\uC800 \uC791\uC5C5\uC2E4\uC5D0\uC11C\uB294 \uAC00\uB85C\xB7\uC138\uB85C 4096\uD53D\uC140 \uC774\uD558\uC758 \uD504\uB85C\uC81D\uD2B8\uB97C \uC0AC\uC6A9\uD574 \uC8FC\uC138\uC694.");
  serializePixelArtDocument2D(next);
  const raster = renderPixelArtDocument2D(next);
  project = next;
  select("shape").value = "imported";
  input("organic").disabled = true;
  const last = project.layers.filter((layer) => layer.kind === "material").at(-1);
  authoredHeight = next.authoredHeight ? Float32Array.from(next.authoredHeight) : last?.height ? Float32Array.from(last.height) : void 0;
  materialOrigin = last?.origin ? [...last.origin] : void 0;
  input("use-height").checked = !!authoredHeight;
  input("use-height").disabled = !authoredHeight;
  selection = next.selection ? Uint8Array.from(next.selection) : last?.selection ? Uint8Array.from(last.selection) : Uint8Array.from(project.pixels, (c, i) => (project.mask?.[i] ?? 1) && c >>> 24 ? 1 : 0);
  protectedMask = next.protectedMask ? Uint8Array.from(next.protectedMask) : last?.protectedMask ? Uint8Array.from(last.protectedMask) : new Uint8Array(selection.length);
  if (last) loadSettings(last.material);
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
    prepareImported(parsePixelArtDocument2D(await file.text()));
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
    prepareImported(createPixelArtDocument2D({ w, h, pixels, mask: { w, h, data: Uint8Array.from(pixels, (p) => p >>> 24 ? 1 : 0) } }, file.name.replace(/\.png$/i, "")));
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
  const tool = select("selection-tool").value, r = Math.max(1, Math.min(32, number("brush-size"))) / 2;
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
  if (select("selection-tool").value === "connected") {
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
new ResizeObserver(sizeCanvases).observe(element("source-host"));
window.addEventListener("resize", sizeCanvases);
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
    schedule();
  },
  commit: commitDocument,
  load: prepareImported,
  newCanvas: (next) => {
    history.commit(outputProject());
    prepareImported(next, false);
    history.commit(project);
  },
  preview: (sprite) => {
    paintPreview = sprite;
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
    draft = true;
    schedule();
  })
});
attempt(() => {
  resetMaterial();
  study();
});
