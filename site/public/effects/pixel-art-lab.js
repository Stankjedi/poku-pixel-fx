import {
  PIXEL_MATERIAL_PALETTES_2D,
  createOrganicSilhouette2D,
  createPixelMaterial2D,
  diagnosePixelArt2D,
  rasterizePixelContour2D
} from "./chunks/chunk-WF7OCMQS.js";
import {
  hex
} from "./chunks/chunk-MBWWV6CB.js";
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
var MAX_JSON_BYTES = 64 * 1024 * 1024;
function rasterSize(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_CELLS)
    throw new RangeError("Pixel art projects need positive native dimensions and at most 1,048,576 cells");
  return width * height;
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
  if (!Array.isArray(p.layers) || p.layers.length > 32 || p.layers.length * n > 16777216)
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
function renderPixelArtProject2D(project2) {
  const p = validatePixelArtProject2D(project2);
  let result = {
    w: p.width,
    h: p.height,
    pixels: Uint32Array.from(p.pixels),
    mask: { w: p.width, h: p.height, data: p.mask ? Uint8Array.from(p.mask) : Uint8Array.from(p.pixels, (c) => c >>> 24 ? 1 : 0) }
  };
  for (const layer of p.layers) result = createPixelMaterial2D(layer.material).shade(result, layer);
  return result;
}
function serializePixelArtProject2D(project2) {
  const json = JSON.stringify(validatePixelArtProject2D(project2));
  checkJSONSize(json);
  return json;
}
function checkJSONSize(json) {
  if (json.length > MAX_JSON_BYTES || new TextEncoder().encode(json).byteLength > MAX_JSON_BYTES)
    throw new RangeError("Pixel art project exceeds 64 MiB");
}
function parsePixelArtProject2D(json) {
  if (typeof json !== "string") throw new TypeError("Pixel art project JSON must be a string");
  checkJSONSize(json);
  return validatePixelArtProject2D(JSON.parse(json));
}

// gallery/pixel-art-lab.ts
var element = (id) => document.getElementById(id);
var input = (id) => element(id);
var select = (id) => element(id);
var button = (id) => element(id);
var number = (id) => Number(input(id).value);
var canvas = (id) => element(id);
var labels = { stone: "\uB3CC", metal: "\uAE08\uC18D", wood: "\uB098\uBB34", fabric: "\uCC9C", crystal: "\uC218\uC815" };
var rangeIds = ["scale", "detail", "relief", "bevel", "roughness", "light-angle", "light-height", "ambient", "grain-angle"];
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
var redo = [];
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
  palette(p.palette);
}
function editSetting(id) {
  if (input(id).type === "range") input(id).value = String(Math.round(number(id) * 1e3) / 1e3);
  if (id === "light-angle" || id === "light-height") {
    const a = number("light-angle") * Math.PI / 180, e = number("light-height") * Math.PI / 180;
    workingOptions.light = [Math.cos(a) * Math.cos(e), Math.sin(a) * Math.cos(e), Math.sin(e)];
  } else if (id === "grain-angle") workingOptions.grainAngle = number(id) * Math.PI / 180;
  else if (id !== "use-height") workingOptions = { ...workingOptions, [id]: number(id) };
  changed();
}
function pendingLayer() {
  return {
    name: `${labels[select("material").value]} \xB7 ${number("seed")}`,
    material: settings(),
    selection: Array.from(selection),
    protectedMask: Array.from(protectedMask),
    ...materialOrigin ? { origin: [...materialOrigin] } : {},
    ...input("use-height").checked && authoredHeight ? { height: Array.from(authoredHeight) } : {}
  };
}
function outputProject() {
  return draft ? { ...project, layers: [...project.layers, pendingLayer()] } : project;
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
    const packed = sprite.pixels[i], j = i * 4, x = i % sprite.w, y = Math.floor(i / sprite.w);
    let r = packed & 255, g = packed >>> 8 & 255, b = packed >>> 16 & 255;
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
    if (id === "source" && packed >>> 24) {
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
    image.data.set([r, g, b, sprite.mask.data[i] ? packed >>> 24 : 0], j);
  }
  ctx.putImageData(image, 0, 0);
}
function update() {
  queued = false;
  let valid = false;
  attempt(() => {
    for (const id of rangeIds) {
      const out = element(id + "-value"), value = number(id), rounded = Math.round(value * 1e3) / 1e3;
      out.textContent = (value !== rounded ? "\u2248" : "") + String(rounded) + (["light-angle", "light-height", "grain-angle"].includes(id) ? "\xB0" : id === "scale" || id === "bevel" ? " px" : "");
      out.title = String(value);
    }
    const started = performance.now();
    committed = renderPixelArtProject2D(project);
    rendered = draft ? createPixelMaterial2D(settings()).shade(committed, pendingLayer()) : committed;
    const style = select("expected-style").value;
    const options = { expectedStyle: style, protected: protectedMask };
    const before = diagnosePixelArt2D(committed, options), after = diagnosePixelArt2D(rendered, options);
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
    element("result-caption").textContent = draft ? "\uC124\uC815\uC744 \uBC14\uAFD4 \uBE44\uAD50\uD55C \uB4A4, \uC120\uD0DD \uC601\uC5ED\uC5D0 \uC7AC\uC9C8\uC744 \uC801\uC6A9\uD558\uC138\uC694." : "\uC801\uC6A9\uD55C \uB808\uC774\uC5B4\uB97C \uC6D0\uBCF8\uC5D0\uC11C \uB2E4\uC2DC \uACC4\uC0B0\uD55C \uACB0\uACFC\uC785\uB2C8\uB2E4.";
    element("layer-count").textContent = String(project.layers.length);
    element("layer-list").replaceChildren(...project.layers.map((layer) => {
      const li = document.createElement("li");
      li.textContent = layer.name;
      return li;
    }));
    element("empty-layers").hidden = project.layers.length > 0;
    button("undo").disabled = !project.layers.length;
    button("redo").disabled = !redo.length;
    button("apply-material").disabled = !draft || !count || project.layers.length >= 32;
    status(`${draft ? "\uBBF8\uB9AC\uBCF4\uAE30" : "\uC801\uC6A9 \uC644\uB8CC"} \xB7 ${Math.round(performance.now() - started)} ms \xB7 ${after.metrics.paletteSize}\uC0C9`);
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
  draft = true;
  schedule();
}
function study() {
  const shape = select("shape").value;
  if (shape === "imported") return;
  const result = createPixelArtStudy2D(shape, number("seed"), input("organic").checked);
  project = createPixelArtProject2D(result.sprite, `POKU ${shape}`);
  authoredHeight = result.height;
  materialOrigin = void 0;
  selection = result.sprite.mask.data.slice();
  protectedMask = new Uint8Array(selection.length);
  redo = [];
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
  const target = document.createElement("canvas");
  target.width = rendered.w;
  target.height = rendered.h;
  const ctx = target.getContext("2d"), img = ctx.createImageData(target.width, target.height);
  for (let i = 0; i < rendered.pixels.length; i++) {
    const c = rendered.pixels[i];
    img.data.set([c & 255, c >>> 8 & 255, c >>> 16 & 255, rendered.mask.data[i] ? c >>> 24 : 0], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  target.toBlob((blob) => {
    if (blob) addDownload(blob, filename() + ".png");
    else status("PNG\uB97C \uB9CC\uB4E4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", true);
  }, "image/png");
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
  selection = Uint8Array.from(project.pixels, (c, i) => (project.mask?.[i] ?? 1) && c >>> 24 ? 1 : 0);
  changed();
};
button("clear-selection").onclick = () => {
  selection.fill(0);
  changed();
};
button("clear-protection").onclick = () => {
  protectedMask.fill(0);
  changed();
};
button("apply-material").onclick = () => attempt(() => {
  if (!draft) return;
  const next = outputProject();
  serializePixelArtProject2D(next);
  project = next;
  redo = [];
  draft = false;
  schedule();
});
button("undo").onclick = () => {
  const layer = project.layers.pop();
  if (layer) redo.push(layer);
  draft = false;
  schedule();
};
button("redo").onclick = () => {
  const layer = redo.pop();
  if (layer) project.layers.push(layer);
  draft = false;
  schedule();
};
button("save-png").onclick = () => attempt(savePNG);
button("save-project").onclick = () => attempt(() => addDownload(new Blob([serializePixelArtProject2D(outputProject())], { type: "application/json" }), filename() + ".poku-pixel-art.json"));
button("import-png").onclick = () => input("png-file").click();
button("open-project").onclick = () => input("project-file").click();
function prepareImported(next) {
  if (next.width > 4096 || next.height > 4096) throw new RangeError("\uBE0C\uB77C\uC6B0\uC800 \uC791\uC5C5\uC2E4\uC5D0\uC11C\uB294 \uAC00\uB85C\xB7\uC138\uB85C 4096\uD53D\uC140 \uC774\uD558\uC758 \uD504\uB85C\uC81D\uD2B8\uB97C \uC0AC\uC6A9\uD574 \uC8FC\uC138\uC694.");
  project = next;
  select("shape").value = "imported";
  input("organic").disabled = true;
  const last = project.layers.at(-1);
  authoredHeight = last?.height ? Float32Array.from(last.height) : void 0;
  materialOrigin = last?.origin ? [...last.origin] : void 0;
  input("use-height").checked = !!authoredHeight;
  input("use-height").disabled = !authoredHeight;
  selection = last?.selection ? Uint8Array.from(last.selection) : Uint8Array.from(project.pixels, (c, i) => (project.mask?.[i] ?? 1) && c >>> 24 ? 1 : 0);
  protectedMask = last?.protectedMask ? Uint8Array.from(last.protectedMask) : new Uint8Array(selection.length);
  if (last) loadSettings(last.material);
  redo = [];
  draft = false;
  schedule();
}
input("project-file").onchange = async () => {
  const file = input("project-file").files?.[0];
  if (!file || busy) return;
  busy = true;
  try {
    if (file.size > 64 * 1024 * 1024) throw new RangeError("\uD504\uB85C\uC81D\uD2B8\uB294 64 MiB \uC774\uD558\uB85C \uC5F4\uC5B4 \uC8FC\uC138\uC694.");
    prepareImported(parsePixelArtProject2D(await file.text()));
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
    const signature = new Uint8Array(await file.slice(0, 24).arrayBuffer());
    if (signature.length < 24 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => signature[i] === v)) throw new RangeError("PNG \uD30C\uC77C\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
    const header = new DataView(signature.buffer), w = header.getUint32(16), h = header.getUint32(20);
    if (w < 1 || h < 1 || w > 512 || h > 512) throw new RangeError("\uC791\uC5C5\uC2E4\uC5D0\uC11C\uB294 512 \xD7 512 \uC774\uD558\uC758 \uC6D0\uBCF8 \uD53D\uC140 PNG\uB97C \uC0AC\uC6A9\uD574 \uC8FC\uC138\uC694.");
    bitmap = await createImageBitmap(file);
    const c = document.createElement("canvas");
    c.width = bitmap.width;
    c.height = bitmap.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const rgba = ctx.getImageData(0, 0, c.width, c.height).data, pixels = new Uint32Array(w * h);
    for (let i = 0; i < pixels.length; i++) pixels[i] = (rgba[i * 4] | rgba[i * 4 + 1] << 8 | rgba[i * 4 + 2] << 16 | rgba[i * 4 + 3] << 24) >>> 0;
    prepareImported(createPixelArtProject2D({ w, h, pixels, mask: { w, h, data: Uint8Array.from(pixels, (p) => p >>> 24 ? 1 : 0) } }, file.name.replace(/\.png$/i, "")));
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
  for (let py = Math.max(0, Math.floor(y - r)); py <= Math.min(project.height - 1, Math.ceil(y + r)); py++) for (let px = Math.max(0, Math.floor(x - r)); px <= Math.min(project.width - 1, Math.ceil(x + r)); px++) {
    const i = py * project.width + px;
    if ((px - x) ** 2 + (py - y) ** 2 <= r * r && committed.mask.data[i] && committed.pixels[i] >>> 24) target[i] = value;
  }
}
var pointer;
var lastPoint;
canvas("source").onpointerdown = (event) => {
  if (event.button !== 0) return;
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
  if (pointer !== event.pointerId || !lastPoint) return;
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
attempt(() => {
  resetMaterial();
  study();
});
