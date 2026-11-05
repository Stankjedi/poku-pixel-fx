import {
  createProjectRuntime,
  createSequenceSpec,
  projectCinematicOptions
} from "./chunks/chunk-P7625K3Z.js";
import {
  RECIPE_KINDS,
  RECIPE_LAYERS,
  createRecipeSpec,
  recipeParameters,
  retimeRecipeSpec
} from "./chunks/chunk-J4Q4JDPH.js";
import {
  catalogEntries,
  loadCatalogEffect,
  searchEffects
} from "./chunks/chunk-THDATTYP.js";
import "./chunks/chunk-6HAS6H5C.js";
import {
  cloneJSON,
  createProject,
  createRecipePack,
  parseProject,
  serializeProject
} from "./chunks/chunk-FLVIEPJE.js";
import {
  CinematicFrameRenderer,
  PlaybackClock,
  integerViewport
} from "./chunks/chunk-I4QYMUT2.js";
import {
  encodeRGBAPNG
} from "./chunks/chunk-OHTBDYQJ.js";
import {
  createAtlasPacker,
  createCharacterAsset2D,
  createCharacterIdentity2D,
  createStudioCharacter2D,
  extrudeAtlasRegion,
  frameContentBounds,
  frameDurationMs,
  renderCharacterPortrait2D,
  resolveAssetEvents,
  resolveAtlasExportSettings,
  sampleCharacterSocketTrack2D,
  setCharacterSocketKey2D
} from "./chunks/chunk-I2D4GEWW.js";
import {
  createTimingCurve,
  hex,
  toHex
} from "./chunks/chunk-FEXYTCCO.js";
import {
  PIXEL_PALETTE_PRESETS,
  createPixelStyleProfile2D,
  diagnosePixelMotion2D,
  diagnosePixelSprite2D,
  invertPixelTransform2D,
  pixelTransform2D,
  transformPixelPoint2D
} from "./chunks/chunk-3L2ANF6Q.js";
import "./chunks/chunk-JQMAFXP4.js";
import "./chunks/chunk-WSFCRVEQ.js";

// src/authoring/history.ts
var EditHistory = class {
  constructor(initial, limit = 80) {
    this.limit = limit;
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError("History limit must be positive");
    this.current = cloneJSON(initial);
  }
  past = [];
  future = [];
  current;
  get value() {
    return cloneJSON(this.current);
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  commit(next) {
    const copy = cloneJSON(next);
    if (JSON.stringify(copy) === JSON.stringify(this.current)) return false;
    this.past.push(this.current);
    if (this.past.length > this.limit) this.past.shift();
    this.current = copy;
    this.future = [];
    return true;
  }
  undo() {
    const previous = this.past.pop();
    if (previous !== void 0) {
      this.future.push(this.current);
      this.current = previous;
    }
    return this.value;
  }
  redo() {
    const next = this.future.pop();
    if (next !== void 0) {
      this.past.push(this.current);
      this.current = next;
    }
    return this.value;
  }
  reset(value) {
    this.current = cloneJSON(value);
    this.past = [];
    this.future = [];
  }
};

// src/authoring/review.ts
function observationsFromReview(input2) {
  if (!input2 || typeof input2 !== "object") throw new TypeError("Review must be an object");
  const record = input2, source = record.observations ?? record.humanReview?.observations;
  if (!source || typeof source !== "object") throw new TypeError("Review observations are missing");
  return Object.entries(source).map(([topic, value]) => {
    const o = typeof value === "string" ? { note: value } : value;
    if (!o || typeof o !== "object") throw new TypeError("Invalid observation");
    const note = o.note ?? o.observation ?? o.description ?? o.problem;
    if (typeof note !== "string") throw new TypeError("Observation note must be text");
    const ranges = o.frameRanges ?? (o.frameRange ? [{ from: o.frameRange[0], to: o.frameRange[1] ?? o.frameRange[0] }] : o.frames?.length ? [{ from: o.frames[0], to: o.frames[o.frames.length - 1] }] : Number.isSafeInteger(o.frame) ? [{ from: o.frame, to: o.frame }] : []);
    if (!Array.isArray(ranges) || ranges.some((r) => !r || !Number.isSafeInteger(r.from) || !Number.isSafeInteger(r.to) || r.from < 0 || r.to < r.from)) throw new RangeError("Invalid observation frame ranges");
    return { topic, note, frameRanges: ranges.map((r) => ({ from: r.from, to: r.to })), ...typeof o.layer === "string" ? { layer: o.layer } : {}, ...typeof o.parameter === "string" ? { parameter: o.parameter } : {}, ...Number.isFinite(o.time) && o.time >= 0 ? { time: o.time } : {} };
  });
}

// src/version.ts
var ENGINE_VERSION = "0.5.0";

// src/render/atlas-page.ts
var AtlasPageBuffer = class {
  constructor(maxTextureSize, channels = {}) {
    this.maxTextureSize = maxTextureSize;
    if (!Number.isSafeInteger(maxTextureSize) || maxTextureSize < 1 || maxTextureSize > 16384)
      throw new RangeError("Atlas page limit must be an integer within 1..16384");
    this.channels = { ...channels };
  }
  width = 0;
  height = 0;
  color = new Uint8ClampedArray(0);
  emission;
  radiance;
  occlusion;
  channels;
  /** Capacity in bytes, excluding encoded output and transient buffers during a growth. */
  get byteLength() {
    return this.color.byteLength + (this.emission?.byteLength ?? 0) + (this.radiance?.byteLength ?? 0) + (this.occlusion?.byteLength ?? 0);
  }
  /** Geometric growth amortizes copying; the packer still determines the exported dimensions. */
  ensure(width, height) {
    if (![width, height].every((v) => Number.isSafeInteger(v) && v > 0 && v <= this.maxTextureSize))
      throw new RangeError("Atlas page contents exceed its configured limit");
    if (width <= this.width && height <= this.height) return;
    const grow = (required, current) => Math.max(
      current,
      Math.min(this.maxTextureSize, 2 ** Math.ceil(Math.log2(required)))
    );
    const nextWidth = grow(width, this.width), nextHeight = grow(height, this.height);
    const pixels = nextWidth * nextHeight, color = new Uint8ClampedArray(pixels * 4);
    const emission = this.channels.emission ? new Float32Array(pixels * 3) : void 0;
    const radiance = this.channels.radiance ? new Float32Array(pixels * 3) : void 0;
    const occlusion = this.channels.occlusion ? new Float32Array(pixels).fill(1) : void 0;
    const copy = (source, target, channels) => {
      if (!source || !target) return;
      const row = this.width * channels;
      for (let y = 0; y < this.height; y++)
        target.set(source.subarray(y * row, (y + 1) * row), y * nextWidth * channels);
    };
    copy(this.color, color, 4);
    copy(this.emission, emission, 3);
    copy(this.radiance, radiance, 3);
    copy(this.occlusion, occlusion, 1);
    this.width = nextWidth;
    this.height = nextHeight;
    this.color = color;
    this.emission = emission;
    this.radiance = radiance;
    this.occlusion = occlusion;
  }
};

// gallery/studio-export.ts
var encoder = new TextEncoder();
var MAX_BYTES = 128 * 1024 * 1024;
async function sha256(data) {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))].map((v) => v.toString(16).padStart(2, "0")).join("");
}
var crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 3988292384 ^ n >>> 1 : n >>> 1;
  return n >>> 0;
});
async function zipFiles(files) {
  const parts = [], directory = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name), bytes = new Uint8Array(await file.blob.arrayBuffer());
    let crc = 4294967295;
    for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ crc >>> 8;
    crc = (crc ^ 4294967295) >>> 0;
    const local = new Uint8Array(30 + name.length), l = new DataView(local.buffer);
    l.setUint32(0, 67324752, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 2048, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, bytes.length, true);
    l.setUint32(22, bytes.length, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length), c = new DataView(central.buffer);
    c.setUint32(0, 33639248, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 2048, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, bytes.length, true);
    c.setUint32(24, bytes.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.set(name, 46);
    parts.push(local.buffer, file.blob);
    directory.push(central);
    offset += local.length + bytes.length;
  }
  const directoryBytes = directory.reduce((n, d) => n + d.length, 0), end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 101010256, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, directoryBytes, true);
  e.setUint32(16, offset, true);
  return new Blob([...parts, ...directory.map((a) => a.buffer), end.buffer], { type: "application/zip" });
}
function exportProjectAtlas(project2, onProgress) {
  const settings = resolveAtlasExportSettings({ trim: true, ...project2.exportSettings }), PAGE = settings.maxTextureSize;
  if (PAGE > 2048) throw new RangeError("\uBE0C\uB77C\uC6B0\uC800 atlas\uB294 \uCD5C\uB300 2048\uC785\uB2C8\uB2E4. \uB354 \uD070 \uD398\uC774\uC9C0\uB294 CLI\uC5D0\uC11C \uB0B4\uBCF4\uB0B4\uC138\uC694.");
  const worker = new Worker(new URL("./studio-worker.js", import.meta.url), { type: "module" }), id = 1;
  let cancelled = false, settled = false, finish, fail;
  const promise = new Promise((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  const packer = createAtlasPacker(PAGE, settings.padding), files = [], records = [];
  const duplicates = /* @__PURE__ */ new Map();
  let reused = 0;
  const renderMode = project2.renderProfile?.mode === "cinematic" ? "cinematic" : "legacy";
  let info, page = -1, pageBuffer, bytes = 0;
  const manifest = {
    schema: "poku-asset/v1",
    id: project2.id,
    name: project2.name,
    loop: false,
    durationMs: 0,
    color: { format: "RGBA8888", colorSpace: "srgb", alpha: "straight" },
    coordinates: "untrimmed-pixel-edges-y-down",
    pages: [],
    frames: [],
    tags: [],
    settings: { project: project2, renderMode, renderProfile: { ...project2.renderProfile, mode: renderMode }, atlas: settings, assetLayers: "straight color + linear HDR emission", previewBackground: project2.bg },
    source: { engineVersion: ENGINE_VERSION, rng: "poku-rng/v1", ...project2.sourceRevision ? { sourceRevision: project2.sourceRevision } : {} },
    files: records
  };
  async function add(name, blob) {
    if (cancelled) throw new Error("\uB0B4\uBCF4\uB0B4\uAE30\uAC00 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    bytes += blob.size;
    if (bytes > MAX_BYTES) throw new RangeError("\uBE0C\uB77C\uC6B0\uC800 \uB0B4\uBCF4\uB0B4\uAE30 \uD55C\uB3C4(128 MiB)\uB97C \uB118\uC5C8\uC2B5\uB2C8\uB2E4. CLI asset-bundle \uB0B4\uBCF4\uB0B4\uAE30\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.");
    files.push({ name, blob });
    records.push({ path: name, bytes: blob.size, sha256: await sha256(blob) });
  }
  async function flush() {
    if (page < 0 || !pageBuffer) return;
    const { w, h } = packer.pages[page], color = new Uint8Array(w * h * 4), emission = new Float32Array(w * h * 3);
    let hasEmission = false;
    const { color: pageColor, emission: pageEmission, width: stride } = pageBuffer;
    for (let y = 0; y < h; y++) {
      color.set(pageColor.subarray(y * stride * 4, y * stride * 4 + w * 4), y * w * 4);
      emission.set(pageEmission.subarray(y * stride * 3, y * stride * 3 + w * 3), y * w * 3);
    }
    for (const v of emission) if (v !== 0) {
      hasEmission = true;
      break;
    }
    const name = `atlas-${page}.png`;
    await add(name, await encodeRGBAPNG(w, h, color));
    const entry = { image: name, width: w, height: h };
    if (hasEmission) {
      const name2 = `atlas-${page}.emission.f32`, le = new ArrayBuffer(emission.byteLength), view2 = new DataView(le);
      for (let i = 0; i < emission.length; i++) view2.setFloat32(i * 4, emission[i], true);
      await add(name2, new Blob([le], { type: "application/octet-stream" }));
      entry.emission = { image: name2, format: "float32-le", channels: 3, colorSpace: "linear-srgb" };
    }
    manifest.pages.push(entry);
    pageBuffer = void 0;
  }
  async function message(m) {
    if (cancelled || m.id !== id) return;
    if (m.type === "begin") {
      info = m;
      manifest.loop = m.loop;
      manifest.contacts = m.contacts;
      manifest.tags = [{ name: project2.options.clip ?? project2.name, from: 0, to: m.count - 1, direction: "forward" }];
      return;
    }
    if (m.type === "error") throw new Error(m.message);
    if (m.type === "frame") {
      const rgba = new Uint8Array(m.rgba), emission = new Float32Array(m.emission), trim = settings.trim ? frameContentBounds(info.width, info.height, rgba, emission) : { x: 0, y: 0, w: info.width, h: info.height };
      let key = "";
      if (settings.deduplicate) {
        const data = new Uint8Array(8 + trim.w * trim.h * 16), view2 = new DataView(data.buffer);
        view2.setUint32(0, trim.w, true);
        view2.setUint32(4, trim.h, true);
        let at = 8;
        for (let y = 0; y < trim.h; y++) for (let x = 0; x < trim.w; x++) {
          const src = (trim.y + y) * info.width + trim.x + x;
          data.set(rgba.subarray(src * 4, src * 4 + 4), at);
          at += 4;
          for (let c = 0; c < 3; c++) {
            view2.setFloat32(at, emission[src * 3 + c], true);
            at += 4;
          }
        }
        key = await sha256(data.buffer);
      }
      const previous = settings.deduplicate ? duplicates.get(key) : void 0, placement = previous ?? packer.place(trim.w, trim.h);
      if (previous) reused++;
      else {
        if (placement.page !== page) {
          await flush();
          page = placement.page;
          if (page >= 16) throw new RangeError("\uBE0C\uB77C\uC6B0\uC800 \uB0B4\uBCF4\uB0B4\uAE30\uB294 \uCD5C\uB300 16\uAC1C atlas \uD398\uC774\uC9C0\uC785\uB2C8\uB2E4. CLI\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.");
          pageBuffer = new AtlasPageBuffer(PAGE, { emission: true });
        }
        const used = packer.pages[page];
        pageBuffer.ensure(used.w, used.h);
        const { color: pageColor, emission: pageEmission, width: stride } = pageBuffer;
        for (let y = 0; y < trim.h; y++) {
          const source = (y + trim.y) * info.width + trim.x, dest = (placement.rect.y + y) * stride + placement.rect.x;
          pageColor.set(rgba.subarray(source * 4, (source + trim.w) * 4), dest * 4);
          pageEmission.set(emission.subarray(source * 3, (source + trim.w) * 3), dest * 3);
        }
        if (settings.extrude) {
          extrudeAtlasRegion(pageColor, stride, 4, placement.rect, settings.extrude);
          extrudeAtlasRegion(pageEmission, stride, 3, placement.rect, settings.extrude);
        }
        if (settings.deduplicate) duplicates.set(key, placement);
      }
      manifest.frames.push({ ...placement, sourceSize: [info.width, info.height], trimOffset: [trim.x, trim.y], pivot: info.origin, duration: frameDurationMs(m.index, info.fps), time: m.time, frozen: m.frozen, ...m.sockets ? { sockets: m.sockets } : {} });
      onProgress(`${m.index + 1} / ${info.count} \uD504\uB808\uC784 \xB7 ${page + 1}\uD398\uC774\uC9C0 \xB7 \uC911\uBCF5 ${reused}\uC7A5 \uC7AC\uC0AC\uC6A9 \xB7 \uCD9C\uB825 ${Math.round(bytes / 1048576)} MiB \xB7 \uD398\uC774\uC9C0 \uBC84\uD37C ${((pageBuffer?.byteLength ?? 0) / 1048576).toFixed(1)} MiB`);
      worker.postMessage({ type: "ack", id });
      return;
    }
    if (m.type === "done") {
      await flush();
      const json = serializeProject(project2), blob = new Blob([json], { type: "application/json" });
      manifest.source.projectSha256 = await sha256(blob);
      await add("project.json", blob);
      manifest.durationMs = manifest.frames.reduce((n, f) => n + f.duration, 0);
      manifest.events = resolveAssetEvents(info.events ?? [], manifest.frames, manifest.loop ? info.effectDuration : void 0);
      files.push({ name: "asset.json", blob: new Blob([JSON.stringify(manifest, null, 2) + "\n"], { type: "application/json" }) });
      onProgress("\uC790\uC0B0 \uD30C\uC77C\uC744 ZIP\uC73C\uB85C \uBB36\uB294 \uC911");
      const zip = await zipFiles(files);
      if (cancelled) return;
      settled = true;
      worker.terminate();
      finish([{ name: project2.id.replace("/", "-") + ".poku-asset.zip", blob: zip }, ...files]);
    }
  }
  worker.onmessage = (e) => {
    void message(e.data).catch((error) => {
      if (!settled) {
        settled = true;
        worker.terminate();
        pageBuffer = void 0;
        files.length = 0;
        fail(error);
      }
    });
  };
  worker.onerror = (e) => {
    if (!settled) {
      settled = true;
      worker.terminate();
      pageBuffer = void 0;
      files.length = 0;
      fail(new Error(e.message));
    }
  };
  worker.postMessage({ type: "bake", id, project: project2 });
  return { promise, cancel() {
    if (settled) return;
    cancelled = true;
    settled = true;
    worker.postMessage({ type: "cancel", id });
    worker.terminate();
    pageBuffer = void 0;
    files.length = 0;
    fail(new Error("\uB0B4\uBCF4\uB0B4\uAE30\uAC00 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4."));
  } };
}

// gallery/studio.ts
var $ = (id) => document.getElementById(id);
var input = (id) => $(id);
var select = (id) => $(id);
var button = (id) => $(id);
var text = (tag, value) => {
  const e = document.createElement(tag);
  e.textContent = value;
  return e;
};
var labels = {
  "thrown-blade": ["\uD22C\uCC99 \uAC80", "\uD68C\uC804 \xB7 \uBE44\uD589 \xB7 \uAE08\uC18D \uC811\uCD09", "melee/tempered-crescent"],
  "ribbon-slash": ["\uAC80\uACA9 \uC794\uC0C1", "\uC8FC\uD615\uD0DC \xB7 \uB9AC\uBCF8 \xB7 \uD0C0\uACA9", "melee/socket-ribbon-slash"],
  lightning: ["\uB099\uB8B0", "\uC8FC \uBC29\uC804 \xB7 \uBD84\uAE30 \xB7 \uC811\uC9C0", "lightning/focused-arc"],
  explosion: ["\uD3ED\uBC1C", "\uC555\uB825 \xB7 \uD30C\uD3B8 \xB7 \uB0C9\uAC01", "explosions/layered-detonation"],
  flame: ["\uBD88\uAF43", "\uC5F0\uACB0\uB41C \uBA74 \xB7 \uC5F4 \xB7 \uC5F0\uAE30", "fire/folded-flame"],
  portal: ["\uD3EC\uD138", "\uC785\uAD6C \xB7 \uC804\uD6C4\uBA74 \xB7 \uAE4A\uC774", "arcane/depth-portal"]
};
var layerNames = { body: "\uC8FC\uD615\uD0DC", trail: "\uC794\uC0C1 / \uC5F0\uAE30", glow: "\uAD11\uD559 \uBC1C\uAD11", debris: "\uD30C\uD3B8 / \uBCF4\uC870", environment: "\uD658\uACBD / \uADF8\uB9BC\uC790" };
function recipeProject(kind) {
  const [name, desc, id] = labels[kind], intentRef = `authoring/${id}.intent.json`;
  return createProject({ id, kind: "recipe", name, seed: 1, fps: 30, bg: "dark", intentRef, notes: desc, recipe: createRecipeSpec(kind, { intentRef }), layers: {}, actor: false, target: false });
}
var project = recipeProject("thrown-blade");
var history = new EditHistory(project);
var runtime;
var clock = new PlaybackClock();
var stage = $("stage");
var ctx = stage.getContext("2d");
var native = document.createElement("canvas");
var nativeCtx = native.getContext("2d");
var onionCanvas = document.createElement("canvas");
var shiftedCanvas = document.createElement("canvas");
var rgbaImage;
var latest;
var dirty = true;
var loadGeneration = 0;
var renderGeneration = 0;
var gpu;
var lastFrame = -1;
var lastView = "";
var view = { x: 0, y: 0, width: 1, height: 1, scale: 1, clipped: false };
var renderError = "";
var drawing = false;
var showSockets = false;
var clipDetailsOpen = false;
var socketDetailsOpen = false;
var selectedSocket = "hand.grip";
var newSocketMode = "delta";
var urls = [];
function status(message, error = false) {
  $("status").textContent = message;
  $("status").style.color = error ? "#f2aa92" : "";
}
function attempt(task) {
  try {
    void Promise.resolve(task()).catch((error) => status(String(error), true));
  } catch (error) {
    status(String(error), true);
  }
}
function linkFile(file, container = $("downloads")) {
  const a = document.createElement("a"), url = URL.createObjectURL(file.blob);
  urls.push(url);
  a.href = url;
  a.download = file.name;
  a.textContent = file.name;
  container.append(a);
  return a;
}
function clearDownloads() {
  for (const url of urls) URL.revokeObjectURL(url);
  urls.length = 0;
  $("downloads").replaceChildren();
}
function download(name, blob) {
  const a = linkFile({ name, blob });
  a.click();
}
async function setProject(next, mode = "commit", keepTime = true) {
  const candidate = createProject(next), generation = ++loadGeneration;
  if (candidate.kind === "3d") {
    sessionStorage.setItem("poku-studio-3d-project", serializeProject(candidate));
    location.href = "3d.html";
    return;
  }
  status("\uD504\uB85C\uC81D\uD2B8\uB97C \uC900\uBE44\uD558\uB294 \uC911");
  const built = runtime?.tryUpdateProject(candidate) ? runtime : await createProjectRuntime(candidate);
  if (generation !== loadGeneration) {
    if (built !== runtime) built.dispose();
    return;
  }
  const time = keepTime ? clock.time : built.mod.meta.heroTime ?? 0;
  if (runtime !== built) runtime?.dispose();
  runtime = built;
  project = built.project;
  clock.duration = built.duration;
  clock.loop = built.loop;
  clock.seek(Math.min(time, built.duration));
  if (mode === "reset") history.reset(project);
  else if (mode === "commit") history.commit(project);
  native.width = built.width;
  native.height = built.height;
  onionCanvas.width = built.width;
  onionCanvas.height = built.height;
  shiftedCanvas.width = built.width;
  shiftedCanvas.height = built.height;
  rgbaImage = new ImageData(built.width, built.height);
  dirty = true;
  lastFrame = -1;
  latest = void 0;
  renderError = "";
  renderControls();
  await setupRenderer();
  const fallback = gpu?.status.backend === "cpu" && project.renderProfile?.backend === "webgpu" ? ` \xB7 CPU fallback: ${gpu.status.reason ?? "GPU \uC0AC\uC6A9 \uBD88\uAC00"}` : "";
  try {
    localStorage.setItem("poku-studio-autosave", serializeProject(project));
    status("\uD504\uB85C\uC81D\uD2B8 \uC900\uBE44\uB428 \xB7 \uBCC0\uACBD \uC0AC\uD56D \uC790\uB3D9 \uC800\uC7A5" + fallback);
  } catch {
    status("\uD504\uB85C\uC81D\uD2B8 \uC900\uBE44\uB428 \xB7 \uC790\uB3D9 \uC800\uC7A5 \uACF5\uAC04\uC774 \uBD80\uC871\uD569\uB2C8\uB2E4. \uD504\uB85C\uC81D\uD2B8 \uC800\uC7A5\uC744 \uC0AC\uC6A9\uD558\uC138\uC694." + fallback);
  }
}
async function mutate(change) {
  const next = cloneJSON(project);
  change(next);
  await setProject(next);
}
async function setupRenderer() {
  const generation = ++renderGeneration;
  if (select("backend").value !== "webgpu") {
    gpu?.dispose();
    gpu = void 0;
    return;
  }
  if (gpu && gpu.status.state !== "disposed") return;
  const created = await CinematicFrameRenderer.create(native, { backend: "webgpu" });
  if (generation !== renderGeneration) {
    created.dispose();
    return;
  }
  gpu = created;
  dirty = true;
  if (created.status.backend === "cpu") status(`CPU\uB85C \uB80C\uB354\uB9C1 \uC911 \xB7 ${created.status.reason ?? "WebGPU\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4"}`);
}
function displaySize() {
  const bounds = $("viewport").getBoundingClientRect(), ratio = devicePixelRatio || 1, w = Math.max(1, Math.round(bounds.width * ratio)), h = Math.max(1, Math.round(bounds.height * ratio));
  if (stage.width !== w || stage.height !== h) {
    stage.width = w;
    stage.height = h;
    dirty = true;
  }
  if (!runtime) return;
  const zoom = select("zoom").value;
  view = integerViewport(runtime.width, runtime.height, w, h);
  if (zoom === "fit") {
    const scale = Math.min(w / runtime.width, h / runtime.height);
    view = { scale, width: runtime.width * scale, height: runtime.height * scale, x: (w - runtime.width * scale) / 2, y: (h - runtime.height * scale) / 2, clipped: false };
  } else if (zoom !== "integer") {
    const scale = Number(zoom), width = runtime.width * scale, height = runtime.height * scale;
    view = { scale, width, height, x: Math.floor((w - width) / 2), y: Math.floor((h - height) / 2), clipped: width > w || height > h };
  }
  $("view-label").textContent = `${runtime.width} \xD7 ${runtime.height} \xB7 ${view.scale.toFixed(zoom === "fit" ? 2 : 0)}\xD7 \uAE30\uAE30 \uD53D\uC140${zoom === "fit" ? " \xB7 \uD654\uBA74 \uB9DE\uCDA4" : view.clipped ? " \xB7 1\xD7 \uC774\uC0C1, \uAC00\uC7A5\uC790\uB9AC \uC798\uB9BC" : " \xB7 \uC815\uC218 \uBC30\uC728"}`;
}
function diagnostic(sample, previous) {
  const rgba = sample.rgba.slice(), mode = select("diagnostic").value, f = sample.frame;
  if (mode === "color") return rgba;
  if (mode === "silhouette") for (let i = 0; i < f.color.length; i++) {
    const alpha = f.color[i] >>> 24;
    rgba.set([217, 238, 227, alpha], i * 4);
  }
  if (mode === "value") for (let i = 0; i < rgba.length; i += 4) {
    const v = Math.round(0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]);
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
  }
  if (mode === "gaps") {
    const result = diagnosePixelSprite2D({ w: f.w, h: f.h, pixels: f.color, mask: { w: f.w, h: f.h, data: Uint8Array.from(f.color, (c) => c >>> 24 ? 1 : 0) } }, { masks: f.semanticMasks, palette: project.pixelStyle?.finalColorPolicy === "palette-locked" ? project.pixelStyle.palette : void 0 });
    for (let i = 0; i < result.heatmap.length; i++) if (result.heatmap[i]) rgba.set(result.heatmap[i] === 255 ? [255, 75, 90, 255] : [255, 185, 55, 255], i * 4);
    $("view-label").textContent += ` \xB7 \uACC4\uC57D \uC704\uBC18 ${result.issues.filter((i) => i.confidence === "contract").length} / \uAC80\uD1A0 \uD6C4\uBCF4 ${result.issues.filter((i) => i.confidence === "heuristic").length}`;
  }
  if (mode === "motion" && previous) {
    const frames = [previous, f.color].map((pixels, i) => ({ time: Math.max(0, sample.time - (1 - i) / project.fps), sprite: { w: f.w, h: f.h, pixels, mask: { w: f.w, h: f.h, data: Uint8Array.from(pixels, (c) => c >>> 24 ? 1 : 0) } } }));
    const result = diagnosePixelMotion2D(frames);
    for (let i = 0; i < result.heatmap.length; i++) if (result.heatmap[i]) rgba.set([245, 169, 90, 255], i * 4);
    $("view-label").textContent += ` \xB7 \uC804 \uD504\uB808\uC784\uACFC ${result.pairs[0]?.changed ?? 0}\uC140 \uBCC0\uD654`;
  }
  return rgba;
}
function render() {
  if (!runtime || !rgbaImage) return;
  const frameIndex = Math.floor(clock.time * project.fps + 1e-6), time = Math.min(runtime.duration, frameIndex / project.fps), viewKey = [select("diagnostic").value, input("onion").checked, select("zoom").value].join(":");
  if (!dirty && frameIndex === lastFrame && viewKey === lastView) return;
  displaySize();
  let previous;
  if ((input("onion").checked || select("diagnostic").value === "motion") && frameIndex > 0) {
    const old = runtime.render((frameIndex - 1) / project.fps, frameIndex - 1);
    previous = old.frame.color.slice();
    if (input("onion").checked) onionCanvas.getContext("2d").putImageData(new ImageData(old.rgba.slice(), runtime.width, runtime.height), 0, 0);
  }
  const mode = select("diagnostic").value, gpuFinish = !!gpu && mode === "color";
  latest = runtime.render(time, frameIndex, true, !gpuFinish);
  if (gpuFinish) {
    gpu.render(latest.frame, projectCinematicOptions(project, runtime.bg));
    shiftNativeCanvas(latest.shake);
  } else {
    rgbaImage.data.set(diagnostic(latest, previous));
    nativeCtx.putImageData(rgbaImage, 0, 0);
  }
  ctx.clearRect(0, 0, stage.width, stage.height);
  ctx.imageSmoothingEnabled = false;
  if (input("onion").checked && frameIndex > 0) {
    ctx.globalAlpha = 0.22;
    ctx.drawImage(onionCanvas, view.x, view.y, view.width, view.height);
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(native, view.x, view.y, view.width, view.height);
  if (input("show-sockets")?.checked && latest.sockets) {
    ctx.strokeStyle = "#edbc72";
    ctx.fillStyle = "#edbc72";
    ctx.font = `${Math.max(10, 10 * devicePixelRatio)}px monospace`;
    for (const [name, s] of Object.entries(latest.sockets)) {
      if (s.visible === false) continue;
      const x = view.x + (s.x + latest.shake[0]) * view.scale, y = view.y + (s.y + latest.shake[1]) * view.scale;
      ctx.beginPath();
      ctx.moveTo(x - 3, y);
      ctx.lineTo(x + 3, y);
      ctx.moveTo(x, y - 3);
      ctx.lineTo(x, y + 3);
      ctx.stroke();
      ctx.fillText(name, x + 5, y - 4);
    }
  }
  $("time").textContent = `${time.toFixed(2)} / ${runtime.duration.toFixed(2)} s \xB7 f${frameIndex}`;
  input("timeline").value = String(clock.time);
  button("play").textContent = clock.playing ? "\uC77C\uC2DC \uC815\uC9C0" : "\uC7AC\uC0DD";
  const backend = gpu?.status.backend === "webgpu" ? `WebGPU${gpu.status.adapter?.software ? " (\uC18C\uD504\uD2B8\uC6E8\uC5B4 \uC5B4\uB311\uD130)" : ""}` : "CPU";
  const timing = gpu?.timings;
  $("performance").textContent = `${backend} \xB7 \uADF8\uB9AC\uAE30 ${latest.drawMs.toFixed(1)} ms \xB7 \uCE90\uC2DC ${(runtime.cache.bytes / 1048576).toFixed(1)} MiB${timing ? ` \xB7 \uC5C5\uB85C\uB4DC ${timing.upload.toFixed(1)} ms${timing.gpu === null ? "" : ` \xB7 GPU ${timing.gpu.toFixed(1)} ms`}` : ""}`;
  lastFrame = frameIndex;
  lastView = viewKey;
  dirty = false;
}
function shiftNativeCanvas([dx, dy]) {
  if (!dx && !dy) return;
  const w = native.width, h = native.height, copy = shiftedCanvas.getContext("2d");
  copy.clearRect(0, 0, w, h);
  copy.drawImage(native, 0, 0);
  nativeCtx.clearRect(0, 0, w, h);
  nativeCtx.imageSmoothingEnabled = false;
  function spans(size, delta) {
    delta = Math.max(-size, Math.min(size, delta));
    const out = [];
    if (delta > 0) out.push({ src: 0, len: 1, dest: 0, size: delta });
    const start = Math.max(0, delta), end = Math.min(size, size + delta);
    if (end > start) out.push({ src: start - delta, len: end - start, dest: start, size: end - start });
    if (delta < 0) out.push({ src: size - 1, len: 1, dest: size + delta, size: -delta });
    return out;
  }
  for (const x of spans(w, dx)) for (const y of spans(h, dy)) nativeCtx.drawImage(shiftedCanvas, x.src, y.src, x.len, y.len, x.dest, y.dest, x.size, y.size);
}
function animate(now) {
  clock.tick(now, !document.hidden);
  try {
    render();
  } catch (error) {
    const message = String(error);
    if (message !== renderError) {
      status(message, true);
      renderError = message;
    }
    clock.playing = false;
  }
  requestAnimationFrame(animate);
}
new ResizeObserver(() => {
  displaySize();
  dirty = true;
}).observe($("viewport"));
document.addEventListener("visibilitychange", () => clock.suspend());
function labelControl(container, title, control) {
  const label = text("label", title);
  label.append(control);
  container.append(label);
  return label;
}
function choice(container, label, values, value, change) {
  const control = document.createElement("select");
  for (const v of values) {
    const option = text("option", v);
    option.value = v;
    control.append(option);
  }
  control.value = value;
  control.addEventListener("change", () => change(control.value));
  labelControl(container, label, control);
  return control;
}
function numberControl(container, label, value, min, max, change) {
  const control = document.createElement("input");
  Object.assign(control, { type: "number", min: String(min), max: String(max), value: String(value) });
  control.addEventListener("change", () => {
    if (control.checkValidity()) change(Number(control.value));
    else control.reportValidity();
  });
  labelControl(container, label, control);
  return control;
}
function sequenceConversionIssue() {
  if (project.kind === "act") return "ACT \uBC30\uC6B0\uC640 hit-stop\uC740 \uAC1C\uBCC4 \uCE90\uB9AD\uD130\xB7\uD6A8\uACFC cue\uB85C \uAD6C\uC131\uD574\uC57C \uD569\uB2C8\uB2E4.";
  if (project.edits.length || project.pixelStyle?.pixelTracks?.length) return "\uD504\uB808\uC784 \uC88C\uD45C\uC5D0 \uC800\uC7A5\uD55C \uD53D\uC140 \uC218\uC815\uC740 \uD569\uC131 canvas\uC5D0\uC11C \uC704\uCE58\uAC00 \uB2EC\uB77C\uC9C8 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC6D0\uBCF8 \uD504\uB85C\uC81D\uD2B8\uB97C \uC800\uC7A5\uD558\uACE0 \uC218\uC815 \uC804 \uD6A8\uACFC\uC5D0\uC11C \uC2DC\uD000\uC2A4\uB97C \uC2DC\uC791\uD558\uC138\uC694.";
  if (runtime?.mod.meta.actor && project.actor) return "\uD568\uAED8 \uD45C\uC2DC\uD558\uB294 \uBC30\uC6B0\uB294 \uB3C5\uB9BD \uCE90\uB9AD\uD130 cue\uB85C \uCD94\uAC00\uD574\uC57C \uD569\uB2C8\uB2E4. \uD604\uC7AC \uD504\uB85C\uC81D\uD2B8\uB97C \uC800\uC7A5\uD558\uACE0 \uCE90\uB9AD\uD130 \uD3EC\uD568\uC744 \uB048 \uD6A8\uACFC\uC5D0\uC11C \uC2DC\uD000\uC2A4\uB97C \uC2DC\uC791\uD558\uC138\uC694.";
  if (runtime && (!runtime.duration || !runtime.loop && runtime.duration > runtime.mod.meta.duration + 1e-9)) return "0\uCD08 \uD654\uBA74 \uB610\uB294 \uC6D0\uBCF8 \uC218\uBA85 \uC774\uD6C4\uC758 \uB9C8\uC9C0\uB9C9 \uD504\uB808\uC784 \uD640\uB4DC\uB294 cue\uB85C \uC790\uB3D9 \uBCC0\uD658\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC6D0\uBCF8 \uB3D9\uC791 \uAE38\uC774\uC5D0\uC11C \uC2DC\uD000\uC2A4\uB97C \uC2DC\uC791\uD558\uC138\uC694.";
  return "";
}
function renderControls() {
  $("project-name").textContent = project.name;
  button("undo").disabled = !history.canUndo;
  button("redo").disabled = !history.canRedo;
  input("seed").value = String(project.seed);
  input("fps").value = String(project.fps);
  input("duration").value = String(runtime.duration);
  select("background").value = project.bg;
  input("timeline").max = String(runtime.duration);
  input("timeline").step = String(1 / project.fps);
  $("intent").value = project.notes;
  input("intent-ref").value = project.intentRef ?? "";
  $("project-json").value = serializeProject(project);
  const ps = project.pixelStyle;
  select("color-policy").value = ps?.finalColorPolicy ?? "cinematic";
  select("alpha-policy").value = ps?.alpha ?? "coverage";
  select("outline-policy").value = ps?.outline ?? "none";
  select("dither-anchor").value = ps?.dither?.anchor ?? "object";
  select("color-quantization").value = ps?.quantization ?? "nearest";
  select("dither-pattern").value = ps?.dither?.pattern ?? "bayer4";
  input("color-dither-strength").value = String(ps?.colorDitherStrength ?? 1);
  select("palette-preset").value = "custom";
  const atlas = resolveAtlasExportSettings({ trim: true, ...project.exportSettings });
  select("atlas-size").value = String(atlas.maxTextureSize);
  input("atlas-padding").value = String(atlas.padding);
  input("atlas-extrude").value = String(atlas.extrude);
  input("atlas-trim").checked = atlas.trim;
  input("atlas-deduplicate").checked = atlas.deduplicate;
  select("backend").value = project.renderProfile?.backend === "webgpu" ? "webgpu" : "cpu";
  const conversionIssue = sequenceConversionIssue();
  button("new-sequence").disabled = project.kind === "sequence" || !!conversionIssue;
  button("new-sequence").textContent = conversionIssue ? "\uD604\uC7AC \uD504\uB85C\uC81D\uD2B8\uC758 \uC2DC\uD000\uC2A4 \uBCC0\uD658 \uC81C\uD55C" : "+ \uD604\uC7AC \uD6A8\uACFC\uB85C \uC2DC\uD000\uC2A4 \uC81C\uC791";
  button("new-sequence").title = conversionIssue;
  let conversionNote = $("sequence-conversion-note");
  if (!conversionNote) {
    conversionNote = text("p", "");
    conversionNote.id = "sequence-conversion-note";
    button("new-sequence").after(conversionNote);
  }
  conversionNote.hidden = !conversionIssue;
  conversionNote.textContent = conversionIssue;
  $("target-label").hidden = project.kind !== "character";
  renderParameters();
  renderLayers();
  renderPath();
  renderCurve();
  renderCharacter();
  renderSequence();
  renderPalette();
  renderMarkers();
  search();
}
function renderParameters() {
  const container = $("parameters");
  container.replaceChildren();
  if (project.kind !== "recipe") {
    const options = project.options;
    for (const [key, value] of Object.entries(runtime?.mod.meta.options ?? {})) {
      if (["actor", "seed", "actorSelection", "layers"].includes(key)) continue;
      if (typeof value === "number") numberControl(container, key, options[key] ?? value, -1e4, 1e4, (v) => attempt(() => mutate((p) => {
        p.options[key] = v;
      })));
      else if (typeof value === "boolean") choice(container, key, ["false", "true"], String(options[key] ?? value), (v) => attempt(() => mutate((p) => {
        p.options[key] = v === "true";
      })));
    }
    if (project.kind === "act") {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = project.actor;
      checkbox.onchange = () => attempt(() => mutate((p) => {
        p.actor = checkbox.checked;
      }));
      labelControl(container, "\uCE90\uB9AD\uD130 \uD3EC\uD568", checkbox);
      const importActor = text("button", "\uCE90\uB9AD\uD130 \uD30C\uC77C \uC5F0\uACB0");
      importActor.onclick = () => {
        const file = document.createElement("input");
        file.type = "file";
        file.accept = ".json";
        file.onchange = () => attempt(async () => {
          const selected = file.files?.[0];
          if (!selected) return;
          const data = JSON.parse(await selected.text()), asset = createCharacterAsset2D(data.schema === "poku.project/v1" ? data.character : data);
          await mutate((p) => {
            p.actor = true;
            p.options.actorSelection = { kind: "asset", asset, clip: asset.defaultClip, attachment: "auto" };
          });
        });
        file.click();
      };
      container.append(importActor);
      const selection = project.options.actorSelection;
      if (selection?.kind === "asset") {
        choice(container, "\uBC30\uC6B0 \uD074\uB9BD", Object.keys(selection.asset.clips), selection.clip ?? selection.asset.defaultClip, (clip) => attempt(() => mutate((p) => {
          p.options.actorSelection.clip = clip;
        })));
        choice(container, "\uC774\uD399\uD2B8 \uBD80\uCC29 \uAE30\uC900", ["auto", "root", "hand", "head", "chest"], selection.attachment ?? "auto", (attachment) => attempt(() => mutate((p) => {
          p.options.actorSelection.attachment = attachment;
        })));
      }
    }
    return;
  }
  const values = project.recipe.parameters, groups = /* @__PURE__ */ new Map();
  for (const parameter of recipeParameters(project.recipe)) {
    let group = groups.get(parameter.group ?? "\uC77C\uBC18");
    if (!group) {
      group = document.createElement("fieldset");
      group.append(text("legend", parameter.group ?? "\uC77C\uBC18"));
      groups.set(parameter.group ?? "\uC77C\uBC18", group);
      container.append(group);
    }
    const update = (value) => attempt(() => mutate((p) => {
      p.recipe.parameters[parameter.key] = value;
      if (parameter.key === "palette") p.options.palette = value;
      if (parameter.key === "travel" && p.recipe.kind === "thrown-blade") {
        const required = Number(value) + 0.94 * (p.recipe.timeScale ?? 1);
        if (required > p.recipe.duration) {
          const ratio = required / p.recipe.duration;
          for (const keys of Object.values(p.recipe.tracks)) for (const key of keys) {
            key.time *= ratio;
            if (key.velocity !== void 0) key.velocity /= ratio;
          }
          p.recipe.duration = required;
          p.seconds = required;
        }
      }
    }));
    if (parameter.type === "number") {
      const slider = document.createElement("input"), value = text("span", `${values[parameter.key]} ${parameter.unit ?? ""}`);
      Object.assign(slider, { type: "range", min: String(parameter.min), max: String(parameter.max), step: String(parameter.step ?? 1), value: String(values[parameter.key]) });
      slider.dataset.parameter = parameter.key;
      const label = labelControl(group, parameter.label, slider);
      label.prepend(value);
      slider.oninput = () => {
        value.textContent = `${slider.value} ${parameter.unit ?? ""}`;
      };
      slider.onchange = () => update(Number(slider.value));
    } else if (parameter.type === "enum") choice(group, parameter.label, parameter.choices.map(String), values[parameter.key], update);
    else if (parameter.type === "color-ramp") {
      const row = document.createElement("div");
      row.className = "palette";
      values[parameter.key].forEach((color, i) => {
        const c = document.createElement("input");
        c.type = "color";
        c.value = color;
        c.title = `${parameter.label} ${i + 1}`;
        c.onchange = () => {
          const ramp = [...values[parameter.key]];
          ramp[i] = c.value;
          update(ramp);
        };
        row.append(c);
      });
      labelControl(group, parameter.label, row);
    }
  }
}
function scaleDuration(p, seconds) {
  if (p.recipe) p.recipe = retimeRecipeSpec(p.recipe, seconds);
  if (p.sequence) p.sequence.duration = seconds;
  p.seconds = seconds;
}
function renderLayers() {
  const container = $("layers");
  container.replaceChildren();
  if (project.kind !== "recipe") {
    container.append(text("p", "\uCE90\uB9AD\uD130 \uC7A5\uBE44 \uB610\uB294 JSON\uC758 \uB808\uC774\uC5B4 \uC124\uC815\uC744 \uC0AC\uC6A9\uD558\uC138\uC694."));
    return;
  }
  for (const layer of RECIPE_LAYERS) {
    const row = document.createElement("div"), checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = project.recipe.layers[layer] !== false;
    labelControl(row, layerNames[layer], checkbox);
    checkbox.onchange = () => attempt(() => mutate((p) => {
      p.recipe.layers[layer] = p.layers[layer] = checkbox.checked;
    }));
    const solo = text("button", "\uB2E8\uB3C5");
    solo.onclick = () => attempt(() => mutate((p) => {
      const isSolo = RECIPE_LAYERS.every((l) => p.recipe.layers[l] === (l === layer));
      for (const l of RECIPE_LAYERS) p.recipe.layers[l] = p.layers[l] = isSolo || l === layer;
    }));
    row.append(solo);
    container.append(row);
  }
}
function renderPalette() {
  const container = $("palette-swatches");
  container.replaceChildren();
  for (const [i, color] of (project.pixelStyle?.palette ?? []).entries()) {
    const swatch = document.createElement("input");
    swatch.type = "color";
    swatch.value = toHex(color).slice(0, 7);
    swatch.title = `\uD314\uB808\uD2B8 ${i + 1}`;
    swatch.onchange = () => attempt(() => mutate((p) => {
      p.pixelStyle.palette[i] = hex(swatch.value) >>> 0;
    }));
    container.append(swatch);
  }
}
function renderSequence() {
  const container = $("sequence-controls");
  container.replaceChildren();
  if (project.kind !== "sequence") return;
  container.append(text("h2", "\uD6A8\uACFC \uC2DC\uD000\uC2A4"), text("p", "\uC67C\uCABD \uB77C\uC774\uBE0C\uB7EC\uB9AC\uC758 + \uBC84\uD2BC\uC73C\uB85C \uD6A8\uACFC\uB97C \uCD94\uAC00\uD558\uC138\uC694. \uAC19\uC740 \uC55E/\uB4A4 \uB808\uC774\uC5B4 \uC548\uC5D0\uC11C \uBAA9\uB85D \uC21C\uC11C\uB85C \uACB9\uCE69\uB2C8\uB2E4."));
  const spec = project.sequence, loop = document.createElement("input");
  loop.type = "checkbox";
  loop.checked = spec.loop;
  loop.onchange = () => attempt(() => mutate((p) => {
    p.sequence.loop = loop.checked;
  }));
  labelControl(container, "\uC2DC\uD000\uC2A4 \uBC18\uBCF5", loop);
  const auto = text("button", "\uB9C8\uC9C0\uB9C9 \uD6A8\uACFC\uAE4C\uC9C0 \uAE38\uC774 \uC790\uB3D9 \uB9DE\uCDA4");
  auto.onclick = () => attempt(() => mutate((p) => {
    delete p.sequence.duration;
    delete p.seconds;
  }));
  container.append(auto);
  for (const [i, cue] of spec.cues.entries()) {
    const details = document.createElement("details");
    details.className = "sequence-cue";
    details.open = true;
    const title = cue.source.kind === "catalog" ? cue.source.id : cue.source.kind === "recipe" ? cue.source.recipe.kind : cue.source.character.name;
    details.append(text("summary", `${i + 1}. ${title}`));
    container.append(details);
    const change = (edit) => attempt(() => mutate((p) => {
      edit(p.sequence.cues[i]);
    }));
    const active = document.createElement("input");
    active.type = "checkbox";
    active.checked = cue.enabled;
    active.onchange = () => change((c) => {
      c.enabled = active.checked;
    });
    labelControl(details, "\uD45C\uC2DC", active);
    for (const [key, label, min, max] of [["at", "\uC2DC\uC791 (\uCD08)", 0, 3600], ["x", "X (\uD53D\uC140)", -4096, 4096], ["y", "Y (\uD53D\uC140)", -4096, 4096], ["fadeIn", "\uB098\uD0C0\uB0A8 (\uCD08)", 0, 60], ["fadeOut", "\uC0AC\uB77C\uC9D0 (\uCD08)", 0, 60]]) {
      const n = numberControl(details, label, cue[key], min, max, (value) => change((c) => {
        c[key] = value;
      }));
      n.step = key === "x" || key === "y" ? "1" : ".01";
    }
    const duration = document.createElement("input");
    Object.assign(duration, { type: "number", min: ".01", max: "3600", step: ".01", placeholder: "\uC6D0\uBCF8 \uAE38\uC774", value: cue.duration === void 0 ? "" : String(cue.duration) });
    duration.onchange = () => {
      if (duration.checkValidity()) change((c) => {
        if (duration.value === "") delete c.duration;
        else c.duration = Number(duration.value);
      });
      else duration.reportValidity();
    };
    labelControl(details, "\uD45C\uC2DC \uC2DC\uAC04 (\uCD08)", duration);
    const angle = numberControl(details, "\uD68C\uC804 (\uB3C4)", cue.angle * 180 / Math.PI, -3600, 3600, (value) => change((c) => {
      c.angle = value * Math.PI / 180;
    }));
    angle.step = "1";
    const flip = document.createElement("input");
    flip.type = "checkbox";
    flip.checked = cue.flip;
    flip.onchange = () => change((c) => {
      c.flip = flip.checked;
    });
    labelControl(details, "\uC88C\uC6B0 \uBC18\uC804", flip);
    for (const [label, offset] of [["\uB4A4\uB85C", -1], ["\uC55E\uC73C\uB85C", 1]]) {
      const move = text("button", label);
      move.disabled = i + offset < 0 || i + offset >= spec.cues.length;
      move.onclick = () => attempt(() => mutate((p) => {
        const a = p.sequence.cues;
        [a[i], a[i + offset]] = [a[i + offset], a[i]];
      }));
      details.append(move);
    }
    const remove = text("button", "\uD6A8\uACFC \uC81C\uAC70");
    remove.onclick = () => attempt(() => mutate((p) => {
      p.sequence.cues.splice(i, 1);
    }));
    details.append(remove);
  }
}
function renderPath() {
  const container = $("path-fields");
  container.replaceChildren();
  if (project.recipe?.kind !== "thrown-blade") return;
  project.recipe.path.forEach((point, i) => {
    const row = document.createElement("div");
    row.className = "path-row";
    point.forEach((v, axis) => numberControl(row, `P${i} ${axis ? "Y" : "X"}`, v, -2048, 2048, (value) => attempt(() => mutate((p) => {
      p.recipe.path[i][axis] = value;
    }))));
    container.append(row);
  });
}
var curveDraft;
var curveDrag = -1;
var curveCanvas = $("curve");
var curveCtx = curveCanvas.getContext("2d");
function renderCurve() {
  const keys = curveDraft ?? project.recipe?.tracks[select("track").value];
  curveCtx.clearRect(0, 0, 260, 110);
  curveCtx.strokeStyle = "#29343d";
  curveCtx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    curveCtx.beginPath();
    curveCtx.moveTo(0, i * 25 + 5);
    curveCtx.lineTo(260, i * 25 + 5);
    curveCtx.stroke();
  }
  if (!keys) {
    curveCtx.fillStyle = "#8c9ca5";
    curveCtx.font = "11px system-ui";
    curveCtx.fillText("\uB808\uC2DC\uD53C\uC5D0\uC11C \uC2DC\uAC04 \uACE1\uC120\uC744 \uD3B8\uC9D1\uD569\uB2C8\uB2E4.", 14, 56);
    return;
  }
  const duration = project.recipe.duration, curve = createTimingCurve(keys);
  curveCtx.beginPath();
  for (let x = 0; x < 260; x++) {
    const y = 102 - curve.sample(x / 259 * duration).value * 94;
    x ? curveCtx.lineTo(x, y) : curveCtx.moveTo(x, y);
  }
  curveCtx.strokeStyle = "#b9e6d0";
  curveCtx.lineWidth = 2;
  curveCtx.stroke();
  for (const key of keys) {
    curveCtx.fillStyle = "#e5ab70";
    curveCtx.fillRect(key.time / duration * 252 + 2, 102 - key.value * 94 - 3, 6, 6);
  }
}
function curvePosition(event) {
  const r = curveCanvas.getBoundingClientRect();
  return { time: Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)) * project.recipe.duration, value: Math.max(0, Math.min(1, (102 - (event.clientY - r.top) / r.height * 110) / 94)) };
}
curveCanvas.onpointerdown = (event) => {
  if (!project.recipe || event.button !== 0) return;
  const pos = curvePosition(event);
  curveDraft = cloneJSON(project.recipe.tracks[select("track").value]);
  curveDrag = curveDraft.findIndex((k) => Math.abs(k.time - pos.time) < project.recipe.duration * 0.035);
  if (curveDrag < 0) {
    curveDraft.push(pos);
    curveDraft.sort((a, b) => a.time - b.time);
    curveDrag = curveDraft.indexOf(pos);
  }
  curveCanvas.setPointerCapture(event.pointerId);
  renderCurve();
};
curveCanvas.onpointermove = (event) => {
  if (!curveDraft || curveDrag < 0) return;
  const pos = curvePosition(event), before = curveDraft[curveDrag - 1]?.time ?? -1e-3, after = curveDraft[curveDrag + 1]?.time ?? project.recipe.duration + 1e-3;
  curveDraft[curveDrag] = { time: Math.max(before + 1e-3, Math.min(after - 1e-3, pos.time)), value: pos.value };
  renderCurve();
};
curveCanvas.onpointerup = () => {
  if (!curveDraft) return;
  const keys = curveDraft;
  curveDraft = void 0;
  curveDrag = -1;
  attempt(() => mutate((p) => {
    p.recipe.tracks[select("track").value] = keys;
  }));
};
curveCanvas.oncontextmenu = (event) => {
  event.preventDefault();
  if (!project.recipe) return;
  const pos = curvePosition(event), keys = project.recipe.tracks[select("track").value], index = keys.findIndex((k) => Math.abs(k.time - pos.time) < project.recipe.duration * 0.04);
  if (index >= 0 && keys.length > 2) attempt(() => mutate((p) => {
    p.recipe.tracks[select("track").value].splice(index, 1);
  }));
};
select("track").onchange = renderCurve;
function renderCharacter() {
  const container = $("character-controls");
  container.replaceChildren();
  if (project.kind !== "character") return;
  const asset = runtime.mod.character, clip = project.options.clip ?? asset.defaultClip;
  choice(container, "\uC560\uB2C8\uBA54\uC774\uC158", Object.keys(asset.clips), clip, (value) => attempt(() => mutate((p) => {
    p.options.clip = value;
    delete p.seconds;
  })));
  const alter = (change) => attempt(() => mutate((p) => {
    p.character = change(p.character);
    delete p.seconds;
  }));
  if (asset.source.kind === "human") {
    const style = asset.source.style;
    for (const [key, label, choices, fallback] of [
      ["view", "\uC2DC\uC810", ["front", "three-quarter", "side", "back"], "three-quarter"],
      ["facing", "\uBC29\uD5A5", ["right", "left"], "right"],
      ["build", "\uCCB4\uD615", ["slender", "regular", "broad"], "regular"],
      ["hair", "\uBA38\uB9AC", ["crop", "bob", "curls", "swept", "bun", "shaved", "ponytail", "parted"], "bob"],
      ["outfit", "\uC758\uC0C1", ["shirt", "tunic", "jacket", "sleeveless", "sweater", "overalls"], "jacket"],
      ["skin", "\uD53C\uBD80", ["light", "warm", "brown", "deep"], "warm"],
      ["faceShape", "\uC5BC\uAD74", ["oval", "round", "square", "long"], "oval"],
      ["facialHair", "\uC218\uC5FC", ["none", "beard"], "none"]
    ]) choice(container, label, choices, style[key] ?? fallback, (value) => alter((a) => {
      const nextStyle = { ...a.source.style, [key]: value }, trait = key === "hair" ? "hair" : key === "outfit" ? "clothing" : key === "faceShape" ? "face" : void 0;
      const identity = a.identity ? { ...a.identity, body: nextStyle, portrait: { ...a.identity.portrait, ...trait ? { [trait]: createCharacterIdentity2D(a.id, a.name, nextStyle).portrait[trait] } : {} } } : void 0;
      return createCharacterAsset2D({ ...a, source: { kind: "human", style: nextStyle }, ...identity ? { identity } : {} });
    }));
    container.append(text("p", `\uAE30\uBCF8 \uB192\uC774 ${asset.nativeHeight}px \xB7 \uC0C8 \uCE90\uB9AD\uD130\uC758 \uD574\uC0C1\uB3C4\uB294 \uC67C\uCABD\uC5D0\uC11C \uC120\uD0DD\uD569\uB2C8\uB2E4.`));
  }
  for (const slot of asset.slots ?? []) {
    const items = Object.values(asset.equipment ?? {}).filter((item) => item.slots.includes(slot.id)).map((item) => item.id), overrides = asset.clips[clip].loadout;
    const selected = (overrides && Object.hasOwn(overrides, slot.id) ? overrides[slot.id] : asset.loadout?.[slot.id]) ?? "";
    choice(container, `\uC7A5\uBE44 \xB7 ${slot.id}`, ["", ...items], selected, (value) => alter((a) => createCharacterAsset2D({ ...a, clips: { ...a.clips, [clip]: { ...a.clips[clip], loadout: { ...a.clips[clip].loadout, [slot.id]: value || null } } } })));
  }
  const loadout = { ...asset.loadout, ...asset.clips[clip].loadout }, layers = [...asset.layers ?? [], ...(asset.slots ?? []).flatMap((slot) => loadout[slot.id] ? asset.equipment[loadout[slot.id]].layers : [])].filter((layer) => !layer.visibleIn || layer.visibleIn.includes(clip));
  const target = select("edit-target"), oldTarget = target.value;
  target.replaceChildren();
  for (const name of ["body", ...layers.map((layer) => layer.id)]) {
    const option = text("option", name);
    option.value = name;
    target.append(option);
  }
  target.value = [...target.options].some((o) => o.value === oldTarget) ? oldTarget : "body";
  const rasterLayers = layers.filter((layer) => !layer.generator);
  if (rasterLayers.length) {
    const details = document.createElement("details");
    details.append(text("summary", "\uC7A5\uBE44 \uC560\uB2C8\uBA54\uC774\uC158 \uB3D9\uAE30\uD654"));
    container.append(details);
    for (const layer of rasterLayers) {
      const binding = layer.animations?.[clip], update = (key, value) => alter((a) => {
        const copy = cloneJSON(a);
        const all = [...copy.layers ?? [], ...Object.values(copy.equipment ?? {}).flatMap((e) => e.layers)];
        const item = all.find((l) => l.id === layer.id);
        item.animations = { ...item.animations, [clip]: { ...item.animations?.[clip], [key]: value } };
        if (key === "tag" && !value || key === "sync" && value === "source-frame") delete item.animations[clip].tag;
        return createCharacterAsset2D(copy);
      });
      const body = asset.clips[clip], bodyData = body.kind === "sprite" ? body.data ?? (asset.source.kind === "sprite" ? asset.source.clip : void 0) : void 0;
      const modes = bodyData?.frames.length === layer.clip.frames.length ? ["time", "phase", "source-frame"] : ["time", "phase"];
      const sync = choice(details, `${layer.id} \xB7 \uB3D9\uAE30\uD654`, modes, binding?.sync ?? "time", (value) => update("sync", value));
      for (const option of sync.options) option.textContent = { time: "\uB3C5\uB9BD \uC2DC\uAC04", phase: "\uBAB8\uCCB4 \uC8FC\uAE30 \uB9DE\uCDA4", "source-frame": "\uBAB8\uCCB4 \uC6D0\uD654 \uBC88\uD638" }[option.value];
      const tags = layer.clip.tags?.map((tag) => tag.name) ?? [];
      if (tags.length) {
        const tag = choice(details, `${layer.id} \xB7 \uD0DC\uADF8`, ["", ...tags], binding?.tag ?? "", (value) => update("tag", value));
        tag.options[0].textContent = "\uAE30\uBCF8 \uD0DC\uADF8";
        tag.disabled = binding?.sync === "source-frame";
      }
    }
  }
  $("target-label").hidden = false;
  const sockets = document.createElement("input");
  sockets.id = "show-sockets";
  sockets.type = "checkbox";
  sockets.checked = showSockets;
  sockets.onchange = () => {
    showSockets = sockets.checked;
    dirty = true;
  };
  labelControl(container, "\uAD00\uC808\xB7\uC7A5\uCC29\uC810 \uD45C\uC2DC", sockets);
  renderCharacterTimeline(container, asset, clip, alter);
  renderSocketEditor(container, asset, clip, alter);
  if (asset.identity) {
    const portrait = text("button", "\uACF5\uC720 \uD314\uB808\uD2B8 \uCD08\uC0C1\uD654 PNG");
    portrait.onclick = () => attempt(async () => {
      const sprite = renderCharacterPortrait2D(asset.identity, { resolution: 128 }), rgba = new Uint8ClampedArray(sprite.w * sprite.h * 4);
      for (let i = 0; i < sprite.pixels.length; i++) {
        const c = sprite.pixels[i];
        rgba.set([c & 255, c >>> 8 & 255, c >>> 16 & 255, c >>> 24], i * 4);
      }
      download(`${asset.id}-portrait.png`, await encodeRGBAPNG(sprite.w, sprite.h, rgba));
    });
    container.append(portrait);
  }
}
function renderCharacterTimeline(container, asset, clipName, alter) {
  const details = document.createElement("details");
  details.open = clipDetailsOpen;
  details.ontoggle = () => {
    clipDetailsOpen = details.open;
  };
  details.append(text("summary", "\uD074\uB9BD \uC2DC\uAC04 \xB7 \uD0A4 \uD3EC\uC988 \xB7 \uC0AC\uAC74"));
  container.append(details);
  const clip = asset.clips[clipName], info = runtime.mod.player.clipInfo(clipName);
  const change = (edit) => alter((a) => {
    const next = cloneJSON(a.clips[clipName]);
    edit(next);
    return createCharacterAsset2D({ ...a, clips: { ...a.clips, [clipName]: next } });
  });
  numberControl(details, "\uC6D0\uD654 \uAC31\uC2E0 FPS", clip.fps ?? 60, 1, 240, (value) => change((c) => {
    c.fps = value;
  }));
  if (clip.kind === "key-pose") {
    clip.poses.keys.forEach((key, i) => {
      const row = document.createElement("div");
      row.className = "key-row";
      const at = numberControl(row, `\uD0A4 ${i} \xB7 \uCD08`, key.at, 0, info.duration, (value) => change((c) => {
        c.poses.keys[i].at = value;
        c.poses.keys.sort((a, b) => a.at - b.at);
      }));
      at.step = "0.001";
      if (i === 0) at.disabled = true;
      choice(row, "\uB2E4\uC74C \uD0A4\uAE4C\uC9C0", ["hold", "linear", "smooth"], key.interpolation ?? "smooth", (value) => change((c) => {
        c.poses.keys[i].interpolation = value;
      }));
      details.append(row);
    });
    for (const [i, key] of (clip.poses.contacts ?? []).entries()) {
      const row = document.createElement("div");
      row.className = "key-row";
      const at = numberControl(row, "\uBC1C \uC811\uCD09 \xB7 \uCD08", key.at, 0, info.duration, (value) => change((c) => {
        c.poses.contacts[i].at = value;
        c.poses.contacts.sort((a, b) => a.at - b.at);
      }));
      at.step = "0.001";
      for (const foot of ["left", "right"]) {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = key[foot];
        checkbox.onchange = () => change((c) => {
          c.poses.contacts[i][foot] = checkbox.checked;
        });
        labelControl(row, foot === "left" ? "\uC67C\uBC1C \uACE0\uC815" : "\uC624\uB978\uBC1C \uACE0\uC815", checkbox);
      }
      details.append(row);
    }
  }
  const events = info.events;
  events.forEach((event, i) => {
    const row = document.createElement("div");
    row.className = "key-row";
    const at = numberControl(row, `${event.kind} \xB7 ${event.id}`, event.at, 0, info.loop ? Math.max(0, info.duration - 1 / project.fps) : info.duration, (value) => change((c) => {
      c.events = cloneJSON(events);
      c.events[i].at = value;
    }));
    at.step = "0.001";
    const remove = text("button", "\uC0AC\uAC74 \uC0AD\uC81C");
    remove.onclick = () => change((c) => {
      c.events = cloneJSON(events.filter((_, j) => j !== i));
    });
    row.append(remove);
    details.append(row);
  });
  const add = text("button", "\uD604\uC7AC \uC2DC\uC810\uC5D0 \uC811\uCD09 \uC0AC\uAC74 \uCD94\uAC00");
  add.onclick = () => change((c) => {
    c.events = [...cloneJSON(events), { id: `contact-${crypto.randomUUID()}`, kind: "contact", at: Math.min(Math.floor(clock.time * project.fps) / project.fps, info.loop ? Math.max(0, info.duration - 1 / project.fps) : info.duration), socket: "hand.grip" }];
  });
  details.append(add);
}
function renderSocketEditor(container, asset, clipName, alter) {
  const details = document.createElement("details");
  details.open = socketDetailsOpen;
  details.ontoggle = () => {
    socketDetailsOpen = details.open;
  };
  details.append(text("summary", "\uC18C\uCF13 \uD0A4 \uD3B8\uC9D1"));
  container.append(details);
  const refresh = text("button", "\uD604\uC7AC \uD504\uB808\uC784\uC5D0\uC11C \uC18C\uCF13 \uD3B8\uC9D1"), fields = document.createElement("div");
  details.append(refresh, fields);
  refresh.onclick = () => {
    clock.playing = false;
    clock.seek(Math.floor(clock.time * project.fps + 1e-6) / project.fps);
    dirty = true;
    populate();
  };
  function populate() {
    fields.replaceChildren();
    const player = runtime.mod.player, info = player.clipInfo(clipName), clip = asset.clips[clipName], displayTime = Math.floor(clock.time * project.fps + 1e-6) / project.fps;
    const base = player.sample(displayTime, clipName, { ignoreSocketTracks: true }), current = player.sample(displayTime, clipName), t = current.phaseTime, names = [.../* @__PURE__ */ new Set([...Object.keys(base.sockets), ...Object.keys(current.sockets), ...Object.keys(clip.socketTracks ?? {})])];
    if (!names.includes(selectedSocket)) selectedSocket = names[0] ?? "root";
    choice(fields, "\uC18C\uCF13", names, selectedSocket, (value) => {
      selectedSocket = value;
      populate();
    });
    const name = selectedSocket, track = clip.socketTracks?.[name], mode = track?.mode ?? (base.sockets[name] ? newSocketMode : "override"), sampled = track ? sampleCharacterSocketTrack2D(track, t) : null, baseline = base.sockets[name] ?? current.sockets[name] ?? { position: [0, 0], basisX: [1, 0], basisY: [0, 1], visible: true };
    const modeControl = choice(fields, "\uC88C\uD45C \uAE30\uC900", ["delta", "override"], mode, (value) => {
      newSocketMode = value;
      populate();
    });
    modeControl.disabled = !!track;
    const key = { ...sampled ?? {}, at: t }, position = key.position ?? (mode === "delta" ? [0, 0] : [baseline.position[0], baseline.position[1]]);
    fields.append(text("p", `${t.toFixed(3)}s \uD0A4 \xB7 ${mode === "delta" ? "\uC6C0\uC9C1\uC774\uB294 \uC18C\uCF13 \uAE30\uC900 \uBCF4\uC815" : "\uCE90\uB9AD\uD130 \uAE30\uC900 \uC808\uB300 \uC704\uCE58"}`));
    const write = (edit) => {
      clock.playing = false;
      const next = cloneJSON(key);
      edit(next);
      if (next.position === void 0 && next.angle === void 0 && next.basisX === void 0 && next.visible === void 0) next.position = [position[0], position[1]];
      alter((a) => setCharacterSocketKey2D(a, clipName, name, next, mode));
    };
    for (const axis of [0, 1]) {
      const control = numberControl(fields, axis ? "\uC704\uCE58 Y" : "\uC704\uCE58 X", position[axis], -4096, 4096, (value) => write((k) => {
        const v = [position[0], position[1]];
        v[axis] = value;
        k.position = v;
      }));
      control.step = "0.25";
    }
    if (key.basisX && key.basisY) fields.append(text("p", "\uC774 \uD0A4\uB294 \uBC29\uD5A5 \uD589\uB82C\uC744 \uC0AC\uC6A9\uD569\uB2C8\uB2E4. basis\uC640 \uBC18\uC0AC \uC815\uCC45\uC740 \uD504\uB85C\uC81D\uD2B8 JSON\uC5D0\uC11C \uD3B8\uC9D1\uD569\uB2C8\uB2E4."));
    else {
      const angle = numberControl(fields, "\uD68C\uC804 (\uB3C4)", (key.angle ?? (mode === "delta" ? 0 : Math.atan2(baseline.basisX[1], baseline.basisX[0]))) * 180 / Math.PI, -3600, 3600, (value) => write((k) => {
        k.angle = value * Math.PI / 180;
      }));
      angle.step = "1";
    }
    const visibility = document.createElement("input");
    visibility.type = "checkbox";
    visibility.checked = key.visible ?? baseline.visible;
    visibility.onchange = () => write((k) => {
      k.visible = visibility.checked;
    });
    labelControl(fields, "\uC18C\uCF13\uACFC \uBD80\uCC29 \uC7A5\uBE44 \uD45C\uC2DC", visibility);
    choice(fields, "\uB2E4\uC74C \uD0A4\uAE4C\uC9C0", ["hold", "linear"], key.interpolation ?? "hold", (value) => write((k) => {
      k.interpolation = value;
    }));
    const save = text("button", "\uD604\uC7AC \uAC12\uC73C\uB85C \uD0A4 \uC800\uC7A5");
    save.onclick = () => write((k) => {
      k.position = [position[0], position[1]];
    });
    fields.append(save);
    const remove = text("button", "\uD604\uC7AC \uD0A4 \uC0AD\uC81C");
    remove.disabled = !track?.keys.some((k) => Math.abs(k.at - t) < 1e-8);
    remove.onclick = () => alter((a) => {
      const c = cloneJSON(a.clips[clipName]), tracks = { ...c.socketTracks }, current2 = tracks[name];
      if (!current2) return a;
      const keys = current2.keys.filter((k) => Math.abs(k.at - t) >= 1e-8);
      if (keys.length) tracks[name] = { ...current2, keys };
      else delete tracks[name];
      return createCharacterAsset2D({ ...a, clips: { ...a.clips, [clipName]: { ...c, socketTracks: tracks } } });
    });
    fields.append(remove);
  }
  if (socketDetailsOpen) populate();
}
function renderMarkers() {
  const container = $("markers");
  container.replaceChildren();
  const contacts = runtime?.contacts ?? [], events = runtime?.events ?? [];
  for (const event of [...contacts.map((c) => ({ at: c.at, label: `\uC811\uCD09 \xB7 ${c.material}` })), ...events.map((e) => ({ at: e.sourceTime ?? e.t ?? e.at ?? e.time, label: e.id ?? e.kind ?? e.type ?? "\uC0AC\uAC74" }))].filter((e) => Number.isFinite(e.at))) {
    const elapsed = runtime.markerTime(event.at);
    if (elapsed === void 0) continue;
    const b = text("button", `${event.label} \xB7 ${elapsed.toFixed(2)}s`);
    b.dataset.sourceTime = String(event.at);
    b.dataset.elapsedTime = String(elapsed);
    b.dataset.frame = String(Math.round(elapsed * project.fps));
    b.onclick = () => {
      clock.playing = false;
      clock.seek(elapsed);
      dirty = true;
    };
    container.append(b);
  }
}
for (const kind of RECIPE_KINDS) {
  const b = document.createElement("button");
  b.append(text("b", labels[kind][0]), text("span", labels[kind][1]));
  b.onclick = () => attempt(() => setProject(recipeProject(kind), "commit", false));
  $("recipes").append(b);
}
button("new-character").onclick = () => attempt(() => setProject(createProject({ id: "characters/wayfarer", name: "Wayfarer", kind: "character", character: createStudioCharacter2D({ height: Number(select("new-character-height").value) }), options: { clip: "idle" }, bg: "dark", fps: 24, actor: false, target: false }), "commit", false));
button("new-sequence").onclick = () => attempt(async () => {
  if (project.kind === "sequence") return;
  const issue = sequenceConversionIssue();
  if (issue) throw new Error(issue);
  const source = project.kind === "recipe" ? { kind: "recipe", recipe: project.recipe } : project.kind === "character" ? { kind: "character", character: project.character, clip: project.options.clip ?? project.character.defaultClip } : { kind: "catalog", id: project.id };
  const effective = { ...runtime.mod.meta.options, ...project.options }, placement = Object.fromEntries(["x", "y", "angle", "flip", "cameraMotion"].filter((key) => effective[key] !== void 0).map((key) => [key, effective[key]]));
  const settings = Object.fromEntries(["margin", "cameraMotion", "intentRef", "sourceRevision"].filter((key) => project[key] !== void 0).map((key) => [key, project[key]]));
  await setProject(createProject({ id: "sequences/composite", name: `${project.name} \xB7 \uC2DC\uD000\uC2A4`, kind: "sequence", seed: project.seed, fps: project.fps, bg: project.bg, notes: project.notes, actor: false, target: false, options: placement, ...settings, ...project.pixelStyle ? { pixelStyle: project.pixelStyle } : {}, ...project.renderProfile ? { renderProfile: project.renderProfile } : {}, ...project.exportSettings ? { exportSettings: project.exportSettings } : {}, sequence: createSequenceSpec({ duration: runtime.duration, loop: runtime.loop, cues: [{ id: "source", source, seed: project.seed, duration: runtime.duration, options: { ...project.options, layers: project.layers, cameraMotion: 1 }, x: 0, y: 0, angle: 0, flip: false }] }) }), "commit", false);
  search();
});
$("library-count").textContent = String(catalogEntries.length);
function search() {
  const results = $("results");
  results.replaceChildren();
  for (const effect of searchEffects(input("search").value, 20)) {
    const row = document.createElement("div"), b = text("button", String(effect.meta.name ?? effect.id));
    b.append(text("small", effect.id));
    b.onclick = () => attempt(async () => {
      const mod = await loadCatalogEffect(effect.id);
      await setProject(createProject({ id: effect.id, name: String(mod.meta.name ?? effect.id), kind: mod.recipe ? "recipe" : mod.act ? "act" : "2d", options: { ...mod.meta.options }, ...mod.recipe ? { recipe: mod.recipe } : {}, fps: 30, bg: "dark", intentRef: `authoring/${effect.id}.intent.json` }), "commit", false);
      search();
    });
    row.append(b);
    if (project.kind === "sequence") {
      const add = text("button", "+ \uC2DC\uD000\uC2A4\uC5D0 \uCD94\uAC00");
      add.onclick = () => attempt(() => mutate((p) => {
        const cue = createSequenceSpec({ cues: [{ id: `cue-${crypto.randomUUID()}`, source: { kind: "catalog", id: effect.id }, at: Math.floor(clock.time * project.fps) / project.fps }] }).cues[0];
        p.sequence.cues.push(cue);
        delete p.seconds;
        delete p.sequence.duration;
      }));
      row.append(add);
    }
    results.append(row);
  }
}
input("search").oninput = search;
search();
button("play").onclick = () => {
  if (!clock.playing && clock.time >= clock.duration) clock.reset();
  clock.playing = !clock.playing;
  clock.suspend();
  dirty = true;
};
button("restart").onclick = () => {
  clock.reset();
  dirty = true;
};
for (const [id, direction] of [["previous", -1], ["next", 1]]) button(id).onclick = () => {
  clock.playing = false;
  clock.step(direction, project.fps);
  dirty = true;
};
input("timeline").oninput = () => {
  clock.playing = false;
  clock.seek(Number(input("timeline").value));
  dirty = true;
};
select("speed").onchange = () => {
  clock.speed = Number(select("speed").value);
};
for (const id of ["onion", "zoom", "diagnostic"]) $(id).addEventListener("change", () => {
  dirty = true;
});
select("background").onchange = () => attempt(() => mutate((p) => {
  p.bg = select("background").value;
}));
select("backend").onchange = () => attempt(() => mutate((p) => {
  const backend = select("backend").value;
  p.renderProfile = { ...p.renderProfile, backend, mode: backend === "webgpu" ? "cinematic" : p.renderProfile?.mode ?? "legacy" };
}));
input("seed").onchange = () => attempt(() => mutate((p) => {
  p.seed = Number(input("seed").value);
  if (p.recipe) p.recipe.seed = p.seed;
}));
input("fps").onchange = () => attempt(() => mutate((p) => {
  p.fps = Number(input("fps").value);
}));
input("duration").onchange = () => attempt(() => mutate((p) => {
  scaleDuration(p, Number(input("duration").value));
}));
$("intent").onchange = () => attempt(() => mutate((p) => {
  p.notes = $("intent").value;
}));
input("intent-ref").onchange = () => attempt(() => mutate((p) => {
  p.intentRef = input("intent-ref").value;
  if (p.recipe) p.recipe.intentRef = p.intentRef;
}));
for (const id of ["color-policy", "alpha-policy", "outline-policy", "dither-anchor", "color-quantization", "dither-pattern", "color-dither-strength"]) $(id).onchange = () => attempt(() => mutate((p) => {
  const locked = select("color-policy").value === "palette-locked";
  const current = latest?.frame.color, characterColors = current ? [...new Set(Array.from(current).filter((c) => c >>> 24).map((c) => (c | 4278190080) >>> 0))].slice(0, 256) : [];
  const palette = p.pixelStyle?.palette ?? (p.recipe?.parameters.palette ?? (p.kind === "character" && characterColors.length ? characterColors : ["#172333", "#34526b", "#528a94", "#83b9ad", "#c8e3cf", "#fff0d1"])).map((c) => hex(c) >>> 0);
  p.pixelStyle = createPixelStyleProfile2D({ ...p.pixelStyle, nativeResolution: [runtime.width, runtime.height], surfaceColors: locked ? "indexed" : "authored-rgba", palette, quantization: select("color-quantization").value, colorDitherStrength: Number(input("color-dither-strength").value), finalColorPolicy: locked ? "palette-locked" : "cinematic", emission: locked ? p.pixelStyle?.emission === "none" ? "none" : "palette-stepped" : p.pixelStyle?.emission ?? "linear-hdr", alpha: select("alpha-policy").value, outline: select("outline-policy").value, dither: { ...p.pixelStyle?.dither, pattern: select("dither-pattern").value, anchor: select("dither-anchor").value } });
}));
select("palette-preset").onchange = () => attempt(() => mutate((p) => {
  const palette = PIXEL_PALETTE_PRESETS[select("palette-preset").value];
  if (!palette) return;
  p.pixelStyle = createPixelStyleProfile2D({ ...p.pixelStyle, nativeResolution: [runtime.width, runtime.height], palette: [...palette], surfaceColors: "indexed", quantization: p.pixelStyle?.quantization === "ordered" ? "ordered" : "nearest", finalColorPolicy: "palette-locked", emission: "palette-stepped" });
}));
for (const id of ["atlas-size", "atlas-padding", "atlas-extrude", "atlas-trim", "atlas-deduplicate"]) $(id).onchange = () => attempt(() => mutate((p) => {
  p.exportSettings = resolveAtlasExportSettings({ maxTextureSize: Number(select("atlas-size").value), padding: Number(input("atlas-padding").value), extrude: Number(input("atlas-extrude").value), trim: input("atlas-trim").checked, deduplicate: input("atlas-deduplicate").checked });
}));
button("undo").onclick = () => attempt(() => setProject(history.undo(), "history"));
button("redo").onclick = () => attempt(() => setProject(history.redo(), "history"));
button("save").onclick = () => download(project.id.replace("/", "-") + ".poku-project.json", new Blob([serializeProject(project)], { type: "application/json" }));
button("apply-json").onclick = () => attempt(() => setProject(parseProject($("project-json").value)));
button("open").onclick = () => input("open-file").click();
input("open-file").onchange = () => attempt(async () => {
  const file = input("open-file").files?.[0];
  if (!file) return;
  const data = JSON.parse(await file.text());
  await setProject(data.schema === "poku.recipe-pack/v1" ? data.project : parseProject(JSON.stringify(data)), "commit", false);
  input("open-file").value = "";
});
button("save-frame").onclick = () => attempt(async () => {
  if (!runtime) return;
  const index = Math.floor(clock.time * project.fps + 1e-6), sample = runtime.render(index / project.fps, index), blob = await encodeRGBAPNG(runtime.width, runtime.height, sample.rgba);
  download(project.id.replace("/", "-") + `-f${index}.png`, blob);
});
button("import-review").onclick = () => input("review-file").click();
input("review-file").onchange = () => attempt(async () => {
  const file = input("review-file").files?.[0];
  if (!file) return;
  const review = JSON.parse(await file.text()), container = $("observations");
  container.replaceChildren();
  const observations = observationsFromReview(review);
  for (const o of observations) {
    const range = o.frameRanges[0], b = text("button", `${o.topic}${range ? ` \xB7 f${range.from}\u2013${range.to}` : ""}: ${o.note}`);
    b.onclick = () => {
      clock.playing = false;
      clock.seek(Math.max(0, Math.min(clock.duration, o.time ?? (range?.from ?? 0) / project.fps)));
      if (o.layer && RECIPE_LAYERS.includes(o.layer)) select("track").value = o.layer;
      const control = [...document.querySelectorAll("[data-parameter]")].find((e) => e.dataset.parameter === o.parameter);
      control?.focus();
      renderCurve();
      dirty = true;
    };
    container.append(b);
  }
  if (!observations.length) container.append(text("p", "\uD45C\uC2DC\uD560 \uAD00\uCC30 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."));
  status("\uAC80\uD1A0 \uAE30\uB85D\uC744 \uC5F4\uC5C8\uC2B5\uB2C8\uB2E4. \uAE30\uB85D\uC744 \uD074\uB9AD\uD558\uBA74 \uAD00\uB828 \uC2DC\uC810\uC73C\uB85C \uC774\uB3D9\uD569\uB2C8\uB2E4.");
});
var stroke;
var strokeCells = /* @__PURE__ */ new Set();
var strokeId = "";
var strokeLast;
function paint(event) {
  if (!stroke || !runtime) return;
  const rect = stage.getBoundingClientRect(), sx = (event.clientX - rect.left) * stage.width / rect.width, sy = (event.clientY - rect.top) * stage.height / rect.height;
  const x = Math.floor((sx - view.x) / view.scale), y = Math.floor((sy - view.y) / view.scale);
  if (x < 0 || y < 0 || x >= runtime.width || y >= runtime.height) {
    strokeLast = void 0;
    return;
  }
  const tool = select("brush").value, color = tool === "erase" ? null : hex(input("brush-color").value) >>> 0, size = Math.max(1, Math.min(16, Number(input("brush-size").value) || 1)), scope = select("edit-scope").value, frame = Math.floor(clock.time * project.fps + 1e-6);
  const rgb = input("brush-color").value.match(/[\da-f]{2}/gi).map((s) => {
    const v = parseInt(s, 16) / 255;
    return (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) * 2;
  });
  const points = [];
  let [ax, ay] = strokeLast ?? [x, y];
  const dxLine = Math.abs(x - ax), dyLine = -Math.abs(y - ay), stepX = ax < x ? 1 : -1, stepY = ay < y ? 1 : -1;
  let error = dxLine + dyLine;
  for (; ; ) {
    points.push([ax, ay]);
    if (ax === x && ay === y) break;
    const twice = 2 * error;
    if (twice >= dyLine) {
      error += dyLine;
      ax += stepX;
    }
    if (twice <= dxLine) {
      error += dxLine;
      ay += stepY;
    }
  }
  strokeLast = [x, y];
  for (const point of points) for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
    const px = point[0] + dx, py = point[1] + dy, key = `${px}:${py}`;
    if (px >= runtime.width || py >= runtime.height || strokeCells.has(key)) continue;
    strokeCells.add(key);
    const rawX = px - (latest?.shake[0] ?? 0), rawY = py - (latest?.shake[1] ?? 0);
    if (project.kind === "character" && (tool === "color" || tool === "erase" || tool === "mask")) {
      const asset = stroke.character, clip = project.options.clip ?? asset.defaultClip, sample = runtime.mod.player.sample(latest?.time ?? frame / project.fps, clip), base = { id: `stroke-${strokeId}-${key}`, clip, target: select("edit-target").value || "body", ...scope === "frame" ? { frame: sample.frameIndex } : {} };
      const inverse = invertPixelTransform2D(pixelTransform2D(runtime.origin[0], runtime.origin[1], project.options.angle ?? 0, !!project.options.flip)), local = transformPixelPoint2D(inverse, [rawX + 0.5, rawY + 0.5]), localX = Math.floor(local[0]), localY = Math.floor(local[1]);
      if (tool === "mask") stroke.character = { ...asset, maskEdits: [...asset.maskEdits ?? [], { ...base, name: select("mask-name").value, x: localX, y: localY, rows: [select("mask-operation").value], allowEmpty: select("mask-name").value === "negativeSpace" }] };
      else stroke.character = { ...asset, celEdits: [...asset.celEdits ?? [], { ...base, patch: { x: localX, y: localY, rows: ["x"], palette: { x: color } }, semantic: select("mask-name").value }] };
    } else stroke.edits.push({ frame: scope === "all" ? "all" : frame, x: rawX, y: rawY, color: tool === "mask" && select("mask-operation").value === "-" ? null : color, ...tool === "emission" ? { channel: "emission", emission: rgb } : {}, ...tool === "mask" ? { mask: select("mask-name").value } : {} });
    if (tool === "color" || tool === "erase") {
      ctx.fillStyle = color === null ? "#e76d63" : input("brush-color").value;
      ctx.globalAlpha = color === null ? 0.6 : 1;
      ctx.fillRect(view.x + px * view.scale, view.y + py * view.scale, view.scale, view.scale);
      ctx.globalAlpha = 1;
    }
  }
}
select("brush").onchange = () => {
  $("mask-label").hidden = !["mask", "color", "erase"].includes(select("brush").value);
  $("mask-operation-label").hidden = select("brush").value !== "mask";
  if (select("brush").value !== "none") clock.playing = false;
};
stage.onpointerdown = (event) => {
  if (select("brush").value === "none" || event.button !== 0) return;
  clock.playing = false;
  render();
  stroke = cloneJSON(project);
  strokeCells.clear();
  strokeLast = void 0;
  strokeId = crypto.randomUUID();
  drawing = true;
  stage.setPointerCapture(event.pointerId);
  paint(event);
};
stage.onpointermove = (event) => {
  if (drawing) paint(event);
};
stage.onpointerup = () => {
  if (!drawing || !stroke) return;
  drawing = false;
  const next = stroke;
  stroke = void 0;
  attempt(() => setProject(next));
};
stage.onpointercancel = () => {
  drawing = false;
  stroke = void 0;
  dirty = true;
};
var exportJob;
button("export").onclick = () => attempt(async () => {
  if (exportJob) return;
  clearDownloads();
  button("export").disabled = true;
  $("cancel-export").hidden = false;
  clock.playing = false;
  try {
    const job = exportJob = exportProjectAtlas(cloneJSON(project), (message) => status(message));
    const files = await job.promise;
    for (const file of files) linkFile(file);
    status(`\uB0B4\uBCF4\uB0B4\uAE30 \uC644\uB8CC \xB7 ${files.length - 1}\uAC1C \uD30C\uC77C \xB7 ZIP\uC5D0 \uD504\uB85C\uC81D\uD2B8\uC640 \uC790\uC0B0 \uBA85\uC138 \uD3EC\uD568`);
  } finally {
    exportJob = void 0;
    button("export").disabled = false;
    $("cancel-export").hidden = true;
  }
});
button("cancel-export").onclick = () => exportJob?.cancel();
var packButton = text("button", "\uB808\uC2DC\uD53C + \uC81C\uC791 \uBA54\uBAA8 \uC800\uC7A5");
packButton.onclick = () => download(project.id.replace("/", "-") + ".recipe-pack.json", new Blob([JSON.stringify(createRecipePack(project, [{ time: clock.time, note: project.notes }], project.notes ? [project.notes] : []), null, 2)], { type: "application/json" }));
$("intent-ref").parentElement.after(packButton);
document.addEventListener("keydown", (event) => {
  const editing = event.target?.matches("input,textarea,select,[contenteditable=true]");
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    button("save").click();
  }
  if (editing) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    button(event.shiftKey ? "redo" : "undo").click();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
    event.preventDefault();
    button("redo").click();
  } else if (event.code === "Space") {
    event.preventDefault();
    button("play").click();
  }
});
window.addEventListener("pagehide", () => {
  exportJob?.cancel();
  gpu?.dispose();
  runtime?.dispose();
  for (const url of urls) URL.revokeObjectURL(url);
});
attempt(async () => {
  const effect = new URLSearchParams(location.search).get("effect");
  if (effect) {
    const mod = await loadCatalogEffect(effect);
    project = createProject({ id: effect, kind: mod.recipe ? "recipe" : mod.act ? "act" : "2d", name: String(mod.meta.name ?? effect), options: mod.meta.options ?? {}, ...mod.recipe ? { recipe: mod.recipe } : {}, fps: 30 });
  } else {
    try {
      const saved = localStorage.getItem("poku-studio-autosave");
      if (saved) project = parseProject(saved);
    } catch {
    }
  }
  await setProject(project, "reset", false);
  requestAnimationFrame(animate);
});
