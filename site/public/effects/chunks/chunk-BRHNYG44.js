import {
  createRecipeEffect,
  resolveRecipe
} from "./chunk-I2CEDLVF.js";
import {
  loadCatalogEffect
} from "./chunk-FJX3UBLV.js";
import {
  finishProjectRGBA,
  postprocessProjectFrame,
  prepareProjectStyle
} from "./chunk-BTOTHK6M.js";
import {
  cloneJSON,
  resolveProject
} from "./chunk-FLVIEPJE.js";
import {
  actBounds,
  actorAlphaOf,
  backdrop,
  chain,
  characterClipTime2D,
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
  resolveAtlasExportSettings,
  resolveEffectExport,
  resolveOptions,
  sceneCameraOffset,
  stockActor,
  transformExportContacts,
  transformExportSockets
} from "./chunk-VBA4AN6M.js";
import {
  defineImpactContact2D,
  transformImpactContact2D
} from "./chunk-LCIPQSGQ.js";
import {
  enableHDRLight
} from "./chunk-MIW2CWC4.js";
import {
  CinematicCompositor
} from "./chunk-JQMAFXP4.js";
import {
  pixelTransform2D
} from "./chunk-G6VBW32E.js";

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

// src/authoring/sequence.ts
function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}
function finite(value, fallback, min, max, label) {
  const n = value ?? fallback;
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) throw new RangeError(`Invalid sequence ${label}`);
  return n;
}
function boolean(value, fallback, label) {
  if (value !== void 0 && typeof value !== "boolean") throw new TypeError(`Sequence ${label} must be boolean`);
  return value === void 0 ? fallback : value;
}
function seed(value) {
  if (value === void 0) return;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 4294967295) throw new RangeError("Sequence seed must be uint32");
  return value;
}
function createSequenceSpec(input = {}) {
  const p = object(cloneJSON(input), "Sequence");
  if (p.schema !== void 0 && p.schema !== "poku.sequence/v1") throw new RangeError("Unsupported sequence schema");
  if (!Array.isArray(p.cues ?? []) || (p.cues?.length ?? 0) > 64) throw new RangeError("A sequence supports at most 64 cues");
  const ids = /* @__PURE__ */ new Set();
  const cues = (p.cues ?? []).map((value) => {
    const c = object(value, "Sequence cue");
    if (typeof c.id !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(c.id) || ids.has(c.id))
      throw new RangeError("Sequence cue ids must be unique simple identifiers");
    ids.add(c.id);
    const raw = object(c.source, "Sequence source");
    let source;
    if (raw.kind === "catalog") {
      if (typeof raw.id !== "string" || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(raw.id)) throw new RangeError("Sequence catalog id must be category/name");
      source = { kind: "catalog", id: raw.id };
    } else if (raw.kind === "recipe") source = { kind: "recipe", recipe: resolveRecipe(raw.recipe) };
    else if (raw.kind === "character") {
      if (raw.clip !== void 0 && (typeof raw.clip !== "string" || !raw.clip)) throw new TypeError("Character cue clip must be text");
      source = { kind: "character", character: object(raw.character, "Character cue asset"), ...raw.clip === void 0 ? {} : { clip: raw.clip } };
    } else throw new RangeError("Sequence sources must be catalog, recipe or character assets");
    const options = { ...object(c.options ?? {}, "Sequence cue options") };
    const x = finite(c.x ?? options.x, 0, -65536, 65536, "x"), y = finite(c.y ?? options.y, 0, -65536, 65536, "y");
    const angle = finite(c.angle ?? options.angle, 0, -1e6, 1e6, "angle");
    const flip = boolean(c.flip ?? options.flip, false, "flip"), selectedSeed = seed(c.seed ?? options.seed);
    for (const key of ["x", "y", "angle", "flip", "seed"]) delete options[key];
    const at = finite(c.at, 0, 0, 3600, "start");
    const duration2 = c.duration === void 0 ? void 0 : finite(c.duration, 1, 1e-6, 3600, "cue duration");
    return {
      id: c.id,
      source,
      at,
      ...duration2 === void 0 ? {} : { duration: duration2 },
      x,
      y,
      angle,
      flip,
      fadeIn: finite(c.fadeIn, 0, 0, 3600, "fade-in"),
      fadeOut: finite(c.fadeOut, 0, 0, 3600, "fade-out"),
      enabled: boolean(c.enabled, true, "visibility"),
      ...selectedSeed === void 0 ? {} : { seed: selectedSeed },
      options
    };
  });
  const duration = p.duration === void 0 ? void 0 : finite(p.duration, 1, 1e-6, 3600, "duration");
  if (p.size === void 0 !== (p.origin === void 0)) throw new RangeError("Sequence size and origin must be supplied together");
  if (p.size !== void 0 && (!Array.isArray(p.size) || p.size.length !== 2 || !p.size.every((v) => typeof v === "number" && Number.isSafeInteger(v) && v > 0 && v <= 8192) || !Array.isArray(p.origin) || p.origin.length !== 2 || !p.origin.every((v) => typeof v === "number" && Number.isFinite(v))))
    throw new RangeError("Invalid sequence canvas");
  return {
    schema: "poku.sequence/v1",
    loop: boolean(p.loop, false, "loop"),
    cues,
    ...duration === void 0 ? {} : { duration },
    ...p.size === void 0 ? {} : { size: p.size, origin: p.origin }
  };
}
function resolveSequence(input) {
  const p = object(input, "Sequence");
  if (p.schema !== "poku.sequence/v1") throw new RangeError("Unsupported sequence schema");
  return createSequenceSpec(p);
}
function sequenceCueSeed(parentSeed, cueId) {
  seed(parentSeed);
  let hash = (2166136261 ^ parentSeed) >>> 0;
  for (let i = 0; i < cueId.length; i++) hash = Math.imul(hash ^ cueId.charCodeAt(i), 16777619) >>> 0;
  hash = Math.imul(hash ^ hash >>> 16, 2146121005);
  hash = Math.imul(hash ^ hash >>> 15, 2221713035);
  return (hash ^ hash >>> 16) >>> 0;
}
function cueOptions(cue, parent) {
  return {
    ...parent.palette === void 0 ? {} : { palette: parent.palette },
    ...cue.options,
    seed: cue.seed ?? sequenceCueSeed(Number(parent.seed ?? 1), cue.id),
    x: cue.x,
    y: cue.y,
    angle: cue.angle,
    flip: cue.flip
  };
}
function visible(cue, options) {
  return cue.enabled && options.layers?.[cue.id] !== false;
}
function childTime(time, source) {
  const local = time - source.cue.at;
  return source.mod.meta.loop ? characterClipTime2D(local, source.mod.meta.duration, true).time : local;
}
function envelope(time, cue, end) {
  const smooth = (n) => {
    const u = Math.max(0, Math.min(1, n));
    return u * u * (3 - 2 * u);
  };
  return (cue.fadeIn ? smooth((time - cue.at) / cue.fadeIn) : 1) * (cue.fadeOut ? smooth((end - time) / cue.fadeOut) : 1);
}
function sourceTimes(source, at) {
  if (!Number.isFinite(at) || at < 0) return [];
  const { cue, mod, end } = source, duration = mod.meta.duration;
  if (mod.meta.loop && at >= duration - 1e-9) return [];
  const result = [];
  const naturalEnd = !mod.meta.loop && Math.abs(end - (cue.at + duration)) < 1e-9;
  for (let cycle = 0; ; cycle++) {
    const time = cue.at + at + cycle * duration;
    if (time > end + 1e-9 || !naturalEnd && time >= end - 1e-9) break;
    result.push(time);
    if (!mod.meta.loop) break;
    if (result.length >= 1e5) throw new RangeError("Sequence contains over 100,000 repeated events; shorten the cue window");
  }
  return result;
}
async function createSequenceEffect(input, loader = loadCatalogEffect, fps = 30) {
  if (!Number.isFinite(fps) || fps < 1 || fps > 240) throw new RangeError("Sequence fps must be in [1, 240]");
  const spec = resolveSequence(input);
  const loaded = await Promise.all(spec.cues.map(async (cue) => {
    const mod = cue.source.kind === "catalog" ? await loader(cue.source.id) : cue.source.kind === "recipe" ? createRecipeEffect(cue.source.recipe) : createCharacterEffect(cue.source.character, cue.source.clip, fps);
    const meta2 = mod.meta;
    if (!meta2 || !Number.isFinite(meta2.duration) || meta2.duration <= 0 || meta2.duration > 3600)
      throw new RangeError(`Sequence cue ${cue.id} needs a positive finite source duration`);
    exportLayout2D(meta2.size, meta2.origin, cue);
    const window = cue.duration ?? meta2.duration, span = meta2.loop ? window : Math.min(window, meta2.duration);
    return { cue, mod, end: cue.at + span };
  }));
  const duration = spec.duration ?? (loaded.length ? Math.max(...loaded.map((c) => c.end)) : 1);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 3600) throw new RangeError("Sequence duration must be in (0, 3600]");
  for (const source of loaded) source.end = Math.min(source.end, duration);
  let size, origin;
  if (spec.size && spec.origin) {
    size = [...spec.size];
    origin = [...spec.origin];
  } else if (!loaded.length) {
    size = [320, 180];
    origin = [160, 144];
  } else {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const { cue, mod } of loaded) {
      const layout = exportLayout2D(mod.meta.size, mod.meta.origin, { angle: cue.angle, flip: cue.flip });
      const x = cue.x - layout.pivot[0], y = cue.y - layout.pivot[1];
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + layout.w);
      bottom = Math.max(bottom, y + layout.h);
    }
    left = Math.floor(left);
    top = Math.floor(top);
    right = Math.ceil(right);
    bottom = Math.ceil(bottom);
    size = [Math.max(1, right - left), Math.max(1, bottom - top)];
    origin = [-left, -top];
  }
  if (size[0] > 8192 || size[1] > 8192 || size[0] * size[1] > 4194304) throw new RangeError("Sequence canvas exceeds 8192px or four megapixels; move cues closer or set a smaller explicit canvas");
  const metadataFor = (options) => {
    const contacts = [], events = [];
    for (const source of loaded) {
      const { cue, mod } = source;
      if (!visible(cue, options) || source.end <= cue.at) continue;
      const actual = resolveOptions(mod.meta, cueOptions(cue, options));
      for (const contact of mod.contacts?.(actual) ?? []) for (const at of sourceTimes(source, contact.at)) {
        if (spec.loop && at >= duration - 1e-9) continue;
        contacts.push(transformImpactContact2D(defineImpactContact2D({ ...contact, id: `${cue.id}/${contact.id}`, at }), cue));
      }
      for (const event of collectAssetEvents(mod)) {
        const sourceTime = Number(event.sourceTime ?? event.t ?? event.at ?? event.time);
        if (!Number.isFinite(sourceTime)) throw new RangeError(`Sequence cue ${cue.id} has an event without a finite source time`);
        for (const at of sourceTimes(source, sourceTime)) {
          if (spec.loop && at >= duration - 1e-9) continue;
          const id = String(event.id ?? event.name ?? event.kind ?? event.type ?? "event");
          events.push({
            ...event,
            id: `${cue.id}/${id}`,
            sourceTime: at,
            at,
            cue: cue.id,
            cueSourceTime: sourceTime,
            ...typeof event.socket === "string" ? { socket: `${cue.id}/${event.socket}` } : {}
          });
        }
      }
      if (contacts.length + events.length > 1e5) throw new RangeError("Sequence metadata exceeds 100,000 markers; shorten cue windows");
    }
    contacts.sort((a, b) => a.at - b.at);
    events.sort((a, b) => Number(a.sourceTime) - Number(b.sourceTime));
    return { contacts, events };
  };
  const meta = {
    name: "Effect Sequence",
    desc: "Timed catalog, recipe and character cues in one native canvas.",
    size,
    origin,
    duration,
    loop: spec.loop,
    fps,
    bg: "dark",
    tags: ["sequence"],
    options: { seed: 1 },
    heroTime: loaded.length ? Math.min(duration, loaded[0].cue.at + Number(loaded[0].mod.meta.heroTime ?? 0.25)) : 0
  };
  const clock = (time) => characterClipTime2D(time, duration, spec.loop);
  return {
    meta,
    sequence: spec,
    contacts: (options) => metadataFor(options).contacts,
    // Events depend on source windows and visibility, not on random particle draws. Runtime/export
    // replace this default list with eventsFor(options) when project layer visibility is applied.
    events: metadataFor({ seed: 1 }).events,
    eventsFor: (options) => metadataFor(options).events,
    socketsAt(time, options = {}) {
      const t = clock(time).time;
      const sockets = /* @__PURE__ */ Object.create(null);
      for (const source of loaded) {
        const { cue, mod, end } = source;
        if (!visible(cue, options) || t < cue.at || t >= end || envelope(t, cue, end) <= 0) continue;
        const actual = resolveOptions(mod.meta, cueOptions(cue, options));
        const posed = transformExportSockets(
          mod.socketsAt?.(childTime(t, source), actual),
          mod.meta.origin,
          [origin[0] + cue.x, origin[1] + cue.y],
          cue
        );
        for (const [name, socket] of Object.entries(posed ?? {})) sockets[`${cue.id}/${name}`] = socket;
      }
      return sockets;
    },
    cameraShake(time, options) {
      const t = clock(time).time;
      let x = 0, y = 0;
      for (const source of loaded) {
        const { cue, mod, end } = source;
        if (!mod.cameraShake || !visible(cue, options) || t < cue.at || t >= end) continue;
        const actual = resolveOptions(mod.meta, cueOptions(cue, options)), strength = Number(actual.cameraMotion ?? 1);
        if (!Number.isFinite(strength) || strength < 0) throw new RangeError("Cue cameraMotion must be finite and non-negative");
        const offset = mod.cameraShake(childTime(t, source), actual), fade = envelope(t, cue, end) * strength;
        x += offset[0] * fade;
        y += offset[1] * fade;
      }
      return [x, y];
    },
    create(options) {
      const cues = loaded.filter((c) => visible(c.cue, options)).map(({ cue, mod, end }) => ({
        ...cueOptions(cue, options),
        fx: mod,
        t: cue.at,
        until: Math.max(cue.at, end),
        fadeIn: cue.fadeIn,
        fadeOut: cue.fadeOut
      }));
      const factory = chain(cues);
      let scheduler = factory(options), cycle = 0;
      return {
        advanceTime(time) {
          const { time: local, cycle: nextCycle } = clock(time);
          if (nextCycle !== cycle) {
            scheduler = factory(options);
            cycle = nextCycle;
          }
          scheduler.advanceTime(local);
        },
        drawBack: (p) => scheduler.drawBack(p),
        draw: (p) => scheduler.draw(p)
      };
    }
  };
}

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
  prepareProjectStyle(project);
  resolveAtlasExportSettings(project.exportSettings);
  const mod = suppliedModule ?? (project.kind === "recipe" ? createRecipeEffect(project.recipe) : project.kind === "character" ? createCharacterEffect(project.character, project.options.clip, project.fps) : project.kind === "sequence" ? await createSequenceEffect(project.sequence, void 0, project.fps) : await loadCatalogEffect(project.id));
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
  const contacts = transformExportContacts(facts.contacts, facts.options), events = mod.eventsFor?.(facts.options) ?? collectAssetEvents(mod);
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
    const { name, notes, intentRef, intentSha256, sourceRevision, renderProfile, exportSettings, pixelStyle, edits, bg: bg2, ...simulation } = p;
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
      prepareProjectStyle(next);
      resolveAtlasExportSettings(next.exportSettings);
      const nextPlan = resolveEffectExport(mod.meta, { fps: next.fps, seconds: next.seconds, options, margin: next.margin ?? 0, edgeFade: next.pixelStyle?.edgeFade });
      const nextBg = next.bg === project.bg ? bg : next.bg === "none" ? null : backdrop(next.bg, w, h, y - layout.oy);
      const finishingKey = (p) => JSON.stringify([p.renderProfile, p.pixelStyle, p.edits, p.bg]);
      const invalidate = finishingKey(next) !== finishingKey(project);
      project = next;
      plan = nextPlan;
      bg = nextBg;
      if (invalidate) cache.clear();
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
  createSequenceSpec,
  projectCinematicOptions,
  createProjectRuntime
};
