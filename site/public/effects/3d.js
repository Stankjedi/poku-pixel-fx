import {
  finishProjectRGBA,
  postprocessProjectFrame
} from "./chunks/chunk-6HAS6H5C.js";
import {
  createProject,
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
  blendOver,
  enableHDRLight
} from "./chunks/chunk-3L2ANF6Q.js";
import {
  CinematicCompositor,
  SRGB_TO_LINEAR,
  channelToLinear
} from "./chunks/chunk-JQMAFXP4.js";
import {
  __export
} from "./chunks/chunk-WSFCRVEQ.js";

// src/render/profile3d.ts
var EFFECT_IDS_3D = ["frost", "slash", "blackhole", "wind", "windOriginal", "shatter", "flame", "lightning", "water", "voidrift", "meteor", "laser", "shield"];
var windLights = [
  { position: [-2.1, 3.5, 1.7], radius: 7, color: "#70efff", intensity: 1.65, specular: 0.5, rim: 0.25 },
  { position: [2.4, 2.1, -1.8], radius: 6, color: "#8b9dff", intensity: 1.15, specular: 0.38, rim: 0.22 }
];
var rigs = {
  blackhole: [
    { position: [-2.3, 3.3, 1.5], radius: 6.5, color: "#ff874b", intensity: 1.8, specular: 0.5, rim: 0.25 },
    { position: [2.5, 1.9, -2.2], radius: 5.5, color: "#7b56ff", intensity: 1.35, specular: 0.42, rim: 0.32 }
  ],
  frost: [
    { position: [-2.2, 2.8, 2], radius: 7.1, color: "#6fe5ff", intensity: 1.9, specular: 0.55, rim: 0.32 },
    { position: [2.2, 1.3, -1.8], radius: 6.5, color: "#9d79ff", intensity: 1.05, specular: 0.36 }
  ],
  slash: [
    { position: [-1.2, 3.2, 1.8], radius: 7, color: "#96ccff", intensity: 1.6, specular: 0.6 },
    { position: [2.6, 2, -1.8], radius: 6.4, color: "#eb82ff", intensity: 1.4, specular: 0.42, rim: 0.3 }
  ],
  shatter: [
    { position: [-2.2, 4, 2], radius: 7, color: "#91e8fa", intensity: 1.2, specular: 0.6 },
    { position: [2, 2, -2], radius: 6, color: "#486dc4", intensity: 0.6, specular: 0.3 }
  ],
  windOriginal: windLights
};
var layout = {
  frost: [1, 0.75],
  slash: [1, 1.4],
  blackhole: [1.36, 1.12],
  wind: [1.18, 2.35],
  windOriginal: [1.18, 2.35],
  shatter: [1.2, 1.1],
  flame: [1.65, 1.95],
  lightning: [1.35, 2.6],
  water: [1.28, 1.05],
  voidrift: [1.3, 2.5],
  meteor: [0.98, 2.3],
  laser: [1.45, 1.2],
  shield: [1.45, 2.1]
};
var copy = (value) => JSON.parse(JSON.stringify(value));
function createRenderProfile3D(effectId, overrides = {}) {
  if (!EFFECT_IDS_3D.includes(effectId)) throw new RangeError(`Unknown 3D profile: ${effectId}`);
  const id = effectId, [zoom2, targetY] = layout[id], wind = id === "wind" || id === "windOriginal";
  const base = {
    version: 1,
    effectId: id,
    camera: { yaw: 0.68, elevation: 28 * Math.PI / 180, zoom: zoom2, target: [0, targetY, 0], projection: "orthographic" },
    lights: copy(rigs[id] ?? []),
    lighting: { ambientOcclusion: { radius: 3, bias: 0.1, intensity: 0.34 } },
    cinematic: {
      bloom: { threshold: 0.12, knee: 0.2, intensity: 1.1, levels: 4 },
      toneMap: "aces",
      exposure: 1.3,
      saturation: 1.12,
      contrast: 1.05,
      vignette: 0.07,
      chromaticFringe: 0.55
    },
    background: id === "blackhole" ? "#05030d" : wind ? "#061222" : "#0a1525",
    grid: id !== "blackhole" && !wind,
    cameraMotion: true,
    nativeSize: id === "flame" ? [192, 144] : id === "meteor" ? [260, 180] : [320, 220]
  };
  const profile2 = {
    ...base,
    ...copy(overrides),
    version: 1,
    effectId: id,
    camera: { ...base.camera, ...copy(overrides.camera ?? {}) },
    cinematic: { ...base.cinematic, ...copy(overrides.cinematic ?? {}) }
  };
  validateRenderProfile3D(profile2);
  return profile2;
}
function validateRenderProfile3D(value) {
  if (!value || typeof value !== "object") throw new TypeError("Render profile must be an object");
  const p = value;
  if (p.version !== 1 || !EFFECT_IDS_3D.includes(p.effectId)) throw new RangeError("Unsupported render profile version/effect");
  if (!Array.isArray(p.nativeSize) || p.nativeSize.length !== 2 || !p.nativeSize.every((n) => Number.isSafeInteger(n) && n > 0 && n <= 16384)) throw new RangeError("Profile nativeSize must contain two positive dimensions up to 16384");
  if (!p.camera || ![p.camera.yaw, p.camera.elevation, p.camera.zoom].every(Number.isFinite) || p.camera.zoom <= 0) throw new RangeError("Invalid profile camera");
  if (p.camera.target && (p.camera.target.length !== 3 || !p.camera.target.every(Number.isFinite))) throw new RangeError("Invalid camera target");
  if (p.camera.projection && !["perspective", "orthographic"].includes(p.camera.projection)) throw new RangeError("Invalid projection");
  if (p.camera.perspective !== void 0 && !Number.isFinite(p.camera.perspective)) throw new RangeError("Invalid camera perspective");
  if (!Array.isArray(p.lights) || p.lights.some((l) => !l || !Array.isArray(l.position) || l.position.length !== 3 || !l.position.every(Number.isFinite) || !Number.isFinite(l.radius) || l.radius <= 0 || !Number.isFinite(l.intensity) || l.intensity < 0)) throw new RangeError("Invalid profile light");
  if (!p.cinematic || !p.lighting || typeof p.grid !== "boolean" || typeof p.cameraMotion !== "boolean") throw new TypeError("Incomplete render profile");
  for (const [name, n] of Object.entries(p.cinematic)) if (typeof n === "number" && (!Number.isFinite(n) || n < 0)) throw new RangeError(`Invalid cinematic ${name}`);
  if (p.cinematic.toneMap && !["aces", "reinhard", "none"].includes(p.cinematic.toneMap)) throw new RangeError("Invalid tone mapper");
  if (p.cinematic.bloom && Object.values(p.cinematic.bloom).some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0)) throw new RangeError("Invalid bloom settings");
  if (p.background !== null && !(typeof p.background === "number" && Number.isInteger(p.background)) && !(typeof p.background === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(p.background))) throw new RangeError("Invalid background");
}
function parseRenderProfile3D(json) {
  const p = JSON.parse(json);
  validateRenderProfile3D(p);
  return copy(p);
}

// src/3d/math.ts
var TAU3 = Math.PI * 2;
var clamp3 = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
var lerp3 = (a, b, t) => a + (b - a) * t;
var smooth3 = (a, b, t) => {
  const u = clamp3((t - a) / (b - a || 1));
  return u * u * (3 - 2 * u);
};
var outCubic3 = (t) => 1 - Math.pow(1 - clamp3(t), 3);
var outBack3 = (t) => {
  const u = clamp3(t) - 1, c = 1.70158;
  return 1 + (c + 1) * u * u * u + c * u * u;
};
var add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
var sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
var mul3 = (a, f) => [a[0] * f, a[1] * f, a[2] * f];
var cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
var dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
var len3 = (a) => Math.hypot(...a);
var norm3 = (a) => mul3(a, 1 / (len3(a) || 1));
var Rng3D = class {
  state;
  constructor(seed2 = 1) {
    this.state = seed2 | 0;
  }
  next() {
    let t = this.state = this.state + 1831565813 | 0;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  range(min, max) {
    return lerp3(min, max, this.next());
  }
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }
  chance(p) {
    return this.next() < p;
  }
  sign() {
    return this.chance(0.5) ? -1 : 1;
  }
  pick(items) {
    return items[Math.floor(this.next() * items.length)];
  }
};

// src/3d/surface.ts
var pack = (r, g, b) => {
  const value = Math.min(255, Math.max(0, r)) | 0 | (Math.min(255, Math.max(0, g)) | 0) << 8 | (Math.min(255, Math.max(0, b)) | 0) << 16;
  return value ? (value | 4278190080) >>> 0 : 0;
};
var SurfaceFragments3D = class {
  constructor(frame2) {
    this.frame = frame2;
  }
  heads;
  tails;
  baseColor;
  baseLight;
  baseDepth;
  baseHDR;
  count = 0;
  capacity = 0;
  next = new Uint32Array(0);
  z = new Float32Array(0);
  colors = new Uint32Array(0);
  alphas = new Float64Array(0);
  depthWrites = new Uint8Array(0);
  energy = new Float64Array(0);
  // legacy RGB, then linear RGB; already premultiplied
  screenLight;
  screenHDR;
  surfaceLight;
  surfaceHDR;
  layers;
  maxFragments = Infinity;
  metrics = {
    submitted: 0,
    accepted: 0,
    rejected: 0,
    opaque: 0,
    transparent: 0,
    maxLayersPerPixel: 0,
    resolves: 0,
    recomposedFragments: 0,
    budgetExceeded: false
  };
  reset() {
    this.heads?.fill(0);
    this.tails?.fill(0);
    this.count = 0;
    this.screenLight?.fill(0);
    this.surfaceLight?.fill(0);
    this.screenHDR?.fill(0);
    this.surfaceHDR?.fill(0);
    if (!this.frame.hdrLight) {
      this.baseHDR = this.screenHDR = this.surfaceHDR = void 0;
    }
    this.layers?.fill(0);
    this.metrics = {
      submitted: 0,
      accepted: 0,
      rejected: 0,
      opaque: 0,
      transparent: 0,
      maxLayersPerPixel: 0,
      resolves: 0,
      recomposedFragments: 0,
      budgetExceeded: false
    };
  }
  configure(budget = {}) {
    const n = budget.maxFragments ?? Infinity;
    if (n !== Infinity && (!Number.isSafeInteger(n) || n < 1)) throw new RangeError("maxFragments must be a positive integer");
    this.maxFragments = n;
  }
  diagnostics() {
    const arrays = [
      this.next,
      this.z,
      this.colors,
      this.alphas,
      this.depthWrites,
      this.energy,
      this.heads,
      this.tails,
      this.layers,
      this.baseColor,
      this.baseLight,
      this.baseDepth,
      this.baseHDR,
      this.screenLight,
      this.screenHDR,
      this.surfaceLight,
      this.surfaceHDR
    ];
    return Object.freeze({
      ...this.metrics,
      arenaCapacity: this.capacity,
      arenaBytes: arrays.reduce((n, a) => n + (a?.byteLength ?? 0), 0),
      activeFragments: this.layers?.reduce((sum, count) => sum + count, 0) ?? 0,
      budget: this.maxFragments === Infinity ? null : this.maxFragments
    });
  }
  prepare() {
    if (!this.heads) {
      const n = this.frame.w * this.frame.h;
      this.heads = new Uint32Array(n);
      this.tails = new Uint32Array(n);
      this.baseColor = new Uint32Array(n);
      this.baseLight = new Uint32Array(n);
      this.baseDepth = new Float32Array(n);
      this.layers = new Uint32Array(n);
    }
    if (this.frame.hdrLight && !this.baseHDR) this.baseHDR = new Float32Array(this.frame.w * this.frame.h * 3);
    if (this.count + 1 < this.capacity) return;
    const capacity = Math.max(1024, this.capacity * 2);
    const grow = (old, replacement) => {
      replacement.set(old);
      return replacement;
    };
    this.next = grow(this.next, new Uint32Array(capacity));
    this.z = grow(this.z, new Float32Array(capacity));
    this.colors = grow(this.colors, new Uint32Array(capacity));
    this.alphas = grow(this.alphas, new Float64Array(capacity));
    this.depthWrites = grow(this.depthWrites, new Uint8Array(capacity));
    this.energy = grow(this.energy, new Float64Array(capacity * 6));
    this.capacity = capacity;
  }
  opaqueDepth(i) {
    return this.heads?.[i] ? this.baseDepth[i] : this.frame.depth[i];
  }
  opaqueColor(i) {
    return this.heads?.[i] ? this.baseColor[i] : this.frame.color[i];
  }
  light() {
    return this.surfaceLight ?? this.frame.light;
  }
  hdr() {
    return this.surfaceHDR ?? this.frame.hdrLight;
  }
  writeLight(i, r, g, b, hr, hg, hb) {
    const light = pack(r, g, b), hdr = this.hdr(), j = i * 3;
    this.light()[i] = light;
    if (hdr) {
      hdr[j] = hr;
      hdr[j + 1] = hg;
      hdr[j + 2] = hb;
    }
    const overlay = this.screenLight?.[i] ?? 0;
    this.frame.light[i] = this.screenLight ? pack((light & 255) + (overlay & 255), (light >>> 8 & 255) + (overlay >>> 8 & 255), (light >>> 16 & 255) + (overlay >>> 16 & 255)) : light;
    if (this.frame.hdrLight && this.screenHDR && this.surfaceHDR) {
      this.frame.hdrLight[j] = this.surfaceHDR[j] + this.screenHDR[j];
      this.frame.hdrLight[j + 1] = this.surfaceHDR[j + 1] + this.screenHDR[j + 1];
      this.frame.hdrLight[j + 2] = this.surfaceHDR[j + 2] + this.screenHDR[j + 2];
    }
  }
  over(i, color, alpha, lr, lg, lb, hr, hg, hb) {
    const opacity = alpha * (color >>> 24) / 255, transmit = 1 - opacity, previous = this.light()[i], hdr = this.hdr(), j = i * 3;
    this.frame.color[i] = blendOver(this.frame.color[i], color, alpha);
    this.writeLight(
      i,
      (previous & 255) * transmit + lr,
      (previous >>> 8 & 255) * transmit + lg,
      (previous >>> 16 & 255) * transmit + lb,
      (hdr?.[j] ?? 0) * transmit + hr,
      (hdr?.[j + 1] ?? 0) * transmit + hg,
      (hdr?.[j + 2] ?? 0) * transmit + hb
    );
  }
  resolve(i) {
    this.metrics.resolves++;
    this.frame.color[i] = this.baseColor[i];
    const light = this.baseLight[i], j = i * 3, hdr = this.baseHDR;
    this.writeLight(i, light & 255, light >>> 8 & 255, light >>> 16 & 255, hdr?.[j] ?? 0, hdr?.[j + 1] ?? 0, hdr?.[j + 2] ?? 0);
    let depth = this.baseDepth[i];
    for (let k = this.heads[i]; k; k = this.next[k]) {
      this.metrics.recomposedFragments++;
      const e = k * 6;
      this.over(i, this.colors[k], this.alphas[k], this.energy[e], this.energy[e + 1], this.energy[e + 2], this.energy[e + 3], this.energy[e + 4], this.energy[e + 5]);
      if (this.depthWrites[k]) depth = Math.max(depth, this.z[k]);
    }
    this.frame.depth[i] = depth;
  }
  /** Surface emission uses the same coverage as its color, with unbounded linear energy. */
  put(i, depth, color, alpha, emission, emissionColor = color) {
    if (!(emission > 0)) return this.layer(i, depth, color, alpha, 0, 0, 0, 0, 0, 0);
    const opacity = alpha * (color >>> 24) / 255, amount = Math.max(0, emission) * opacity;
    return this.layer(
      i,
      depth,
      color,
      alpha,
      (emissionColor & 255) * amount,
      (emissionColor >>> 8 & 255) * amount,
      (emissionColor >>> 16 & 255) * amount,
      channelToLinear(emissionColor, 0) * amount,
      channelToLinear(emissionColor, 8) * amount,
      channelToLinear(emissionColor, 16) * amount
    );
  }
  /** Preintegrated coverage/emission for custom raster materials (e.g. volume rays). */
  layer(i, depth, color, alpha, lr, lg, lb, hr, hg, hb, depthWrite = true) {
    const z = Math.fround(depth), opacity = alpha * (color >>> 24) / 255;
    this.metrics.submitted++;
    const emissiveOnly = !depthWrite && Math.max(lr, lg, lb, hr, hg, hb) > 0;
    if (opacity <= 0 && !emissiveOnly || z < this.opaqueDepth(i)) {
      this.metrics.rejected++;
      return false;
    }
    let head = this.heads?.[i] ?? 0;
    if (opacity >= 1 && depthWrite) {
      this.metrics.accepted++;
      this.metrics.opaque++;
      while (head && this.z[head] <= z) {
        head = this.next[head];
        if (this.layers) this.layers[i]--;
      }
      if (head) {
        this.heads[i] = head;
        this.baseColor[i] = (color | 4278190080) >>> 0;
        this.baseLight[i] = pack(lr, lg, lb);
        this.baseDepth[i] = z;
        if (this.baseHDR) {
          const j = i * 3;
          this.baseHDR[j] = hr;
          this.baseHDR[j + 1] = hg;
          this.baseHDR[j + 2] = hb;
        }
        this.resolve(i);
      } else {
        if (this.heads) this.heads[i] = this.tails[i] = 0;
        if (this.layers) this.layers[i] = 0;
        this.frame.color[i] = (color | 4278190080) >>> 0;
        this.frame.depth[i] = z;
        this.writeLight(i, lr, lg, lb, hr, hg, hb);
      }
      return true;
    }
    if (this.count >= this.maxFragments) {
      this.metrics.rejected++;
      this.metrics.budgetExceeded = true;
      throw new RangeError(`Exact transparency fragment budget exceeded (${this.maxFragments}); reduce overlap or bake this effect`);
    }
    this.prepare();
    this.metrics.accepted++;
    this.metrics.transparent++;
    this.layers[i]++;
    this.metrics.maxLayersPerPixel = Math.max(this.metrics.maxLayersPerPixel, this.layers[i]);
    if (!head) {
      this.baseColor[i] = this.frame.color[i];
      this.baseLight[i] = this.light()[i];
      this.baseDepth[i] = this.frame.depth[i];
      if (this.baseHDR) {
        const hdr = this.hdr(), j = i * 3;
        this.baseHDR[j] = hdr?.[j] ?? 0;
        this.baseHDR[j + 1] = hdr?.[j + 1] ?? 0;
        this.baseHDR[j + 2] = hdr?.[j + 2] ?? 0;
      }
    }
    const k = ++this.count, e = k * 6, tail = this.tails[i];
    this.z[k] = z;
    this.colors[k] = color;
    this.alphas[k] = alpha;
    this.next[k] = 0;
    this.depthWrites[k] = +depthWrite;
    this.energy[e] = lr;
    this.energy[e + 1] = lg;
    this.energy[e + 2] = lb;
    this.energy[e + 3] = hr;
    this.energy[e + 4] = hg;
    this.energy[e + 5] = hb;
    if (!head || z >= this.z[tail]) {
      if (tail) this.next[tail] = k;
      else this.heads[i] = k;
      this.tails[i] = k;
      this.over(i, color, alpha, lr, lg, lb, hr, hg, hb);
      if (depthWrite) this.frame.depth[i] = Math.max(this.frame.depth[i], z);
    } else {
      let previous = 0, cursor = head;
      while (cursor && this.z[cursor] <= z) {
        previous = cursor;
        cursor = this.next[cursor];
      }
      this.next[k] = cursor;
      if (previous) this.next[previous] = k;
      else this.heads[i] = k;
      this.resolve(i);
    }
    return true;
  }
  /** Deliberately screen-space optical glow; never participates in surface occlusion. */
  glow(i, color, amount) {
    if (amount <= 0) return;
    this.glowRGB(
      i,
      (color & 255) * amount,
      (color >>> 8 & 255) * amount,
      (color >>> 16 & 255) * amount,
      channelToLinear(color, 0) * amount,
      channelToLinear(color, 8) * amount,
      channelToLinear(color, 16) * amount
    );
  }
  glowRGB(i, lr, lg, lb, hr, hg, hb) {
    const n = this.frame.w * this.frame.h, j = i * 3;
    if (!this.screenLight) {
      this.screenLight = new Uint32Array(n);
      this.surfaceLight = this.frame.light.slice();
    }
    if (this.frame.hdrLight && !this.screenHDR) {
      this.screenHDR = new Float32Array(n * 3);
      this.surfaceHDR = this.frame.hdrLight.slice();
    }
    const old = this.screenLight[i];
    this.screenLight[i] = pack((old & 255) + lr, (old >>> 8 & 255) + lg, (old >>> 16 & 255) + lb);
    if (this.screenHDR) {
      this.screenHDR[j] += hr;
      this.screenHDR[j + 1] += hg;
      this.screenHDR[j + 2] += hb;
    }
    const surface = this.light()[i], hdr = this.hdr();
    this.writeLight(i, surface & 255, surface >>> 8 & 255, surface >>> 16 & 255, hdr?.[j] ?? 0, hdr?.[j + 1] ?? 0, hdr?.[j + 2] ?? 0);
  }
  /** Clear only an explicitly owned optical-mask pixel, not unrelated foreground emission. */
  clearEmission(i, screen2 = false) {
    if (screen2) {
      if (this.screenLight) this.screenLight[i] = 0;
      if (this.screenHDR) this.screenHDR.fill(0, i * 3, i * 3 + 3);
    }
    if (this.heads?.[i]) {
      this.baseLight[i] = 0;
      this.baseHDR?.fill(0, i * 3, i * 3 + 3);
      for (let k = this.heads[i]; k; k = this.next[k]) this.energy.fill(0, k * 6, k * 6 + 6);
    }
    this.writeLight(i, 0, 0, 0, 0, 0, 0);
  }
  /** Refraction/postprocessing starts a new resolved pass; existing visible depth is its input. */
  adoptResolved() {
    this.heads?.fill(0);
    this.tails?.fill(0);
    this.count = 0;
    this.layers?.fill(0);
    if (this.surfaceLight) this.surfaceLight.set(this.frame.light);
    if (this.surfaceHDR && this.frame.hdrLight) this.surfaceHDR.set(this.frame.hdrLight);
    this.screenLight?.fill(0);
    this.screenHDR?.fill(0);
  }
};
var states = /* @__PURE__ */ new WeakMap();
function surfacesFor3D(frame2) {
  let state = states.get(frame2);
  if (!state) {
    state = new SurfaceFragments3D(frame2);
    states.set(frame2, state);
  }
  return state;
}
function resetSurfaces3D(frame2) {
  states.get(frame2)?.reset();
}

// src/3d/frame.ts
function color3D(color) {
  if (typeof color === "number") return color >>> 0;
  const hex = color.replace(/^#/, "");
  const value = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(value)) throw new Error(`Expected #rgb or #rrggbb: ${color}`);
  const rgb2 = parseInt(value, 16);
  return (4278190080 | (rgb2 & 255) << 16 | rgb2 & 65280 | rgb2 >>> 16 & 255) >>> 0;
}
function createFrame3D(w, h) {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) throw new RangeError("Invalid 3D frame dimensions");
  return { w, h, color: new Uint32Array(w * h), light: new Uint32Array(w * h), depth: new Float32Array(w * h) };
}
function clearFrame3D(frame2, background = "#0a1424") {
  frame2.color.fill(color3D(background));
  frame2.light.fill(0);
  frame2.hdrLight?.fill(0);
  frame2.depth.fill(-Infinity);
  resetSurfaces3D(frame2);
  return frame2;
}
function compositeFrame3D(frame2, out, glow2 = 1) {
  if (out.length < frame2.w * frame2.h * 4) throw new RangeError("RGBA output buffer is too small");
  for (let i = 0, o = 0; i < frame2.color.length; i++, o += 4) {
    const c = frame2.color[i], l = frame2.light[i];
    out[o] = Math.min(255, (c & 255) + (l & 255) * glow2);
    out[o + 1] = Math.min(255, (c >>> 8 & 255) + (l >>> 8 & 255) * glow2);
    out[o + 2] = Math.min(255, (c >>> 16 & 255) + (l >>> 16 & 255) * glow2);
    out[o + 3] = 255;
  }
  return out;
}

// src/3d/painter.ts
var BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
var LIGHT_DIRECTION = norm3([0.6, 1, -0.45]);
var MIN_PIXEL_RADIUS = Math.SQRT1_2;
var SUBPIXEL = 256;
var DEFAULT_CAMERA_3D = { yaw: 0.68, elevation: Math.PI / 5.5, zoom: 1, projection: "orthographic" };
var Painter3D = class {
  frame;
  camera;
  scale = 1;
  cy = 1;
  sy = 0;
  ce = 1;
  se = 0;
  origin = [0, 0, 0];
  warpColor;
  warpLight;
  warpDepth;
  warpHDR;
  ringCoverage;
  ringDepth;
  ringPixels = [];
  surfaces;
  transparency = { mode: "exact" };
  constructor(frame2, camera = DEFAULT_CAMERA_3D) {
    this.frame = frame2;
    this.surfaces = surfacesFor3D(frame2);
    this.camera = camera;
    this.setCamera(camera);
  }
  setCamera(camera) {
    this.camera = camera;
    this.cy = Math.cos(camera.yaw);
    this.sy = Math.sin(camera.yaw);
    this.ce = Math.cos(camera.elevation);
    this.se = Math.sin(camera.elevation);
    this.scale = Math.min(this.frame.w / 17, this.frame.h / 11) * camera.zoom;
    this.origin = camera.target ?? [0, 0, 0];
    return this;
  }
  begin(background = "#0a1424") {
    clearFrame3D(this.frame, background);
    return this;
  }
  get alphaMode() {
    return this.frame.alphaMode ?? "coverage";
  }
  set alphaMode(mode) {
    this.frame.alphaMode = mode;
  }
  /** Applies only to this painter and restores the previous policy even if the callback throws. */
  withTransparency(policy, draw) {
    if (!["exact", "cutout", "additive"].includes(policy.mode) || policy.cutoff !== void 0 && (!Number.isFinite(policy.cutoff) || policy.cutoff < 0 || policy.cutoff > 1))
      throw new RangeError("Invalid transparency policy");
    const previous = this.transparency;
    this.transparency = policy;
    try {
      draw(this);
    } finally {
      this.transparency = previous;
    }
    return this;
  }
  project(point, out) {
    const x = point[0] - this.origin[0], y = point[1] - this.origin[1], z = point[2] - this.origin[2];
    const u = x * this.cy - z * this.sy, v = x * this.sy + z * this.cy;
    const up = y * this.ce - v * this.se;
    const depth = y * this.se + v * this.ce;
    const perspective = this.camera.projection === "perspective" ? 1 / Math.max(0.3, 1 - depth * (this.camera.perspective ?? 0.025)) : 1;
    const scale = this.scale * perspective;
    const result = out ?? { x: 0, y: 0, depth: 0, scale: 0 };
    result.x = this.frame.w * 0.5 + u * scale;
    result.y = this.frame.h * 0.61 - up * scale;
    result.depth = depth;
    result.scale = scale;
    return result;
  }
  put(x, y, depth, color, alpha, emission, emissionColor = color) {
    if (x < 0 || x >= this.frame.w || y < 0 || y >= this.frame.h || alpha <= 0) return;
    const dither = this.alphaMode === "dither";
    const opacity = clamp3(alpha) * (color >>> 24) / 255;
    if (opacity <= 0 || dither && opacity < 1 && opacity <= BAYER4[(y & 3) << 2 | x & 3]) return;
    const i = y * this.frame.w + x;
    if (this.transparency.mode === "cutout") {
      if (opacity < (this.transparency.cutoff ?? 0.5)) return;
      this.surfaces.put(i, depth, (color | 4278190080) >>> 0, 1, emission, emissionColor);
      return;
    }
    if (this.transparency.mode === "additive") {
      const k = Math.max(0, emission) * opacity;
      this.surfaces.layer(
        i,
        depth,
        0,
        0,
        (emissionColor & 255) * k,
        (emissionColor >>> 8 & 255) * k,
        (emissionColor >>> 16 & 255) * k,
        channelToLinear(emissionColor, 0) * k,
        channelToLinear(emissionColor, 8) * k,
        channelToLinear(emissionColor, 16) * k,
        false
      );
      return;
    }
    this.surfaces.put(i, depth, dither ? (color | 4278190080) >>> 0 : color, dither ? 1 : clamp3(alpha), emission, emissionColor);
  }
  /** A custom material sample using the same surface coverage and depth as primitives. */
  pixel(x, y, depth, color, alpha = 1, emission = 0, emissionColor = color) {
    this.put(x, y, depth, color3D(color), alpha, emission, color3D(emissionColor));
  }
  /** Opaque depth only; translucent surfaces must not truncate a volume ray. */
  opaqueDepthAt(x, y) {
    return this.surfaces.opaqueDepth(y * this.frame.w + x);
  }
  /** Backing material before queued transparent samples, for custom ray rasterizers. */
  opaqueColorAt(x, y) {
    return this.surfaces.opaqueColor(y * this.frame.w + x);
  }
  /** Explicit optical glow at one pixel. Its light is independent of surface visibility. */
  screenLight(x, y, color, strength = 1) {
    if (x >= 0 && x < this.frame.w && y >= 0 && y < this.frame.h) this.surfaces.glow(y * this.frame.w + x, color3D(color), strength);
  }
  /** Optical post effects can keep their already-integrated linear radiance unclamped. */
  screenLightRGB(x, y, lr, lg, lb, hr, hg, hb) {
    this.surfaces.glowRGB(y * this.frame.w + x, lr, lg, lb, hr, hg, hb);
  }
  /** Only for a known owned mask (e.g. an event horizon); foreground ownership is caller-tested. */
  clearEmission(x, y, screen2 = false) {
    this.surfaces.clearEmission(y * this.frame.w + x, screen2);
  }
  /** Capture explicit direct raster writes as the input to a new resolved post pass. */
  adoptResolved() {
    this.surfaces.adoptResolved();
    return this;
  }
  /** Preintegrated material ray. The caller supplies premultiplied legacy and linear light. */
  volumePixel(x, y, depth, color, alpha, lr, lg, lb, hr, hg, hb) {
    this.surfaces.layer(y * this.frame.w + x, depth, color, alpha, lr, lg, lb, hr, hg, hb, false);
  }
  /** A single voxel-like camera-facing particle. Radius is in world units, not screen pixels. */
  point(position, radius, color, alpha = 1, emission = 0) {
    if (radius <= 0 || alpha <= 0) return;
    const p = this.project(position), projectedRadius = radius * p.scale, c = color3D(color);
    if (projectedRadius < MIN_PIXEL_RADIUS) {
      this.put(Math.floor(p.x), Math.floor(p.y), p.depth, c, alpha, emission);
      return;
    }
    const r = projectedRadius, dither = this.alphaMode === "dither";
    const x0 = Math.max(0, Math.floor(p.x - r)), x1 = Math.min(this.frame.w - 1, Math.ceil(p.x + r));
    const y0 = Math.max(0, Math.floor(p.y - r)), y1 = Math.min(this.frame.h - 1, Math.ceil(p.y + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = ((x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2) / (r * r);
      if (d > 1) continue;
      this.put(x, y, p.depth, c, alpha * (dither ? 1 - clamp3((d - 0.65) * 1.7) : 1), emission);
    }
  }
  /** Pixel-crisp swept capsule; analytic screen-space coverage with interpolated depth. */
  line(a, b, radius, color, alpha = 1, emission = 0) {
    if (radius <= 0 || alpha <= 0) return;
    const p = this.project(a), q = this.project(b);
    this.lineProjected(p, q, radius, color, alpha, emission);
  }
  /** Reuse camera projections shared by a mesh/edge set. Inputs are borrowed, never modified. */
  lineProjected(p, q, radius, color, alpha = 1, emission = 0) {
    if (radius <= 0 || alpha <= 0) return;
    const c = color3D(color);
    this.rasterLine(p, q, radius, (x, y, depth, coverage) => this.put(x, y, depth, c, alpha * coverage, emission));
  }
  rasterLine(p, q, radius, write) {
    const bound = Math.max(MIN_PIXEL_RADIUS, radius * Math.max(p.scale, q.scale));
    const dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
    const w = this.frame.w, h = this.frame.h, perspective = this.camera.projection === "perspective", dither = this.alphaMode === "dither";
    const x0 = Math.max(0, Math.ceil(Math.min(p.x, q.x) - bound - 0.5)), x1 = Math.min(w - 1, Math.floor(Math.max(p.x, q.x) + bound - 0.5));
    const y0 = Math.max(0, Math.ceil(Math.min(p.y, q.y) - bound - 0.5)), y1 = Math.min(h - 1, Math.floor(Math.max(p.y, q.y) + bound - 0.5));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const t = d2 > 0 ? clamp3(((px - p.x) * dx + (py - p.y) * dy) / d2) : 0;
      const scale = p.scale + (q.scale - p.scale) * t, r = Math.max(MIN_PIXEL_RADIUS, radius * scale);
      const d = ((px - p.x - t * dx) ** 2 + (py - p.y - t * dy) ** 2) / (r * r);
      if (d > 1) continue;
      const u = perspective ? t * q.scale / scale : t;
      write(x, y, p.depth + (q.depth - p.depth) * u, dither ? 1 - clamp3((d - 0.75) * 2) : 1);
    }
  }
  /** Filled, z-buffered pixel triangle; low-poly geometry remains solid under orbit. */
  triangle(a, b, c, color, alpha = 1, emission = 0) {
    if (alpha <= 0) return;
    this.triangleProjected(this.project(a), this.project(b), this.project(c), color, alpha, emission);
  }
  /** Raster a triangle from cached shared-vertex projections. */
  triangleProjected(A, B, C, color, alpha = 1, emission = 0) {
    if (alpha <= 0) return;
    const w = this.frame.w, h = this.frame.h;
    const ax = Math.round(A.x * SUBPIXEL), ay = Math.round(A.y * SUBPIXEL);
    let bx = Math.round(B.x * SUBPIXEL), by = Math.round(B.y * SUBPIXEL);
    let cx = Math.round(C.x * SUBPIXEL), cy = Math.round(C.y * SUBPIXEL);
    let det = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (det === 0) return;
    if (det < 0) {
      [B, C] = [C, B];
      [bx, cx] = [cx, bx];
      [by, cy] = [cy, by];
      det = -det;
    }
    const x0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx) / SUBPIXEL - 0.5));
    const x1 = Math.min(w - 1, Math.floor(Math.max(ax, bx, cx) / SUBPIXEL - 0.5));
    const y0 = Math.max(0, Math.ceil(Math.min(ay, by, cy) / SUBPIXEL - 0.5));
    const y1 = Math.min(h - 1, Math.floor(Math.max(ay, by, cy) / SUBPIXEL - 0.5));
    const abTop = by < ay || by === ay && bx > ax;
    const bcTop = cy < by || cy === by && cx > bx;
    const caTop = ay < cy || ay === cy && ax > cx;
    const col = color3D(color), perspective = this.camera.projection === "perspective";
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = (x + 0.5) * SUBPIXEL, py = (y + 0.5) * SUBPIXEL;
      const ab = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      const bc = (cx - bx) * (py - by) - (cy - by) * (px - bx);
      const ca = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
      if (ab < 0 || ab === 0 && !abTop || bc < 0 || bc === 0 && !bcTop || ca < 0 || ca === 0 && !caTop) continue;
      let u = bc / det, v = ca / det, t = ab / det;
      if (perspective) {
        u *= A.scale;
        v *= B.scale;
        t *= C.scale;
        const inv = 1 / (u + v + t);
        u *= inv;
        v *= inv;
        t *= inv;
      }
      this.put(x, y, u * A.depth + v * B.depth + t * C.depth, col, alpha, emission);
    }
  }
  /** Flat-lit facet, quantized to a discrete color ramp instead of smooth Gouraud shading. */
  facet(a, b, c, ramp, alpha = 1, emission = 0) {
    const n = norm3(cross3(sub3(b, a), sub3(c, a)));
    const brightness = Math.abs(dot3(n, LIGHT_DIRECTION));
    const idx = Math.floor(clamp3(0.22 + brightness * 0.7) * (ramp.length - 1));
    this.triangle(a, b, c, ramp[idx], alpha, emission);
  }
  ring(radius, width2, color, opacity = 1, emission = 0, height2 = 0.03, segments) {
    if (radius <= 0 || width2 <= 0 || opacity <= 0) return;
    const center = this.project([0, height2, 0]);
    const nearDepth = center.depth + radius * Math.abs(this.ce);
    const projectedRadius = radius * this.scale * (this.camera.projection === "perspective" ? 1 / Math.max(0.3, 1 - nearDepth * (this.camera.perspective ?? 0.025)) : 1);
    const adaptive = Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - 0.25 / Math.max(0.25, projectedRadius))));
    const count = Math.max(12, adaptive, Math.floor(segments ?? 0));
    const n = this.frame.w * this.frame.h;
    this.ringCoverage ??= new Float32Array(n);
    this.ringDepth ??= new Float32Array(n);
    const coverage = this.ringCoverage, depth = this.ringDepth, pixels = this.ringPixels, w = this.frame.w;
    const collect = (x, y, z, a2) => {
      const i = y * w + x;
      if (coverage[i] === 0) {
        pixels.push(i);
        depth[i] = z;
      } else depth[i] = Math.max(depth[i], z);
      coverage[i] = Math.max(coverage[i], a2);
    };
    let a = this.project([radius, height2, 0]);
    for (let i = 1; i <= count; i++) {
      const ang = i * TAU3 / count, b = this.project([Math.cos(ang) * radius, height2, Math.sin(ang) * radius]);
      this.rasterLine(a, b, width2, collect);
      a = b;
    }
    const c = color3D(color);
    for (const i of pixels) {
      this.put(i % w, Math.floor(i / w), depth[i], c, opacity * coverage[i], emission);
      coverage[i] = 0;
    }
    pixels.length = 0;
  }
  /** Explicit screen-space optical glow; unlike surface emission it survives foreground geometry. */
  glow(position, radius, color, strength = 1) {
    if (radius <= 0 || strength <= 0) return;
    const p = this.project(position), r = Math.max(1, radius * p.scale), c = color3D(color), w = this.frame.w, h = this.frame.h;
    const x0 = Math.max(0, Math.floor(p.x - r)), x1 = Math.min(w - 1, Math.ceil(p.x + r));
    const y0 = Math.max(0, Math.floor(p.y - r)), y1 = Math.min(h - 1, Math.ceil(p.y + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = ((x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2) / (r * r);
      if (d >= 1) continue;
      this.surfaces.glow(y * w + x, c, (1 - d) ** 2 * strength);
    }
  }
  /** Depth-tested opaque sphere; the front hemisphere occludes color and surface emission. */
  sphere(center, radius, fill, edge = fill) {
    if (radius <= 0) return;
    const p = this.project(center), r = radius * p.scale;
    if (r < 0.5) return;
    const inner = color3D(fill), rim = color3D(edge), w = this.frame.w, h = this.frame.h;
    const x0 = Math.max(0, Math.floor(p.x - r)), x1 = Math.min(w - 1, Math.ceil(p.x + r));
    const y0 = Math.max(0, Math.floor(p.y - r)), y1 = Math.min(h - 1, Math.ceil(p.y + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - p.x) / r, dy = (y + 0.5 - p.y) / r, d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      this.put(x, y, p.depth + radius * Math.sqrt(Math.max(0, 1 - d2)), (d2 > 0.865 ? rim : inner) | 4278190080, 1, 0);
    }
  }
  /** Pixel-sampled artistic lens approximation, applied BEFORE the opaque horizon.
   * Reuse snapshots while warping color, depth, legacy light and HDR radiance together. */
  lensWarp(center, horizon, reach, strength = 1) {
    if (horizon <= 0 || reach <= horizon || strength <= 0) return;
    const p = this.project(center), maxR = reach * p.scale, inner = horizon * p.scale;
    const w = this.frame.w, h = this.frame.h;
    const x0 = Math.max(0, Math.floor(p.x - maxR)), x1 = Math.min(w - 1, Math.ceil(p.x + maxR));
    const y0 = Math.max(0, Math.floor(p.y - maxR)), y1 = Math.min(h - 1, Math.ceil(p.y + maxR));
    if (x0 > x1 || y0 > y1) return;
    const n = w * h;
    if (!this.warpColor || this.warpColor.length !== n) {
      this.warpColor = new Uint32Array(n);
      this.warpLight = new Uint32Array(n);
      this.warpDepth = new Float32Array(n);
    }
    const c = this.warpColor, l = this.warpLight, z = this.warpDepth;
    c.set(this.frame.color);
    l.set(this.frame.light);
    z.set(this.frame.depth);
    const hdr = this.frame.hdrLight;
    if (hdr) {
      if (!this.warpHDR || this.warpHDR.length !== hdr.length) this.warpHDR = new Float32Array(hdr.length);
      this.warpHDR.set(hdr);
    }
    const hdrCopy = hdr ? this.warpHDR : void 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - p.x, dy = y + 0.5 - p.y, r = Math.hypot(dx, dy);
      if (r <= inner * 0.9 || r >= maxR) continue;
      const q = (r - inner * 0.9) / (maxR - inner * 0.9);
      const bend = strength * (1 - q) ** 2 * inner * 0.19;
      const turn = strength * (1 - q) ** 2 * 0.15;
      const scale = (r + bend) / r, cs = Math.cos(turn), sn = Math.sin(turn);
      const sx = Math.floor(p.x + (dx * cs - dy * sn) * scale);
      const sy = Math.floor(p.y + (dx * sn + dy * cs) * scale);
      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
      const i = y * w + x, j = sy * w + sx;
      this.frame.color[i] = c[j];
      this.frame.light[i] = l[j];
      this.frame.depth[i] = z[j];
      if (hdr && hdrCopy) {
        const a = i * 3, b = j * 3;
        hdr[a] = hdrCopy[b];
        hdr[a + 1] = hdrCopy[b + 1];
        hdr[a + 2] = hdrCopy[b + 2];
      }
    }
    this.surfaces.adoptResolved();
  }
  /** Expanding air-pressure shell. Refracts existing pixels, including HDR and depth,
   * with a compression/rarefaction pair; clips against the floor and nearer surfaces.
   * Radius/width/displacement are world units. No persistent opaque ring is painted. */
  pressureWarp(center, radius, width2, displacement, air) {
    if (!center.every(Number.isFinite) || ![radius, width2, displacement].every(Number.isFinite) || radius <= 0 || width2 <= 0 || displacement <= 0) return;
    const at = this.project(center), w = this.frame.w, h = this.frame.h, scale = at.scale;
    const tint = air ? color3D(air.tint) : 0, airOpacity = air && Number.isFinite(air.opacity) ? clamp3(air.opacity) : 0;
    if (!(Number.isFinite(scale) && scale > 0) || ![at.x, at.y, at.depth, radius * radius].every(Number.isFinite)) return;
    const reach = radius * scale, band = Math.min(width2, radius) * scale, amount = Math.min(displacement * scale, 6);
    if (![reach, band, amount].every(Number.isFinite) || band <= 0) return;
    const perspective = this.camera.projection === "perspective" ? this.camera.perspective ?? 0.025 : 0;
    let minX = at.x - reach, maxX = at.x + reach, minY = at.y - reach, maxY = at.y + reach;
    if (perspective !== 0) {
      minX = minY = Infinity;
      maxX = maxY = -Infinity;
      for (let i = 0; i < 8; i++) {
        const q = this.project([center[0] + (i & 1 ? radius : -radius), center[1] + (i & 2 ? radius : -radius), center[2] + (i & 4 ? radius : -radius)]);
        minX = Math.min(minX, q.x);
        maxX = Math.max(maxX, q.x);
        minY = Math.min(minY, q.y);
        maxY = Math.max(maxY, q.y);
      }
    }
    if (![minX, maxX, minY, maxY].every(Number.isFinite)) return;
    const x0 = Math.max(0, Math.floor(minX)), x1 = Math.min(w - 1, Math.ceil(maxX));
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(h - 1, Math.ceil(maxY));
    if (x0 > x1 || y0 > y1) return;
    const n = w * h;
    if (!this.warpColor || this.warpColor.length !== n) {
      this.warpColor = new Uint32Array(n);
      this.warpLight = new Uint32Array(n);
      this.warpDepth = new Float32Array(n);
    }
    const color = this.warpColor, light = this.warpLight, depth = this.warpDepth, hdr = this.frame.hdrLight;
    color.set(this.frame.color);
    light.set(this.frame.light);
    depth.set(this.frame.depth);
    if (hdr) {
      if (!this.warpHDR || this.warpHDR.length !== hdr.length) this.warpHDR = new Float32Array(hdr.length);
      this.warpHDR.set(hdr);
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - at.x, dy = y + 0.5 - at.y, r = Math.hypot(dx, dy);
      let q = (reach - r) / band, front = Math.sqrt(Math.max(0, radius * radius - (r / scale) ** 2));
      let surface = at.depth + front, worldY = center[1] - dy / scale * this.ce + front * this.se;
      if (perspective !== 0) {
        const u = (x + 0.5 - w * 0.5) / this.scale, v = (h * 0.61 - y - 0.5) / this.scale;
        const ox = this.cy * u - this.sy * this.se * v, oy = this.ce * v, oz = -this.sy * u - this.cy * this.se * v;
        const rx = this.sy * this.ce - ox * perspective, ry = this.se - oy * perspective, rz = this.cy * this.ce - oz * perspective;
        const bx = this.origin[0] + ox - center[0], by = this.origin[1] + oy - center[1], bz = this.origin[2] + oz - center[2];
        const a = rx * rx + ry * ry + rz * rz, b = bx * rx + by * ry + bz * rz, c = bx * bx + by * by + bz * bz;
        const perpendicular = Math.max(0, c - b * b / a), disc = radius * radius - perpendicular;
        if (disc < 0 || !Number.isFinite(disc)) continue;
        q = (radius - Math.sqrt(perpendicular)) / Math.min(width2, radius);
        surface = -b / a + Math.sqrt(disc / a);
        worldY = this.origin[1] + oy + ry * surface;
        if (1 - surface * perspective < 0.3) continue;
      }
      if (!Number.isFinite(q) || q <= 0 || q >= 1 || r < 0.5 || worldY < 0.02) continue;
      const i = y * w + x;
      if (depth[i] > surface) continue;
      const profile2 = Math.sin(q * Math.PI * 2) * Math.sin(q * Math.PI);
      const shift = profile2 * amount, sx = Math.floor(x + 0.5 + dx / r * shift), sy = Math.floor(y + 0.5 + dy / r * shift);
      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
      const j = sy * w + sx;
      if (depth[j] > surface) continue;
      this.frame.color[i] = color[j];
      this.frame.light[i] = light[j];
      this.frame.depth[i] = depth[j];
      if (airOpacity > 0) {
        const grazing = Math.sin(q * Math.PI) ** 3 * clamp3(-dy / reach * 1.1 + 0.2);
        this.frame.color[i] = blendOver(this.frame.color[i], tint, airOpacity * grazing);
      }
      if (hdr && this.warpHDR) {
        hdr[i * 3] = this.warpHDR[j * 3];
        hdr[i * 3 + 1] = this.warpHDR[j * 3 + 1];
        hdr[i * 3 + 2] = this.warpHDR[j * 3 + 2];
      }
    }
    this.surfaces.adoptResolved();
  }
  grid(extent = 8, step = 1) {
    if (!Number.isFinite(extent) || extent < 0 || !Number.isFinite(step) || step <= 0)
      throw new RangeError("grid extent must be non-negative and step must be positive");
    for (let i = -extent; i <= extent; i += step) {
      const color = Math.abs(i) < 1e-3 ? "#294866" : "#1d304c";
      this.line([i, -0.055, -extent], [i, -0.055, extent], 0.012, color, 0.35);
      this.line([-extent, -0.055, i], [extent, -0.055, i], 0.012, color, 0.35);
    }
  }
  /** A 5-facet solid crystal grown from the XZ plane (with optional directional lean). */
  crystal(origin, height2, width2, angle, lean, ramp) {
    if (height2 <= 0.015 || width2 <= 0) return;
    const tip = [origin[0] + Math.cos(angle) * lean, origin[1] + height2, origin[2] + Math.sin(angle) * lean];
    const base = [];
    for (let i = 0; i < 5; i++) {
      const a = angle + i * TAU3 / 5;
      base.push([origin[0] + Math.cos(a) * width2, origin[1], origin[2] + Math.sin(a) * width2]);
    }
    for (let i = 0; i < base.length; i++) this.facet(base[i], base[(i + 1) % 5], tip, ramp);
    const rim = ramp[Math.max(0, ramp.length - 2)];
    for (let i = 0; i < base.length; i++) {
      this.line(base[i], tip, 0.025, rim, 0.85, 0.1);
      this.line(base[i], base[(i + 1) % 5], 0.012, ramp[Math.max(0, ramp.length - 4)], 0.8);
    }
    this.line(origin, tip, 0.03, ramp[ramp.length - 1], 0.65, 0.12);
  }
};

// src/3d/particles.ts
function accelerationTime(dt, drag, travel) {
  const z = drag * dt;
  return Math.abs(z) < 1e-3 ? dt * dt * (0.5 + z * (-1 / 6 + z * (1 / 24 + z * (-1 / 120 + z / 720)))) : (dt - travel) / drag;
}
var Particles3D = class {
  constructor(ground = 0, limit = 2e3) {
    this.ground = ground;
    this.limit = limit;
  }
  list = [];
  renderOrder = [];
  renderDepth = [];
  spawn(p) {
    if (this.list.length >= this.limit || p.life <= 0) return;
    this.list.push({
      x: p.position[0],
      y: p.position[1],
      z: p.position[2],
      vx: p.velocity[0],
      vy: p.velocity[1],
      vz: p.velocity[2],
      max: p.life,
      life: p.life,
      radius: p.radius,
      color: p.color,
      trailAge: 0,
      ramp: p.ramp,
      gravity: p.gravity ?? 0,
      drag: p.drag ?? 0,
      bounce: p.bounce ?? 0,
      emission: p.emission ?? 0,
      style: p.style ?? "point"
    });
  }
  clear() {
    this.list.length = 0;
  }
  update(dt) {
    let write = 0;
    for (let read = 0; read < this.list.length; read++) {
      const p = this.list[read];
      p.life -= dt;
      if (p.life <= 0) continue;
      const damping = Math.exp(-p.drag * dt);
      const travel = p.drag === 0 ? dt : -Math.expm1(-p.drag * dt) / p.drag;
      const fall = accelerationTime(dt, p.drag, travel);
      p.x += p.vx * travel;
      p.z += p.vz * travel;
      p.y += p.vy * travel - p.gravity * fall;
      p.vx *= damping;
      p.vz *= damping;
      p.vy = p.vy * damping - p.gravity * travel;
      p.trailAge += dt;
      if (p.y < this.ground && p.vy < 0) {
        p.y = this.ground;
        p.trailAge = 0;
        p.vy = -p.vy * p.bounce;
        p.vx *= 0.65;
        p.vz *= 0.65;
        if (Math.abs(p.vy) < 0.08) p.vy = 0;
      }
      this.list[write++] = p;
    }
    this.list.length = write;
  }
  draw(painter2) {
    const order = this.renderOrder, depth = this.renderDepth, position = [0, 0, 0];
    const count = this.list.length;
    order.length = depth.length = count;
    for (let i = 0; i < count; i++) {
      const p = this.list[i];
      position[0] = p.x;
      position[1] = p.y;
      position[2] = p.z;
      order[i] = i;
      depth[i] = painter2.project(position).depth;
    }
    order.sort((a, b) => depth[a] - depth[b] || a - b);
    for (const i of order) {
      const p = this.list[i];
      const age = 1 - p.life / p.max, opacity = 1 - smooth3(0.6, 1, age);
      const color = p.ramp?.[Math.min(p.ramp.length - 1, Math.floor(age * p.ramp.length))] ?? p.color;
      const at = [p.x, p.y, p.z];
      const size = p.radius * (1 - 0.4 * clamp3(age));
      if (p.style === "spark") {
        const dt = -Math.min(0.035 * (1 - age), p.trailAge);
        const travel = p.drag === 0 ? dt : -Math.expm1(-p.drag * dt) / p.drag;
        const fall = accelerationTime(dt, p.drag, travel);
        const tail = [p.x + p.vx * travel, p.y + p.vy * travel - p.gravity * fall, p.z + p.vz * travel];
        painter2.line(at, tail, size * 0.65, color, opacity, p.emission * (1 - age));
      } else if (p.style === "shard") {
        painter2.line([p.x - size * 0.3, p.y, p.z], [p.x + size * 0.3, p.y + size * 2.2, p.z + size * 0.3], size, color, opacity, p.emission);
      } else {
        painter2.point(at, size, color, opacity, p.emission * (1 - age));
      }
    }
  }
};

// src/3d/fx.ts
function createFx3D(mod, options = {}) {
  const opts = { ...mod.meta.options, ...options };
  const hz = 120, tick = 1 / hz;
  let impl = mod.create(opts), steps = 0, accumulator = 0, nextCue = 0;
  const cues = [...mod.meta.cues ?? []].filter((cue) => cue.at >= 0).sort((a, b) => a.at - b.at);
  const pending = [];
  const durationSteps = Math.max(1, Math.ceil(mod.meta.duration * hz));
  const advance = () => {
    if (mod.meta.loop && steps >= durationSteps) {
      impl = mod.create(opts);
      steps = 0;
      nextCue = 0;
    }
    if (!mod.meta.loop && steps >= durationSteps) return;
    impl.update(tick);
    steps++;
    const to = steps / hz;
    while (nextCue < cues.length && cues[nextCue].at <= to + 1e-9) pending.push(cues[nextCue++]);
  };
  const reset = () => {
    impl = mod.create(opts);
    steps = 0;
    accumulator = 0;
    nextCue = 0;
    pending.length = 0;
  };
  return {
    meta: mod.meta,
    options: opts,
    get t() {
      return Math.min(steps * tick + accumulator, mod.meta.duration);
    },
    update(dt) {
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be a finite, non-negative number");
      if (!mod.meta.loop && steps >= durationSteps) return;
      accumulator += dt;
      let n = Math.floor((accumulator + 1e-10) / tick);
      accumulator -= n * tick;
      if (!mod.meta.loop && n >= durationSteps - steps) {
        n = durationSteps - steps;
        accumulator = 0;
      }
      while (n-- > 0) advance();
    },
    draw(painter2) {
      impl.draw(painter2);
    },
    camera(base) {
      return impl.camera?.(base) ?? base;
    },
    restart(next) {
      if (next) Object.assign(opts, next);
      reset();
    },
    seek(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Invalid seek position");
      reset();
      const ticks = Math.floor(Math.min(seconds, mod.meta.duration) * hz + 1e-10);
      for (let i = 0; i < ticks; i++) advance();
      accumulator = Math.max(0, Math.min(seconds, mod.meta.duration) - ticks / hz);
      while (nextCue < cues.length && cues[nextCue].at <= Math.min(seconds, mod.meta.duration) + 1e-9) nextCue++;
      pending.length = 0;
    },
    drainCues() {
      return pending.splice(0, pending.length);
    },
    stage() {
      let label = "";
      for (const s of mod.meta.stages ?? []) if (s.at <= steps / hz) label = s.label;
      return label;
    },
    done() {
      return !mod.meta.loop && steps >= durationSteps;
    }
  };
}

// src/3d/effects/frost-nova.ts
var frost_nova_exports = {};
__export(frost_nova_exports, {
  create: () => create,
  meta: () => meta
});
var meta = {
  id: "ice/frost-nova-3d",
  name: "Frost Nova 3D",
  description: "A six-armed snowflake condenses, releases a circular shockwave, erupts into rings of physical ice and melts into drifting frost.",
  duration: 4.4,
  loop: false,
  stages: [
    { at: 0, label: "CHARGE" },
    { at: 0.46, label: "RELEASE" },
    { at: 1.25, label: "CRYSTALLIZE" },
    { at: 2.5, label: "MELT" },
    { at: 3.7, label: "FADE" }
  ],
  cues: [{ at: 0.46, type: "flash", value: 1 }, { at: 0.49, type: "shake", value: 0.24 }, { at: 0.52, type: "hit", value: 1 }],
  options: {
    seed: 7439,
    reach: 5.9,
    intensity: 1,
    palette: ["#10203d", "#19365d", "#275688", "#367bb0", "#51a0cc", "#71c9e8", "#b0edfb", "#e0f9ff", "#ffffff"]
  }
};
var RELEASE = 0.46;
var SPREAD = 0.79;
var HOLD = 2.5;
function create(options) {
  const rng = new Rng3D(options.seed), reach = Math.max(0.5, options.reach), intensity = Math.max(0.1, options.intensity);
  const palette = options.palette;
  const crystalPalette = palette.slice(2), burstPalette = palette.slice(5);
  const sites = [], particles = new Particles3D(0, 2e3);
  for (let ring = 0; ring < 3; ring++) {
    const count = [12, 20, 28][ring];
    for (let i = 0; i < count; i++) {
      const angle = (i + rng.range(-0.17, 0.17)) * TAU3 / count;
      const radius = reach / 5.9 * ([1.7, 3.2, 4.8][ring] + rng.range(-0.4, 0.4));
      const height2 = [2.5, 1.6, 0.95][ring] * rng.range(0.65, 1.35) * intensity;
      const q = clamp3(radius / reach);
      sites.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        r: radius,
        angle,
        h: height2,
        width: height2 * rng.range(0.18, 0.28),
        tilt: height2 * rng.range(-0.25, 0.25),
        start: RELEASE + SPREAD * (1 - Math.cbrt(Math.max(0, 1 - q))) + rng.range(-0.03, 0.08),
        phase: rng.range(0, TAU3),
        erupted: false,
        back: ring === 2
      });
    }
  }
  let t = 0, released = false;
  const wave = () => reach * outCubic3((t - RELEASE) / SPREAD);
  const burst = () => {
    for (let i = 0; i < Math.round(210 * intensity); i++) {
      const angle = rng.range(0, TAU3), speed = rng.range(1.5, 8.5), vy = rng.range(1.2, 6);
      particles.spawn({
        position: [rng.range(-0.2, 0.2), rng.range(0.8, 2.4), rng.range(-0.2, 0.2)],
        velocity: [Math.cos(angle) * speed, vy, Math.sin(angle) * speed],
        life: rng.range(0.6, 1.8),
        radius: rng.range(0.025, 0.095),
        gravity: rng.range(5, 10),
        bounce: 0.22,
        drag: 0.55,
        color: palette[rng.int(5, 8)],
        emission: 0.15,
        style: rng.chance(0.55) ? "spark" : "shard"
      });
    }
  };
  return {
    update(dt) {
      t += dt;
      if (!released && t >= RELEASE) {
        released = true;
        burst();
      }
      for (const site of sites) if (!site.erupted && t >= site.start) {
        site.erupted = true;
        for (let i = 0; i < 2 + Math.round(site.h * 2); i++) {
          const angle = site.angle + rng.range(-1.5, 1.5), speed = rng.range(1.4, 4.2);
          particles.spawn({
            position: [site.x, 0.04, site.z],
            velocity: [Math.cos(angle) * speed, rng.range(1, 5.5), Math.sin(angle) * speed],
            life: rng.range(0.6, 1.2),
            radius: rng.range(0.03, 0.085),
            gravity: 7.5,
            bounce: 0.28,
            drag: 0.28,
            color: rng.pick(burstPalette),
            emission: 0.1,
            style: rng.chance(0.6) ? "shard" : "point"
          });
        }
      }
      if (t > RELEASE + 0.2 && t < HOLD && rng.chance(0.24)) {
        const site = rng.pick(sites);
        if (site.erupted) particles.spawn({
          position: [site.x + rng.range(-0.1, 0.1), rng.range(0.2, site.h), site.z + rng.range(-0.1, 0.1)],
          velocity: [rng.range(-0.3, 0.3), rng.range(0.05, 0.5), rng.range(-0.3, 0.3)],
          life: rng.range(0.35, 0.8),
          radius: rng.range(0.025, 0.065),
          color: palette[8],
          emission: 0.2
        });
      }
      if (t > HOLD && t < 3.25 && rng.chance(0.4)) {
        const s = rng.pick(sites);
        particles.spawn({
          position: [s.x, rng.range(0.1, Math.max(0.2, s.h * (1 - smooth3(HOLD, 3.7, t)))), s.z],
          velocity: [rng.range(-0.7, 0.7), -rng.range(0.1, 0.9), rng.range(-0.7, 0.7)],
          life: rng.range(0.5, 0.85),
          radius: rng.range(0.025, 0.065),
          gravity: 1.2,
          color: palette[5],
          bounce: 0.15
        });
      }
      particles.update(dt);
    },
    draw(p) {
      const fade = 1 - smooth3(3.2, 4.4, t), fr = t < RELEASE ? 0 : wave();
      if (t >= RELEASE) {
        const ground = 1 - smooth3(2.7, 4.05, t);
        for (let j = 0; j < 4; j++) p.ring(fr * (0.62 + j * 0.125), 0.025, palette[3 + j % 3], ground * 0.55, 0.025, 0.022 + j * 3e-3, 80);
        if (t < 1.7) {
          const shockFade = 1 - smooth3(0.9, 1.7, t);
          p.ring(fr, 0.075, palette[7], shockFade, 0.22 * shockFade, 0.08, 112);
        }
        for (let i = 0; i < 180; i++) {
          const a = i * 2.3999632297, radius = fr * Math.sqrt(i / 180) * 0.92;
          const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
          if (radius > fr || ground <= 0) continue;
          p.point([x, 5e-3, z], 0.018, palette[i % 8 > 4 ? 6 : 4], ground * 0.22, 0);
        }
      }
      for (const site of sites) {
        const growth = clamp3(outBack3((t - site.start) / 0.13), 0, 1.14);
        const melt = 1 - smooth3(HOLD, 3.72, t);
        if (growth <= 0 || melt <= 0) continue;
        const h = site.h * growth * melt, width2 = site.width * (0.85 + growth * 0.15) * (1 - 0.45 * (1 - melt));
        p.crystal([site.x, 0.02, site.z], h, width2, site.angle + site.phase * 0.2, site.tilt * growth * melt, crystalPalette);
        if (site.h > 1.5 && melt > 0.3) {
          const side = [site.x + Math.sin(site.angle) * 0.28, h * 0.6, site.z + Math.cos(site.angle) * 0.28];
          p.line([site.x, h * 0.3, site.z], side, 0.045, palette[6], melt * 0.8, 0.07);
        }
        const shimmer = Math.sin(t * 6 + site.phase * 3);
        if (shimmer > 0.92) {
          const top = [site.x + Math.cos(site.angle) * site.tilt * melt, h, site.z + Math.sin(site.angle) * site.tilt * melt];
          p.point(top, 0.085, palette[8], 0.9 * fade, 0.25);
          p.glow(top, 0.26, palette[6], 0.08 * fade);
        }
      }
      if (t < RELEASE) {
        const k = clamp3(t / RELEASE), r = (0.38 + 0.8 * k * k) * (1 + Math.sin(t * 25) * 0.06);
        for (let arm = 0; arm < 6; arm++) {
          const angle = t * 5 + arm * TAU3 / 6;
          const a = [0, 1.95, 0];
          const b = [Math.cos(angle) * r, 1.95, Math.sin(angle) * r];
          p.line(a, b, 0.038, palette[7], 0.85, 0.16);
          for (const sign of [-1, 1]) {
            const start = [Math.cos(angle) * r * 0.65, 1.95, Math.sin(angle) * r * 0.65];
            const end = [start[0] + Math.cos(angle + sign * 0.75) * r * 0.28, 1.95, start[2] + Math.sin(angle + sign * 0.75) * r * 0.28];
            p.line(start, end, 0.025, palette[6], 0.75);
          }
        }
        p.point([0, 1.95, 0], 0.18, palette[8], 1, 0.4);
        p.glow([0, 1.95, 0], 1.6, palette[5], 0.22 + 0.16 * k);
      } else if (t < 0.92) {
        const releaseFade = 1 - smooth3(RELEASE, 0.92, t);
        p.point([0, 1.95, 0], 0.2 + releaseFade * 0.75, palette[8], releaseFade, 0.4);
        p.glow([0, 1.95, 0], 2.8, palette[6], 0.42 * releaseFade);
      }
      particles.draw(p);
      if (t > RELEASE && t < 3.5) {
        const k = (1 - smooth3(2.7, 3.5, t)) * (0.85 + 0.15 * Math.sin(t * 3));
        for (let i = 0; i < 6; i++) {
          const a = i * TAU3 / 6;
          p.glow([Math.cos(a) * fr * 0.72, 0.15, Math.sin(a) * fr * 0.72], 0.85, palette[4], 0.07 * k);
        }
      }
    }
  };
}

// src/3d/effects/arc-slash.ts
var arc_slash_exports = {};
__export(arc_slash_exports, {
  create: () => create2,
  meta: () => meta2
});
var meta2 = {
  id: "melee/arc-slash-3d",
  name: "Arc Slash 3D",
  description: "Two curved ribbon surfaces sweep in real 3D, with a cool trailing edge and hot sparks thrown from the tip.",
  duration: 1.25,
  loop: false,
  options: { seed: 81, radius: 3.25, palette: ["#203365", "#2f5ba4", "#3d8ad3", "#63d1ed", "#b2f2ff", "#ffffff"] },
  stages: [{ at: 0, label: "WINDUP" }, { at: 0.13, label: "CUT" }, { at: 0.35, label: "TRAIL" }, { at: 0.8, label: "RECOVERY" }],
  cues: [{ at: 0.145, type: "hit", value: 1 }, { at: 0.145, type: "shake", value: 0.18 }]
};
var START = -2.55;
var SPAN = 3.4;
function create2(options) {
  const rng = new Rng3D(options.seed), ps = new Particles3D(0, 400), colors = options.palette;
  const sparkColors = colors.slice(3);
  let t = 0, impact = false;
  const arc = (theta, radius, layer = 0) => {
    const x = 0.4 + Math.cos(theta) * radius;
    const y = 2.55 + Math.sin(theta) * radius * 0.78 + layer * 0.08;
    const z = Math.cos(theta * 1.5) * radius * 0.12 - layer * 0.28;
    return [x, y, z];
  };
  return {
    update(dt) {
      t += dt;
      if (!impact && t >= 0.145) {
        impact = true;
        const head = arc(START + SPAN, options.radius);
        for (let i = 0; i < 56; i++) {
          const theta = rng.range(START + SPAN - 0.5, START + SPAN + 0.6);
          const power = rng.range(1, 6);
          ps.spawn({
            position: [head[0] + rng.range(-0.2, 0.2), head[1] + rng.range(-0.3, 0.3), head[2]],
            velocity: [Math.cos(theta) * power, rng.range(-0.8, 3.4), Math.sin(theta) * power],
            life: rng.range(0.14, 0.6),
            radius: rng.range(0.03, 0.095),
            gravity: 5,
            drag: 0.9,
            color: rng.pick(sparkColors),
            style: "spark",
            emission: 0.3
          });
        }
      }
      ps.update(dt);
    },
    draw(p) {
      const lead = outCubic3(t / 0.15);
      const tail = smooth3(0.17, 0.59, t);
      if (lead > tail) {
        const n = 56, a0 = START + SPAN * tail, a1 = START + SPAN * lead;
        for (let i = 0; i < n; i++) {
          const u0 = i / n, u1 = (i + 1) / n;
          const angle0 = a0 + (a1 - a0) * u0, angle1 = a0 + (a1 - a0) * u1;
          const w0 = 0.04 + 0.58 * Math.pow(Math.max(0, Math.sin(Math.PI * u0)), 0.65) * (1 - tail * 0.55);
          const w1 = 0.04 + 0.58 * Math.pow(Math.max(0, Math.sin(Math.PI * u1)), 0.65) * (1 - tail * 0.55);
          const out0 = arc(angle0, options.radius), out1 = arc(angle1, options.radius);
          const in0 = arc(angle0, options.radius - w0), in1 = arc(angle1, options.radius - w1);
          const c = colors[Math.min(colors.length - 1, Math.max(0, Math.floor(2 + u0 * 4 - tail * 2)))];
          p.triangle(out0, in0, out1, c, 1, 0.15);
          p.triangle(out1, in0, in1, c, 1, 0.15);
          p.line(out0, out1, 0.035, colors[colors.length - 1], 0.65 * (1 - tail), 0.2);
        }
      }
      const echo = clamp3((t - 0.03) / 0.18) * (1 - smooth3(0.3, 0.72, t));
      if (echo > 0) for (let i = 1; i <= 22; i++) {
        const a = START + SPAN * i / 22 * echo;
        const b = START + SPAN * (i - 1) / 22 * echo;
        p.line(arc(a, options.radius * 0.79, 1), arc(b, options.radius * 0.79, 1), 0.055, colors[2], (1 - smooth3(0.4, 0.7, t)) * 0.9, 0.1);
      }
      if (t > 0.08 && t < 0.6) {
        const head = arc(START + SPAN * clamp3(t / 0.15), options.radius);
        p.glow(head, 1.05, colors[3], 0.45 * (1 - smooth3(0.13, 0.6, t)));
        p.point(head, 0.1, colors[5], 1, 0.3);
      }
      ps.draw(p);
    }
  };
}

// src/3d/effects/black-hole.ts
var black_hole_exports = {};
__export(black_hole_exports, {
  create: () => create3,
  meta: () => meta3
});
var meta3 = {
  id: "shadow/black-hole-3d",
  name: "Black Hole 3D \u2014 Cinematic",
  description: "A true 3D black-hole vortex with a depth-tested shadow, turbulent lensed accretion disk, spiralling stellar plasma, and solid captured debris.",
  duration: 7,
  loop: false,
  options: {
    seed: 4318,
    radius: 1.25,
    reach: 6.9,
    intensity: 1,
    palette: [
      "#05030c",
      "#130827",
      "#270d4d",
      "#441477",
      "#7121ae",
      "#ab30df",
      "#df55f1",
      "#ff8df5",
      "#ffd0fa",
      "#65d8ff",
      "#fff5fd"
    ]
  },
  stages: [
    { at: 0, label: "CONDENSE" },
    { at: 0.6, label: "SINGULARITY" },
    { at: 1.3, label: "ACCRETION" },
    { at: 4.3, label: "INSPIRAL" },
    { at: 5.4, label: "COLLAPSE" },
    { at: 6.3, label: "EVAPORATE" }
  ],
  cues: [
    { at: 0.63, type: "flash", value: 0.8 },
    { at: 0.71, type: "shake", value: 0.2 },
    { at: 1.1, type: "sound", value: 1 },
    { at: 5.52, type: "shake", value: 0.22 },
    { at: 6.05, type: "flash", value: 0.36 }
  ]
};
var CY = 2.1;
var TAU = TAU3;
var clamp = clamp3;
var sat = (n) => clamp(n, 0, 1);
var smooth = smooth3;
var fract = (n) => n - Math.floor(n);
var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
var hash = (a, b, seed2) => {
  let n = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(seed2 | 0, 1274126177);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
};
function noise(x, y, seed2) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const a = fx * fx * (3 - 2 * fx), b = fy * fy * (3 - 2 * fy);
  const n0 = hash(ix, iy, seed2), n1 = hash(ix + 1, iy, seed2);
  const n2 = hash(ix, iy + 1, seed2), n3 = hash(ix + 1, iy + 1, seed2);
  return (n0 + (n1 - n0) * a) * (1 - b) + (n2 + (n3 - n2) * a) * b;
}
var rgb = (r, g, b) => (4278190080 | clamp(b, 0, 255) << 16 | clamp(g, 0, 255) << 8 | clamp(r, 0, 255)) >>> 0;
var ch = (col, shift) => col >>> shift & 255;
function mixColor(a, b, amount) {
  const x = sat(amount), y = 1 - x;
  return rgb(ch(a, 0) * y + ch(b, 0) * x, ch(a, 8) * y + ch(b, 8) * x, ch(a, 16) * y + ch(b, 16) * x);
}
function paletteAt(pal, q, dither) {
  const u = clamp(q, 0, 0.9999) * (pal.length - 1), a = Math.floor(u);
  return pal[Math.min(pal.length - 1, a + (fract(u) > dither ? 1 : 0))];
}
function rock(p, center, size, rotation, pal, glow2, detail) {
  const points = [];
  for (let j = 0; j < 7; j++) {
    const a = rotation + j * TAU / 7;
    const r = size * (0.78 + 0.24 * Math.cos(j * 7.91 + detail));
    points.push([center[0] + Math.cos(a) * r, center[1] + size * 0.29 * Math.sin(j * 2.4 + detail), center[2] + Math.sin(a) * r]);
  }
  const cap = [center[0] + size * 0.29 * Math.cos(rotation * 1.8), center[1] + size * 0.9, center[2] + size * 0.2];
  const base = [center[0] - size * 0.25, center[1] - size * 0.7, center[2] + size * 0.15];
  const ramp = [pal[0], pal[1], pal[2], pal[3], pal[4], pal[6]];
  for (let i = 0; i < points.length; i++) {
    p.facet(points[i], points[(i + 1) % 7], cap, ramp);
    p.facet(points[(i + 1) % 7], points[i], base, ramp);
  }
  if (glow2 > 0.05) {
    for (let j = 0; j < 7; j++) p.line(points[j], points[(j + 1) % 7], 0.01, pal[0], 0.86);
    p.line(points[0], cap, 0.02, pal[8], glow2 * 0.94, glow2 * 0.26);
    p.line(points[2], points[3], 0.014, pal[7], glow2 * 0.68, glow2 * 0.13);
    if (size > 0.3) {
      const midpoint = [(points[1][0] + cap[0]) * 0.5, (points[1][1] + cap[1]) * 0.5, (points[1][2] + cap[2]) * 0.5];
      p.line(points[1], midpoint, 0.015, pal[6], glow2 * 0.78, glow2 * 0.12);
      p.line(midpoint, points[3], 0.01, pal[9], glow2 * 0.36, glow2 * 0.08);
      p.line(points[4], cap, 0.014, pal[9], glow2 * 0.3, glow2 * 0.11);
    }
  }
}
function makeBloom() {
  let w = 0, h = 0, hr = new Float32Array(0), hg = new Float32Array(0), hb = new Float32Array(0), linearH = new Float32Array(0);
  return (p, cx, cy, voidRadius, level) => {
    if (level <= 0) return;
    const frame2 = p.frame;
    const W = frame2.w, H = frame2.h, N = W * H, L = frame2.light;
    if (W !== w || H !== h) {
      w = W;
      h = H;
      hr = new Float32Array(N);
      hg = new Float32Array(N);
      hb = new Float32Array(N);
    }
    const native = frame2.hdrLight;
    if (native && linearH.length !== N * 3) linearH = new Float32Array(N * 3);
    const radius = 5, normal = 1 / (radius * 2 + 1);
    for (let y = 0; y < H; y++) {
      const o = y * W;
      let sr = 0, sg = 0, sb = 0, lr = 0, lg = 0, lb = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const i = o + Math.min(W - 1, Math.max(0, dx)), c = L[i];
        sr += c & 255;
        sg += c >>> 8 & 255;
        sb += c >>> 16 & 255;
        if (native) {
          lr += native[i * 3];
          lg += native[i * 3 + 1];
          lb += native[i * 3 + 2];
        }
      }
      for (let x = 0; x < W; x++) {
        const i = o + x;
        hr[i] = sr * normal;
        hg[i] = sg * normal;
        hb[i] = sb * normal;
        if (native) {
          linearH[i * 3] = lr * normal;
          linearH[i * 3 + 1] = lg * normal;
          linearH[i * 3 + 2] = lb * normal;
        }
        const ia = o + Math.min(W - 1, x + radius + 1), ib = o + Math.max(0, x - radius), a = L[ia], b = L[ib];
        sr += (a & 255) - (b & 255);
        sg += (a >>> 8 & 255) - (b >>> 8 & 255);
        sb += (a >>> 16 & 255) - (b >>> 16 & 255);
        if (native) {
          lr += native[ia * 3] - native[ib * 3];
          lg += native[ia * 3 + 1] - native[ib * 3 + 1];
          lb += native[ia * 3 + 2] - native[ib * 3 + 2];
        }
      }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 < voidRadius * voidRadius * 0.87) continue;
      let sr = 0, sg = 0, sb = 0, lr = 0, lg = 0, lb = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const j = Math.min(H - 1, Math.max(0, y + dy)) * W + x;
        sr += hr[j];
        sg += hg[j];
        sb += hb[j];
        if (native) {
          lr += linearH[j * 3];
          lg += linearH[j * 3 + 1];
          lb += linearH[j * 3 + 2];
        }
      }
      if (sr + sg + sb + lr + lg + lb > 0) p.screenLightRGB(x, y, sr * normal * level, sg * normal * level, sb * normal * level, lr * normal * level, lg * normal * level, lb * normal * level);
    }
  };
}
function planeCamera(camera) {
  const { yaw: yaw2, elevation: elevation2 } = camera.camera;
  const cs = Math.cos(yaw2), ss = Math.sin(yaw2), ce = Math.cos(elevation2), se = Math.sin(elevation2);
  const right = [cs, 0, -ss], up = [-ss * se, ce, -cs * se], front = [ss * ce, se, cs * ce];
  const n = [-0.16, 1, 0.1], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return { right, up, front, ndotRight: dot(n, right), ndotUp: dot(n, up), ndotFront: dot(n, front) };
}
function create3(options) {
  const rng = new Rng3D(options.seed);
  const R = Math.max(0.5, options.radius), reach = Math.max(R * 3, options.reach), intensity = clamp(options.intensity, 0.2, 2);
  const inputColors = (options.palette.length ? options.palette : meta3.options.palette).map(color3D);
  const PAL = Array.from({ length: 11 }, (_, i) => {
    const u = i / 10 * (inputColors.length - 1), a = Math.floor(u);
    return mixColor(inputColors[a], inputColors[Math.min(inputColors.length - 1, a + 1)], fract(u));
  });
  const rocks = [], sparks = [], stars = [];
  for (let i = 0; i < 92; i++) rocks.push({
    a: rng.range(0, TAU),
    radius: rng.range(R * 2.45, reach * 1.34),
    phase: rng.range(0, TAU),
    fall: rng.range(0.1, 0.35),
    y: rng.range(-0.8, 0.8),
    scale: rng.range(0.065, 0.23) * (i % 19 === 0 ? 2.7 : 1),
    spin: rng.range(-3, 3),
    tilt: rng.range(0.15, 0.65),
    bright: rng.range(0.35, 1)
  });
  for (const [a, r, y, size] of [[2.9, 6.8, -0.6, 1.25], [0.15, 6.2, 1.8, 1.12], [4.5, 7.2, -0.9, 1.07], [5.55, 5.4, 1.3, 0.86]])
    rocks.push({ a, radius: r, phase: rng.range(0, TAU), fall: 0.037, y, scale: size, spin: rng.range(-1, 1), tilt: 0.5, bright: 0.9 });
  for (let i = 0; i < 320; i++) sparks.push({
    a: rng.range(0, TAU),
    r: rng.range(R * 1.8, reach * 1.25),
    phase: rng.range(0, TAU),
    speed: rng.range(0.36, 1.7),
    fall: rng.range(0.02, 0.23),
    y: rng.range(-0.6, 0.6),
    size: rng.range(9e-3, 0.045),
    c: rng.int(0, 3)
  });
  for (let i = 0; i < 180; i++) stars.push({
    x: rng.range(-12, 12),
    y: rng.range(-7, 8),
    z: rng.range(-4, -13),
    mag: rng.range(0.012, 0.075),
    tw: rng.range(0, TAU),
    color: rng.int(0, 4)
  });
  const bloom = makeBloom();
  let horizonMask = new Uint8Array(0), horizonDepth = new Float32Array(0);
  let time = 0;
  return {
    update(dt) {
      time += dt;
    },
    draw(p) {
      if (time >= meta3.duration) return;
      const t = time, phase = TAU * t / meta3.duration;
      const growth = smooth(0.08, 1.08, t), fade = 1 - smooth(5.95, 7, t);
      const power = growth * fade * intensity;
      if (power <= 1e-3) return;
      const shrink = 1 - 0.75 * smooth(5.5, 6.9, t);
      const radius = R * (0.18 + 0.82 * smooth(0.07, 1, t)) * shrink;
      const center = p.project([0, CY, 0]);
      const sx = center.x, sy = center.y, scale = center.scale, cr = radius * scale;
      const frame2 = p.frame, w = frame2.w, h = frame2.h, depth = frame2.depth;
      if (horizonMask.length !== w * h) {
        horizonMask = new Uint8Array(w * h);
        horizonDepth = new Float32Array(w * h);
      } else horizonMask.fill(0);
      const camera = planeCamera(p), a = camera.right, b = camera.up, c = camera.front;
      const nR = camera.ndotRight, nU = camera.ndotUp, nF = camera.ndotFront;
      const base = color3D("#05030e");
      const black = color3D("#010008");
      const nseed = options.seed;
      const tDrive = t * 1.83;
      const cosPhase = Math.cos(phase) * 0.32, sinPhase = Math.sin(phase) * 0.32;
      const cosTurb = Math.cos(phase) * 0.36, sinTurb = Math.sin(phase) * 0.36;
      const maxDist = reach * 1.6;
      const ditherScale = 1 / 16;
      const minX = Math.max(0, Math.floor(sx - maxDist * scale));
      const maxX = Math.min(w - 1, Math.ceil(sx + maxDist * scale));
      const minY = Math.max(0, Math.floor(sy - maxDist * scale));
      const maxY = Math.min(h - 1, Math.ceil(sy + maxDist * scale));
      for (let y = minY; y <= maxY; y++) {
        const v = (sy - y - 0.5) / scale;
        for (let x = minX; x <= maxX; x++) {
          const u = (x + 0.5 - sx) / scale, rr = Math.hypot(u, v);
          if (rr > maxDist) continue;
          const i = y * w + x, ang = Math.atan2(v, u), bayer = (BAYER[(y & 3) << 2 | x & 3] + 0.5) * ditherScale;
          let surface = p.opaqueColorAt(x, y) || base;
          let emit = 0, dep = -Infinity, isHorizon = false;
          if (rr > radius * 1.15 && rr < reach * 1.62) {
            const logR = Math.log(rr + 0.31);
            const theta = ang - 1.25 * logR - 0.13 * tDrive;
            const n = noise(u * 0.74 + cosPhase, v * 0.74 + sinPhase, nseed);
            const n2 = noise(u * 2.1 - 0.35 * t, v * 2.1 + 0.13 * t, nseed + 19);
            const cloudy = Math.pow(Math.max(0, Math.cos(2 * theta + n * 0.94)), 4);
            const innerCloud = Math.pow(Math.max(0, Math.cos(4 * (theta + 0.22) + n2 * 0.6)), 10);
            const silhouette = smooth(radius * 1.8, radius * 2.9, rr) * (1 - smooth(reach * 1.23, reach * 1.57, rr));
            const grain = 0.76 + 0.58 * n + 0.38 * (n2 - 0.5);
            const plasma = sat((cloudy * 0.45 + innerCloud * 0.18) * grain * silhouette) * power;
            if (plasma > 0.018) {
              const col = paletteAt(PAL, 0.12 + plasma * 0.5 + (n2 - 0.5) * 0.05, bayer);
              surface = mixColor(surface, col, plasma * 0.7);
              emit += plasma * 9;
            }
            const path = Math.cos(3 * theta + Math.sin(ang * 8 - t * 0.85) * 0.32);
            if (path > 0.96 && silhouette > 0.1) {
              const strength = (path - 0.96) * 4.5 * silhouette * power;
              surface = mixColor(surface, n2 > 0.62 ? PAL[9] : PAL[6], strength * 0.4);
              emit += strength * 17;
            }
          }
          const lensStrength = power * sat((radius * 3.3 - rr) / (radius * 2.1));
          const deflection = rr > radius * 0.6 ? lensStrength * 0.085 * radius * radius / (rr + 0.2) : 0;
          const qx = u + Math.cos(ang) * deflection, qy = v + Math.sin(ang) * deflection;
          let diskR = 0, diskTheta = 0;
          if (rr < reach * 1.26 && Math.abs(nF) > 0.12) {
            const d = -(nR * qx + nU * qy) / nF;
            const X = a[0] * qx + b[0] * qy + c[0] * d;
            const Z = a[2] * qx + b[2] * qy + c[2] * d;
            diskR = Math.hypot(X, Z);
            diskTheta = Math.atan2(Z, X);
            if (diskR > radius * 1.04 && diskR < reach * 0.93 && Math.abs(d) < reach * 3.5) {
              const radial = (diskR - radius) / Math.max(0.1, reach - radius);
              const turbulence = noise(X * 1.45 + cosTurb, Z * 1.45 + sinTurb, nseed + 33);
              const micro = noise(X * 4 - t * 0.47, Z * 4 + t * 0.39, nseed + 77);
              const sw = 24 * Math.log(diskR / radius) - 7 * diskTheta - tDrive * 7 + 2.6 * (turbulence - 0.5);
              const sw2 = 46 * Math.log(diskR / radius) + 5 * diskTheta - tDrive * 3.1 + 2.5 * (micro - 0.5);
              const strands = Math.pow(Math.max(0, Math.cos(sw)), 7);
              const filaments = Math.pow(Math.max(0, Math.cos(sw2)), 14);
              const radialRidges = Math.pow(Math.max(0, Math.cos(diskR * 11.7 + 2.2 * Math.sin(diskTheta * 8 - tDrive * 2))), 10);
              const edge = smooth(radius * 1.06, radius * 1.28, diskR) * (1 - smooth(reach * 0.79, reach * 0.95, diskR));
              const innerHeat = Math.exp(-Math.pow((diskR - radius * 1.78) / (radius * 1.55), 2));
              const doppler = 0.84 + 0.16 * Math.cos(diskTheta - p.camera.yaw + 0.4);
              const turbulenceHeat = 0.73 + 0.6 * turbulence + 0.14 * micro;
              const luminous = (0.35 + strands * 0.8 + filaments * 0.33 + radialRidges * 0.2) * edge * doppler * turbulenceHeat;
              const brightness = power * luminous * (0.7 + 0.65 * innerHeat) * (1 - 0.15 * radial);
              const opacity = sat((0.65 + 0.3 * turbulence + 0.15 * strands) * edge * power);
              const cyan = Math.pow(Math.max(0, Math.sin(sw * 0.48 + diskTheta * 1.9)), 13) * (0.63 + 0.55 * micro);
              const col = cyan > 0.52 ? mixColor(PAL[6], PAL[9], sat(cyan * 1.05)) : paletteAt(PAL, sat(0.22 + 0.58 * brightness + 0.12 * innerHeat - 0.1 * radial), bayer);
              surface = mixColor(surface, col, opacity);
              emit += brightness * (cyan > 0.52 ? 86 : 49);
              dep = center.depth + d;
            }
          }
          const dist = rr / Math.max(0.01, radius);
          if (dist > 0.97 && dist < 2.34) {
            const sa = Math.sin(ang);
            const warp = 0.06 * Math.sin(ang * 4 - t * 1.1) + 0.025 * Math.sin(ang * 9 + t * 0.7);
            const innerBand = Math.exp(-Math.pow((dist - 1.105 - warp) / 0.036, 2));
            const outerBand = Math.exp(-Math.pow((dist - 1.4 - 0.085 * Math.sin(ang * 2.4 - t * 0.48)) / 0.075, 2));
            const upper = sat((sa + 0.15) * 1.1);
            const ray = power * (innerBand * (0.82 + 0.28 * sa) + outerBand * upper * 0.85);
            if (ray > 6e-3) {
              const col = innerBand > 0.5 ? PAL[8] : upper > 0.5 ? PAL[6] : PAL[4];
              surface = mixColor(surface, col, sat(ray * 0.92));
              emit += ray * 91;
            }
          }
          if (rr > radius * 1.18 && rr < radius * 2.48) {
            const sn = Math.sin(ang), upper = sat((sn + 0.1) * 1.35);
            const target = 1.83 + 0.11 * Math.cos(2 * ang - t * 0.28) + 0.045 * Math.sin(6 * ang + t * 0.8);
            const offset = rr / radius - target;
            const broad = Math.exp(-((offset / 0.14) ** 2)) * upper;
            const core = Math.exp(-((offset / 0.032) ** 2)) * upper;
            const motion = 0.71 + 0.22 * Math.sin(9 * ang - 2.2 * t) + 0.12 * Math.sin(22 * ang + 4.1 * t);
            const glow2 = power * (broad * 0.27 + core * 0.81) * motion;
            if (glow2 > 8e-3) {
              const bright = core > 0.45 ? PAL[8] : PAL[5];
              surface = mixColor(surface, bright, sat(glow2 * 0.86));
              emit += glow2 * 92;
            }
          }
          if (rr > radius * 3 && rr < reach * 1.37) {
            const lane = reach * (0.87 + 0.055 * Math.sin(ang * 3.4 - t * 0.34));
            const narrow = Math.exp(-(((rr - lane) / (reach * 0.013)) ** 2));
            const gate = Math.pow(Math.max(0, Math.sin(ang * 2.1 + 0.6 * t + 0.6)), 4);
            const amount = narrow * gate * power * 0.42;
            if (amount > 0.025) {
              surface = mixColor(surface, gate > 0.65 ? PAL[9] : PAL[6], amount * 0.86);
              emit += amount * 49;
            }
          }
          if (rr < radius) {
            const hit = Math.sqrt(Math.max(0, radius * radius - rr * rr));
            const surfDepth = center.depth + hit;
            if (dep <= surfDepth) {
              const edge = sat((rr / radius - 0.73) / 0.27);
              surface = mixColor(black, PAL[1], 0.1 * edge * edge);
              emit = 0;
              dep = Math.fround(surfDepth);
              isHorizon = true;
            }
          }
          if (p.opaqueDepthAt(x, y) > Math.fround(dep)) continue;
          let emissionColor = 0;
          if (emit > 0.01) {
            const red = Math.min(255, emit * (0.86 + 0.32 * (ch(surface, 0) / 255)));
            const green = Math.min(255, emit * (0.45 + 0.52 * (ch(surface, 8) / 255)));
            const blue = Math.min(255, emit * (0.72 + 0.48 * (ch(surface, 16) / 255)));
            emissionColor = rgb(red, green, blue);
          }
          p.pixel(x, y, dep, surface, 1, emit > 0.01 ? 1 : 0, emissionColor);
          if (isHorizon && depth[i] === dep) {
            horizonMask[i] = 1;
            horizonDepth[i] = dep;
          }
        }
      }
      const pal = PAL;
      for (const r of rocks) {
        const rd = r.radius * Math.exp(-r.fall * Math.max(0, t - 0.7));
        if (rd < radius * 1.08) continue;
        const angle = r.a + t * 0.69 * Math.sqrt(reach / rd) + r.phase * 0.025;
        const x = Math.cos(angle) * rd, z = Math.sin(angle) * rd;
        const y = CY + 0.16 * x - 0.1 * z + r.y * Math.max(0.2, rd / r.radius);
        const pos = [x, y, z];
        const size = r.scale * (0.86 + 0.18 * Math.sin(t * 1.3 + r.phase));
        if (r.scale < 0.12) {
          p.point(pos, size, pal[r.bright > 0.7 ? 7 : 4], power * 0.85, 0.06 * power);
        } else {
          rock(p, pos, size, angle + r.spin * t, pal, r.bright * power, r.phase);
        }
      }
      for (const spark of sparks) {
        const rd = spark.r * Math.exp(-spark.fall * t * 0.57);
        if (rd < radius * 1.12) continue;
        const angle = spark.a + t * spark.speed * Math.sqrt(reach / rd) + spark.phase * 0.16;
        const x = Math.cos(angle) * rd, z = Math.sin(angle) * rd;
        const y = CY + 0.16 * x - 0.1 * z + spark.y * 0.35;
        const tailAngle = angle - 0.016 * (0.6 + spark.speed);
        const tail = [Math.cos(tailAngle) * rd, CY + 0.16 * Math.cos(tailAngle) * rd - 0.1 * Math.sin(tailAngle) * rd + spark.y * 0.35, Math.sin(tailAngle) * rd];
        const pos = [x, y, z], a0 = power * (0.4 + 0.3 * Math.sin(t * 2.6 + spark.phase));
        const color = pal[[7, 9, 8, 6][spark.c]];
        if (spark.c < 2) p.line(tail, pos, spark.size, color, a0, a0 * 0.15);
        else p.point(pos, spark.size, color, a0, a0 * 0.14);
      }
      for (const star of stars) {
        const a2 = 0.45 + 0.55 * Math.sin(t * 1.1 + star.tw) ** 2;
        const pos = [star.x, CY + star.y, star.z];
        p.point(pos, star.mag, pal[star.color === 0 ? 10 : star.color === 1 ? 9 : 7], a2 * power * 0.8, 0.06 * a2 * power);
        if (star.mag > 0.067 && a2 > 0.69) {
          const r = star.mag * 2.8;
          p.line([pos[0] - r, pos[1], pos[2]], [pos[0] + r, pos[1], pos[2]], 0.01, pal[9], a2 * 0.55, 0.08);
          p.line([pos[0], pos[1] - r, pos[2]], [pos[0], pos[1] + r, pos[2]], 0.01, pal[8], a2 * 0.55, 0.08);
        }
      }
      bloom(p, sx, sy, cr, power * 0.9);
      const x0 = Math.max(0, Math.floor(sx - cr * 0.96)), x1 = Math.min(w - 1, Math.ceil(sx + cr * 0.96));
      const y0 = Math.max(0, Math.floor(sy - cr * 0.96)), y1 = Math.min(h - 1, Math.ceil(sy + cr * 0.96));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const rr2 = (x + 0.5 - sx) ** 2 + (y + 0.5 - sy) ** 2;
        if (rr2 > cr * cr * 0.94) continue;
        const i = y * w + x;
        if (horizonMask[i] && depth[i] === horizonDepth[i]) p.clearEmission(x, y, true);
      }
    }
  };
}

// src/3d/effects/wind-rasenshuriken.ts
var wind_rasenshuriken_exports = {};
__export(wind_rasenshuriken_exports, {
  WIND_CONTACT_3D: () => WIND_CONTACT_3D,
  create: () => create4,
  meta: () => meta4
});

// src/3d/wind-pressure.ts
function gustImpulse3D(age, strength = 1) {
  if (!Number.isFinite(age) || !Number.isFinite(strength)) throw new RangeError("Gust age and strength must be finite");
  const power = clamp3(strength, 0, 2);
  if (age < 0 || power === 0) return { pressure: 0, deflection: 0, drift: 0, velocity: 0 };
  if (age > 200) return { pressure: 0, deflection: 0, drift: power, velocity: 0 };
  return {
    pressure: power * Math.exp(-age * 13),
    deflection: power * Math.sin(age * 10) * Math.exp(-age * 3.7),
    drift: power * -Math.expm1(-age * 5),
    velocity: power * 5 * Math.exp(-age * 5)
  };
}
function advectGust3D(origin, direction, age, speed, drag = 2.6) {
  if (origin.length !== 3 || direction.length !== 3 || ![...origin, ...direction, age, speed, drag].every(Number.isFinite) || speed < 0 || drag < 0)
    throw new RangeError("Gust path needs finite points, non-negative speed and drag");
  const length = len3(direction);
  if (!(length > 1e-12) || !Number.isFinite(length)) throw new RangeError("Gust direction must be nonzero");
  const elapsed = Math.max(0, age), distance = speed * (drag < 1e-8 ? elapsed : -Math.expm1(-drag * elapsed) / drag);
  if (!Number.isFinite(distance)) throw new RangeError("Gust path distance overflow");
  const d = mul3(direction, distance / length);
  const point = [origin[0] + d[0], origin[1] + d[1], origin[2] + d[2]];
  if (!point.every(Number.isFinite)) throw new RangeError("Gust path position overflow");
  return point;
}

// src/3d/effects/wind-rasenshuriken.ts
var WIND_CONTACT_3D = Object.freeze({
  at: 3.05,
  position: Object.freeze([3.15, 2.35, 0]),
  normal: Object.freeze([-1, 0, 0]),
  material: "wood"
});
var RELEASE2 = 2.65;
var meta4 = {
  id: "arcane/wind-rasenshuriken-3d",
  name: "Wind Rasenshuriken \xB7 Refined",
  description: "Volumetric four-wing wind shuriken: spiralling vortex core, curved 3D airfoil ribbons, pressure filaments and a fast compressed launch. Air splits around a wooden target, rocks and slides it, then carries dust and leaves downstream.",
  duration: 4.6,
  loop: false,
  options: { seed: 308, radius: 3.05, intensity: 1, palette: ["#102831", "#27434a", "#42646a", "#63868a", "#88aaac", "#b0c7bf", "#dbe5ce", "#f0f3dc"], targetVisible: true },
  stages: [{ at: 0, label: "CONDENSE" }, { at: 0.58, label: "FORM BLADES" }, { at: 1.25, label: "HURRICANE" }, { at: RELEASE2, label: "FAST GUST" }, { at: WIND_CONTACT_3D.at, label: "PRESSURE STRIKE" }, { at: 4.05, label: "DISSIPATE" }],
  cues: [{ at: 0.68, type: "sound", value: 0.5 }, { at: RELEASE2, type: "sound", value: 1 }, { at: WIND_CONTACT_3D.at, type: "hit", value: 1 }, { at: WIND_CONTACT_3D.at, type: "shake", value: 0.16 }]
};
var CY2 = WIND_CONTACT_3D.position[1];
var WOOD = ["#322e2a", "#51463a", "#78634b", "#a38960", "#c1aa79"];
var SOIL = ["#394138", "#59604a", "#818066"];
var LEAF = ["#647e49", "#a6ad69", "#c2bd7d"];
function create4(options) {
  const rng = new Rng3D(options.seed), palette = options.palette?.length ? options.palette : meta4.options.palette;
  const colors = Array.from({ length: 8 }, (_, i) => color3D(palette[Math.round(i / 7 * (palette.length - 1))]));
  const R = clamp3(Number.isFinite(options.radius) ? options.radius : 3.05, 0.5, 3.4), power = clamp3(Number.isFinite(options.intensity) ? options.intensity : 1, 0, 2);
  const specks = Array.from({ length: 84 }, (_, i) => ({
    a: rng.range(0, TAU3),
    r: rng.range(Math.min(0.35, R * 0.5), R * 1.3),
    z: rng.range(-1, 1),
    v: rng.range(1.6, 6.8),
    phase: rng.range(0, TAU3),
    size: rng.range(0.018, 0.082),
    tone: rng.int(3, 7),
    band: i % 5
  }));
  const carried = Array.from({ length: 66 }, (_, i) => ({
    born: i < 18 ? 0.012 + i * 8e-3 : 0.08 + (i - 18) * 9e-3,
    x: rng.range(2.9, 3.3),
    z: rng.range(-0.9, 0.95),
    y: i % 3 === 0 ? rng.range(0.2, 1.1) : rng.range(0.03, 0.2),
    speed: rng.range(4.4, 8.4),
    phase: rng.range(0, TAU3),
    size: rng.range(0.08, 0.17),
    leaf: i % 3 === 0,
    tone: rng.int(0, 2),
    life: rng.range(0.65, 1.2)
  }));
  const grass = Array.from({ length: 9 }, (_, i) => ({ x: 2.25 + i * 0.38, z: (i % 2 ? 1 : -1) * (0.61 + i % 3 * 0.14), h: rng.range(0.22, 0.52) }));
  let t = 0;
  const contactAge = () => Math.abs(t - WIND_CONTACT_3D.at) < 1e-9 ? 0 : t - WIND_CONTACT_3D.at;
  const visible = () => smooth3(0.025, 0.2, t) * (1 - smooth3(4.28, 4.6, t));
  function targetPoint(x, y, z) {
    const kick = gustImpulse3D(contactAge(), power), angle = Math.max(0, kick.deflection) * 0.5;
    const pivot = 4.25, dx = x - pivot;
    return [pivot + dx * Math.cos(angle) + y * Math.sin(angle) + 0.55 * kick.drift, -dx * Math.sin(angle) + y * Math.cos(angle), z];
  }
  function target(p) {
    const a = visible();
    if (a <= 0) return;
    p.triangle([1.9, 0, -1.16], [6.2, 0, -1.16], [6.2, 0, 1.16], SOIL[0], a * 0.72);
    p.triangle([1.9, 0, -1.16], [6.2, 0, 1.16], [1.9, 0, 1.16], SOIL[0], a * 0.72);
    for (const g of grass) {
      const response = gustImpulse3D(contactAge() - Math.max(0, g.x - 3.15) / 12, power), bend = response.deflection * 0.75;
      for (let j = 0; j < 3; j++) {
        const root = [g.x + j * 0.035, 0.015, g.z], tip = [g.x + j * 0.035 + bend + (0.09 - j * 0.08), g.h * (1 - Math.min(0.5, Math.abs(bend) * 0.6)), g.z + 0.025 * j];
        p.line(root, tip, 0.015, LEAF[j], a * 0.85);
      }
    }
    if (options.targetVisible === false) return;
    const v = [
      targetPoint(3.15, 0.04, -0.36),
      targetPoint(4.25, 0.04, -0.36),
      targetPoint(4.25, 3.55, -0.36),
      targetPoint(3.15, 3.55, -0.36),
      targetPoint(3.15, 0.04, 0.36),
      targetPoint(4.25, 0.04, 0.36),
      targetPoint(4.25, 3.55, 0.36),
      targetPoint(3.15, 3.55, 0.36)
    ];
    for (const [i, j, k, l, c] of [[0, 1, 2, 3, 0], [4, 5, 6, 7, 2], [0, 4, 7, 3, 1], [1, 2, 6, 5, 1], [3, 7, 6, 2, 3]]) {
      p.triangle(v[i], v[j], v[k], WOOD[c], a);
      p.triangle(v[i], v[k], v[l], WOOD[c], a);
    }
    for (const x of [3.44, 3.79, 4.08]) p.line(targetPoint(x, 0.1, 0.365), targetPoint(x, 3.47, 0.365), 0.018, WOOD[1], a * 0.7);
    for (const y of [0.68, 2.85]) {
      p.line(targetPoint(3.16, y, 0.377), targetPoint(4.24, y, 0.377), 0.065, WOOD[0], a);
      p.point(targetPoint(3.31, y, 0.39), 0.025, WOOD[4], a);
      p.point(targetPoint(4.09, y, 0.39), 0.025, WOOD[4], a);
    }
  }
  function contact(p) {
    const age = contactAge();
    if (age < 0) return;
    const a = visible(), kick = gustImpulse3D(age, power);
    if (kick.pressure > 0.01) {
      const v = [targetPoint(3.125, CY2 - 0.65, -0.35), targetPoint(3.125, CY2 + 0.65, -0.35), targetPoint(3.125, CY2 + 0.65, 0.38), targetPoint(3.125, CY2 - 0.65, 0.38)];
      p.triangle(v[0], v[1], v[2], colors[6], a * kick.pressure * 0.48, 0);
      p.triangle(v[0], v[2], v[3], colors[5], a * kick.pressure * 0.4, 0);
    }
    for (let lane = 0; lane < 4; lane++) {
      const born = lane * 0.041, local = age - born;
      if (local < 0 || local > 0.55) continue;
      const fade = (1 - smooth3(0.08, 0.55, local)) * a * 0.7, spread = 0.65 + local * 2.5;
      let prev;
      for (let j = 0; j <= 20; j++) {
        const u = j / 20, theta = -1.1 + u * 2.2, side = lane % 2 ? 1 : -1;
        const q = [3.08 + 0.55 * kick.drift + local * 4 - Math.cos(theta) * (0.2 + spread * 0.35), CY2 + Math.sin(theta) * spread * (0.8 + lane * 0.09), side * (0.45 + spread * 0.24)];
        if (prev) p.line(prev, q, 0.02 + (1 - u) * 8e-3, colors[lane % 3 + 4], fade, 0);
        prev = q;
      }
    }
    for (let lane = 0; lane < 8; lane++) {
      const local = age - lane * 0.022;
      if (local < 0 || local > 0.5) continue;
      const lead = Math.min(1, local * 4.4), tail = Math.max(0, lead - 0.45), side = lane % 2 ? 1 : -1;
      let prev;
      for (let j = 0; j <= 14; j++) {
        const u = tail + (lead - tail) * j / 14;
        const q = [2.45 + u * 3.1 + 0.55 * kick.drift, 0.5 + lane % 4 * 0.66 + Math.sin(u * Math.PI) * 0.1, side * (0.46 + Math.sin(u * Math.PI) * 0.42)];
        if (prev) p.line(prev, q, 0.016, colors[4 + lane % 3], a * (1 - smooth3(0.15, 0.5, local)) * 0.68, 0);
        prev = q;
      }
    }
    for (const q of carried) {
      const local = age - q.born;
      if (local < 0 || local >= q.life) continue;
      const moved = advectGust3D([q.x, q.y, q.z], [1, 0.04, q.z * 0.12], local, q.speed * Math.min(1.15, power), 2.7);
      const y = q.leaf ? Math.max(0.04, moved[1] + 0.6 * Math.sin(local * Math.PI / q.life) + 0.12 * Math.sin(local * 15 + q.phase) * Math.sin(Math.min(1, local * 6) * Math.PI / 2)) : moved[1] + 0.3 * Math.sin(local * Math.PI / q.life);
      const pos2 = [moved[0], y, moved[2]], fade = a * (1 - smooth3(q.life * 0.55, q.life, local));
      if (q.leaf) {
        const angle = q.phase + local * 16, dx = Math.cos(angle) * q.size * 1.6, dz = Math.sin(angle) * q.size * 0.7;
        p.triangle([pos2[0] - dx, y, pos2[2] - dz], [pos2[0], y + q.size * 0.58, pos2[2] + q.size * 0.55], [pos2[0] + dx, y, pos2[2] + dz], LEAF[q.tone], fade);
        p.triangle([pos2[0] - dx, y, pos2[2] - dz], [pos2[0], y - q.size * 0.35, pos2[2] - q.size * 0.55], [pos2[0] + dx, y, pos2[2] + dz], LEAF[(q.tone + 1) % 3], fade);
      } else {
        const r = q.size * (1 + local * 2.6);
        p.line([pos2[0] - r * 1.5, y, pos2[2]], pos2, r * 0.85, SOIL[q.tone], fade * 0.64, 0);
      }
    }
  }
  const flight = () => smooth3(RELEASE2, WIND_CONTACT_3D.at, t);
  const world = (x, y, z) => {
    const f = flight(), sx = 1 - 0.92 * f, sy = 1 - 0.48 * f, support = Math.max(1, Math.min(R * 1.47, 4.4) + 0.1);
    const start = Math.min(-1.5, WIND_CONTACT_3D.position[0] - support - 0.55), endpoint = WIND_CONTACT_3D.position[0] - support * 0.08 - 0.05;
    return [start + (endpoint - start) * f + x * sx, CY2 + 0.9 * (1 - f) + y * sy, z * (1 + 0.2 * f)];
  };
  const pos = (a, r, z = 0) => world(Math.cos(a) * r, Math.sin(a) * r, z);
  return {
    update(dt) {
      t += dt;
    },
    draw(p) {
      if (t <= 0 || t >= meta4.duration - 1e-8 || power <= 0) return;
      target(p);
      const formation = smooth3(0.04, 0.68, t), ring = smooth3(0.3, 0.93, t);
      const body = formation * (1 - smooth3(WIND_CONTACT_3D.at, WIND_CONTACT_3D.at + 0.12, t)) * Math.min(1, power);
      const rot = t * (10.5 + 1.8 * formation);
      for (let k = 0; k < 10; k++) {
        const direction = k % 2 ? 1 : -1, phase = k * TAU3 / 10;
        let prev;
        for (let i = 0; i <= 24; i++) {
          const u = i / 24, r = (0.06 + 0.88 * u) * (0.65 + 0.35 * formation);
          const a = phase + direction * rot * 0.84 + u * (4.4 + 0.5 * Math.sin(t * 2 + phase));
          const q = pos(a, r, 0.48 * Math.sin(u * TAU3 * 1.4 + phase - rot * 0.37) * (0.25 + u * 0.75));
          if (prev) p.line(prev, q, k % 3 === 0 ? 0.028 : 0.016, colors[k % 3 === 0 ? 7 : 5], body * (1 - u * 0.34) * (k % 3 === 0 ? 0.74 : 0.45), 0);
          prev = q;
        }
      }
      if (body > 3e-3) for (let arm = 0; arm < 4; arm++) {
        const start = rot + arm * TAU3 / 4;
        for (let layer = 0; layer < 2; layer++) {
          let a0, b0;
          const n = 30;
          for (let j = 0; j <= n; j++) {
            const u = j / n, theta = start + 0.48 * u * u + 0.085 * Math.sin(u * 12 - t * 3 + arm), r = R * (0.13 + 0.89 * u) * formation, w = (0.07 + 0.74 * Math.pow(Math.sin(Math.PI * u), 0.72)) * (1 - 0.2 * layer) * formation;
            const sweep = theta + Math.PI / 2 + 0.15 * Math.sin(u * 8 + t), z = (layer ? -0.33 : 0.16) + 0.55 * u * Math.sin(u * 4 + arm * 0.9 + rot * 0.18);
            const A = world(Math.cos(theta) * r + Math.cos(sweep) * w * 0.52, Math.sin(theta) * r + Math.sin(sweep) * w * 0.52, z + 0.1);
            const B = world(Math.cos(theta) * r - Math.cos(sweep) * w * 0.48, Math.sin(theta) * r - Math.sin(sweep) * w * 0.48, z - 0.14);
            if (a0 && b0) {
              const col = colors[layer ? 2 + j % 3 : j % 7 === 0 ? 7 : 3 + Math.min(3, Math.floor(u * 4))];
              p.triangle(a0, b0, A, col, body * (layer ? 0.72 : 0.96), 0);
              p.triangle(A, b0, B, col, body * (layer ? 0.72 : 0.96), 0);
              if (j % 2 === 0) {
                p.line(a0, A, layer ? 0.016 : 0.045, colors[layer ? 4 : 7], body * (layer ? 0.37 : 0.9), 0);
                if (j % 3 === 0) p.line(b0, B, 0.022, colors[layer ? 3 : 5], body * 0.46, 0);
              }
            }
            a0 = A;
            b0 = B;
          }
        }
        for (let ray = 0; ray < 3; ray++) {
          const base = start + 0.48 + ray * 0.085;
          let prev;
          for (let j = 0; j <= 18; j++) {
            const u = j / 18, theta = base - 0.3 * u - t * 0.12 * u, r = R + (Math.min(R * 1.47, 4.4) - R) * u, z = 0.25 + 0.5 * Math.sin(u * 9 + arm + ray);
            const pt = pos(theta, r, z);
            if (prev) p.line(prev, pt, ray === 0 ? 0.026 : 0.013, colors[ray === 0 ? 6 : 4], body * (1 - u) * (ray === 0 ? 0.66 : 0.34), 0);
            prev = pt;
          }
        }
      }
      if (body > 3e-3) for (const s of specks) {
        const theta = s.a + rot * (0.5 + s.v * 0.047), rr = s.r * (0.78 + 0.17 * Math.sin(t * s.v + s.phase));
        const z = s.z + 0.34 * Math.sin(t * 3.5 + s.phase), a = body * (0.14 + 0.56 * Math.sin(t * 5 + s.phase) ** 2);
        if (s.band === 0) {
          const a0 = pos(theta, rr, z), a1 = pos(theta - 0.09, rr + 0.16, z - 0.1);
          p.line(a0, a1, 0.018, colors[s.tone], a, 0);
        } else p.point(pos(theta, rr, z), s.size, colors[s.tone], a, 0);
      }
      if (ring > 0.01 && body > 3e-3) for (let k = 0; k < 4; k++) {
        const rr = R * (0.56 + k * 0.13) * ring;
        let prev;
        for (let j = 0; j <= 96; j++) {
          const a = j * TAU3 / 96, wa = a + t * (k % 2 ? 0.7 : -0.7), z = 0.12 * Math.sin(wa * 3 + k);
          const q = pos(a, rr, z);
          if (prev && Math.sin(a * 11 - t * 4 + k) > -0.43) p.line(prev, q, 0.012, colors[k % 2 ? 3 : 5], body * 0.27, 0);
          prev = q;
        }
      }
      if (t > RELEASE2 && t < WIND_CONTACT_3D.at + 0.07) {
        const f = flight(), a = smooth3(RELEASE2, RELEASE2 + 0.07, t) * (1 - smooth3(WIND_CONTACT_3D.at - 0.02, WIND_CONTACT_3D.at + 0.07, t));
        for (let lane = 0; lane < 7; lane++) {
          const center = world(0, 0, 0), side = lane % 2 ? 1 : -1;
          let prev;
          for (let j = 0; j <= 14; j++) {
            const u = j / 14, q = [center[0] - u * (0.5 + f * 2.4), center[1] + (lane - 3) * 0.18 + Math.sin(u * 3.4 + lane) * u * 0.3, side * (0.42 + Math.sin(u * 3) * 0.18)];
            if (prev) p.line(prev, q, 0.018, colors[lane % 3 + 4], a * (1 - u) * 0.6, 0);
            prev = q;
          }
        }
      }
      contact(p);
    }
  };
}

// src/3d/effects/wind-rasenshuriken-legacy.ts
var wind_rasenshuriken_legacy_exports = {};
__export(wind_rasenshuriken_legacy_exports, {
  create: () => create5,
  meta: () => meta5
});
var meta5 = {
  id: "arcane/wind-rasenshuriken-legacy-3d",
  name: "Wind Rasenshuriken \xB7 Original Technique",
  description: "A four-wing wind blade on the pre-optimization 3D drawing contract, with simple spinning geometry and sparse sparks.",
  duration: 4.6,
  loop: false,
  options: { seed: 308, radius: 2.85, palette: ["#102449", "#17527b", "#247daa", "#55c9e8", "#b5f5ff", "#ffffff"] },
  stages: [{ at: 0, label: "CHARGE" }, { at: 0.75, label: "SPIN" }, { at: 2.4, label: "LAUNCH" }, { at: 3.05, label: "IMPACT" }, { at: 4, label: "FADE" }],
  cues: [{ at: 2.4, type: "sound", value: 1 }, { at: 3.05, type: "hit", value: 1 }, { at: 3.05, type: "shake", value: 0.16 }]
};
var CENTER = 2.35;
function create5(options) {
  const random = new Rng3D(options.seed);
  const sparks = Array.from({ length: 65 }, () => ({ a: random.range(0, TAU3), r: random.range(0.65, 3.6), speed: random.range(0.3, 2.1), z: random.range(-0.5, 0.5), size: random.range(0.025, 0.07) }));
  const C = options.palette, R = Math.max(0.4, options.radius);
  let t = 0;
  return {
    update(dt) {
      t += dt;
    },
    draw(p) {
      if (t >= meta5.duration) return;
      const born = smooth3(0.08, 0.7, t), fade = 1 - smooth3(3.6, 4.6, t);
      const power = born * fade, travel = smooth3(2.37, 3, t) * 1.25;
      const center = [travel, CENTER, 0];
      const rot = t * 9.6;
      for (let arm = 0; arm < 4; arm++) {
        const a = rot + arm * TAU3 / 4, ca = Math.cos(a), sa = Math.sin(a);
        const inner = [center[0] + ca * 0.32, CENTER + sa * 0.32, 0];
        const outer = [center[0] + ca * R * born, CENTER + sa * R * born, 0];
        const left = [center[0] + ca * (R * 0.58) - sa * 0.56 * born, CENTER + sa * (R * 0.58) + ca * 0.56 * born, 0];
        const right = [center[0] + ca * (R * 0.58) + sa * 0.34 * born, CENTER + sa * (R * 0.58) - ca * 0.34 * born, 0];
        p.triangle(inner, left, outer, C[2], power);
        p.triangle(inner, outer, right, C[3], power);
        p.line(inner, outer, 0.055, C[4], power, 0.05 * power);
        p.point(outer, 0.085, C[5], 0.74 * power, 0.1 * power);
      }
      for (const s of sparks) {
        const a = s.a + t * s.speed, r = s.r * (0.8 + 0.18 * Math.sin(t * 3 + s.a));
        const q = [center[0] + Math.cos(a) * r, CENTER + Math.sin(a) * r, s.z];
        p.point(q, s.size, C[3], power * (0.35 + 0.25 * Math.cos(t * 8 + s.a)), 0.015 * power);
      }
      p.glow(center, 1.12 * born, C[3], 0.22 * power);
      p.point(center, 0.38 * born, C[4], power, 0.12 * power);
      p.point([center[0], CENTER, 0.15], 0.16 * born, C[5], power, 0.15 * power);
      if (t >= 3.05) {
        const shock = smooth3(3.05, 3.55, t), f = (1 - smooth3(3.4, 3.95, t)) * power;
        const rr = shock * 5.2;
        for (let i = 0; i < 72; i++) {
          const a = i * TAU3 / 72, b = (i + 1) * TAU3 / 72;
          p.line(
            [center[0] + Math.cos(a) * rr, CENTER + Math.sin(a) * rr, 0],
            [center[0] + Math.cos(b) * rr, CENTER + Math.sin(b) * rr, 0],
            0.035,
            C[3],
            f,
            0.035 * f
          );
        }
      }
    }
  };
}

// src/3d/lighting.ts
var clamp2 = (x) => Math.max(0, Math.min(1, x));
var CinematicLighting3D = class {
  positions = new Float32Array(0);
  normals = new Float32Array(0);
  radiance = new Float32Array(0);
  occlusion = new Float32Array(0);
  cacheW = 0;
  cacheH = 0;
  prepare(w, h) {
    if (w === this.cacheW && h === this.cacheH) return;
    this.cacheW = w;
    this.cacheH = h;
    this.positions = new Float32Array(w * h * 3);
    this.normals = new Float32Array(w * h * 3);
    this.radiance = new Float32Array(w * h * 3);
    this.occlusion = new Float32Array(w * h);
  }
  /**
   * Computes point-light diffuse/specular/rim contribution plus optional SSAO.
   * Call after all effects have drawn, before CinematicCompositor.render().
   * Output arrays are owned by this object and overwritten on the next call.
   */
  evaluate(frame2, camera, lights, options = {}) {
    const { w, h, depth, color } = frame2, n = w * h;
    this.prepare(w, h);
    const pos = this.positions, normals = this.normals, rad = this.radiance, ao = this.occlusion;
    rad.fill(0);
    ao.fill(1);
    const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
    const ce = Math.cos(camera.elevation), se = Math.sin(camera.elevation);
    const scale = Math.min(w / 17, h / 11) * camera.zoom;
    const perspective = camera.projection === "perspective";
    const lens = camera.perspective ?? 0.025;
    const target = camera.target ?? [0, 0, 0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, d = depth[i];
      if (!Number.isFinite(d)) continue;
      const s = scale * (perspective ? 1 / Math.max(0.3, 1 - d * lens) : 1);
      const u = (x + 0.5 - w * 0.5) / s, up = (h * 0.61 - y - 0.5) / s;
      const v = d * ce - up * se, j = i * 3;
      pos[j] = target[0] + u * cy + v * sy;
      pos[j + 1] = target[1] + up * ce + d * se;
      pos[j + 2] = target[2] - u * sy + v * cy;
    }
    const threshold = Math.max(0, options.edgeThreshold ?? 0.46);
    const cameraForwardX = sy * ce, cameraForwardY = se, cameraForwardZ = cy * ce;
    const descriptors = lights.filter((l) => l.radius > 0 && l.intensity > 0).map((l) => {
      const c = color3D(l.color);
      return {
        x: l.position[0],
        y: l.position[1],
        z: l.position[2],
        r2: l.radius * l.radius,
        r: SRGB_TO_LINEAR[c & 255],
        g: SRGB_TO_LINEAR[c >>> 8 & 255],
        b: SRGB_TO_LINEAR[c >>> 16 & 255],
        intensity: l.intensity,
        specular: l.specular ?? 0.28,
        rim: l.rim ?? 0.12
      };
    });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, z = depth[i];
      if (!Number.isFinite(z)) continue;
      const j = i * 3, px = pos[j], py = pos[j + 1], pz = pos[j + 2];
      const s = scale * (perspective ? 1 / Math.max(0.3, 1 - z * lens) : 1);
      let rx = cy / s, ry = 0, rz = -sy / s;
      let dx = sy * se / s, dy = -ce / s, dz = cy * se / s;
      const rightDelta = x + 1 < w ? Math.abs(z - depth[i + 1]) : Infinity;
      const leftDelta = x > 0 ? Math.abs(z - depth[i - 1]) : Infinity;
      const downDelta = y + 1 < h ? Math.abs(z - depth[i + w]) : Infinity;
      const upDelta = y > 0 ? Math.abs(z - depth[i - w]) : Infinity;
      const horizontal = rightDelta < threshold && rightDelta <= leftDelta ? i + 1 : leftDelta < threshold ? i - 1 : -1;
      const vertical = downDelta < threshold && downDelta <= upDelta ? i + w : upDelta < threshold ? i - w : -1;
      if (horizontal >= 0) {
        const q = horizontal * 3, direction = horizontal > i ? 1 : -1;
        rx = (pos[q] - px) * direction;
        ry = (pos[q + 1] - py) * direction;
        rz = (pos[q + 2] - pz) * direction;
      }
      if (vertical >= 0) {
        const q = vertical * 3, direction = vertical > i ? 1 : -1;
        dx = (pos[q] - px) * direction;
        dy = (pos[q + 1] - py) * direction;
        dz = (pos[q + 2] - pz) * direction;
      }
      let nx = dy * rz - dz * ry, ny = dz * rx - dx * rz, nz = dx * ry - dy * rx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      let viewX = cameraForwardX, viewY = cameraForwardY, viewZ = cameraForwardZ;
      if (perspective && 1 - z * lens > 0.3) {
        viewX -= (px - target[0]) * lens;
        viewY -= (py - target[1]) * lens;
        viewZ -= (pz - target[2]) * lens;
        const length = Math.hypot(viewX, viewY, viewZ) || 1;
        viewX /= length;
        viewY /= length;
        viewZ /= length;
      }
      if (nx * viewX + ny * viewY + nz * viewZ < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      normals[j] = nx;
      normals[j + 1] = ny;
      normals[j + 2] = nz;
      const facing = clamp2(nx * viewX + ny * viewY + nz * viewZ);
      const material = color[i];
      const ar = SRGB_TO_LINEAR[material & 255], ag = SRGB_TO_LINEAR[material >>> 8 & 255], ab = SRGB_TO_LINEAR[material >>> 16 & 255];
      for (const l of descriptors) {
        let vx = l.x - px, vy = l.y - py, vz = l.z - pz;
        const distance2 = vx * vx + vy * vy + vz * vz;
        if (distance2 >= l.r2) continue;
        const dist = Math.sqrt(distance2) || 1e-5;
        vx /= dist;
        vy /= dist;
        vz /= dist;
        const diffuse = Math.max(0, nx * vx + ny * vy + nz * vz);
        const hx = vx + viewX, hy = vy + viewY, hz = vz + viewZ;
        const hl = Math.hypot(hx, hy, hz) || 1;
        const spec = diffuse > 0 ? Math.max(0, (nx * hx + ny * hy + nz * hz) / hl) ** 24 * l.specular : 0;
        const rim = (1 - facing) ** 3 * l.rim;
        const t = 1 - distance2 / l.r2;
        const attenuation = t * t / (1 + distance2 * 0.06) * l.intensity;
        const surface = 0.12 + 0.88 * diffuse;
        rad[j] += l.r * attenuation * (ar * surface + spec + rim);
        rad[j + 1] += l.g * attenuation * (ag * surface + spec + rim);
        rad[j + 2] += l.b * attenuation * (ab * surface + spec + rim);
      }
    }
    if (options.ambientOcclusion !== false) {
      const settings = options.ambientOcclusion ?? {};
      const radius = Math.max(1, Math.min(8, Math.floor(settings.radius ?? 3)));
      const intensity = Math.max(0, settings.intensity ?? 0.4);
      const bias = Math.max(1e-5, settings.bias ?? 0.09);
      const range = Math.max(1e-5, settings.range ?? 2), range2 = range * range;
      const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!Number.isFinite(depth[i])) continue;
        const j = i * 3;
        let occluded = 0;
        for (const [dx, dy] of offsets) {
          const xx = x + dx * radius, yy = y + dy * radius;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const neighbor = yy * w + xx;
          if (!Number.isFinite(depth[neighbor])) continue;
          const q = neighbor * 3;
          const vx = pos[q] - pos[j], vy = pos[q + 1] - pos[j + 1], vz = pos[q + 2] - pos[j + 2];
          const distance2 = vx * vx + vy * vy + vz * vz;
          if (distance2 >= range2) continue;
          const height2 = vx * normals[j] + vy * normals[j + 1] + vz * normals[j + 2] - bias;
          if (height2 > 0) occluded += clamp2(height2 / (radius * 0.4 + 0.2)) * (1 - distance2 / range2) ** 2;
        }
        ao[i] = Math.max(0.2, 1 - intensity * occluded / offsets.length);
      }
    }
    return { radiance: rad, occlusion: ao };
  }
};

// src/3d/fragments.ts
function transformFragment3D(point, position, rotation, scale = 1) {
  const [rx, ry, rz] = rotation, sx = Math.sin(rx), cx = Math.cos(rx), sy = Math.sin(ry), cy = Math.cos(ry), sz = Math.sin(rz), cz = Math.cos(rz);
  const x = point[0] * scale, y = point[1] * scale, z = point[2] * scale;
  const y1 = y * cx - z * sx, z1 = y * sx + z * cx;
  const x2 = x * cy + z1 * sy, z2 = -x * sy + z1 * cy;
  return [position[0] + x2 * cz - y1 * sz, position[1] + x2 * sz + y1 * cz, position[2] + z2];
}
function drawFragment3D(painter2, mesh, position, rotation, palette, scale = 1) {
  if (scale <= 0 || palette.length === 0) return;
  const vertices = mesh.vertices.map((v) => transformFragment3D(v, position, rotation, scale));
  for (const [a, b, c] of mesh.faces) painter2.facet(vertices[a], vertices[b], vertices[c], palette);
}
function restingRotation3D(mesh, current) {
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  let best = current, score = Infinity;
  const faces = mesh.faces.map(([a, b, c]) => {
    const cross = cross3(sub3(mesh.vertices[b], mesh.vertices[a]), sub3(mesh.vertices[c], mesh.vertices[a]));
    return { area: Math.hypot(...cross), normal: norm3(cross), anchor: mesh.vertices[a] };
  });
  const max = Math.max(0, ...faces.map((f) => f.area));
  for (const { area, normal: n, anchor } of faces) {
    if (area < max * 0.25 || area === 0) continue;
    for (const sign of [-1, 1]) {
      const nx = n[0] * sign, ny = n[1] * sign, nz = n[2] * sign;
      if (mesh.vertices.some((v) => dot3([nx, ny, nz], sub3(v, anchor)) > 1e-6)) continue;
      const rotation = [Math.atan2(-nz, ny), 0, Math.atan2(-nx, -Math.hypot(ny, nz))];
      const delta = rotation.map((v, i) => wrap(v - current[i]));
      const cost = Math.hypot(...delta) / (0.5 + area / max);
      if (cost < score) {
        score = cost;
        best = delta.map((v, i) => current[i] + v);
      }
    }
  }
  return best;
}
var Fragments3D = class {
  constructor(ground = 0, limit = 256) {
    this.ground = ground;
    this.limit = limit;
  }
  list = [];
  spawn(spec) {
    if (this.list.length >= this.limit || spec.life <= 0 || spec.palette.length === 0) return;
    const f = {
      mesh: spec.mesh,
      position: [...spec.position],
      velocity: [...spec.velocity],
      rotation: [...spec.rotation ?? [0, 0, 0]],
      angularVelocity: [...spec.angularVelocity ?? [0, 0, 0]],
      palette: spec.palette,
      life: spec.life,
      maxLife: spec.life,
      gravity: spec.gravity ?? 9.8,
      drag: Math.max(0, spec.drag ?? 0.2),
      bounce: clamp3(spec.bounce ?? 0.24),
      friction: clamp3(spec.friction ?? 0.72),
      meltStart: clamp3(spec.meltStart ?? 0.7, 0, 0.999),
      resting: false,
      settleTime: 0,
      settleFrom: [0, 0, 0],
      settleTo: [0, 0, 0]
    };
    this.list.push(f);
    return f;
  }
  clear() {
    this.list.length = 0;
  }
  scale(fragment) {
    return 1 - smooth3(fragment.meltStart, 1, 1 - fragment.life / fragment.maxLife);
  }
  update(dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be finite and non-negative");
    if (dt === 0) return;
    let write = 0;
    for (const f of this.list) {
      f.life -= dt;
      if (f.life <= 0) continue;
      if (!f.resting) {
        const damping = Math.exp(-f.drag * dt);
        const travel = f.drag === 0 ? dt : -Math.expm1(-f.drag * dt) / f.drag;
        const z = f.drag * dt;
        const fall = Math.abs(z) < 1e-3 ? dt * dt * (0.5 - z / 6 + z * z / 24) : (dt - travel) / f.drag;
        for (let i = 0; i < 3; i++) {
          f.position[i] += f.velocity[i] * travel;
          f.velocity[i] *= damping;
          f.rotation[i] += f.angularVelocity[i] * dt;
        }
        f.position[1] -= f.gravity * fall;
        f.velocity[1] -= f.gravity * travel;
      }
      if (f.resting && f.settleTime < 0.24) {
        f.settleTime = Math.min(0.24, f.settleTime + dt);
        const u = smooth3(0, 0.24, f.settleTime);
        for (let i = 0; i < 3; i++) f.rotation[i] = f.settleFrom[i] + (f.settleTo[i] - f.settleFrom[i]) * u;
      }
      let bottom = Infinity;
      for (const v of f.mesh.vertices) bottom = Math.min(bottom, transformFragment3D(v, [0, 0, 0], f.rotation, this.scale(f))[1]);
      if (Number.isFinite(bottom) && (f.position[1] + bottom < this.ground || f.resting)) {
        f.position[1] = this.ground - bottom;
        if (!f.resting && f.velocity[1] < 0) {
          f.velocity[1] = -f.velocity[1] * f.bounce;
          f.velocity[0] *= 1 - f.friction;
          f.velocity[2] *= 1 - f.friction;
          for (let i = 0; i < 3; i++) f.angularVelocity[i] *= 1 - f.friction;
          if (f.velocity[1] < 0.48) {
            f.resting = true;
            f.settleFrom = [...f.rotation];
            f.settleTo = restingRotation3D(f.mesh, f.rotation);
            f.velocity.fill(0);
            f.angularVelocity.fill(0);
          }
        }
      }
      this.list[write++] = f;
    }
    this.list.length = write;
  }
  draw(painter2) {
    for (const f of this.list) drawFragment3D(painter2, f.mesh, f.position, f.rotation, f.palette, this.scale(f));
  }
};

// src/3d/effects/ice-shatter.ts
var ice_shatter_exports = {};
__export(ice_shatter_exports, {
  ICE_SHATTER_HIT: () => ICE_SHATTER_HIT,
  create: () => create6,
  meta: () => meta6
});
var ICE_SHATTER_HIT = 0.96;
var meta6 = {
  id: "ice/ice-shatter-3d",
  name: "Ice Shatter 3D",
  description: "A solid hexagonal ice pillar develops branching stress cracks, splits into matching faceted pieces and scatters heavy tumbling fragments that bounce, settle and melt.",
  duration: 4.6,
  loop: false,
  stages: [{ at: 0, label: "FREEZE" }, { at: 0.4, label: "STRESS" }, { at: ICE_SHATTER_HIT, label: "FRACTURE" }, { at: 1.48, label: "TUMBLE" }, { at: 2.5, label: "SETTLE" }, { at: 3.45, label: "MELT" }],
  cues: [{ at: ICE_SHATTER_HIT, type: "hit", value: 1 }, { at: ICE_SHATTER_HIT, type: "flash", value: 0.6 }, { at: ICE_SHATTER_HIT, type: "shake", value: 0.3 }, { at: ICE_SHATTER_HIT, type: "sound", value: 1 }],
  options: { seed: 8713, size: 1, force: 1, palette: ["#102742", "#164663", "#236586", "#3686aa", "#58acc6", "#81d5e6", "#b8edf1", "#e9fcf9"] }
};
var DEFAULT_PALETTE = meta6.options.palette;
var prismFaces = [[0, 2, 1], [0, 1, 4], [0, 4, 3], [1, 2, 5], [1, 5, 4], [2, 0, 3], [2, 3, 5], [3, 4, 5]];
function create6(options) {
  const rng = new Rng3D(options.seed), size = clamp3(Number.isFinite(options.size) ? options.size : 1, 0.35, 1.8);
  const force = clamp3(Number.isFinite(options.force) ? options.force : 1, 0.2, 1.6);
  const input = options.palette.length ? options.palette : DEFAULT_PALETTE;
  const palette = Array.from({ length: 8 }, (_, i) => input[Math.round(i / 7 * (input.length - 1))]);
  const pieces = [], debris = new Fragments3D(0.025, 32), dust = new Particles3D(0.03, 160);
  const turn = 0.18, low = 0.08, mid = 1.55, high = 3.12, peak = 4.08;
  const ring = (i, r, y) => {
    const a = turn + i * TAU3 / 6;
    return [Math.cos(a) * r * size, y * size, Math.sin(a) * r * size];
  };
  const seams = Array.from({ length: 6 }, () => mid + rng.range(-0.24, 0.24));
  for (let sector = 0; sector < 6; sector++) for (const upper of [false, true]) {
    const i = sector, j = (i + 1) % 6;
    const vertices = upper ? [[0, mid * size, 0], ring(i, 0.98, seams[i]), ring(j, 0.98, seams[j]), [0, high * size, 0], ring(i, 0.8, high), ring(j, 0.8, high), [0.08 * size, peak * size, -0.03 * size]] : [[0, low * size, 0], ring(i, 0.78, low), ring(j, 0.78, low), [0, mid * size, 0], ring(i, 0.98, seams[i]), ring(j, 0.98, seams[j])];
    const center = [0, 1, 2].map((axis) => vertices.reduce((sum, v) => sum + v[axis], 0) / vertices.length);
    const local = vertices.map((v) => [v[0] - center[0], v[1] - center[1], v[2] - center[2]]);
    const faces = upper ? [...prismFaces.slice(0, 7), [3, 4, 6], [4, 5, 6], [5, 3, 6]] : prismFaces;
    pieces.push({ mesh: { vertices: local, faces }, center, sector, upper, spin: [rng.range(-4, 4), rng.range(-4, 4), rng.range(-4, 4)], speed: rng.range(0.82, 1.16), life: rng.range(2.9, 3.5) });
  }
  const cracks = Array.from({ length: 6 }, (_, i) => {
    const a = turn + (i + 0.5) * TAU3 / 6;
    const length = rng.range(2.5, 4.7) * size;
    return { a, length, split: rng.range(0.42, 0.63) };
  });
  let t = 0, fractured = false;
  function fracture() {
    for (const piece of pieces) {
      const angle = turn + (piece.sector + 0.5) * TAU3 / 6;
      const speed = (piece.upper ? 3.7 : 2.65) * piece.speed * force;
      debris.spawn({
        mesh: piece.mesh,
        position: piece.center,
        velocity: [Math.cos(angle) * speed, (piece.upper ? 3.1 : 3.9) * piece.speed, Math.sin(angle) * speed],
        angularVelocity: piece.spin,
        palette,
        life: piece.life,
        gravity: 10.8,
        drag: 0.72,
        bounce: 0.2,
        friction: 0.64,
        meltStart: 0.68
      });
    }
    for (let i = 0; i < 92; i++) {
      const angle = rng.range(0, TAU3), speed = rng.range(1.6, 7.8) * force;
      dust.spawn({
        position: [rng.range(-0.55, 0.55) * size, rng.range(0.4, 3.4) * size, rng.range(-0.55, 0.55) * size],
        velocity: [Math.cos(angle) * speed, rng.range(1, 5), Math.sin(angle) * speed],
        radius: rng.range(0.015, 0.045),
        life: rng.range(0.35, 0.85),
        color: palette[rng.int(4, 7)],
        style: i % 4 === 0 ? "spark" : "point",
        drag: 1.5,
        gravity: 4.8,
        bounce: 0.08,
        emission: 0.04
      });
    }
  }
  return {
    update(dt) {
      t += dt;
      debris.update(dt);
      dust.update(dt);
      if (!fractured && t + 1e-9 >= ICE_SHATTER_HIT) {
        fractured = true;
        fracture();
      }
    },
    draw(p) {
      if (t <= 0 || t >= meta6.duration - 1e-8) return;
      const age = t - ICE_SHATTER_HIT;
      if (!fractured) {
        const growth = smooth3(0, 0.28, t);
        for (const piece of pieces) {
          const center = [piece.center[0], piece.center[1] * growth, piece.center[2]];
          const mesh = { vertices: piece.mesh.vertices.map((v) => [v[0], v[1] * growth, v[2]]), faces: piece.mesh.faces };
          drawFragment3D(p, mesh, center, [0, 0, 0], palette);
        }
        const stress = smooth3(0.4, 0.9, t);
        for (let i = 0; i < 6; i++) {
          const j = (i + 1) % 6, a = ring(i, 0.986, seams[i]), b = ring(j, 0.986, seams[j]);
          const progress = clamp3(stress * 1.6 - i * 0.09);
          const end = [a[0] + (b[0] - a[0]) * progress, a[1] + (b[1] - a[1]) * progress, a[2] + (b[2] - a[2]) * progress];
          if (progress > 0) p.line(a, end, 0.018, palette[7], 1, 0.09 * stress);
          if (stress > 0.35) {
            const start = ring(i, 0.986, seams[i]);
            const top = ring(i, 0.81 + 0.17 * (1 - stress), seams[i] + (high - seams[i]) * smooth3(0.35, 1, stress));
            p.line(start, top, 0.016, palette[6], 1, 0.05);
            const shell = (u, v) => {
              const lowerA = ring(i, 0.986, seams[i]), lowerB = ring(j, 0.986, seams[j]);
              const upperA = ring(i, 0.806, high), upperB = ring(j, 0.806, high);
              return [0, 1, 2].map((axis) => (lowerA[axis] * (1 - u) + lowerB[axis] * u) * (1 - v) + (upperA[axis] * (1 - u) + upperB[axis] * u) * v);
            };
            const extension = smooth3(0.45, 0.97, stress);
            let previous = shell(0.45, 0);
            for (let step = 1; step <= 4; step++) {
              const next = shell(0.45 + Math.sin(step * 2.7 + i) * 0.12, step * 0.17 * extension);
              p.line(previous, next, 0.012, palette[6], 1, 0.04 * stress);
              previous = next;
            }
          }
        }
      }
      if (fractured) {
        const spread = smooth3(0, 0.32, age), groundFade = 1 - smooth3(1.1, 2.3, age);
        if (groundFade > 0) for (const c of cracks) {
          const r = c.length * spread, bend = c.a + 0.13;
          const root = [Math.cos(c.a) * 0.35, 0.032, Math.sin(c.a) * 0.35];
          const joint = [Math.cos(c.a) * r * c.split, 0.032, Math.sin(c.a) * r * c.split];
          const end = [Math.cos(bend) * r, 0.032, Math.sin(bend) * r];
          p.line(root, joint, 0.021 * groundFade, palette[3], 1, 0.02 * groundFade);
          p.line(joint, end, 0.012 * groundFade, palette[4], 1, 0.015 * groundFade);
          if (spread > 0.7) p.line(joint, [joint[0] + Math.cos(c.a - 0.65) * r * 0.24, 0.032, joint[2] + Math.sin(c.a - 0.65) * r * 0.24], 0.012 * groundFade, palette[3]);
        }
        debris.draw(p);
        dust.draw(p);
        const flash = 1 - smooth3(0, 0.095, age);
        if (flash > 0) {
          p.glow([0, 1.8 * size, 0], 2.1 * size, palette[5], flash * 0.24);
          for (let i = 0; i < 6; i++) {
            const a = i * TAU3 / 6;
            p.line([0, 1.7 * size, 0], [Math.cos(a) * 1.15 * flash, (1.7 + Math.sin(a) * 0.8) * size, Math.sin(a) * 1.15 * flash], 0.034 * flash, palette[7], 1, 0.12 * flash);
          }
        }
      }
    }
  };
}

// src/3d/volume.ts
var BAYER42 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
function drawVolume3D(p, bounds, field, options = {}) {
  const step = options.step ?? 0.14, maxSteps = options.maxSteps ?? 96, opacity = options.opacity ?? 1;
  if (!(Number.isFinite(step) && step > 0)) throw new RangeError("Volume step must be finite and positive");
  if (!(Number.isSafeInteger(maxSteps) && maxSteps > 0)) throw new RangeError("Volume maxSteps must be a positive integer");
  if (!Number.isFinite(opacity)) throw new RangeError("Volume opacity must be finite");
  for (let i = 0; i < 3; i++) if (!Number.isFinite(bounds.min[i]) || !Number.isFinite(bounds.max[i]) || bounds.max[i] <= bounds.min[i]) throw new RangeError("Volume bounds must have finite positive extents");
  if (options.alphaCutoff !== void 0 && (!Number.isFinite(options.alphaCutoff) || options.alphaCutoff < 0 || options.alphaCutoff > 1)) throw new RangeError("Volume alphaCutoff must be between zero and one");
  if (opacity <= 0) return;
  const f = p.frame, camera = p.camera, origin = camera.target ?? [0, 0, 0];
  const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw), ce = Math.cos(camera.elevation), se = Math.sin(camera.elevation);
  const right = [cy, 0, -sy], up = [-sy * se, ce, -cy * se], front = [sy * ce, se, cy * ce];
  const scale = Math.min(f.w / 17, f.h / 11) * camera.zoom;
  const perspective = camera.projection === "perspective" ? camera.perspective ?? 0.025 : 0;
  let x0 = f.w, x1 = -1, y0 = f.h, y1 = -1;
  for (let i = 0; i < 8; i++) {
    const v = p.project([i & 1 ? bounds.max[0] : bounds.min[0], i & 2 ? bounds.max[1] : bounds.min[1], i & 4 ? bounds.max[2] : bounds.min[2]]);
    x0 = Math.min(x0, Math.floor(v.x));
    x1 = Math.max(x1, Math.ceil(v.x));
    y0 = Math.min(y0, Math.floor(v.y));
    y1 = Math.max(y1, Math.ceil(v.y));
  }
  x0 = Math.max(0, x0);
  x1 = Math.min(f.w - 1, x1);
  y0 = Math.max(0, y0);
  y1 = Math.min(f.h - 1, y1);
  const palette = options.palette?.map(color3D), volumeOpacity = clamp3(opacity);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const u = (x + 0.5 - f.w * 0.5) / scale, v = (f.h * 0.61 - y - 0.5) / scale;
    const offset = [right[0] * u + up[0] * v, right[1] * u + up[1] * v, right[2] * u + up[2] * v];
    const ray = [front[0] - offset[0] * perspective, front[1] - offset[1] * perspective, front[2] - offset[2] * perspective];
    const base = [origin[0] + offset[0], origin[1] + offset[1], origin[2] + offset[2]];
    let near = Infinity, far = -Infinity, hit = true;
    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(ray[axis]) < 1e-12) {
        if (base[axis] < bounds.min[axis] || base[axis] > bounds.max[axis]) hit = false;
      } else {
        const a = (bounds.min[axis] - base[axis]) / ray[axis], b2 = (bounds.max[axis] - base[axis]) / ray[axis];
        near = Math.min(near, Math.max(a, b2));
        far = Math.max(far, Math.min(a, b2));
      }
    }
    const pixel2 = y * f.w + x;
    far = Math.max(far, p.opaqueDepthAt(x, y));
    if (perspective > 0) near = Math.min(near, 0.7 / perspective);
    else if (perspective < 0) far = Math.max(far, 0.7 / perspective);
    if (!hit || near <= far) continue;
    const distanceScale = Math.hypot(...ray), span = (near - far) * distanceScale;
    const count = Math.min(maxSteps, Math.max(1, Math.ceil(span / step)));
    const depthStep = (near - far) / count, ds = span / count;
    let transmittance = 1, r = 0, g = 0, b = 0, lr = 0, lg = 0, lb = 0, hr = 0, hg = 0, hb = 0;
    for (let n = 0; n < count && transmittance > 8e-3; n++) {
      const depth = near - (n + 0.5) * depthStep;
      const sample = field(base[0] + ray[0] * depth, base[1] + ray[1] * depth, base[2] + ray[2] * depth);
      if (!sample || !(sample.density > 0) || !Number.isFinite(sample.density)) continue;
      const c = color3D(sample.color), a = 1 - Math.exp(-sample.density * ds * volumeOpacity * (c >>> 24) / 255), weight = transmittance * a;
      r += (c & 255) * weight;
      g += (c >>> 8 & 255) * weight;
      b += (c >>> 16 & 255) * weight;
      const light = Number.isFinite(sample.emission) ? Math.max(0, sample.emission ?? 0) * weight : 0;
      lr += (c & 255) * light;
      lg += (c >>> 8 & 255) * light;
      lb += (c >>> 16 & 255) * light;
      if (sample.emissionRGB) {
        const e = sample.emissionRGB;
        if (e.length !== 3 || !e.every((v2) => Number.isFinite(v2) && v2 >= 0)) throw new RangeError("Volume emissionRGB must be finite nonnegative linear RGB");
        const encode = (v2) => 255 * (v2 <= 31308e-7 ? v2 * 12.92 : 1.055 * v2 ** (1 / 2.4) - 0.055);
        lr += encode(Math.max(0, e[0])) * weight - (c & 255) * light;
        lg += encode(Math.max(0, e[1])) * weight - (c >>> 8 & 255) * light;
        lb += encode(Math.max(0, e[2])) * weight - (c >>> 16 & 255) * light;
        hr += Math.max(0, e[0]) * weight;
        hg += Math.max(0, e[1]) * weight;
        hb += Math.max(0, e[2]) * weight;
      } else if (f.hdrLight && light > 0) {
        hr += channelToLinear(c, 0) * light;
        hg += channelToLinear(c, 8) * light;
        hb += channelToLinear(c, 16) * light;
      }
      transmittance *= 1 - a;
    }
    const alpha = 1 - transmittance;
    if (alpha < (options.alphaCutoff ?? 0.012)) continue;
    r /= alpha;
    g /= alpha;
    b /= alpha;
    let color = (4278190080 | Math.round(b) << 16 | Math.round(g) << 8 | Math.round(r)) >>> 0;
    if (palette?.length) {
      let best = Infinity;
      for (const c of palette) {
        const d = ((c & 255) - r) ** 2 + ((c >>> 8 & 255) - g) ** 2 + ((c >>> 16 & 255) - b) ** 2;
        if (d < best) {
          best = d;
          color = (c | 4278190080) >>> 0;
        }
      }
    }
    const dither = p.alphaMode === "dither";
    if (dither && alpha <= BAYER42[(y & 3) << 2 | x & 3]) continue;
    p.volumePixel(x, y, near, color, dither ? 1 : alpha, lr, lg, lb, hr, hg, hb);
  }
}
function volumeNoise3D(x, y, z, seed2 = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const ease = (n) => n * n * (3 - 2 * n);
  const u = ease(x - ix), v = ease(y - iy), w = ease(z - iz);
  const hash2 = (a, b, c) => {
    let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2147483647) ^ Math.imul(seed2 | 0, 1274126177);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967295;
  };
  const mix2 = (a, b, t) => a + (b - a) * t;
  return mix2(
    mix2(mix2(hash2(ix, iy, iz), hash2(ix + 1, iy, iz), u), mix2(hash2(ix, iy + 1, iz), hash2(ix + 1, iy + 1, iz), u), v),
    mix2(mix2(hash2(ix, iy, iz + 1), hash2(ix + 1, iy, iz + 1), u), mix2(hash2(ix, iy + 1, iz + 1), hash2(ix + 1, iy + 1, iz + 1), u), v),
    w
  );
}
var VolumeGrid3D = class {
  bounds;
  dimensions;
  data;
  occupied;
  materials;
  uniformMaterials;
  hasEmission = false;
  rgbEmission;
  rgbCells;
  hasRGBEmission = false;
  sampleIndices = new Float64Array(8);
  sampleWeights = new Float64Array(8);
  outputRGB = [0, 0, 0];
  inverse;
  output = { density: 0, color: 0, emission: 0 };
  constructor(bounds, cellSize = 0.16) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError("Volume cellSize must be finite and positive");
    for (let i = 0; i < 3; i++) if (!Number.isFinite(bounds.min[i]) || !Number.isFinite(bounds.max[i]) || bounds.max[i] <= bounds.min[i]) throw new RangeError("Volume bounds must have finite positive extents");
    this.bounds = { min: [...bounds.min], max: [...bounds.max] };
    this.dimensions = bounds.min.map((v, i) => Math.ceil((bounds.max[i] - v) / cellSize) + 1);
    const count = this.dimensions[0] * this.dimensions[1] * this.dimensions[2];
    if (count > 2e6) throw new RangeError("Volume grid exceeds two million samples");
    this.data = new Float32Array(count * 5);
    this.occupied = new Uint8Array(count);
    this.materials = new Uint32Array(count);
    this.uniformMaterials = new Uint32Array(count);
    this.inverse = this.dimensions.map((v, i) => (v - 1) / (bounds.max[i] - bounds.min[i]));
  }
  refill(field) {
    const [nx, ny, nz] = this.dimensions, min = this.bounds.min;
    this.data.fill(0);
    this.materials.fill(0);
    this.hasEmission = false;
    this.hasRGBEmission = false;
    this.rgbEmission?.fill(0);
    this.rgbCells?.fill(0);
    let i = 0;
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++, i += 5) {
      const sample = field(min[0] + x / this.inverse[0], min[1] + y / this.inverse[1], min[2] + z / this.inverse[2]);
      if (!sample || !(sample.density > 0) || !Number.isFinite(sample.density)) continue;
      const c = color3D(sample.color), d = sample.density * (c >>> 24) / 255;
      this.data[i] = d;
      this.data[i + 1] = (c & 255) * d;
      this.data[i + 2] = (c >>> 8 & 255) * d;
      this.data[i + 3] = (c >>> 16 & 255) * d;
      if (!this.hasEmission) this.materials[i / 5] = Number.isFinite(this.data[i + 1] + this.data[i + 2] + this.data[i + 3]) ? (c | 4278190080) >>> 0 : 1;
      this.data[i + 4] = Number.isFinite(sample.emission) ? Math.max(0, sample.emission ?? 0) * d : 0;
      if (this.data[i + 4] > 0) this.hasEmission = true;
      if (sample.emissionRGB) {
        this.rgbEmission ??= new Float32Array(this.materials.length * 3);
        this.rgbCells ??= new Uint8Array(this.materials.length);
        if (sample.emissionRGB.length !== 3 || !sample.emissionRGB.every((v) => Number.isFinite(v) && v >= 0)) throw new RangeError("Volume emissionRGB must be finite nonnegative linear RGB");
        this.rgbCells[i / 5] = 1;
        const j = i / 5 * 3;
        for (let ch2 = 0; ch2 < 3; ch2++) this.rgbEmission[j + ch2] = Math.max(0, sample.emissionRGB[ch2]) * d;
        this.hasRGBEmission = true;
      }
    }
    const row = nx * 5, plane = nx * ny * 5, data = this.data;
    for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
      const cell = (z * ny + y) * nx + x, i2 = cell * 5;
      this.occupied[cell] = +(data[i2] > 0 || data[i2 + 5] > 0 || data[i2 + row] > 0 || data[i2 + row + 5] > 0 || data[i2 + plane] > 0 || data[i2 + plane + 5] > 0 || data[i2 + plane + row] > 0 || data[i2 + plane + row + 5] > 0);
      if (!this.hasEmission) {
        const m = this.materials, c0 = m[cell], c1 = m[cell + 1], c2 = m[cell + nx], c3 = m[cell + nx + 1];
        const c4 = m[cell + nx * ny], c5 = m[cell + nx * ny + 1], c6 = m[cell + nx * ny + nx], c7 = m[cell + nx * ny + nx + 1];
        const c = c0 || c1 || c2 || c3 || c4 || c5 || c6 || c7;
        this.uniformMaterials[cell] = c > 16777215 && (!c0 || c0 === c) && (!c1 || c1 === c) && (!c2 || c2 === c) && (!c3 || c3 === c) && (!c4 || c4 === c) && (!c5 || c5 === c) && (!c6 || c6 === c) && (!c7 || c7 === c) ? c : 0;
      }
    }
  }
  /** The result is borrowed and valid only until the next call. */
  sample = (x, y, z) => {
    const min = this.bounds.min, max = this.bounds.max;
    if (x < min[0] || y < min[1] || z < min[2] || x > max[0] || y > max[1] || z > max[2]) return;
    const [nx, ny, nz] = this.dimensions;
    x = (x - min[0]) * this.inverse[0];
    y = (y - min[1]) * this.inverse[1];
    z = (z - min[2]) * this.inverse[2];
    const ix = Math.min(nx - 2, Math.floor(x)), iy = Math.min(ny - 2, Math.floor(y)), iz = Math.min(nz - 2, Math.floor(z));
    const cell = (iz * ny + iy) * nx + ix;
    if (!this.occupied[cell]) return;
    const u = x - ix, v = y - iy, w = z - iz;
    const uv00 = (1 - u) * (1 - v), uv10 = u * (1 - v), uv01 = (1 - u) * v, uv11 = u * v;
    const w0 = uv00 * (1 - w), w1 = uv10 * (1 - w), w2 = uv01 * (1 - w), w3 = uv11 * (1 - w);
    const w4 = uv00 * w, w5 = uv10 * w, w6 = uv01 * w, w7 = uv11 * w;
    const i0 = cell * 5, i1 = i0 + 5, i2 = i0 + nx * 5, i3 = i2 + 5;
    const i4 = i0 + nx * ny * 5, i5 = i4 + 5, i6 = i4 + nx * 5, i7 = i6 + 5;
    const data = this.data;
    const density = data[i0] * w0 + data[i1] * w1 + data[i2] * w2 + data[i3] * w3 + data[i4] * w4 + data[i5] * w5 + data[i6] * w6 + data[i7] * w7;
    if (density < 1e-6) return;
    this.output.density = density;
    const material = this.hasEmission ? 0 : this.uniformMaterials[cell];
    if (material && Number.isFinite(density)) this.output.color = material;
    else {
      const r = data[i0 + 1] * w0 + data[i1 + 1] * w1 + data[i2 + 1] * w2 + data[i3 + 1] * w3 + data[i4 + 1] * w4 + data[i5 + 1] * w5 + data[i6 + 1] * w6 + data[i7 + 1] * w7;
      const g = data[i0 + 2] * w0 + data[i1 + 2] * w1 + data[i2 + 2] * w2 + data[i3 + 2] * w3 + data[i4 + 2] * w4 + data[i5 + 2] * w5 + data[i6 + 2] * w6 + data[i7 + 2] * w7;
      const b = data[i0 + 3] * w0 + data[i1 + 3] * w1 + data[i2 + 3] * w2 + data[i3 + 3] * w3 + data[i4 + 3] * w4 + data[i5 + 3] * w5 + data[i6 + 3] * w6 + data[i7 + 3] * w7;
      this.output.color = (4278190080 | Math.round(b / density) << 16 | Math.round(g / density) << 8 | Math.round(r / density)) >>> 0;
    }
    const emission = this.hasEmission || !Number.isFinite(density) ? data[i0 + 4] * w0 + data[i1 + 4] * w1 + data[i2 + 4] * w2 + data[i3 + 4] * w3 + data[i4 + 4] * w4 + data[i5 + 4] * w5 + data[i6 + 4] * w6 + data[i7 + 4] * w7 : 0;
    this.output.emission = emission / density;
    delete this.output.emissionRGB;
    if (this.hasRGBEmission && this.rgbEmission) {
      const indices = this.sampleIndices, weights = this.sampleWeights;
      indices[0] = i0;
      indices[1] = i1;
      indices[2] = i2;
      indices[3] = i3;
      indices[4] = i4;
      indices[5] = i5;
      indices[6] = i6;
      indices[7] = i7;
      weights[0] = w0;
      weights[1] = w1;
      weights[2] = w2;
      weights[3] = w3;
      weights[4] = w4;
      weights[5] = w5;
      weights[6] = w6;
      weights[7] = w7;
      for (let ch2 = 0; ch2 < 3; ch2++) {
        let value = 0;
        for (let k = 0; k < 8; k++) {
          const address = indices[k], rgb2 = this.rgbEmission[address / 5 * 3 + ch2];
          value += (this.rgbCells?.[address / 5] ? rgb2 : data[address + 4] > 0 && data[address] > 0 ? channelToLinear((4278190080 | Math.round(data[address + 3] / data[address]) << 16 | Math.round(data[address + 2] / data[address]) << 8 | Math.round(data[address + 1] / data[address])) >>> 0, ch2 * 8) * data[address + 4] : 0) * weights[k];
        }
        this.outputRGB[ch2] = value / density;
      }
      this.output.emissionRGB = this.outputRGB;
    }
    return this.output;
  };
};

// src/3d/effects/thermal-plume.ts
var thermal_plume_exports = {};
__export(thermal_plume_exports, {
  create: () => create7,
  meta: () => meta7
});
var meta7 = {
  id: "fire/thermal-plume-3d",
  name: "Thermal Plume 3D",
  description: "A hot fuel bed feeds folded flame tongues. Buoyancy stretches and lifts the tips while cooling soot rolls upward, expands, drifts with the wind and dissolves.",
  duration: 6.4,
  loop: false,
  stages: [{ at: 0, label: "IGNITE" }, { at: 0.4, label: "BURN" }, { at: 3.2, label: "COOL" }, { at: 4.5, label: "DISSIPATE" }],
  cues: [{ at: 0.12, type: "sound", value: 0.5 }],
  options: { seed: 4217, size: 1, wind: 0.34, smoke: 0.82, palette: ["#642426", "#a83524", "#db4c22", "#f97725", "#ffae3c", "#ffd96b", "#fff1ae"] }
};
function create7(options) {
  const rng = new Rng3D(options.seed), size = clamp3(Number.isFinite(options.size) ? options.size : 1, 0.4, 1.5);
  const wind = clamp3(Number.isFinite(options.wind) ? options.wind : 0.34, -0.8, 0.8);
  const smokeAmount = clamp3(Number.isFinite(options.smoke) ? options.smoke : 0.82, 0, 1.5);
  const source = options.palette.length ? options.palette : meta7.options.palette;
  const fire = Array.from({ length: 7 }, (_, i) => color3D(source[Math.round(i / 6 * (source.length - 1))]));
  const soot = ["#272b37", "#363946", "#454654", "#575461", "#68616a"].map(color3D);
  const palette = [...fire, ...soot];
  const tongues = Array.from({ length: 6 }, (_, i) => ({ angle: i * TAU3 / 6 + rng.range(-0.2, 0.2), height: rng.range(2.6, 4.2), width: rng.range(0.4, 0.62), phase: rng.range(0, TAU3), frequency: rng.range(3.4, 5.2) }));
  const smoke = Array.from({ length: 18 }, (_, i) => ({ born: 0.35 + i * 0.2, life: rng.range(2.2, 2.6), phase: i * 1.65 + rng.range(-0.35, 0.35), spread: rng.range(0.82, 1.18) }));
  const embers = Array.from({ length: 24 }, () => ({ born: rng.range(0.2, 3.6), life: rng.range(0.8, 1.7), angle: rng.range(0, TAU3), r: rng.range(0.08, 0.72), speed: rng.range(1.8, 2.9), phase: rng.range(0, TAU3) }));
  const bounds = { min: [-4.3 * size, 0, -2.1 * size], max: [4.3 * size, 6.5 * size, 2.1 * size] };
  const grid = new VolumeGrid3D(bounds, 0.16 * size);
  let t = 0, cachedTime = -1;
  return {
    update(dt) {
      t += dt;
    },
    draw(p) {
      if (t <= 0 || t >= meta7.duration - 1e-8) return;
      const ignition = smooth3(0, 0.42, t), fuel = ignition * (1 - smooth3(3, 4.25, t));
      const residue = ignition * (1 - smooth3(4.15, 5.8, t));
      if (residue > 0) for (let i = 0; i < 12; i++) {
        const a = i * TAU3 / 12, r = 0.62 + 0.13 * Math.sin(i * 4.7);
        const at = [Math.cos(a) * r * size, 0.055 * size, Math.sin(a) * r * size];
        p.point(at, (0.2 + 0.04 * Math.sin(i * 2.7)) * size * residue, fire[0], 1, 0.015 * fuel);
        p.line(at, [at[0] * 0.76, 0.075 * size, at[2] * 0.76], 0.035 * size * residue, fire[2], 1, 0.03 * fuel);
      }
      const active = tongues.map((q) => ({ ...q, h: q.height * (0.8 + 0.18 * Math.sin(t * q.frequency + q.phase)) * (0.3 + 0.7 * fuel) }));
      const puffs = smoke.map((q) => {
        const age = t - q.born, u = age / q.life;
        if (u <= 0 || u >= 1) return void 0;
        const emission = smooth3(0, 0.3, q.born) * (1 - smooth3(3, 3.9, q.born));
        const rise = 2 + age * 1.45 - 0.13 * age * age;
        return {
          x: wind * (0.3 + age * 1.25) + Math.sin(q.phase + age * 1.6) * (0.16 + age * 0.3),
          y: rise,
          z: Math.cos(q.phase + age * 1.6) * (0.16 + age * 0.3),
          r: (0.34 + age * 0.44) * q.spread,
          density: emission * smooth3(0, 0.2, u) * (1 - smooth3(0.5, 1, u)) * smokeAmount,
          phase: q.phase
        };
      }).filter((q) => q !== void 0);
      const slices = /* @__PURE__ */ new Map();
      const field = (xx, yy, zz) => {
        const x = xx / size, y = yy / size, z = zz / size;
        if (y < 0.06) return;
        let heat = 0, density = 0;
        if (fuel > 2e-3 && y < 4.7 && Math.abs(x) < 2.2 && Math.abs(z) < 1.8) {
          const n = volumeNoise3D(x * 2.1, y * 1.4 - t * 2.25, z * 2.1, options.seed);
          const ripple = (n - 0.5) * 0.27;
          const root = Math.max(0, 1 - (x * x + z * z) / 0.85 - y / 1.35);
          heat = root * 1.12;
          let slice = slices.get(y);
          if (!slice) {
            slice = [];
            for (const q of active) {
              const u = y / q.h;
              if (u >= 1) continue;
              const bend = Math.sin(y * 1.8 - t * q.frequency + q.phase);
              const radius = q.width * Math.pow(1 - u, 0.72) * (0.9 + 0.16 * Math.sin(y * 3.4 - t * 5 + q.phase));
              const centerX = Math.cos(q.angle) * (0.48 - u * 0.15) + wind * y * 0.35 + bend * u * 0.34;
              const centerZ = Math.sin(q.angle) * (0.48 - u * 0.15) + Math.cos(y * 1.65 - t * q.frequency * 0.83 + q.phase) * u * 0.28;
              slice.push({ u, radius: Math.max(0.035, radius), centerX, centerZ });
            }
            slices.set(y, slice);
          }
          for (const q of slice) {
            const radial = Math.hypot(x - q.centerX, z - q.centerZ) / q.radius;
            const body = 1 - radial + ripple * (0.4 + q.u);
            if (body > 0) heat = Math.max(heat, body * (0.86 - q.u * 0.45));
          }
          if (heat > 0.035) {
            const temperature = clamp3((0.15 + Math.sqrt(heat) * 0.93 - y * 0.045) * (0.65 + 0.35 * fuel));
            density = smooth3(0.035, 0.22, heat) * 4.5 * fuel / size;
            return { density, color: fire[Math.min(6, Math.floor(temperature * 7))], emission: 0.025 + temperature * 0.055 };
          }
        }
        if (puffs.length && y > 1.4) {
          let strongest = 0, roll = 0;
          for (const q of puffs) {
            const dx = (x - q.x) / q.r, dy = (y - q.y) / (q.r * 0.84), dz = (z - q.z) / q.r;
            const distance = dx * dx + dy * dy + dz * dz;
            if (distance < 1.6) {
              const n = volumeNoise3D(x * 2 + q.phase, y * 1.9 - t * 0.8, z * 2, options.seed + 81);
              const body = Math.max(0, 1 - distance + (n - 0.5) * 1.05) * q.density;
              density += body * 0.75 / size;
              if (body > strongest) {
                strongest = body;
                roll = -dx * 0.15 + dy * 0.18 + n * 0.48;
              }
            }
          }
          if (density > 6e-3) return { density, color: soot[Math.floor(clamp3(0.25 + roll) * 4.99)] };
        }
      };
      if (cachedTime !== t) {
        grid.refill(field);
        cachedTime = t;
      }
      let left = -1.4, right = 1.8, top = fuel > 2e-3 ? 4.5 : 0.2, back = -1.4, front = 1.4;
      for (const q of puffs) {
        left = Math.min(left, q.x - q.r * 1.3);
        right = Math.max(right, q.x + q.r * 1.3);
        top = Math.max(top, q.y + q.r * 1.1);
        back = Math.min(back, q.z - q.r * 1.3);
        front = Math.max(front, q.z + q.r * 1.3);
      }
      if (fuel > 2e-3 || puffs.length) drawVolume3D(
        p,
        { min: [left * size, 0, Math.max(-2.1, back) * size], max: [right * size, Math.min(6.5, top) * size, Math.min(2.1, front) * size] },
        grid.sample,
        { step: 0.085 * size, maxSteps: 128, palette, alphaCutoff: 0.14 }
      );
      for (const e of embers) {
        const age = t - e.born, u = age / e.life;
        if (u <= 0 || u >= 1) continue;
        const r = e.r + age * 0.1;
        const pos = [(Math.cos(e.angle) * r + wind * age + Math.sin(age * 3 + e.phase) * age * 0.1) * size, (0.4 + age * e.speed) * size, Math.sin(e.angle) * r * size];
        const fade = smooth3(0, 0.1, u) * (1 - smooth3(0.35, 1, u));
        p.line([pos[0] - wind * 0.035 * size, pos[1] - 0.075 * size, pos[2]], pos, 0.018 * size * fade, fire[u < 0.4 ? 5 : 2], 1, fade * 0.1);
      }
    }
  };
}

// src/3d/discharge.ts
var DISCHARGE_PALETTE_3D = ["#172744", "#354c83", "#586fc0", "#809eec", "#bddcff", "#f2fbff"];
var finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
var mix = (a, b, t) => add3(a, mul3(sub3(b, a), t));
function createDischarge3D(options) {
  for (const point of [options.start, options.end]) if (point.length !== 3 || !point.every(Number.isFinite)) throw new RangeError("Discharge endpoints must be finite XYZ coordinates");
  const distance = len3(sub3(options.end, options.start));
  if (distance < 1e-8) return [];
  const rng = new Rng3D(finite(options.seed, 1));
  const roughness = clamp3(finite(options.roughness, 0.19), 0, 0.6);
  const detail = Math.round(clamp3(finite(options.detail, 5), 2, 7));
  const count = Math.round(clamp3(finite(options.branches, 6), 0, 12));
  const direction = norm3(sub3(options.end, options.start));
  const side = norm3(cross3(direction, Math.abs(direction[1]) < 0.85 ? [0, 1, 0] : [1, 0, 0]));
  const other = cross3(direction, side);
  const channels = [];
  function jagged(a, b, depth) {
    let points = [a, b];
    for (let level = 0; level < depth; level++) {
      const next = [points[0]];
      for (let i = 1; i < points.length; i++) {
        const first = points[i - 1], last2 = points[i], axis = norm3(sub3(last2, first));
        const u = norm3(cross3(axis, Math.abs(axis[1]) < 0.85 ? [0, 1, 0] : [1, 0, 0]));
        const v = cross3(axis, u), amplitude = len3(sub3(last2, first)) * roughness;
        const mid = add3(mix(first, last2, rng.range(0.36, 0.64)), add3(mul3(u, rng.range(-amplitude, amplitude)), mul3(v, rng.range(-amplitude, amplitude))));
        next.push(mid, last2);
      }
      points = next;
    }
    return points;
  }
  function append(points, parent, attachment, generation, strength) {
    const distances = [0];
    for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + len3(sub3(points[i], points[i - 1])));
    const length = distances[distances.length - 1];
    const rootDistance = parent < 0 ? 0 : channels[parent].rootDistance + channels[parent].distances[attachment] * channels[parent].length / channels[0].length;
    channels.push({ points, distances: distances.map((d) => d / length), length, parent, attachment, generation, rootDistance, strength });
    return channels.length - 1;
  }
  append(jagged(options.start, options.end, detail), -1, 0, 0, 1);
  for (let i = 0; i < count; i++) {
    const main = channels[0], index = Math.round((0.12 + 0.7 * (i + rng.range(0.1, 0.85)) / Math.max(1, count)) * (main.points.length - 1));
    const root = main.points[index], angle = i * 2.399963229728653 + rng.range(-0.45, 0.45);
    const remaining = len3(sub3(options.end, root));
    const branchLength = Math.min(distance * rng.range(0.18, 0.44), remaining * 0.88);
    const outward = add3(mul3(side, Math.cos(angle)), mul3(other, Math.sin(angle)));
    const end = add3(root, mul3(norm3(add3(mul3(direction, rng.range(0.3, 0.78)), outward)), branchLength));
    const child = append(jagged(root, end, Math.max(2, detail - 1)), 0, index, 1, rng.range(0.5, 0.74));
    if (i % 3 !== 1) {
      const parent = channels[child], junction = rng.int(1, parent.points.length - 2), start = parent.points[junction];
      const branchAxis = norm3(sub3(end, root));
      const twigDirection = norm3(add3(mul3(branchAxis, 0.6), add3(mul3(side, rng.range(-0.8, 0.8)), mul3(other, rng.range(-0.8, 0.8)))));
      append(jagged(start, add3(start, mul3(twigDirection, branchLength * rng.range(0.2, 0.5))), Math.max(2, detail - 2)), child, junction, 2, parent.strength * 0.56);
    }
  }
  return channels;
}
function dischargePulse3D(time, strokes, decay = 0.085) {
  if (!Number.isFinite(time) || !Number.isFinite(decay) || decay <= 0) return 0;
  let energy = 0;
  for (let i = 0; i < strokes.length; i++) {
    const age = time - strokes[i];
    if (age >= 0) energy += (i === 0 ? 1 : 0.72 + 0.12 * (i % 2)) * Math.exp(-Math.max(0, age - 0.025) / decay);
  }
  return clamp3(energy);
}
function drawDischarge3D(painter2, channels, options = {}) {
  if (!channels.length) return;
  const progress = Math.max(0, finite(options.progress, 1.5)), stroke = clamp3(finite(options.stroke, 1));
  const residual = clamp3(finite(options.residual, 0.12)), radius = Math.max(0, finite(options.radius, 0.045));
  const emission = Math.max(0, finite(options.emission, 0.16));
  const palette = options.palette?.length ? options.palette : DISCHARGE_PALETTE_3D;
  const color = (t) => palette[Math.round(clamp3(t) * (palette.length - 1))];
  if (radius <= 0 || stroke <= 0 && residual <= 0 || progress <= 0) return;
  for (let c = channels.length - 1; c >= 0; c--) {
    const channel = channels[c], revealed = (progress - channel.rootDistance) * channels[0].length / channel.length;
    if (revealed <= 0) continue;
    const forkDecay = channel.generation === 0 ? 1 : stroke ** (0.35 * channel.generation);
    for (let i = 1; i < channel.points.length; i++) {
      const from = channel.distances[i - 1], to = channel.distances[i];
      if (from >= revealed) break;
      const u = (from + Math.min(to, revealed)) * 0.5, taper = channel.generation === 0 ? 0.82 + 0.18 * (1 - u) : 1 - 0.68 * u;
      const conductance = 0.86 + 0.14 * Math.sin(i * 1.91 + c * 2.73) ** 2;
      const energy = (stroke * forkDecay + residual * 0.35) * channel.strength * taper * conductance;
      if (energy < 0.025) continue;
      const start = channel.points[i - 1], end = revealed < to ? mix(start, channel.points[i], clamp3((revealed - from) / (to - from))) : channel.points[i];
      const width2 = radius * (0.52 + stroke * 0.75) * channel.strength * taper;
      const tone = channel.generation === 0 ? 0.18 + Math.sqrt(energy) * 0.82 : 0.12 + Math.sqrt(energy) * 0.7;
      painter2.line(start, end, width2, color(tone), 1, emission * energy);
    }
  }
}

// src/3d/effects/forked-lightning.ts
var forked_lightning_exports = {};
__export(forked_lightning_exports, {
  LIGHTNING_STROKES_3D: () => LIGHTNING_STROKES_3D,
  create: () => create8,
  meta: () => meta8
});
var LIGHTNING_STROKES_3D = [0.64, 0.94, 1.39];
var meta8 = {
  id: "lightning/forked-lightning-3d",
  name: "Forked Lightning 3D",
  description: "An irregular stepped leader finds the ground, then three uneven return strokes light the same branching 3D channel. Thin forks extinguish before the trunk; ground streamers and hot contact sparks fade separately.",
  duration: 2.6,
  loop: false,
  options: { seed: 7361, height: 6.2, branching: 7, intensity: 1, palette: [...DISCHARGE_PALETTE_3D] },
  stages: [{ at: 0, label: "LEADER" }, { at: 0.42, label: "CONNECT" }, { at: 0.64, label: "RETURN STROKE" }, { at: 0.94, label: "RESTRIKE" }, { at: 1.39, label: "FINAL STROKE" }, { at: 1.8, label: "EXTINGUISH" }],
  cues: LIGHTNING_STROKES_3D.flatMap((at, i) => [{ at, type: "flash", value: i ? 0.45 : 0.8 }, { at, type: "hit", value: i ? 0.5 : 1 }, { at, type: "sound", value: i ? 0.55 : 1 }])
};
function create8(options) {
  const height2 = clamp3(Number.isFinite(options.height) ? options.height : 6.2, 2, 8);
  const intensity = clamp3(Number.isFinite(options.intensity) ? options.intensity : 1, 0, 2);
  const palette = options.palette.length ? options.palette : meta8.options.palette;
  const tone = (u) => palette[Math.round(u * (palette.length - 1))];
  const origin = [-1.8, height2, -0.6], contact = [0.8, 0.05, 0.3];
  const channels = createDischarge3D({ start: origin, end: contact, seed: options.seed, branches: options.branching, roughness: 0.23, detail: 5 });
  const rng = new Rng3D(options.seed ^ 1779033703), sparks = new Particles3D(0.035, 100);
  const streamers = Array.from({ length: 4 }, (_, i) => {
    const angle = i * TAU3 / 4 + rng.range(-0.5, 0.5), reach = rng.range(0.65, 1.6);
    return createDischarge3D({ start: [contact[0] + Math.cos(angle) * reach, 0.045, contact[2] + Math.sin(angle) * reach], end: [contact[0] + rng.range(-0.35, 0.35), rng.range(0.7, 1.25), contact[2] + rng.range(-0.35, 0.35)], seed: rng.int(1, 2147483647), detail: 3, branches: 1, roughness: 0.25 });
  });
  let t = 0, nextStroke = 0;
  return {
    update(dt) {
      t += dt;
      sparks.update(dt);
      while (nextStroke < LIGHTNING_STROKES_3D.length && t + 1e-9 >= LIGHTNING_STROKES_3D[nextStroke]) {
        for (let i = 0; i < (nextStroke ? 12 : 22); i++) {
          const a = rng.range(0, TAU3), speed = rng.range(0.7, 2.8);
          sparks.spawn({ position: contact, velocity: [Math.cos(a) * speed, rng.range(1.2, 3.4), Math.sin(a) * speed], life: rng.range(0.13, 0.48), radius: rng.range(0.015, 0.035), color: tone(i % 3 ? 0.8 : 1), style: "spark", gravity: 8, drag: 1.7, emission: 0.1 * intensity });
        }
        nextStroke++;
      }
    },
    draw(p) {
      if (t <= 0 || t >= meta8.duration - 1e-8 || intensity <= 0) return;
      const pulse = dischargePulse3D(t, LIGHTNING_STROKES_3D, 0.075);
      const leader = clamp3((t - 0.06) / 0.56), stepped = Math.floor(leader * 18) / 18;
      const progress = t < 0.64 ? stepped : 1.5;
      const residual = (t < 0.64 ? 0.28 : 0.22 * pulse ** 0.4) * (1 - smooth3(1.52, 2.02, t));
      drawDischarge3D(p, channels, { progress, stroke: pulse * Math.min(1, intensity), residual, palette, radius: 0.047, emission: 0.18 * intensity });
      const connection = smooth3(0.35, 0.61, t) * (1 - smooth3(0.66, 0.84, t));
      for (let i = 0; i < streamers.length; i++) drawDischarge3D(p, streamers[i], { progress: connection * (1.2 - i * 0.1), stroke: pulse * 0.55, residual: connection * 0.48, radius: 0.025, palette, emission: 0.07 * intensity });
      if (pulse > 0.025) {
        p.point(contact, 0.035 + pulse * 0.07, tone(1), 1, pulse * 0.3 * intensity);
        p.glow(contact, 0.25 + 0.2 * pulse, tone(0.8), pulse * 0.1 * intensity);
      }
      sparks.draw(p);
    }
  };
}

// src/3d/liquid.ts
var WATER_RAMP_3D = ["#102f4b", "#155674", "#217f9d", "#36adc2", "#74d2dc", "#caf3ef"];
var finite2 = (v, fallback) => Number.isFinite(v) ? v : fallback;
var vecFinite = (v) => v.length === 3 && v.every(Number.isFinite);
var rampOf = (ramp) => ramp?.length ? ramp : WATER_RAMP_3D;
var colorAt = (ramp, t) => ramp[Math.round(clamp3(t) * (ramp.length - 1))];
function advanceLiquidDrop3D(position, velocity, dt, gravity = 9.8, drag = 0) {
  if (!vecFinite(position) || !vecFinite(velocity) || ![dt, gravity, drag].every(Number.isFinite) || dt < 0 || gravity < 0 || drag < 0) throw new RangeError("Invalid liquid trajectory");
  if (drag === 0) return {
    position: [position[0] + velocity[0] * dt, position[1] + velocity[1] * dt - gravity * dt * dt / 2, position[2] + velocity[2] * dt],
    velocity: [velocity[0], velocity[1] - gravity * dt, velocity[2]]
  };
  const k = drag * dt, decay = Math.exp(-k), integral = -Math.expm1(-k) / drag;
  const accelerationIntegral = dt * dt * (k < 1e-4 ? 0.5 - k / 6 + k * k / 24 - k * k * k / 120 : (k + Math.expm1(-k)) / (k * k));
  return {
    position: [position[0] + velocity[0] * integral, position[1] + velocity[1] * integral - gravity * accelerationIntegral, position[2] + velocity[2] * integral],
    velocity: [velocity[0] * decay, velocity[1] * decay - gravity * integral, velocity[2] * decay]
  };
}
var LiquidDrops3D = class {
  drops = [];
  impacts = [];
  surface;
  capacity;
  constructor(surface = 0.035, capacity = 128) {
    this.surface = finite2(surface, 0.035);
    this.capacity = Math.floor(clamp3(finite2(capacity, 128), 1, 4096));
  }
  get size() {
    return this.drops.length;
  }
  clear() {
    this.drops.length = 0;
    this.impacts.length = 0;
  }
  spawn(drop) {
    if (!vecFinite(drop.position) || !vecFinite(drop.velocity) || !Number.isFinite(drop.radius) || drop.radius <= 0 || drop.position[1] < this.surface || this.drops.length >= this.capacity) return false;
    this.drops.push({
      ...drop,
      position: [...drop.position],
      velocity: [...drop.velocity],
      age: 0,
      radius: clamp3(drop.radius, 5e-3, 2),
      life: clamp3(finite2(drop.life ?? 5, 5), 1e-3, 30),
      gravity: clamp3(finite2(drop.gravity ?? 9.8, 9.8), 0, 100),
      drag: clamp3(finite2(drop.drag ?? 0.1, 0.1), 0, 30)
    });
    return true;
  }
  update(dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be finite and non-negative");
    if (dt === 0) return;
    const alive = [];
    for (const d of this.drops) {
      const step = Math.min(dt, d.life - d.age);
      const next = advanceLiquidDrop3D(d.position, d.velocity, step, d.gravity, d.drag);
      if (next.position[1] <= this.surface && next.velocity[1] <= 0) {
        let lo = 0, hi = step;
        for (let i = 0; i < 32; i++) {
          const mid = (lo + hi) / 2;
          if (advanceLiquidDrop3D(d.position, d.velocity, mid, d.gravity, d.drag).position[1] > this.surface) lo = mid;
          else hi = mid;
        }
        const contact = advanceLiquidDrop3D(d.position, d.velocity, hi, d.gravity, d.drag);
        this.impacts.push({ position: [contact.position[0], this.surface, contact.position[2]], velocity: contact.velocity, radius: d.radius, at: hi });
      } else if (d.age + dt < d.life) {
        d.position = next.position;
        d.velocity = next.velocity;
        d.age += dt;
        alive.push(d);
      }
    }
    this.drops = alive;
  }
  drainImpacts() {
    return this.impacts.splice(0, this.impacts.length);
  }
  draw(painter2, palette = WATER_RAMP_3D, opacity = 1) {
    for (const drop of this.drops) drawLiquidDrop3D(painter2, drop.position, drop.velocity, drop.radius, palette, opacity);
  }
};
function drawLiquidDrop3D(p, position, velocity, radius, palette, opacity = 1) {
  if (!vecFinite(position) || !vecFinite(velocity) || !Number.isFinite(radius) || radius <= 0 || !Number.isFinite(opacity) || opacity <= 0) return;
  const ramp = rampOf(palette), speed = len3(velocity), axis = speed > 0.01 ? norm3(velocity) : [0, 1, 0];
  const side = norm3(cross3(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const across = cross3(axis, side), stretch = 1 + Math.min(0.75, speed * 0.075), width2 = radius / Math.sqrt(stretch);
  const rings = 5, sectors = 8, vertices = [];
  for (let j = 0; j <= rings; j++) {
    const theta = j / rings * Math.PI, y = Math.cos(theta) * radius * stretch, r = Math.sin(theta) * width2;
    vertices.push(Array.from({ length: sectors }, (_, i) => {
      const a = i / sectors * TAU3;
      return [0, 1, 2].map((k) => position[k] + axis[k] * y + (side[k] * Math.cos(a) + across[k] * Math.sin(a)) * r);
    }));
  }
  const faces = [];
  const light = norm3([-0.5, 1, 0.5]);
  const add = (a, b, c) => {
    const center = [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3);
    const n = norm3([center[0] - position[0], center[1] - position[1], center[2] - position[2]]);
    const brightness = clamp3(0.42 + dot3(n, light) * 0.52);
    faces.push({ a, b, c, depth: p.project(center).depth, color: colorAt(ramp, brightness) });
  };
  for (let j = 0; j < rings; j++) for (let i = 0; i < sectors; i++) {
    const n = (i + 1) % sectors;
    if (j > 0) add(vertices[j][i], vertices[j + 1][i], vertices[j][n]);
    if (j < rings - 1) add(vertices[j][n], vertices[j + 1][i], vertices[j + 1][n]);
  }
  faces.sort((a, b) => a.depth - b.depth);
  for (const face of faces) p.triangle(face.a, face.b, face.c, face.color, opacity);
  if (radius * p.project(position).scale < 1) p.point(position, radius, colorAt(ramp, 0.7), opacity);
}
function sampleLiquidCrown3D(options) {
  const center = options.center ?? [0, 0.04, 0];
  if (!vecFinite(center) || !Number.isFinite(options.radius) || !Number.isFinite(options.height) || options.radius <= 0 || options.height <= 0) return [];
  const segments = Math.floor(clamp3(finite2(options.segments ?? 64, 64), 12, 192));
  const lobes = Math.floor(clamp3(finite2(options.lobes ?? 9, 9), 3, 20)), rng = new Rng3D(options.seed ?? 1), phase = rng.range(0, TAU3), phase2 = rng.range(0, TAU3);
  return Array.from({ length: segments }, (_, i) => {
    const a = i / segments * TAU3;
    const finger = (0.5 + 0.5 * Math.cos(a * lobes + phase)) ** 1.65;
    const height2 = options.height * (0.64 + 0.36 * finger) * (0.9 + 0.1 * Math.sin(a * 3 + phase2));
    const r = options.radius * (1 + 0.035 * Math.sin(a * 5 + phase2) + 0.055 * finger);
    return [center[0] + Math.cos(a) * r, center[1] + height2, center[2] + Math.sin(a) * r];
  });
}
function drawLiquidCrown3D(p, options) {
  const rim = sampleLiquidCrown3D(options), opacity = clamp3(finite2(options.opacity ?? 1, 1));
  if (!rim.length || opacity <= 0) return;
  const center = options.center ?? [0, 0.04, 0], ramp = rampOf(options.palette);
  const base = Math.max(0, finite2(options.baseRadius ?? options.radius * 0.58, options.radius * 0.58));
  const strips = 5, vertices = [];
  const breakup = clamp3(finite2(options.breakup ?? 0, 0)), phase = new Rng3D(options.seed ?? 1).range(0, TAU3);
  const torn = (i, level) => level > 1 - breakup * 0.72 && Math.sin(i / rim.length * TAU3 * 7 + phase) > 1 - breakup * 1.75;
  for (let j = 0; j <= strips; j++) {
    const u = j / strips;
    vertices.push(rim.map((tip, i) => {
      const a = i / rim.length * TAU3, r = base + (Math.hypot(tip[0] - center[0], tip[2] - center[2]) - base) * (u * u * 0.7 + u * 0.3);
      return [center[0] + Math.cos(a) * r, center[1] + (tip[1] - center[1]) * u, center[2] + Math.sin(a) * r];
    }));
  }
  const faces = [];
  for (let j = 0; j < strips; j++) for (let i = 0; i < rim.length; i++) {
    if (torn(i, (j + 0.5) / strips)) continue;
    const n = (i + 1) % rim.length, a = vertices[j][i], b = vertices[j][n], c = vertices[j + 1][i], d = vertices[j + 1][n];
    const angle = (i + 0.5) / rim.length * TAU3;
    const level = 0.22 + j / strips * 0.35 + Math.max(0, Math.cos(angle - 2.2)) * 0.22;
    for (const tri of [[a, b, c], [b, d, c]]) faces.push({ a: tri[0], b: tri[1], c: tri[2], color: colorAt(ramp, level), depth: (p.project(tri[0]).depth + p.project(tri[1]).depth + p.project(tri[2]).depth) / 3 });
  }
  faces.sort((a, b) => a.depth - b.depth);
  for (const f of faces) p.triangle(f.a, f.b, f.c, f.color, opacity);
  for (let i = 0; i < rim.length; i++) {
    if (torn(i, 1)) continue;
    const a = i / rim.length * TAU3, highlight = Math.max(0, Math.cos(a - 2.2));
    p.line(rim[i], rim[(i + 1) % rim.length], 0.028, colorAt(ramp, 0.52 + highlight * 0.42), opacity);
  }
}
function drawSurfaceRipple3D(p, options) {
  const { origin, age } = options;
  if (!vecFinite(origin) || !Number.isFinite(age) || age <= 0) return;
  const life = clamp3(finite2(options.life ?? 2.5, 2.5), 0.01, 30);
  if (age >= life) return;
  const strength = clamp3(finite2(options.strength ?? 1, 1), 0, 3), speed = clamp3(finite2(options.speed ?? 2.2, 2.2), 0, 20);
  const opacity = clamp3(finite2(options.opacity ?? 1, 1)) * clamp3(strength) * Math.exp(-age * 0.45) * (1 - smooth3(life * 0.4, life, age));
  const rise = smooth3(0, 0.07, age), damping = Math.exp(-age * 1.3) * strength * rise;
  if (!strength || !speed || opacity <= 0) return;
  const radius = speed * age, width2 = Math.min(radius * 0.6, clamp3(finite2(options.width ?? 0.2, 0.2), 0.01, 2) * (0.8 + age * 0.15));
  const count = Math.min(160, Math.max(32, Math.ceil(radius * 28))), ramp = rampOf(options.palette), phase = new Rng3D(options.seed ?? 1).range(0, TAU3);
  const ring = (i, r, y) => {
    const a = i / count * TAU3;
    return [origin[0] + Math.cos(a) * r, origin[1] + y, origin[2] + Math.sin(a) * r];
  };
  for (let i = 0; i < count; i++) {
    const a = i / count * TAU3, n = i + 1;
    const crest = 0.065 * damping * (0.86 + 0.14 * Math.sin(a * 5 + phase));
    const outer0 = ring(i, radius + width2, 0), outer1 = ring(n, radius + width2, 0), top0 = ring(i, radius, crest), top1 = ring(n, radius, crest), inner0 = ring(i, Math.max(0, radius - width2), 0), inner1 = ring(n, Math.max(0, radius - width2), 0);
    const lit = 0.24 + Math.max(0, Math.cos(a - 2.2)) * 0.28;
    p.triangle(inner0, top0, inner1, colorAt(ramp, 0.18), opacity);
    p.triangle(inner1, top0, top1, colorAt(ramp, 0.18), opacity);
    p.triangle(top0, outer0, top1, colorAt(ramp, lit), opacity);
    p.triangle(top1, outer0, outer1, colorAt(ramp, lit), opacity);
    if (Math.sin(a * 3 + phase) > 0.1 && damping > 0.05) p.line(top0, top1, 0.012, colorAt(ramp, 0.66), opacity * clamp3(damping));
  }
}

// src/3d/effects/crown-splash.ts
var crown_splash_exports = {};
__export(crown_splash_exports, {
  CROWN_SPLASH_IMPACT: () => CROWN_SPLASH_IMPACT,
  create: () => create9,
  meta: () => meta9
});
var CROWN_SPLASH_IMPACT = 0.5;
var meta9 = {
  id: "water/crown-splash-3d",
  name: "Crown Splash 3D",
  description: "A falling water drop opens a thin lobed crown, sheds rounded droplets, rebounds from the center and settles into overlapping surface ripples. Art-directed water, not a fluid solver.",
  duration: 3.8,
  loop: false,
  stages: [{ at: 0, label: "FALL" }, { at: 0.5, label: "IMPACT" }, { at: 0.66, label: "CROWN" }, { at: 0.84, label: "BREAKUP" }, { at: 1.1, label: "REBOUND" }, { at: 1.8, label: "RIPPLES" }, { at: 2.9, label: "SETTLE" }],
  cues: [{ at: CROWN_SPLASH_IMPACT, type: "hit", value: 0.6 }, { at: CROWN_SPLASH_IMPACT, type: "sound", value: 0.7 }],
  options: { seed: 24017, size: 1, force: 1, palette: [...WATER_RAMP_3D] }
};
function create9(options) {
  const size = clamp3(Number.isFinite(options.size) ? options.size : 1, 0.4, 1.5), force = clamp3(Number.isFinite(options.force) ? options.force : 1, 0.3, 1.45);
  const palette = options.palette.length ? options.palette : meta9.options.palette, rng = new Rng3D(options.seed);
  const drops = new LiquidDrops3D(0.04, 64), ripples = [];
  const lobes = 9, detach = 0.33;
  const crown = (age) => ({ center: [0, 0.04, 0], radius: size * (0.65 + 1.7 * smooth3(0, 0.75, age)), baseRadius: size * (0.52 + 1.15 * smooth3(0, 0.85, age)), height: size * force * 1.62 * smooth3(0, 0.2, age) * (1 - smooth3(0.3, 1, age)), lobes, seed: options.seed, palette, breakup: smooth3(0.4, 0.86, age) });
  let t = 0, impacted = false, detached = false, rebounded = false, secondaryWave = false;
  function detachDrops() {
    const edge = sampleLiquidCrown3D({ ...crown(detach), segments: 72 });
    const peaks = edge.map((v, i) => ({ v, i })).filter(({ v, i }) => v[1] >= edge[(i + 71) % 72][1] && v[1] >= edge[(i + 1) % 72][1]);
    for (const { v, i } of peaks) {
      const a = i / 72 * TAU3, speed = rng.range(0.8, 2.2) * size;
      drops.spawn({ position: v, velocity: [Math.cos(a) * speed, rng.range(1.3, 3.8) * force, Math.sin(a) * speed], radius: rng.range(0.075, 0.125) * size, gravity: 10.8, drag: 0.24 });
      if (rng.chance(0.7)) drops.spawn({ position: v, velocity: [Math.cos(a + 0.08) * speed * 1.13, rng.range(1.2, 2.1) * force, Math.sin(a + 0.08) * speed * 1.13], radius: rng.range(0.035, 0.06) * size, gravity: 10.8, drag: 0.36 });
    }
  }
  return {
    update(dt) {
      t += dt;
      drops.update(dt);
      for (const hit of drops.drainImpacts()) ripples.push({ origin: hit.position, born: t - dt + hit.at, strength: clamp3(hit.radius * 4, 0.15, 0.7), life: 0.5 + hit.radius * 2, speed: 1.1, seed: rng.int(0, 1e5) });
      if (!impacted && t + 1e-9 >= CROWN_SPLASH_IMPACT) {
        impacted = true;
        ripples.push({ origin: [0, 0.04, 0], born: CROWN_SPLASH_IMPACT, strength: 1.1, life: 2.9, speed: 1.8 * size, seed: options.seed });
      }
      if (!detached && t + 1e-9 >= CROWN_SPLASH_IMPACT + detach) {
        detached = true;
        detachDrops();
      }
      if (!secondaryWave && t + 1e-9 >= 1.03) {
        secondaryWave = true;
        ripples.push({ origin: [0, 0.042, 0], born: 1.03, strength: 0.65, life: 2.35, speed: 1.45 * size, seed: options.seed + 1 });
      }
      if (!rebounded && t + 1e-9 >= 1.22) {
        rebounded = true;
        drops.spawn({ position: [0, 1.2 * size, 0], velocity: [0.13, 3.2 * force, 0.08], radius: 0.17 * size, gravity: 10.8, drag: 0.08 });
      }
      for (let i = ripples.length - 1; i >= 0; i--) if (t - ripples[i].born >= ripples[i].life) ripples.splice(i, 1);
    },
    draw(p) {
      if (t <= 0 || t >= meta9.duration - 1e-8) return;
      const fade = 1 - smooth3(2.85, 3.7, t), age = t - CROWN_SPLASH_IMPACT;
      if (age >= 0) {
        const radius = size * (0.6 + 2.35 * smooth3(0, 1.35, age)), alpha = 0.34 * fade * (1 - smooth3(1.5, 3, age));
        const segments = 72;
        for (let i = 0; i < segments; i++) {
          const a = i / segments * TAU3, b = (i + 1) / segments * TAU3;
          p.triangle([0, 0.018, 0], [Math.cos(a) * radius, 0.018, Math.sin(a) * radius], [Math.cos(b) * radius, 0.018, Math.sin(b) * radius], palette[0], alpha);
        }
      }
      for (const ripple of ripples) drawSurfaceRipple3D(p, { origin: ripple.origin, age: t - ripple.born, strength: ripple.strength, speed: ripple.speed, life: ripple.life, palette, seed: ripple.seed, opacity: fade });
      if (t < CROWN_SPLASH_IMPACT) {
        const u = t / CROWN_SPLASH_IMPACT, y = size * (4.5 * (1 - u * u) + 0.17);
        drawLiquidDrop3D(p, [0, y, 0], [0, -4 - 9 * u, 0], 0.23 * size, palette, smooth3(0, 0.09, t));
      }
      if (age > 0 && age < 1) drawLiquidCrown3D(p, { ...crown(age), opacity: 0.84 * fade * (1 - smooth3(0.66, 1, age)) });
      const jetAge = t - 0.98, jet = smooth3(0, 0.2, jetAge) * (1 - smooth3(0.25, 0.58, jetAge));
      if (jet > 0) {
        const levels = 8, sides = 12, height2 = 1.28 * size * jet;
        const point = (i, j) => {
          const u = i / levels, a = j / sides * TAU3, r = size * (0.25 * (1 - u) ** 2 + 0.045) * jet;
          return [Math.cos(a) * r + 0.04 * u * u, height2 * u + 0.04, Math.sin(a) * r];
        };
        for (let i = 0; i < levels; i++) for (let j = 0; j < sides; j++) {
          const a = point(i, j), b = point(i, j + 1), c = point(i + 1, j), d = point(i + 1, j + 1);
          const shade = 0.3 + Math.max(0, Math.cos((j + 0.5) / sides * TAU3 - 2.2)) * 0.5;
          const color = palette[Math.round(shade * (palette.length - 1))];
          p.triangle(a, b, c, color, fade);
          p.triangle(b, d, c, color, fade);
        }
        drawLiquidDrop3D(p, [0.04, height2 + 0.04, 0], [0, 1, 0], 0.05 * size * jet, palette, fade);
      }
      drops.draw(p, palette, fade);
    }
  };
}

// src/3d/sweep.ts
function createSweep3D(sections, sides = 5, initialNormal = [1, 0, 0]) {
  if (!Number.isSafeInteger(sides) || sides < 3 || sides > 32) throw new RangeError("sweep sides must be an integer in 3..32");
  if (sections.length < 2) return { vertices: [], faces: [], frames: [] };
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (!s.position.every(Number.isFinite) || !Number.isFinite(s.width) || s.width < 0 || !Number.isFinite(s.thickness ?? s.width) || (s.thickness ?? s.width) < 0 || !Number.isFinite(s.twist ?? 0)) throw new RangeError("sweep sections must have finite positions and non-negative radii");
    if (i && Math.hypot(...sub3(s.position, sections[i - 1].position)) < 1e-8) throw new RangeError("sweep sections must not repeat adjacent positions");
  }
  if (!initialNormal.every(Number.isFinite)) throw new RangeError("initial sweep normal must be finite");
  const vertices = [], faces = [], frames = [];
  let previous = norm3(initialNormal);
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i], before = sections[Math.max(0, i - 1)].position, after = sections[Math.min(sections.length - 1, i + 1)].position;
    let tangent = norm3(sub3(after, before));
    if (Math.hypot(...tangent) < 0.5) tangent = norm3(sub3(s.position, before));
    let normal = sub3(previous, mul3(tangent, dot3(previous, tangent)));
    if (Math.hypot(...normal) < 1e-6) {
      const axis = Math.abs(tangent[0]) < 0.75 ? [1, 0, 0] : [0, 0, 1];
      normal = sub3(axis, mul3(tangent, dot3(axis, tangent)));
    }
    normal = norm3(normal);
    const binormal = norm3(cross3(tangent, normal));
    frames.push({ tangent, normal, binormal });
    previous = normal;
    for (let j = 0; j < sides; j++) {
      const a = j * Math.PI * 2 / sides + (s.twist ?? 0);
      vertices.push(add3(s.position, add3(mul3(normal, Math.cos(a) * s.width), mul3(binormal, Math.sin(a) * (s.thickness ?? s.width)))));
    }
    if (i) for (let j = 0; j < sides; j++) {
      const a = (i - 1) * sides + j, b = (i - 1) * sides + (j + 1) % sides, c = i * sides + j, d = i * sides + (j + 1) % sides;
      faces.push([a, b, c], [b, d, c]);
    }
  }
  for (let j = 1; j < sides - 1; j++) {
    faces.push([0, j + 1, j]);
    const last2 = (sections.length - 1) * sides;
    faces.push([last2, last2 + j, last2 + j + 1]);
  }
  return { vertices, faces, frames };
}
function drawSweep3D(p, mesh, palette, alpha = 1, emission = 0) {
  if (!palette.length || alpha <= 0) return;
  for (const [a, b, c] of mesh.faces) p.facet(mesh.vertices[a], mesh.vertices[b], mesh.vertices[c], palette, alpha, emission);
}

// src/3d/effects/void-rift.ts
var void_rift_exports = {};
__export(void_rift_exports, {
  VOID_RIFT_SEAL: () => VOID_RIFT_SEAL,
  VOID_RIFT_TEAR: () => VOID_RIFT_TEAR,
  create: () => create10,
  meta: () => meta10
});
var VOID_RIFT_TEAR = 0.62;
var VOID_RIFT_SEAL = 3.55;
var meta10 = {
  id: "shadow/void-rift-3d",
  name: "Void Rift 3D",
  duration: 5.2,
  loop: false,
  description: "A jagged vertical tear unfolds thick obsidian lips and hooked tendrils. Solid splinters accelerate into its dark throat before the opening stitches itself shut from both tips.",
  stages: [{ at: 0, label: "INCISION" }, { at: VOID_RIFT_TEAR, label: "UNFOLD" }, { at: 1.25, label: "DEVOUR" }, { at: VOID_RIFT_SEAL, label: "SUTURE" }, { at: 4.5, label: "SCAR" }],
  cues: [{ at: VOID_RIFT_TEAR, type: "sound", value: 0.8 }, { at: VOID_RIFT_TEAR, type: "shake", value: 0.18 }, { at: VOID_RIFT_SEAL, type: "hit", value: 1 }, { at: VOID_RIFT_SEAL, type: "shake", value: 0.28 }],
  options: { seed: 4967, size: 1, pull: 1, palette: ["#05050d", "#100d1d", "#211530", "#38234b", "#573566", "#815194", "#b57dcc", "#e8c1f1"] }
};
var DEFAULT_PALETTE2 = meta10.options.palette;
function create10(options) {
  const rng = new Rng3D(options.seed), size = clamp3(Number.isFinite(options.size) ? options.size : 1, 0.4, 1.5);
  const pull = clamp3(Number.isFinite(options.pull) ? options.pull : 1, 0.4, 1.7);
  const input = options.palette.length ? options.palette : DEFAULT_PALETTE2;
  const pal = Array.from({ length: 8 }, (_, i) => input[Math.round(i / 7 * (input.length - 1))]);
  const teeth = Array.from({ length: 34 }, () => rng.range(-0.22, 0.22));
  const motes = Array.from({ length: 42 }, (_, i) => ({
    start: 0.65 + i / 42 * 2.6 + rng.range(0, 0.12),
    life: rng.range(0.7, 1.4) / pull,
    a: rng.range(0, TAU3),
    radius: rng.range(2.8, 4.6),
    z: rng.range(-2.1, 2.1),
    target: rng.range(-1.3, 1.25),
    bend: rng.range(-0.7, 0.7),
    size: rng.range(0.09, 0.22),
    spin: rng.range(-5, 5)
  }));
  const hooks = Array.from({ length: 6 }, (_, i) => ({ side: i % 2 ? 1 : -1, v: 0.21 + Math.floor(i / 2) * 0.29 + rng.range(-0.035, 0.035), phase: rng.range(0, TAU3), length: rng.range(1.2, 2) }));
  for (const mote of motes) mote.life = Math.min(mote.life, 4.15 - mote.start);
  let t = 0;
  const world = (v) => [v[0] * size, v[1] * size, v[2] * size];
  function openness(v) {
    const unfurl = smooth3(VOID_RIFT_TEAR + Math.abs(v - 0.5) * 0.32, 1.16 + Math.abs(v - 0.5) * 0.32, t);
    const seal = smooth3(VOID_RIFT_SEAL + (0.5 - Math.abs(v - 0.5)) * 1.5, 4.1 + (0.5 - Math.abs(v - 0.5)) * 1.5, t);
    return unfurl * (1 - seal);
  }
  function lip(side, v) {
    const taper = Math.sin(v * Math.PI), o = openness(v), slot = Math.min(15, Math.floor(v * 16)), f = v * 16 - slot;
    const offset = side > 0 ? 17 : 0, n = lerp3(teeth[offset + slot], teeth[offset + slot + 1], f);
    const breathing = 1 + Math.sin(t * 2.4 + v * 5) * 0.035;
    const tear = [0, 0.16, 0.4, 0.64, 0.5, 0.78, 0.92, 0.72, 0.86, 1, 0.7, 0.79, 0.55, 0.28, 0.4, 0.1, 0];
    const profile2 = lerp3(tear[slot], tear[slot + 1], f);
    return world([
      0.28 * Math.sin(v * 7.6 + 0.5) + side * (0.02 + (1.48 * profile2 * breathing + n * taper) * o),
      0.22 + 5.3 * v,
      0.2 * Math.sin(v * 6.4 + t * 0.65) + side * 0.18 * Math.sin(v * 8 + t * 0.8) * taper * o
    ]);
  }
  function motePosition(m, u) {
    const inward = u ** 2.6, a = m.a + m.bend * u * u, r = m.radius * (1 - inward);
    return world([Math.cos(a) * r, 2.85 + Math.sin(a) * r * 0.66 + m.target * inward, m.z * (1 - inward) + Math.sin(u * Math.PI) * m.bend - 0.35 * inward]);
  }
  return {
    update(dt) {
      t += dt;
    },
    draw(p) {
      if (t <= 0 || t >= meta10.duration - 1e-8) return;
      const birth = smooth3(0, 0.28, t), fade = 1 - smooth3(4.6, 5.12, t);
      if (fade <= 0) return;
      if (t < 1.02 || t > 4.35) {
        const spread = t < 1.02 ? smooth3(0.03, 0.6, t) : 1 - smooth3(4.4, 5.05, t);
        for (let i = 0; i < 24; i++) {
          const v = i / 24, next = (i + 1) / 24;
          if (Math.abs(v - 0.5) > spread * 0.5) continue;
          p.line(lip(0, v), lip(0, next), 0.022 * size * fade, pal[t < 0.67 ? 6 : 4], birth * fade, 0.08 * fade);
        }
      }
      for (let i = 0; i < 32; i++) {
        const a = i / 32, b = (i + 1) / 32;
        if (openness((a + b) * 0.5) < 8e-3) continue;
        const l0 = lip(-1, a), l1 = lip(-1, b), r0 = lip(1, a), r1 = lip(1, b);
        const c0 = [(l0[0] + r0[0]) / 2, l0[1], (l0[2] + r0[2]) / 2 - 0.38 * size * openness(a)];
        const c1 = [(l1[0] + r1[0]) / 2, l1[1], (l1[2] + r1[2]) / 2 - 0.38 * size * openness(b)];
        p.triangle(l0, l1, c0, pal[0], fade);
        p.triangle(l1, c1, c0, pal[0], fade);
        p.triangle(c0, c1, r0, pal[0], fade);
        p.triangle(c1, r1, r0, pal[0], fade);
      }
      for (const side of [-1, 1]) {
        const sections = [];
        for (let i = 0; i <= 32; i++) {
          const v = i / 32, o = openness(v), taper = Math.sin(v * Math.PI);
          sections.push({
            position: lip(side, v),
            width: (0.012 + 0.39 * taper * o) * size * fade,
            thickness: (8e-3 + 0.3 * taper * o) * size * fade,
            twist: side * (0.3 + v * 2.8)
          });
        }
        drawSweep3D(p, createSweep3D(sections, 5), pal.slice(2, 7), fade);
        for (let i = 2; i < 30; i++) {
          const a = i / 32, b = (i + 1) / 32, o = openness(a);
          if (o < 0.02 || i % 8 === 0) continue;
          const shift = (v) => [v[0] - side * 0.11 * size, v[1], v[2] + 0.25 * size * o];
          p.line(shift(lip(side, a)), shift(lip(side, b)), 0.015 * size * o * fade, pal[i % 5 === 0 ? 6 : 5], fade, 0.04 * fade);
        }
      }
      for (const h of hooks) {
        const root = lip(h.side, h.v), o = openness(h.v), growth = smooth3(0.8, 1.65, t) * o;
        if (growth < 0.015) continue;
        const sections = [];
        for (let j = 0; j <= 14; j++) {
          const u = j / 14, sway = Math.sin(t * 2 - u * 4 + h.phase) * 0.13;
          const x = h.side * h.length * (Math.sin(u * Math.PI * 0.98) + sway * u) * growth;
          const y = (Math.sin(u * Math.PI) * 0.28 + (h.v - 0.5) * u * 1.6) * growth;
          const z = Math.sin(u * Math.PI * 1.3 + h.phase) * u * 0.85 * growth;
          sections.push({
            position: [root[0] + x * size, root[1] + y * size, root[2] + z * size],
            width: 0.27 * (1 - u) ** 0.85 * growth * size,
            thickness: 0.14 * (1 - u) * growth * size,
            twist: h.side * u * 3 + h.phase
          });
        }
        drawSweep3D(p, createSweep3D(sections, 4, [0, 1, 0]), pal.slice(2, 7), fade);
      }
      for (const m of motes) {
        const u = (t - m.start) / m.life;
        if (u <= 0 || u >= 1) continue;
        const pos = motePosition(m, u), visible = smooth3(0, 0.16, u) * (1 - smooth3(0.93, 1, u)) * fade;
        const r = m.size * size * visible, a = m.spin * u + m.a;
        if (u > 0.45) p.line(motePosition(m, Math.max(0, u - 0.055)), pos, 0.012 * size * visible, pal[4], visible, 0.015);
        const axis = [Math.cos(a) * r * 2.2, Math.sin(a) * r * 2.2, Math.cos(a * 0.6) * r];
        const tip = [pos[0] + axis[0], pos[1] + axis[1], pos[2] + axis[2]], tail = [pos[0] - axis[0], pos[1] - axis[1], pos[2] - axis[2]];
        const left = [pos[0] - Math.sin(a) * r, pos[1] + Math.cos(a) * r, pos[2]], front = [pos[0], pos[1], pos[2] + r];
        p.facet(tip, left, front, pal.slice(3, 7), visible);
        p.facet(tail, front, left, pal.slice(2, 6), visible);
      }
    }
  };
}

// src/3d/rock.ts
function createRockMesh3D(options = {}) {
  const radius = options.radius ?? 1;
  if (!Number.isFinite(radius) || radius <= 0) throw new RangeError("rock radius must be finite and positive");
  const roughness = clamp3(Number.isFinite(options.roughness) ? options.roughness : 0.2, 0, 0.45);
  const rng = new Rng3D(options.seed ?? 1), g = (1 + Math.sqrt(5)) / 2;
  let vertices = [[-1, g, 0], [1, g, 0], [-1, -g, 0], [1, -g, 0], [0, -1, g], [0, 1, g], [0, -1, -g], [0, 1, -g], [g, 0, -1], [g, 0, 1], [-g, 0, -1], [-g, 0, 1]].map(norm3);
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  if (options.detail !== 0) {
    const edges = /* @__PURE__ */ new Map();
    const midpoint = (a, b) => {
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      let i = edges.get(key);
      if (i === void 0) {
        i = vertices.length;
        vertices.push(norm3(add3(vertices[a], vertices[b])));
        edges.set(key, i);
      }
      return i;
    };
    faces = faces.flatMap(([a, b, c]) => {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
    });
  }
  vertices = vertices.map((v) => mul3([v[0] * 1.07, v[1] * 0.91, v[2]], radius * (1 + rng.range(-roughness, roughness))));
  return { vertices, faces };
}
function fractureRockMesh3D(mesh) {
  if (mesh.faces.length !== 80 || mesh.vertices.length !== 42 || mesh.vertices.some((v) => v.length !== 3 || !v.every(Number.isFinite)) || mesh.faces.some((f) => f.length !== 3 || new Set(f).size !== 3 || f.some((i) => !Number.isSafeInteger(i) || i < 0 || i >= 42))) throw new RangeError("fracture expects a detail-1 rock mesh");
  const origin = mul3(mesh.vertices.reduce((a, b) => add3(a, b), [0, 0, 0]), 1 / mesh.vertices.length), pieces = [];
  for (let start = 0; start < 80; start += 4) {
    const patch = mesh.faces.slice(start, start + 4), ids = [...new Set(patch.flat())], map = new Map(ids.map((id, i) => [id, i]));
    const world = [...ids.map((i) => mesh.vertices[i]), origin], core = world.length - 1, edges = /* @__PURE__ */ new Map();
    const faces = patch.map((f) => f.map((i) => map.get(i)));
    for (const [a, b, c] of faces) for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const key = [Math.min(u, v), Math.max(u, v)].join(":");
      const edge = edges.get(key);
      if (edge) edge.count++;
      else edges.set(key, { a: u, b: v, count: 1 });
    }
    if (ids.length !== 6 || edges.size !== 9 || [...edges.values()].filter((e) => e.count === 1).length !== 6 || [...edges.values()].some((e) => e.count > 2)) throw new RangeError("rock patches must use shared detail-1 topology");
    for (const e of edges.values()) if (e.count === 1) faces.push([e.b, e.a, core]);
    const center = mul3(world.reduce((a, b) => add3(a, b), [0, 0, 0]), 1 / world.length);
    pieces.push({ mesh: { vertices: world.map((v) => [v[0] - center[0], v[1] - center[1], v[2] - center[2]]), faces }, center, sourceFaces: [start, start + 1, start + 2, start + 3] });
  }
  return pieces;
}

// src/3d/effects/meteor-impact.ts
var meteor_impact_exports = {};
__export(meteor_impact_exports, {
  METEOR_IMPACT: () => METEOR_IMPACT,
  create: () => create11,
  meta: () => meta11,
  meteorEntryPosition3D: () => meteorEntryPosition3D
});

// src/3d/ground-motion.ts
function impactGroundHeight3D(radius, age, size = 1, strength = 1) {
  if (![radius, age, size, strength].every(Number.isFinite) || radius < 0 || size <= 0 || age <= 0 || age >= 1.25 || strength <= 0) return 0;
  const r = radius / size, front = 0.8 + 7.4 * age, q = (r - front) / 0.62;
  const crest = Math.exp(-q * q * 1.5), trough = Math.exp(-((q + 1.15) ** 2) * 2.2);
  const envelope = smooth3(0, 0.07, age) * (1 - smooth3(0.68, 1.25, age)) * smooth3(0.8, 1.65, r) * (1 - smooth3(4.3, 5, r));
  return (0.38 * crest - 0.045 * trough) * size * clamp3(strength, 0, 1.5) * envelope;
}
function createImpactTerrain3D(seed2 = 1, size = 1) {
  if (!Number.isFinite(size) || size <= 0) throw new RangeError("terrain size must be finite and positive");
  const rng = new Rng3D(seed2), vertices = [], faces = [], tones = [], marks = [];
  const n = 32, step = 11.4 / n;
  for (let z = 0; z <= n; z++) for (let x = 0; x <= n; x++) {
    const px = (x - n / 2) * step, pz = (z - n / 2) * step;
    vertices.push([(px + rng.range(-0.04, 0.04)) * size, 0.025 * size, (pz + rng.range(-0.04, 0.04)) * size]);
  }
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const a = z * (n + 1) + x, b = a + 1, c = a + n + 1, d = c + 1, at = vertices[a];
    if (Math.hypot(at[0], at[2]) > 5.65 * size) continue;
    const tone = rng.range(-0.028, 0.028);
    faces.push([a, c, b], [b, c, d]);
    tones.push(tone, tone * 0.7);
    if (x % 3 === 0 && z % 2 === 0 || z % 3 === 0 && x % 2 === 0) marks.push([a, x % 3 === 0 ? c : b]);
  }
  return { vertices, faces, tones, size, marks };
}
function drawImpactTerrain3D(p, terrain, age, palette, opacity = 1, strength = 1) {
  if (opacity <= 0 || !Number.isFinite(age) || palette.length === 0) return;
  const { size } = terrain, light = norm3([0.6, 1, -0.45]);
  const verts = terrain.vertices.map((v) => [v[0], v[1] + impactGroundHeight3D(Math.hypot(v[0], v[2]), age, size, strength), v[2]]);
  for (let i = 0; i < terrain.faces.length; i++) {
    const [a, b, c] = terrain.faces[i], v = verts[a], w = verts[b], u = verts[c];
    const radius = (Math.hypot(v[0], v[2]) + Math.hypot(w[0], w[2]) + Math.hypot(u[0], u[2])) / (3 * size);
    if (Math.max(Math.hypot(v[0], v[2]), Math.hypot(w[0], w[2]), Math.hypot(u[0], u[2])) > 5 * size) continue;
    if (age >= 0 && radius < 1.35) continue;
    const edge = 1 - smooth3(4.25, 4.95, radius), normal = norm3(cross3(sub3(w, v), sub3(u, v)));
    const shade = clamp3(0.25 + dot3(normal, light) * 0.46 + terrain.tones[i]);
    p.triangle(v, w, u, palette[Math.round(shade * (palette.length - 1))], edge * opacity);
  }
  for (const [a, b] of terrain.marks) {
    const v = verts[a], w = verts[b], r = Math.hypot(v[0], v[2]) / size;
    if (r < 1.7 || r > 4.8) continue;
    const up = (q) => [q[0], q[1] + 6e-3 * size, q[2]];
    p.line(up(v), up(w), 0.014 * size, palette[0], opacity * 0.35 * (1 - smooth3(4.2, 4.8, r)));
  }
}

// src/3d/camera-motion.ts
function impactCamera3D(base, age, strength = 1, seed2 = 0) {
  if (!Number.isFinite(age) || age < 0 || age >= 0.7 - 1e-9 || !Number.isFinite(strength) || strength <= 0) return base;
  const amplitude = clamp3(strength, 0, 2) * Math.exp(-5 * age) * (1 - age / 0.7) ** 2;
  const hash2 = Math.imul((seed2 | 0) ^ 73244475, 73244475) >>> 0;
  const direction = hash2 & 1 ? 1 : -1;
  const frequency = 42 + hash2 % 7;
  const kick = Math.cos(age * frequency) * amplitude;
  const side = direction * 0.12 * Math.cos(age * frequency * 1.17) * amplitude;
  const up = 0.26 * kick;
  const cy = Math.cos(base.yaw), sy = Math.sin(base.yaw);
  const ce = Math.cos(base.elevation), se = Math.sin(base.elevation);
  const target = base.target ?? [0, 0, 0];
  return {
    ...base,
    yaw: base.yaw + direction * 7e-3 * kick,
    elevation: clamp3(base.elevation + 9e-3 * kick, -Math.PI / 2 + 1e-3, Math.PI / 2 - 1e-3),
    zoom: clamp3(base.zoom, 1e-3, 100),
    // Screen-right/up basis avoids translation along the view axis, retaining
    // comparable motion in perspective and orthographic projections.
    target: [target[0] + cy * side - sy * se * up, target[1] + ce * up, target[2] - sy * side - cy * se * up]
  };
}

// src/3d/impact-ground.ts
function createImpactGround3D(seed2 = 1, size = 1) {
  if (!Number.isFinite(size) || size <= 0) throw new RangeError("ground size must be finite and positive");
  const rng = new Rng3D(seed2), n = 12, ring = [], inner = [], pieces = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU3, r = rng.range(1.45, 1.95) * size;
    ring.push([Math.cos(a) * r, rng.range(0.19, 0.48) * size, Math.sin(a) * r]);
    inner.push([Math.cos(a) * 0.52 * size, 0.15 * size, Math.sin(a) * 0.52 * size]);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, world = [inner[i], inner[j], ring[j], ring[i], ...[inner[i], inner[j], ring[j], ring[i]].map((v) => [v[0], 0.025, v[2]])];
    const center = mul3(world.reduce((a, b) => add3(a, b), [0, 0, 0]), 1 / 8), vertices = world.map((v) => sub3(v, center));
    const faces = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]];
    for (const f of faces) if (dot3(cross3(sub3(vertices[f[1]], vertices[f[0]]), sub3(vertices[f[2]], vertices[f[0]])), vertices[f[0]]) < 0) [f[1], f[2]] = [f[2], f[1]];
    pieces.push({ mesh: { vertices, faces }, center, angle: (i + 0.5) / n * TAU3, release: 0.055 + rng.range(0, 0.08), speed: rng.range(0.8, 1.25), spin: [rng.range(-2.5, 2.5), rng.range(-1.8, 1.8), rng.range(-2.5, 2.5)] });
  }
  return { pieces, rim: ring, floor: inner.map((v) => [v[0], 0.035, v[2]]), size };
}
function drawImpactCrater3D(p, ground, age, palette, heat, opacity = 1) {
  if (age < 0 || opacity <= 0 || palette.length === 0 || heat.length === 0) return;
  const reveal = smooth3(0.025, 0.18, age), hot = 1 - smooth3(0.18, 1.35, age), n = ground.rim.length;
  const wall = [palette[0], palette[0], palette[1] ?? palette[0], palette[2] ?? palette[0]];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = ground.floor[i], b = ground.floor[j];
    const edge = (k) => {
      const r = ground.rim[k];
      return [r[0], r[1] * (0.65 + reveal * 0.6), r[2]];
    };
    const c = edge(i), d = edge(j), outer = (v) => [v[0] * (1.13 + 0.12 * Math.sin(i * 2.7)), 0.04, v[2] * (1.13 + 0.12 * Math.sin(i * 2.7))];
    p.triangle([0, 0.035, 0], a, b, palette[0], opacity);
    p.facet(a, b, d, wall, opacity);
    p.facet(a, d, c, wall, opacity);
    p.facet(c, d, outer(d), palette, opacity);
    p.facet(c, outer(d), outer(c), palette, opacity);
    if (hot > 0) {
      const hi = heat[Math.min(heat.length - 1, 2)];
      p.line(add3(a, [0, 8e-3, 0]), add3(c, [0, 8e-3, 0]), 0.025 * ground.size, hi, opacity * hot, 0.07 * hot);
      if (i % 2 === 0) p.line(a, b, 0.034 * ground.size, heat[heat.length - 2] ?? hi, opacity * hot, 0.1 * hot);
    }
  }
}

// src/3d/effects/meteor-impact.ts
var METEOR_IMPACT = 1.65;
var meta11 = {
  id: "space/meteor-impact-3d",
  name: "Meteor Impact 3D",
  description: "A tumbling basalt meteor falls on a steep ballistic arc. An incandescent leading crust sheds fragments into a sheared plasma wake, then crushes into matching ground slabs. The original rock splits into closed fragments, soil and meteor ejecta tumble separately, a contact-centered terrain swell follows the air-pressure refraction, and volumetric dust rolls above a fractured crater. The camera jolts briefly and settles. Art-directed atmospheric entry, not a fluid simulation.",
  duration: 5.6,
  loop: false,
  stages: [{ at: 0, label: "ENTRY" }, { at: 0.38, label: "ABLATION" }, { at: 1.12, label: "BREAKUP" }, { at: METEOR_IMPACT, label: "IMPACT" }, { at: 1.72, label: "GROUND FAILURE" }, { at: 2.1, label: "HEAVY EJECTA" }, { at: 3.1, label: "COOLING" }, { at: 4.55, label: "SETTLE" }],
  cues: [{ at: 0.38, type: "sound", value: 0.3 }, { at: METEOR_IMPACT, type: "hit", value: 1 }, { at: METEOR_IMPACT, type: "flash", value: 0.85 }, { at: METEOR_IMPACT, type: "shake", value: 0.8 }, { at: METEOR_IMPACT, type: "sound", value: 1 }],
  options: { seed: 60217, size: 1, force: 1, palette: ["#572426", "#a23824", "#df5925", "#ff913c", "#ffc765", "#fff0b5"] }
};
var STONE = ["#1c1c28", "#302834", "#493a40", "#65504c", "#856354", "#a67c5c"];
var ASH = ["#26252d", "#3c3539", "#554840", "#716052", "#92806a", "#b39c7f"];
var TERRAIN = ["#121b27", "#1a222c", "#252c35", "#353a42", "#494b50", "#606066"];
var SOIL2 = ["#1d2027", "#303039", "#48434a", "#635750", "#85715f", "#a28c70"];
function meteorEntryPosition3D(time, size = 1) {
  if (!Number.isFinite(time)) throw new RangeError("entry time must be finite");
  const u = clamp3(time / METEOR_IMPACT), s = clamp3(Number.isFinite(size) ? size : 1, 0.45, 1.4);
  return [5.4 * (u - 1), 0.78 * s + 6.1 * (1 - u) + 1.25 * u * (1 - u), -0.85 * (1 - u)];
}
function entryDirection(t) {
  return norm3(sub3(meteorEntryPosition3D(Math.min(METEOR_IMPACT, t + 5e-3)), meteorEntryPosition3D(Math.max(0, t - 5e-3))));
}
function create11(options) {
  const size = clamp3(Number.isFinite(options.size) ? options.size : 1, 0.45, 1.4), force = clamp3(Number.isFinite(options.force) ? options.force : 1, 0.25, 1.5);
  const source = options.palette.length ? options.palette : meta11.options.palette;
  const heat = Array.from({ length: 6 }, (_, i) => source[Math.round(i / 5 * (source.length - 1))]);
  const rng = new Rng3D(options.seed), body = createRockMesh3D({ seed: options.seed, radius: 0.94 * size, roughness: 0.17 });
  const rotationAt = (time) => [0.16 + time * 0.37, time * 0.52, -time * 0.29];
  const support = 0.025 - Math.min(...body.vertices.map((v) => transformFragment3D(v, [0, 0, 0], rotationAt(METEOR_IMPACT))[1]));
  const entryAt = (time) => add3(meteorEntryPosition3D(time, size), [0, support - 0.78 * size, 0]);
  const rubble = new Fragments3D(0.025, 96), sparks = new Particles3D(0.03, 320);
  const rockMeshes = Array.from({ length: 10 }, (_, i) => createRockMesh3D({ seed: options.seed + i * 731, radius: rng.range(0.11, 0.27) * size, detail: 0, roughness: 0.3 }));
  const detach = Array.from({ length: 23 }, (_, i) => ({ born: 0.3 + i * 0.055, side: rng.range(-1, 1), phase: rng.range(0, TAU3), speed: rng.range(0.6, 1.5) }));
  const impactRng = new Rng3D(options.seed ^ 5352305), ground = createImpactGround3D(options.seed ^ 10009, size);
  const terrain = createImpactTerrain3D(options.seed ^ 8519, size);
  const slabs = new Fragments3D(0.025, 24), meteorChunks = new Fragments3D(0.025, 24);
  const fractures = ground.rim.map((v) => ({ angle: Math.atan2(v[2], v[0]), length: impactRng.range(3.2, 4.45), bend: impactRng.range(-0.27, 0.27), split: impactRng.range(0.35, 0.65) }));
  const impactChunks = fractureRockMesh3D(body).map((q) => {
    const rotation = rotationAt(METEOR_IMPACT), world = q.mesh.vertices.map((v) => transformFragment3D(add3(v, q.center), [0, 0, 0], rotation));
    const compressed = world.map((v) => [v[0] * 1.1, v[1] * 0.45 + 0.5 * size, v[2] * 1.1]);
    const center = mul3(compressed.reduce((a, b) => add3(a, b), [0, 0, 0]), 1 / compressed.length);
    return { mesh: { vertices: compressed.map((v) => sub3(v, center)), faces: q.mesh.faces }, center, angle: Math.atan2(center[2], center[0]), speed: impactRng.range(2.1, 4.1) };
  });
  const dustBounds = { min: [-5.1 * size, 0, -5.1 * size], max: [5.1 * size, 4.1 * size, 5.1 * size] };
  const dustGrid = new VolumeGrid3D(dustBounds, 0.28 * size), dustRamp = ASH.map(color3D);
  const [dustNX, dustNY, dustNZ] = dustGrid.dimensions;
  const dustColumns = Array.from({ length: dustNX * dustNZ }, (_, i) => {
    const x = dustBounds.min[0] + i % dustNX / ((dustNX - 1) / (dustBounds.max[0] - dustBounds.min[0]));
    const z = dustBounds.min[2] + Math.floor(i / dustNX) / ((dustNZ - 1) / (dustBounds.max[2] - dustBounds.min[2]));
    const angle = Math.atan2(z, x);
    return { x, z, r: Math.hypot(x, z), lobe: 1 + 0.08 * Math.cos(angle) + 0.11 * Math.sin(angle * 3 + options.seed * 0.17) + 0.035 * Math.sin(angle * 9), height: 0.85 + 0.25 * Math.sin(angle * 4) };
  });
  const dustTrails = [];
  let t = 0, hit = false, nextChip = 0, slabReleased = ground.pieces.map(() => false), chunkReleased = false, trailTick = 0, cachedDust = -1;
  function impact() {
    for (let i = 0; i < 24; i++) {
      const a = impactRng.range(0, TAU3), speed = impactRng.range(2.5, 5.5) * force, r = impactRng.range(0.7, 1.4) * size;
      rubble.spawn({ mesh: rockMeshes[i % rockMeshes.length], position: [Math.cos(a) * r, 0.18, Math.sin(a) * r], velocity: [Math.cos(a) * speed, impactRng.range(2.8, 5.4) * force, Math.sin(a) * speed], rotation: [a, 0, a], angularVelocity: [impactRng.range(-6, 6), impactRng.range(-6, 6), impactRng.range(-6, 6)], palette: SOIL2, life: 3.3, gravity: 13, drag: 0.95, bounce: 0.16, friction: 0.7, meltStart: 0.78 });
    }
    for (let i = 0; i < 58; i++) {
      const a = impactRng.range(0, TAU3), speed = impactRng.range(2, 6) * force;
      sparks.spawn({ position: [0, 0.24, 0], velocity: [Math.cos(a) * speed + 1, impactRng.range(1.2, 5.5) * force, Math.sin(a) * speed * 0.8], life: impactRng.range(0.28, 0.7), radius: impactRng.range(0.016, 0.035), color: heat[4], ramp: [heat[5], heat[3], heat[1]], gravity: 11, drag: 1.2, bounce: 0.1, emission: 0.09, style: "spark" });
    }
  }
  function wake(p) {
    const end = Math.min(t, METEOR_IMPACT), cool = 1 - smooth3(METEOR_IMPACT, METEOR_IMPACT + 0.43, t);
    if (cool <= 0) return;
    const d = entryDirection(end), side = norm3(cross3(d, [0, 0, 1])), side2 = norm3(cross3(d, side));
    const rings = 14, sides = 9;
    const mantle = (i, j) => {
      const u = i / rings, when = Math.max(0, end - 0.12 - u * 0.62), a = j / sides * TAU3;
      const radius = 0.69 * size * Math.pow(1 - u, 0.72) * (1 + 0.26 * Math.sin(i * 1.3 - j * 2 + t * 10));
      return add3(entryAt(when), add3(mul3(side, Math.cos(a) * radius), mul3(side2, Math.sin(a) * radius)));
    };
    for (let i = 0; i < rings; i++) for (let j = 0; j < sides; j++) {
      const u = i / rings;
      if (end - 0.12 - u * 0.62 <= 0) continue;
      const a = mantle(i, j), b = mantle(i, j + 1), c = mantle(i + 1, j), d2 = mantle(i + 1, j + 1);
      const color = heat[Math.max(0, Math.min(2, Math.floor((1 - u) * 2.6) - ((j + i) % 4 === 0 ? 1 : 0)))];
      const opacity = cool * smooth3(0.08, 0.35, t) * (0.85 - 0.25 * u);
      p.triangle(a, b, c, color, opacity, 0.025 * cool);
      p.triangle(b, d2, c, color, opacity, 0.025 * cool);
    }
    for (let strand = 0; strand < 7; strand++) {
      const a = strand / 7 * TAU3, phase = strand * 2.31, life = 0.64 + 0.07 * (strand % 3), segments = 16;
      let previous;
      for (let j = 0; j <= segments; j++) {
        const u = j / segments, age = 0.055 + u * life, when = end - age;
        if (when <= 0) break;
        const center = entryAt(when), swirl = 0.77 * size * Math.pow(1 - u, 0.65) + Math.sin(u * 9 - t * 7 + phase) * 0.14 * u;
        const offset = add3(mul3(side, Math.cos(a + u * 0.65) * swirl), mul3(side2, Math.sin(a + u * 0.65) * swirl));
        const pos = add3(center, offset), strength = (1 - u) * cool * smooth3(0.06, 0.3, t);
        if (previous && strength > 0.015) p.line(previous, pos, (0.08 + 0.13 * (1 - u)) * size * strength, heat[Math.min(4, Math.floor((1 - u) * 4))], 1, 0.1 * strength);
        previous = pos;
      }
    }
  }
  function groundImpact(p, age, fade) {
    const spread = smooth3(0.015, 0.29, age), heatFade = 1 - smooth3(0.22, 1.45, age);
    for (const q of fractures) {
      const length = q.length * size * spread, angle = q.angle;
      const at = (r, a) => [Math.cos(a) * r, 0.044 + impactGroundHeight3D(r, age, size, force), Math.sin(a) * r];
      const nodes = [at(0.72 * size, angle), at(length * q.split, angle + q.bend), at(length * 0.78, angle - q.bend * 0.5), at(length, angle + q.bend * 0.4)];
      if (length < 0.8 * size) continue;
      for (let i = 1; i < nodes.length; i++) {
        const width2 = (0.1 - i * 0.02) * size;
        p.line(nodes[i - 1], nodes[i], width2, STONE[0], fade);
        if (heatFade > 0) p.line(add3(nodes[i - 1], [0, 3e-3, 0]), add3(nodes[i], [0, 3e-3, 0]), width2 * 0.35, heat[i === 1 ? 2 : 1], fade, 0.09 * heatFade);
      }
      const joint = nodes[1], branch = add3(joint, [Math.cos(angle + 0.8) * length * 0.24, 0, Math.sin(angle + 0.8) * length * 0.24]);
      p.line(joint, branch, 0.035 * size, STONE[0], fade);
    }
  }
  function impactDust(p, age) {
    const densityFade = smooth3(0.06, 0.24, age) * (1 - smooth3(1, 2.6, age));
    if (densityFade <= 1e-3) return;
    const radius = (0.85 + 3.15 * (1 - Math.exp(-age * 2.6))) * size;
    const roll = (0.34 + 0.62 * smooth3(0.05, 0.72, age)) * size;
    const plume = smooth3(0.08, 0.28, age) * (1 - smooth3(0.65, 1.55, age));
    if (cachedDust !== t) {
      const cell = 0.65 * size, trailCells = /* @__PURE__ */ new Map();
      const key = (x, y, z) => ((z + 32) * 64 + y + 8) * 64 + x + 32;
      for (const q of dustTrails) {
        const dt = age - q.born;
        if (dt >= 0.65) continue;
        const radius2 = q.radius + dt * 0.28 * size, rise = dt * 0.15, entry = { position: q.position, radius: radius2, density: (1 - dt / 0.65) * 0.55, rise };
        for (let z = Math.floor((q.position[2] - radius2) / cell); z <= Math.floor((q.position[2] + radius2) / cell); z++)
          for (let y = Math.floor((q.position[1] + rise - radius2) / cell); y <= Math.floor((q.position[1] + rise + radius2) / cell); y++)
            for (let x = Math.floor((q.position[0] - radius2) / cell); x <= Math.floor((q.position[0] + radius2) / cell); x++) {
              const k = key(x, y, z), bucket = trailCells.get(k);
              if (bucket) bucket.push(entry);
              else trailCells.set(k, [entry]);
            }
      }
      const ph = Math.min(3.5, 0.8 + age * 4.2) * size, pr = (0.68 + age * 0.65) * size;
      const radial = dustColumns.map((q) => ({ rr: (q.r - radius * q.lobe) / (roll * 1.3), height: roll * q.height, column: 1 - ((q.x - age * 0.38 * size) ** 2 + q.z * q.z) / (pr * pr) }));
      let sampleIndex = 0;
      dustGrid.refill((x, y, z) => {
        const i = sampleIndex++, q = radial[Math.floor(i / (dustNX * dustNY)) * dustNX + i % dustNX];
        if (y < 0.03) return;
        const yy = (y - roll * 0.7) / q.height;
        let body2 = Math.max(0, 1 - q.rr * q.rr - yy * yy) * densityFade * 1.9;
        const column = q.column - (y - ph * 0.58) ** 2 / (ph * ph * 0.5);
        if (column > 0) body2 += column * plume * 1.05;
        const nearby = trailCells.get(key(Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell)));
        if (nearby) for (const q2 of nearby) {
          const dx = (x - q2.position[0]) / q2.radius, dy = (y - q2.position[1] - q2.rise) / q2.radius, dz = (z - q2.position[2]) / q2.radius;
          const qd = 1 - dx * dx - dy * dy - dz * dz;
          if (qd > 0) body2 += qd * q2.density;
        }
        if (body2 < 0.01) return;
        const noise2 = volumeNoise3D(x * 2.9 / size, y * 3.1 / size - age * 2.3, z * 2.9 / size, options.seed + 301);
        const shaped = Math.max(0, body2 * (0.65 + noise2 * 0.8) - 0.16);
        if (shaped < 0.015) return;
        const shade = clamp3(0.3 + y / (1.8 * size) * 0.28 + (noise2 - 0.5) * 0.42 - x / (7 * size));
        return { density: shaped / size, color: dustRamp[Math.round(shade * 5)] };
      });
      cachedDust = t;
    }
    const reach = Math.min(5.1 * size, radius + roll * 1.7), top = Math.max(1.4 * size, Math.min(4.1 * size, (0.9 + age * 2.7) * size));
    drawVolume3D(p, { min: [-reach, 0, -reach], max: [reach, top, reach] }, dustGrid.sample, { step: 0.16 * size, maxSteps: 72, palette: dustRamp, alphaCutoff: 0.12 });
  }
  return {
    camera(base) {
      return impactCamera3D(base, t - METEOR_IMPACT, force * 1.35, options.seed);
    },
    update(dt) {
      t += dt;
      rubble.update(dt);
      sparks.update(dt);
      slabs.update(dt);
      meteorChunks.update(dt);
      while (nextChip < detach.length && t + 1e-9 >= detach[nextChip].born) {
        const q = detach[nextChip++], pos = entryAt(q.born), d = entryDirection(q.born);
        const tangent = [Math.cos(q.phase) * 0.58 * size, q.side * 0.36 * size, Math.sin(q.phase) * 0.58 * size];
        rubble.spawn({ mesh: rockMeshes[nextChip % rockMeshes.length], position: add3(pos, tangent), velocity: [d[0] * 2 + q.side * 0.6, d[1] * 2 + 0.4, Math.sin(q.phase) * q.speed], angularVelocity: [q.speed * 3, -q.speed * 2, q.side * 4], palette: [STONE[1], heat[0], heat[1], heat[2]], life: 0.65, gravity: 3.3, drag: 1.1, bounce: 0, meltStart: 0.3 });
        sparks.spawn({ position: add3(pos, tangent), velocity: [d[0] * 0.8 + q.side, d[1] * 0.8, Math.sin(q.phase) * 1.4], life: 0.48, radius: 0.035 * size, color: heat[4], ramp: [heat[4], heat[2], heat[0]], gravity: 2, drag: 0.5, emission: 0.12, style: "spark" });
      }
      if (!hit && t + 1e-9 >= METEOR_IMPACT) {
        hit = true;
        impact();
      }
      const age = t - METEOR_IMPACT;
      if (age >= 0) {
        ground.pieces.forEach((piece, i) => {
          if (slabReleased[i] || age + 1e-9 < piece.release) return;
          slabReleased[i] = true;
          const a = piece.angle, speed = 3 * piece.speed * force;
          slabs.spawn({ mesh: piece.mesh, position: piece.center, velocity: [Math.cos(a) * speed + 0.55, 7.1 * piece.speed * force, Math.sin(a) * speed], angularVelocity: piece.spin, palette: SOIL2, life: 3.65 - piece.release, gravity: 12.8, drag: 0.55, bounce: 0.12, friction: 0.78, meltStart: 0.82 });
        });
        if (!chunkReleased && age + 1e-9 >= 0.065) {
          chunkReleased = true;
          for (const q of impactChunks) meteorChunks.spawn({ mesh: q.mesh, position: q.center, velocity: [Math.cos(q.angle) * q.speed * force + 1, 7.5 * force, Math.sin(q.angle) * q.speed * force], angularVelocity: [q.speed * 0.6, 1.2, -q.speed * 0.5], palette: [STONE[0], STONE[1], heat[0], heat[1], STONE[4]], life: 2.5, gravity: 14, drag: 0.7, bounce: 0.16, friction: 0.75, meltStart: 0.75 });
        }
        if (age < 0.7 && ++trailTick % 8 === 0) for (const f of slabs.list) dustTrails.push({ position: [...f.position], born: age, radius: 0.14 * size });
        for (let i = dustTrails.length - 1; i >= 0; i--) if (age - dustTrails[i].born >= 0.65) dustTrails.splice(i, 1);
      }
    },
    draw(p) {
      if (t <= 0 || t >= meta11.duration - 1e-8) return;
      const age = t - METEOR_IMPACT, fade = 1 - smooth3(4.35, 5.45, t);
      drawImpactTerrain3D(p, terrain, age, TERRAIN, smooth3(0, 0.22, t) * fade, force);
      if (age >= 0) {
        groundImpact(p, age, fade);
        drawImpactCrater3D(p, ground, age, SOIL2, heat, fade);
        ground.pieces.forEach((piece, i) => {
          if (!slabReleased[i]) drawFragment3D(p, piece.mesh, piece.center, [0, 0, 0], SOIL2);
        });
      }
      wake(p);
      if (!hit) {
        const center = entryAt(t), rotation = rotationAt(t), d = entryDirection(t), hot = smooth3(0.1, 0.55, t);
        const vertices = body.vertices.map((v) => transformFragment3D(v, center, rotation));
        for (const [i, j, k] of body.faces) {
          const a = vertices[i], b = vertices[j], c = vertices[k], at = mul3(add3(add3(a, b), c), 1 / 3), facing = dot3(norm3(sub3(at, center)), d);
          const heated = facing > 0.3 && (i + j + k) % 4 !== 0;
          p.facet(a, b, c, heated ? [heat[0], heat[1], heat[2], heat[3]] : STONE, 1, heated ? 0.05 * hot : 0);
          if (facing > 0.05 && (i + j + k) % 5 === 0) p.line(a, b, 0.019 * size, heat[3], hot, 0.08 * hot);
        }
        for (let s = 0; s < 9; s++) {
          const axis = norm3(cross3(d, [0, 0, 1])), other = norm3(cross3(d, axis)), a = s / 9 * TAU3, b = (s + 0.78) / 9 * TAU3;
          const shell = (angle) => add3(add3(center, mul3(d, 0.68 * size)), add3(mul3(axis, Math.cos(angle) * 0.48 * size), mul3(other, Math.sin(angle) * 0.48 * size)));
          p.line(shell(a), shell(b), 0.027 * size, heat[4], hot, 0.12 * hot);
        }
        p.glow(add3(center, mul3(d, 0.5 * size)), 1.05 * size, heat[2], 0.055 * hot);
      }
      if (age >= 0) {
        const crush = 1 - smooth3(0.025, 0.095, age);
        if (crush > 0) {
          const mesh = { vertices: body.vertices.map((v) => [v[0] * (1 + age * 4), v[1] * Math.max(0.15, 1 - age * 12), v[2] * (1 + age * 4)]), faces: body.faces };
          drawFragment3D(p, mesh, [0, 0.3 * size, 0], rotationAt(METEOR_IMPACT), [STONE[0], heat[0], heat[1], heat[3]], crush);
        }
        const eruption = smooth3(0, 0.025, age) * (1 - smooth3(0.1, 0.29, age));
        if (eruption > 0) for (let i = 0; i < 7; i++) {
          const a = i / 7 * TAU3, r = (0.35 + age * 3.7) * size, pos = [Math.cos(a) * r, 0.15 + age * (2 + i % 3) * size, Math.sin(a) * r];
          const mesh = rockMeshes[i], vertices = mesh.vertices.map((v) => add3(pos, mul3(v, 3.2 * eruption)));
          for (const [a2, b, c] of mesh.faces) p.facet(vertices[a2], vertices[b], vertices[c], [heat[1], heat[2], heat[3], heat[4]], 1, 0.06 * eruption);
        }
        const flash = 1 - smooth3(0.016, 0.105, age);
        if (flash > 0) {
          p.glow([0, 0.35, 0], 2.1 * size, heat[3], 0.48 * flash);
          p.point([0, 0.25, 0], 0.63 * size * flash, heat[5], 1, 0.17 * flash);
        }
      }
      slabs.draw(p);
      meteorChunks.draw(p);
      rubble.draw(p);
      sparks.draw(p);
      if (age >= 0) impactDust(p, age);
      if (age > 0 && age < 0.55) p.pressureWarp([0, 0.25 * size, 0], (0.35 + 11.4 * age) * size, 0.55 * size, 0.24 * size * smooth3(0, 0.035, age) * (1 - smooth3(0.12, 0.55, age)), { tint: "#a5b8c6", opacity: 0.17 * smooth3(0.015, 0.07, age) * (1 - smooth3(0.18, 0.5, age)) });
    }
  };
}

// src/3d/beam.ts
var LASER_PALETTE_3D = ["#260d25", "#571333", "#a9234e", "#ed3b64", "#ff7790", "#ffc2bd", "#fff7e8"];
var DEFAULT_BEAM_TIMING_3D = { charge: 0.04, fire: 0.56, arrive: 0.625, release: 1.9, clear: 2.03, end: 3.1 };
function createBeamFrame3D(start, end) {
  if (![...start, ...end].every(Number.isFinite)) throw new RangeError("Beam endpoints must be finite");
  const delta = sub3(end, start), length = len3(delta);
  if (length < 1e-8) return null;
  const axis = mul3(delta, 1 / length);
  const u = norm3(cross3(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1]));
  return { start: [...start], end: [...end], axis, u, v: cross3(axis, u), length };
}
function beamPoint3D(frame2, fraction, u = 0, v = 0) {
  return add3(add3(mul3(frame2.start, 1 - fraction), mul3(frame2.end, fraction)), add3(mul3(frame2.u, u), mul3(frame2.v, v)));
}
function beamEnvelope3D(time, timing = DEFAULT_BEAM_TIMING_3D) {
  const values = [timing.charge, timing.fire, timing.arrive, timing.release, timing.clear, timing.end];
  if (!values.every((v, i) => Number.isFinite(v) && v >= 0 && (i === 0 || v > values[i - 1]))) throw new RangeError("Beam timings must be finite and strictly increasing");
  const empty = { charge: 0, head: 0, tail: 0, power: 0, impact: 0, cooling: 0 };
  if (!Number.isFinite(time) || time <= timing.charge || time >= timing.end) return empty;
  const head = clamp3((time - timing.fire) / (timing.arrive - timing.fire));
  const tail = clamp3((time - timing.release) / (timing.clear - timing.release));
  const connected = smooth3(timing.arrive - 0.012, timing.arrive + 0.02, time);
  return {
    charge: smooth3(timing.charge, timing.fire, time) * (1 - smooth3(timing.fire, timing.arrive + 0.12, time)),
    head,
    tail,
    power: head > tail ? smooth3(timing.fire, timing.fire + 0.025, time) * (1 - smooth3(timing.release, timing.clear, time) * 0.2) : 0,
    impact: connected * (1 - smooth3(timing.release, timing.clear + 0.14, time)),
    cooling: smooth3(timing.release - 0.15, timing.clear, time) * (1 - smooth3(timing.clear, timing.end, time))
  };
}
function drawCoherentBeam3D(p, frame2, options = {}) {
  const finite4 = (value, fallback) => value !== void 0 && Number.isFinite(value) ? value : fallback;
  const head = clamp3(finite4(options.head, 1)), tail = clamp3(finite4(options.tail, 0));
  const radius = clamp3(finite4(options.radius, 0.075), 0, 0.6), power = clamp3(finite4(options.power, 1), 0, 2);
  const emission = clamp3(finite4(options.emission, 0.32), 0, 4);
  if (head <= tail || radius <= 0 || power <= 0) return;
  const palette = options.palette?.length ? options.palette : LASER_PALETTE_3D;
  const tone = (fraction) => palette[Math.round(fraction * (palette.length - 1))];
  const a = beamPoint3D(frame2, tail), b = beamPoint3D(frame2, head), alpha = Math.min(1, power);
  p.line(a, b, radius * 3.1, tone(0.46), alpha * 0.18, emission * power * 0.28);
  p.line(a, b, radius * 1.8, tone(0.66), alpha * 0.88, emission * power * 0.6);
  p.line(a, b, radius, tone(1), alpha, emission * power);
}

// src/3d/effects/coherent-laser.ts
var coherent_laser_exports = {};
__export(coherent_laser_exports, {
  LASER_TIMING_3D: () => LASER_TIMING_3D,
  create: () => create12,
  meta: () => meta12
});

// src/3d/laser-impact.ts
var LASER_METAL_HEAT_3D = ["#28151d", "#652723", "#b94525", "#f58436", "#ffd078", "#fff3d0"];
var METAL = ["#101720", "#1d2833", "#2c3a47", "#425261", "#6e8291"];
function laserContactState3D(time, timing = DEFAULT_BEAM_TIMING_3D) {
  beamEnvelope3D(0, timing);
  if (!Number.isFinite(time) || time < 0 || time >= timing.end) return { age: 0, flash: 0, heat: 0, bore: 0, pressure: 0, visible: 0 };
  const age = time - timing.arrive, visible = smooth3(0.025, 0.18, time) * (1 - smooth3(timing.end - 0.24, timing.end, time));
  if (age < 0) return { age, flash: 0, heat: 0, bore: 0, pressure: 0, visible };
  const flash = Math.exp(-age * 20) * (1 - smooth3(0.08, 0.18, age));
  const fed = 1 - smooth3(timing.clear, timing.clear + 0.09, time);
  const heat = smooth3(0, 0.055, age) * (1 - smooth3(timing.clear + 0.03, timing.end - 0.08, time));
  return { age, flash, heat, bore: smooth3(0.015, 0.85, age), pressure: (flash + 0.26 * smooth3(0.01, 0.09, age)) * fed, visible };
}
function createLaserMetalContact3D(beam, options = {}) {
  const bounded = (v2, fallback, lo, hi) => clamp3(v2 !== void 0 && Number.isFinite(v2) ? v2 : fallback, lo, hi);
  const scale = bounded(options.scale, 1, 0.45, 1.35), intensity = bounded(options.intensity, 1, 0, 2);
  const timing = options.timing ?? DEFAULT_BEAM_TIMING_3D, palette = options.palette?.length ? options.palette : LASER_METAL_HEAT_3D;
  const heatTone = (u2) => palette[Math.round(clamp3(u2) * (palette.length - 1))];
  const normal = norm3(add3(mul3(beam.axis, -0.32), add3(mul3(beam.u, 0.92), mul3(beam.v, -0.22))));
  const u = norm3(cross3(normal, Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1])), v = cross3(u, normal);
  const point = (x, y, depth = 0) => add3(beam.end, add3(add3(mul3(u, x * scale), mul3(v, y * scale)), mul3(normal, depth * scale)));
  const rng = new Rng3D((options.seed ?? 2419) ^ 7449410);
  const rim = Array.from({ length: 24 }, (_, i) => ({ a: i / 24 * TAU3, rough: rng.range(0.9, 1.12), outer: Math.min(1.14, 0.93 / Math.max(Math.abs(Math.cos(i / 24 * TAU3)), Math.abs(Math.sin(i / 24 * TAU3)))) }));
  const spray = Array.from({ length: 108 }, (_, i) => ({
    born: timing.arrive + (i < 26 ? rng.range(0, 0.035) : (i - 26) / 82 * (timing.clear - timing.arrive - 0.06)),
    life: rng.range(i < 26 ? 0.24 : 0.25, i < 26 ? 0.43 : 0.48),
    angle: rng.range(0, TAU3),
    speed: rng.range(i < 26 ? 3 : 1.6, i < 26 ? 4.8 : 3.5),
    outward: rng.range(0.9, i < 26 ? 2.8 : 2.3),
    radius: rng.range(0.018, 0.036),
    droplet: i % 9 === 0
  }));
  const puffs = Array.from({ length: 22 }, (_, i) => ({ born: timing.arrive + 0.08 + i * 0.067, life: rng.range(0.43, 0.76), phase: rng.range(0, TAU3), drift: rng.range(0.3, 0.65) }));
  function particlePosition(q, age) {
    const travel = (1 - Math.exp(-age * 2.7)) / 2.7;
    const pos = point(Math.cos(q.angle) * q.speed * travel, Math.sin(q.angle) * q.speed * travel, q.outward * travel);
    return [pos[0], Math.max(0.035, pos[1] - 3.8 * age * age), pos[2]];
  }
  function surface(p, time) {
    const s = laserContactState3D(time, timing);
    if (s.visible <= 0 || intensity <= 0) return;
    const hole = 0.025 + 0.25 * s.bore;
    const last2 = rim.length;
    if (options.targetVisible !== false) {
      for (let i = 0; i < last2; i++) {
        const a = rim[i], b = rim[(i + 1) % last2];
        const A = point(Math.cos(a.a) * a.outer, Math.sin(a.a) * a.outer * 1.12);
        const B = point(Math.cos(b.a) * b.outer, Math.sin(b.a) * b.outer * 1.12);
        const innerA = point(Math.cos(a.a) * hole, Math.sin(a.a) * hole, -0.08 * s.bore);
        const innerB = point(Math.cos(b.a) * hole, Math.sin(b.a) * hole, -0.08 * s.bore);
        const color = METAL[i < 8 ? 2 : i < 15 ? 1 : 2];
        p.triangle(innerA, A, B, color, s.visible);
        p.triangle(innerA, B, innerB, color, s.visible);
        const backA = point(Math.cos(a.a) * a.outer * 1.04, Math.sin(a.a) * a.outer * 1.12 * 1.04, -0.12);
        const backB = point(Math.cos(b.a) * b.outer * 1.04, Math.sin(b.a) * b.outer * 1.12 * 1.04, -0.12);
        p.triangle(A, backA, backB, METAL[i < 12 ? 0 : 3], s.visible);
        p.triangle(A, backB, B, METAL[i < 12 ? 0 : 3], s.visible);
        p.line(A, B, 0.014 * scale, METAL[i < 12 ? 3 : 2], s.visible * 0.7);
        p.triangle(point(0, 0, -0.19), innerA, innerB, METAL[0], s.visible);
      }
      for (const [x, y] of [[-0.55, 0.58], [0.55, 0.58], [-0.55, -0.58], [0.55, -0.58]]) {
        p.point(point(x, y, 9e-3), 0.038 * scale, METAL[3], s.visible);
        p.point(point(x - 9e-3, y + 9e-3, 0.013), 0.015 * scale, METAL[4], s.visible * 0.6);
      }
    }
    if (s.age < 0) return;
    for (let i = 0; i < last2; i++) {
      const a = rim[i], b = rim[(i + 1) % last2], warm = 0.13 * s.heat;
      const radiusA = hole + (warm + 0.035) * a.rough, radiusB = hole + (warm + 0.035) * b.rough;
      const A = point(Math.cos(a.a) * radiusA, Math.sin(a.a) * radiusA, 0.022);
      const B = point(Math.cos(b.a) * radiusB, Math.sin(b.a) * radiusB, 0.022);
      const I = point(Math.cos(a.a) * hole, Math.sin(a.a) * hole, -0.075 * s.bore);
      const J = point(Math.cos(b.a) * hole, Math.sin(b.a) * hole, -0.075 * s.bore);
      const hot = 0.08 + s.heat * (0.75 + 0.09 * Math.sin(a.a + time * 4));
      const color = heatTone(hot);
      p.triangle(I, A, B, color, s.visible, 0.22 * s.heat * intensity);
      p.triangle(I, B, J, color, s.visible, 0.22 * s.heat * intensity);
      p.line(I, J, 0.022 * scale, heatTone(0.08 + s.heat * 0.92), s.visible, 0.18 * s.heat * intensity);
    }
    for (let i = 0; i < 2; i++) {
      const drip = smooth3(0.24 + i * 0.17, 1.15 + i * 0.1, s.age);
      if (drip <= 0) continue;
      const x = i ? 0.15 : -0.1, y = -hole * 0.8, end = y - (i ? 0.35 : 0.55) * drip;
      p.line(point(x, y, 0.027), point(x + 0.018, end, 0.027), (0.022 + i * 5e-3) * scale, heatTone(0.2 + 0.45 * s.heat), s.visible, 0.1 * s.heat * intensity);
      p.point(point(x + 0.018, end, 0.031), 0.035 * scale, heatTone(0.3 + 0.42 * s.heat), s.visible, 0.08 * s.heat * intensity);
    }
    for (const puff of puffs) {
      const age = time - puff.born, q = age / puff.life;
      if (q <= 0 || q >= 1) continue;
      const at = point(Math.sin(puff.phase + age * 3) * age * 0.2, age * puff.drift + 0.12, age * 0.65);
      p.point(at, (0.08 + q * 0.19) * scale, q < 0.25 ? heatTone(0.18) : METAL[2], Math.sin(q * Math.PI) * 0.14 * s.visible);
    }
  }
  function contact(p, time) {
    const s = laserContactState3D(time, timing);
    if (s.age < 0 || s.visible <= 0 || intensity <= 0) return;
    if (s.pressure > 2e-3) {
      for (let i = 0; i < 6; i++) {
        const angle = i / 6 * TAU3 + 0.18, reach = 0.14 + 0.68 * s.flash;
        const foot = point(Math.cos(angle) * 0.08, Math.sin(angle) * 0.08, 0.045);
        const tip = point(Math.cos(angle) * reach, Math.sin(angle) * reach, 0.1 + 0.36 * s.flash);
        const side = point(Math.cos(angle + 0.38) * reach * 0.43, Math.sin(angle + 0.38) * reach * 0.43, 0.12);
        p.triangle(foot, side, tip, heatTone(0.72), Math.min(1, s.pressure), 0.18 * intensity);
        p.line(foot, tip, 0.022 * scale, heatTone(1), Math.min(1, s.pressure * 0.9), 0.28 * intensity);
      }
      p.point(point(0, 0, 0.035), (0.12 + s.flash * 0.17) * scale, heatTone(1), Math.min(1, s.pressure * 2.6), 0.45 * intensity);
      p.glow(point(0, 0, 0.02), (0.65 + s.flash * 0.25) * scale, heatTone(0.72), Math.min(0.65, (0.14 + s.flash * 0.25) * intensity));
    } else if (s.heat > 1e-3) p.glow(point(0, 0, 0.02), 0.65 * scale, heatTone(0.45), s.heat * 0.09 * intensity);
    for (const q of spray) {
      const age = time - q.born, progress = age / q.life;
      if (progress <= 0 || progress >= 1) continue;
      const alpha = smooth3(0, 0.012, age) * (1 - smooth3(0.3, 1, progress)) * s.visible;
      const tail = particlePosition(q, Math.max(0, age - (q.droplet ? 0.035 : 0.052))), at = particlePosition(q, age);
      p.line(tail, at, q.radius * scale, heatTone(progress < 0.22 ? 0.9 : 0.6), alpha, 0.08 * intensity);
      p.point(at, q.radius * scale * (q.droplet ? 1.7 : 1), heatTone(progress < 0.2 ? 1 : progress < 0.6 ? 0.7 : 0.35), alpha, 0.12 * intensity);
    }
  }
  return { surface, contact, point, normal, state: (time) => laserContactState3D(time, timing) };
}

// src/3d/effects/coherent-laser.ts
var LASER_TIMING_3D = DEFAULT_BEAM_TIMING_3D;
var meta12 = {
  id: "scifi/coherent-laser-3d",
  name: "Coherent Laser 3D",
  description: "A rose-white optical lance focuses through three shrinking collars, snaps toward its target, then holds a perfectly straight white core. The first contact kicks a compact metal-pressure flare; a growing molten lip, dark bore, continuous hot-metal spray and gravity-fed slag make the sustained hit visible. The target cools after the trailing edge arrives.",
  duration: LASER_TIMING_3D.end,
  loop: false,
  options: { seed: 2419, length: 9, width: 0.065, intensity: 1, palette: [...LASER_PALETTE_3D], impactPalette: [...LASER_METAL_HEAT_3D], targetVisible: true, impactScale: 1 },
  stages: [{ at: 0, label: "FOCUS" }, { at: 0.56, label: "IGNITE" }, { at: 0.625, label: "COHERENT HOLD" }, { at: 1.9, label: "SHUTOFF" }, { at: 2.03, label: "COOL" }],
  cues: [{ at: 0.56, type: "sound", value: 0.8 }, { at: 0.625, type: "hit", value: 0.85 }, { at: 0.625, type: "flash", value: 0.55 }, { at: 0.625, type: "shake", value: 0.3 }]
};
function create12(options) {
  const bounded = (value, fallback, lo, hi) => clamp3(Number.isFinite(value) ? value : fallback, lo, hi);
  const length = bounded(options.length, 9, 2, 10), width2 = bounded(options.width, 0.065, 0.025, 0.16);
  const intensity = bounded(options.intensity, 1, 0, 2), palette = options.palette.length ? options.palette : meta12.options.palette;
  const tone = (fraction) => palette[Math.round(fraction * (palette.length - 1))];
  const beam = createBeamFrame3D([-length / 2, 1.8, 0], [length / 2, 1.8, 0]);
  const rng = new Rng3D(options.seed);
  const impact = createLaserMetalContact3D(beam, { seed: options.seed, scale: options.impactScale, intensity, palette: options.impactPalette, targetVisible: options.targetVisible, timing: LASER_TIMING_3D });
  const gather = Array.from({ length: 17 }, (_, i) => ({ angle: i * TAU3 / 17 + rng.range(-0.1, 0.1), radius: rng.range(0.6, 1), offset: rng.range(0.02, 0.21), life: rng.range(0.24, 0.34), axial: rng.range(-0.035, 0.07) }));
  let t = 0;
  function collar(p, fraction, radius, alpha, color, rotation = 0, keep = 1) {
    const segments = 36;
    for (let i = 0; i < segments; i++) {
      const a = rotation + i / segments * TAU3, b = rotation + (i + 1) / segments * TAU3;
      if (keep < 1 && i / segments > keep) continue;
      p.line(beamPoint3D(beam, fraction, Math.cos(a) * radius, Math.sin(a) * radius), beamPoint3D(beam, fraction, Math.cos(b) * radius, Math.sin(b) * radius), 0.018, color, alpha, 0);
    }
  }
  return {
    update(dt) {
      t += dt;
    },
    draw(p) {
      if (t <= 0 || t >= meta12.duration - 1e-8 || intensity <= 0) return;
      impact.surface(p, t);
      const e = beamEnvelope3D(t), ignition = Math.exp(-Math.max(0, t - LASER_TIMING_3D.arrive) * 34) * (t >= LASER_TIMING_3D.arrive ? 1 : 0);
      const charging = Math.max(e.charge, e.power * 0.5), shut = 1 - smooth3(1.86, 2.06, t);
      if (charging > 1e-3) {
        for (let i = 0; i < 3; i++) {
          const radius = (0.55 - i * 0.12) * (1 - e.charge * 0.54) + e.power * 0.055;
          collar(p, -0.017 + i * 0.042, radius, (0.25 + i * 0.2) * charging * shut, tone(i === 2 ? 0.85 : 0.66), t * (i % 2 ? -1 : 1) * 0.7, t < 0.3 ? smooth3(0.04, 0.3, t) : 1);
        }
        p.point(beam.start, 0.04 + e.charge * 0.08, tone(1), Math.min(1, charging * 1.7), 0.2 * intensity);
        p.glow(beam.start, 0.54 + charging * 0.2, tone(0.66), charging * 0.18 * intensity);
      }
      for (const mote of gather) {
        const q = (t - mote.offset) / mote.life;
        if (q <= 0 || q >= 1) continue;
        const radius = mote.radius * (1 - q) ** 1.7, a = mote.angle + q * 0.3, alpha = Math.sin(q * Math.PI);
        const at = beamPoint3D(beam, mote.axial * (1 - q), Math.cos(a) * radius, Math.sin(a) * radius);
        const tail = beamPoint3D(beam, mote.axial * (1 - q + 0.1), Math.cos(a) * (radius + 0.12), Math.sin(a) * (radius + 0.12));
        p.line(tail, at, 0.013, tone(0.66), alpha * 0.65, 0.02 * intensity);
        p.point(at, 0.018, tone(0.85), alpha, 0.04 * intensity);
      }
      if (e.power > 0) {
        const power = e.power * (0.96 + Math.sin(t * 21) * 0.025 + ignition * 0.08);
        drawCoherentBeam3D(p, beam, { head: e.head, tail: e.tail, radius: width2 * (1 + ignition * 0.75), power, palette, emission: 0.36 * intensity });
        for (let i = 0; i < 3; i++) {
          const u = ((t - LASER_TIMING_3D.fire) * 2.3 + i / 3) % 1;
          if (u <= e.tail || u >= e.head) continue;
          p.line(beamPoint3D(beam, Math.max(e.tail, u - 0.045)), beamPoint3D(beam, u), width2 * 1.14, tone(1), 0.9, 0.32 * intensity);
        }
        if (e.head < 1) p.point(beamPoint3D(beam, e.head), width2 * 1.8, tone(1), 1, 0.3 * intensity);
      }
      impact.contact(p, t);
    }
  };
}

// src/3d/shield.ts
var SHIELD_PALETTE_3D = ["#081a35", "#103553", "#145b78", "#188ba2", "#3bcbd3", "#9cebe4", "#edffec"];
var finite3 = (v) => v.every(Number.isFinite);
function createShieldSurface3D(apex, normal, radius = 4, aperture = 2.8) {
  if (!finite3(apex) || !finite3(normal) || len3(normal) < 1e-8 || !Number.isFinite(radius) || !Number.isFinite(aperture) || radius <= 0 || aperture <= 0 || aperture >= radius) throw new RangeError("Shield cap needs finite vectors and 0 < aperture < radius");
  const n = norm3(normal), u = norm3(cross3(Math.abs(n[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0], n)), v = cross3(n, u);
  return { apex: [...apex], center: sub3(apex, mul3(n, radius)), normal: n, u, v, radius, aperture, capCos: Math.sqrt(1 - (aperture / radius) ** 2) };
}
function shieldNormal3D(surface, u, v) {
  const d2 = u * u + v * v;
  if (!Number.isFinite(d2) || d2 > surface.aperture ** 2 + 1e-8) return null;
  return norm3(add3(add3(mul3(surface.u, u), mul3(surface.v, v)), mul3(surface.normal, Math.sqrt(Math.max(0, surface.radius ** 2 - d2)))));
}
function shieldPoint3D(surface, normal, displacement = 0) {
  return add3(surface.center, mul3(normal, surface.radius + displacement));
}
function shieldDistance3D(surface, a, b) {
  return Math.acos(clamp3(dot3(norm3(a), norm3(b)), -1, 1)) * surface.radius;
}
function shieldResponse3D(surface, normal, hit, time, speed = 4.8) {
  const distance = shieldDistance3D(surface, normal, hit.normal), age = time - hit.at;
  if (age < 0 || !Number.isFinite(age) || !Number.isFinite(speed) || speed <= 0) return { distance, age, crest: 0, contact: 0, displacement: 0 };
  const strength = clamp3(Number.isFinite(hit.strength ?? 1) ? hit.strength ?? 1 : 1, 0, 3), front = age * speed;
  const width2 = 0.13 + age * 0.05, delta = distance - front;
  const crest = (Math.abs(delta) <= width2 * 3 ? Math.exp(-((delta / width2) ** 2)) : 0) * Math.exp(-age * 1.75) * smooth3(0, 0.035, age) * strength;
  const contact = Math.exp(-((distance / 0.55) ** 2) - age * 13) * strength;
  const displacement = -0.2 * contact + 0.1 * crest - 0.035 * Math.exp(-(((delta + 0.22) / 0.22) ** 2) - age * 2.2) * strength;
  return { distance, age, crest, contact, displacement };
}
function shieldRipple3D(surface, hitNormal, distance, segments = 96) {
  if (!Number.isFinite(distance) || distance < 0 || !Number.isInteger(segments) || segments < 8 || segments > 1024) throw new RangeError("Ripple needs non-negative distance and 8..1024 integer segments");
  if (!finite3(hitNormal) || len3(hitNormal) < 1e-8) throw new RangeError("Ripple normal must be finite and nonzero");
  if (distance > Math.PI * surface.radius) return Array(segments + 1).fill(null);
  const n = norm3(hitNormal), u = norm3(cross3(Math.abs(n[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0], n)), v = cross3(n, u), angle = distance / surface.radius;
  return Array.from({ length: segments + 1 }, (_, i) => {
    const a = i / segments * TAU3;
    const q = add3(mul3(n, Math.cos(angle)), mul3(add3(mul3(u, Math.cos(a)), mul3(v, Math.sin(a))), Math.sin(angle)));
    return dot3(q, surface.normal) >= surface.capCos - 1e-8 ? q : null;
  });
}
var RINGS = 16;
var SIDES = 96;
var VERTICES = 1 + RINGS * SIDES;
var FACE_LIGHT = norm3([-0.5, 0.8, 0.5]);
var LIP_LIGHT = norm3([-0.4, 0.6, 0.7]);
var meshCoordinates = [[0, 0], ...Array.from({ length: RINGS * SIDES }, (_, i) => {
  const angle = i % SIDES / SIDES * TAU3, r = (Math.floor(i / SIDES) + 1) / RINGS;
  return [Math.cos(angle) * r, Math.sin(angle) * r];
})];
var meshIndices = (() => {
  const indices = [];
  for (let ring = 0; ring < RINGS; ring++) for (let i = 0; i < SIDES; i++) {
    const k = (i + 1) % SIDES, a = ring ? 1 + (ring - 1) * SIDES + i : 0;
    const b = 1 + ring * SIDES + i, c = 1 + ring * SIDES + k;
    indices.push(a, b, c);
    if (ring) indices.push(a, c, 1 + (ring - 1) * SIDES + k);
  }
  return new Uint16Array(indices);
})();
var FACES = meshIndices.length / 3;
var arenas = /* @__PURE__ */ new WeakMap();
var emptyProjection = () => ({ x: 0, y: 0, depth: 0, scale: 0 });
function createArena(surface, cellSize) {
  const normals = Array.from({ length: VERTICES + FACES }, () => [0, 0, 0]);
  const radiusSquared = Array(normals.length).fill(0), nodes = /* @__PURE__ */ new Map(), edgeMap = /* @__PURE__ */ new Map(), edgeVertices = /* @__PURE__ */ new Set();
  const fixedNode = (x, y) => {
    const n = shieldNormal3D(surface, x, y);
    if (!n) return -1;
    const key = n.map((v) => Math.round(v * 1e7)).join(",");
    const known = nodes.get(key);
    if (known !== void 0) return known;
    const index = normals.length;
    normals.push([n[0], n[1], n[2]]);
    radiusSquared.push(x * x + y * y);
    nodes.set(key, index);
    return index;
  };
  const extent = Math.ceil(surface.aperture / cellSize) + 1;
  for (let row = -extent; row <= extent; row++) for (let col = -extent; col <= extent; col++) {
    const x = Math.sqrt(3) * cellSize * (col + (row & 1) * 0.5), y = 1.5 * cellSize * row, center = fixedNode(x, y);
    if (center < 0) continue;
    for (let k = 0; k < 6; k++) {
      const aa = (k / 6 + 1 / 12) * TAU3, bb = ((k + 1) / 6 + 1 / 12) * TAU3;
      const a = fixedNode(x + Math.cos(aa) * cellSize, y + Math.sin(aa) * cellSize), b = fixedNode(x + Math.cos(bb) * cellSize, y + Math.sin(bb) * cellSize);
      if (a < 0 || b < 0) continue;
      const key = a < b ? `${a}/${b}` : `${b}/${a}`, prior = edgeMap.get(key);
      if (prior) prior.cells.push(center);
      else edgeMap.set(key, { a, b, cells: [center] });
      edgeVertices.add(a);
      edgeVertices.add(b);
    }
  }
  return {
    cellSize,
    aperture: -1,
    normals,
    radiusSquared,
    edges: [...edgeMap.values()],
    edgeVertices: [...edgeVertices],
    points: normals.map(() => [0, 0, 0]),
    projected: normals.map(emptyProjection),
    lipPoints: Array.from({ length: SIDES }, () => [0, 0, 0]),
    lipProjected: Array.from({ length: SIDES }, emptyProjection),
    responses: new Float64Array(normals.length * 3),
    distances: new Float64Array(0),
    impactSnapshot: [],
    faceDepth: new Float64Array(FACES),
    order: Array.from({ length: FACES }, (_, i) => i)
  };
}
function prepareArena(arena, surface, aperture, impacts, time) {
  let changed = arena.aperture !== aperture;
  if (changed) {
    arena.aperture = aperture;
    for (let i = 0; i < VERTICES; i++) {
      const [u, v] = meshCoordinates[i], x = u * aperture, y = v * aperture;
      const z = Math.sqrt(Math.max(0, surface.radius ** 2 - x * x - y * y)), n = arena.normals[i];
      for (let ch2 = 0; ch2 < 3; ch2++) n[ch2] = surface.u[ch2] * x + surface.v[ch2] * y + surface.normal[ch2] * z;
      const length2 = Math.hypot(n[0], n[1], n[2]);
      for (let ch2 = 0; ch2 < 3; ch2++) n[ch2] /= length2;
    }
    for (let face = 0; face < FACES; face++) {
      const a = arena.normals[meshIndices[face * 3]], b = arena.normals[meshIndices[face * 3 + 1]], c = arena.normals[meshIndices[face * 3 + 2]], n = arena.normals[VERTICES + face];
      for (let ch2 = 0; ch2 < 3; ch2++) n[ch2] = a[ch2] + b[ch2] + c[ch2];
      const length2 = Math.hypot(n[0], n[1], n[2]);
      for (let ch2 = 0; ch2 < 3; ch2++) n[ch2] /= length2;
    }
  }
  const count = impacts.length;
  if (arena.impactSnapshot.length !== count * 5) {
    arena.impactSnapshot.length = count * 5;
    changed = true;
  }
  for (let i = 0; i < count; i++) {
    const hit = impacts[i], values = [hit.at, hit.strength ?? 1, ...hit.normal];
    for (let k = 0; k < 5; k++) if (!Object.is(arena.impactSnapshot[i * 5 + k], values[k])) {
      arena.impactSnapshot[i * 5 + k] = values[k];
      changed = true;
    }
  }
  const length = arena.normals.length * count;
  if (arena.distances.length !== length) arena.distances = new Float64Array(length);
  if (changed && count) {
    const hitNormals = impacts.map((hit) => norm3(hit.normal));
    for (let n = 0; n < arena.normals.length; n++) for (let i = 0; i < count; i++)
      arena.distances[n * count + i] = Math.acos(clamp3(dot3(arena.normals[n], hitNormals[i]), -1, 1)) * surface.radius;
  }
  arena.responses.fill(0);
  for (let i = 0; i < count; i++) {
    const hit = impacts[i], age = time - hit.at;
    if (age < 0 || !Number.isFinite(age)) continue;
    const strength = clamp3(Number.isFinite(hit.strength ?? 1) ? hit.strength ?? 1 : 1, 0, 3), front = age * 4.8, width2 = 0.13 + age * 0.05;
    const crestDecay = Math.exp(-age * 1.75) * smooth3(0, 0.035, age) * strength;
    const contactDecay = Math.exp(-age * 13) * strength, tailDecay = Math.exp(-age * 2.2) * strength;
    for (let n = 0; n < arena.normals.length; n++) {
      const d = arena.distances[n * count + i], delta = d - front;
      const crest = (Math.abs(delta) <= width2 * 3 ? Math.exp(-((delta / width2) ** 2)) : 0) * crestDecay;
      const contact = Math.exp(-((d / 0.55) ** 2)) * contactDecay, o = n * 3;
      arena.responses[o] += crest;
      arena.responses[o + 1] += contact;
      arena.responses[o + 2] += -0.2 * contact + 0.1 * crest - 0.035 * Math.exp(-(((delta + 0.22) / 0.22) ** 2)) * tailDecay;
    }
  }
}
function drawShieldSurface3D(p, surface, options) {
  const visibility = clamp3(options.visibility), aperture = clamp3(options.aperture ?? surface.aperture, 0, surface.aperture);
  if (!visibility || !aperture) return;
  const size = clamp3(options.cellSize ?? 0.39, 0.22, 0.8);
  let arena = arenas.get(surface);
  if (!arena || arena.cellSize !== size) {
    arena = createArena(surface, size);
    arenas.set(surface, arena);
  }
  prepareArena(arena, surface, aperture, options.impacts ?? [], options.time);
  const palette = options.palette?.length ? options.palette : SHIELD_PALETTE_3D, tone = (q) => palette[Math.round(clamp3(q) * (palette.length - 1))];
  const emission = clamp3(Number.isFinite(options.emission ?? 0.2) ? options.emission ?? 0.2 : 0.2, 0, 4);
  const { normals, responses, points, projected, faceDepth, order } = arena;
  const position = (node, offset, out) => {
    const n = normals[node], radius = surface.radius + responses[node * 3 + 2] + offset;
    out[0] = surface.center[0] + n[0] * radius;
    out[1] = surface.center[1] + n[1] * radius;
    out[2] = surface.center[2] + n[2] * radius;
  };
  for (let i = 0; i < VERTICES; i++) {
    position(i, 0, points[i]);
    projected[i] = p.project(points[i], projected[i]);
  }
  for (let i = 0; i < FACES; i++) faceDepth[i] = (projected[meshIndices[i * 3]].depth + projected[meshIndices[i * 3 + 1]].depth + projected[meshIndices[i * 3 + 2]].depth) / 3;
  order.sort((a, b) => faceDepth[a] - faceDepth[b] || a - b);
  const capCos = Math.sqrt(1 - (aperture / surface.radius) ** 2);
  for (const face of order) {
    const node = VERTICES + face, n = normals[node], crest = responses[node * 3], contact = responses[node * 3 + 1];
    const edge = smooth3(0.82, capCos, dot3(n, surface.normal)), lit = clamp3(dot3(n, FACE_LIGHT));
    const color = tone(0.12 + lit * 0.12 + edge * 0.04 + Math.min(0.34, crest * 0.12 + contact * 0.3));
    const a = meshIndices[face * 3], b = meshIndices[face * 3 + 1], c = meshIndices[face * 3 + 2], alpha = (0.48 + edge * 0.14 + crest * 0.18) * visibility;
    if (p.triangleProjected) p.triangleProjected(projected[a], projected[b], projected[c], color, alpha, contact * emission * 0.06);
    else p.triangle(points[a], points[b], points[c], color, alpha, contact * emission * 0.06);
  }
  const r2 = aperture * aperture + 1e-8;
  for (const i of arena.edgeVertices) if (arena.radiusSquared[i] <= r2) {
    position(i, 0.018, points[i]);
    projected[i] = p.project(points[i], projected[i]);
  }
  for (const edge of arena.edges) {
    if (arena.radiusSquared[edge.a] > r2 || arena.radiusSquared[edge.b] > r2) continue;
    let active = -1;
    for (const cell of edge.cells) if (arena.radiusSquared[cell] <= r2) active = Math.max(active, Math.min(1, responses[cell * 3] * 2 + responses[cell * 3 + 1] * 1.4));
    if (active < 0) continue;
    const color = tone(0.28 + active * 0.45), alpha = (0.13 + active * 0.58) * visibility, light = active * emission * 0.28;
    if (p.lineProjected) p.lineProjected(projected[edge.a], projected[edge.b], 0.014, color, alpha, light);
    else p.line(points[edge.a], points[edge.b], 0.014, color, alpha, light);
  }
  const rim = 1 + (RINGS - 1) * SIDES;
  for (let i = 0; i < SIDES; i++) {
    position(rim + i, 0.02, arena.lipPoints[i]);
    arena.lipProjected[i] = p.project(arena.lipPoints[i], arena.lipProjected[i]);
  }
  for (let i = 0; i < SIDES; i++) {
    const j = (i + 1) % SIDES, n = normals[rim + i], color = tone(0.52 + Math.max(0, dot3(n, LIP_LIGHT)) * 0.1 + Math.min(0.3, responses[(rim + i) * 3]));
    if (p.lineProjected) p.lineProjected(arena.lipProjected[i], arena.lipProjected[j], 0.028, color, visibility * 0.86, emission * visibility * 0.3);
    else p.line(arena.lipPoints[i], arena.lipPoints[j], 0.028, color, visibility * 0.86, emission * visibility * 0.3);
  }
}

// src/3d/effects/energy-shield.ts
var energy_shield_exports = {};
__export(energy_shield_exports, {
  SHIELD_TIMING_3D: () => SHIELD_TIMING_3D,
  create: () => create13,
  meta: () => meta13
});
var SHIELD_TIMING_3D = { deploy: 0.52, hits: [1.02, 1.68, 2.32], release: 3.18, end: 3.95 };
var meta13 = {
  id: "scifi/energy-shield-3d",
  name: "Energy Shield 3D",
  description: "A curved cyan energy membrane catches three oblique amber bolts. Each contact dents a local patch, sends a geodesic ripple around the curved shell, and briefly lights nearby hex cells before the intact shield settles and retracts.",
  duration: SHIELD_TIMING_3D.end,
  loop: false,
  options: { seed: 2761, radius: 2.8, intensity: 1, palette: [...SHIELD_PALETTE_3D] },
  stages: [{ at: 0, label: "DEPLOY" }, { at: 0.52, label: "GUARD" }, { at: 1.02, label: "ABSORB" }, { at: 1.68, label: "DEFLECT" }, { at: 2.32, label: "REINFORCE" }, { at: 2.9, label: "RECOVER" }, { at: 3.18, label: "RETRACT" }],
  cues: SHIELD_TIMING_3D.hits.flatMap((at, i) => [{ at, type: "hit", value: i === 2 ? 0.8 : 0.5 }, { at, type: "flash", value: 0.25 }, { at, type: "shake", value: 0.16 }])
};
function create13(options) {
  const radius = clamp3(Number.isFinite(options.radius) ? options.radius : 2.8, 1.2, 3.4), intensity = clamp3(Number.isFinite(options.intensity) ? options.intensity : 1, 0, 2);
  const palette = options.palette?.length ? options.palette : meta13.options.palette, tone = (q) => palette[Math.round(clamp3(q) * (palette.length - 1))];
  const surface = createShieldSurface3D([0.6, radius + 0.4, 0.65], [0.14, 0, 1], radius * 1.22, radius);
  const activeSurface = { ...surface };
  const impacts = SHIELD_TIMING_3D.hits.map((at, i) => ({ at, normal: shieldNormal3D(surface, [-0.27, 0.38, -0.04][i] * radius, [0.24, -0.19, 0.03][i] * radius), strength: [0.9, 0.72, 1.2][i] }));
  const incoming = impacts.map((hit, i) => {
    const end = shieldPoint3D(surface, hit.normal), direction = norm3([-0.85 + i * 0.13, 0.12 + i * 0.04, 1]);
    return { end, direction, start: add3(end, mul3(direction, 4.4)) };
  });
  const rng = new Rng3D(options.seed);
  const fragments = impacts.flatMap((hit, index) => Array.from({ length: index === 2 ? 17 : 12 }, () => ({
    index,
    life: rng.range(0.24, 0.5),
    speed: rng.range(1.7, 3.2),
    angle: rng.range(0, TAU3),
    forward: rng.range(0.7, 1.5),
    size: rng.range(0.015, 0.032),
    birth: hit.at + rng.range(0, 0.025)
  })));
  let time = 0;
  return {
    update(dt) {
      time += dt;
    },
    draw(p) {
      if (time <= 0 || time >= meta13.duration - 1e-8) return;
      const visibility = smooth3(0.04, 0.42, time) * (1 - smooth3(SHIELD_TIMING_3D.release, 3.85, time));
      if (visibility <= 0) return;
      const growth = smooth3(0.04, 0.52, time), shrink = 1 - smooth3(3.32, 3.86, time), aperture = surface.aperture * Math.max(0.015, growth * shrink);
      activeSurface.aperture = aperture;
      activeSurface.capCos = Math.sqrt(1 - (aperture / surface.radius) ** 2);
      drawShieldSurface3D(p, surface, { time, impacts, visibility, aperture, palette, emission: intensity * 0.24, cellSize: radius * 0.145 });
      for (let index = 0; index < impacts.length; index++) {
        const hit = impacts[index], age = time - hit.at, bolt = incoming[index];
        if (age > -0.28 && age < 0) {
          const progress = (age + 0.28) / 0.28;
          const head = add3(bolt.start, mul3(sub3(bolt.end, bolt.start), progress));
          const tail = add3(head, mul3(bolt.direction, 0.7 + progress * 0.65));
          p.line(tail, head, 0.032, "#d65e37", 0.9, 0.12 * intensity);
          p.line(add3(head, mul3(bolt.direction, 0.5)), head, 0.047, "#ffd6a0", 1, 0.28 * intensity);
          p.glow(head, 0.36, "#ff9a55", 0.22 * intensity);
        }
        if (age < 0 || age > 1.2) continue;
        const contact = Math.exp(-age * 22), ringAge = age;
        if (contact > 0.01) {
          const at = shieldPoint3D(surface, hit.normal, -0.15 * Math.exp(-age * 13) + 0.035);
          p.point(at, 0.065 + contact * 0.07, tone(1), contact, 0.3 * intensity);
          p.glow(at, 0.54, tone(0.8), contact * 0.4 * intensity);
        }
        for (let echo = 0; echo < 2; echo++) {
          const age2 = ringAge - echo * 0.11;
          if (age2 <= 0) continue;
          const strength = Math.exp(-age2 * 2.15) * (echo ? 0.3 : 1) * visibility * hit.strength;
          const ring = shieldRipple3D(activeSurface, hit.normal, age2 * 4.8, 112);
          for (let k = 0; k < ring.length - 1; k++) {
            const a = ring[k], b = ring[k + 1];
            if (!a || !b) continue;
            const da = impacts.reduce((d, h) => d + shieldResponse3D(surface, a, h, time).displacement, 0), db = impacts.reduce((d, h) => d + shieldResponse3D(surface, b, h, time).displacement, 0);
            p.line(shieldPoint3D(surface, a, da + 0.036), shieldPoint3D(surface, b, db + 0.036), echo ? 0.018 : 0.032, tone(echo ? 0.62 : 0.86), strength * 0.9, strength * intensity * 0.16);
          }
        }
      }
      for (const chip of fragments) {
        const age = time - chip.birth, q = age / chip.life;
        if (q <= 0 || q >= 1) continue;
        const hit = impacts[chip.index], at = shieldPoint3D(surface, hit.normal, 0.06);
        const velocity = add3(mul3(hit.normal, chip.forward), add3(mul3(surface.u, Math.cos(chip.angle) * chip.speed), mul3(surface.v, Math.sin(chip.angle) * chip.speed)));
        const pos = (t) => add3(add3(at, mul3(velocity, (1 - Math.exp(-t * 2.8)) / 2.8)), [0, -2 * t * t, 0]);
        p.line(pos(Math.max(0, age - 0.045)), pos(age), chip.size, q < 0.3 ? "#ffd6a0" : "#d47750", 1 - smooth3(0.35, 1, q), 0.06 * intensity);
      }
    }
  };
}

// gallery/3d.ts
var canvas = document.querySelector("#view");
var screen = document.querySelector("#screen");
var stage = document.querySelector("#stage");
var readout = document.querySelector("#readout");
var status = document.querySelector("#status");
var pixelSlider = document.querySelector("#pixel");
var elevationSlider = document.querySelector("#elevation");
var seedText = document.querySelector("#seedText");
var ctx = canvas.getContext("2d", { alpha: false });
var offscreen = document.createElement("canvas");
var offCtx = offscreen.getContext("2d", { alpha: false });
var effects = { frost: frost_nova_exports, slash: arc_slash_exports, blackhole: black_hole_exports, wind: wind_rasenshuriken_exports, windOriginal: wind_rasenshuriken_legacy_exports, shatter: ice_shatter_exports, flame: thermal_plume_exports, lightning: forked_lightning_exports, water: crown_splash_exports, voidrift: void_rift_exports, meteor: meteor_impact_exports, laser: coherent_laser_exports, shield: energy_shield_exports };
var selected = "blackhole";
var instance = createFx3D(black_hole_exports, {});
var width = 0;
var height = 0;
var last = performance.now();
var paused = false;
var dirty = true;
var frame = createFrame3D(16, 16);
var painter = new Painter3D(frame);
var image = offCtx.createImageData(16, 16);
var pixel = 3;
var yaw = 0.68;
var elevation = 28 * Math.PI / 180;
var zoom = 1;
var glow = true;
var dragging = false;
var prevX = 0;
var prevY = 0;
var seed = meta3.options.seed;
var projectOptions = {};
var projectName = "";
var loadedProject;
var previewProject = createProject({ id: "3d/preview", kind: "3d" });
var selectedFps = () => loadedProject?.fps ?? 30;
var presentationClock = new PlaybackClock(meta3.duration, true);
presentationClock.playing = true;
var cinematic = new CinematicCompositor();
var worldLights = new CinematicLighting3D();
var profile = createRenderProfile3D(selected);
var cinematicRenderer = null;
var exactPixels = true;
var rendererRequest = 0;
async function selectRenderer() {
  const token = ++rendererRequest;
  cinematicRenderer?.dispose();
  cinematicRenderer = null;
  const backend = document.querySelector("#backend").value === "webgpu" ? "webgpu" : "cpu";
  try {
    const candidate = await CinematicFrameRenderer.create(offscreen, { backend, onStatus: (s) => {
      document.querySelector("#renderer-status").textContent = JSON.stringify(s);
    } });
    if (token !== rendererRequest) {
      candidate.dispose();
      return;
    }
    cinematicRenderer = candidate;
    dirty = true;
  } catch (error) {
    document.querySelector("#renderer-status").textContent = `CPU \xB7 ${String(error)}`;
  }
}
function syncLabels() {
  document.querySelector("#pxText").textContent = `${pixel}\xD7`;
  document.querySelector("#elText").textContent = `${Math.round(elevation * 180 / Math.PI)}\xB0`;
  seedText.textContent = `SEED ${seed}`;
}
function chooseEffect(name) {
  dirty = true;
  selected = name;
  profile = createRenderProfile3D(name);
  instance = createFx3D(effects[name], { ...projectOptions, seed });
  presentationClock.duration = loadedProject?.seconds ?? instance.meta.duration;
  presentationClock.reset();
  document.querySelector("#timeline").max = String(presentationClock.duration);
  document.querySelector("#timeline").step = String(1 / selectedFps());
  status.textContent = instance.meta.description;
  profileFields();
}
function resize() {
  const box = screen.getBoundingClientRect();
  const [w, h] = profile.nativeSize;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const cw = Math.max(1, Math.round(box.width * dpr)), ch2 = Math.max(1, Math.round(box.height * dpr));
  if (width === w && height === h && canvas.width === cw && canvas.height === ch2) return;
  dirty = true;
  width = w;
  height = h;
  frame = createFrame3D(w, h);
  painter = new Painter3D(frame);
  offscreen.width = w;
  offscreen.height = h;
  image = offCtx.createImageData(w, h);
  canvas.width = cw;
  canvas.height = ch2;
  ctx.imageSmoothingEnabled = false;
}
var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
function render() {
  resize();
  enableHDRLight(frame);
  const isBlackHole = selected === "blackhole";
  const isWind = selected === "wind" || selected === "windOriginal";
  const baseCamera = { ...profile.camera, yaw, elevation, zoom: zoom * profile.camera.zoom };
  const camera = reducedMotion.matches || !profile.cameraMotion ? baseCamera : instance.camera(baseCamera);
  painter.setCamera(camera).begin(profile.background ?? 0);
  if (profile.grid) painter.grid(8, 1);
  instance.draw(painter);
  const project = loadedProject ?? previewProject;
  frame.semanticMasks = void 0;
  postprocessProjectFrame(frame, project, instance.t, Math.floor(instance.t * selectedFps() + 1e-6), { space: "screen-only" });
  if (glow) {
    const lighting = worldLights.evaluate(frame, camera, profile.lights, profile.lighting);
    const options = { ...profile.cinematic, radiance: lighting.radiance, occlusion: lighting.occlusion, ...project.pixelStyle?.finalColorPolicy === "palette-locked" ? { finalPalette: project.pixelStyle.palette } : {} };
    if (cinematicRenderer) cinematicRenderer.render(frame, options);
    else {
      cinematic.render(frame, image.data, options);
      finishProjectRGBA(image.data, project);
      offCtx.putImageData(image, 0, 0);
    }
  } else {
    compositeFrame3D(frame, image.data, 0);
    finishProjectRGBA(image.data, project);
    offCtx.putImageData(image, 0, 0);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#050811";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const v = integerViewport(width, height, canvas.width, canvas.height);
  const scale = Math.min(v.scale, Math.max(1, Math.round(pixel * (devicePixelRatio || 1))));
  if (exactPixels) ctx.drawImage(offscreen, Math.floor((canvas.width - width * scale) / 2), Math.floor((canvas.height - height * scale) / 2), width * scale, height * scale);
  else ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
  const rendererStatus = cinematicRenderer?.status;
  document.querySelector("#renderer-status").textContent = rendererStatus ? `${rendererStatus.backend.toUpperCase()} \xB7 ${rendererStatus.adapter?.software ? "\uC18C\uD504\uD2B8\uC6E8\uC5B4 \uC5B4\uB311\uD130 \xB7 " : ""}${rendererStatus.reason ?? rendererStatus.state}` : "CPU cinematic";
  dirty = false;
}
function animation(now) {
  presentationClock.playing = !paused;
  const tick = presentationClock.tick(now, !document.hidden);
  const time = Math.min(presentationClock.duration, Math.floor(presentationClock.time * selectedFps() + 1e-6) / selectedFps());
  if (tick.wrapped || time < instance.t) instance.restart();
  if (time > instance.t) instance.update(time - instance.t);
  if (!paused || dirty) render();
  readout.textContent = `${instance.t.toFixed(2)} / ${instance.meta.duration.toFixed(2)} s`;
  stage.textContent = instance.stage();
  document.querySelector("#timeline").value = String(presentationClock.time);
  requestAnimationFrame(animation);
}
function button(id, handler) {
  document.querySelector(id).addEventListener("click", handler);
}
button("#replay", () => {
  instance.restart();
  presentationClock.reset();
  paused = false;
  dirty = true;
  last = performance.now();
  document.querySelector("#pause").textContent = "\u2161 PAUSE";
});
button("#pause", () => {
  paused = !paused;
  presentationClock.suspend();
  last = performance.now();
  dirty = true;
  document.querySelector("#pause").textContent = paused ? "\u25B6 PLAY" : "\u2161 PAUSE";
});
button("#seed", () => {
  const kept = profile;
  seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
  chooseEffect(selected);
  profile = kept;
  syncLabels();
  profileFields();
});
button("#save", () => {
  void (async () => {
    render();
    const rgba = cinematicRenderer && glow ? await cinematicRenderer.capture() : image.data;
    const a = document.createElement("a"), url = URL.createObjectURL(await encodeRGBAPNG(width, height, rgba));
    a.href = url;
    a.download = `poku-3d-${selected}-${instance.t.toFixed(2)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  })().catch((error) => {
    status.textContent = String(error);
  });
});
document.querySelector("#effect").addEventListener("change", (e) => {
  const value = e.target.value;
  if (Object.prototype.hasOwnProperty.call(effects, value)) {
    const key = value;
    projectOptions = {};
    projectName = "";
    loadedProject = void 0;
    seed = effects[key].meta.options.seed;
    chooseEffect(key);
    syncLabels();
  }
});
pixelSlider.addEventListener("input", () => {
  pixel = +pixelSlider.value;
  dirty = true;
  syncLabels();
});
elevationSlider.addEventListener("input", () => {
  elevation = +elevationSlider.value * Math.PI / 180;
  dirty = true;
  syncLabels();
});
document.querySelector("#glow").addEventListener("change", (e) => {
  glow = e.target.checked;
  dirty = true;
});
canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  prevX = e.clientX;
  prevY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  yaw += (e.clientX - prevX) * 8e-3;
  elevation = Math.max(0.15, Math.min(1.35, elevation + (e.clientY - prevY) * 5e-3));
  elevationSlider.value = String(Math.round(elevation * 180 / Math.PI));
  prevX = e.clientX;
  prevY = e.clientY;
  dirty = true;
  syncLabels();
});
canvas.addEventListener("pointerup", () => {
  dragging = false;
});
canvas.addEventListener("pointercancel", () => {
  dragging = false;
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  zoom = Math.max(0.6, Math.min(2, zoom * Math.exp(-e.deltaY * 1e-3)));
  dirty = true;
}, { passive: false });
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
    e.preventDefault();
    instance.restart();
    presentationClock.reset();
    paused = false;
    dirty = true;
    last = performance.now();
    document.querySelector("#pause").textContent = "\u2161 PAUSE";
  }
});
document.addEventListener("visibilitychange", () => {
  presentationClock.suspend();
  dirty = true;
});
new ResizeObserver(() => {
  dirty = true;
}).observe(screen);
window.addEventListener("resize", () => {
  dirty = true;
});
reducedMotion.addEventListener("change", () => {
  dirty = true;
});
document.querySelector("#backend").addEventListener("change", () => {
  void selectRenderer();
});
document.querySelector("#exact").addEventListener("change", (e) => {
  exactPixels = e.target.checked;
  dirty = true;
});
function currentProject() {
  const output = { ...profile, camera: { ...profile.camera, yaw, elevation, zoom: zoom * profile.camera.zoom } };
  return createProject({ ...loadedProject, id: loadedProject?.id ?? `3d/${selected === "windOriginal" ? "wind-original" : selected}`, name: projectName || effects[selected].meta.name || selected, kind: "3d", seed, fps: selectedFps(), bg: profile.background === null ? "none" : "dark", options: projectOptions, renderProfile: output });
}
button("#project", () => {
  const project = currentProject();
  const url = URL.createObjectURL(new Blob([serializeProject(project)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${selected}.poku.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
});
function profileFields() {
  const e = document.querySelector("#exposure");
  if (!e) return;
  e.value = String(profile.cinematic.exposure ?? 1);
  document.querySelector("#bloom").value = String(profile.cinematic.bloom && profile.cinematic.bloom.intensity || 0);
  document.querySelector("#grid").checked = profile.grid;
  document.querySelector("#camera-motion").checked = profile.cameraMotion;
  document.querySelector("#profile-json").value = JSON.stringify(profile, null, 2);
}
function openProject(project) {
  if (project.kind !== "3d" || !project.renderProfile) throw new Error("3D RenderProfile\uC774 \uD3EC\uD568\uB41C \uD504\uB85C\uC81D\uD2B8\uB97C \uC120\uD0DD\uD558\uC138\uC694.");
  const loaded = parseRenderProfile3D(JSON.stringify(project.renderProfile));
  seed = project.seed;
  projectOptions = project.options;
  projectName = project.name;
  loadedProject = project;
  chooseEffect(loaded.effectId);
  profile = loaded;
  yaw = profile.camera.yaw;
  elevation = profile.camera.elevation;
  zoom = 1;
  document.querySelector("#effect").value = selected;
  elevationSlider.value = String(elevation * 180 / Math.PI);
  paused = true;
  dirty = true;
  syncLabels();
  profileFields();
}
button("#open-project", () => document.querySelector("#project-file").click());
document.querySelector("#project-file").onchange = async (event) => {
  try {
    const file = event.target.files?.[0];
    if (file) openProject(parseProject(await file.text()));
  } catch (error) {
    status.textContent = String(error);
  }
};
document.querySelector("#timeline").oninput = (event) => {
  paused = true;
  presentationClock.seek(Number(event.target.value));
  dirty = true;
};
for (const [id, delta] of [["#previous", -1], ["#next", 1]]) button(id, () => {
  paused = true;
  presentationClock.step(delta, selectedFps());
  dirty = true;
});
document.querySelector("#exposure").oninput = (event) => {
  profile.cinematic.exposure = Number(event.target.value);
  dirty = true;
};
document.querySelector("#bloom").oninput = (event) => {
  profile.cinematic.bloom = { ...profile.cinematic.bloom, intensity: Number(event.target.value) };
  dirty = true;
};
document.querySelector("#grid").onchange = (event) => {
  profile.grid = event.target.checked;
  dirty = true;
};
document.querySelector("#camera-motion").onchange = (event) => {
  profile.cameraMotion = event.target.checked;
  dirty = true;
};
button("#apply-profile", () => {
  try {
    const loaded = parseRenderProfile3D(document.querySelector("#profile-json").value);
    openProject(createProject({ ...currentProject(), renderProfile: loaded }));
  } catch (error) {
    status.textContent = String(error);
  }
});
button("#refresh-profile", () => {
  document.querySelector("#profile-json").value = JSON.stringify(currentProject().renderProfile, null, 2);
});
addEventListener("pagehide", () => cinematicRenderer?.dispose());
chooseEffect(selected);
syncLabels();
try {
  const saved = sessionStorage.getItem("poku-studio-3d-project");
  if (saved) {
    sessionStorage.removeItem("poku-studio-3d-project");
    openProject(parseProject(saved));
  }
} catch (error) {
  status.textContent = String(error);
}
requestAnimationFrame(animation);
