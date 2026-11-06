import {
  floorRing,
  glyph,
  mote,
  sigil
} from "./chunk-T4ZHKCZ6.js";
import {
  cycle,
  projectSigilPath,
  sigilArc,
  sparkle
} from "./chunk-UVAM4WET.js";
import "./chunk-ROMX66BI.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-3L2ANF6Q.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-WF7OCMQS.js";
import {
  PAL,
  TAU,
  WHITE,
  ease,
  fit,
  rng,
  smooth
} from "./chunk-MBWWV6CB.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/arcane/rune-circle.ts
var D = 4;
var R = 46;
var RR = 39;
var RI = 23;
var RC = 7;
var SY = 0.3;
var NR = 12;
var meta = {
  name: "Rune circle",
  desc: "An engraved seal turns in perspective: raised runes stand on twin rails, counter-rotating compass seals frame a hollow center, and reading lights release script and curved motes.",
  tags: ["arcane", "rune", "circle", "magic", "aura", "ground", "loop"],
  size: [136, 100],
  origin: [68, 80],
  duration: D,
  loop: true,
  fps: 30,
  bg: "ground",
  options: { palette: PAL.arcane, runeStyle: "engraved", seed: 8 }
};
var at = (g, r) => [Math.cos(g) * r, Math.sin(g) * r * SY];
var gap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
function circle(p, C, t, far) {
  const ph = t / D, spin = ph * TAU / 4, keep = far ? (g) => Math.sin(g) < 0 : (g) => Math.sin(g) >= 0;
  const chase = ph * TAU * 2, lit = (g, w) => gap(g, chase) < w || gap(g, chase + Math.PI) < w;
  const tone = (g, hi, lo) => Math.sin(g) < 0 ? lo : hi;
  floorRing(p, 0, 0, R, SY, (g) => lit(g, 0.22) ? WHITE : lit(g, 0.5) ? C[6] : tone(g, C[6], C[5]), 1, keep);
  floorRing(p, 0, 0, RI, SY, (g) => tone(g, C[5], C[4]), 1, keep);
  floorRing(p, 0, 0, RC, SY, (g) => tone(g, C[6], C[5]), 1, keep);
  for (let j = 0; j < 16; j++) {
    const g = spin + (j + 0.5) * TAU / 16;
    if (Math.sin(g) < 0 !== far) continue;
    const [x, y] = at(g, R + 3.5), hot = lit(g, 0.3);
    p.px(x, y, hot ? WHITE : tone(g, j % 2 ? C[5] : C[6], C[4]));
    if (j % 2 === 0) for (const [dx, dy] of [[1, 0], [-1, 0]]) p.px(x + dx, y + dy, hot ? C[6] : tone(g, C[4], C[3]));
  }
  const pts = [0, 1, 2, 3].map((k) => at(-spin + k * TAU / 4 + Math.PI / 4, RI));
  for (let k = 0; k < 4; k++) {
    let [ax, ay] = pts[k], [bx, by] = pts[(k + 1) % 4];
    if (ay < 0 !== by < 0) {
      const u = ay / (ay - by), mx = ax + (bx - ax) * u;
      if (ay < 0 === far) bx = mx, by = 0;
      else ax = mx, ay = 0;
    } else if (ay < 0 !== far) continue;
    p.line(ax, ay, bx, by, far ? C[4] : C[5]);
  }
  const gs = [...Array(NR).keys()].map((k) => [k, spin + (k + 0.5) * TAU / NR]).filter(([, g]) => Math.sin(g) < 0 === far);
  gs.sort((a, b) => Math.sin(a[1]) - Math.sin(b[1]));
  for (const [k, g] of gs) {
    const [x, y] = at(g, RR), hot = lit(g, 0.2), bob = Math.sin(ph * TAU * 4 + 4 * g) * 0.5;
    glyph(p, [0, 3, 5][k % 3], x, y - 1 + bob, hot ? WHITE : far ? C[5] : C[6], 1, hot ? C[5] : far ? C[2] : C[3]);
    p.glow(x, y - 3, hot ? 10 : 6, C[5], hot ? 0.5 : far ? 0.12 : 0.22);
    p.glow(x, y, 5, C[4], 0.15);
  }
}
function motes(p, C, t, S, far) {
  cycle(t, D, 76, S * 5 + 1, (g) => g.range(1.1, 1.9), (age, life, r) => {
    const g0 = r.range(0, TAU), r0 = r.pick([R, R, RR, RR, RI]), q = age / life, g = g0 + q * r.range(0.6, 1.4);
    if (Math.sin(g) < 0 !== far) return;
    const rr = r0 * (1 - 0.35 * q), h = 2 + ease.outQuad(q) * r.range(26, 52), x = Math.cos(g) * rr, y = Math.sin(g) * rr * SY - h;
    const a = Math.min(1, q * 5) * (1 - smooth(0.65, 1, q)), big = r.chance(0.2);
    mote(p, x, y, -Math.sin(g) * rr * 0.8, -36 * (1 - q) - 10, r.chance(0.3) ? WHITE : r.chance(0.6) ? C[6] : C[5], big ? 1.1 : r.range(0.55, 0.9), a, big ? 0.5 : 0.3);
  });
  cycle(t, D, 14, S * 5 + 2, 0.45, (age, life, r) => {
    const g = r.range(0, TAU);
    if (Math.sin(g) < 0 !== far) return;
    const rr = r.range(8, R), x = Math.cos(g) * rr, y = Math.sin(g) * rr * SY - r.range(6, 34), k = Math.sin(age / life * Math.PI);
    sparkle(p, x, y, 1 + 2.4 * k, C[6], C[5], 0.35 * k);
  });
}
function classicBack(p, t, o) {
  const C = fit(o.palette, 8), pulse = 0.85 + 0.15 * Math.sin(t / D * TAU * 4);
  p.glow(0, 0, R * 1.4, C[4], 0.24 * pulse);
  for (const s of [-1, 1]) p.glow(s * R * 0.55, 1, R * 0.7, C[5], 0.12 * pulse);
  for (let h = 0; h < 66; h += 6) p.glow(0, -h, 26, C[4], 0.11 * pulse * (1 - h / 80));
  circle(p, C, t, true);
  motes(p, C, t, o.seed, true);
}
function classicFront(p, t, o) {
  const C = fit(o.palette, 8), chase = t / D * TAU * 2;
  circle(p, C, t, false);
  motes(p, C, t, o.seed, false);
  for (const g of [chase, chase + Math.PI]) {
    const [x, y] = at(g, R);
    sparkle(p, x, y, 2.5 + Math.sin(t * 30) * 0.8, C[6], C[5], 0.5);
    p.glow(x, y, 14, C[5], 0.4);
  }
}
var SEAL_R = 51;
var PERSPECTIVE = 0.31;
var RUNE_R = 39;
var planePoint = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
var phaseTime = (t) => (t % D + D) % D;
function seal(p, C, t, far) {
  const phase = t / D, spin = phase * TAU / 4, chase = phase * TAU * 2;
  const ink = (points, color, { height = 0, rotation = 0, alpha = 1, width = 1, glow = 0 } = {}) => {
    for (const run of projectSigilPath(points, { perspective: PERSPECTIVE, rotation, height })) {
      if (run.back !== far) continue;
      p.path(run.points.map(([x, y]) => [x, y + 1]), C[1], alpha * 0.65, width + 0.3);
      p.path(run.points, color, alpha, width);
      if (glow > 0) p.glowPath(run.points, 3.5, C[4], glow);
    }
  };
  for (const [radius, color] of [[SEAL_R, far ? C[4] : C[6]], [47, far ? C[3] : C[4]], [30, far ? C[3] : C[5]]])
    ink(sigilArc(radius), color, { glow: radius === SEAL_R ? 0.06 : 0 });
  for (let j = 0; j < 32; j++) {
    const a = spin + (j + 0.5) * TAU / 32;
    ink([planePoint(a, j % 4 ? 48.5 : 46), planePoint(a, j % 4 ? 50 : 53)], far ? C[3] : j % 4 ? C[4] : C[6]);
  }
  for (let j = 0; j < 4; j++) {
    const a = spin + j * TAU / 4;
    ink([[28, 0], [20, -4], [22, 0], [20, 4], [28, 0]], far ? C[3] : C[4], { rotation: a });
  }
  const square = [0, 1, 2, 3, 0].map((j) => planePoint(j * TAU / 4 + Math.PI / 4, 25));
  ink(square, far ? C[3] : C[4], { rotation: -spin });
  ink(sigilArc(12), far ? C[4] : C[5]);
  ink([[0, -7], [7, 0], [0, 7], [-7, 0], [0, -7]], far ? C[5] : C[6], { rotation: spin });
  for (const head of [chase, chase + Math.PI]) {
    const arc = sigilArc(SEAL_R, head - 0.55, head, 0.08);
    for (const run of projectSigilPath(arc, { perspective: PERSPECTIVE })) {
      if (run.back !== far) continue;
      const u = (v) => run.from + (run.to - run.from) * v;
      p.path(run.points, (v) => u(v) > 0.82 ? C[7] : C[6], (v) => 0.18 + 0.82 * u(v), 1.5);
      p.glowPath(run.points, 5, C[5], (v) => 0.04 + 0.14 * u(v));
    }
    if (Math.sin(head) < 0 === far) {
      const [x, z] = planePoint(head, SEAL_R), y = z * PERSPECTIVE;
      sparkle(p, x, y, 1.9 + 0.4 * Math.cos(phase * TAU * 8), C[7], C[5], 0.48);
    }
  }
}
function runes(p, C, t, seed, far) {
  const phase = t / D, spin = phase * TAU / 4, chase = phase * TAU * 2;
  const order = [0, 4];
  const sites = Array.from({ length: 8 }, (_, i) => ({ i, a: spin + (i + 0.5) * TAU / 8 })).filter((s) => Math.sin(s.a) < 0 === far).sort((a, b) => Math.sin(a.a) - Math.sin(b.a));
  for (const { i, a } of sites) {
    const [x, z] = planePoint(a, RUNE_R), y = z * PERSPECTIVE;
    const hot = Math.max(0, 1 - gap(a, chase) / 0.4, 1 - gap(a, chase + Math.PI) / 0.4);
    const bob = 0.6 * Math.sin(phase * TAU * 4 + a * 4), top = y - 7 - bob;
    p.line(x - 2, y, x + 2, y, far ? C[3] : C[5]);
    p.path([[x, y - 1], [x, top + 4]], far ? C[3] : C[4], 0.55);
    sigil(p, order[i % 2], x, top, hot > 0.5 ? C[7] : far ? C[5] : C[6], 1, C[1]);
    if (hot > 0) {
      p.glow(x, top, 7, C[5], 0.3 * hot);
      p.path([[x - 4, top - 2], [x - 5, top - 2], [x - 5, top + 2], [x - 4, top + 2]], C[5], hot);
      p.path([[x + 4, top - 2], [x + 5, top - 2], [x + 5, top + 2], [x + 4, top + 2]], C[5], hot);
    }
  }
  for (let j = 0; j < 7; j++) for (let side = 0; side < 2; side++) {
    const born = (1 + j * 4) / 7, age = ((t - born) % D + D) % D;
    const r = rng(seed, j * 2 + side + 170), life = r.range(1.4, 1.85);
    if (age >= life) continue;
    const q = age / life, a = Math.PI * born + side * Math.PI + q * 0.25;
    if (Math.sin(a) < 0 !== far) continue;
    const rr = RUNE_R * (1 - q * 0.22), x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr * PERSPECTIVE - 5 - q * r.range(37, 48);
    const alpha = smooth(0, 0.12, q) * (1 - smooth(0.5, 1, q));
    glyph(p, 0, x, y, far ? C[4] : q < 0.2 ? C[6] : C[5], alpha, C[1]);
    if (alpha > 0) p.glow(x, y - 2, 4, C[4], alpha * 0.07);
  }
}
function sealMotes(p, C, t, seed, far) {
  cycle(t, D, 32, seed * 17 + 11, (r) => r.range(1.2, 1.8), (age, life, r) => {
    const a = r.range(0, TAU), radius = r.range(26, 44), height = r.range(35, 58), spin = r.range(0.3, 0.9);
    const path = (s) => {
      const u = s / life, th = a + spin * u, rr = radius * (1 - 0.25 * u);
      return [Math.cos(th) * rr, Math.sin(th) * rr, 5 + height * ease.outQuad(u)];
    };
    const q = age / life, alpha = smooth(0, 0.12, q) * (1 - smooth(0.55, 1, q));
    const start = Math.max(0, age - 0.075), points = Array.from({ length: 6 }, (_, i) => path(start + (age - start) * i / 5));
    for (const run of projectSigilPath(points, { perspective: PERSPECTIVE })) {
      if (run.back !== far) continue;
      const u = (v) => run.from + (run.to - run.from) * v;
      p.path(
        run.points,
        (v) => u(v) > 0.6 ? far ? C[5] : C[6] : far ? C[3] : C[4],
        (v) => alpha * (0.2 + 0.8 * u(v) ** 1.5),
        0.8
      );
    }
    const [x, z, lift] = path(age);
    if (z < 0 === far) p.glow(x, z * PERSPECTIVE - lift, 3, C[4], alpha * 0.08);
  });
}
function drawBack(p, t, o) {
  if (o.runeStyle === "classic") return classicBack(p, t, o);
  t = phaseTime(t);
  const C = fit(o.palette, 8);
  p.glow(0, 1, 40, C[4], 0.08);
  seal(p, C, t, true);
  runes(p, C, t, o.seed, true);
  sealMotes(p, C, t, o.seed, true);
}
function draw(p, t, o) {
  if (o.runeStyle === "classic") return classicFront(p, t, o);
  t = phaseTime(t);
  const C = fit(o.palette, 8);
  seal(p, C, t, false);
  runes(p, C, t, o.seed, false);
  sealMotes(p, C, t, o.seed, false);
}
export {
  draw,
  drawBack,
  meta
};
