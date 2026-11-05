import {
  bayer,
  floorRing,
  glyph
} from "./chunk-BR2EE65Y.js";
import {
  Lights,
  P,
  Particles,
  band,
  flare,
  sparkle
} from "./chunk-BIQMVPKA.js";
import {
  PAL,
  Rng,
  TAU,
  WHITE,
  clamp,
  ease,
  fit,
  fract,
  noise2,
  smooth
} from "./chunk-FEXYTCCO.js";
import {
  __export
} from "./chunk-WSFCRVEQ.js";

// src/fx/arcane/magic-circle-cast.ts
var magic_circle_cast_exports = {};
__export(magic_circle_cast_exports, {
  create: () => create,
  meta: () => meta
});
var R = 40;
var R2 = 35;
var RI = 24;
var RR = 30;
var SY = 0.3;
var TOP = 192;
var W = 11;
var NRUNE = 8;
var PEN = [0.04, 0.42];
var PEN2 = [0.1, 0.48];
var INNER = [0.3, 0.6];
var STAR = [0.52, 0.88];
var RUNES = [0.9, 1.3];
var FLASH = 1.52;
var BREAK = 2.42;
var GONE = 3.45;
var END = 3.9;
var meta = {
  name: "Magic circle cast",
  desc: "A circle draws itself on the floor, runes ignite one by one, it flashes, and a column of light fires up and breaks apart into glints.",
  tags: ["arcane", "magic", "circle", "rune", "cast", "column", "summon", "ground", "one-shot"],
  size: [200, 220],
  origin: [100, 192],
  duration: END,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: PAL.arcane, seed: 6 }
};
var wrap = (a) => (a % TAU + TAU) % TAU;
var fromFront = (g) => Math.abs(Math.atan2(Math.sin(g - Math.PI / 2), Math.cos(g - Math.PI / 2)));
var outerAt = (g, w) => w[0] + fromFront(g) / Math.PI * (w[1] - w[0]);
var innerAt = (g) => INNER[0] + wrap(g + Math.PI / 2) / TAU * (INNER[1] - INNER[0]);
var runeAngle = (k) => -Math.PI / 2 + (k + 0.5) * TAU / NRUNE;
var runeLit = (k) => RUNES[0] + k * (RUNES[1] - RUNES[0]) / (NRUNE - 1);
var runeOut = (k) => BREAK + 0.2 + k * 0.08;
function level(t) {
  if (t < RUNES[0]) return 0.55;
  if (t < FLASH) return 0.55 + 0.4 * smooth(RUNES[0], FLASH, t);
  if (t < FLASH + 0.07) return 1.2;
  if (t < BREAK) return 0.92;
  return 0.92 * (1 - smooth(BREAK, GONE, t));
}
function create(o) {
  const C = fit(o.palette, 8), S = o.seed, Rg = new Rng(S);
  const ps = new Particles({ rng: Rg, ground: () => 0, sparks: [WHITE, C[6], C[5], C[4]] }), lights = new Lights();
  const COL = [WHITE, C[6], C[5], C[4], C[3]];
  const strands = Array.from({ length: 9 }, () => ({ o: Rg.range(-0.85, 0.85), w: Rg.range(0.04, 0.1), f: Rg.range(1, 3) }));
  const tri = (a0) => [0, 1, 2].map((k) => a0 + k * TAU / 3).map((a) => [Math.cos(a) * RI, Math.sin(a) * RI]);
  const A = tri(-Math.PI / 2), Bt = tri(Math.PI / 2), edges = [];
  for (let k = 0; k < 3; k++)
    for (const T of [A, Bt]) edges.push({ p0: T[k], p1: T[(k + 1) % 3], t0: STAR[0] + k * (STAR[1] - STAR[0]) / 3, dur: (STAR[1] - STAR[0]) / 3 });
  let t = 0, flashed = false, broke = false;
  const out = new Array(NRUNE).fill(false);
  const lineCol = (lvl, age) => age < 0.05 ? WHITE : age < 0.16 ? C[6] : lvl > 1 ? WHITE : lvl > 0.8 ? C[6] : lvl > 0.45 ? C[5] : lvl > 0.28 ? C[4] : C[3];
  const lineA = (lvl) => clamp(lvl / 0.3);
  function planeLine(p, p0, p1, t0, dur, lvl, far) {
    const s = clamp((t - t0) / dur);
    if (s <= 0) return;
    let u0 = 0, u1 = s;
    const v0 = p0[1], v1 = p1[1];
    if (v0 < 0 !== v1 < 0) {
      const uc = v0 / (v0 - v1);
      if (v0 < 0 === far) u1 = Math.min(u1, uc);
      else u0 = uc;
    } else if (v0 < 0 !== far) return;
    if (u1 <= u0) return;
    const P2 = (u) => [p0[0] + (p1[0] - p0[0]) * u, (v0 + (v1 - v0) * u) * SY];
    const [xa, ya] = P2(u0), [xb, yb] = P2(u1);
    p.line(xa, ya, xb, yb, (q) => lineCol(lvl, t - (t0 + (u0 + (u1 - u0) * q) * dur)), lineA(lvl));
  }
  function circle(p, far) {
    if (t >= GONE) return;
    const lvl = level(t), keep = far ? (g) => Math.sin(g) < 0 : (g) => Math.sin(g) >= 0, a = lineA(lvl);
    const ring = (r, when, chase2) => floorRing(p, 0, 0, r, SY, (g) => chase2 && chase2(g) ? WHITE : lineCol(lvl, t - when(g)), (g) => t < when(g) ? 0 : a, keep);
    const run = t > RUNES[0] && t < BREAK ? (t - RUNES[0]) * 5 + (t - RUNES[0]) ** 2 * 4 : null;
    const chase = run === null ? null : (g) => [0, Math.PI].some((o2) => Math.abs(Math.atan2(Math.sin(g - run - o2), Math.cos(g - run - o2))) < 0.22);
    ring(R, (g) => outerAt(g, PEN), chase);
    ring(R2, (g) => outerAt(g, PEN2));
    ring(RI, innerAt);
    for (let j = 0; j < 32; j++) {
      const g = (j + 0.5) * TAU / 32;
      if (Math.sin(g) < 0 !== far) continue;
      const when = outerAt(g, PEN2) + 0.03;
      if (t < when) continue;
      p.line(Math.cos(g) * R2, Math.sin(g) * R2 * SY, Math.cos(g) * R, Math.sin(g) * R * SY, lineCol(lvl, t - when), a * (j % 2 ? 0.6 : 1));
    }
    for (const e of edges) planeLine(p, e.p0, e.p1, e.t0, e.dur, lvl, far);
  }
  function runes(p, far) {
    for (let k = 0; k < NRUNE; k++) {
      const g = runeAngle(k);
      if (Math.sin(g) < 0 !== far) continue;
      const x = Math.cos(g) * RR, y0 = Math.sin(g) * RR * SY, lit = t - runeLit(k), gone = clamp((t - runeOut(k)) / 0.25);
      if (t < innerAt(g) || gone >= 1) continue;
      if (lit < 0) {
        glyph(p, k, x, y0 - 1, C[3]);
        continue;
      }
      const rise = 3 * ease.outBack(clamp(lit / 0.2), 2.4), bob = lit > 0.2 ? Math.sin(t * 5 + k) * 0.5 : 0, y = y0 - 1 - rise + bob;
      const hot = lit < 0.07 || t > FLASH && t < FLASH + 0.07, lvl = level(t);
      glyph(p, k, x, y, hot ? WHITE : lvl > 0.8 ? WHITE : C[6], 1 - gone, hot ? C[6] : C[4]);
      if (lit < 0.1) sparkle(p, x, y - 2, 4 * (1 - lit / 0.1) + 1, C[6], C[5], 0.5);
      p.glow(x, y - 2, 8, C[5], (0.3 + 0.3 * lvl) * (1 - gone));
      p.glow(x, y0, 6, C[4], 0.2 * (1 - gone));
    }
  }
  function column(p) {
    if (t < FLASH - 0.22 || t > BREAK + 0.6) return;
    if (t < FLASH) {
      const a = smooth(FLASH - 0.22, FLASH - 0.04, t), top2 = -(TOP - 10) * ease.outCubic(a);
      for (let y = -1; y >= top2; y--) p.dot(0, y, y > top2 + 6 ? C[6] : WHITE, a * (0.35 + 0.65 * (1 + y / TOP)));
      p.glow(0, top2, 9, C[6], 0.5 * a);
      p.glow(0, -6, 24, C[5], 0.4 * a);
      return;
    }
    const u = t - FLASH, brk = clamp((t - BREAK) / 0.45), top = -TOP * ease.outExpo(clamp(u / 0.09));
    const w = t < BREAK ? W * (1 + 0.38 * Math.exp(-u * 9)) : W * (1 - ease.outCubic(brk) * 0.85);
    const fade = 1 - smooth(BREAK + 0.25, BREAK + 0.55, t), white = u < 0.067;
    if (fade <= 0) return;
    for (let y = 3; y >= Math.ceil(top); y--) {
      const h = -y, ww = w * (1 + 0.5 * Math.exp(-Math.max(0, h) / 6)), pulse = fract(h * 0.022 - u * 2.6) < 0.07 ? 1 : 0;
      for (let x = Math.floor(-ww * 1.3); x <= Math.ceil(ww * 1.3); x++) {
        const q = Math.abs(x + 0.5) / ww;
        if (brk > 0 && noise2(x * 0.32, h * 0.11 - (t - BREAK) * 6, S) * 0.5 + 0.5 < brk * 1.25 - 0.1) continue;
        let lv = q < 0.2 ? 0 : q < 0.42 ? 1 : q < 0.66 ? 2 : q < 0.88 ? 3 : 4;
        for (const s of strands) if (Math.abs((x + 0.5) / ww - s.o - 0.05 * Math.sin(t * s.f + s.o * 9)) < s.w) lv = Math.max(0, lv - 1);
        lv = white ? 0 : Math.max(0, lv - pulse);
        const a = (q < 0.88 ? 1 : (1.3 - q) / 0.42) * fade;
        if (a <= bayer(x, y) * (q < 0.66 ? 0.2 : 1)) continue;
        p.px(x, y, COL[lv]);
      }
      if ((h & 7) === 0 && h < TOP - ww * 2.4 - 8) p.glow(0, y, ww * 2.4 + 6, C[5], 0.3 * fade);
    }
    for (let i = 0; i < 6; i++) {
      const k = (t - (FLASH + 0.08 + i * 0.16)) / 0.8;
      if (k < 0 || k > 1) continue;
      const rx = w * 1.4 * (1 + k * 0.35), ry = rx * 0.3, yc = -3 - ease.outQuad(k) * 120, n = Math.ceil(rx * 7);
      for (let j = 0; j < n; j++) {
        const g = j / n * TAU;
        p.dot(Math.cos(g) * rx, yc + Math.sin(g) * ry, k < 0.3 ? WHITE : C[6], (1 - k) * fade * (Math.sin(g) < 0 ? 0.6 : 1));
      }
    }
    p.glow(0, -4, 34, C[6], 0.45 * fade);
    p.glow(0, -60, 70, C[4], 0.25 * fade);
  }
  function shock(p, far) {
    for (const [d, r0, r1, th, dur] of [[0, R * 0.6, R * 2, 6, 0.5], [0.08, R * 0.4, R * 1.4, 3, 0.4]]) {
      const k = (t - FLASH - d) / dur;
      if (k < 0 || k >= 1) continue;
      band(p, 0, 0, r0 + (r1 - r0) * ease.outCubic(k), SY, Math.max(1, th * (1 - k)), 1.15 - k, [C[3], C[5], C[6], WHITE], (g) => Math.sin(g) < 0 === far, k < 0.2);
    }
  }
  return {
    update(dt) {
      t += dt;
      if (t > PEN[0] && t < STAR[1] && Rg.chance(0.5)) {
        let x, y;
        if (t < PEN[1]) {
          const g = Math.PI / 2 + Rg.sign() * ((t - PEN[0]) / (PEN[1] - PEN[0])) * Math.PI;
          x = Math.cos(g) * R, y = Math.sin(g) * R * SY;
        } else if (t < INNER[1]) {
          const g = -Math.PI / 2 + (t - INNER[0]) / (INNER[1] - INNER[0]) * TAU;
          x = Math.cos(g) * RI, y = Math.sin(g) * RI * SY;
        } else {
          const e = Rg.pick(edges.filter((e2) => t >= e2.t0 && t < e2.t0 + e2.dur)) ?? edges[0], s = clamp((t - e.t0) / e.dur);
          x = e.p0[0] + (e.p1[0] - e.p0[0]) * s, y = (e.p0[1] + (e.p1[1] - e.p0[1]) * s) * SY;
        }
        ps.spawn(P.EMBER, x, y - 1, Rg.range(-12, 12), Rg.range(-30, -8), Rg.range(0.25, 0.55), C[6], 1);
      }
      if (t > RUNES[1] - 0.1 && t < FLASH - 0.05 && Rg.chance(0.7)) {
        const g = Rg.range(0, TAU), D = Rg.range(R * 0.7, R * 1.1), T = Rg.range(0.16, 0.24), v = D * 3 / (Math.exp(3 * T) - 1);
        const x = Math.cos(g) * D, y = Math.sin(g) * D * SY - 1, l = Math.hypot(x, y + 2) || 1;
        ps.spawn(P.STREAK, x, y, -x / l * v, (-2 - y) / l * v, T, Rg.chance(0.5) ? C[6] : C[5]);
      }
      if (!flashed && t >= FLASH) {
        flashed = true;
        lights.add(0, -56, 104, C[5], 0.9, 0.6);
        lights.add(0, -5, 36, WHITE, 0.8, 0.14);
        for (let i = 0; i < 36; i++) {
          const s = Rg.sign(), sp = Rg.range(80, 175);
          ps.spawn(P.SPARK, s * Rg.range(0, R * 0.5), -1, s * sp, -Rg.range(30, 180), Rg.range(0.25, 0.7));
        }
        for (let i = 0; i < 26; i++)
          ps.spawn(P.STAR, Rg.range(-R, R), -Rg.range(1, 6), Rg.range(-20, 20), -Rg.range(40, 130), Rg.range(0.5, 1.1), Rg.pick([WHITE, C[6], C[5]]), Rg.range(0.8, 2.3));
        for (let i = 0; i < 34; i++) {
          const s = Rg.sign();
          ps.spawn(P.STAR, s * Rg.range(0, 14), -Rg.range(1, 4), s * Rg.range(50, 140), -Rg.range(10, 90), Rg.range(0.4, 0.95), Rg.pick([WHITE, C[6], C[6], C[5]]), Rg.range(0.7, 2.2));
        }
      }
      if (t > RUNES[0] && t < BREAK + 0.2 && Rg.chance(0.12)) {
        const g = Rg.range(0, TAU), r = Rg.pick([R, R2, RI]);
        ps.spawn(P.STAR, Math.cos(g) * r, Math.sin(g) * r * SY - 0.5, 0, -Rg.range(2, 8), Rg.range(0.25, 0.45), Rg.pick([WHITE, C[6]]), Rg.range(0.8, 2));
      }
      if (t > FLASH && t < BREAK) {
        if (Rg.chance(0.5)) ps.spawn(P.STAR, Rg.range(-1, 1) * W * 1.5, -Rg.range(0, 120), Rg.range(-10, 10), -Rg.range(30, 85), Rg.range(0.5, 1.1), Rg.pick([WHITE, C[6], C[5]]), Rg.range(0.7, 2));
        if (Rg.chance(0.35)) ps.spawn(P.MOTE, Rg.range(-1, 1) * W * 0.8, -Rg.range(0, 50), 0, -Rg.range(160, 300), Rg.range(0.2, 0.35), Rg.chance(0.5) ? WHITE : C[6], 0.8);
      }
      if (!broke && t >= BREAK) {
        broke = true;
        for (let i = 0; i < 46; i++)
          ps.spawn(P.STAR, Rg.range(-1, 1) * W * 0.9, -Rg.range(2, TOP * 0.8), Rg.range(-12, 12), -Rg.range(8, 40), Rg.range(0.5, 1.15), Rg.pick([WHITE, WHITE, C[6], C[5]]), Rg.range(0.6, 2.4));
      }
      if (t > BREAK && t < BREAK + 0.4 && Rg.chance(0.8)) {
        ps.spawn(P.STAR, Rg.range(-1, 1) * W * 0.7, -Rg.range(2, TOP * 0.78), Rg.range(-8, 8), -Rg.range(10, 50), Rg.range(0.4, 0.9), Rg.pick([WHITE, C[6], C[5]]), Rg.range(0.6, 1.8));
        if (Rg.chance(0.4)) ps.spawn(P.MOTE, Rg.range(-1, 1) * W * 0.5, -Rg.range(2, TOP * 0.7), 0, -Rg.range(60, 140), Rg.range(0.2, 0.4), C[6], 0.7);
      }
      for (let k = 0; k < NRUNE; k++)
        if (!out[k] && t >= runeOut(k)) {
          out[k] = true;
          const g = runeAngle(k), x = Math.cos(g) * RR, y = Math.sin(g) * RR * SY - 5;
          for (let i = 0; i < 4; i++) ps.spawn(P.STAR, x + Rg.range(-2, 2), y + Rg.range(-2, 2), Rg.range(-14, 14), -Rg.range(10, 40), Rg.range(0.3, 0.55), Rg.pick([WHITE, C[6]]), Rg.range(0.6, 1.6));
        }
      ps.update(dt);
      lights.update(dt);
    },
    drawBack(p) {
      const lvl = level(t);
      if (t < GONE) {
        const k = lvl * smooth(PEN[0], PEN[1] + 0.2, t);
        p.glow(0, 0, R * 1.3, C[4], 0.28 * k);
        for (const s of [-1, 1]) p.glow(s * R * 0.6, 1, R * 0.7, C[5], 0.12 * k);
      }
      shock(p, true);
      circle(p, true);
      runes(p, true);
      column(p);
      ps.draw(p, "back");
    },
    draw(p) {
      shock(p, false);
      circle(p, false);
      runes(p, false);
      const pen = (x, y) => {
        sparkle(p, x, y, 2, C[6], C[5], 0.5);
        p.glow(x, y, 7, C[6], 0.45);
      };
      if (t > PEN[0] && t < PEN[1]) for (const s of [-1, 1]) {
        const g = Math.PI / 2 + s * ((t - PEN[0]) / (PEN[1] - PEN[0])) * Math.PI;
        pen(Math.cos(g) * R, Math.sin(g) * R * SY);
      }
      if (t > INNER[0] && t < INNER[1]) {
        const g = -Math.PI / 2 + (t - INNER[0]) / (INNER[1] - INNER[0]) * TAU;
        pen(Math.cos(g) * RI, Math.sin(g) * RI * SY);
      }
      for (const e of edges)
        if (t > e.t0 && t < e.t0 + e.dur) {
          const s = (t - e.t0) / e.dur;
          pen(e.p0[0] + (e.p1[0] - e.p0[0]) * s, (e.p0[1] + (e.p1[1] - e.p0[1]) * s) * SY);
        }
      if (t >= FLASH && t < FLASH + 0.24) {
        const a = (t - FLASH) / 0.24;
        flare(p, 0, -8, 34 * Math.pow(1 - a, 1.5), 1 - a, C);
        p.glow(0, -26, 56, WHITE, 0.5 * (1 - a));
      }
      ps.draw(p, "front");
      lights.draw(p);
    }
  };
}

export {
  meta,
  create,
  magic_circle_cast_exports
};
