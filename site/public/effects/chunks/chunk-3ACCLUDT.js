import {
  createRecipeEffect,
  resolveRecipe
} from "./chunk-I2CEDLVF.js";
import {
  loadCatalogEffect
} from "./chunk-56CIQRK2.js";
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
  createChargeVolume2D,
  createCinematicParticles2D,
  createCrystalSurface2D,
  createCurlFlow2D,
  createDissipationPose2D,
  createFracture2D,
  createFrame,
  createFx,
  createIgnitionPose2D,
  createKineticBody2D,
  createParticleVolume2D,
  createStudioCharacter2D,
  createThermalRibbon2D,
  drawActor,
  edgeFade,
  exportLayout2D,
  fly,
  flyV,
  liquidImpactTime,
  liquidMotion,
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
} from "./chunk-NPBZD3DI.js";
import {
  defineImpactContact2D,
  drawTrail,
  motionTrail,
  transformImpactContact2D
} from "./chunk-LCIPQSGQ.js";
import {
  enableHDRLight
} from "./chunk-MIW2CWC4.js";
import {
  CinematicCompositor
} from "./chunk-JQMAFXP4.js";
import {
  PAL,
  TAU,
  clamp,
  fit,
  hex,
  noise,
  rand,
  rng,
  smooth
} from "./chunk-MBWWV6CB.js";
import {
  pixelTransform2D,
  transformPixelPoint2D
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

// src/core/spark-field.ts
var bounded = (x, lo, hi) => Number.isFinite(x) && x >= lo && x <= hi;
var point = (p, limit) => Array.isArray(p) && p.length === 2 && bounded(p[0], -limit, limit) && bounded(p[1], -limit, limit);
function range(x, lo, hi) {
  if (!Array.isArray(x) || x.length !== 2 || !bounded(x[0], lo, hi) || !bounded(x[1], x[0], hi))
    throw new RangeError("Invalid spark field range");
  return [x[0], x[1]];
}
var mix = (a, u) => a[0] + (a[1] - a[0]) * u;
function createSparkField2D(options) {
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((k) => !["palette", "emissionFrame", "count", "seed", "start", "duration", "life", "speed", "width", "drag", "spread", "gravity", "shutter", "maxLength", "lightBudget", "light", "lightStrength", "finish"].includes(k)))
    throw new RangeError("Invalid spark field options");
  if (options.finish !== void 0 && options.finish !== "scintillation") throw new RangeError("Invalid spark finish");
  const scintillation = options.finish === "scintillation";
  const {
    count = 240,
    seed: seed2 = 1,
    start = 0,
    duration = 1,
    spread = 1.4,
    gravity = 24,
    shutter = 0.04,
    maxLength = 10,
    lightBudget = 16,
    light = true,
    lightStrength = 1,
    emissionFrame
  } = options;
  if (!Number.isInteger(count) || !bounded(count, 0, 2048) || !Number.isInteger(seed2) || !bounded(seed2, 0, 4294967295) || !bounded(start, 0, 3596) || !bounded(duration, 0, 60) || start + duration > 3596 || !bounded(spread, 0, Math.PI * 2) || !bounded(gravity, -500, 500) || !bounded(shutter, 0, 0.15) || !bounded(maxLength, 0, 24) || !Number.isInteger(lightBudget) || !bounded(lightBudget, 0, 32) || typeof light !== "boolean" || !bounded(lightStrength, 0, 2) || typeof emissionFrame !== "function") throw new RangeError("Invalid spark field timing, motion, seed or budget");
  if (!Array.isArray(options.palette) || options.palette.length < 1 || options.palette.length > 32)
    throw new RangeError("Invalid spark field palette");
  const colors = [];
  for (const c of options.palette) {
    if (typeof c === "number" ? !Number.isInteger(c) || c < -2147483648 || c > 4294967295 : typeof c !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c)) throw new RangeError("Invalid spark field color");
    colors.push(hex(c) | 4278190080);
  }
  const life = range(options.life ?? [0.35, 0.95], 0.01, 4), speed = range(options.speed ?? [55, 155], 0, 600);
  const width = range(options.width ?? [0.55, 1.8], 0.1, 5), drag = range(options.drag ?? [0.7, 2.8], 0, 20);
  const nLights = Math.min(count, lightBudget), lightIds = new Set(Array.from({ length: nLights }, (_, i) => Math.floor((i + 0.5) * count / nLights)));
  const births = [];
  let end = start;
  for (let id = 0; id < count; id++) {
    const r = (key) => rand(seed2, id, key + 9731), u = (r(1) * 0.18 + id * 0.618033988749895) % 1;
    const born = start + duration * (id + 0.1 + 0.8 * r(2)) / count;
    const source = emissionFrame(born, id, u);
    if (!source || typeof source !== "object" || Array.isArray(source) || !point(source.position, 1e5) || !point(source.direction, 1e4) || source.inheritedVelocity !== void 0 && !point(source.inheritedVelocity, 1e4))
      throw new RangeError("Invalid spark field emission frame");
    if (!(Math.hypot(...source.direction) > 0)) throw new RangeError("Spark field direction must be nonzero");
    const sizeU = r(3) ** 2, w = mix(width, sizeU), a = Math.atan2(source.direction[1], source.direction[0]) + (r(4) - 0.5) * spread;
    const v = mix(speed, r(5)), inherited = source.inheritedVelocity ?? [0, 0];
    const p = Object.freeze({
      id,
      born,
      life: mix(life, r(6)),
      x: source.position[0],
      y: source.position[1],
      vx: Math.cos(a) * v + inherited[0],
      vy: Math.sin(a) * v + inherited[1],
      width: w,
      drag: mix(drag, (1 - sizeU) * (0.65 + 0.35 * r(7))),
      gravity: gravity * (0.6 + 0.4 * sizeU),
      layer: r(8) < 0.4 ? "back" : "front",
      lit: lightIds.has(id)
    });
    births.push(p);
    end = Math.max(end, born + p.life);
  }
  Object.freeze(births);
  const glintEligible = new Set(scintillation ? Array.from(
    { length: Math.min(count, 24) },
    (_, i) => Math.floor((i + 0.5) * count / Math.min(count, 24))
  ) : []);
  const budgetedIds = [...lightIds], nGlintLights = Math.min(nLights, 24);
  const glintLights = new Set(scintillation ? Array.from(
    { length: nGlintLights },
    (_, i) => budgetedIds[Math.floor((i + 0.5) * nLights / nGlintLights)]
  ) : []);
  const glintStyle = scintillation ? births.map((b) => {
    const r = (n) => rand(seed2, b.id, n + 41783);
    return {
      eligible: r(1) > 0.48 || glintEligible.has(b.id),
      star: r(2) > 0.7,
      center: b.life * (0.22 + 0.42 * r(3)),
      duration: Math.min(b.life * 0.4, 0.06 + 0.05 * r(4)),
      second: r(5) > 0.55,
      center2: b.life * (0.72 + 0.12 * r(6)),
      duration2: Math.min(b.life * 0.24, 0.055 + 0.025 * r(7)),
      radius: 1.8 + 1.5 * r(8)
    };
  }) : void 0;
  const pulse = (age, center, duration2) => {
    const q = (age - center) / duration2 + 0.5;
    return q > 0 && q < 1 ? Math.sin(Math.PI * q) ** 2 : 0;
  };
  let cacheTime = NaN, cache = [];
  function prepare(time) {
    if (!bounded(time, -3600, 3600)) throw new RangeError("Invalid spark field time");
    if (time === cacheTime) return;
    cacheTime = time;
    cache = [];
    if (time < start || time >= end) return;
    for (const b of births) {
      if (b.born > time) break;
      if (time >= b.born + b.life) continue;
      const age = time - b.born, q = age / b.life, alpha = Math.min(1, age / 0.025) * Math.min(1, (1 - q) / 0.32);
      if (!(alpha > 0)) continue;
      const [x, y] = fly(b.x, b.y, b.vx, b.vy, age, b.gravity, b.drag);
      const [vx, vy] = flyV(b.vx, b.vy, age, b.gravity, b.drag);
      const dt = Math.min(age, shutter), trace = [
        fly(b.x, b.y, b.vx, b.vy, age - dt, b.gravity, b.drag),
        fly(b.x, b.y, b.vx, b.vy, age - dt * 0.5, b.gravity, b.drag),
        [x, y]
      ];
      const length = Math.hypot(trace[1][0] - trace[0][0], trace[1][1] - trace[0][1]) + Math.hypot(x - trace[1][0], y - trace[1][1]);
      if (length > maxLength) {
        const nearLength = Math.hypot(x - trace[1][0], y - trace[1][1]);
        if (nearLength >= maxLength) {
          const k = nearLength ? maxLength / nearLength : 0;
          trace[0] = [x + (trace[1][0] - x) * k, y + (trace[1][1] - y) * k];
          trace[1] = [(x + trace[0][0]) * 0.5, (y + trace[0][1]) * 0.5];
        } else {
          const k = (maxLength - nearLength) / (length - nearLength);
          trace[0] = [trace[1][0] + (trace[0][0] - trace[1][0]) * k, trace[1][1] + (trace[0][1] - trace[1][1]) * k];
        }
      }
      const heat = (1 - 0.55 * q ** 3) * (b.layer === "back" ? 0.78 : 1), idx = Math.min(colors.length - 1, Math.floor(heat * colors.length));
      const style = glintStyle?.[b.id];
      const peak = style?.eligible ? Math.max(
        pulse(age, style.center, style.duration),
        style.second ? pulse(age, style.center2, style.duration2) * 0.8 : 0
      ) : 0;
      cache.push({
        id: b.id,
        born: b.born,
        life: b.life,
        age,
        progress: q,
        x,
        y,
        vx,
        vy,
        width: b.width * (b.layer === "back" ? 0.7 : 1) * (1 - 0.18 * q),
        alpha: alpha * (b.layer === "back" ? 0.65 : 1),
        color: colors[idx],
        tail: colors[Math.max(0, idx - 2)],
        layer: b.layer,
        lit: b.lit,
        trace,
        ...style ? { glint: peak, glintRadius: style.radius, glintStar: style.star, glintLit: glintLights.has(b.id) } : {}
      });
    }
  }
  return Object.freeze({
    count,
    end,
    births,
    sample(time) {
      prepare(time);
      return cache.map((q) => ({ ...q, trace: q.trace.map((p) => [...p]) }));
    },
    draw(p, time, layer = "front") {
      if (layer !== "back" && layer !== "front") throw new RangeError("Invalid spark field layer");
      prepare(time);
      for (const q of cache) if (q.layer === layer) {
        p.path(q.trace, (u) => u < 0.66 ? q.tail : q.color, (u) => q.alpha * (0.28 + 0.72 * u), q.width, { preferHead: true });
        if (q.width > 1.05) p.circle(q.x, q.y, q.width * 0.5, q.color, q.alpha);
        else p.dot(q.x, q.y, q.color, q.alpha * Math.min(1, q.width));
        if (light && lightStrength > 0 && q.lit) p.glow(q.x, q.y, 3 + q.width * 2, q.color, 0.3 * q.alpha * (1 - q.progress) * lightStrength);
        if (q.glint && q.glint > 0.02) {
          const peak = q.glint, head = colors[colors.length - 1], a = q.alpha * peak;
          p.circle(q.x, q.y, Math.min(1.35, 0.55 + q.width * 0.35) * Math.sqrt(peak), head, a);
          if (q.glintStar && peak > 0.18) {
            const r = q.glintRadius * Math.sqrt(peak);
            const ramp = (u) => u < 0.25 || u > 0.75 ? colors[Math.max(0, colors.length - 2)] : head;
            const fade = (u) => a * 0.88 * (1 - Math.abs(2 * u - 1));
            p.path([[q.x - r, q.y], [q.x + r, q.y]], ramp, fade, 1);
            p.path([[q.x, q.y - r * 0.75], [q.x, q.y + r * 0.75]], ramp, fade, 1);
          }
          if (light && lightStrength > 0 && q.glintLit)
            p.glow(q.x, q.y, 4 + q.width * 1.2, head, 0.22 * a * lightStrength);
        }
      }
    }
  });
}

// src/authoring/lightning-generation.ts
function lightningChannels2D(seed2, from, to) {
  if (!Number.isSafeInteger(seed2) || seed2 < 0 || seed2 > 4294967295 || [from, to].some((p) => !Array.isArray(p) || p.length !== 2 || Array.from(p).some((v) => !Number.isFinite(v))))
    throw new RangeError("Lightning channel seed and endpoints must be finite");
  if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 1 || Math.hypot(to[0] - from[0], to[1] - from[1]) > 512)
    throw new RangeError("Lightning channel span must be 1..512 pixels");
  const R = rng(seed2, 9171), channels = [], span = Math.hypot(to[0] - from[0], to[1] - from[1]);
  function jagged(start, end, detail) {
    let points = [start, end];
    for (let level = 0; level < detail; level++) {
      const next = [points[0]];
      for (let n = 1; n < points.length; n++) {
        const a = points[n - 1], b = points[n], dx = b[0] - a[0], dy = b[1] - a[1];
        const u = R.range(0.29, 0.71), offset = R.range(-0.19, 0.19);
        next.push([a[0] + dx * u - dy * offset, a[1] + dy * u + dx * offset], b);
      }
      points = next;
    }
    return points;
  }
  function append(points, parent, attachment, strength, depth) {
    const distances = [0];
    for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    const length = distances[distances.length - 1];
    const rootDistance = parent < 0 ? 0 : channels[parent].rootDistance + channels[parent].distances[attachment];
    channels.push(Object.freeze({
      points: Object.freeze(points.map((p) => Object.freeze(p))),
      distances: Object.freeze(distances),
      length,
      parent,
      attachment,
      rootDistance,
      connection: parent < 0 ? 0 : parent === 0 ? rootDistance : channels[parent].connection,
      strength,
      depth
    }));
    return channels.length - 1;
  }
  append(jagged([...from], [...to], 6), -1, 0, 1, 0);
  const trunk = channels[0], count = 4 + Math.floor(R.range(0, 3));
  for (let i = 0; i < count; i++) {
    const index = Math.floor((0.12 + 0.64 * (i + R.range(0.1, 0.85)) / count) * (trunk.points.length - 1));
    const a = trunk.points[index], side = R.chance(0.5) ? -1 : 1;
    const remain = Math.max(8, to[1] - a[1]), down = Math.min(remain * 0.72, span * R.range(0.12, 0.32));
    const b = [a[0] + side * span * R.range(0.12, 0.32), a[1] + down];
    const child = append(jagged([...a], b, 4), 0, index, R.range(0.45, 0.68), 1);
    if (i % 3 !== 1) {
      const parent = channels[child], j = Math.floor(R.range(4, 12)), q = parent.points[j];
      append(jagged([...q], [q[0] + side * R.range(7, 21), q[1] + R.range(5, 16)], 3), child, j, parent.strength * 0.5, 2);
    }
  }
  return Object.freeze(channels);
}
function section(channel, from, to) {
  const out = [];
  const low = Math.max(0, from), high = Math.min(channel.length, to);
  if (high <= low) return out;
  for (let i = 1; i < channel.points.length; i++) {
    const a = channel.distances[i - 1], b = channel.distances[i];
    if (b <= low || a >= high) continue;
    const p = channel.points[i - 1], q = channel.points[i], point2 = (d) => {
      const u = (d - a) / (b - a);
      return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
    };
    if (!out.length) out.push(point2(Math.max(a, low)));
    out.push(point2(Math.min(b, high)));
  }
  return out;
}
function createLightningStrikeGeneration2D(plan) {
  const { release, arrival, sourceEmissionEnd, end } = plan.timing;
  const repeat = plan.events.find((e) => e.id === "restrike").at;
  const meta = {
    name: "Lightning strike",
    desc: "A branching leader connects, flashes twice along one channel and leaves a brief fading trace.",
    tags: ["lightning", "strike", "generated-sequence"],
    size: [...plan.size],
    origin: [...plan.origin],
    duration: end,
    fps: 40,
    loop: false,
    bg: "dark",
    options: { seed: plan.intent.seed, palette: [...PAL.electric] }
  };
  return {
    meta,
    events: plan.events,
    create(options) {
      if (!Number.isSafeInteger(options.seed) || options.seed < 0 || options.seed > 4294967295)
        throw new RangeError("Generated effect seed must be uint32");
      if (!Array.isArray(options.palette) || !options.palette.length || options.palette.length > 32 || Array.from(options.palette).some((c) => typeof c === "number" ? !Number.isInteger(c) || c < -2147483648 || c > 4294967295 : typeof c !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c)))
        throw new RangeError("Generated effect palette must contain packed colors or #rgb/#rrggbb");
      if (options.layers !== void 0 && (!options.layers || typeof options.layers !== "object" || Array.isArray(options.layers) || Object.entries(options.layers).some(([key, value]) => !["body", "trail", "sparks", "response", "residue", "light"].includes(key) || typeof value !== "boolean"))) throw new RangeError("Invalid generated layer flags");
      const seed2 = options.seed, layers = { ...options.layers }, C = fit([...options.palette], 8);
      const channels = lightningChannels2D(seed2, plan.from, plan.to), length = channels[0].length;
      const current = (t, at, strength, duration) => {
        const age = t - at;
        return age < 0 || age >= duration ? 0 : strength * smooth(0, 3e-3, age) * (1 - smooth(0.025, duration, age));
      };
      const states = (t) => {
        if (!Number.isFinite(t)) throw new RangeError("Generation draw time must be finite");
        const first = current(t, arrival, 1, 0.085), second = current(t, repeat, 0.68, sourceEmissionEnd - repeat);
        const residual = t < arrival ? 0 : (0.24 * Math.exp(-(t - arrival) / 0.15) + (t >= repeat ? 0.12 * Math.exp(-(t - repeat) / 0.11) : 0)) * (1 - smooth(0.65, end, t));
        const branchResidual = t < arrival ? 0 : 0.24 * Math.exp(-(t - arrival) / 0.15) * (1 - smooth(0.65, end, t));
        return { first, second, residual, branchResidual, active: t >= release && t < end };
      };
      return {
        drawBack(p, t) {
          const s = states(t);
          if (!s.active) return;
          if (t < arrival) {
            const progress = clamp((t - release) / (arrival - release)), front = Math.floor(progress * 14) / 14 * length;
            for (const c of channels) {
              if ((c.depth === 0 ? layers.body : layers.trail) === false) continue;
              const pts = section(c, 0, front - c.rootDistance);
              if (pts.length > 1) p.path(pts, c.depth ? C[3] : C[4], 0.3 * c.strength, 1);
            }
            if (layers.body !== false && progress > 0.76) {
              const pts = section(channels[0], length * (1 - 0.09 * smooth(0.76, 1, progress)), length);
              if (pts.length > 1) p.path(pts, C[4], 0.34, 1);
            }
          } else if (layers.residue !== false) {
            for (const c of channels) {
              const front = (1 - smooth(arrival, arrival + 8e-3, t)) * length;
              if (c.depth > 0 && c.connection < front) continue;
              const pts = section(c, c.depth === 0 ? front : 0, Math.min(c.length, length - c.rootDistance));
              if (pts.length < 2) continue;
              const alpha = (c.depth ? s.branchResidual : s.residual) * c.strength * (c.depth ? Math.exp(-(t - arrival) * 10) : 1);
              if (alpha < 2e-3) continue;
              p.path(pts, c.depth ? C[2] : C[3], (u) => alpha * (0.7 + 0.3 * noise(u * 13, seed2 + c.depth)), 1);
            }
          }
        },
        draw(p, t) {
          const s = states(t);
          if (!s.active || s.first + s.second <= 0) return;
          const power = Math.max(s.first, s.second);
          for (let i = channels.length - 1; i >= 0; i--) {
            const c = channels[i];
            if ((c.depth === 0 ? layers.body : layers.trail) === false) continue;
            const k = c.depth === 0 ? power : s.first * c.strength * 0.8;
            if (k <= 5e-3) continue;
            const returnFront = (1 - smooth(arrival, arrival + 8e-3, t)) * length;
            if (c.depth > 0 && c.connection < returnFront) continue;
            const upward = c.depth === 0 ? returnFront : 0;
            const pts = section(c, upward, Math.min(c.length, length - c.rootDistance));
            if (pts.length < 2) continue;
            const taper = (u) => c.depth === 0 ? 1 : 1 - 0.78 * u;
            p.path(pts, C[3], (u) => k * 0.5 * taper(u), c.depth === 0 ? 3.2 : 1.7);
            p.path(pts, c.depth === 0 ? C[6] : C[5], (u) => k * 0.85 * taper(u), c.depth === 0 ? 1.9 : 1);
            if (c.depth === 0) p.path(pts, C[7], k, 1);
            if (layers.light !== false) p.glowPath(pts, c.depth === 0 ? 11 : 4, C[4], k * (c.depth === 0 ? 0.24 : 0.045));
          }
          if (layers.response !== false) {
            p.ellipse(plan.to[0], plan.to[1], 3, 0.8, C[6], power * 0.7);
            if (layers.light !== false) p.glow(plan.to[0], plan.to[1], 17, C[4], power * 0.22);
          }
        }
      };
    }
  };
}

// src/authoring/water-generation.ts
var WATER_POUR = Object.freeze({
  launch: Object.freeze({ x: -26, z: 0, h: 86, vx: 70, vz: 0, vh: -45 }),
  physics: Object.freeze({ gravity: 420, drag: 0, depthScale: 0.28 })
});
var WATER_POUR_FLIGHT = liquidImpactTime(WATER_POUR.launch, WATER_POUR.physics);
var WATER_POUR_LANDING = Object.freeze(liquidMotion(WATER_POUR.launch, WATER_POUR_FLIGHT, WATER_POUR.physics));
function createWaterPourGeneration2D(plan) {
  const { release, sourceEmissionEnd, arrival, end } = plan.timing;
  const meta = {
    name: "Water pour",
    desc: "A falling water stream feeds a spreading shallow pool, then drains and settles.",
    tags: ["water", "pour", "generated-sequence"],
    size: [...plan.size],
    origin: [...plan.origin],
    duration: end,
    fps: 40,
    loop: false,
    bg: "ground",
    options: { seed: plan.intent.seed, palette: [...PAL.water] }
  };
  return {
    meta,
    events: plan.events,
    create(options) {
      if (!Number.isSafeInteger(options.seed) || options.seed < 0 || options.seed > 4294967295)
        throw new RangeError("Generated effect seed must be uint32");
      if (!Array.isArray(options.palette) || !options.palette.length || options.palette.length > 32 || Array.from(options.palette).some((c) => typeof c === "number" ? !Number.isInteger(c) || c < -2147483648 || c > 4294967295 : typeof c !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c)))
        throw new RangeError("Generated effect palette must contain packed colors or #rgb/#rrggbb");
      if (options.layers !== void 0 && (!options.layers || typeof options.layers !== "object" || Array.isArray(options.layers) || Object.entries(options.layers).some(([key, value]) => !["body", "trail", "sparks", "response", "residue", "light"].includes(key) || typeof value !== "boolean"))) throw new RangeError("Invalid generated layer flags");
      const seed2 = options.seed, C = fit([...options.palette], 8), layers = { ...options.layers };
      const physics = WATER_POUR.physics, source = WATER_POUR.launch, landing = WATER_POUR_LANDING;
      const lastArrival = sourceEmissionEnd + WATER_POUR_FLIGHT;
      const flow = (birth) => smooth(release, release + 0.12, birth) * (1 - smooth(sourceEmissionEnd - 0.14, sourceEmissionEnd, birth));
      const launchAt = (birth) => {
        const variation = smooth(release, release + 0.2, birth) * (1 - smooth(sourceEmissionEnd - 0.2, sourceEmissionEnd, birth));
        return {
          ...source,
          x: source.x + noise(birth * 5, seed2 + 431) * 1.2 * variation,
          vx: source.vx + (noise(birth * 4, seed2 + 719) * 22 + noise(birth * 13, seed2 + 99) * 7) * variation
        };
      };
      const parcel = (birth, age) => liquidMotion(launchAt(birth), age, physics);
      const width = (birth, age) => {
        const launch = launchAt(birth), sourceSpeed = Math.hypot(launch.vx, launch.vh);
        const speed = Math.hypot(launch.vx, -launch.vh + physics.gravity * age);
        return 6 * Math.sqrt(sourceSpeed / speed) * Math.sqrt(flow(birth)) * (1 + 0.38 * noise(birth * 10, seed2 + 73) + 0.15 * noise(birth * 27, seed2 + 19));
      };
      const drops = Array.from({ length: 34 }, (_, id) => {
        const r = rng(seed2, id, 4128), birth = release + 0.12 + r.range(0, sourceEmissionEnd - release - 0.2);
        const detachAge = r.range(0.18, WATER_POUR_FLIGHT * 0.94), q = parcel(birth, detachAge);
        const side = r.chance(0.5) ? -1 : 1, w = width(birth, detachAge);
        const launch = {
          x: q.x + side * w * 0.85,
          z: 0,
          h: q.h,
          vx: q.vx + side * r.range(9, 29),
          vz: r.range(-11, 11),
          vh: q.vh + r.range(-12, 16)
        };
        return { birth: birth + detachAge, launch, impact: liquidImpactTime(launch, physics), size: r.range(0.65, 1.55), kind: "shed" };
      });
      for (let id = 0; id < 62; id++) {
        const r = rng(seed2, id, 9427), birth = arrival + 0.045 + r.range(0, sourceEmissionEnd - release - 0.05);
        const impact = parcel(birth - WATER_POUR_FLIGHT, WATER_POUR_FLIGHT);
        const a = r.range(0, TAU), speed = r.range(20, 68), launch = {
          x: impact.x + r.range(-3, 4),
          z: r.range(-3, 3),
          h: 0.2,
          vx: Math.cos(a) * speed + 13,
          vz: Math.sin(a) * speed,
          vh: r.range(33, 97)
        };
        drops.push({ birth, launch, impact: liquidImpactTime(launch, physics), size: r.range(0.7, 1.65), kind: "splash" });
      }
      const waves = Array.from({ length: 9 }, (_, id) => {
        const r = rng(seed2, id, 5571);
        const birth = arrival + 0.025 + id * 0.125 + r.range(0, 0.06);
        return { birth, x: parcel(birth - WATER_POUR_FLIGHT, WATER_POUR_FLIGHT).x, z: r.range(-2, 2), phase: r.range(0, TAU) };
      });
      function active(t) {
        if (!Number.isFinite(t)) throw new RangeError("Generation draw time must be finite");
        return t > 0 && t < end;
      }
      function bead(p, q, size, alpha) {
        p.shade(q.x - size - 0.5, q.y - size - 0.5, q.x + size + 0.5, q.y + size + 0.5, (x, y, out) => {
          const dx = (x - q.x) / size, dy = (y - q.y) / size, d = dx * dx + dy * dy;
          if (d > 1) return;
          const lit = -dx * 0.65 - dy * 0.7;
          out.c = lit > 0.3 ? C[6] : dy > 0.25 ? C[2] : C[4];
          out.a = alpha * (lit > 0.3 ? 0.95 : 0.4 + 0.25 * Math.sqrt(1 - d));
        });
      }
      const maxVx = source.vx + 22 + 7;
      const maxHalfWidth = 6 * 1.53 * Math.hypot(maxVx, source.vh) / -source.vh + 1.2;
      function stream(p, t) {
        if (t <= release || t >= lastArrival) return;
        p.shade(source.x - maxHalfWidth - 1, -source.h, source.x + maxVx * WATER_POUR_FLIGHT + maxHalfWidth + 1, 0.5, (x, y, out) => {
          const age = (-45 + Math.sqrt(45 * 45 + 2 * physics.gravity * (y + source.h))) / physics.gravity;
          if (age < 0 || age > WATER_POUR_FLIGHT) return;
          const birth = t - age, w = width(birth, age);
          if (w < 0.12) return;
          const q = parcel(birth, age), vy = q.vy, speed = Math.hypot(q.vx, vy);
          const center = q.x;
          const v = (x - center) * vy / (speed * w), av = Math.abs(v);
          if (av > 1) return;
          const crease = noise(birth * 19 + v * 0.7, seed2 + 237);
          const reflection = Math.abs(v + 0.49 + crease * 0.14);
          const rim = v < -0.83;
          out.c = reflection < 0.13 && crease > -0.12 ? C[6] : rim ? C[4] : v > 0.58 ? C[2] : v > 0.1 ? C[3] : C[4];
          out.a = reflection < 0.13 && crease > -0.12 ? 0.88 : rim ? 0.55 : 0.26 + 0.32 * Math.sqrt(1 - v * v);
          if (reflection < 0.075 && crease > 0.52) {
            out.c = C[7];
            out.a = 0.96;
          }
        });
      }
      function surface(p, t) {
        const age = t - arrival;
        if (age <= 0) return;
        const fill = Math.min(age, sourceEmissionEnd - release), settle = Math.max(0, t - lastArrival);
        const rx = 3 + 42 * (1 - Math.exp(-fill * 2.2)) + 7 * smooth(0, 1, settle), ry = rx * 0.25;
        const alpha = smooth(0, 0.13, age) * (1 - smooth(lastArrival + 0.15, end, t));
        p.shade(landing.x - rx - 2, -ry - 2, landing.x + rx + 2, ry + 2, (x, y, out) => {
          const dx = (x - landing.x) / rx, dy = y / ry, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
          const rim = 1 + 0.035 * Math.sin(a * 3 + seed2) + 0.018 * Math.cos(a * 7 - seed2);
          if (d > rim) return;
          const edge = d > rim - 0.045;
          out.c = edge ? dy < -0.25 ? C[5] : C[3] : dy < -0.12 ? C[3] : C[2];
          out.a = alpha * (edge ? 0.6 : 0.18 + 0.11 * (1 - d));
        });
        for (const wave of waves) {
          const a = t - wave.birth;
          if (a <= 0 || a >= 0.8) continue;
          const r = 2 + 36 * a, fade = alpha * (1 - smooth(0.2, 0.8, a)) * 0.7;
          for (const start of [0.15 + wave.phase * 0.08, 3.2 + wave.phase * 0.06]) {
            const points = [];
            for (let i = 0; i <= 20; i++) {
              const angle = start + i / 20 * 1.4;
              points.push([wave.x + Math.cos(angle) * r, wave.z * 0.28 + Math.sin(angle) * r * 0.25]);
            }
            p.path(points, start < 2 ? C[5] : C[4], fade);
          }
        }
      }
      function particles(p, t, back) {
        for (const drop of drops) {
          if ((drop.kind === "shed" ? layers.trail : layers.sparks) === false) continue;
          const age = t - drop.birth;
          if (age < 0 || age >= drop.impact) continue;
          const q = liquidMotion(drop.launch, age, physics);
          if (q.z < 0 !== back) continue;
          const a = smooth(0, 0.02, age) * (1 - smooth(end - 0.15, end, t));
          bead(p, q, drop.size, a);
        }
      }
      return {
        drawBack(p, t) {
          if (!active(t)) return;
          if (layers.response !== false) surface(p, t);
          particles(p, t, true);
        },
        draw(p, t) {
          if (!active(t)) return;
          if (layers.body !== false) stream(p, t);
          particles(p, t, false);
        }
      };
    }
  };
}

// src/authoring/ice-generation.ts
function createIceShatterGeneration2D(plan, crystalSurface = false) {
  const { release, end } = plan.timing;
  const meta = {
    name: "Ice shatter",
    desc: "One faceted ice crystal cracks into its own unequal tumbling pieces.",
    tags: ["ice", "shatter", "generated-sequence"],
    size: [...plan.size],
    origin: [...plan.origin],
    duration: end,
    fps: 40,
    loop: false,
    bg: "dark",
    options: { seed: plan.intent.seed, palette: [...PAL.ice] }
  };
  return {
    meta,
    events: plan.events,
    create(options) {
      if (!Number.isSafeInteger(options.seed) || options.seed < 0 || options.seed > 4294967295)
        throw new RangeError("Generated effect seed must be uint32");
      if (!Array.isArray(options.palette) || !options.palette.length || options.palette.length > 32 || Array.from(options.palette).some((c) => typeof c === "number" ? !Number.isInteger(c) || c < -2147483648 || c > 4294967295 : typeof c !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c)))
        throw new RangeError("Generated effect palette must contain packed colors or #rgb/#rrggbb");
      if (options.layers !== void 0 && (!options.layers || typeof options.layers !== "object" || Array.isArray(options.layers) || Object.entries(options.layers).some(([key, value]) => !["body", "trail", "sparks", "response", "residue", "light"].includes(key) || typeof value !== "boolean"))) throw new RangeError("Invalid generated layer flags");
      const seed2 = options.seed, layers = { ...options.layers }, C = fit([...options.palette], 7);
      const polygon = [[-2, -38], [17, -20], [22, 7], [8, 29], [-12, 24], [-23, 1], [-17, -23]];
      const shape = polygon.map(([x, y]) => [x + plan.from[0], y + plan.from[1]]);
      const fracture = createFracture2D({
        polygon: shape,
        palette: options.palette,
        count: 19,
        seed: seed2,
        release,
        life: [0.82, 1.12],
        speed: [28, 58],
        impulse: [2, -54],
        gravity: 100,
        drag: 0.45
      });
      const crystal = crystalSurface ? createCrystalSurface2D({ polygon: shape, palette: options.palette, seed: seed2 }) : void 0;
      const grit = Array.from({ length: 24 }, (_, id) => {
        const r = rng(seed2, id, 7719), cell = fracture.pieces[id % fracture.pieces.length];
        const v = cell.vertices[id % cell.vertices.length];
        return {
          position: [cell.center[0] + v[0], cell.center[1] + v[1]],
          velocity: [cell.velocity[0] + r.range(-22, 22), cell.velocity[1] + r.range(-15, 15)],
          life: r.range(0.24, 0.48),
          size: r.range(0.5, 1.1)
        };
      });
      const active = (t) => {
        if (!Number.isFinite(t)) throw new RangeError("Generation draw time must be finite");
        return t > 0 && t < end;
      };
      return {
        drawBack(_p, t) {
          active(t);
        },
        draw(p, t) {
          if (!active(t)) return;
          const age = t - release;
          if ((age < 0 ? layers.body : layers.response) !== false) {
            const opacity = smooth(0, 0.1, t), split = smooth(0.16, release, t);
            if (crystal) {
              const samples = age >= 0 || split > 0 ? fracture.sample(t) : [];
              if (age < 0) crystal.draw(p, { opacity });
              else for (const q of samples) {
                const piece = fracture.pieces[q.id];
                crystal.draw(p, {
                  polygon: piece.vertices,
                  materialOrigin: piece.center,
                  position: q.position,
                  angle: q.angle,
                  opacity: opacity * q.opacity,
                  cutEdges: smooth(0, 0.12, age)
                });
              }
              const cracks = split * (1 - smooth(0, 0.16, age));
              if (cracks > 0) for (const q of samples) for (let i = 0; i < q.points.length; i++) {
                const a = q.points[i], b = q.points[(i + 1) % q.points.length];
                p.line(a[0], a[1], b[0], b[1], C[1], opacity * q.opacity * cracks * 0.2);
              }
            } else {
              if (age < 0) {
                const ridge = [plan.from[0] - 2, plan.from[1] + 6];
                p.poly(shape, C[2], opacity);
                p.poly([shape[0], shape[1], shape[2], ridge], C[4], opacity);
                p.poly([shape[0], ridge, shape[4], shape[5], shape[6]], C[5], opacity);
                p.poly([ridge, shape[2], shape[3], shape[4]], C[3], opacity);
                p.line(shape[0][0], shape[0][1], ridge[0], ridge[1], C[6], opacity * 0.85);
              }
              fracture.draw(p, t, {
                opacity: opacity * split,
                cracks: split * (1 - smooth(0, 0.16, age))
              });
            }
          }
          if (layers.sparks !== false && age >= 0) for (const q of grit) {
            if (age >= q.life) continue;
            const [x, y] = fly(...q.position, ...q.velocity, age, 100, 0.8), a = 1 - smooth(0.3, 1, age / q.life);
            p.poly([[x, y - q.size], [x + q.size, y], [x, y + q.size], [x - q.size, y]], C[5], a * 0.65);
          }
        }
      };
    }
  };
}

// src/authoring/generation.ts
function createGenerationPlan2D(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Generation intent must be an object");
  if (Object.keys(input).some((key) => !["material", "action", "response", "seed", "distance", "travel"].includes(key)))
    throw new RangeError("Unknown generation intent field");
  const { material, action, response = "dissipate", seed: seed2 = 1 } = input;
  if (!["fire", "energy", "ice", "water", "lightning"].includes(material) || !["dash", "burst", "plume", "shatter", "pour", "strike"].includes(action) || !["burst", "dissipate"].includes(response)) throw new RangeError("Unsupported generation material, action or response");
  if (material === "lightning" !== (action === "strike"))
    throw new RangeError("Lightning supports strike only; other materials do not support strike");
  if (material === "water" !== (action === "pour"))
    throw new RangeError("Water supports pour only; other materials do not support pour");
  if (material === "ice" !== (action === "shatter"))
    throw new RangeError("Ice supports shatter only; fire/energy support dash, burst or plume");
  if (action !== "dash" && (response !== "dissipate" || input.distance !== void 0 || input.travel !== void 0))
    throw new RangeError("Only dash supports a terminal burst, distance or travel controls");
  if (!Number.isSafeInteger(seed2) || seed2 < 0 || seed2 > 4294967295) throw new RangeError("Generation seed must be uint32");
  const distance = input.distance === void 0 ? 128 : input.distance, travel = input.travel === void 0 ? 0.74 : input.travel;
  if (!Number.isFinite(distance) || distance < 24 || distance > 160 || !Number.isFinite(travel) || travel < 0.25 || travel > 3)
    throw new RangeError("Dash distance must be 24..160px and travel 0.25..3s");
  if (material === "lightning") {
    const release2 = 0.06, arrival2 = 0.23, repeat = 0.41, sourceEmissionEnd2 = 0.48, emissionEnd2 = sourceEmissionEnd2, end2 = 0.95;
    const from2 = Object.freeze([-12, -150]), to2 = Object.freeze([0, 0]);
    const events2 = [
      { id: "release", at: release2, kind: "release", payload: { x: from2[0], y: from2[1], material } },
      { id: "arrival", at: arrival2, kind: "arrival", payload: { x: to2[0], y: to2[1], material } },
      { id: "strike", at: arrival2, kind: "strike", payload: { x: to2[0], y: to2[1], material } },
      { id: "restrike", at: repeat, kind: "restrike", payload: { x: to2[0], y: to2[1], material } },
      { id: "source-emission-end", at: sourceEmissionEnd2, kind: "source-emission-end", payload: { x: from2[0], y: from2[1], material } },
      { id: "emission-end", at: emissionEnd2, kind: "emission-end", payload: { x: to2[0], y: to2[1], material } }
    ];
    return Object.freeze({
      schema: "poku.generation-plan/v1",
      intent: Object.freeze({ material, action, response, seed: seed2 }),
      timing: Object.freeze({ release: release2, arrival: arrival2, sourceEmissionEnd: sourceEmissionEnd2, emissionEnd: emissionEnd2, end: end2 }),
      from: from2,
      to: to2,
      size: Object.freeze([280, 232]),
      origin: Object.freeze([140, 196]),
      events: Object.freeze(events2.map((e) => Object.freeze({ ...e, payload: Object.freeze(e.payload) })))
    });
  }
  if (material === "water") {
    const release2 = 0.18, sourceEmissionEnd2 = 1.35, arrival2 = release2 + WATER_POUR_FLIGHT;
    const emissionEnd2 = sourceEmissionEnd2 + WATER_POUR_FLIGHT, end2 = 3.1;
    const from2 = Object.freeze([WATER_POUR.launch.x, -WATER_POUR.launch.h]);
    const to2 = Object.freeze([WATER_POUR_LANDING.x, 0]);
    const events2 = [
      { id: "release", at: release2, kind: "release", payload: { x: from2[0], y: from2[1], material } },
      { id: "arrival", at: arrival2, kind: "arrival", payload: { x: to2[0], y: to2[1], material } },
      { id: "source-emission-end", at: sourceEmissionEnd2, kind: "source-emission-end", payload: { x: from2[0], y: from2[1], material } },
      { id: "emission-end", at: emissionEnd2, kind: "emission-end", payload: { x: to2[0], y: to2[1], material } }
    ];
    return Object.freeze({
      schema: "poku.generation-plan/v1",
      intent: Object.freeze({ material, action, response, seed: seed2 }),
      timing: Object.freeze({ release: release2, arrival: arrival2, sourceEmissionEnd: sourceEmissionEnd2, emissionEnd: emissionEnd2, end: end2 }),
      from: from2,
      to: to2,
      size: Object.freeze([240, 200]),
      origin: Object.freeze([110, 160]),
      events: Object.freeze(events2.map((e) => Object.freeze({ ...e, payload: Object.freeze(e.payload) })))
    });
  }
  const release = action === "shatter" ? 0.36 : action === "burst" ? 0.22 : 0.28;
  const arrival = action === "dash" ? release + travel : release;
  const sourceEmissionEnd = action === "plume" ? release + 1.3 : arrival;
  const emissionEnd = action === "burst" || response === "burst" ? arrival + 0.08 : sourceEmissionEnd;
  const end = sourceEmissionEnd + (action === "shatter" ? 1.15 : action === "plume" ? 1.35 : action === "burst" || response === "burst" ? 1.25 : 1.05);
  const from = Object.freeze(action === "dash" ? [-distance / 2, -16] : [0, action === "plume" ? 12 : -16]);
  const to = Object.freeze(action === "dash" ? [distance / 2, -16] : [...from]);
  const events = [{ id: "release", at: release, kind: "release", payload: { x: from[0], y: from[1], material } }];
  if (action === "dash") events.push({ id: "arrival", at: arrival, kind: "arrival", payload: { x: to[0], y: to[1], material } });
  if (action === "burst" || response === "burst") events.push({ id: "burst", at: arrival, kind: "burst", payload: { x: to[0], y: to[1], material } });
  if (action === "shatter") events.push({ id: "shatter", at: release, kind: "shatter", payload: { x: from[0], y: from[1], material } });
  if (action !== "burst") events.push({ id: "source-emission-end", at: sourceEmissionEnd, kind: "source-emission-end", payload: { x: to[0], y: to[1], material } });
  events.push({ id: "emission-end", at: emissionEnd, kind: "emission-end", payload: { x: to[0], y: to[1], material } });
  return Object.freeze({
    schema: "poku.generation-plan/v1",
    intent: Object.freeze({ material, action, response, seed: seed2, ...action === "dash" ? { distance, travel } : {} }),
    timing: Object.freeze({ release, arrival, sourceEmissionEnd, emissionEnd, end }),
    from,
    to,
    size: Object.freeze([384, 256]),
    origin: Object.freeze([192, 170]),
    events: Object.freeze(events.map((event) => Object.freeze({ ...event, payload: Object.freeze(event.payload) })))
  });
}
function resolveGenerationPlan2D(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Generation plan must be an object");
  const p = input;
  if (p.schema !== "poku.generation-plan/v1") throw new RangeError("Unsupported generation plan schema");
  if (Object.keys(p).some((key) => !["schema", "intent", "timing", "from", "to", "size", "origin", "events"].includes(key)))
    throw new RangeError("Unknown generation plan field");
  const resolved = createGenerationPlan2D(p.intent);
  for (const key of ["timing", "from", "to", "size", "origin", "events"]) {
    const same = (a, b) => {
      if (a === b) return true;
      if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
      const keys = Object.keys(a);
      return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && same(a[k], b[k]));
    };
    if (!same(p[key], resolved[key])) throw new RangeError(`Generation ${key} disagrees with its intent; regenerate the plan after edits`);
  }
  return resolved;
}
function dashPathTangent(plan, phase) {
  return [plan.to[0] - plan.from[0], -12 * Math.PI * Math.cos(phase * Math.PI)];
}
function generationSource2D(plan, time) {
  if (!Number.isFinite(time)) throw new RangeError("Generation time must be finite");
  if (plan.intent.action !== "dash" || time <= plan.timing.release)
    return { position: [...plan.from], velocity: [0, 0] };
  if (time >= plan.timing.arrival) return { position: [...plan.to], velocity: [0, 0] };
  const travel = plan.timing.arrival - plan.timing.release, u = (time - plan.timing.release) / travel;
  const v = u * u * (3 - 2 * u), dv = 6 * u * (1 - u) / travel, distance = plan.to[0] - plan.from[0];
  const tangent = dashPathTangent(plan, v);
  return {
    position: [plan.from[0] + distance * v, plan.from[1] - 12 * Math.sin(v * Math.PI)],
    velocity: [tangent[0] * dv, tangent[1] * dv]
  };
}
function createGeneratedEffect2D(input, options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((k) => !["composition", "iceSurface", "fireSparks", "fireSparkCount", "fireSparkLight", "fireSparkFinish"].includes(k)) || options.composition !== void 0 && !["body", "volumes", "material-volumes"].includes(options.composition) || options.iceSurface !== void 0 && !["facets", "crystal"].includes(options.iceSurface))
    throw new RangeError("Invalid generation composition options");
  if (options.fireSparks !== void 0 && options.fireSparks !== "short-exposure") throw new RangeError("Invalid fire sparks");
  if (options.fireSparkFinish !== void 0 && options.fireSparkFinish !== "scintillation") throw new RangeError("Invalid fire spark finish");
  if (options.fireSparkFinish !== void 0 && options.fireSparks !== "short-exposure") throw new RangeError("Spark finish requires short-exposure sparks");
  const { fireSparkCount, fireSparkLight, fireSparkFinish } = options;
  if (fireSparkCount !== void 0 && (!Number.isInteger(fireSparkCount) || fireSparkCount < 0 || fireSparkCount > 720))
    throw new RangeError("Fire spark count must be an integer from 0 to 720");
  if (fireSparkLight !== void 0 && (!Number.isFinite(fireSparkLight) || fireSparkLight < 0 || fireSparkLight > 2))
    throw new RangeError("Fire spark light must be finite from 0 to 2");
  if ((fireSparkCount !== void 0 || fireSparkLight !== void 0) && options.fireSparks !== "short-exposure")
    throw new RangeError("Fire spark count and light require short-exposure sparks");
  const plan = resolveGenerationPlan2D(input), { material, action, response } = plan.intent, { release, arrival, sourceEmissionEnd, emissionEnd, end } = plan.timing;
  if (options.fireSparks !== void 0 && (material !== "fire" || !["plume", "dash", "burst"].includes(action) || response !== "dissipate" && action !== "dash"))
    throw new RangeError("Short-exposure sparks require fire plume, burst or dash");
  const useSparkField = options.fireSparks === "short-exposure";
  const combinedSparks = action === "dash" && response === "burst";
  const flightSparkCount = combinedSparks ? Math.round((fireSparkCount ?? 410) * 240 / 410) : fireSparkCount ?? (action === "plume" ? 360 : 240);
  const responseSparkCount = combinedSparks ? (fireSparkCount ?? 410) - flightSparkCount : fireSparkCount ?? 170;
  const totalSparkLights = Math.min(24, combinedSparks ? flightSparkCount + responseSparkCount : 24);
  const flightSparkLights = combinedSparks ? Math.round(totalSparkLights * flightSparkCount / Math.max(1, flightSparkCount + responseSparkCount)) : 24;
  const responseSparkLights = combinedSparks ? totalSparkLights - flightSparkLights : 24;
  const volumes = options.composition === "volumes" || options.composition === "material-volumes";
  const charged = options.composition === "material-volumes" && material === "energy";
  if (volumes && (material === "ice" || material === "water" || material === "lightning" || !["dash", "plume"].includes(action) || response !== "dissipate"))
    throw new RangeError("Volume composition supports fire/energy dash or plume with dissipation");
  if (material === "ice") return createIceShatterGeneration2D(plan, options.iceSurface === "crystal");
  if (options.iceSurface !== void 0) throw new RangeError("Ice surface options require ice material");
  if (material === "water") return createWaterPourGeneration2D(plan);
  if (material === "lightning") return createLightningStrikeGeneration2D(plan);
  const isFire = material === "fire", isBurst = action === "burst" || response === "burst";
  const description = `${material} ${action}${action === "dash" ? ` then ${response}` : ""}; source-linked motion and response.`;
  const meta = {
    name: description,
    desc: description,
    tags: [material, action, response, "generated-sequence"],
    size: [...plan.size],
    origin: [...plan.origin],
    duration: end,
    fps: 40,
    loop: false,
    bg: "dark",
    options: { seed: plan.intent.seed, palette: [...isFire ? PAL.fire : PAL.arcane] }
  };
  return {
    meta,
    events: plan.events,
    create(options2) {
      if (!Number.isSafeInteger(options2.seed) || options2.seed < 0 || options2.seed > 4294967295)
        throw new RangeError("Generated effect seed must be uint32");
      if (!Array.isArray(options2.palette) || !options2.palette.length || options2.palette.some((c) => typeof c === "number" ? !Number.isInteger(c) || c < -2147483648 || c > 4294967295 : !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c)))
        throw new RangeError("Generated effect palette must contain packed colors or #rgb/#rrggbb");
      if (options2.layers !== void 0 && (!options2.layers || typeof options2.layers !== "object" || Array.isArray(options2.layers) || Object.entries(options2.layers).some(([key, value]) => !["body", "trail", "sparks", "response", "residue", "light"].includes(key) || typeof value !== "boolean"))) throw new RangeError("Invalid generated layer flags");
      const layers = { ...options2.layers };
      const C = fit(options2.palette, 8), hot = [C[6], C[5], C[4], C[3], C[2]], seed2 = options2.seed;
      const lightEnabled = layers.light !== false;
      const chargeBody = charged ? createChargeVolume2D({ seed: seed2, palette: hot }) : void 0;
      const streamBody = createKineticBody2D({ seed: seed2, material, profile: "stream", palette: hot });
      const plumeBody = createKineticBody2D({ seed: seed2, material, profile: "plume", palette: hot });
      const burstBody = createKineticBody2D({ seed: seed2, material, profile: "burst", palette: hot });
      const dashBodyState = (time) => {
        const { position: [x, y], velocity } = generationSource2D(plan, time);
        const tangent = time === release ? dashPathTangent(plan, 0) : velocity;
        return { time, position: [x - 6, y], size: [23, 11], angle: Math.atan2(tangent[1], tangent[0]) };
      };
      const burstBodyState = (time) => {
        const age = Math.max(0, time - arrival), radius = 6 + 33 * (1 - Math.exp(-age * 11));
        const burnout = isFire ? smooth(0.08, 0.5, age) : 0;
        return {
          time,
          position: [plan.to[0], plan.to[1] - (isFire ? 9 * burnout * burnout : 0)],
          size: [radius, radius],
          progress: Math.min(1, age / 0.5),
          burnout
        };
      };
      const launchTangent = dashPathTangent(plan, 0);
      const ignition = createIgnitionPose2D({
        start: 0,
        duration: release + (action === "plume" ? 0.12 : 0),
        position: action === "dash" ? [plan.from[0] - 6, plan.from[1]] : action === "plume" ? [plan.from[0], plan.from[1] - 22] : plan.from,
        size: action === "dash" ? [23, 11] : action === "plume" ? [22, 12] : [6, 6],
        angle: action === "dash" ? Math.atan2(launchTangent[1], launchTangent[0]) : action === "plume" ? -Math.PI / 2 : 0,
        anchor: action === "plume" ? [-1, 0] : [0, 0],
        opacity: action === "plume" ? 0.9 : 1,
        keys: action === "plume" ? [
          { at: 0, scale: [0.12, 0.4] },
          { at: release / (release + 0.12), scale: [0.32, 0.8] },
          { at: 1, scale: [1, 1] }
        ] : action === "burst" ? [
          { at: 0, scale: [0.25, 0.25] },
          { at: 0.62, scale: [1.45, 1.45] },
          { at: 1, scale: [1, 1] }
        ] : void 0
      });
      const terminalTangent = dashPathTangent(plan, 1), terminalAngle = Math.atan2(terminalTangent[1], terminalTangent[0]);
      const terminalPosition = [plan.to[0] - 6, plan.to[1]];
      const dissipation = action === "dash" && !isBurst ? createDissipationPose2D({
        start: arrival,
        duration: isFire ? 0.38 : 0.3,
        position: terminalPosition,
        size: [23, 11],
        angle: terminalAngle,
        drift: [0, isFire ? -7 : -2],
        endScale: [0.55, 0.8]
      }) : void 0;
      const terminalTail = dissipation && !volumes ? motionTrail(
        (time) => generationSource2D(plan, time).position,
        arrival,
        0.14,
        12,
        release
      ) : [];
      const source = (birth, _id, u) => {
        const { position: [x, y] } = generationSource2D(plan, birth);
        return action === "plume" ? [x + (u - 0.5) * 20, y - (volumes ? 8 : 0)] : [x - 5, y + (u - 0.5) * 8];
      };
      const inheritedVelocity = (birth) => {
        const v = generationSource2D(plan, birth).velocity;
        return [v[0] * 0.32, v[1] * 0.32];
      };
      const emissionSource = action === "dash" ? { emissionFrame: (birth, _id, u) => {
        const state = dashBodyState(birth), surface = streamBody.sampleSurface(state, 0.25 + u * 0.5);
        const rear = [-Math.cos(state.angle), -Math.sin(state.angle)];
        return {
          position: [surface.position[0] - surface.normal[0] * 0.5, surface.position[1] - surface.normal[1] * 0.5],
          direction: [rear[0] * 0.75 + surface.normal[0] * 0.25, rear[1] * 0.75 + surface.normal[1] * 0.25],
          inheritedVelocity: inheritedVelocity(birth)
        };
      } } : { source, inheritedVelocity, angle: action === "plume" ? -Math.PI / 2 : Math.PI };
      const emission = {
        count: action === "burst" ? 0 : action === "plume" ? 240 : 180,
        seed: seed2,
        palette: hot,
        ...emissionSource,
        start: release,
        duration: sourceEmissionEnd - release,
        spread: action === "plume" ? 0.48 : 0.8,
        life: charged ? [0.12, 0.3] : action === "plume" ? [0.65, 1.15] : [0.28, 0.65],
        speed: charged ? action === "plume" ? [70, 125] : [45, 90] : action === "plume" ? [30, 70] : [28, 62],
        gravity: isFire ? -10 : 0,
        drag: 0.8
      };
      const chargedCores = charged ? createCinematicParticles2D({
        seed: (seed2 ^ 4127) >>> 0,
        count: action === "plume" ? 180 : 140,
        start: 0,
        duration: sourceEmissionEnd,
        palette: hot,
        style: "ember",
        size: [5.5, 9],
        endSize: 0.55,
        life: [0.14, 0.26],
        speed: action === "plume" ? [10, 30] : [0, 10],
        spread: 0.45,
        gravity: 0,
        drag: 0.8,
        opacity: 0.85,
        fadeStart: 0.65,
        emission: 0,
        emissionFrame: (birth, id, u) => {
          const source2 = generationSource2D(plan, birth), r = rng(seed2, id, 623), ignition2 = smooth(0, release, birth);
          const tangent = action === "plume" ? [0, -1] : dashPathTangent(plan, smooth(release, arrival, birth));
          const length = Math.hypot(...tangent), tx = tangent[0] / length, ty = tangent[1] / length;
          const along = r.range(-5, 5) * ignition2, across = (u - 0.5) * (action === "plume" ? 14 : 7) * ignition2;
          const y = source2.position[1] - (action === "plume" ? 7 : 0);
          const momentum = Math.min(0.95, 400 / (Math.hypot(...source2.velocity) || 1));
          return {
            position: [source2.position[0] + tx * along - ty * across, y + ty * along + tx * across],
            direction: [tx, ty],
            inheritedVelocity: [source2.velocity[0] * momentum, source2.velocity[1] * momentum]
          };
        }
      }) : void 0;
      const particleVolume = volumes ? createParticleVolume2D({
        seed: seed2,
        profile: material,
        palette: hot,
        emission: lightEnabled ? 0.035 : 0,
        lightRadius: 3
      }) : void 0;
      const ribbons = createCinematicParticles2D({
        ...emission,
        style: volumes ? "ember" : "ribbon",
        size: action === "plume" ? [3, 7] : volumes ? [3, 6.5] : [2, 4.8],
        ...volumes ? { flow: createCurlFlow2D({
          seed: (seed2 ^ 9103) >>> 0,
          scale: 22,
          strength: isFire ? 70 : 40,
          drift: action === "plume" ? [0, -24] : [24, -3]
        }) } : { curl: { amplitude: isFire ? 4.5 : 1.5, frequency: 1.25 } },
        trailSeconds: 0.18,
        emission: lightEnabled ? 0.035 : 0,
        layer: "back"
      });
      const sparkField = useSparkField && action !== "burst" ? createSparkField2D({
        seed: (seed2 ^ 771) >>> 0,
        palette: C,
        count: flightSparkCount,
        start: release,
        duration: sourceEmissionEnd - release,
        life: [0.32, 0.95],
        speed: action === "plume" ? [55, 160] : [38, 130],
        width: [0.9, 2.2],
        drag: [0.45, 1.6],
        gravity: 26,
        spread: action === "plume" ? 1.6 : 1.9,
        shutter: 0.042,
        maxLength: 8,
        light: lightEnabled,
        lightStrength: fireSparkLight,
        lightBudget: flightSparkLights,
        finish: fireSparkFinish,
        emissionFrame: (birth, id, u) => {
          if (action === "dash") return emissionSource.emissionFrame(birth, id, u);
          const [x, y] = source(birth, id, u);
          return { position: [x, y - 8], direction: [0, -1] };
        }
      }) : void 0;
      const sparks = sparkField ? void 0 : createCinematicParticles2D({
        ...emission,
        seed: seed2 ^ 771,
        count: emission.count,
        style: "spark",
        size: [0.5, 1.2],
        spread: action === "plume" ? 0.85 : 1.1,
        emission: lightEnabled ? 0.025 : 0,
        trailSeconds: 0.065
      });
      const eruption = rng(seed2, 8801), rotation = eruption.next();
      const sectors = [rotation, (rotation + eruption.range(0.28, 0.4)) % 1, (rotation + eruption.range(0.61, 0.76)) % 1];
      const burstSurfaceU = (u) => {
        const widths = isFire ? [0.16, 0.12, 0.08] : [0.11, 0.08, 0.06];
        const cuts = [0, 0.36, 0.6, 0.74];
        if (u >= cuts[3]) return (u - cuts[3]) / (1 - cuts[3]);
        const i = u < cuts[1] ? 0 : u < cuts[2] ? 1 : 2;
        return (sectors[i] + ((u - cuts[i]) / (cuts[i + 1] - cuts[i]) - 0.5) * widths[i] + 1) % 1;
      };
      const burstEmissionFrame = (birth, _id, u) => {
        const surface = burstBody.sampleSurface(burstBodyState(birth), burstSurfaceU(u));
        const motion = 0.12 * 33 * 11 * Math.exp(-(birth - arrival) * 11);
        return {
          position: [surface.position[0] - surface.normal[0] * 0.5, surface.position[1] - surface.normal[1] * 0.5],
          direction: surface.normal,
          inheritedVelocity: [surface.normal[0] * motion, surface.normal[1] * motion]
        };
      };
      const burstSparkField = useSparkField && isBurst ? createSparkField2D({
        seed: (seed2 ^ 2009) >>> 0,
        palette: C,
        count: responseSparkCount,
        start: arrival,
        duration: emissionEnd - arrival,
        emissionFrame: burstEmissionFrame,
        life: [0.24, 0.85],
        speed: [48, 130],
        width: [0.65, 1.5],
        drag: [1.6, 1.6],
        gravity: 20,
        spread: 0.65,
        shutter: 0.042,
        maxLength: 8,
        light: lightEnabled,
        lightStrength: fireSparkLight,
        lightBudget: responseSparkLights,
        finish: fireSparkFinish
      }) : void 0;
      const burst = burstSparkField ? void 0 : createCinematicParticles2D({
        count: isBurst ? 170 : 0,
        seed: seed2 ^ 2009,
        palette: hot,
        emissionFrame: burstEmissionFrame,
        spread: isFire ? 0.65 : 0.32,
        start: arrival,
        duration: isBurst ? emissionEnd - arrival : 0,
        life: [0.24, 0.85],
        speed: [48, 130],
        drag: 1.6,
        gravity: isFire ? 20 : 0,
        style: "spark",
        size: [0.65, 1.5],
        curl: { amplitude: isFire ? 2 : 0, frequency: 1 },
        trailSeconds: 0.065,
        emission: lightEnabled ? 0.065 : 0
      });
      const thermal = isFire && action === "plume" ? createThermalRibbon2D({
        seed: seed2 ^ 414,
        count: Math.ceil(18 * (sourceEmissionEnd - release)),
        start: release,
        duration: sourceEmissionEnd - release,
        palette: hot,
        life: [0.45, 0.85],
        width: [2.4, 5.2],
        length: [0.65, 1.2],
        curl: 3,
        split: 0.75,
        emission: lightEnabled ? 0.035 : 0,
        attachment: 0,
        velocity: [0, -12],
        buoyancy: [0, -32],
        source: (time, id, u) => {
          const x = (u - 0.5) * 20, y = plan.from[1], r = rng(seed2, id, 819), h = r.range(32, 58);
          const bend = Math.sin(time * 6 + r.range(0, TAU)) * 4;
          return [[x, y], [x + bend * 0.4, y - h * 0.3], [x - bend * 0.7, y - h * 0.65], [x + bend, y - h]];
        }
      }) : void 0;
      const visible2 = (layer) => layers[layer] !== false;
      const active = (t) => {
        if (!Number.isFinite(t)) throw new RangeError("Generation draw time must be finite");
        return t > 0 && t < end;
      };
      return {
        drawBack(p, t) {
          if (!active(t)) return;
          if (visible2("sparks") && sparkField) sparkField.draw(p, t, "back");
          if (visible2("response") && visible2("sparks") && burstSparkField) burstSparkField.draw(p, t, "back");
          if (visible2("trail")) {
            if (particleVolume) for (const sample of ribbons.sample(t)) {
              if (chargeBody) chargeBody.draw(p, {
                id: sample.id + 1,
                time: sample.age,
                position: [sample.x, sample.y],
                size: [sample.size * 2.2, sample.size * 1.6],
                angle: Math.atan2(sample.vy, sample.vx),
                opacity: sample.alpha,
                progress: sample.progress
              });
              else particleVolume.draw(p, sample);
            }
            else ribbons.draw(p, t, "back");
          }
          if (isBurst && isFire && visible2("residue") && t > arrival + 0.1) {
            const age = t - arrival, a = smooth(0.1, 0.3, age) * (1 - smooth(0.55, 1.18, age));
            for (let i = 0; i < 7; i++) {
              const r = rng(seed2, i, 419), angle = r.range(-Math.PI, 0), radius = 9 + age * 15;
              p.disc(
                plan.to[0] + Math.cos(angle) * radius,
                plan.to[1] + Math.sin(angle) * radius - age * 7,
                6 + age * 10,
                C[i % 2],
                a * 0.25
              );
            }
          }
        },
        draw(p, t) {
          if (!active(t)) return;
          const [x, y] = generationSource2D(plan, t).position;
          if (!charged && visible2("body") && t < release && action !== "plume") {
            const pose = ignition.sample(t);
            (action === "dash" ? streamBody : burstBody).draw(p, pose);
          }
          if (!charged && action === "dash" && t >= release && t < arrival && visible2("body")) {
            if (!volumes) {
              const tail = motionTrail((time) => generationSource2D(plan, time).position, t, 0.14, 12, release);
              drawTrail(p, tail, { color: C[2], head: C[4], width: 9, alpha: 0.85, light: 0 });
            }
            streamBody.draw(p, dashBodyState(t));
          }
          if (!charged && action === "plume" && visible2("body")) {
            const pose = ignition.sample(t);
            const fade = 1 - smooth(sourceEmissionEnd - 0.18, sourceEmissionEnd + 0.22, t);
            plumeBody.draw(p, { ...pose, opacity: pose.opacity * fade });
            if (thermal) thermal.draw(p, t);
          }
          if (visible2("response")) {
            if (isBurst && t >= arrival) {
              const age = t - arrival, [bx, by] = plan.to, fade = 1 - smooth(0.12, 0.5, age);
              if (age < 0.5) {
                burstBody.draw(p, { ...burstBodyState(t), opacity: fade });
                p.circle(bx, by, 7 * (1 - smooth(0, 0.15, age)), C[6], fade);
              }
              if (visible2("sparks")) {
                if (burstSparkField) burstSparkField.draw(p, t);
                else burst.draw(p, t);
              }
            } else if (dissipation && !charged) {
              const pose = dissipation.sample(t);
              if (pose) {
                const dx = pose.position[0] - terminalPosition[0], dy = pose.position[1] - terminalPosition[1];
                if (!volumes) drawTrail(
                  p,
                  terminalTail.map(([x2, y2]) => [x2 + dx, y2 + dy]),
                  { color: C[2], head: C[4], width: 9, alpha: 0.85 * pose.opacity, light: 0 }
                );
                streamBody.draw(p, pose);
              }
            }
          }
          if (chargeBody && chargedCores && visible2(t < sourceEmissionEnd ? "body" : "response")) {
            const chargePainter = action === "plume" ? { shade: (x0, y0, x1, y1, shader) => p.shade(x0, y0, x1, y1, (x2, y2, out) => {
              if (y2 <= plan.from[1]) return shader(x2, y2, out);
            }) } : p;
            for (const q of chargedCores.sample(t)) chargeBody.draw(chargePainter, {
              id: q.id + 1024,
              time: q.age,
              position: [q.x, q.y],
              size: [q.size * 2.2, q.size * 1.6],
              angle: action === "plume" ? -Math.PI / 2 : Math.atan2(q.vy, q.vx),
              opacity: q.alpha,
              progress: q.progress
            });
          }
          if (visible2("sparks")) {
            if (sparkField) sparkField.draw(p, t);
            else sparks.draw(p, t);
          }
          if (visible2("light")) {
            const charge = action === "plume" ? smooth(0, release, t) * (1 - smooth(release, release + 0.12, t)) : t < release ? smooth(0, release, t) : 0;
            const head = action === "dash" && t >= release && t < arrival ? 1 : action === "plume" ? smooth(release, release + 0.12, t) * (1 - smooth(sourceEmissionEnd, sourceEmissionEnd + 0.15, t)) : 0;
            if (charge + head > 0) p.glow(x, y, 22, C[4], (charge + head) * 0.22);
            const ending = dissipation?.sample(t);
            if (ending && !charged) p.glow(ending.position[0] + 6, ending.position[1], 22, C[4], ending.opacity ** 2 * 0.22);
            if (isBurst && t >= arrival) p.glow(plan.to[0], plan.to[1], 42, C[4], (1 - smooth(0, 0.42, t - arrival)) * 0.55);
          }
        }
      };
    }
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
    else if (raw.kind === "generation") {
      if (Object.keys(raw).some((key) => !["kind", "intent", "renderOptions"].includes(key)))
        throw new RangeError("Unknown generation sequence source field");
      const intent = object(raw.intent, "Generation cue intent");
      if (Object.hasOwn(intent, "seed")) throw new RangeError("Generation cue seed belongs on cue.seed, not source.intent.seed");
      const plan = createGenerationPlan2D(intent);
      createGeneratedEffect2D(plan, raw.renderOptions);
      const { seed: _seed, ...meaning } = plan.intent;
      source = {
        kind: "generation",
        intent: meaning,
        ...raw.renderOptions === void 0 ? {} : { renderOptions: { ...raw.renderOptions } }
      };
    } else if (raw.kind === "character") {
      if (raw.clip !== void 0 && (typeof raw.clip !== "string" || !raw.clip)) throw new TypeError("Character cue clip must be text");
      source = { kind: "character", character: object(raw.character, "Character cue asset"), ...raw.clip === void 0 ? {} : { clip: raw.clip } };
    } else throw new RangeError("Sequence sources must be catalog, recipe, generation or character assets");
    let eventAnchor;
    if (c.eventAnchor !== void 0) {
      const a = object(c.eventAnchor, "Sequence event anchor");
      if (source.kind !== "generation") throw new RangeError("Event anchors require a generation target");
      if (Object.keys(a).some((key) => !["cue", "event", "targetEvent"].includes(key)) || ![a.cue, a.event, a.targetEvent].every((v) => typeof v === "string" && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(v)))
        throw new RangeError("Event anchor needs cue, event and targetEvent identifiers only");
      eventAnchor = { cue: a.cue, event: a.event, targetEvent: a.targetEvent };
    }
    const options = { ...object(c.options ?? {}, "Sequence cue options") };
    if (eventAnchor && ["x", "y"].some((key) => Object.hasOwn(options, key)))
      throw new RangeError("Anchored cue x/y offsets belong on the cue, not options");
    const x = finite(c.x ?? options.x, 0, -65536, 65536, "x"), y = finite(c.y ?? options.y, 0, -65536, 65536, "y");
    const angle = finite(c.angle ?? options.angle, 0, -1e6, 1e6, "angle");
    const flip = boolean(c.flip ?? options.flip, false, "flip"), selectedSeed = seed(c.seed ?? options.seed);
    for (const key of ["x", "y", "angle", "flip", "seed"]) delete options[key];
    const at = finite(c.at, 0, eventAnchor ? -3600 : 0, 3600, eventAnchor ? "event time offset" : "start");
    const duration2 = c.duration === void 0 ? void 0 : finite(c.duration, 1, 1e-6, 3600, "cue duration");
    return {
      id: c.id,
      source,
      at,
      ...eventAnchor ? { eventAnchor } : {},
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
  const smooth2 = (n) => {
    const u = Math.max(0, Math.min(1, n));
    return u * u * (3 - 2 * u);
  };
  return (cue.fadeIn ? smooth2((time - cue.at) / cue.fadeIn) : 1) * (cue.fadeOut ? smooth2((end - time) / cue.fadeOut) : 1);
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
function anchorCues(loaded) {
  const byId = new Map(loaded.map((source) => [source.cue.id, source]));
  const state = /* @__PURE__ */ new Map();
  const plans = /* @__PURE__ */ new Map();
  const eventFor = (source, name) => {
    if (source.cue.source.kind !== "generation") throw new RangeError("Event anchors require generation sources and targets");
    let plan = plans.get(source.cue.id);
    if (!plan) {
      plan = createGenerationPlan2D(source.cue.source.intent);
      plans.set(source.cue.id, plan);
    }
    const matches = plan.events.filter((event2) => event2.id === name);
    if (matches.length !== 1) throw new RangeError(`Event anchor ${source.cue.id}/${name} must identify exactly one generation event`);
    const event = matches[0];
    if (![event.at, event.payload.x, event.payload.y].every(Number.isFinite) || event.at < 0 || event.at > source.mod.meta.duration)
      throw new RangeError(`Invalid generation event point ${source.cue.id}/${name}`);
    return event;
  };
  const resolve = (source) => {
    const { cue } = source;
    if (state.get(cue.id) === "done") return;
    if (state.get(cue.id) === "visiting") throw new RangeError(`Sequence event anchor cycle at ${cue.id}`);
    state.set(cue.id, "visiting");
    if (cue.eventAnchor) {
      const anchor = cue.eventAnchor, upstream = byId.get(anchor.cue);
      if (!upstream) throw new RangeError(`Missing event anchor cue ${anchor.cue}`);
      resolve(upstream);
      const from = eventFor(upstream, anchor.event), to = eventFor(source, anchor.targetEvent);
      const a = upstream.cue;
      const [sx, sy] = transformPixelPoint2D(pixelTransform2D(a.x, a.y, a.angle, a.flip), [from.payload.x, from.payload.y]);
      const [tx, ty] = transformPixelPoint2D(pixelTransform2D(0, 0, cue.angle, cue.flip), [to.payload.x, to.payload.y]);
      const rawAt = a.at + from.at - to.at + cue.at;
      const roundoff = 2 * Number.EPSILON * (Math.abs(a.at) + Math.abs(from.at) + Math.abs(to.at) + Math.abs(cue.at));
      const at = rawAt < 0 && rawAt >= -roundoff ? 0 : rawAt;
      if (at < 0) throw new RangeError(`Event anchor ${cue.id} starts before zero; delay the upstream cue or change the explicit offset to preserve preparation`);
      source.cue = {
        ...cue,
        at: finite(at, 0, 0, 3600, "resolved start"),
        x: finite(sx - tx + cue.x, 0, -65536, 65536, "resolved x"),
        y: finite(sy - ty + cue.y, 0, -65536, 65536, "resolved y")
      };
      source.end = source.cue.at + (source.end - cue.at);
    }
    state.set(cue.id, "done");
  };
  for (const source of loaded) resolve(source);
}
function validateAnchorWindows(loaded, duration, loop) {
  const byId = new Map(loaded.map((source) => [source.cue.id, source]));
  for (const target of loaded) {
    const anchor = target.cue.eventAnchor;
    if (!anchor) continue;
    for (const [source, name] of [[byId.get(anchor.cue), anchor.event], [target, anchor.targetEvent]]) {
      const event = createGenerationPlan2D(source.cue.source.intent).events.find((e) => e.id === name);
      const times = sourceTimes(source, event.at).filter((at) => !loop || at < duration - 1e-9);
      if (times.length !== 1) throw new RangeError(`Event anchor ${source.cue.id}/${name} is outside the cue or sequence window`);
    }
  }
}
async function createSequenceEffect(input, loader = loadCatalogEffect, fps = 30) {
  if (!Number.isFinite(fps) || fps < 1 || fps > 240) throw new RangeError("Sequence fps must be in [1, 240]");
  const spec = resolveSequence(input);
  const loaded = await Promise.all(spec.cues.map(async (cue) => {
    const mod = cue.source.kind === "catalog" ? await loader(cue.source.id) : cue.source.kind === "recipe" ? createRecipeEffect(cue.source.recipe) : cue.source.kind === "generation" ? createGeneratedEffect2D(createGenerationPlan2D(cue.source.intent), cue.source.renderOptions) : createCharacterEffect(cue.source.character, cue.source.clip, fps);
    const meta2 = mod.meta;
    if (!meta2 || !Number.isFinite(meta2.duration) || meta2.duration <= 0 || meta2.duration > 3600)
      throw new RangeError(`Sequence cue ${cue.id} needs a positive finite source duration`);
    exportLayout2D(meta2.size, meta2.origin, cue);
    const window = cue.duration ?? meta2.duration, span = meta2.loop ? window : Math.min(window, meta2.duration);
    return { cue, mod, end: cue.at + span };
  }));
  anchorCues(loaded);
  const duration = spec.duration ?? (loaded.length ? Math.max(...loaded.map((c) => c.end)) : 1);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 3600) throw new RangeError("Sequence duration must be in (0, 3600]");
  for (const source of loaded) source.end = Math.min(source.end, duration);
  validateAnchorWindows(loaded, duration, spec.loop);
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
      let presentationTime = 0, cycle = 0;
      const cues = loaded.filter((c) => visible(c.cue, options)).map(({ cue, mod, end }) => {
        const eventTimes = cue.source.kind === "generation" ? new Map(createGenerationPlan2D(cue.source.intent).events.map((event) => [cue.at + event.at, event.at])) : void 0;
        const drawTime = (fallback) => {
          for (const [at, local] of eventTimes ?? [])
            if (presentationTime === cycle * duration + at) return local;
          return fallback;
        };
        const fx = eventTimes ? { ...mod, create(childOptions) {
          const impl = mod.create(childOptions);
          return {
            ...impl,
            draw: (p, time, o) => impl.draw(p, drawTime(time), o),
            ...impl.drawBack ? { drawBack: (p, time, o) => impl.drawBack(p, drawTime(time), o) } : {}
          };
        } } : mod;
        return { ...cueOptions(cue, options), fx, t: cue.at, until: Math.max(cue.at, end), fadeIn: cue.fadeIn, fadeOut: cue.fadeOut };
      });
      const factory = chain(cues);
      let scheduler = factory(options);
      return {
        advanceTime(time) {
          const { time: local, cycle: nextCycle } = clock(time);
          presentationTime = time;
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
    const key = `${frameIndex}:${time}:${finish}:${purpose}`, previous = useCache ? cache.get(key) : void 0;
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
  createGenerationPlan2D,
  createGeneratedEffect2D,
  createSequenceSpec,
  projectCinematicOptions,
  createProjectRuntime
};
