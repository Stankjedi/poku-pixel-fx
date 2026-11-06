import {
  colorAt,
  eyes,
  shape
} from "./chunk-USHR3WAZ.js";
import {
  band
} from "./chunk-ZHMERMWE.js";
import "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-Z52ZYDDH.js";
import {
  Rng,
  TAU,
  WHITE,
  clamp,
  fit,
  hex,
  luma,
  mix,
  smooth
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/status/poisoned.ts
var meta = {
  name: "Poisoned",
  desc: "Sick to the bone: green rolls up the body in waves, dark veins creep from a wound, toxic sweat drips and hisses; every 0.8 s it wobbles, blisters pop and a ring pulses out.",
  tags: ["status", "poison", "toxic", "dot", "debuff", "sick", "loop"],
  size: [72, 64],
  origin: [36, 54],
  duration: 1.6,
  loop: true,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { palette: ["#0e1d14", "#173320", "#23552e", "#318232", "#55b92f", "#8eea3f", "#cfff63", "#f6ffc2"], veins: "#2c1a3a", seed: 5 }
};
var SICK = { turn: 0.8, crouch: 4, lean: 4, hy: 1, fx: 2, fy: -20, bx: 8, by: -14, ffx: 3, fbx: -3 };
var act = {
  onBody: true,
  poses: [[0, { ...SICK, x: -1, crouch: 5, lean: 5 }], [0.2, { ...SICK, x: 0 }], [0.5, { ...SICK, x: 1 }], [0.8, { ...SICK, x: 1, crouch: 5, lean: 5 }], [1, { ...SICK, x: 0 }], [1.3, { ...SICK, x: -1 }], [1.6, { ...SICK, x: -1, crouch: 5, lean: 5 }]]
};
var D = meta.duration;
var TICK = 0.8;
var G = 760;
var since = (t) => (t % TICK + TICK) % TICK;
var actorAlpha = () => 0;
var BODIES = /* @__PURE__ */ new WeakMap();
function body(a, seed) {
  let m = BODIES.get(a.mask);
  if (!m) BODIES.set(a.mask, m = /* @__PURE__ */ new Map());
  if (m.has(seed)) return m.get(seed);
  const S = shape(a), H = S.h, W = S.w, R = new Rng(seed * 7 + 3);
  const [l, r] = S.rows[Math.round(H * 0.6)], wx = r - 1, wy = Math.round(H * 0.6);
  const veins = [];
  const walk = (x, y, ang, len, depth) => {
    const pts = [];
    for (let s = 0; s < len; s++) {
      ang += R.range(-0.5, 0.5);
      x += Math.cos(ang);
      y += Math.sin(ang);
      if (!S.on(Math.round(x), Math.round(y))) break;
      pts.push([Math.round(x), Math.round(y), s / len]);
      if (depth < 2 && s > 2 && R.chance(0.16)) walk(x, y, ang + R.sign() * R.range(0.6, 1.1), len * 0.55, depth + 1);
    }
    veins.push(pts);
  };
  for (let i = 0; i < 4; i++) walk(wx, wy, Math.PI + (i / 4 - 0.45) * 2.2, 11, 0);
  const lum = (x, y) => luma(colorAt(a, x, y));
  const skin = S.body.filter(([x, y]) => lum(x, y) > 0.55 && S.on(x - 1, y) && S.on(x + 1, y));
  const pick = (list) => list[Math.floor(R.next() * list.length)];
  const blisters = [0, 1].map(() => [0, 1, 2].map(() => {
    const [x, y] = pick(S.body.filter(([x2, y2]) => y2 > 4 && S.on(x2 - 1, y2) && S.on(x2 + 1, y2) && S.on(x2, y2 - 1)));
    return { x, y, r: R.range(1.1, 1.8) };
  }));
  const E = eyes(a), sweat = [];
  for (const e of E) sweat.push([e.x0 < W / 2 ? e.x0 - 1 : e.x1 + 1, e.y0 - 1]);
  for (const side of [-1, 1]) {
    const hand = S.body.filter(([x, y]) => y > H * 0.5 && y < H * 0.7 && (side < 0 ? x <= l + 1 : x >= r - 1) && !S.on(x, y + 1));
    if (hand.length) sweat.push(hand[0]);
  }
  if (!sweat.length) sweat.push(pick(skin.length ? skin : S.body));
  const out = { veins, wound: [wx, wy], blisters, sweat };
  m.set(seed, out);
  return out;
}
function offsets(t, H) {
  const lean = 1.3 * Math.sin(t / D * TAU), ph = since(t), wob = ph < 0.12;
  const w = wob ? Math.sin(ph / 0.12 * Math.PI) : 0;
  return (my) => Math.round(lean * (1 - my / H) + w * Math.sin(my * 0.42 + ph * 40));
}
function drawBack(p, t, o) {
  const P = fit(o.palette, 8), ph = since(t);
  const k = ph / 0.55;
  if (k < 1) band(p, 0, 0, 5 + 22 * Math.sqrt(k), 0.18, Math.max(1, 2.5 * (1 - k)), 1 - k, [P[3], P[4], P[5], P[6]], (g) => Math.sin(g) < 0);
  p.shade(-28, -3, 28, 6, (x, y, out) => {
    const d = Math.hypot(x / 24, (y - 0.5) / 4);
    if (d < 1) out.l = P[4], out.k = (0.14 + 0.2 * Math.exp(-ph / 0.2)) * (1 - d) * (1 - d);
  });
}
function draw(p, t, o) {
  const P = fit(o.palette, 8), a = o.actor, S = shape(a), H = S.h, B = body(a, o.seed), off = offsets(t, H), ph = since(t), tick = Math.floor(t / TICK) % 2;
  const vein = hex(o.veins);
  for (const [mx, my] of S.body) {
    const c = colorAt(a, mx, my), l = luma(c), wave = 0.5 + 0.5 * Math.sin(TAU * (my / H * 1.6 + t / D * 2));
    const sick = P[clamp(1 + Math.round(l * 6.2), 1, 7)], k2 = 0.22 + 0.4 * wave * wave;
    p.px(a.x + mx + off(my), a.y + my, mix(c, wave > 0.85 && l > 0.4 ? mix(sick, P[6], 0.3) : sick, k2));
  }
  const grow = smooth(0, D * 0.55, t) * (1 - smooth(D * 0.62, D, t)) * 1.15;
  for (const pts of B.veins)
    for (const [x, y, u] of pts) if (u < grow) p.px(a.x + x + off(y), a.y + y, u > grow - 0.12 ? P[2] : vein);
  const [wx, wy] = B.wound;
  p.px(a.x + wx + off(wy), a.y + wy, P[6]);
  p.px(a.x + wx + off(wy) - 1, a.y + wy, P[3]);
  p.glow(a.x + wx, a.y + wy, 6, P[5], 0.3);
  for (const bl of B.blisters[tick]) {
    const x = a.x + bl.x + off(bl.y), y = a.y + bl.y, grow2 = clamp(ph / 0.16), pop = ph > 0.38;
    if (!pop) {
      const r = bl.r * grow2;
      p.circle(x, y, r + 0.6, P[3]);
      p.circle(x - 0.2, y - 0.2, r, P[5]);
      if (r > 0.8) p.px(x - 0.5, y - 0.8, WHITE);
      p.glow(x, y, 4, P[5], 0.3 * grow2);
    } else if (ph < 0.56) {
      const k2 = (ph - 0.38) / 0.18;
      for (let j = 0; j < 6; j++) {
        const an = j / 6 * TAU + bl.x, d = bl.r + 0.5 + k2 * 3.5;
        p.dot(x + Math.cos(an) * d, y + Math.sin(an) * d - k2 * 2, j % 2 ? P[6] : P[5], 1.2 - k2);
      }
      p.glow(x, y, 6, P[6], 0.4 * (1 - k2));
    }
  }
  B.sweat.forEach(([sx, sy], i) => {
    const per = D / 2, age = ((t - i * 0.37) % per + per) % per, gather = 0.35;
    const x = a.x + sx + 0.5 + off(sy), y0 = a.y + sy;
    if (age < gather) {
      const k3 = age / gather, run = Math.round(k3 * 2);
      p.px(x, y0 + run, k3 > 0.5 ? P[6] : P[5]);
      if (k3 > 0.5) p.px(x, y0 + run - 1, P[4]);
      return;
    }
    const f = age - gather, fallH = -1 - (y0 + 2), tf = Math.sqrt(2 * Math.max(1, fallH) / G);
    if (f < tf) {
      const y = y0 + 2 + 0.5 * G * f * f;
      p.line(x, y - Math.min(3, G * f * 0.012), x, y, P[4]);
      p.px(x, y, P[6]);
      return;
    }
    const h = f - tf;
    if (h > 0.4) return;
    const k2 = h / 0.4;
    p.line(x - 1 - k2 * 2, -1, x + 1 + k2 * 2, -1, P[k2 < 0.4 ? 6 : 4], 1.2 - k2);
    for (let j = 0; j < 3; j++) p.dot(x + (j - 1) * (2 + 3 * k2), -2 - j % 2 - 5 * k2 * (1 - k2), P[6], 1 - k2);
    p.disc(x + Math.sin(k2 * 6) * 1.5, -3 - k2 * 6, 1 + 1.5 * k2, P[5], 0.35 * (1 - k2));
    p.glow(x, -1.5, 5, P[5], 0.35 * (1 - k2));
  });
  const k = ph / 0.55;
  if (k < 1) band(p, 0, 0, 5 + 22 * Math.sqrt(k), 0.18, Math.max(1, 2.5 * (1 - k)), 1 - k, [P[3], P[4], P[5], P[6]], (g) => Math.sin(g) >= 0);
  p.glow(0, a.y + H * 0.45, 26, P[4], 0.14 + 0.2 * Math.exp(-ph / 0.18));
}
export {
  act,
  actorAlpha,
  draw,
  drawBack,
  meta
};
