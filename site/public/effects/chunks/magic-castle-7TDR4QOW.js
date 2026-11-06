import {
  cycle,
  sparkle
} from "./chunk-Z77DUDLI.js";
import "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-Q4UVK4W6.js";
import {
  TAU,
  WHITE,
  fit,
  smooth
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/arcane/magic-castle.ts
var meta = {
  addedAt: "2026-11-02T13:49:39Z",
  name: "Astral castle",
  desc: "An intricate floating citadel with crystalline spires, fluttering banners and windows glowing above a rotating astral seal.",
  tags: ["arcane", "castle", "summon", "magic", "astral", "palace", "portal", "loop"],
  size: [224, 184],
  origin: [112, 162],
  duration: 4,
  loop: true,
  fps: 24,
  bg: "dark",
  options: { palette: ["#0b1024", "#202951", "#364579", "#5569a7", "#849ad7", "#a6ddef", "#efffff"], seed: 37 }
};
var D = meta.duration;
function rim(p, x, y, w, c) {
  p.rect(x - 2, y, w + 4, 3, c[0]);
  p.rect(x - 1, y, w + 2, 1, c[5]);
  p.rect(x, y + 3, w, 1, c[3]);
}
function wall(p, x, y, w, h, c, phase) {
  p.rect(x - 1, y - 1, w + 2, h + 2, c[0]);
  p.rect(x, y, w, h, c[2]);
  p.rect(x + Math.floor(w * 0.68), y, Math.ceil(w * 0.32), h, c[1]);
  p.line(x, y, x, y + h - 1, c[4]);
  p.line(x + 1, y + 1, x + w - 2, y + 1, c[3]);
  for (let row = 0; row < Math.ceil(h / 5); row++) {
    const yy = y + 4 + row * 5;
    if (yy >= y + h - 1) break;
    p.line(x + 1, yy, x + w - 2, yy, c[1], 0.7);
    const shift = row % 2 * 4;
    for (let xx = x + shift + 2; xx < x + w - 2; xx += 8) {
      p.line(xx, yy - 3, xx, yy - 1, c[1], 0.75);
      if (((row * 17 + xx * 3) % 7 + 7) % 7 === 0) p.dot(xx + 1, yy - 3, c[4], 0.75);
    }
  }
  for (let dx = 1; dx < w - 2; dx += 6) {
    p.rect(x + dx, y - 4, 4, 4, c[0]);
    p.rect(x + dx, y - 3, 3, 2, c[3]);
    p.dot(x + dx, y - 3, c[5]);
  }
  p.line(x, y - 1, x + w - 1, y - 1, c[4]);
  void phase;
}
function roof(p, x, base, half, rise, c) {
  const outline = [[x - half - 3, base + 1], [x, base - rise - 2], [x + half + 3, base + 1]];
  p.poly(outline, c[0]);
  p.poly([[x - half - 1, base], [x, base - rise], [x, base], [x - half - 1, base]], c[3]);
  p.poly([[x, base - rise], [x + half + 1, base], [x, base]], c[1]);
  p.line(x - half - 1, base, x, base - rise, c[5]);
  p.line(x, base - rise, x + half + 1, base, c[3]);
  for (let dy = 4; dy < rise - 2; dy += 4) {
    const width = Math.floor(half * dy / rise);
    const yy = base - rise + dy;
    p.line(x - width, yy, x - 1, yy, c[4], 0.8);
    p.line(x + 1, yy, x + width, yy, c[2], 0.8);
    for (let sx = -width + 2; sx < width; sx += 5) if ((dy + sx) % 3 === 0) p.dot(x + sx, yy - 1, c[5], 0.7);
  }
  p.line(x, base - rise - 6, x, base - rise, c[5]);
  p.dot(x, base - rise - 7, WHITE);
}
function tower(p, x, y, w, h, roofH, c, phase, flag) {
  wall(p, x - w / 2, y, w, h, c, phase);
  rim(p, x - w / 2, y + 4, w, c);
  roof(p, x, y - 4, w / 2, roofH, c);
  for (let j = 0; j < 2; j++) {
    const wy = y + 10 + j * 11;
    if (wy + 7 >= y + h) break;
    p.rect(x - 3, wy, 6, 8, c[0]);
    p.poly([[x - 3, wy], [x, wy - 4], [x + 3, wy]], c[0]);
    const flicker = 0.65 + 0.35 * Math.sin(phase * 2 + x * 0.17 + j * 1.8);
    p.rect(x - 2, wy + 1, 4, 5, c[3]);
    p.rect(x - 1, wy + 1, 2, 4, c[5], flicker);
    p.dot(x, wy - 1, c[6], 0.55 + 0.3 * flicker);
  }
  if (flag) {
    const tip = y - 4 - roofH - 7, flap = Math.sin(phase * 2 + x * 0.2) * 2;
    p.line(x, tip, x, tip - 10, c[5]);
    p.poly([[x + 1, tip - 10], [x + 8, tip - 9 + flap], [x + 6, tip - 6 + flap], [x + 1, tip - 5]], c[4]);
    p.line(x + 1, tip - 10, x + 7, tip - 9 + flap, c[6]);
  }
}
function draw(p, t, o) {
  const c = fit(o.palette, 7), u = t / D, ph = u * TAU, bob = Math.sin(ph) * 1.2, glint = 0.75 + 0.25 * Math.sin(ph * 2);
  const reveal = smooth(0.04, 0.3, u) * (1 - smooth(0.65, 0.94, u));
  const spires = smooth(0.15, 0.34, u) * (1 - smooth(0.6, 0.84, u));
  const ground = -4, castle = -46 + bob + (1 - reveal) * 30;
  p.glow(0, ground - 2, 68, c[3], 0.13);
  for (let i = 0; i < 192; i++) {
    const a = i * TAU / 192, near = Math.sin(a) > 0, hot = Math.cos(a * 4 - ph * 2) > 0.87;
    p.dot(Math.cos(a) * 69, ground + Math.sin(a) * 13, hot ? c[6] : near ? c[4] : c[2], near ? 0.95 : 0.65);
    if (i % 6 !== 0) p.dot(Math.cos(a) * 51, ground + Math.sin(a) * 9, c[3], 0.8);
  }
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8 + ph / 2, x = Math.cos(a) * 61, y = ground + Math.sin(a) * 11;
    p.dot(x, y, c[6]);
    p.dot(x - 1, y, c[4]);
    p.dot(x + 1, y, c[4]);
    p.dot(x, y - 1, c[5]);
  }
  const diamond = [[0, ground - 13], [55, ground], [0, ground + 13], [-55, ground]];
  for (let i = 0; i < 4; i++) {
    const a = diamond[i], b = diamond[(i + 1) % 4];
    p.line(a[0], a[1], b[0], b[1], c[3], 0.7);
  }
  for (let i = 0; i < 4; i++) {
    const a = ph + i * TAU / 4, x = Math.cos(a) * 74, y = ground - 19 + Math.sin(a) * 7;
    p.poly([[x, y - 3], [x + 2, y], [x, y + 3], [x - 2, y]], c[4], 0.8);
    p.dot(x, y, c[6], 0.9);
  }
  const charge = Math.min(1, Math.max(0, reveal * (1 - spires) * 2));
  if (charge > 0.01) for (const x of [-43, -30, -16, 0, 16, 30, 43]) {
    const height = 28 + 22 * (0.5 + 0.5 * Math.sin(x + ph * 2));
    p.line(x, ground - 2, x, ground - height, c[4], charge * 0.35);
    p.dot(x, ground - height, c[6], charge * 0.65);
  }
  const previousFade = p.fade;
  p.fade = previousFade * reveal;
  p.poly([[-59, castle - 1], [-53, castle + 8], [-33, castle + 16], [-23, castle + 21], [-5, castle + 26], [12, castle + 23], [29, castle + 18], [45, castle + 10], [58, castle - 1]], c[0]);
  p.poly([[-56, castle], [-37, castle + 9], [-17, castle + 14], [0, castle + 20], [4, castle + 7], [20, castle + 13], [44, castle + 5], [55, castle]], c[2]);
  p.poly([[-39, castle + 8], [-23, castle + 17], [-5, castle + 22], [-12, castle + 12]], c[1]);
  p.poly([[5, castle + 18], [20, castle + 14], [33, castle + 10], [21, castle + 19]], c[1]);
  p.line(-51, castle + 1, -28, castle + 10, c[4]);
  p.line(-12, castle + 14, 2, castle + 19, c[3]);
  p.poly([[-36, castle + 8], [-32, castle + 21], [-27, castle + 10]], c[4], 0.8);
  p.poly([[27, castle + 8], [31, castle + 24], [35, castle + 7]], c[3], 0.9);
  p.line(-32, castle + 10, -32, castle + 20, c[6], 0.8);
  p.fade = previousFade * spires;
  tower(p, -25, castle - 50, 20, 50, 19, c, ph, true);
  tower(p, 26, castle - 51, 20, 51, 21, c, ph, true);
  tower(p, 0, castle - 62, 26, 62, 25, c, ph, true);
  p.fade = previousFade * reveal;
  wall(p, -47, castle - 29, 94, 29, c, ph);
  tower(p, -42, castle - 37, 20, 37, 19, c, ph, false);
  tower(p, 42, castle - 37, 20, 37, 19, c, ph, false);
  p.rect(-18, castle - 23, 36, 23, c[0]);
  p.rect(-16, castle - 21, 32, 21, c[3]);
  p.rect(-14, castle - 19, 28, 19, c[1]);
  p.poly([[-10, castle], [-10, castle - 13], [0, castle - 23], [10, castle - 13], [10, castle]], c[0]);
  p.poly([[-7, castle], [-7, castle - 12], [0, castle - 19], [7, castle - 12], [7, castle]], c[2]);
  p.poly([[-4, castle], [-4, castle - 11], [0, castle - 15], [4, castle - 11], [4, castle]], c[5]);
  p.line(0, castle - 16, 0, castle, c[6], glint);
  p.rect(-20, castle, 40, 2, c[4]);
  p.rect(-24, castle + 2, 48, 2, c[2]);
  for (const x of [-29, -22, 22, 29]) {
    p.rect(x - 2, castle - 17, 4, 6, c[0]);
    p.rect(x - 1, castle - 16, 2, 4, c[5], glint);
  }
  for (const x of [-16, 16]) {
    p.rect(x - 1, castle - 25, 3, 2, c[6], glint);
    p.glow(x, castle - 24, 7, c[5], 0.16);
  }
  p.glow(0, castle - 12, 26, c[4], 0.13);
  p.glow(0, castle - 75, 20, c[4], 0.13);
  for (let j = 0; j < 3; j++) {
    const x = [-26, 5, 28][j], length = 18 + j * 3;
    for (let k = 0; k < length; k++) {
      const yy = castle + 12 + k, xx = x + Math.sin(k * 0.21 - ph * 2 + j) * 2;
      const a = 0.55 * (1 - k / length);
      if ((k + j) % 3 !== 0) p.dot(xx, yy, c[5], a);
    }
  }
  p.fade = previousFade;
  cycle(t, D, 18, o.seed, (r) => r.range(0.8, 1.7), (age, life, r) => {
    const u2 = age / life, x = r.range(-80, 80) + Math.sin(u2 * TAU + r.range(0, TAU)) * 3, y = -12 - u2 * r.range(35, 115), k = Math.sin(u2 * Math.PI);
    if (Math.abs(x) < 49 && y < castle + 2 && y > castle - 90) return;
    sparkle(p, x, y, 1 + 2 * k, c[6], c[4], 0.65 * k);
  });
  for (let i = 0; i < 3; i++) {
    const a = ph + i * TAU / 3, x = Math.cos(a) * 77, y = castle - 40 + Math.sin(a) * 31;
    sparkle(p, x, y, 2.5, WHITE, c[5], 0.8);
  }
}
export {
  draw,
  meta
};
