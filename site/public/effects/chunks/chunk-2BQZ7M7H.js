import {
  createRecipeEffect
} from "./chunk-PLGU4LXO.js";
import {
  loadCatalogEffect
} from "./chunk-Z3SHPHVH.js";
import {
  finishProjectRGBA,
  postprocessProjectFrame
} from "./chunk-IXDL6S4B.js";
import {
  resolveProject
} from "./chunk-JIMPAKU2.js";
import {
  actBounds,
  actorAlphaOf,
  backdrop,
  clearFrame,
  collectAssetEvents,
  composite,
  createAct,
  createCharacterPlayer2D,
  createFrame,
  createFx,
  createStudioCharacter2D,
  drawActor,
  edgeFade,
  exportLayout2D,
  painterFor,
  parseCharacterAsset2D,
  resolveActExport,
  resolveEffectExport,
  sceneCameraOffset,
  stockActor,
  transformExportContacts,
  transformExportSockets
} from "./chunk-NY4VHNMV.js";
import {
  CinematicCompositor,
  enableHDRLight,
  pixelTransform2D
} from "./chunk-T3JNBT34.js";

// src/authoring/composite.ts
var compositors = /* @__PURE__ */ new WeakMap();
function projectCinematicOptions(project, background = null) {
  const profile = project.renderProfile ?? {};
  const { mode: _mode, ...settings } = profile.cinematic ?? profile;
  return {
    bloom: { threshold: 0.12, knee: 0.2, intensity: 0.7, levels: 3 },
    toneMap: "aces",
    exposure: 1,
    ...settings,
    background,
    ...project.pixelStyle?.finalColorPolicy === "palette-locked" ? { finalPalette: project.pixelStyle.palette } : {}
  };
}
function compositeProjectFrame(frame, rgba, project, background = null) {
  if (project.renderProfile?.mode === "cinematic" || project.kind === "3d") {
    let compositor = compositors.get(project);
    if (!compositor) {
      compositor = new CinematicCompositor();
      compositors.set(project, compositor);
    }
    compositor.render(frame, rgba, projectCinematicOptions(project, background));
  } else composite(frame, rgba, background);
  finishProjectRGBA(rgba, project);
}

// src/authoring/character-effect.ts
function createCharacterEffect(input, requestedClip, fps = 30) {
  const asset = input === void 0 ? createStudioCharacter2D() : parseCharacterAsset2D(JSON.stringify(input));
  const player = createCharacterPlayer2D(asset);
  const clipName = requestedClip ?? asset.defaultClip;
  if (!player.clips.includes(clipName)) throw new RangeError(`Unknown character clip: ${clipName}`);
  const clip = player.clipInfo(clipName);
  const b = player.boundsForClip(clipName, fps), origin = [-b.x0, -b.y0], size = [b.x1 - b.x0, b.y1 - b.y0];
  return {
    meta: { name: asset.name, desc: `${asset.name} \xB7 ${clipName}`, size, origin, duration: clip.duration, loop: clip.loop ?? false, fps, bg: "none", tags: ["character", clipName], options: { seed: 1 } },
    draw(p, time) {
      const sample = player.draw(p, time, clipName);
      const f = p.frame;
      f.semanticMasks ??= /* @__PURE__ */ Object.create(null);
      for (const [name, mask] of Object.entries(sample.semanticMasks)) {
        const dest = f.semanticMasks[name] ??= new Uint8Array(f.w * f.h), s = sample.actor;
        p.each(s.x, s.y, s.x + s.w, s.y + s.h, (lx, ly, sx, sy) => {
          const xx = Math.floor(lx - s.x), yy = Math.floor(ly - s.y);
          if (xx >= 0 && yy >= 0 && xx < s.w && yy < s.h && mask[yy * s.w + xx]) dest[(sy - f.oy) * f.w + sx - f.ox] = 1;
        });
      }
    },
    socketsAt(time) {
      return Object.fromEntries(Object.entries(player.sample(time, clipName).sockets).map(([name, s]) => [name, { x: s.position[0] + origin[0], y: s.position[1] + origin[1], angle: Math.atan2(s.basisX[1], s.basisX[0]), basisX: [...s.basisX], basisY: [...s.basisY], mirrorPolicy: s.mirrorPolicy, visible: s.visible }]));
    },
    events: clip.events,
    character: asset,
    player,
    clipName
  };
}

// src/authoring/cache.ts
var BudgetCache = class {
  constructor(maxBytes = 32 * 1024 * 1024) {
    this.maxBytes = maxBytes;
    if (!(maxBytes > 0)) throw new RangeError("Cache budget must be positive");
  }
  entries = /* @__PURE__ */ new Map();
  bytes = 0;
  hits = 0;
  misses = 0;
  get(key) {
    const e = this.entries.get(key);
    if (!e) {
      this.misses++;
      return;
    }
    this.hits++;
    this.entries.delete(key);
    this.entries.set(key, e);
    return e.value;
  }
  set(key, value, bytes, tags = []) {
    if (!Number.isFinite(bytes) || bytes < 0) throw new RangeError("Invalid cache size");
    this.delete(key);
    if (bytes > this.maxBytes) return;
    while (this.bytes + bytes > this.maxBytes && this.entries.size) this.delete(this.entries.keys().next().value);
    this.entries.set(key, { value, bytes, tags: new Set(tags) });
    this.bytes += bytes;
  }
  delete(key) {
    const e = this.entries.get(key);
    if (e) this.bytes -= e.bytes;
    this.entries.delete(key);
  }
  invalidate(tag) {
    for (const [key, e] of this.entries) if (e.tags.has(tag)) this.delete(key);
  }
  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
  get size() {
    return this.entries.size;
  }
};
function retainedBytes(value) {
  const seen = /* @__PURE__ */ new Set();
  function count(v) {
    if (v === null || v === void 0) return 0;
    if (typeof v === "number") return 8;
    if (typeof v === "boolean") return 4;
    if (typeof v === "string") return v.length * 2;
    if (typeof v !== "object" || seen.has(v)) return 0;
    seen.add(v);
    if (ArrayBuffer.isView(v)) return v.byteLength;
    if (v instanceof ArrayBuffer) return v.byteLength;
    if (v instanceof Map) return 64 + [...v].reduce((n, [k, v2]) => n + count(k) + count(v2), 0);
    if (v instanceof Set) return 64 + [...v].reduce((n, v2) => n + count(v2), 0);
    return 64 + Object.entries(v).reduce((n, [k, v2]) => n + k.length * 2 + count(v2), 0);
  }
  return count(value);
}

// src/authoring/runtime.ts
async function createProjectRuntime(input, suppliedModule) {
  let project = resolveProject(input);
  if (project.kind === "3d") throw new RangeError("Use the 3D profile player for 3D projects");
  const mod = suppliedModule ?? (project.kind === "recipe" ? createRecipeEffect(project.recipe) : project.kind === "character" ? createCharacterEffect(project.character, project.options.clip, project.fps) : await loadCatalogEffect(project.id));
  const options = { ...project.options, seed: project.seed, layers: project.layers, ...project.cameraMotion !== void 0 ? { cameraMotion: project.cameraMotion } : {} };
  const acted = project.kind === "act";
  let plan = resolveEffectExport(mod.meta, { fps: project.fps, seconds: project.seconds, options, margin: project.margin ?? 0, edgeFade: project.pixelStyle?.edgeFade });
  let layout = plan.layout;
  if (acted) {
    const b = actBounds(mod, options), pad = project.pad ?? 6;
    layout = exportLayout2D([b.x1 - b.x0, b.y1 - b.y0], [-b.x0, -b.y0], { flip: !!options.flip, margin: pad, x: options.x, y: options.y });
  }
  const { w, h, x, y } = layout;
  if (w * h > 4194304) throw new RangeError("Studio native frame exceeds four megapixels; reduce canvas size or export with the CLI");
  const frame = enableHDRLight(createFrame(w, h, layout.ox, layout.oy));
  const rgba = new Uint8ClampedArray(w * h * 4);
  let bg = project.bg === "none" ? null : backdrop(project.bg, w, h, y - layout.oy);
  const shifted = new Uint8ClampedArray(w * h * 4);
  const make = () => acted ? createAct(mod, { ...options, x, y }) : createFx(mod, { ...options, x, y });
  let instance = make(), last = 0;
  const facts = acted ? instance.fx : instance;
  const contacts = transformExportContacts(facts.contacts, facts.options), events = collectAssetEvents(mod);
  const checkpoints = /* @__PURE__ */ new Map();
  let checkpointBytes = 0, lastCheckpoint = -1;
  const supportsCheckpoint = !acted && instance.supportsCheckpoint;
  function capture(time) {
    if (!supportsCheckpoint || time - lastCheckpoint < 1) return;
    const snapshot = instance.capture(), bytes = retainedBytes(snapshot);
    if (bytes > 8 * 1024 * 1024) return;
    while (checkpointBytes + bytes > 8 * 1024 * 1024 || checkpoints.size >= 32) {
      const key = checkpoints.keys().next().value;
      if (key === void 0) break;
      checkpointBytes -= checkpoints.get(key).bytes;
      checkpoints.delete(key);
    }
    checkpoints.set(time, { snapshot, bytes });
    checkpointBytes += bytes;
    lastCheckpoint = time;
  }
  capture(0);
  const markerSources = [...new Set([...contacts, ...events].map((event) => Number(event.sourceTime ?? event.t ?? event.at ?? event.time)).filter(Number.isFinite))].sort((a, b) => a - b);
  const markerTimes = /* @__PURE__ */ new Map();
  let nextMarker = 0;
  const actPlan = acted ? resolveActExport(mod, make(), { fps: project.fps, seconds: project.seconds, hold: project.hold }, (sourceTime, frameIndex) => {
    if (frameIndex === 0) while (nextMarker < markerSources.length && markerSources[nextMarker] < sourceTime - 1e-9) nextMarker++;
    while (nextMarker < markerSources.length && markerSources[nextMarker] <= sourceTime + 1e-9) markerTimes.set(markerSources[nextMarker++], frameIndex / project.fps);
  }) : null;
  const frameCount = actPlan?.n ?? plan.n;
  const duration = actPlan?.duration ?? (project.seconds ?? mod.meta.duration);
  const cache = new BudgetCache(16 * 1024 * 1024);
  function render(time, frameIndex = Math.max(0, Math.floor(time * project.fps + 1e-6)), useCache = true, finish = true, purpose = "preview") {
    if (!Number.isFinite(time) || time < 0) throw new RangeError("Presentation time must be non-negative");
    const key = `${frameIndex}:${time.toFixed(8)}:${finish}:${purpose}`, previous = useCache ? cache.get(key) : void 0;
    if (previous) {
      frame.color.set(previous.color);
      frame.light.set(previous.light);
      frame.hdrLight.set(previous.hdr);
      rgba.set(previous.rgba);
      frame.semanticMasks = Object.fromEntries(Object.entries(previous.masks).map(([n, m]) => [n, m.slice()]));
      return { frame, rgba, time: previous.time, frameIndex, drawMs: 0, cached: true, ...previous.metadata };
    }
    const start = performance.now();
    if (time < last) {
      let closest = -1;
      for (const t of checkpoints.keys()) if (t <= time && t > closest) closest = t;
      if (closest >= 0) {
        instance.restore(checkpoints.get(closest).snapshot);
        last = closest;
      } else {
        instance = make();
        last = 0;
      }
    }
    instance.update(time - last);
    last = time;
    capture(time);
    clearFrame(frame);
    frame.semanticMasks = /* @__PURE__ */ Object.create(null);
    if (acted) instance.draw(frame, { body: project.actor, target: project.target });
    else {
      const fx = instance;
      fx.draw(frame, "back");
      if (mod.meta.actor && project.actor) drawActor(painterFor(frame).place(x, y, !!options.flip, options.angle ?? 0), fx.options.actor ?? stockActor(), actorAlphaOf(mod, mod.meta.loop ? fx.t % mod.meta.duration : Math.min(fx.t, mod.meta.duration), fx.options));
      fx.draw(frame, "front");
    }
    const actual = acted ? instance.fx.options : instance.options;
    const pivot = acted ? [(actual.x ?? x) - layout.ox, (actual.y ?? y) - layout.oy] : layout.pivot;
    const metadata = { sockets: transformExportSockets(mod.socketsAt?.(instance.t, actual), mod.meta.origin, pivot, actual), frozen: acted ? instance.frozen : false, shake: sceneCameraOffset(instance.shake, false, bg === null) };
    postprocessProjectFrame(frame, project, instance.t, frameIndex, { objectToWorld: pixelTransform2D(actual.x ?? x, actual.y ?? y, actual.angle ?? 0, !!actual.flip), cameraOffset: purpose === "asset" ? [0, 0] : metadata.shake });
    if (!acted) edgeFade(frame, plan.settings.edgeFade);
    if (finish) {
      compositeProjectFrame(frame, rgba, project, bg);
      const [sx, sy] = metadata.shake;
      if (sx || sy) {
        shifted.set(rgba);
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
          const src = (Math.max(0, Math.min(h - 1, yy - sy)) * w + Math.max(0, Math.min(w - 1, xx - sx))) * 4, dest = (yy * w + xx) * 4;
          rgba.set(shifted.subarray(src, src + 4), dest);
        }
      }
    }
    if (useCache) {
      const masks = Object.fromEntries(Object.entries(frame.semanticMasks ?? {}).map(([n, m]) => [n, m.slice()]));
      cache.set(key, { color: frame.color.slice(), light: frame.light.slice(), hdr: frame.hdrLight.slice(), rgba: rgba.slice(), time: instance.t, masks, metadata }, w * h * (24 + Object.keys(masks).length) + retainedBytes(metadata), ["frame"]);
    }
    return { frame, rgba, time: instance.t, frameIndex, drawMs: performance.now() - start, cached: false, ...metadata };
  }
  function simulationKey(p) {
    const { name, notes, intentRef, intentSha256, sourceRevision, renderProfile, pixelStyle, edits, bg: bg2, ...simulation } = p;
    return JSON.stringify(simulation);
  }
  return {
    get project() {
      return project;
    },
    mod,
    width: w,
    height: h,
    origin: layout.pivot,
    duration,
    frameCount,
    loop: !!mod.meta.loop,
    contacts,
    events,
    frame,
    rgba,
    get bg() {
      return bg;
    },
    cache,
    render,
    /** First displayed frame reaching a known ACT marker; other effects use their native clock. */
    markerTime(sourceTime) {
      if (!Number.isFinite(sourceTime)) return void 0;
      if (acted) return markerTimes.get(sourceTime);
      const index = Math.max(0, Math.ceil((sourceTime - 1e-9) * project.fps));
      return sourceTime >= 0 && sourceTime <= duration && index < frameCount ? index / project.fps : void 0;
    },
    /** Finishing/paint edits invalidate rendered cels, while complete simulation checkpoints remain valid. */
    tryUpdateProject(input2) {
      const next = resolveProject(input2);
      if (simulationKey(next) !== simulationKey(project)) return false;
      const nextPlan = resolveEffectExport(mod.meta, { fps: next.fps, seconds: next.seconds, options, margin: next.margin ?? 0, edgeFade: next.pixelStyle?.edgeFade });
      const nextBg = next.bg === project.bg ? bg : next.bg === "none" ? null : backdrop(next.bg, w, h, y - layout.oy);
      project = next;
      plan = nextPlan;
      bg = nextBg;
      cache.clear();
      return true;
    },
    get seekStats() {
      return { mode: supportsCheckpoint ? "checkpoint" : "replay", checkpoints: checkpoints.size, bytes: checkpointBytes };
    },
    reset() {
      instance = make();
      last = 0;
      cache.clear();
      checkpoints.clear();
      checkpointBytes = 0;
      lastCheckpoint = -1;
      capture(0);
    },
    dispose() {
      cache.clear();
      checkpoints.clear();
      checkpointBytes = 0;
    }
  };
}

export {
  projectCinematicOptions,
  createProjectRuntime
};
