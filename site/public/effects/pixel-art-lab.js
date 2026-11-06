import {
  encodeRGBAPNG
} from "./chunks/chunk-OHTBDYQJ.js";
import {
  PIXEL_MATERIAL_PALETTES_2D,
  applyPixelHeightDeltas2D,
  combinePixelSelections2D,
  createOrganicSilhouette2D,
  createPixelColorReplacer2D,
  createPixelMaterial2D,
  createPixelPaletteMapper2D,
  createPixelPaletteRamp2D,
  createPixelRampMapper2D,
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
  rasterizePixelPath2D,
  rasterizePixelShape2D,
  refreshPixelHeightNormals2D,
  resizePixelSelection2D,
  sculptPixelHeight2D,
  selectPixelRegion2D,
  shadePixelMask2D,
  sortPixelColorsByLightness2D,
  transformPixelSelection2D,
  validatePixelArtPath2D,
  validatePixelSelectionTransformOptions2D
} from "./chunks/chunk-WP6F6TUS.js";
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
function validatePixelArtProject2D(input3) {
  if (!input3 || typeof input3 !== "object") throw new TypeError("Expected a pixel art project");
  const p = input3;
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
function values(input3, n, label, valid) {
  if (!Array.isArray(input3) || input3.length !== n || !Array.from(input3).every(valid)) throw new RangeError(`${label} must have ${n} valid native values`);
  return input3.slice();
}
function binary(input3, n, label) {
  return input3 === void 0 ? void 0 : values(input3, n, label, (v) => v === 0 || v === 1);
}
var packed = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
var float = (v) => Number.isFinite(v) && Number.isFinite(Math.fround(v));
function origin(input3) {
  if (input3 === void 0) return void 0;
  if (!Array.isArray(input3) || input3.length !== 2 || !Array.from(input3).every((v) => Number.isFinite(v) && Math.abs(v) <= 1e9)) throw new RangeError("Origin needs two finite coordinates within \xB11e9");
  return [...input3];
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
function sparseIndices(input3, n, label) {
  if (!Array.isArray(input3) || input3.length > n) throw new RangeError(`${label} indices must fit the raster`);
  let previous = -1;
  for (const i of input3) {
    if (!Number.isInteger(i) || i <= previous || i >= n) throw new RangeError(`${label} indices must be unique, sorted and inside the raster`);
    previous = i;
  }
  return input3.slice();
}
function upgradePixelArtProject2D(project2) {
  const p = validatePixelArtProject2D(project2);
  return { ...p, schema: "poku-pixel-art/v2", layers: p.layers.map((layer, i) => ({ ...layer, id: `material-${i + 1}`, kind: "material" })) };
}
function validatePixelArtDocument2D(input3) {
  if (!input3 || typeof input3 !== "object") throw new TypeError("Expected a pixel art document");
  if (input3.schema === "poku-pixel-art/v1") return upgradePixelArtProject2D(input3);
  const p = input3;
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
      const indices = sparseIndices(layer.indices, n, "Paint");
      if (layer.opacity !== void 0 && (!Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1)) throw new RangeError("Layer opacity must be within 0..1");
      return { ...common, kind: "paint", indices, pixels: values(layer.pixels, indices.length, "Paint pixels", packed), ...layer.opacity !== void 0 ? { opacity: layer.opacity } : {} };
    }
    if (layer.kind === "height") {
      const indices = sparseIndices(layer.indices, n, "Height");
      if (layer.strength !== void 0 && (!Number.isFinite(layer.strength) || layer.strength < 0 || layer.strength > 4)) throw new RangeError("Height layer strength must be within 0..4");
      if (layer.wrap !== void 0 && typeof layer.wrap !== "boolean") throw new RangeError("Height wrap must be boolean");
      return {
        ...common,
        kind: "height",
        indices,
        deltas: values(layer.deltas, indices.length, "Height offsets", float),
        ...layer.strength !== void 0 ? { strength: layer.strength } : {},
        ...layer.wrap !== void 0 ? { wrap: layer.wrap } : {},
        ...layer.protectedMask !== void 0 ? { protectedMask: binary(layer.protectedMask, n, "Height protection") } : {}
      };
    }
    const masks = optionalMasks(layer, n);
    if (layer.kind === "path") {
      const path = validatePixelArtPath2D(layer.nodes, layer.options);
      if (!Number.isInteger(layer.color) || layer.color < -2147483648 || layer.color > 4294967295) throw new RangeError("Path color must be packed RGBA");
      if (layer.alphaLock !== void 0 && typeof layer.alphaLock !== "boolean") throw new RangeError("Path alpha lock must be boolean");
      return { ...common, kind: "path", ...path, color: layer.color >>> 0, ...masks, ...layer.alphaLock !== void 0 ? { alphaLock: layer.alphaLock } : {} };
    }
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
    if (layer.heightSource !== void 0 && layer.heightSource !== "authored") throw new RangeError("Unknown material height source");
    return {
      ...common,
      kind: "material",
      material: structuredClone(createPixelMaterial2D(layer.material).options),
      ...masks,
      ...layer.heightSource ? { heightSource: layer.heightSource } : {},
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
  if (p.workingPalette !== void 0 && (!Array.isArray(p.workingPalette) || p.workingPalette.length < 1 || p.workingPalette.length > 256 || !Array.from(p.workingPalette).every((value) => packed(value) && value >>> 24 === 255))) throw new RangeError("Working palette needs 1..256 opaque packed colors");
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
    ...p.workingPalette ? { workingPalette: p.workingPalette.slice() } : {},
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
function pathRaster(out, layer) {
  const coverage = rasterizePixelPath2D(out.w, out.h, layer.nodes, layer.options);
  const painted = paintPixelMask2D(out, coverage, layer.color, {
    mode: "replace",
    selection: layer.selection,
    protectedMask: layer.protectedMask,
    alphaLock: layer.alphaLock
  });
  const indices = [], pixels = [];
  for (let i = 0; i < coverage.length; i++) {
    if (painted.pixels[i] !== out.pixels[i] || painted.mask.data[i] !== out.mask.data[i]) {
      indices.push(i);
      pixels.push(painted.pixels[i]);
    }
  }
  return indices.length ? paintRaster(out, { kind: "paint", id: layer.id, name: layer.name, indices, pixels }) : out;
}
function refreshPaintedSurface(before, after, wrap, protectedMask2) {
  if (before === after || !after.channels) return after;
  let changed2;
  for (let i = 0; i < after.pixels.length; i++) {
    const wasOccupied = !!before.mask.data[i] && !!(before.pixels[i] >>> 24);
    const isOccupied = !!after.mask.data[i] && !!(after.pixels[i] >>> 24);
    if (wasOccupied !== isOccupied) {
      changed2 ??= new Uint8Array(after.pixels.length);
      changed2[i] = 1;
    }
  }
  return changed2 ? refreshPixelHeightNormals2D({ ...after, channels: after.channels }, changed2, { wrap, protectedMask: protectedMask2 }) : after;
}
function formRaster(p) {
  const out = sourceRaster(p), n = p.width * p.height, normal = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) normal[i * 3 + 2] = 1;
  return { ...out, channels: {
    w: p.width,
    h: p.height,
    material: new Uint16Array(n),
    height: p.authoredHeight ? Float32Array.from(p.authoredHeight) : new Float32Array(n),
    normal
  } };
}
function replayFormLayer(out, layer) {
  if (layer.kind === "transform") return transformPixelSelection2D(out, layer.selection, { ...layer.transform, protectedMask: layer.protectedMask }).sprite;
  if (layer.kind === "paint") return paintRaster(out, layer);
  if (layer.kind === "path") return pathRaster(out, layer);
  if (layer.kind === "height") return applyPixelHeightDeltas2D(out, layer.indices, layer.deltas, layer);
  return out;
}
function renderPixelArtAuthoredHeight2D(document2) {
  const p = validatePixelArtDocument2D(document2);
  if (!p.authoredHeight && !p.layers.some((layer) => layer.kind === "height" && layer.visible !== false)) return void 0;
  let out = formRaster(p);
  for (const layer of p.layers) {
    if (layer.visible === false) continue;
    out = replayFormLayer(out, layer);
  }
  return out.channels.height;
}
function renderPixelArtDocument2D(document2) {
  const p = validatePixelArtDocument2D(document2);
  let out = sourceRaster(p);
  let form = p.layers.some((layer) => layer.visible !== false && (layer.kind === "height" || layer.kind === "material" && layer.heightSource === "authored")) ? formRaster(p) : void 0;
  let sculptedSurface = false, surfaceWrap = false;
  for (const layer of p.layers) {
    if (layer.visible === false) continue;
    if (layer.kind === "height") {
      out = applyPixelHeightDeltas2D(out, layer.indices, layer.deltas, { ...layer, height: form?.channels?.height });
      if (form) form = replayFormLayer(form, layer);
      sculptedSurface = true;
      surfaceWrap = layer.wrap ?? false;
      continue;
    }
    if (form) form = replayFormLayer(form, layer);
    if (layer.kind === "material") {
      const material = createPixelMaterial2D(layer.material);
      out = material.shade(out, layer.heightSource === "authored" ? { ...layer, height: form?.channels?.height } : layer);
      if (sculptedSurface) surfaceWrap = !!material.options.tileSize && material.options.tileSize[0] === p.width && material.options.tileSize[1] === p.height && !material.options.bevel;
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
    if (layer.kind === "path") {
      const before2 = out;
      out = pathRaster(out, layer);
      if (sculptedSurface) out = refreshPaintedSurface(before2, out, surfaceWrap, layer.protectedMask);
      continue;
    }
    const before = out;
    out = paintRaster(out, layer);
    if (sculptedSurface) out = refreshPaintedSurface(before, out, surfaceWrap);
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
function writePixelArtHeightLayer2D(document2, deltas, touched, layerId, options = {}) {
  const n = cells(document2.width, document2.height);
  if (deltas.length !== n || touched.length !== n) throw new RangeError("Sculpt offsets and stroke mask must match the document");
  if (options.wrap !== void 0 && typeof options.wrap !== "boolean") throw new RangeError("Height wrap must be boolean");
  if (options.protectedMask && (options.protectedMask.length !== n || !Array.from(options.protectedMask).every((v) => v === 0 || v === 1))) throw new RangeError("Height protection must match the document");
  const index = layerId === void 0 ? -1 : document2.layers.findIndex((layer2) => layer2.id === layerId);
  if (layerId !== void 0 && index < 0) throw new RangeError("Height layer does not exist");
  const existing = index < 0 ? void 0 : document2.layers[index];
  if (existing && (existing.kind !== "height" || existing.locked || existing.visible === false)) throw new RangeError("Choose an unlocked visible height layer");
  const current = existing, strength = current?.strength ?? 1;
  if (current && index !== document2.layers.length - 1) throw new RangeError("Choose the top height layer or create a new height layer for this stroke");
  if (!strength) throw new RangeError("Set the height layer strength above zero before sculpting");
  const changes = /* @__PURE__ */ new Map();
  current?.indices.forEach((i, j) => changes.set(i, current.deltas[j]));
  const strokeIndices = [], strokeDeltas = [];
  let changed2 = false, separate = false;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(touched[i]) || !float(deltas[i])) throw new RangeError("Sculpt changes must contain finite native values");
    const delta = Math.fround(deltas[i]);
    if (!touched[i] || !delta || options.protectedMask?.[i] || current?.protectedMask?.[i]) continue;
    strokeIndices.push(i);
    strokeDeltas.push(delta);
    const value = (changes.get(i) ?? 0) + delta / strength;
    if (!float(value)) separate = true;
    else if (value) changes.set(i, value);
    else changes.delete(i);
    changed2 = true;
  }
  if (!changed2) return document2;
  const wrap = options.wrap ?? current?.wrap ?? false;
  const protection = options.protectedMask && current?.protectedMask ? Uint8Array.from(options.protectedMask, (value, i) => Number(!!value || !!current.protectedMask[i])) : options.protectedMask ?? current?.protectedMask;
  const appendStroke = () => writePixelArtHeightLayer2D(
    document2,
    deltas,
    touched,
    void 0,
    { wrap, ...protection ? { protectedMask: protection } : {} }
  );
  if (separate) {
    if (current) return appendStroke();
    throw new RangeError("Accumulated height exceeds Float32 geometry range");
  }
  const indices = [...changes.keys()].sort((a, b) => a - b), accumulated = indices.map((i) => changes.get(i));
  if (current) {
    const { activeLayerId: _active, ...base } = document2;
    const lowerDocument = { ...base, layers: document2.layers.slice(0, index) };
    const lower = renderPixelArtDocument2D(lowerDocument), form = renderPixelArtAuthoredHeight2D(lowerDocument);
    const before = applyPixelHeightDeltas2D(lower, current.indices, current.deltas, { ...current, height: form });
    const expected = applyPixelHeightDeltas2D(before, strokeIndices, strokeDeltas, { wrap, protectedMask: protection });
    let combined;
    try {
      combined = applyPixelHeightDeltas2D(lower, indices, accumulated, { ...current, wrap, height: form });
    } catch (error) {
      if (error instanceof RangeError) return appendStroke();
      throw error;
    }
    let exact = true;
    for (let i = 0; i < n; i++) {
      if (combined.channels.height[i] !== expected.channels.height[i]) {
        exact = false;
        break;
      }
      const j = i * 3;
      if (combined.channels.normal[j] !== expected.channels.normal[j] || combined.channels.normal[j + 1] !== expected.channels.normal[j + 1] || combined.channels.normal[j + 2] !== expected.channels.normal[j + 2]) {
        exact = false;
        break;
      }
    }
    if (exact) {
      const expectedForm = renderPixelArtAuthoredHeight2D(document2);
      for (let j = 0; j < strokeIndices.length; j++) {
        const i = strokeIndices[j];
        if (before.mask.data[i] && before.pixels[i] >>> 24) {
          expectedForm[i] = Math.fround(expectedForm[i] + strokeDeltas[j]);
          if (!float(expectedForm[i])) throw new RangeError("Accumulated authored height exceeds Float32 geometry range");
        }
      }
      for (let i = 0; i < n; i++) {
        const combinedForm = lower.mask.data[i] && lower.pixels[i] >>> 24 && !current.protectedMask?.[i] ? Math.fround((form?.[i] ?? 0) + Math.fround(changes.get(i) ?? 0) * strength) : form?.[i] ?? 0;
        if (combinedForm !== expectedForm[i]) {
          exact = false;
          break;
        }
      }
    }
    if (!exact) return appendStroke();
  }
  if (!current && document2.layers.length >= pixelArtLayerLimit2D(document2.width, document2.height)) throw new RangeError("Pixel art layer budget exceeded");
  const id = current?.id ?? nextPixelArtLayerId2D(document2, "height");
  const layer = {
    ...current ?? { id, name: `Height ${document2.layers.length + 1}` },
    kind: "height",
    indices,
    deltas: accumulated,
    wrap,
    ...!current && options.protectedMask ? { protectedMask: Array.from(options.protectedMask) } : {}
  };
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
  return {
    ...out,
    ...optionalMasks(p, p.width * p.height),
    ...authoredHeight2 ? { authoredHeight: Array.from(authoredHeight2) } : {},
    ...p.workingPalette ? { workingPalette: p.workingPalette.slice() } : {}
  };
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
  const { activeLayerId, ...input3 } = doc;
  const source = renderPixelArtDocument2D({ ...input3, layers: doc.layers.slice(0, -1) });
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

// src/examples/pixel-craft-study.ts
var node = (point2, incoming, outgoing) => ({ point: point2, ...incoming ? { in: incoming } : {}, ...outgoing ? { out: outgoing } : {} });
function createPixelCraftStudy2D(kind = "plume") {
  if (kind !== "plume" && kind !== "folds") throw new RangeError("Unknown pixel craft study");
  let doc = createBlankPixelArtDocument2D(160, 192, kind === "plume" ? "\uCCAD\uB85D \uAE43 \uC7A5\uC2DD \xB7 \uACE1\uC120\uACFC \uB192\uC774" : "\uC218\uB193\uC740 \uCC9C \xB7 \uC9C1\uC811 \uC870\uAC01\uD55C \uC8FC\uB984");
  const path = (name2, color, nodes, fill, startWidth = 0, endWidth = startWidth) => {
    const id = `path-${doc.layers.length + 1}`;
    const layer = {
      kind: "path",
      id,
      name: name2,
      color: hex(color),
      nodes,
      options: { closed: fill, fill, strokeWidth: startWidth, startWidth, endWidth, pixelPerfect: false }
    };
    doc = { ...doc, layers: [...doc.layers, layer], activeLayerId: id };
  };
  if (kind === "plume") {
    path("\uAE43\uC758 \uD718\uC5B4\uC9C4 \uC678\uACFD", "#153d4b", [
      node([100, 12], [96, 8], [130, 39]),
      node([132, 68], [133, 41], [139, 100]),
      node([89, 145], [131, 123], [77, 154]),
      node([66, 170], [76, 157], [64, 146]),
      node([28, 97], [34, 134], [20, 65]),
      node([70, 28], [35, 43], [84, 23])
    ], true);
    path("\uC548\uCABD \uCCAD\uB85D \uBA74", "#257b83", [
      node([100, 20], [89, 24], [125, 48]),
      node([125, 71], [126, 49], [131, 102]),
      node([83, 140], [115, 125], [76, 148]),
      node([70, 154], [75, 149], [66, 133]),
      node([36, 96], [45, 129], [31, 68]),
      node([72, 35], [45, 48], [84, 28])
    ], true);
    path("\uD55C\uCABD \uD070 \uC0C9 \uB369\uC5B4\uB9AC", "#43a294", [
      node([100, 24], void 0, [93, 57]),
      node([81, 105], [86, 84], [78, 125]),
      node([70, 150], [74, 137], [65, 127]),
      node([40, 94], [49, 121], [35, 67]),
      node([74, 38], [49, 49], [86, 31])
    ], true);
    for (let i = 0; i < 8; i++) {
      const y = 46 + i * 12, x = 99 - i * 3.2;
      path(
        `\uC67C\uCABD \uAE43 \uACB0 ${i + 1}`,
        i % 3 === 0 ? "#98cbb0" : "#68b7a1",
        [node([x, y], void 0, [x - 10, y - 10]), node([47 + i * 1.7, 57 + i * 10], [56 + i, 46 + i * 10])],
        false,
        2.4,
        0.4
      );
      if (i < 6) path(
        `\uC624\uB978\uCABD \uAE43 \uACB0 ${i + 1}`,
        i % 2 ? "#2d696b" : "#1b515d",
        [node([x + 2, y], void 0, [x + 18, y - 7]), node([126 - i * 2.4, 59 + i * 11], [132 - i * 2, 49 + i * 11])],
        false,
        2.2,
        0.5
      );
    }
    path("\uAE08\uBE5B \uC911\uC2EC \uC904\uAE30", "#c7a866", [node([64, 177], void 0, [81, 144]), node([100, 29], [82, 81])], false, 5, 0.6);
    path("\uC904\uAE30\uC758 \uC791\uC740 \uBC18\uC0AC", "#f0d6a0", [node([66, 170], void 0, [79, 139]), node([98, 39], [85, 85])], false, 1.6, 0.3);
    path("\uC544\uB798 \uAE08\uC18D \uACE0\uB9AC", "#9f744b", [node([54, 166]), node([72, 172]), node([69, 180]), node([51, 174])], true);
    path("\uACE0\uB9AC\uC758 \uBC1D\uC740 \uBAA8\uC11C\uB9AC", "#e2be7c", [node([54, 166]), node([72, 172])], false, 2);
  } else {
    path("\uB465\uAE00\uAC8C \uD718\uC5B4\uC9C4 \uCC9C \uC724\uACFD", "#192b42", [
      node([27, 20], [23, 25], [68, 8]),
      node([135, 26], [102, 35], [126, 73]),
      node([130, 162], [127, 123], [104, 177]),
      node([32, 170], [70, 153], [38, 115])
    ], true);
    path("\uCCAD\uC0C9 \uBE44\uB2E8\uC758 \uBC14\uD0D5", "#426c91", [
      node([33, 27], void 0, [72, 16]),
      node([128, 32], [98, 41], [121, 78]),
      node([124, 156], [121, 121], [100, 168]),
      node([39, 162], [72, 148], [44, 113])
    ], true);
    path("\uC67C\uCABD \uB113\uC740 \uC0C9\uBA74", "#577e9a", [node([35, 28]), node([55, 25], void 0, [45, 87]), node([61, 157], [51, 133]), node([40, 163], void 0, [46, 109])], true);
    path("\uC624\uB978\uCABD \uB113\uC740 \uC0C9\uBA74", "#325876", [node([102, 35], void 0, [94, 73]), node([105, 160], [100, 125]), node([123, 156], void 0, [123, 105]), node([127, 33])], true);
    path("\uC704\uCABD \uC790\uC218 \uC120", "#c49e65", [node([32, 27], void 0, [73, 15]), node([129, 32], [98, 42])], false, 2);
    path("\uC544\uB798\uCABD \uC790\uC218 \uC120", "#c49e65", [node([39, 160], void 0, [73, 146]), node([124, 154], [101, 166])], false, 2);
    const n = doc.width * doc.height, accents = /* @__PURE__ */ new Map();
    for (let j = 0; j < 8; j++) for (let i = 0; i < 6; i++) {
      const x = 45 + i * 13 + (j % 2 ? 5 : 0), y = 47 + j * 13;
      if (x > 119) continue;
      const c = hex((i + j) % 3 ? "#668498" : "#a5a48f") >>> 0;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) accents.set((y + dy) * 160 + x + dx, c);
    }
    const visible = renderPixelArtDocument2D(doc);
    const indices = [...accents.keys()].filter((i) => i < n && visible.mask.data[i]).sort((a, b) => a - b);
    doc.layers.push({ kind: "paint", id: "embroidery", name: "\uC190\uC73C\uB85C \uC124\uACC4\uD55C \uC790\uC218 \uAD70\uC9D1", indices, pixels: indices.map((i) => accents.get(i)) });
    path("\uD0C0\uC6D0\uD615 \uAE08\uC18D \uC7A5\uC2DD", "#b18b55", [
      node([80, 54], [68, 54], [94, 54]),
      node([96, 72], [96, 61], [96, 83]),
      node([80, 91], [92, 91], [66, 91]),
      node([63, 72], [63, 83], [63, 60])
    ], true);
    path("\uC548\uCABD \uC5D0\uB098\uBA5C", "#275d65", [
      node([80, 59], [71, 59], [90, 59]),
      node([91, 72], [91, 65], [91, 80]),
      node([80, 86], [89, 86], [70, 86]),
      node([68, 72], [68, 80], [68, 64])
    ], true);
    path("\uAE08\uBE5B \uC2DD\uBB3C \uBB38\uC591", "#d9be80", [node([78, 82], void 0, [85, 68]), node([78, 63], [75, 68])], false, 2, 0.6);
    path("\uBB38\uC591\uC758 \uAC00\uC9C0", "#c8b882", [node([80, 74], void 0, [85, 77]), node([87, 69], [89, 73])], false, 1.2, 0.4);
  }
  let surface = renderPixelArtDocument2D(doc), sculptId;
  const strokes = kind === "plume" ? [
    { points: [{ x: 76, y: 139 }, { x: 84, y: 99 }, { x: 99, y: 40 }], size: 34, strength: 8 },
    { points: [{ x: 47, y: 76 }, { x: 56, y: 105 }, { x: 70, y: 131 }], size: 28, strength: 3 },
    { points: [{ x: 55, y: 171 }, { x: 69, y: 175 }], size: 8, strength: 4 }
  ] : [
    { points: [{ x: 47, y: 28 }, { x: 49, y: 78 }, { x: 57, y: 150 }], size: 31, strength: 9 },
    { points: [{ x: 80, y: 32 }, { x: 73, y: 111 }, { x: 84, y: 157 }], size: 30, strength: 8 },
    { points: [{ x: 113, y: 35 }, { x: 107, y: 88 }, { x: 116, y: 151 }], size: 26, strength: 7 },
    { points: [{ x: 80, y: 72 }], size: 36, strength: 7 }
  ];
  for (const stroke of strokes) {
    const result = sculptPixelHeight2D(surface, stroke.points, { mode: "raise", size: stroke.size, strength: stroke.strength, hardness: 0.12 });
    doc = writePixelArtHeightLayer2D(doc, result.deltas, result.touched, sculptId);
    sculptId = doc.activeLayerId;
    surface = renderPixelArtDocument2D(doc);
  }
  if (sculptId) doc.layers = doc.layers.map((layer) => layer.id === sculptId ? { ...layer, name: "\uBD93\uC73C\uB85C \uC791\uC131\uD55C \uD070 \uBD80\uD53C" } : layer);
  doc.layers.push({ kind: "relight", id: "craft-light", name: "\uB530\uB73B\uD55C \uC8FC \uAD11\uC6D0\uACFC \uCC28\uAC00\uC6B4 \uBCF4\uC870\uAD11", lighting: {
    lights: [{ direction: [-0.75, -0.55, 1], color: "#ffe6bf", intensity: 0.82 }, { direction: [0.8, 0.25, 0.65], color: "#79c9da", intensity: 0.2 }],
    ambient: 0.28,
    ambientColor: "#c6d4e8",
    diffuseBands: 12,
    specular: kind === "plume" ? 0.16 : 0.08,
    roughness: 0.52,
    ambientOcclusion: 0.25,
    strength: 1
  } });
  doc.activeLayerId = "craft-light";
  return doc;
}

// gallery/pixel-art-craft.ts
var craftDrawingTools = /* @__PURE__ */ new Set(["height-raise", "height-lower", "height-flatten", "height-smooth", "path"]);
var el2 = (id) => document.getElementById(id);
var input = (id) => el2(id);
var choice = (id) => el2(id);
var button2 = (id) => el2(id);
var number = (id, low, high, integer3 = false) => {
  const value = Number(input(id).value);
  if (!Number.isFinite(value) || value < low || value > high || integer3 && !Number.isInteger(value))
    throw new RangeError(`${input(id).getAttribute("aria-label") ?? id}: ${low}~${high}${integer3 ? " \uBC94\uC704\uC758 \uC815\uC218" : " \uBC94\uC704\uC758 \uAC12"}\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.`);
  return value;
};
var sameMask2 = (a, b, count) => {
  if (a && a.length !== count) return false;
  for (let i = 0; i < count; i++) if (!!a?.[i] !== !!b[i]) return false;
  return true;
};
var cssColor = (c) => "#" + [c & 255, c >>> 8 & 255, c >>> 16 & 255].map((v) => v.toString(16).padStart(2, "0")).join("");
function installPixelArtCraft(host) {
  const result = el2("result"), toolSelect = choice("paint-tool");
  const svgNS = "http://www.w3.org/2000/svg", overlay = document.createElementNS(svgNS, "svg");
  overlay.classList.add("craft-overlay");
  overlay.setAttribute("aria-hidden", "true");
  result.parentElement.append(overlay);
  const attempt2 = (fn) => {
    try {
      fn();
    } catch (error) {
      host.status(error instanceof Error ? error.message : String(error), true);
    }
  };
  let queued2, lastTool = toolSelect.value, synchronizing = false;
  let hover;
  let stroke;
  let path;
  let drag;
  let heightEdit;
  function setView(view2) {
    choice("view").value = view2;
    choice("view").dispatchEvent(new Event("change"));
  }
  function selectTool(tool) {
    toolSelect.value = tool;
    toolSelect.dispatchEvent(new Event("change"));
    host.refresh();
  }
  function nativePoint(event, pressure = false) {
    const rect = result.getBoundingClientRect();
    return {
      x: Math.floor((event.clientX - rect.left) * result.width / rect.width),
      y: Math.floor((event.clientY - rect.top) * result.height / rect.height),
      ...pressure && event.pointerType === "pen" && input("pen-pressure").checked ? { pressure: event.pressure } : {}
    };
  }
  function pathPoint(event) {
    const rect = result.getBoundingClientRect(), snap = (v) => Math.round(v * 2) / 2;
    return [snap((event.clientX - rect.left) * result.width / rect.width), snap((event.clientY - rect.top) * result.height / rect.height)];
  }
  function release(pointer2) {
    if (pointer2 !== void 0 && result.hasPointerCapture(pointer2)) result.releasePointerCapture(pointer2);
  }
  function cancelQueue() {
    if (queued2 !== void 0) cancelAnimationFrame(queued2);
    queued2 = void 0;
  }
  function schedulePreview() {
    if (queued2 !== void 0) return;
    queued2 = requestAnimationFrame(() => {
      queued2 = void 0;
      attempt2(() => {
        if (stroke) previewSculpt();
        else if (path) previewPath();
      });
    });
  }
  function canReuseHeightLayer(doc, wrap, protection) {
    const active2 = doc.layers.find((layer) => layer.id === doc.activeLayerId);
    if (active2?.kind === "height" && (active2.locked || active2.visible === false)) throw new Error("\uC120\uD0DD\uD55C \uB192\uC774 \uB808\uC774\uC5B4\uC758 \uD45C\uC2DC\uC640 \uC7A0\uAE08\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
    const last = doc.layers.at(-1);
    return last?.kind === "height" && doc.activeLayerId === last.id && !last.locked && last.visible !== false && (last.strength ?? 1) === 1 && !!last.wrap === wrap && sameMask2(last.protectedMask, protection, doc.width * doc.height) ? last.id : void 0;
  }
  function previewSculpt() {
    if (!stroke) return;
    stroke.result = sculptPixelHeight2D(stroke.source, stroke.points, stroke.options);
    host.preview(stroke.result.sprite);
    syncOverlay();
  }
  function finishSculpt() {
    if (!stroke) return;
    cancelQueue();
    previewSculpt();
    const completed = stroke;
    stroke = void 0;
    release(completed.pointer);
    if (completed.owner !== host.document()) {
      host.preview(void 0);
      return;
    }
    try {
      if (completed.result?.touched.some(Boolean)) {
        const next = writePixelArtHeightLayer2D(
          completed.document,
          completed.result.deltas,
          completed.result.touched,
          completed.layerId,
          { wrap: completed.options?.wrap, protectedMask: completed.options?.protectedMask }
        );
        host.commit(next);
      } else {
        host.preview(void 0);
        host.status("\uB192\uC774\uB97C \uBC14\uAFC0 \uC140\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uBA3C\uC800 \uC0C9\uC744 \uADF8\uB9AC\uAC70\uB098 \uC120\uD0DD\xB7\uBCF4\uD638 \uC601\uC5ED\uACFC \uBD93 \uC138\uAE30\uB97C \uD655\uC778\uD558\uC138\uC694.");
      }
    } catch (error) {
      host.preview(void 0);
      throw error;
    }
    syncOverlay();
  }
  function cancelSculpt() {
    cancelQueue();
    const old = stroke;
    stroke = void 0;
    release(old?.pointer);
    host.preview(void 0);
    syncOverlay();
  }
  function startSculpt(event) {
    finishPath();
    finishHeightEdit();
    const doc = host.outputDocument(), source = renderPixelArtDocument2D(doc);
    const p = nativePoint(event, true);
    if (p.x < 0 || p.y < 0 || p.x >= source.w || p.y >= source.h) return;
    const height = source.channels ? void 0 : renderPixelArtAuthoredHeight2D(doc);
    if (event.altKey) {
      input("sculpt-target").value = String(source.channels?.height[p.y * source.w + p.x] ?? height?.[p.y * source.w + p.x] ?? 0);
      showValues();
      host.status("\uC774 \uC140\uC758 \uB192\uC774\uB97C \uBAA9\uD45C \uB192\uC774\uB85C \uAC00\uC838\uC654\uC2B5\uB2C8\uB2E4.");
      return;
    }
    const protection = host.protection().slice(), wrap = input("sculpt-wrap").checked, layerId = canReuseHeightLayer(doc, wrap, protection);
    if (!layerId && doc.layers.length >= pixelArtLayerLimit2D(doc.width, doc.height)) throw new RangeError("\uB192\uC774 \uB808\uC774\uC5B4\uB97C \uCD94\uAC00\uD560 \uACF5\uAC04\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uB9E8 \uC704\uC758 \uB192\uC774 \uB808\uC774\uC5B4\uB97C \uC120\uD0DD\uD558\uAC70\uB098 \uD604\uC7AC \uBAA8\uC2B5\uC744 \uAD6C\uC6CC \uC8FC\uC138\uC694.");
    stroke = {
      pointer: event.pointerId,
      owner: host.document(),
      document: doc,
      source,
      points: [p],
      layerId,
      options: {
        mode: toolSelect.value.slice(7),
        size: number("sculpt-size", 1, 256, true),
        strength: number("sculpt-strength", 0, 64),
        hardness: number("sculpt-hardness", 0, 1),
        targetHeight: number("sculpt-target", -1e6, 1e6),
        symmetry: choice("paint-symmetry").value,
        wrap,
        ...input("paint-in-selection").checked ? { selection: host.selection().slice() } : {},
        protectedMask: protection,
        ...height ? { height } : {}
      }
    };
    result.setPointerCapture(event.pointerId);
    previewSculpt();
  }
  function pathOptions() {
    const closed = input("path-closed").checked;
    return {
      closed,
      fill: input("path-fill").checked,
      strokeWidth: number("path-width", 0, 256),
      ...input("path-taper").checked && !closed ? { startWidth: number("path-start-width", 0, 256), endWidth: number("path-end-width", 0, 256) } : {},
      pixelPerfect: input("pixel-perfect").checked,
      symmetry: choice("paint-symmetry").value
    };
  }
  function pathReady() {
    if (!path?.nodes.length) return false;
    return input("path-fill").checked || (input("path-taper").checked && !input("path-closed").checked ? Number(input("path-start-width").value) > 0 || Number(input("path-end-width").value) > 0 : Number(input("path-width").value) > 0);
  }
  function pathDocument() {
    if (!path) throw new Error("\uBA3C\uC800 \uACBD\uB85C\uC758 \uC810\uC744 \uCD94\uAC00\uD574 \uC8FC\uC138\uC694.");
    const existing = path.document.layers.find((layer2) => layer2.id === path.layerId), id = path.layerId ?? nextPixelArtLayerId2D(path.document, "path");
    const layer = {
      ...existing ?? { id, name: "\uC9C1\uC811 \uADF8\uB9B0 \uACE1\uC120" },
      kind: "path",
      nodes: structuredClone(path.nodes),
      options: pathOptions(),
      color: (hex(input("paint-color").value) & 16777215 | number("path-alpha", 0, 255, true) << 24) >>> 0,
      selection: path.selection?.slice(),
      protectedMask: path.protectedMask.slice(),
      alphaLock: path.alphaLock
    };
    return { ...path.document, activeLayerId: id, layers: existing ? path.document.layers.map((old) => old.id === id ? layer : old) : [...path.document.layers, layer] };
  }
  function previewPath() {
    if (!path) return;
    if (pathReady()) {
      const next = pathDocument(), raster = renderPixelArtDocument2D(next);
      path.candidate = next;
      host.preview(raster);
    } else {
      path.candidate = void 0;
      host.preview(void 0);
    }
    syncPathControls();
    syncOverlay();
  }
  function newPath() {
    finishSculpt();
    finishHeightEdit();
    const doc = host.outputDocument();
    if (doc.layers.length >= pixelArtLayerLimit2D(doc.width, doc.height)) throw new RangeError("\uACBD\uB85C \uB808\uC774\uC5B4\uB97C \uCD94\uAC00\uD560 \uACF5\uAC04\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uAE30\uC874 \uACBD\uB85C\uB97C \uC218\uC815\uD558\uAC70\uB098 \uD604\uC7AC \uBAA8\uC2B5\uC744 \uAD6C\uC6CC \uC8FC\uC138\uC694.");
    path = {
      owner: host.document(),
      document: doc,
      nodes: [],
      selected: -1,
      dirty: false,
      ...input("paint-in-selection").checked ? { selection: Array.from(host.selection()) } : {},
      protectedMask: Array.from(host.protection()),
      alphaLock: input("alpha-lock").checked
    };
    el2("path-craft-panel").open = true;
    syncPathControls();
    syncOverlay();
  }
  function finishPath() {
    if (!path) return;
    cancelQueue();
    const oldDrag = drag;
    drag = void 0;
    release(oldDrag?.pointer);
    if (path.owner !== host.document()) {
      path = void 0;
      host.preview(void 0);
      return;
    }
    if (!path.nodes.length || !path.dirty) {
      path = void 0;
      host.preview(void 0);
      syncPathControls();
      syncOverlay();
      return;
    }
    if (!pathReady()) throw new Error("\uC120\uC744 \uADF8\uB9AC\uB824\uBA74 \uAD75\uAE30\uB97C 0\uBCF4\uB2E4 \uD06C\uAC8C \uC815\uD558\uAC70\uB098 \uB2EB\uD78C \uBAA8\uC591\uC758 \uCC44\uC6B0\uAE30\uB97C \uCF1C \uC8FC\uC138\uC694.");
    const next = pathDocument();
    renderPixelArtDocument2D(next);
    const pending = path;
    try {
      host.commit(next);
      path = void 0;
    } catch (error) {
      if (host.document() === pending.owner) {
        path = pending;
        host.preview(renderPixelArtDocument2D(next));
      } else {
        path = void 0;
        host.preview(void 0);
      }
      syncPathControls();
      syncOverlay();
      throw error;
    }
    syncPathControls();
    syncOverlay();
  }
  function cancelPath() {
    cancelQueue();
    const old = drag;
    drag = void 0;
    path = void 0;
    release(old?.pointer);
    host.preview(void 0);
    syncPathControls();
    syncOverlay();
  }
  function hitNode(event) {
    if (!path) return;
    const rect = result.getBoundingClientRect(), sx = rect.width / result.width, sy = rect.height / result.height;
    const distance = (p) => Math.hypot(rect.left + p[0] * sx - event.clientX, rect.top + p[1] * sy - event.clientY);
    const candidates = [];
    const selected = path.nodes[path.selected];
    if (selected) {
      candidates.push({ index: path.selected, part: "point", distance: distance(selected.point) });
      for (const part of ["in", "out"]) if (selected[part]) candidates.push({ index: path.selected, part, distance: distance(selected[part]) });
    }
    path.nodes.forEach((node2, index) => {
      if (index !== path.selected) candidates.push({ index, part: "point", distance: distance(node2.point) });
    });
    const nearest = candidates.filter((candidate) => candidate.distance <= 8).sort((a, b) => a.distance - b.distance + (a.distance === b.distance ? Number(a.part !== "point") - Number(b.part !== "point") : 0))[0];
    if (nearest) return { index: nearest.index, part: nearest.part };
  }
  function startPath(event) {
    finishSculpt();
    finishHeightEdit();
    if (!path) newPath();
    const p = pathPoint(event), hit = hitNode(event), before = structuredClone(path.nodes);
    if (!hit && (p[0] < 0 || p[1] < 0 || p[0] > result.width || p[1] > result.height)) return;
    if (!hit && path.nodes.length >= 1024) throw new RangeError("\uD55C \uACBD\uB85C\uC5D0\uB294 \uC810\uC744 1024\uAC1C\uAE4C\uC9C0 \uB458 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
    if (!hit) {
      path.nodes.push({ point: p });
      path.selected = path.nodes.length - 1;
      path.dirty = true;
    } else path.selected = hit.index;
    drag = { pointer: event.pointerId, index: path.selected, part: hit?.part ?? "create", start: p, nodes: before };
    result.setPointerCapture(event.pointerId);
    previewPath();
  }
  function movePath(event) {
    if (!path || !drag || drag.pointer !== event.pointerId) return;
    const p = pathPoint(event), node2 = path.nodes[drag.index];
    if (drag.part === "create") {
      if (Math.hypot(p[0] - node2.point[0], p[1] - node2.point[1]) < 0.5) return;
      node2.out = p;
      node2.in = [2 * node2.point[0] - p[0], 2 * node2.point[1] - p[1]];
    } else if (drag.part === "point") {
      const original = drag.nodes[drag.index], dx = p[0] - drag.start[0], dy = p[1] - drag.start[1];
      node2.point = [original.point[0] + dx, original.point[1] + dy];
      if (original.in) node2.in = [original.in[0] + dx, original.in[1] + dy];
      if (original.out) node2.out = [original.out[0] + dx, original.out[1] + dy];
    } else {
      node2[drag.part] = p;
      if (input("path-linked-handles").checked && !event.altKey) node2[drag.part === "in" ? "out" : "in"] = [2 * node2.point[0] - p[0], 2 * node2.point[1] - p[1]];
    }
    path.dirty = true;
    schedulePreview();
    syncOverlay();
  }
  function finishPathDrag() {
    if (!drag) return;
    cancelQueue();
    const previous = drag;
    drag = void 0;
    release(previous.pointer);
    previewPath();
  }
  function cancelPathDrag() {
    if (!drag || !path) return;
    cancelQueue();
    const previous = drag;
    drag = void 0;
    path.nodes = previous.nodes;
    path.selected = Math.min(path.selected, path.nodes.length - 1);
    release(previous.pointer);
    previewPath();
  }
  function moveSelected(dx, dy) {
    if (!path || path.selected < 0) return;
    const node2 = path.nodes[path.selected];
    for (const part of ["point", "in", "out"]) if (node2[part]) node2[part] = [node2[part][0] + dx, node2[part][1] + dy];
    path.dirty = true;
    previewPath();
  }
  function selectedKind(smooth) {
    if (!path || path.selected < 0) return;
    const i = path.selected, node2 = path.nodes[i];
    if (!smooth) {
      delete node2.in;
      delete node2.out;
    } else {
      const previous = path.nodes[i - 1]?.point ?? node2.point, next = path.nodes[i + 1]?.point ?? node2.point;
      let dx = (next[0] - previous[0]) / 6, dy = (next[1] - previous[1]) / 6;
      if (Math.hypot(dx, dy) < 1) {
        dx = Math.max(2, result.width / 12);
        dy = 0;
      }
      node2.in = [node2.point[0] - dx, node2.point[1] - dy];
      node2.out = [node2.point[0] + dx, node2.point[1] + dy];
    }
    path.dirty = true;
    previewPath();
  }
  function removeSelected() {
    if (!path || path.selected < 0) return;
    path.nodes.splice(path.selected, 1);
    path.selected = Math.min(path.selected, path.nodes.length - 1);
    path.dirty = true;
    previewPath();
  }
  function heightDocument() {
    if (!heightEdit) throw new Error("\uBA3C\uC800 \uB192\uC774 \uB808\uC774\uC5B4\uB97C \uC120\uD0DD\uD558\uC138\uC694.");
    const strength = number("height-layer-strength", 0, 4);
    return {
      ...heightEdit.document,
      activeLayerId: heightEdit.layer.id,
      layers: heightEdit.document.layers.map((layer) => layer.id === heightEdit.layer.id ? { ...heightEdit.layer, strength } : layer)
    };
  }
  function finishHeightEdit() {
    if (!heightEdit) return;
    if (heightEdit.owner !== host.document() || !heightEdit.dirty) {
      heightEdit = void 0;
      host.preview(void 0);
      showValues();
      return;
    }
    const next = heightDocument();
    renderPixelArtDocument2D(next);
    const pending = heightEdit;
    try {
      host.commit(next);
      heightEdit = void 0;
    } catch (error) {
      if (host.document() === pending.owner) {
        heightEdit = pending;
        host.preview(renderPixelArtDocument2D(next));
      } else {
        heightEdit = void 0;
        host.preview(void 0);
      }
      showValues();
      throw error;
    }
    showValues();
  }
  function cancelHeightEdit() {
    heightEdit = void 0;
    host.preview(void 0);
    showValues();
  }
  function editLayer(id) {
    finish();
    host.discardPreview();
    const doc = host.outputDocument(), layer = doc.layers.find((layer2) => layer2.id === id);
    if (!layer || layer.kind !== "path" && layer.kind !== "height") throw new Error("\uC120\uD0DD\uD55C \uACE1\uC120 \uB610\uB294 \uB192\uC774 \uB808\uC774\uC5B4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    if (layer.locked || layer.visible === false) throw new Error("\uB808\uC774\uC5B4\uC758 \uD45C\uC2DC\uC640 \uC7A0\uAE08\uC744 \uD655\uC778\uD55C \uB4A4 \uC218\uC815\uD558\uC138\uC694.");
    if (layer.kind === "path") {
      selectTool("path");
      input("paint-color").value = cssColor(layer.color);
      input("path-alpha").value = String(layer.color >>> 24);
      input("path-closed").checked = layer.options.closed ?? false;
      input("path-fill").checked = layer.options.fill ?? false;
      input("path-width").value = String(layer.options.closed ? layer.options.startWidth ?? layer.options.strokeWidth ?? 1 : layer.options.strokeWidth ?? 1);
      input("path-start-width").value = String(layer.options.startWidth ?? layer.options.strokeWidth ?? 1);
      input("path-end-width").value = String(layer.options.endWidth ?? layer.options.strokeWidth ?? 1);
      input("path-taper").checked = !layer.options.closed && ((layer.options.startWidth ?? layer.options.strokeWidth ?? 1) !== (layer.options.strokeWidth ?? 1) || (layer.options.endWidth ?? layer.options.strokeWidth ?? 1) !== (layer.options.strokeWidth ?? 1));
      input("pixel-perfect").checked = layer.options.pixelPerfect ?? false;
      choice("paint-symmetry").value = layer.options.symmetry ?? "none";
      input("alpha-lock").checked = layer.alphaLock ?? false;
      input("paint-in-selection").checked = !!layer.selection;
      path = {
        owner: host.document(),
        document: doc,
        layerId: layer.id,
        nodes: structuredClone(layer.nodes),
        selected: layer.nodes.length ? 0 : -1,
        ...layer.selection ? { selection: layer.selection.slice() } : {},
        protectedMask: layer.protectedMask?.slice() ?? Array.from(host.protection()),
        alphaLock: layer.alphaLock ?? false,
        dirty: false
      };
      if (layer.selection) host.setSelection(Uint8Array.from(layer.selection));
      el2("path-craft-panel").open = true;
      previewPath();
    } else {
      selectTool("height-raise");
      heightEdit = { owner: host.document(), document: doc, layer, dirty: false };
      input("height-layer-strength").value = String(layer.strength ?? 1);
      el2("height-layer-name").textContent = layer.name;
      el2("height-craft-panel").open = true;
      showValues();
    }
  }
  function showValues() {
    el2("sculpt-hardness-value").textContent = `${Math.round(Number(input("sculpt-hardness").value) * 100)}%`;
    el2("height-layer-strength-value").textContent = `${Number(input("height-layer-strength").value).toFixed(2)}\xD7`;
    el2("height-layer-editor").hidden = !heightEdit;
    const mode = toolSelect.value.slice(7), blended = mode === "flatten" || mode === "smooth";
    el2("sculpt-strength-note").textContent = blended ? "\uB9DE\uCD94\uAE30\xB7\uC815\uB9AC\uB294 0~1 \uD63C\uD569 \uAC15\uB3C4\uC785\uB2C8\uB2E4. 1\uBCF4\uB2E4 \uD070 \uAC12\uC740 \uC644\uC804 \uC801\uC6A9\uC73C\uB85C \uCC98\uB9AC\uD569\uB2C8\uB2E4." : "\uC62C\uB9AC\uAE30\xB7\uB0B4\uB9AC\uAE30\uC758 \uC138\uAE30\uB294 \uB124\uC774\uD2F0\uBE0C \uD53D\uC140 \uB192\uC774\uC785\uB2C8\uB2E4. \uD55C \uD68D \uC548\uC5D0\uC11C \uACB9\uCCD0\uB3C4 \uC911\uBCF5 \uAC00\uC0B0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.";
    for (const item of document.querySelectorAll("[data-craft-tool]")) item.setAttribute("aria-pressed", String(item.dataset.craftTool === toolSelect.value));
  }
  let nodeOptionsKey = "";
  function syncPathControls() {
    const nodes = path?.nodes ?? [], selected = path?.selected ?? -1, closed = input("path-closed").checked;
    input("path-taper").disabled = closed;
    input("path-start-width").disabled = closed || !input("path-taper").checked;
    input("path-end-width").disabled = closed || !input("path-taper").checked;
    const key = `${nodes.length}:${selected}`;
    if (key !== nodeOptionsKey) {
      nodeOptionsKey = key;
      const select5 = choice("path-node");
      select5.replaceChildren(...nodes.map((_, i) => {
        const option = document.createElement("option");
        option.value = String(i);
        option.textContent = `\uC810 ${i + 1}`;
        return option;
      }));
      select5.value = String(selected);
      select5.disabled = !nodes.length;
    }
    for (const id of ["path-corner", "path-smooth", "path-delete", "path-x", "path-y"]) el2(id).disabled = selected < 0;
    const point2 = nodes[selected]?.point;
    if (point2) {
      for (const [id, value] of [["path-x", point2[0]], ["path-y", point2[1]]]) if (document.activeElement !== input(id)) input(id).value = String(Math.round(value * 1e3) / 1e3);
    }
    button2("path-apply").disabled = !pathReady();
    button2("path-cancel").disabled = !path;
    button2("path-apply").textContent = path?.layerId ? "\uACBD\uB85C \uC218\uC815 \uC801\uC6A9" : "\uACBD\uB85C \uB808\uC774\uC5B4 \uC801\uC6A9";
    el2("path-info").textContent = !path ? "\uC624\uB978\uCABD \uADF8\uB9BC\uC744 \uD074\uB9AD\uD574 \uC810\uC744 \uCD94\uAC00\uD558\uC138\uC694. \uB204\uB978 \uCC44 \uB4DC\uB798\uADF8\uD558\uBA74 \uACE1\uC120 \uD578\uB4E4\uC774 \uC0DD\uAE41\uB2C8\uB2E4." : `${path.layerId ? "\uAE30\uC874 \uACBD\uB85C \uC218\uC815" : "\uC0C8 \uACBD\uB85C"} \xB7 ${nodes.length}\uAC1C \uC810${selected >= 0 ? ` \xB7 \uC120\uD0DD ${selected + 1}` : ""} \xB7 Enter \uC801\uC6A9 / Escape \uCDE8\uC18C \xB7 \uBC29\uD5A5\uD0A4\uB85C \uC810 \uC774\uB3D9`;
  }
  function svg(tag, attributes) {
    const node2 = document.createElementNS(svgNS, tag);
    for (const [name2, value] of Object.entries(attributes)) node2.setAttribute(name2, String(value));
    return node2;
  }
  function syncOverlay() {
    const rect = result.getBoundingClientRect(), scale = rect.width / result.width || 1;
    overlay.setAttribute("viewBox", `0 0 ${result.width} ${result.height}`);
    overlay.style.width = result.style.width;
    overlay.style.height = result.style.height;
    const elements = [], line = { "vector-effect": "non-scaling-stroke", "stroke-width": 1.2 };
    if (path && toolSelect.value === "path") {
      let d = "";
      path.nodes.forEach((node2, i) => {
        if (!i) {
          d = `M ${node2.point.join(" ")}`;
          return;
        }
        const previous = path.nodes[i - 1];
        d += previous.out || node2.in ? ` C ${(previous.out ?? previous.point).join(" ")} ${(node2.in ?? node2.point).join(" ")} ${node2.point.join(" ")}` : ` L ${node2.point.join(" ")}`;
      });
      if (path.nodes.length && input("path-closed").checked) {
        const first = path.nodes[0], last = path.nodes.at(-1);
        d += ` C ${(last.out ?? last.point).join(" ")} ${(first.in ?? first.point).join(" ")} ${first.point.join(" ")}`;
      }
      if (d) elements.push(svg("path", { d, fill: "none", stroke: "#dcf5cb", "stroke-dasharray": "4 4", ...line }));
      const selected = path.nodes[path.selected];
      if (selected) for (const part of ["in", "out"]) {
        const p = selected[part];
        if (!p) continue;
        elements.push(svg("line", { x1: selected.point[0], y1: selected.point[1], x2: p[0], y2: p[1], stroke: "#90cfff", ...line }));
        elements.push(svg("circle", { cx: p[0], cy: p[1], r: 4 / scale, fill: "#18394e", stroke: "#bce3ff", ...line }));
      }
      path.nodes.forEach((node2, i) => {
        const half = (i === path.selected ? 4 : 3) / scale;
        elements.push(svg("rect", {
          x: node2.point[0] - half,
          y: node2.point[1] - half,
          width: half * 2,
          height: half * 2,
          fill: i === path.selected ? "#d3f2b9" : "#172a23",
          stroke: "#d3f2b9",
          ...line
        }));
      });
    } else if (toolSelect.value.startsWith("height-") && hover) {
      const fullSize = Number(input("sculpt-size").value), size = Math.max(1, fullSize * (hover.pressure ?? 1)), wrap = input("sculpt-wrap").checked;
      const anchor = fullSize % 2 ? 0.5 : 1;
      for (const oy of wrap ? [-result.height, 0, result.height] : [0]) for (const ox of wrap ? [-result.width, 0, result.width] : [0]) {
        elements.push(svg("circle", { cx: hover.x + anchor + ox, cy: hover.y + anchor + oy, r: size / 2, fill: "none", stroke: "#d9f2c4", ...line }));
      }
    }
    overlay.replaceChildren(...elements);
    overlay.style.display = elements.length ? "" : "none";
  }
  function finish() {
    finishSculpt();
    finishPathDrag();
    finishPath();
    finishHeightEdit();
  }
  function cancel() {
    cancelQueue();
    const oldStroke = stroke, oldDrag = drag;
    stroke = void 0;
    drag = void 0;
    path = void 0;
    heightEdit = void 0;
    release(oldStroke?.pointer);
    release(oldDrag?.pointer);
    host.preview(void 0);
    showValues();
    syncPathControls();
    syncOverlay();
  }
  function sync() {
    if (synchronizing) return;
    synchronizing = true;
    try {
      if (stroke && stroke.owner !== host.document() || path && path.owner !== host.document() || heightEdit && heightEdit.owner !== host.document()) cancel();
      const tool = toolSelect.value;
      if (lastTool !== tool) {
        if (path && tool !== "path") attempt2(finishPath);
        if (stroke) attempt2(finishSculpt);
        lastTool = tool;
      }
      showValues();
      syncPathControls();
      syncOverlay();
      if (tool === "path") el2("paint-hint").textContent = "\uD074\uB9AD: \uC810 \uCD94\uAC00 \xB7 \uB4DC\uB798\uADF8: \uACE1\uC120 \uD578\uB4E4 \xB7 \uC810/\uD578\uB4E4 \uC774\uB3D9 \xB7 Enter: \uC801\uC6A9 \xB7 Escape: \uCDE8\uC18C";
      else if (tool.startsWith("height-")) el2("paint-hint").textContent = "\uC0C9\uACFC \uD22C\uBA85\uB3C4\uB97C \uBCF4\uC874\uD558\uACE0 \uD45C\uBA74 \uB192\uC774\uB97C \uC9C1\uC811 \uB9CC\uB4ED\uB2C8\uB2E4. Alt + \uD074\uB9AD: \uBAA9\uD45C \uB192\uC774 \uCD94\uCD9C. \uBCF4\uD638\xB7\uC120\uD0DD\xB7\uB300\uCE6D\uC744 \uC801\uC6A9\uD569\uB2C8\uB2E4.";
    } finally {
      synchronizing = false;
    }
  }
  result.addEventListener("pointerdown", (event) => attempt2(() => {
    if (event.button !== 0 || !craftDrawingTools.has(toolSelect.value)) return;
    event.preventDefault();
    if (toolSelect.value === "path") startPath(event);
    else startSculpt(event);
  }));
  result.addEventListener("pointermove", (event) => attempt2(() => {
    hover = nativePoint(event, true);
    if (stroke && stroke.pointer === event.pointerId) {
      const samples = event.getCoalescedEvents?.();
      for (const sample of samples?.length ? samples : [event]) {
        const p = nativePoint(sample, true), last = stroke.points.at(-1);
        if (last.x !== p.x || last.y !== p.y || last.pressure !== p.pressure) stroke.points.push(p);
      }
      schedulePreview();
    } else if (drag) movePath(event);
    syncOverlay();
  }));
  result.addEventListener("pointerup", (event) => attempt2(() => {
    if (stroke?.pointer === event.pointerId) {
      const p = nativePoint(event, true), last = stroke.points.at(-1);
      if (event.pointerType === "pen") p.pressure = last.pressure;
      if (last.x !== p.x || last.y !== p.y) stroke.points.push(p);
      finishSculpt();
    } else if (drag?.pointer === event.pointerId) {
      movePath(event);
      finishPathDrag();
    }
  }));
  result.addEventListener("pointercancel", () => {
    if (stroke) cancelSculpt();
    if (drag) cancelPathDrag();
  });
  result.addEventListener("lostpointercapture", () => {
    if (stroke) cancelSculpt();
    if (drag) cancelPathDrag();
  });
  result.addEventListener("pointerleave", () => {
    if (!stroke && !drag) {
      hover = void 0;
      syncOverlay();
    }
  });
  toolSelect.addEventListener("change", () => attempt2(() => {
    const tool = toolSelect.value;
    if (path && tool !== "path") finishPath();
    if (stroke) finishSculpt();
    if (heightEdit && !tool.startsWith("height-")) finishHeightEdit();
    if (tool.startsWith("height-")) {
      el2("height-craft-panel").open = true;
      if (!lastTool.startsWith("height-") && choice("view").value === "color") setView("height");
    } else if (tool === "path") {
      el2("path-craft-panel").open = true;
      if (choice("view").value !== "color") setView("color");
    }
    lastTool = tool;
    sync();
  }));
  for (const item of document.querySelectorAll("[data-craft-tool]")) item.onclick = () => attempt2(() => selectTool(item.dataset.craftTool));
  for (const item of document.querySelectorAll("[data-craft-view]")) item.onclick = () => setView(item.dataset.craftView);
  for (const kind of ["plume", "folds"]) button2(`craft-study-${kind}`).onclick = () => attempt2(() => {
    cancel();
    host.discardPreview();
    host.newCanvas(createPixelCraftStudy2D(kind));
    input("paint-in-selection").checked = false;
    input("alpha-lock").checked = false;
    selectTool("inspect");
    setView("color");
    choice("zoom").value = "auto";
    choice("zoom").dispatchEvent(new Event("change"));
    el2("craft-study-note").textContent = kind === "plume" ? "\uAE43 \uC7A5\uC2DD\uC758 \uACE1\uC120 \uB808\uC774\uC5B4\uB97C \uACE0\uB974\uACE0 \uC124\uC815\uC744 \uC5F4\uC5B4 \uC810\xB7\uD578\uB4E4\uC744 \uC218\uC815\uD574 \uBCF4\uC138\uC694." : "\uCC9C\uC758 \uB192\uC774 \uB808\uC774\uC5B4\uB97C \uACE0\uB974\uACE0 \uBC30\uC728\uC744 \uC870\uC808\uD558\uAC70\uB098, \uB192\uC774 \uBD93\uC73C\uB85C \uC8FC\uB984\uC744 \uB354\uD574 \uBCF4\uC138\uC694.";
  });
  for (const id of ["sculpt-size", "sculpt-strength", "sculpt-hardness", "sculpt-target", "sculpt-wrap"]) input(id).addEventListener("input", () => {
    showValues();
    syncOverlay();
  });
  button2("path-new").onclick = () => attempt2(() => {
    finish();
    selectTool("path");
    newPath();
  });
  button2("path-apply").onclick = () => attempt2(finishPath);
  button2("path-cancel").onclick = cancelPath;
  button2("path-corner").onclick = () => attempt2(() => selectedKind(false));
  button2("path-smooth").onclick = () => attempt2(() => selectedKind(true));
  button2("path-delete").onclick = () => attempt2(removeSelected);
  choice("path-node").onchange = () => {
    if (path) {
      path.selected = Number(choice("path-node").value);
      syncPathControls();
      syncOverlay();
    }
  };
  for (const [id, axis] of [["path-x", 0], ["path-y", 1]]) input(id).onchange = () => attempt2(() => {
    if (!path || path.selected < 0) return;
    const delta = number(id, -1048576, 1048576) - path.nodes[path.selected].point[axis];
    moveSelected(axis === 0 ? delta : 0, axis === 1 ? delta : 0);
  });
  for (const id of ["path-closed", "path-fill", "path-width", "path-taper", "path-start-width", "path-end-width", "path-alpha"]) input(id).addEventListener("input", () => attempt2(() => {
    if (id === "path-fill" && input(id).checked) input("path-closed").checked = true;
    if (id === "path-closed" && !input(id).checked) input("path-fill").checked = false;
    if (path) {
      path.dirty = true;
      previewPath();
    } else syncPathControls();
  }));
  for (const id of ["paint-color", "paint-symmetry", "pixel-perfect", "paint-in-selection", "alpha-lock"]) el2(id).addEventListener("input", () => attempt2(() => {
    if (path) {
      if (id === "paint-in-selection") path.selection = input(id).checked ? Array.from(host.selection()) : void 0;
      if (id === "alpha-lock") path.alphaLock = input(id).checked;
      path.dirty = true;
      previewPath();
    }
  }));
  input("height-layer-strength").oninput = () => attempt2(() => {
    showValues();
    if (!heightEdit) return;
    heightEdit.dirty = true;
    host.preview(renderPixelArtDocument2D(heightDocument()));
  });
  button2("height-layer-apply").onclick = () => attempt2(finishHeightEdit);
  button2("height-layer-cancel").onclick = cancelHeightEdit;
  window.addEventListener("keydown", (event) => {
    if (event.target.closest('input,select,textarea,[contenteditable="true"]')) return;
    if (event.key === "Escape" && (stroke || path || heightEdit)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel();
      return;
    }
    if (event.key === "Enter" && (path || heightEdit)) {
      event.preventDefault();
      attempt2(finish);
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (toolSelect.value === "path" && path) {
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        attempt2(removeSelected);
        return;
      }
      const step = event.shiftKey ? 10 : 1, delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (delta[event.key]) {
        event.preventDefault();
        attempt2(() => moveSelected(...delta[event.key]));
        return;
      }
    }
    if (event.key.toLowerCase() === "p" || event.key.toLowerCase() === "h") {
      event.preventDefault();
      attempt2(() => selectTool(event.key.toLowerCase() === "p" ? "path" : "height-raise"));
    }
  }, { capture: true });
  showValues();
  syncPathControls();
  return { sync, finish, editLayer, cancel };
}

// gallery/pixel-art-adjustments.ts
var el3 = (id) => document.getElementById(id);
var field2 = (id) => el3(id);
var choice2 = (id) => el3(id);
var button3 = (id) => el3(id);
var cssColor2 = (c) => typeof c === "string" ? c : "#" + [c & 255, c >>> 8 & 255, c >>> 16 & 255].map((v) => v.toString(16).padStart(2, "0")).join("");
function installPixelArtAdjustments(host, palette2, setPalette, finishStroke) {
  let editing;
  let queued2 = 0, loading = false;
  const attempt2 = (fn) => {
    try {
      fn();
    } catch (error) {
      host.status(error instanceof Error ? error.message : String(error), true);
    }
  };
  const note = document.createElement("p");
  note.className = "hint";
  note.id = "adjustment-edit-state";
  note.hidden = true;
  el3("layer-list").before(note);
  const cancelButtons = ["palette", "relight"].map((kind) => {
    const cancel = document.createElement("button");
    cancel.id = `cancel-${kind}-edit`;
    cancel.textContent = "\uC218\uC815 \uCDE8\uC18C";
    cancel.hidden = true;
    button3(`apply-${kind}`).after(cancel);
    cancel.onclick = () => cancelEdit();
    return cancel;
  });
  const strengthLabel = document.createElement("label");
  strengthLabel.textContent = "\uC801\uC6A9 \uAC15\uB3C4 ";
  const strength = document.createElement("input");
  strength.id = "palette-strength";
  strength.type = "number";
  strength.min = "0";
  strength.max = "1";
  strength.step = "0.05";
  strength.value = "1";
  strengthLabel.append(strength);
  button3("apply-palette").before(strengthLabel);
  function cancelEdit(clearPreview = true) {
    if (queued2) cancelAnimationFrame(queued2);
    queued2 = 0;
    const hadPreview = !!editing?.candidate;
    editing = void 0;
    syncLabels();
    if (clearPreview && hadPreview) host.preview(void 0);
  }
  function setNumber(id, value) {
    const control = field2(id);
    control.step = "any";
    if (control.min !== "") control.min = String(Math.min(Number(control.min), value));
    if (control.max !== "") control.max = String(Math.max(Number(control.max), value));
    control.value = String(value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function readNewLight() {
    const a = Number(field2("relight-angle").value) * Math.PI / 180, e = Number(field2("relight-elevation").value) * Math.PI / 180;
    return {
      lights: [
        {
          direction: [Math.cos(a) * Math.cos(e), Math.sin(a) * Math.cos(e), Math.sin(e)],
          color: field2("relight-key-color").value,
          intensity: Number(field2("relight-intensity").value),
          castShadow: Number(field2("relight-shadow").value)
        },
        { direction: [-Math.cos(a), -Math.sin(a), 0.7], color: field2("relight-fill-color").value, intensity: Number(field2("relight-fill").value) }
      ],
      ambient: Number(field2("relight-ambient").value),
      diffuseBands: Number(field2("relight-bands").value),
      roughness: Number(field2("relight-roughness").value),
      ambientOcclusion: Number(field2("relight-ao").value),
      strength: Number(field2("relight-strength").value),
      wrap: field2("relight-wrap").checked,
      ...field2("relight-palette").checked ? { palette: [...palette2()] } : {}
    };
  }
  function readEditedLight(layer, changed2) {
    const original = structuredClone(createPixelRelighter2D(layer.lighting).options), input3 = readNewLight();
    const lights = original.lights.map((light) => ({ ...light, direction: [...light.direction] }));
    const keyChanged = ["relight-angle", "relight-elevation", "relight-key-color", "relight-intensity", "relight-shadow"].some((id) => changed2.has(id));
    if (keyChanged) {
      const source = lights[0] ?? input3.lights[0];
      lights[0] = {
        ...source,
        direction: [...source.direction],
        ...changed2.has("relight-angle") || changed2.has("relight-elevation") ? { direction: [...input3.lights[0].direction] } : {},
        ...changed2.has("relight-key-color") ? { color: hex(field2("relight-key-color").value) } : {},
        ...changed2.has("relight-intensity") ? { intensity: input3.lights[0].intensity } : {},
        ...changed2.has("relight-shadow") ? { castShadow: input3.lights[0].castShadow } : {}
      };
    }
    if (changed2.has("relight-fill-color") || changed2.has("relight-fill")) {
      if (!lights[0]) lights[0] = { ...createPixelRelighter2D({ lights: [{ direction: [0, 0, 1], intensity: 0 }] }).options.lights[0], direction: [0, 0, 1] };
      const source = lights[1] ?? createPixelRelighter2D({ lights: [input3.lights[1]] }).options.lights[0];
      lights[1] = {
        ...source,
        direction: [...source.direction],
        ...changed2.has("relight-fill-color") ? { color: hex(field2("relight-fill-color").value) } : {},
        ...changed2.has("relight-fill") ? { intensity: Number(field2("relight-fill").value) } : {}
      };
    }
    const result = { ...original, lights };
    const mapping = { ambient: "ambient", bands: "diffuseBands", roughness: "roughness", ao: "ambientOcclusion", strength: "strength" };
    for (const [control, key] of Object.entries(mapping)) if (changed2.has(`relight-${control}`)) result[key] = Number(field2(`relight-${control}`).value);
    if (changed2.has("relight-wrap")) result.wrap = field2("relight-wrap").checked;
    if (changed2.has("relight-palette") || changed2.has("palette-colors") && field2("relight-palette").checked) {
      if (field2("relight-palette").checked) result.palette = [...palette2()];
      else delete result.palette;
    }
    return result;
  }
  function candidate() {
    if (!editing || editing.base !== host.document()) throw new Error("\uD3B8\uC9D1\uD560 \uB808\uC774\uC5B4\uAC00 \uBC14\uB00C\uC5C8\uC2B5\uB2C8\uB2E4. \uC124\uC815\uC744 \uB2E4\uC2DC \uC5F4\uC5B4 \uC8FC\uC138\uC694.");
    const { base, layer, changed: changed2 } = editing;
    const replacement2 = layer.kind === "palette" ? {
      ...layer,
      palette: [...palette2()],
      dither: choice2("palette-dither").value,
      strength: Number(strength.value)
    } : { ...layer, lighting: readEditedLight(layer, changed2) };
    return { ...base, layers: base.layers.map((item) => item.id === layer.id ? replacement2 : item), activeLayerId: layer.id };
  }
  function preview() {
    queued2 = 0;
    if (!editing || !editing.changed.size || editing.base !== host.document()) return;
    attempt2(() => {
      const next = candidate(), raster = renderPixelArtDocument2D(next);
      editing.candidate = next;
      host.preview(raster);
      note.textContent = `${editing.layer.name} \uC218\uC815 \uC911 \xB7 \uAC19\uC740 \uB808\uC774\uC5B4\uC5D0 \uC801\uC6A9\uD569\uB2C8\uB2E4.`;
    });
  }
  function mark(id) {
    if (loading || !editing) return;
    if (editing.layer.kind === "palette" && !["palette-dither", "palette-strength", "palette-colors"].includes(id)) return;
    if (editing.layer.kind === "relight" && !id.startsWith("relight-") && id !== "palette-colors") return;
    editing.changed.add(id);
    if (!queued2) queued2 = requestAnimationFrame(preview);
  }
  for (const id of [
    "palette-dither",
    "palette-strength",
    "relight-angle",
    "relight-elevation",
    "relight-key-color",
    "relight-fill-color",
    "relight-intensity",
    "relight-fill",
    "relight-ambient",
    "relight-roughness",
    "relight-ao",
    "relight-shadow",
    "relight-strength",
    "relight-bands",
    "relight-wrap",
    "relight-palette"
  ]) {
    el3(id).addEventListener("input", () => mark(id));
    el3(id).addEventListener("change", () => mark(id));
  }
  el3("workbench-palette").addEventListener("input", () => mark("palette-colors"));
  function edit(id) {
    finishStroke();
    cancelEdit();
    host.discardPreview();
    const base = host.document(), layer = base.layers.find((layer2) => layer2.id === id);
    if (!layer || layer.kind !== "palette" && layer.kind !== "relight" || layer.locked || layer.visible === false) return;
    loading = true;
    try {
      editing = { base, layer: structuredClone(layer), changed: /* @__PURE__ */ new Set() };
      if (layer.kind === "palette") {
        setPalette(layer.palette.map((c) => typeof c === "string" ? hex(c) : c));
        choice2("palette-dither").value = layer.dither ?? "none";
        strength.value = String(layer.strength ?? 1);
        el3("palette-note").textContent = `${layer.name}\uC758 \uD314\uB808\uD2B8\uB97C \uC218\uC815\uD569\uB2C8\uB2E4. \uC800\uC7A5\uB41C \uC120\uD0DD\xB7\uBCF4\uD638\xB7\uC88C\uD45C\uB294 \uC720\uC9C0\uB429\uB2C8\uB2E4.`;
        el3("palette-note").scrollIntoView({ block: "nearest" });
      } else {
        const options = createPixelRelighter2D(layer.lighting).options, key = options.lights[0], fill = options.lights[1], direction2 = key?.direction ?? [-0.6, -0.7, 1];
        setNumber("relight-angle", Math.atan2(direction2[1], direction2[0]) * 180 / Math.PI);
        setNumber("relight-elevation", Math.atan2(direction2[2], Math.hypot(direction2[0], direction2[1])) * 180 / Math.PI);
        field2("relight-key-color").value = cssColor2(key?.color ?? "#ffffff");
        field2("relight-fill-color").value = cssColor2(fill?.color ?? "#ffffff");
        for (const [name2, value] of Object.entries({
          intensity: key?.intensity ?? 0,
          fill: fill?.intensity ?? 0,
          ambient: options.ambient,
          roughness: options.roughness,
          ao: options.ambientOcclusion,
          shadow: key?.castShadow ?? 0,
          strength: options.strength,
          bands: options.diffuseBands
        })) setNumber(`relight-${name2}`, value);
        field2("relight-wrap").checked = options.wrap;
        field2("relight-palette").checked = !!options.palette;
        if (options.palette) setPalette([...options.palette]);
        el3("apply-relight").closest("details").open = true;
        el3("apply-relight").scrollIntoView({ block: "nearest" });
      }
      syncLabels();
    } finally {
      loading = false;
    }
  }
  function applyEditing() {
    if (!editing) return false;
    if (!editing.changed.size) {
      cancelEdit();
      return true;
    }
    const next = candidate();
    renderPixelArtDocument2D(next);
    cancelEdit(false);
    host.commit(next);
    return true;
  }
  function apply(kind) {
    finishStroke();
    if (editing?.layer.kind === kind) {
      applyEditing();
      return;
    }
    cancelEdit();
    const doc = host.outputDocument(), id = nextPixelArtLayerId2D(doc, kind);
    const masks = { ...field2("paint-in-selection").checked ? { selection: Array.from(host.selection()) } : {}, protectedMask: Array.from(host.protection()) };
    const layer = kind === "palette" ? {
      kind,
      id,
      name: `\uD314\uB808\uD2B8 \xB7 ${palette2().length}\uC0C9`,
      palette: [...palette2()],
      dither: choice2("palette-dither").value,
      strength: Number(strength.value),
      ...masks
    } : { kind, id, name: "\uC6D0\uD654 \uC0C9 \uC720\uC9C0 \xB7 \uC7AC\uC870\uBA85", lighting: createPixelRelighter2D(readNewLight()).options, ...masks };
    if (kind === "relight" && !renderPixelArtDocument2D(doc).channels) throw new Error("\uB192\uC774 \uC870\uAC01\uC774\uB098 \uC7AC\uC9C8\uB85C \uD45C\uBA74\uC744 \uB9CC\uB4E0 \uB4A4 \uC7AC\uC870\uBA85\uC744 \uC0AC\uC6A9\uD558\uC138\uC694.");
    host.commit({ ...doc, layers: [...doc.layers, layer], activeLayerId: id });
  }
  button3("apply-palette").onclick = () => attempt2(() => apply("palette"));
  button3("apply-relight").onclick = () => attempt2(() => apply("relight"));
  function syncLabels() {
    note.hidden = !editing;
    if (editing && !editing.changed.size) note.textContent = `${editing.layer.name} \uC124\uC815 \xB7 \uAC12\uC744 \uBC14\uAFBC \uB4A4 \uC801\uC6A9\uD558\uAC70\uB098 \uCDE8\uC18C\uD558\uC138\uC694.`;
    for (const kind of ["palette", "relight"]) {
      const active2 = editing?.layer.kind === kind;
      button3(`apply-${kind}`).textContent = active2 ? kind === "palette" ? "\uD314\uB808\uD2B8 \uC218\uC815 \uC801\uC6A9" : "\uC870\uBA85 \uC218\uC815 \uC801\uC6A9" : kind === "palette" ? "\uD314\uB808\uD2B8 \uC870\uC815 \uB808\uC774\uC5B4 \uCD94\uAC00" : "\uC7AC\uC870\uBA85 \uB808\uC774\uC5B4 \uCD94\uAC00";
      cancelButtons[kind === "palette" ? 0 : 1].hidden = !active2;
    }
  }
  return {
    edit,
    cancel: cancelEdit,
    finish: () => {
      if (editing?.changed.size) applyEditing();
    },
    paletteChanged: () => mark("palette-colors"),
    sync() {
      if (editing && editing.base !== host.document()) cancelEdit();
      const hasRoom = host.outputDocument().layers.length < pixelArtLayerLimit2D(host.document().width, host.document().height);
      button3("apply-palette").disabled = !hasRoom && editing?.layer.kind !== "palette";
      button3("apply-relight").disabled = !hasRoom && editing?.layer.kind !== "relight" || !host.output().channels;
      syncLabels();
    }
  };
}

// gallery/pixel-art-workbench.ts
var el4 = (id) => document.getElementById(id);
var field3 = (id) => el4(id);
var choice3 = (id) => el4(id);
var btn = (id) => el4(id);
var integer = (id, low, high) => {
  const value = Number(field3(id).value);
  if (!Number.isInteger(value) || value < low || value > high) throw new RangeError(`${low}~${high} \uBC94\uC704\uC758 \uC815\uC218\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.`);
  return value;
};
var cssColor3 = (c) => "#" + [c & 255, c >>> 8 & 255, c >>> 16 & 255].map((v) => v.toString(16).padStart(2, "0")).join("");
function installPixelArtWorkbench(host) {
  const result = el4("result");
  const attempt2 = (fn) => {
    try {
      fn();
    } catch (error) {
      host.status(error instanceof Error ? error.message : String(error), true);
    }
  };
  let rowsKey = "", authoredPalette, strokeFrame, stroke;
  let craft;
  let adjustments;
  const point2 = (event) => {
    const r = result.getBoundingClientRect();
    return {
      x: Math.floor((event.clientX - r.left) * result.width / r.width),
      y: Math.floor((event.clientY - r.top) * result.height / r.height),
      ...event.pointerType === "pen" && field3("pen-pressure").checked ? { pressure: event.pressure } : {}
    };
  };
  function brushOptions() {
    return {
      size: integer("paint-size", 1, 64),
      tip: choice3("paint-tip").value,
      pixelPerfect: field3("pixel-perfect").checked,
      symmetry: choice3("paint-symmetry").value
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
      selection: field3("paint-in-selection").checked ? host.selection() : void 0
    }) : paintPixelMask2D(source, mask2, erase ? null : hex(field3("paint-color").value), {
      mode: "replace",
      protectedMask: host.protection(),
      selection: field3("paint-in-selection").checked ? host.selection() : void 0,
      alphaLock: field3("alpha-lock").checked
    });
    const touched = Uint8Array.from(mask2, (v, i) => v && (baseline.pixels[i] !== output.pixels[i] || baseline.mask.data[i] !== output.mask.data[i]) ? 1 : 0);
    if (erase && merged && !field3("alpha-lock").checked) for (let i = 0; i < touched.length; i++) {
      if (mask2[i] && !host.protection()[i] && (!field3("paint-in-selection").checked || host.selection()[i]) && merged.mask.data[i] && merged.pixels[i] >>> 24) touched[i] = 1;
    }
    return { output, touched };
  }
  function previewStroke() {
    if (!stroke) return;
    const { document: doc, points, tool, source, merged, layerId } = stroke, options = brushOptions();
    const mask2 = ["line", "rectangle", "ellipse"].includes(tool) ? rasterizePixelShape2D(doc.width, doc.height, tool, [points[0].x, points[0].y], [points.at(-1).x, points.at(-1).y], { ...options, filled: field3("paint-filled").checked }) : rasterizePixelBrush2D(doc.width, doc.height, points, options);
    const { output, touched } = painted(source, mask2, tool === "eraser", merged, tool === "shade-light" ? 1 : tool === "shade-dark" ? -1 : 0);
    const next = writePixelArtPaintLayer2D(doc, output, touched, layerId);
    stroke.candidate = next;
    host.preview(!layerId ? output : renderPixelArtDocument2D(next));
  }
  result.addEventListener("pointerdown", (event) => attempt2(() => {
    const tool = choice3("paint-tool").value;
    if (event.button !== 0 || tool === "inspect" || selectionDrawingTools.has(tool) || craftDrawingTools.has(tool)) return;
    adjustments?.finish();
    event.preventDefault();
    const p = point2(event), source = host.output(), doc = host.outputDocument();
    if (p.x < 0 || p.y < 0 || p.x >= source.w || p.y >= source.h) return;
    if (tool === "picker") {
      const i = p.y * source.w + p.x;
      if (source.mask.data[i] && source.pixels[i] >>> 24) field3("paint-color").value = cssColor3(source.pixels[i]);
      return;
    }
    const layerId = activePaint(doc);
    if (!layerId && doc.layers.length >= pixelArtLayerLimit2D(doc.width, doc.height)) throw new RangeError("\uB808\uC774\uC5B4 \uD55C\uB3C4\uC785\uB2C8\uB2E4. \uADF8\uB9BC \uB808\uC774\uC5B4\uB97C \uC120\uD0DD\uD558\uAC70\uB098 \uD604\uC7AC \uBAA8\uC2B5\uC744 \uAD6C\uC6B4 \uB4A4 \uADF8\uB824 \uC8FC\uC138\uC694.");
    if (tool === "fill") {
      const mask2 = selectPixelRegion2D(source, p, {
        tolerance: integer("tolerance", 0, 100),
        includeTransparent: true,
        selection: field3("paint-in-selection").checked ? host.selection() : void 0
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
    el4("cursor-cell").textContent = p.x >= 0 && p.y >= 0 && p.x < result.width && p.y < result.height ? `x ${p.x} \xB7 y ${p.y}` : "";
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
    if (!stroke) el4("cursor-cell").textContent = "";
  });
  choice3("paint-tool").onchange = () => attempt2(() => {
    if (stroke) cancelStroke();
    adjustments?.finish();
    syncCursor();
  });
  function syncCursor() {
    const tool = choice3("paint-tool").value;
    result.style.cursor = tool === "inspect" ? "default" : "crosshair";
    el4("paint-hint").textContent = tool === "inspect" ? "\uC624\uB978\uCABD \uCE94\uBC84\uC2A4\uC5D0 \uADF8\uB9BD\uB2C8\uB2E4. \uC67C\uCABD\uC5D0\uC11C\uB294 \uC120\uD0DD\uACFC \uBCF4\uD638 \uC601\uC5ED\uC744 \uD3B8\uC9D1\uD569\uB2C8\uB2E4." : tool === "move" ? "\uC120\uD0DD \uC601\uC5ED\uC744 \uB4DC\uB798\uADF8\uD558\uAC70\uB098 \uBC29\uD5A5\uD0A4\uB85C \uC62E\uAE30\uC138\uC694. Shift + \uBC29\uD5A5\uD0A4: 10px. Escape: \uCDE8\uC18C." : selectionDrawingTools.has(tool) ? "\uC601\uC5ED\uC744 \uB4DC\uB798\uADF8\uD558\uC138\uC694. Shift: \uCD94\uAC00 \xB7 Alt: \uBE7C\uAE30 \xB7 Shift + Alt: \uAD50\uCC28." : tool.startsWith("shade-") ? "\uC791\uC5C5 \uD314\uB808\uD2B8\uC5D0 \uC788\uB294 \uC0C9\uC744 \uD55C \uB2E8\uACC4 \uBC14\uAFC9\uB2C8\uB2E4. \uD314\uB808\uD2B8 \uBC16 \uC0C9\xB7\uC54C\uD30C\xB7\uBCF4\uD638 \uC601\uC5ED\uC740 \uC720\uC9C0\uB429\uB2C8\uB2E4." : tool.startsWith("height-") ? "\uC6D0\uD654 \uC0C9\uC744 \uC720\uC9C0\uD558\uBA70 \uB192\uC774\uB97C \uC870\uAC01\uD569\uB2C8\uB2E4. \uB192\uC774\xB7\uBC95\uC120 \uBCF4\uAE30\uC5D0\uC11C \uD615\uD0DC\uB97C \uD655\uC778\uD558\uC138\uC694." : tool === "path" ? "\uD074\uB9AD\uC73C\uB85C \uC810\uC744 \uB193\uACE0 \uB4DC\uB798\uADF8\uB85C \uACE1\uB960\uC744 \uC870\uC808\uD569\uB2C8\uB2E4. \uC81C\uC5B4\uC810\uC740 \uC800\uC7A5\uD55C \uB4A4\uC5D0\uB3C4 \uC218\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." : tool === "picker" ? "\uC624\uB978\uCABD \uADF8\uB9BC\uC5D0\uC11C \uC0C9\uC744 \uACE0\uB978 \uB4A4 B\uB97C \uB204\uB974\uBA74 \uC5F0\uD544\uB85C \uB3CC\uC544\uAC11\uB2C8\uB2E4." : "\uC624\uB978\uCABD \uCE94\uBC84\uC2A4\uC5D0 \uADF8\uB9AC\uC138\uC694. \uD55C \uBC88\uC758 \uB4DC\uB798\uADF8\uAC00 \uD55C \uBC88\uC758 \uC2E4\uD589 \uCDE8\uC18C\uC5D0 \uB300\uC751\uD569\uB2C8\uB2E4. \uBCF4\uD638 \uC601\uC5ED\uC740 \uC720\uC9C0\uB429\uB2C8\uB2E4.";
  }
  function mutateLayer(id, fn) {
    craft?.cancel();
    adjustments?.cancel();
    const doc = host.document(), layers = structuredClone(doc.layers), index = layers.findIndex((layer) => layer.id === id);
    if (index < 0) return;
    fn(layers, index);
    const { activeLayerId, ...base } = doc;
    host.commit({ ...base, layers, ...activeLayerId && layers.some((layer) => layer.id === activeLayerId) ? { activeLayerId } : {} });
  }
  const actionButton = (label, title, action, disabled = false) => {
    const button7 = document.createElement("button");
    button7.type = "button";
    button7.textContent = label;
    button7.title = title;
    button7.setAttribute("aria-label", title);
    button7.disabled = disabled;
    button7.onclick = () => attempt2(action);
    return button7;
  };
  function syncLayers() {
    const doc = host.document(), key = JSON.stringify([doc.activeLayerId, doc.layers.map(({ id, name: name2, kind, visible, locked }) => ({ id, name: name2, kind, visible, locked }))]);
    const hasRoom = host.outputDocument().layers.length < pixelArtLayerLimit2D(doc.width, doc.height);
    btn("new-paint-layer").disabled = !hasRoom;
    btn("apply-palette").disabled = !hasRoom;
    btn("flatten-layers").disabled = !doc.layers.length;
    const selected = doc.layers.find((layer) => layer.id === doc.activeLayerId);
    el4("active-layer").textContent = selected ? `${selected.kind === "paint" ? "\uADF8\uB9AC\uB294 \uACF3" : "\uC120\uD0DD\uD55C \uB808\uC774\uC5B4"}: ${selected.name}${selected.locked ? " \xB7 \uC7A0\uAE40" : ""}` : "\uADF8\uB9AC\uBA74 \uB9E8 \uC704\uC5D0 \uADF8\uB9BC \uB808\uC774\uC5B4\uAC00 \uC0DD\uAE41\uB2C8\uB2E4.";
    if (key === rowsKey) return;
    rowsKey = key;
    el4("layer-list").replaceChildren(...doc.layers.map((layer, index) => {
      const li = document.createElement("li");
      li.dataset.layerId = layer.id;
      li.classList.toggle("active", doc.activeLayerId === layer.id);
      li.classList.toggle("hidden-layer", layer.visible === false);
      li.append(actionButton(layer.visible === false ? "\u25CB" : "\u25CF", `${layer.name} \uD45C\uC2DC \uC804\uD658`, () => mutateLayer(layer.id, (layers, i) => {
        layers[i].visible = layers[i].visible === false;
      })));
      const kind = document.createElement("span");
      kind.className = "layer-kind";
      kind.textContent = { material: "\uC7AC\uC9C8", paint: "\uADF8\uB9BC", palette: "\uC0C9\uC0C1", transform: "\uBCC0\uD615", relight: "\uC870\uBA85", height: "\uB192\uC774", path: "\uACE1\uC120" }[layer.kind];
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
      if (layer.kind === "material") li.append(actionButton("\uC124\uC815", `${layer.name} \uC7AC\uC9C8 \uC218\uC815`, () => {
        craft?.cancel();
        adjustments?.cancel();
        host.editMaterial(layer.id);
      }, !!layer.locked));
      if (layer.kind === "height" || layer.kind === "path") li.append(actionButton("\uC124\uC815", `${layer.name} ${layer.kind === "height" ? "\uB192\uC774" : "\uACE1\uC120"} \uC218\uC815`, () => {
        adjustments?.cancel();
        host.discardPreview();
        craft?.editLayer(layer.id);
      }, !!layer.locked || layer.visible === false));
      if (layer.kind === "palette" || layer.kind === "relight") li.append(actionButton("\uC124\uC815", `${layer.name} ${layer.kind === "palette" ? "\uD314\uB808\uD2B8" : "\uC870\uBA85"} \uC218\uC815`, () => {
        craft?.cancel();
        adjustments?.edit(layer.id);
      }, !!layer.locked || layer.visible === false));
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
    choice3("paint-tool").value = "pencil";
    syncCursor();
  });
  btn("flatten-layers").onclick = () => attempt2(() => host.commit(flattenPixelArtDocument2D(host.outputDocument())));
  btn("new-canvas").onclick = () => attempt2(() => {
    const width = integer("new-width", 1, 512), height = integer("new-height", 1, 512);
    host.newCanvas(createBlankPixelArtDocument2D(width, height, `Artwork-${width}x${height}`));
    field3("paint-in-selection").checked = false;
    field3("alpha-lock").checked = false;
    choice3("paint-tool").value = "pencil";
    syncCursor();
  });
  btn("invert-selection").onclick = () => host.setSelection(Uint8Array.from(host.selection(), (v) => v ? 0 : 1));
  for (const [id, radius] of [["grow-selection", 1], ["shrink-selection", -1]]) btn(id).onclick = () => attempt2(() => {
    const doc = host.document();
    host.setSelection(resizePixelSelection2D(doc.width, doc.height, host.selection(), radius));
  });
  function showAuthoredPalette(colors) {
    authoredPalette = colors ? colors.map((color) => color >>> 0) : void 0;
    el4("workbench-palette").replaceChildren(...(authoredPalette ?? []).map((color, i) => {
      const swatch = document.createElement("input");
      swatch.type = "color";
      swatch.value = cssColor3(color);
      swatch.setAttribute("aria-label", `\uC791\uC5C5 \uD314\uB808\uD2B8 ${i + 1}`);
      swatch.oninput = () => {
        authoredPalette[i] = hex(swatch.value) >>> 0;
        host.workingPaletteChanged();
      };
      swatch.ondblclick = () => {
        field3("paint-color").value = swatch.value;
      };
      return swatch;
    }));
  }
  function setAuthoredPalette(colors) {
    showAuthoredPalette(colors);
    host.workingPaletteChanged();
    adjustments?.paletteChanged();
  }
  btn("extract-palette").onclick = () => attempt2(() => {
    const colors = extractPixelPalette2D(host.output(), {
      colors: integer("palette-count", 2, 64),
      locked: field3("lock-paint-color").checked ? [field3("paint-color").value] : [],
      ...field3("paint-in-selection").checked ? { selection: host.selection() } : {}
    });
    if (!colors.length) throw new Error("\uC0C9\uC744 \uCD94\uCD9C\uD560 \uBD88\uD22C\uBA85\uD55C \uD53D\uC140\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uBA3C\uC800 \uADF8\uB9AC\uAC70\uB098 PNG\uB97C \uAC00\uC838\uC624\uC138\uC694.");
    setAuthoredPalette(sortPixelColorsByLightness2D(colors));
    el4("palette-note").textContent = `\uD604\uC7AC \uADF8\uB9BC\uC5D0\uC11C ${colors.length}\uC0C9\uC744 \uCD94\uCD9C\uD574 \uC5B4\uB450\uC6B4 \uC0C9\uBD80\uD130 \uC815\uB82C\uD588\uC2B5\uB2C8\uB2E4. \uACE0\uC815\uD55C \uC0C9\uC758 \uAC12\uC740 \uADF8\uB300\uB85C \uC720\uC9C0\uD569\uB2C8\uB2E4.`;
  });
  btn("generate-ramp").onclick = () => attempt2(() => {
    const colors = createPixelPaletteRamp2D({ shadow: field3("ramp-shadow").value, midtone: field3("ramp-midtone").value, highlight: field3("ramp-highlight").value, colors: integer("palette-count", 2, 64) });
    setAuthoredPalette(colors);
    el4("palette-note").textContent = `${colors.length}\uC0C9 \uBA85\uC554 \uD314\uB808\uD2B8 \xB7 \uADF8\uB9BC\uC790\uC640 \uBC1D\uC740 \uBA74 \uC0AC\uC774\uC5D0\uC11C \uC0C9\uC0C1\uACFC \uCC44\uB3C4\uB97C \uD568\uAED8 \uC870\uC808\uD588\uC2B5\uB2C8\uB2E4.`;
  });
  btn("use-material-palette").onclick = () => attempt2(() => host.setPalette(authoredPalette ?? host.palette()));
  const relightRanges = ["angle", "elevation", "intensity", "fill", "ambient", "roughness", "ao", "shadow", "strength"];
  function showRelightValues() {
    for (const name2 of relightRanges) {
      const value = Number(field3(`relight-${name2}`).value);
      el4(`relight-${name2}-value`).textContent = `${Math.round(value * 1e3) / 1e3}${name2 === "angle" || name2 === "elevation" ? "\xB0" : ""}`;
    }
  }
  for (const name2 of relightRanges) field3(`relight-${name2}`).addEventListener("input", showRelightValues);
  showRelightValues();
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
    const c = el4(id), wrapper = document.createElement("div"), grid = document.createElement("div");
    wrapper.className = "canvas-wrap";
    grid.className = "pixel-grid";
    grid.setAttribute("aria-hidden", "true");
    c.parentNode.insertBefore(wrapper, c);
    wrapper.append(c, grid);
    return { c, grid };
  });
  const tileHost = document.createElement("section"), tileLabel = document.createElement("div"), tileCanvas = document.createElement("canvas");
  let tileSprite;
  tileHost.className = "tile-proof";
  tileLabel.className = "tile-proof-label";
  tileLabel.textContent = "\uBC18\uBCF5 \uACBD\uACC4 \uD655\uC778 \xB7 3 \xD7 3 \xB7 \uC6D0\uBCF8\uC744 \uBC14\uAFB8\uC9C0 \uC54A\uB294 \uD0C0\uC77C \uBBF8\uB9AC\uBCF4\uAE30";
  tileHost.append(tileLabel, tileCanvas);
  el4("result-host").closest(".comparison").after(tileHost);
  field3("show-grid").onchange = () => syncOverlays();
  field3("tile-preview").onchange = () => syncOverlays();
  function syncOverlays() {
    for (const { c, grid } of grids) {
      const rect = c.getBoundingClientRect(), step = rect.width / c.width;
      grid.style.backgroundSize = `${step}px ${rect.height / c.height}px`;
      grid.classList.toggle("visible", field3("show-grid").checked && step >= 4);
    }
    tileHost.classList.toggle("visible", field3("tile-preview").checked);
    if (field3("tile-preview").checked && host.output() && tileSprite !== host.output()) {
      const sprite = host.output(), source = spriteCanvas(sprite);
      tileSprite = sprite;
      tileCanvas.width = sprite.w * 3;
      tileCanvas.height = sprite.h * 3;
      const ctx = tileCanvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) ctx.drawImage(source, x * sprite.w, y * sprite.h);
    }
  }
  new ResizeObserver(syncOverlays).observe(el4("result-host"));
  function surfaceMaps() {
    const doc = host.outputDocument(), lastMaterial = doc.layers.filter((layer) => layer.kind === "material" && layer.visible !== false).at(-1);
    const lastSurface = doc.layers.filter((layer) => layer.visible !== false && (layer.kind === "height" || layer.kind === "material")).at(-1);
    const tileSize = lastMaterial?.material.tileSize;
    return exportPixelSurfaceMaps2D(renderPixelArtDocument2D(doc), {
      normalConvention: choice3("normal-convention").value,
      lighting: {
        light: lastMaterial?.material.light ?? [-0.6, -0.7, 1],
        ambientOcclusion: 1,
        castShadow: 1,
        wrap: lastSurface?.kind === "height" ? lastSurface.wrap : !!tileSize && tileSize[0] === doc.width && tileSize[1] === doc.height && (lastMaterial?.material.bevel ?? 0) === 0,
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
    btn(id).addEventListener("click", (event) => {
      try {
        finishStroke();
        if (id === "undo" || id === "redo") {
          craft?.cancel();
          adjustments?.cancel();
        } else {
          craft?.finish();
          if (id !== "apply-palette" && id !== "apply-relight") adjustments?.finish();
        }
      } catch (error) {
        event.preventDefault();
        event.stopImmediatePropagation();
        host.status(error instanceof Error ? error.message : String(error), true);
      }
    }, { capture: true });
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
      adjustments?.cancel();
      if (stroke) cancelStroke();
      else if (!craftDrawingTools.has(choice3("paint-tool").value)) {
        choice3("paint-tool").value = "inspect";
        syncCursor();
      }
      return;
    }
    const shortcuts = { b: "pencil", e: "eraser", l: "line", r: "rectangle", o: "ellipse", g: "fill", i: "picker" };
    const tool = shortcuts[event.key.toLowerCase()];
    if (tool) {
      event.preventDefault();
      choice3("paint-tool").value = tool;
      syncCursor();
    }
  });
  const selections = installPixelArtSelection(host, finishStroke);
  craft = installPixelArtCraft(host);
  adjustments = installPixelArtAdjustments(host, () => authoredPalette ?? host.palette(), setAuthoredPalette, () => {
    finishStroke();
    craft?.finish();
  });
  return {
    finishStroke() {
      finishStroke();
      selections.finish();
      craft?.finish();
      adjustments?.finish();
    },
    setAuthoredPalette,
    restoreAuthoredPalette: showAuthoredPalette,
    storedPalette: () => authoredPalette,
    palette: () => authoredPalette ?? host.palette(),
    sync() {
      syncLayers();
      syncOverlays();
      syncCursor();
      selections.sync();
      const mapsAvailable = !!host.output()?.channels;
      btn("apply-relight").disabled = !mapsAvailable || host.outputDocument().layers.length >= pixelArtLayerLimit2D(host.document().width, host.document().height);
      choice3("normal-convention").disabled = !mapsAvailable;
      for (const id of ["save-normal", "save-height", "save-occlusion", "save-shadow", "save-map-info"]) btn(id).disabled = !mapsAvailable;
      craft?.sync();
      adjustments?.sync();
    }
  };
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
  const durationMs = options.durationMs ?? 100, loop = options.loop ?? true, direction2 = options.direction ?? "forward";
  if (!validDuration(durationMs) || typeof loop !== "boolean" || !directions.includes(direction2)) throw new RangeError("Animation needs positive finite durations, a boolean loop flag and a supported direction");
  return { durationMs, loop, direction: direction2 };
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
    if (layer.kind === "path" && Array.isArray(layer.nodes)) for (const node2 of layer.nodes) {
      if (object(node2)) stored += arrayLength(node2.point) + arrayLength(node2.in) + arrayLength(node2.out);
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
function validatePixelArtAnimation2D(input3) {
  if (!object(input3)) throw new TypeError("Expected a pixel art animation");
  const schema = input3.schema;
  if (schema === "poku-pixel-art/v1" || schema === "poku-pixel-art/v2") return createPixelArtAnimation2D(validatePixelArtDocument2D(input3));
  const p = input3;
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
  const id = nextPixelArtAnimationFrameId2D(animation), cel = document2 ?? {
    ...createBlankPixelArtDocument2D(animation.width, animation.height, name2),
    ...active2.document.workingPalette ? { workingPalette: active2.document.workingPalette.slice() } : {}
  };
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
var el5 = (id) => document.getElementById(id);
var field4 = (id) => el5(id);
var select2 = (id) => el5(id);
var button4 = (id) => el5(id);
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
  const result = el5("result");
  const onion = document.createElement("canvas");
  onion.className = "onion-overlay";
  onion.setAttribute("aria-hidden", "true");
  result.parentElement.insertBefore(onion, result);
  const player = el5("animation-preview");
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
    button4("play-animation").textContent = "\uC7AC\uC0DD";
    button4("play-animation").setAttribute("aria-pressed", "false");
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
    button4("play-animation").textContent = "\uC815\uC9C0";
    button4("play-animation").setAttribute("aria-pressed", "true");
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
        el5("animation-playhead").textContent = `${index + 1} / ${state.frames.length} \xB7 ${Math.floor(time)} ms`;
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
  button4("play-animation").onclick = () => attempt2(() => playing ? stop() : play());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  button4("add-frame").onclick = () => attempt2(() => {
    capture();
    commit(addPixelArtAnimationFrame2D(ensure()));
  });
  button4("duplicate-frame").onclick = () => attempt2(() => {
    capture();
    commit(duplicatePixelArtAnimationFrame2D(ensure()));
  });
  button4("remove-frame").onclick = () => attempt2(() => {
    capture();
    commit(removePixelArtAnimationFrame2D(ensure()), true);
  });
  for (const [id, delta] of [["frame-left", -1], ["frame-right", 1]]) button4(id).onclick = () => attempt2(() => {
    capture();
    const animation = ensure(), index = animation.frames.findIndex((frame) => frame.id === animation.activeFrameId);
    if (index + delta >= 0 && index + delta < animation.frames.length) commit(movePixelArtAnimationFrame2D(animation, animation.activeFrameId, index + delta));
  });
  field4("frame-duration").onchange = () => attempt2(() => {
    const durationMs = Number(field4("frame-duration").value);
    capture();
    const animation = ensure();
    commit(updatePixelArtAnimationFrame2D(animation, animation.activeFrameId, { durationMs }));
  });
  field4("frame-name").onchange = () => attempt2(() => {
    const name2 = field4("frame-name").value.trim();
    capture();
    const animation = ensure();
    commit(updatePixelArtAnimationFrame2D(animation, animation.activeFrameId, { name: name2 }));
  });
  for (const id of ["animation-loop", "animation-direction"]) el5(id).addEventListener("change", () => attempt2(() => {
    const loop = field4("animation-loop").checked, direction2 = select2("animation-direction").value;
    capture();
    commit({ ...ensure(), loop, direction: direction2 });
  }));
  for (const id of ["onion-skin", "onion-opacity"]) el5(id).addEventListener("input", () => {
    onionVersion = "";
    sync();
  });
  button4("extract-animation-palette").onclick = () => attempt2(() => {
    capture();
    const animation = ensure(), count = Number(field4("palette-count").value);
    const palette2 = extractPixelAnimationPalette2D(animation.frames.map((frame, i) => ({ sprite: frameRaster(i), duration: frame.durationMs })), { colors: count, weighting: "equal-frame" });
    if (!palette2.length) throw new Error("\uC0C9\uC744 \uCD94\uCD9C\uD560 \uD504\uB808\uC784\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
    host.setPalette(sortPixelColorsByLightness2D(palette2));
    el5("palette-note").textContent = `${animation.frames.length}\uAC1C \uD504\uB808\uC784\uC5D0\uC11C \uACF5\uD1B5 ${palette2.length}\uC0C9\uC744 \uCD94\uCD9C\uD574 \uBA85\uB3C4\uC21C\uC73C\uB85C \uC815\uB82C\uD588\uC2B5\uB2C8\uB2E4.`;
  });
  button4("apply-animation-palette").onclick = () => attempt2(() => {
    capture();
    const animation = ensure(), palette2 = [...host.palette()];
    const frames = animation.frames.map((frame) => {
      const doc = frame.document, id = nextPixelArtLayerId2D(doc, "palette");
      const document2 = { ...doc, workingPalette: [...palette2], activeLayerId: id, layers: [...doc.layers, {
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
  button4("save-animation-sheet").onclick = () => attempt2(() => {
    const requestedColumns = Number(field4("sheet-columns").value), padding = Number(field4("sheet-padding").value);
    capture();
    const animation = ensure(), columns = Math.min(animation.frames.length, requestedColumns);
    const sheet = exportPixelArtAnimationSheet2D(animation, { columns, padding }), filename2 = host.filename();
    const manifest = { ...sheet.manifest, image: filename2 + "-sheet.png" };
    void encodeRGBAPNG(sheet.sprite.w, sheet.sprite.h, sheet.rgba).then((blob) => {
      host.download(blob, filename2 + "-sheet.png");
      host.download(new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }), filename2 + "-sheet.json");
    }).catch((error) => host.status(String(error), true));
  });
  button4("save-animation-clip").onclick = () => attempt2(() => {
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
    el5("timeline-state").textContent = state ? `${state.frames.length} FRAMES` : "STILL IMAGE";
    if (syncedVersion !== version) {
      syncedVersion = version;
      const rows = new Map(Array.from(el5("frame-list").querySelectorAll("button")).map((row) => [row.dataset.frameId, row]));
      el5("frame-list").replaceChildren(...(state?.frames ?? []).map((frame2, i) => {
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
      field4("frame-duration").value = String(frame?.durationMs ?? 100);
      field4("frame-name").value = frame?.name ?? "Frame 1";
      field4("animation-loop").checked = state?.loop ?? true;
      select2("animation-direction").value = state?.direction ?? "forward";
      const index = state?.frames.findIndex((frame2) => frame2.id === state.activeFrameId) ?? 0;
      button4("remove-frame").disabled = !state || state.frames.length <= 1;
      button4("frame-left").disabled = !state || index === 0;
      button4("frame-right").disabled = !state || index === state.frames.length - 1;
      if (state && !playing) {
        draw(player, frameRaster(index));
        el5("animation-playhead").textContent = `${index + 1} / ${state.frames.length}`;
      }
    }
    const key = `${version}:${field4("onion-skin").checked}:${field4("onion-opacity").value}`;
    if (key !== onionVersion) {
      onionVersion = key;
      onion.hidden = !state || !field4("onion-skin").checked;
      if (state && !onion.hidden) {
        const index = state.frames.findIndex((frame) => frame.id === state.activeFrameId);
        const neighbors = [], previous = Math.max(0, index - 1), next = Math.min(state.frames.length - 1, index + 1);
        for (let i = previous; i <= next; i++) neighbors.push(frameRaster(i));
        draw(onion, createPixelArtOnionSkin2D(neighbors, index - previous, { previous: 1, next: 1, opacity: Number(field4("onion-opacity").value) }));
      }
    }
    onion.style.width = result.style.width;
    onion.style.height = result.style.height;
    if (state) {
      button4("undo").disabled = !history2.canUndo;
      button4("redo").disabled = !history2.canRedo;
    }
  }
  return {
    get enabled() {
      return !!state;
    },
    sync,
    stop,
    /** One transaction for every cel; a failed mapping never commits a partial sequence. */
    editDocuments(edit) {
      if (!state) return void 0;
      host.finishStroke();
      const current = replacePixelArtAnimationFrame2D(state, host.outputDocument());
      let changed2 = 0;
      const frames = current.frames.map((frame) => {
        const document2 = edit(frame.document);
        if (document2 !== frame.document) changed2++;
        return document2 === frame.document ? frame : { ...frame, document: document2 };
      });
      if (changed2) commit({ ...current, frames }, true);
      return changed2;
    },
    /** Sheet import is undoable, including when the preceding artwork was a still image. */
    importAnimation(animation) {
      const next = validatePixelArtAnimation2D(animation);
      if (next.width > 4096 || next.height > 4096) throw new RangeError("\uAC00\uC838\uC62C \uD504\uB808\uC784\uC740 \uAC00\uB85C\xB7\uC138\uB85C 4096\uD53D\uC140 \uC774\uD558\uB85C \uC9C0\uC815\uD574 \uC8FC\uC138\uC694.");
      renderPixelArtDocument2D(active(next).document);
      serializePixelArtAnimation2D(next);
      capture();
      ensure();
      commit(next, true);
    },
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
      el5("animation-playhead").textContent = "\uD504\uB808\uC784\uC744 \uCD94\uAC00\uD558\uAC70\uB098 \uBCF5\uC81C\uD558\uC138\uC694";
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
  function changeZoom(direction2, host, at) {
    const canvas2 = host?.querySelector("canvas#source,canvas#result") ?? document.getElementById("result");
    const rect = canvas2.getBoundingClientRect(), current = zoom.value === "auto" ? rect.width / canvas2.width : Number(zoom.value);
    const next = direction2 > 0 ? levels.find((n) => n > current) ?? levels.at(-1) : [...levels].reverse().find((n) => n < current) ?? 1;
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

// src/authoring/pixel-art-sheet.ts
var object2 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var validName3 = (value) => typeof value === "string" && value.length > 0 && value.length <= 160;
var integer2 = (value, minimum, maximum) => typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
var validDuration2 = (value) => typeof value === "number" && Number.isFinite(value) && value / 1e3 > 0;
var direction = (value) => value === "forward" || value === "reverse" || value === "pingpong";
function checkSource(source) {
  if (!source || !integer2(source.w, 1, PIXEL_ART_ANIMATION_LIMITS_2D.sheetDimension) || !integer2(source.h, 1, PIXEL_ART_ANIMATION_LIMITS_2D.sheetDimension) || source.w * source.h > PIXEL_ART_ANIMATION_LIMITS_2D.sheetCells || !(source.pixels instanceof Uint32Array) || source.pixels.length !== source.w * source.h || !source.mask || source.mask.w !== source.w || source.mask.h !== source.h || !(source.mask.data instanceof Uint8Array) || source.mask.data.length !== source.w * source.h)
    throw new RangeError("Sprite sheet needs matching native color and silhouette buffers within its image budget");
  const channels = source.channels, n = source.w * source.h;
  if (channels && (channels.w !== source.w || channels.h !== source.h || !(channels.material instanceof Uint16Array) || channels.material.length !== n || !(channels.height instanceof Float32Array) || channels.height.length !== n || !(channels.normal instanceof Float32Array) || channels.normal.length !== n * 3))
    throw new RangeError("Sprite sheet geometry must match its full native dimensions");
}
function checkCapacity(source, width, height, count) {
  const limit = pixelArtAnimationFrameLimit2D(width, height);
  if (!integer2(count, 1, limit)) throw new RangeError(`Imported animation frame budget exceeded (maximum ${limit} at this size)`);
  const cells2 = width * height * count, stored = cells2 * (source.channels ? 7 : 2);
  if (stored > PIXEL_ART_ANIMATION_LIMITS_2D.storedValues || cells2 > PIXEL_ART_ANIMATION_LIMITS_2D.renderCells)
    throw new RangeError("Imported animation aggregate storage or render budget exceeded");
}
function checkGeometry(source) {
  if (source.channels && (!source.channels.height.every(Number.isFinite) || !source.channels.normal.every(Number.isFinite)))
    throw new RangeError("Sprite sheet height and normals must contain finite native values");
}
function timelineFor(frames, playback) {
  const sequence = Array.from({ length: frames.length }, (_, i) => playback === "reverse" ? frames.length - 1 - i : i);
  if (playback === "pingpong") for (let i = frames.length - 2; i > 0; i--) sequence.push(i);
  const startsMs = [];
  let durationMs = 0;
  for (const index of sequence) {
    const next = durationMs + frames[index].durationMs;
    if (!Number.isFinite(next) || next <= durationMs || next / 1e3 <= durationMs / 1e3)
      throw new RangeError("Imported animation durations must have finite distinguishable boundaries");
    startsMs.push(durationMs);
    durationMs = next;
  }
  return { sequence, startsMs, durationMs };
}
function checkSerializedSize(source, plan) {
  const encoder = new TextEncoder(), cells2 = plan.width * plan.height;
  const encoded = (value) => encoder.encode(JSON.stringify(value)).byteLength;
  let bytes = encoded({
    schema: "poku-pixel-art/v3",
    name: plan.name,
    width: plan.width,
    height: plan.height,
    frames: [],
    activeFrameId: plan.frames[0].id,
    loop: plan.loop,
    direction: plan.direction
  }) + plan.frames.length - 1;
  const lengths = /* @__PURE__ */ new Map();
  const numericLength = (value) => {
    const old = lengths.get(value);
    if (old !== void 0) return old;
    const length = String(value).length;
    if (lengths.size < 4096) lengths.set(value, length);
    return length;
  };
  const check = () => {
    if (bytes > PIXEL_ART_ANIMATION_LIMITS_2D.jsonBytes) throw new RangeError("Imported animation exceeds the 64 MiB saved project budget");
  };
  for (const frame of plan.frames) {
    bytes += encoded({
      id: frame.id,
      name: frame.name,
      durationMs: frame.durationMs,
      document: {
        schema: "poku-pixel-art/v2",
        name: frame.name,
        width: plan.width,
        height: plan.height,
        pixels: [],
        mask: [],
        layers: [],
        ...source.channels ? { channels: { material: [], height: [], normal: [] } } : {}
      }
    });
    bytes += 2 * (cells2 - 1) + cells2;
    if (source.channels) bytes += 2 * (cells2 - 1) + (cells2 * 3 - 1);
    check();
    for (let y = 0; y < plan.height; y++) {
      for (let x = 0; x < plan.width; x++) {
        const i = (frame.y + y) * source.w + frame.x + x;
        bytes += numericLength(source.pixels[i]);
        if (source.channels) {
          const c = source.channels;
          bytes += numericLength(c.material[i]) + numericLength(c.height[i]);
          bytes += numericLength(c.normal[i * 3]) + numericLength(c.normal[i * 3 + 1]) + numericLength(c.normal[i * 3 + 2]);
        }
      }
      check();
    }
  }
}
function materialize(source, plan) {
  const cells2 = plan.width * plan.height;
  const frames = plan.frames.map((frame) => {
    const pixels = new Array(cells2), mask2 = new Array(cells2);
    const channels = source.channels ? { material: new Array(cells2), height: new Array(cells2), normal: new Array(cells2 * 3) } : void 0;
    for (let y = 0; y < plan.height; y++) for (let x = 0; x < plan.width; x++) {
      const from = (frame.y + y) * source.w + frame.x + x, to = y * plan.width + x;
      pixels[to] = source.pixels[from];
      mask2[to] = source.mask.data[from] ? 1 : 0;
      if (channels) {
        const original = source.channels;
        channels.material[to] = original.material[from];
        channels.height[to] = original.height[from];
        channels.normal[to * 3] = original.normal[from * 3];
        channels.normal[to * 3 + 1] = original.normal[from * 3 + 1];
        channels.normal[to * 3 + 2] = original.normal[from * 3 + 2];
      }
    }
    const document2 = {
      schema: "poku-pixel-art/v2",
      name: frame.name,
      width: plan.width,
      height: plan.height,
      pixels,
      mask: mask2,
      layers: [],
      ...channels ? { channels } : {}
    };
    return { id: frame.id, name: frame.name, durationMs: frame.durationMs, document: document2 };
  });
  return {
    schema: "poku-pixel-art/v3",
    name: plan.name,
    width: plan.width,
    height: plan.height,
    frames,
    activeFrameId: frames[0].id,
    loop: plan.loop,
    direction: plan.direction
  };
}
function importPixelArtAnimationSheet2D(source, manifest) {
  checkSource(source);
  if (!object2(manifest) || manifest.schema !== "poku-pixel-art-atlas/v1" || !validName3(manifest.name) || manifest.width !== source.w || manifest.height !== source.h || typeof manifest.loop !== "boolean" || !direction(manifest.direction))
    throw new RangeError("Sprite sheet manifest needs its supported identity, matching image dimensions and playback settings");
  const width = manifest.frameWidth, height = manifest.frameHeight;
  if (!integer2(width, 1, PIXEL_ART_ANIMATION_LIMITS_2D.sheetDimension) || !integer2(height, 1, PIXEL_ART_ANIMATION_LIMITS_2D.sheetDimension) || !Array.isArray(manifest.frames)) throw new RangeError("Sprite sheet manifest needs native frame dimensions and a frame list");
  checkCapacity(source, width, height, manifest.frames.length);
  if (!integer2(manifest.columns, 1, manifest.frames.length) || !integer2(manifest.padding, 0, 32))
    throw new RangeError("Sprite sheet manifest needs valid column and padding metadata");
  const ids = /* @__PURE__ */ new Set();
  const frames = Array.from(manifest.frames, (raw) => {
    if (!object2(raw) || !validName3(raw.id) || ids.has(raw.id) || !validName3(raw.name) || !validDuration2(raw.durationMs) || raw.width !== width || raw.height !== height || !integer2(raw.x, 0, source.w - width) || !integer2(raw.y, 0, source.h - height))
      throw new RangeError("Sprite sheet frames need unique IDs, valid names/timing and equal-size rectangles inside the image");
    ids.add(raw.id);
    return { id: raw.id, name: raw.name, durationMs: raw.durationMs, x: raw.x, y: raw.y, width, height };
  });
  const timing = timelineFor(frames, manifest.direction);
  const matches = (value, expected) => Array.isArray(value) && value.length === expected.length && Array.from(value).every((item, i) => item === expected[i]);
  if (!matches(manifest.sequence, timing.sequence) || !matches(manifest.startsMs, timing.startsMs) || manifest.durationMs !== timing.durationMs)
    throw new RangeError("Sprite sheet manifest timing must match its frame durations and playback direction");
  checkGeometry(source);
  const plan = { name: manifest.name, width, height, frames, loop: manifest.loop, direction: manifest.direction };
  checkSerializedSize(source, plan);
  return materialize(source, plan);
}
function pair(value, label) {
  const resolved = value === void 0 ? [0, 0] : typeof value === "number" ? [value, value] : value;
  if (!Array.isArray(resolved) || resolved.length !== 2 || !Array.from(resolved).every((v) => integer2(v, 0, PIXEL_ART_ANIMATION_LIMITS_2D.sheetDimension)))
    throw new RangeError(`Sprite sheet ${label} needs nonnegative native integers on both axes`);
  return [resolved[0], resolved[1]];
}
function occupied(source, frame) {
  for (let y = frame.y; y < frame.y + frame.height; y++) for (let x = frame.x; x < frame.x + frame.width; x++) {
    const index = y * source.w + x;
    if (source.mask.data[index] && source.pixels[index] >>> 24) return true;
  }
  return false;
}
function slicePixelArtAnimationSheet2D(source, options) {
  checkSource(source);
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new RangeError("Sprite sheet slicing needs explicit grid options");
  const width = options.frameWidth, height = options.frameHeight;
  const limit = pixelArtAnimationFrameLimit2D(width, height);
  const [mx, my] = pair(options.margin, "margin"), [gx, gy] = pair(options.gap, "gap");
  const order = options.order ?? "row-major", start = options.start ?? 0, skipEmpty = options.skipEmpty ?? false;
  const name2 = options.name ?? "Imported sprite sheet", durationMs = options.durationMs ?? 100, loop = options.loop ?? true, playback = options.direction ?? "forward";
  if (order !== "row-major" && order !== "column-major" || typeof skipEmpty !== "boolean" || !validName3(name2) || !validDuration2(durationMs) || typeof loop !== "boolean" || !direction(playback))
    throw new RangeError("Sprite sheet slicing needs valid order, name, duration and playback options");
  const columns = Math.max(0, Math.floor((source.w - mx * 2 + gx) / (width + gx)));
  const rows = Math.max(0, Math.floor((source.h - my * 2 + gy) / (height + gy))), available = columns * rows;
  const count = options.count ?? available - start;
  if (!integer2(start, 0, available - 1) || !integer2(count, 1, available - start))
    throw new RangeError("Sprite sheet start/count must select complete cells inside the grid");
  if (!skipEmpty) checkCapacity(source, width, height, count);
  const frames = [];
  for (let slot = start; slot < start + count; slot++) {
    const column = order === "row-major" ? slot % columns : Math.floor(slot / rows);
    const row = order === "row-major" ? Math.floor(slot / columns) : slot % rows;
    const frame = { id: `frame-${slot + 1}`, name: `Frame ${slot + 1}`, x: mx + column * (width + gx), y: my + row * (height + gy), width, height, durationMs };
    if (skipEmpty && !occupied(source, frame)) continue;
    frames.push(frame);
    if (frames.length > limit) throw new RangeError(`Imported animation frame budget exceeded (maximum ${limit} at this size)`);
  }
  if (!frames.length) throw new RangeError("Sprite sheet slicing found no visible frames; keep empty cells to import transparent holds");
  checkCapacity(source, width, height, frames.length);
  timelineFor(frames, playback);
  checkGeometry(source);
  const plan = { name: name2, width, height, loop, direction: playback, frames };
  checkSerializedSize(source, plan);
  return materialize(source, plan);
}

// gallery/png-import.ts
function decodeLimits(input3) {
  if (!input3 || typeof input3 !== "object" || Array.isArray(input3)) throw new RangeError("PNG decode limits must be an object.");
  const limit = (value, fallback, maximum, label) => {
    const resolved = value === void 0 ? fallback : value;
    if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > maximum)
      throw new RangeError(`PNG ${label} limit must be an integer within 1..${maximum}.`);
    return resolved;
  };
  return {
    maxDimension: limit(input3.maxDimension, 512, 16384, "dimension"),
    maxPixels: limit(input3.maxPixels, 262144, 16777216, "pixel"),
    maxFileBytes: limit(input3.maxFileBytes, 16 * 1024 * 1024, 64 * 1024 * 1024, "file byte"),
    maxInflatedBytes: limit(input3.maxInflatedBytes, 128 * 1024 * 1024, 128 * 1024 * 1024, "inflated byte")
  };
}
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
    return { x, y, dx, dy, w: width, h: height, rowBytes: Math.ceil(width * channels * depth / 8) };
  }).filter((pass) => pass.w > 0 && pass.h > 0);
}
async function decodePixelArtPNG(png, options = {}) {
  const limits = decodeLimits(options);
  if (!(png instanceof Uint8Array) || png.length < 8 || SIGNATURE.some((value, i) => png[i] !== value))
    throw new Error("Invalid PNG signature.");
  if (png.length > limits.maxFileBytes) throw new Error(`PNG exceeds the ${limits.maxFileBytes / (1024 * 1024)} MiB file limit.`);
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
        if (!w || !h || w > limits.maxDimension || h > limits.maxDimension)
          throw new Error(`PNG dimensions must be within 1..${limits.maxDimension} native cells per axis.`);
        if (w * h > limits.maxPixels)
          throw new Error(`PNG dimensions exceed the ${limits.maxPixels} native pixel limit.`);
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
  if (!Number.isSafeInteger(expected) || expected > limits.maxInflatedBytes)
    throw new Error(`PNG filtered samples exceed the ${limits.maxInflatedBytes} inflated byte limit.`);
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
  if (depth === 16)
    return { kind: "unsupported", w, h, reason: "16-bit", warnings };
  const pixels = new Uint32Array(w * h), sampleMask = (1 << depth) - 1;
  const keys = transparency && color !== 3 ? Array.from({ length: color === 0 ? 1 : 3 }, (_, i) => view(transparency).getUint16(i * 2) & sampleMask) : void 0;
  offset = 0;
  for (const pass of passes) {
    for (let y = 0; y < pass.h; y++) {
      const start = offset + y * (pass.rowBytes + 1) + 1;
      for (let x = 0; x < pass.w; x++) {
        const input3 = start + x * channels;
        let r, g, b, a;
        if (color === 3) {
          const bit = x * depth, index = raw[start + (bit >>> 3)] >>> 8 - depth - (bit & 7) & sampleMask;
          r = palette2[index * 3];
          g = palette2[index * 3 + 1];
          b = palette2[index * 3 + 2];
          a = transparency && index < transparency.length ? transparency[index] : 255;
        } else if (color === 0 || color === 4) {
          const bit = x * depth, sample = depth < 8 ? raw[start + (bit >>> 3)] >>> 8 - depth - (bit & 7) & sampleMask : raw[input3];
          r = g = b = Math.round(sample * 255 / sampleMask);
          a = color === 4 ? raw[input3 + 1] : keys && sample === keys[0] ? 0 : 255;
        } else {
          r = raw[input3];
          g = raw[input3 + 1];
          b = raw[input3 + 2];
          a = color === 6 ? raw[input3 + 3] : keys && r === keys[0] && g === keys[1] && b === keys[2] ? 0 : 255;
        }
        pixels[(pass.y + y * pass.dy) * w + pass.x + x * pass.dx] = (r | g << 8 | b << 16 | a << 24) >>> 0;
      }
    }
    offset += (pass.rowBytes + 1) * pass.h;
  }
  return { kind: "decoded", w, h, pixels, warnings };
}

// gallery/pixel-art-production.ts
var el6 = (id) => document.getElementById(id);
var field5 = (id) => el6(id);
var select3 = (id) => el6(id);
var button5 = (id) => el6(id);
function numeric(id) {
  const text = field5(id).value.trim(), value = Number(text);
  if (!text || !Number.isFinite(value)) throw new RangeError("\uC720\uD6A8\uD55C \uC218\uCE58\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
  return value;
}
function installPixelArtProduction(host) {
  const attempt2 = (fn) => {
    try {
      fn();
    } catch (error) {
      host.status(error instanceof Error ? error.message : String(error), true);
    }
  };
  function applyColor(edit, name2) {
    host.finishStroke();
    const operation = (document2) => {
      const source = renderPixelArtDocument2D(document2), result = edit(source, document2);
      const touched = Uint8Array.from(source.pixels, (color, i) => Number(color !== result.pixels[i]));
      if (!touched.some(Boolean)) return document2;
      const next = writePixelArtPaintLayer2D(document2, result, touched);
      return { ...next, layers: next.layers.map((layer) => layer.id === next.activeLayerId ? { ...layer, name: name2 } : layer) };
    };
    let changed2;
    if (field5("color-all-frames").checked) changed2 = host.applyToFrames(operation);
    if (changed2 === void 0) {
      const current = host.outputDocument(), next = operation(current);
      changed2 = Number(next !== current);
      if (changed2) host.commit(next);
    }
    host.status(changed2 ? `${name2} \xB7 ${changed2}\uAC1C \uD504\uB808\uC784\uC5D0 \uC801\uC6A9\uD588\uC2B5\uB2C8\uB2E4. \uC2E4\uD589 \uCDE8\uC18C\uB85C \uD55C \uBC88\uC5D0 \uB418\uB3CC\uB9B4 \uC218 \uC788\uC2B5\uB2C8\uB2E4.` : "\uD604\uC7AC \uC0C9\uACFC \uC120\uD0DD \uBC94\uC704\uC5D0\uC11C \uBC14\uB014 \uD53D\uC140\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
  const region = (document2) => {
    const material = document2.layers.filter((layer) => layer.kind === "material").at(-1);
    const protection = document2.protectedMask ?? material?.protectedMask;
    return {
      ...field5("color-selection-only").checked ? { selection: document2.selection ?? material?.selection ?? Uint8Array.from(document2.pixels, (color, i) => (document2.mask?.[i] ?? 1) && color >>> 24 ? 1 : 0) } : {},
      ...protection ? { protectedMask: protection } : {}
    };
  };
  button5("color-use-picked").onclick = () => {
    field5("color-from").value = field5("paint-color").value;
  };
  button5("replace-exact-color").onclick = () => attempt2(() => {
    const from = field5("color-from").value, to = field5("color-to").value;
    const replacements = [{ from, to }];
    if (field5("color-swap").checked && from !== to) replacements.push({ from: to, to: from });
    const replacer = createPixelColorReplacer2D(replacements);
    applyColor((source, document2) => replacer.replace(source, region(document2)), field5("color-swap").checked ? "\uB450 \uC0C9 \uB9DE\uAD50\uD658" : "\uC815\uD655\uD55C \uC0C9 \uAD50\uCCB4");
  });
  button5("sort-working-palette").onclick = () => attempt2(() => {
    host.setPalette(sortPixelColorsByLightness2D(host.palette()));
    host.status("\uC791\uC5C5 \uD314\uB808\uD2B8\uB97C \uC5B4\uB450\uC6B4 \uC0C9\uBD80\uD130 \uC815\uB82C\uD588\uC2B5\uB2C8\uB2E4. \uADF8\uB9BC\uC758 \uC0C9\uC740 \uC801\uC6A9\uD560 \uB54C \uBC14\uB01D\uB2C8\uB2E4.");
  });
  button5("reverse-working-palette").onclick = () => attempt2(() => {
    host.setPalette([...host.palette()].reverse());
    host.status("\uC791\uC5C5 \uD314\uB808\uD2B8\uC758 \uC21C\uC11C\uB97C \uB4A4\uC9D1\uC5C8\uC2B5\uB2C8\uB2E4.");
  });
  button5("gradient-fit-horizontal").onclick = () => {
    const document2 = host.outputDocument();
    field5("gradient-start-x").value = "0";
    field5("gradient-start-y").value = "0";
    field5("gradient-end-x").value = String(Math.max(1, document2.width - 1));
    field5("gradient-end-y").value = "0";
  };
  button5("apply-ramp-map").onclick = () => attempt2(() => {
    const mode = select3("gradient-mode").value;
    const mapper = createPixelRampMapper2D(host.palette(), {
      mode,
      start: [numeric("gradient-start-x"), numeric("gradient-start-y")],
      end: [numeric("gradient-end-x"), numeric("gradient-end-y")],
      valueRange: [numeric("gradient-low"), numeric("gradient-high")],
      gamma: numeric("gradient-gamma"),
      dither: select3("gradient-dither").value
    });
    const name2 = mode === "value" ? "\uD314\uB808\uD2B8 \uBA85\uC554 \uB9E4\uD551" : mode === "radial" ? "\uBC29\uC0AC\uD615 \uD53D\uC140 \uBA85\uC554" : "\uC120\uD615 \uD53D\uC140 \uBA85\uC554";
    applyColor((source, document2) => mapper.map(source, region(document2)), name2);
  });
  function gradientControls() {
    const value = select3("gradient-mode").value === "value";
    el6("gradient-spatial-controls").hidden = value;
    el6("gradient-value-controls").hidden = !value;
  }
  select3("gradient-mode").onchange = gradientControls;
  gradientControls();
  function sheetControls() {
    const manifest = select3("sheet-import-mode").value === "manifest";
    el6("sheet-grid-controls").hidden = manifest;
    el6("sheet-manifest-control").hidden = !manifest;
  }
  select3("sheet-import-mode").onchange = sheetControls;
  sheetControls();
  button5("import-animation-sheet").onclick = () => {
    if (!host.beginImport()) return;
    void (async () => {
      try {
        const file = field5("animation-sheet-file").files?.[0];
        if (!file) throw new Error("\uAC00\uC838\uC62C \uC2A4\uD504\uB77C\uC774\uD2B8\uC2DC\uD2B8 PNG\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
        const manifestMode = select3("sheet-import-mode").value === "manifest";
        const manifestFile = field5("animation-sheet-manifest").files?.[0];
        if (manifestMode && !manifestFile) throw new Error("PNG\uC640 \uD568\uAED8 \uB0B4\uBCF4\uB0B8 \uC2DC\uAC04 JSON\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
        if (file.size > 64 * 1024 * 1024) throw new RangeError("\uC2DC\uD2B8 PNG\uB294 64 MiB \uC774\uD558\uB85C \uC5F4\uC5B4 \uC8FC\uC138\uC694.");
        if (manifestMode && manifestFile && manifestFile.size > 4 * 1024 * 1024) throw new RangeError("\uC2DC\uD2B8 \uC2DC\uAC04 JSON\uC740 4 MiB \uC774\uD558\uB85C \uC5F4\uC5B4 \uC8FC\uC138\uC694.");
        host.finishStroke();
        const before = host.outputDocument();
        const options = manifestMode ? void 0 : {
          frameWidth: numeric("slice-width"),
          frameHeight: numeric("slice-height"),
          margin: [numeric("slice-margin-x"), numeric("slice-margin-y")],
          gap: [numeric("slice-gap-x"), numeric("slice-gap-y")],
          order: select3("slice-order").value,
          start: numeric("slice-start"),
          ...numeric("slice-count") ? { count: numeric("slice-count") } : {},
          skipEmpty: field5("slice-skip-empty").checked,
          durationMs: numeric("slice-duration"),
          name: file.name.replace(/\.png$/i, "").slice(0, 160) || "Imported animation"
        };
        host.status("\uC6D0\uBCF8 \uD53D\uC140\uC744 \uC77D\uACE0 \uD504\uB808\uC784 \uACBD\uACC4\uC640 \uC7AC\uC0DD \uC2DC\uAC04\uC744 \uD655\uC778\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4\u2026");
        const decoded = await decodePixelArtPNG(new Uint8Array(await file.arrayBuffer()), {
          maxDimension: 16384,
          maxPixels: 16777216,
          maxFileBytes: 64 * 1024 * 1024,
          maxInflatedBytes: 128 * 1024 * 1024
        });
        if (decoded.kind !== "decoded") throw new Error("\uC2DC\uD2B8\uC758 \uC815\uD655\uD55C RGB\xB7\uC54C\uD30C\uB97C \uC720\uC9C0\uD558\uB824\uBA74 8\uBE44\uD2B8 PNG\uB85C \uC800\uC7A5\uD574 \uC8FC\uC138\uC694.");
        const { w, h, pixels } = decoded, source = { w, h, pixels, mask: { w, h, data: Uint8Array.from(pixels, (color) => color >>> 24 ? 1 : 0) } };
        const animation = manifestMode ? importPixelArtAnimationSheet2D(source, JSON.parse(await manifestFile.text())) : slicePixelArtAnimationSheet2D(source, options);
        host.finishStroke();
        if (host.outputDocument() !== before) throw new Error("\uAC00\uC838\uC624\uB294 \uB3D9\uC548 \uC791\uC5C5\uC774 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uD604\uC7AC \uC791\uC5C5\uC744 \uC720\uC9C0\uD588\uC2B5\uB2C8\uB2E4. \uC2DC\uD2B8 \uAC00\uC838\uC624\uAE30\uB97C \uB2E4\uC2DC \uB20C\uB7EC \uC8FC\uC138\uC694.");
        host.importAnimation(animation);
        const note = `${w} \xD7 ${h} \uC2DC\uD2B8 \u2192 ${animation.frames.length}\uAC1C \uD504\uB808\uC784 \xB7 ${animation.width} \xD7 ${animation.height} px. RGB\xB7\uC54C\uD30C\uC640 \uC7AC\uC0DD \uC2DC\uAC04\uC744 \uBCF4\uC874\uD588\uC2B5\uB2C8\uB2E4.`;
        el6("sheet-import-note").textContent = note + (decoded.warnings.length ? " \uC0C9\uC0C1 \uD504\uB85C\uD30C\uC77C\uC740 \uC6D0\uBCF8 \uC218\uCE58\uB97C \uC720\uC9C0\uD558\uAE30 \uC704\uD574 \uBCC0\uD658\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." : "");
        host.status(note);
      } finally {
        host.endImport();
      }
    })().catch((error) => host.status(error instanceof Error ? error.message : String(error), true));
  };
}

// gallery/pixel-art-lab.ts
var element = (id) => document.getElementById(id);
var input2 = (id) => element(id);
var select4 = (id) => element(id);
var button6 = (id) => element(id);
var number2 = (id) => Number(input2(id).value);
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
var canvasFrames = /* @__PURE__ */ new Map();
function status(message, error = false) {
  element("status").textContent = message;
  element("status").classList.toggle("error", error);
}
function beginImport() {
  if (busy) {
    status("\uB2E4\uB978 \uD30C\uC77C\uC744 \uAC00\uC838\uC624\uB294 \uC911\uC785\uB2C8\uB2E4. \uC644\uB8CC\uD55C \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.", true);
    return false;
  }
  busy = true;
  for (const id of ["import-png", "open-project", "import-animation-sheet"]) button6(id).disabled = true;
  return true;
}
function endImport() {
  busy = false;
  for (const id of ["import-png", "open-project", "import-animation-sheet"]) button6(id).disabled = false;
}
function requireUnchangedImport(before) {
  workbench?.finishStroke();
  if (outputProject() !== before) throw new Error("\uAC00\uC838\uC624\uB294 \uB3D9\uC548 \uC791\uC5C5\uC774 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uD604\uC7AC \uC791\uC5C5\uC744 \uC720\uC9C0\uD588\uC2B5\uB2C8\uB2E4. \uD30C\uC77C\uC744 \uB2E4\uC2DC \uC5F4\uC5B4 \uC8FC\uC138\uC694.");
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
    input2("seamless-material").checked = false;
    element("tile-material-note").textContent = "\uBC18\uBCF5 \uC7AC\uC9C8\uC740 \uAC00\uB85C\xB7\uC138\uB85C\uAC00 \uBAA8\uB450 2\uD53D\uC140 \uC774\uC0C1\uC778 \uCE94\uBC84\uC2A4\uC5D0\uC11C \uC0AC\uC6A9\uD569\uB2C8\uB2E4.";
    return;
  }
  workingOptions = { ...workingOptions, tileSize: [project.width, project.height], bevel: 0 };
  input2("seamless-material").checked = true;
  input2("bevel").value = "0";
  element("tile-material-note").textContent = `${project.width} \xD7 ${project.height} px \uAC04\uACA9\uC73C\uB85C \uBB34\uB2AC\uAC00 \uBC18\uBCF5\uB429\uB2C8\uB2E4. \uC804\uCCB4\uB97C \uCC44\uC6B4 \uD0C0\uC77C\uC5D0\uC11C \uC0AC\uC6A9\uD558\uC138\uC694.`;
}
function loadSettings(options) {
  const p = createPixelMaterial2D(options).options;
  workingOptions = structuredClone(p);
  for (const id of rangeIds) input2(id).step = "any";
  select4("material").value = p.kind;
  for (const id of ["seed", "scale", "detail", "relief", "bevel", "roughness", "ambient"]) {
    const control = input2(id), value = Number(p[id]);
    if (control.type === "range") {
      control.min = String(Math.min(Number(control.min), value));
      control.max = String(Math.max(Number(control.max), value));
    }
    control.value = String(value);
  }
  input2("light-angle").value = String(Math.atan2(p.light[1], p.light[0]) * 180 / Math.PI);
  input2("light-height").value = String(Math.atan2(p.light[2], Math.hypot(p.light[0], p.light[1])) * 180 / Math.PI);
  input2("grain-angle").value = String(((p.grainAngle * 180 / Math.PI + 180) % 360 + 360) % 360 - 180);
  input2("ambient-occlusion").value = String(p.ambientOcclusion);
  input2("cast-shadow").value = String(p.castShadow);
  input2("seamless-material").checked = !!p.tileSize;
  element("tile-material-note").textContent = p.tileSize ? `${p.tileSize[0]} \xD7 ${p.tileSize[1]} px \uAC04\uACA9\uC73C\uB85C \uBB34\uB2AC\uAC00 \uBC18\uBCF5\uB429\uB2C8\uB2E4. 3 \xD7 3 \uD0C0\uC77C \uBCF4\uAE30\uB85C \uACBD\uACC4\uB97C \uD655\uC778\uD558\uC138\uC694.` : "\uBC18\uBCF5 \uBB34\uB2AC\uB97C \uB9CC\uB4E4 \uB54C \uC0AC\uC6A9\uD569\uB2C8\uB2E4. \uCF1C\uBA74 \uAC00\uC7A5\uC790\uB9AC \uC785\uCCB4\uAC10\uC740 0\uC774 \uB429\uB2C8\uB2E4.";
  palette(p.palette);
}
function editSetting(id) {
  if (input2(id).type === "range") input2(id).value = String(Math.round(number2(id) * 1e3) / 1e3);
  if (id === "light-angle" || id === "light-height") {
    const a = number2("light-angle") * Math.PI / 180, e = number2("light-height") * Math.PI / 180;
    workingOptions.light = [Math.cos(a) * Math.cos(e), Math.sin(a) * Math.cos(e), Math.sin(e)];
  } else if (id === "grain-angle") workingOptions.grainAngle = number2(id) * Math.PI / 180;
  else if (id === "ambient-occlusion") workingOptions.ambientOcclusion = number2(id);
  else if (id === "cast-shadow") workingOptions.castShadow = number2(id);
  else if (id === "seamless-material") {
    if (input2(id).checked) matchTilePeriodToCanvas();
    else {
      delete workingOptions.tileSize;
      element("tile-material-note").textContent = "\uBC18\uBCF5 \uC7AC\uC9C8\uC744 \uAED0\uC2B5\uB2C8\uB2E4.";
    }
  } else if (id !== "use-height") workingOptions = { ...workingOptions, [id]: number2(id) };
  changed();
}
function pendingLayer() {
  const existing = project.layers.find((layer) => layer.id === editingMaterialId);
  return {
    kind: "material",
    id: editingMaterialId ?? nextPixelArtLayerId2D(project, "material"),
    name: existing?.name ?? `${labels[select4("material").value]} \xB7 ${number2("seed")}`,
    ...existing?.visible !== void 0 ? { visible: existing.visible } : {},
    ...existing?.locked !== void 0 ? { locked: existing.locked } : {},
    material: settings(),
    selection: Array.from(selection),
    protectedMask: Array.from(protectedMask),
    ...materialOrigin ? { origin: [...materialOrigin] } : {},
    ...input2("use-height").checked && authoredHeight ? existing?.kind === "material" && existing.heightSource !== "authored" ? { height: Array.from(authoredHeight) } : { heightSource: "authored" } : {}
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
  const { workingPalette: _previousPalette, ...base } = project, workingPalette = workbench?.storedPalette();
  const last = project.layers.filter((layer) => layer.kind === "material").at(-1);
  const saveSelection = project.selection !== void 0 || !selection.every((value, i) => value === (last?.selection?.[i] ?? ((project.mask?.[i] ?? 1) && project.pixels[i] >>> 24 ? 1 : 0)));
  const saveProtection = project.protectedMask !== void 0 || !protectedMask.every((value, i) => value === (last?.protectedMask?.[i] ?? 0));
  return outputDocumentCache = {
    ...base,
    layers,
    ...saveSelection ? { selection: Array.from(selection) } : {},
    ...saveProtection ? { protectedMask: Array.from(protectedMask) } : {},
    ...sourceAuthoredHeight ? { authoredHeight: Array.from(sourceAuthoredHeight) } : {},
    ...workingPalette ? { workingPalette: [...workingPalette] } : {}
  };
}
function resetHistory() {
  const { activeLayerId, ...base } = project;
  history = new PixelArtDocumentHistory2D({ ...base, layers: [] });
  for (let i = 1; i <= project.layers.length; i++) history.commit({ ...base, layers: project.layers.slice(0, i), ...activeLayerId && project.layers.slice(0, i).some((layer) => layer.id === activeLayerId) ? { activeLayerId } : {} });
  if (!project.layers.length) history = new PixelArtDocumentHistory2D(project);
}
function commitDocument(next) {
  const workingPalette = workbench?.storedPalette();
  if (workingPalette) next = { ...next, workingPalette: [...workingPalette] };
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
function moveHistory(direction2) {
  if (timeline?.enabled) {
    timeline[direction2]();
    return;
  }
  prepareImported(direction2 === "undo" ? history.undo() : history.redo(), false);
}
function sizeCanvases() {
  const dpr = window.devicePixelRatio || 1, requested = select4("zoom").value;
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
  const c = canvas(id), overlays = id === "source" ? `${previewVersion}:${protectionVersion}` : "";
  const cached = canvasFrames.get(id);
  if (cached?.sprite === sprite && cached.mode === mode && cached.heatmap === heatmap && cached.overlays === overlays) return;
  if (c.width !== sprite.w) c.width = sprite.w;
  if (c.height !== sprite.h) c.height = sprite.h;
  const ctx = c.getContext("2d"), image = cached?.image.width === sprite.w && cached.image.height === sprite.h ? cached.image : ctx.createImageData(c.width, c.height);
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
  canvasFrames.set(id, { sprite, mode, heatmap, overlays, image });
}
function update() {
  queued = false;
  let valid = false;
  attempt(() => {
    const hasLayerRoom = canAddLayer();
    if (!hasLayerRoom) draft = false;
    for (const control of document.querySelectorAll(".inspector input,.inspector select,#new-seed,#reset-palette")) if (!control.closest(".relight-panel")) control.disabled = !hasLayerRoom;
    for (const control of document.querySelectorAll(".selection-bar input,.selection-bar select,.selection-bar button")) control.disabled = !canEditMasks();
    input2("use-height").disabled = !hasLayerRoom || !authoredHeight;
    canvas("source").setAttribute("aria-disabled", String(!canEditMasks()));
    canvas("source").style.cursor = canEditMasks() ? "crosshair" : "default";
    for (const id of rangeIds) {
      const out = element(id + "-value"), value = number2(id), rounded = Math.round(value * 1e3) / 1e3;
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
      cachedOutput = draft ? editingMaterialId ? renderPixelArtDocument2D(outputProject()) : createPixelMaterial2D(settings()).shade(
        committed,
        { ...pendingLayer(), ...input2("use-height").checked && authoredHeight ? { height: authoredHeight } : {} }
      ) : committed;
      outputKey = nextOutputKey;
    }
    rendered = paintPreview ?? cachedOutput;
    const style = select4("expected-style").value;
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
    paint("result", rendered, select4("view").value, after.heatmap);
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
    button6("undo").disabled = !history.canUndo;
    button6("redo").disabled = !history.canRedo;
    timeline?.sync();
    button6("apply-material").disabled = !draft || !count || !hasLayerRoom;
    button6("apply-material").textContent = editingMaterialId ? "\uC218\uC815\uD55C \uC7AC\uC9C8 \uC801\uC6A9" : "\uC120\uD0DD \uC601\uC5ED\uC5D0 \uC7AC\uC9C8 \uC801\uC6A9";
    button6("cancel-preview").disabled = !draft;
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
function masksChanged() {
  element("status").classList.remove("error");
  paintPreview = void 0;
  previewVersion++;
  schedule();
}
function study() {
  const shape = select4("shape").value;
  if (shape === "imported") return;
  timeline?.close();
  workbench?.restoreAuthoredPalette(void 0);
  const result = createPixelArtStudy2D(shape, number2("seed"), input2("organic").checked);
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
  input2("use-height").disabled = false;
  input2("use-height").checked = true;
  input2("organic").disabled = !["stone-path", "boulder"].includes(shape);
  schedule();
}
function resetMaterial() {
  const kind = select4("material").value;
  const seed = number2("seed");
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
select4("material").addEventListener("change", () => attempt(resetMaterial));
select4("shape").addEventListener("change", () => attempt(() => {
  const shape = select4("shape").value;
  if (shape !== "imported") {
    select4("material").value = shape === "blade" ? "metal" : shape === "cloth" ? "fabric" : shape === "crystal" ? "crystal" : "stone";
    select4("expected-style").value = shape === "crystal" ? "geometric" : "organic";
    resetMaterial();
    study();
  }
}));
input2("organic").addEventListener("change", () => attempt(study));
button6("new-seed").onclick = () => attempt(() => {
  input2("seed").value = String(number2("seed") + 1 >>> 0);
  editSetting("seed");
});
button6("reset-palette").onclick = () => attempt(() => {
  workingOptions.palette = [...PIXEL_MATERIAL_PALETTES_2D[select4("material").value]];
  delete workingOptions.thresholds;
  palette(workingOptions.palette);
  changed();
});
button6("select-all").onclick = () => {
  selection = Uint8Array.from(committed.pixels, (c, i) => committed.mask.data[i] && c >>> 24 ? 1 : 0);
  masksChanged();
};
button6("clear-selection").onclick = () => {
  selection.fill(0);
  masksChanged();
};
button6("clear-protection").onclick = () => {
  protectedMask.fill(0);
  protectionVersion++;
  masksChanged();
};
button6("apply-material").onclick = () => attempt(() => {
  if (draft) commitDocument(outputProject());
});
button6("cancel-preview").onclick = () => {
  draft = false;
  editingMaterialId = void 0;
  paintPreview = void 0;
  schedule();
};
button6("undo").onclick = () => attempt(() => moveHistory("undo"));
button6("redo").onclick = () => attempt(() => moveHistory("redo"));
button6("save-png").onclick = () => attempt(savePNG);
button6("save-project").onclick = () => attempt(() => {
  if (update()) addDownload(new Blob([timeline?.serialize() ?? serializePixelArtDocument2D(outputProject())], { type: "application/json" }), filename() + ".poku-pixel-art.json");
});
button6("focus-workspace").onclick = () => {
  const enabled = document.body.classList.toggle("focus-mode");
  button6("focus-workspace").setAttribute("aria-pressed", String(enabled));
  button6("focus-workspace").textContent = enabled ? "\uBE44\uAD50 \uD654\uBA74\uC73C\uB85C" : "\uC791\uC5C5 \uD654\uBA74 \uD655\uB300";
  schedule();
};
button6("import-png").onclick = () => input2("png-file").click();
button6("open-project").onclick = () => input2("project-file").click();
function prepareImported(next, replaceHistory = true, preparedRaster) {
  if (next.width > 4096 || next.height > 4096) throw new RangeError("\uBE0C\uB77C\uC6B0\uC800 \uC791\uC5C5\uC2E4\uC5D0\uC11C\uB294 \uAC00\uB85C\xB7\uC138\uB85C 4096\uD53D\uC140 \uC774\uD558\uC758 \uD504\uB85C\uC81D\uD2B8\uB97C \uC0AC\uC6A9\uD574 \uC8FC\uC138\uC694.");
  serializePixelArtDocument2D(next);
  const raster = preparedRaster ?? renderPixelArtDocument2D(next);
  element("status").classList.remove("error");
  project = next;
  select4("shape").value = "imported";
  input2("organic").disabled = true;
  workbench?.restoreAuthoredPalette(next.workingPalette);
  const last = project.layers.filter((layer) => layer.kind === "material").at(-1);
  sourceAuthoredHeight = next.authoredHeight ? Float32Array.from(next.authoredHeight) : last?.height ? Float32Array.from(last.height) : void 0;
  authoredHeight = renderPixelArtAuthoredHeight2D(sourceAuthoredHeight && !next.authoredHeight ? { ...next, authoredHeight: Array.from(sourceAuthoredHeight) } : next);
  materialOrigin = last?.origin ? [...last.origin] : void 0;
  input2("use-height").checked = !!authoredHeight;
  input2("use-height").disabled = !authoredHeight;
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
input2("project-file").onchange = async () => {
  const file = input2("project-file").files?.[0];
  if (!file) return;
  if (!beginImport()) {
    input2("project-file").value = "";
    return;
  }
  try {
    if (file.size > 64 * 1024 * 1024) throw new RangeError("\uD504\uB85C\uC81D\uD2B8\uB294 64 MiB \uC774\uD558\uB85C \uC5F4\uC5B4 \uC8FC\uC138\uC694.");
    workbench?.finishStroke();
    const before = outputProject();
    status("\uD504\uB85C\uC81D\uD2B8\uC758 \uD53D\uC140\uACFC \uD3B8\uC9D1 \uC815\uBCF4\uB97C \uC77D\uACE0 \uC788\uC2B5\uB2C8\uB2E4\u2026");
    const json = await file.text(), header = JSON.parse(json);
    if (header?.schema === "poku-pixel-art/v3") {
      requireUnchangedImport(before);
      timeline.open(json);
    } else {
      const next = parsePixelArtDocument2D(json);
      if (next.width > 4096 || next.height > 4096) throw new RangeError("\uBE0C\uB77C\uC6B0\uC800 \uC791\uC5C5\uC2E4\uC5D0\uC11C\uB294 \uAC00\uB85C\xB7\uC138\uB85C 4096\uD53D\uC140 \uC774\uD558\uC758 \uD504\uB85C\uC81D\uD2B8\uB97C \uC0AC\uC6A9\uD574 \uC8FC\uC138\uC694.");
      const raster = renderPixelArtDocument2D(next);
      requireUnchangedImport(before);
      timeline?.close();
      prepareImported(next, true, raster);
    }
    status("\uD504\uB85C\uC81D\uD2B8\uB97C \uBD88\uB7EC\uC654\uC2B5\uB2C8\uB2E4.");
  } catch (error) {
    status(String(error), true);
  } finally {
    input2("project-file").value = "";
    endImport();
  }
};
input2("png-file").onchange = async () => {
  const file = input2("png-file").files?.[0];
  if (!file) return;
  if (!beginImport()) {
    input2("png-file").value = "";
    return;
  }
  let bitmap;
  try {
    if (file.size > 16 * 1024 * 1024) throw new RangeError("PNG\uB294 16 MiB \uC774\uD558\uB85C \uC5F4\uC5B4 \uC8FC\uC138\uC694.");
    workbench?.finishStroke();
    const before = outputProject();
    status("PNG \uC6D0\uBCF8 \uD53D\uC140\uC744 \uC77D\uACE0 \uC788\uC2B5\uB2C8\uB2E4\u2026");
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
    requireUnchangedImport(before);
    timeline?.close();
    prepareImported(next);
    element("import-note").textContent = decoded.kind === "decoded" ? `PNG \uC6D0\uBCF8 RGB\xB7\uC54C\uD30C\uB97C \uADF8\uB300\uB85C \uAC00\uC838\uC654\uC2B5\uB2C8\uB2E4.${decoded.warnings.length ? " \uC0C9\uC0C1 \uD504\uB85C\uD30C\uC77C\uC740 \uC6D0\uBCF8 \uC218\uCE58 \uBCF4\uC874\uC744 \uC704\uD574 \uBCC0\uD658\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." : ""}` : `${decoded.reason === "16-bit" ? "16\uBE44\uD2B8" : "Adam7 \uC778\uD130\uB808\uC774\uC2A4"} PNG\uB97C \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C \uBCC0\uD658\uD588\uC2B5\uB2C8\uB2E4. \uC6D0\uBCF8 \uC218\uCE58\uB97C \uADF8\uB300\uB85C \uD3B8\uC9D1\uD558\uB824\uBA74 \uBE44\uC778\uD130\uB808\uC774\uC2A4 8\uBE44\uD2B8 PNG\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.`;
    status("PNG\uB97C \uBD88\uB7EC\uC654\uC2B5\uB2C8\uB2E4.");
  } catch (error) {
    status(String(error), true);
  } finally {
    bitmap?.close();
    input2("png-file").value = "";
    endImport();
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
  const tolerance = Math.max(0, Math.min(100, number2("tolerance"))), seen = new Uint8Array(w * h), queue = new Uint32Array(w * h);
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
  const tool = select4("selection-tool").value, r = Math.max(1, Math.min(32, number2("brush-size"))) / 2;
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
  if (select4("selection-tool").value === "connected") {
    connected(x, y, event.shiftKey);
    masksChanged();
    return;
  }
  pointer = event.pointerId;
  lastPoint = [x, y];
  canvas("source").setPointerCapture(pointer);
  brush(x, y);
  masksChanged();
};
canvas("source").onpointermove = (event) => {
  if (pointer !== event.pointerId || !lastPoint || !canEditMasks()) return;
  const next = point(event), dx = next[0] - lastPoint[0], dy = next[1] - lastPoint[1], steps = Math.max(1, Math.abs(dx), Math.abs(dy));
  for (let i = 1; i <= steps; i++) brush(Math.round(lastPoint[0] + dx * i / steps), Math.round(lastPoint[1] + dy * i / steps));
  lastPoint = next;
  masksChanged();
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
  workingPaletteChanged: () => {
    previewVersion++;
    schedule();
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
  discardPreview: () => {
    draft = false;
    editingMaterialId = void 0;
    paintPreview = void 0;
    previewVersion++;
    schedule();
  },
  editMaterial: (id) => attempt(() => {
    const layer = project.layers.find((layer2) => layer2.id === id && layer2.kind === "material");
    if (!layer || layer.locked) return;
    editingMaterialId = id;
    loadSettings(layer.material);
    selection = layer.selection ? Uint8Array.from(layer.selection) : new Uint8Array(project.width * project.height).fill(1);
    protectedMask = layer.protectedMask ? Uint8Array.from(layer.protectedMask) : new Uint8Array(selection.length);
    protectionVersion++;
    authoredHeight = layer.heightSource === "authored" ? renderPixelArtAuthoredHeight2D({ ...project, layers: project.layers.slice(0, project.layers.indexOf(layer)) }) : layer.height ? Float32Array.from(layer.height) : void 0;
    materialOrigin = layer.origin ? [...layer.origin] : void 0;
    input2("use-height").checked = !!authoredHeight;
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
installPixelArtProduction({
  outputDocument: outputProject,
  finishStroke: () => workbench.finishStroke(),
  commit: commitDocument,
  palette: () => workbench.palette(),
  setPalette: (colors) => workbench.setAuthoredPalette(colors),
  applyToFrames: (edit) => timeline.editDocuments(edit),
  importAnimation: (animation) => timeline.importAnimation(animation),
  beginImport,
  endImport,
  status
});
attempt(() => {
  resetMaterial();
  study();
});
