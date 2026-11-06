import {
  sparkle
} from "./chunk-ZHMERMWE.js";
import "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-Z52ZYDDH.js";
import {
  WHITE,
  clamp,
  fit,
  rand
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/shadow/black-dragon-slash.ts
var meta = {
  addedAt: "2026-11-02T14:07:19Z",
  name: "Black dragon slash",
  desc: "A black dragon trembles and roars as a massive silver-edged cut rips open space in front of it.",
  tags: ["dragon", "black dragon", "slash", "sword", "shadow", "dark", "void", "rift", "combat", "ultimate", "one-shot", "\uD751\uB8E1\uCC38", "\uD751\uB8E1", "\uC6A9", "\uAC80\uACA9", "\uACF5\uAC04"],
  size: [256, 192],
  origin: [128, 96],
  duration: 2.4,
  loop: false,
  fps: 30,
  bg: "dark",
  options: { palette: ["#050408", "#0d0b12", "#1c1823", "#352d3d", "#6d6177", "#ada5bb", "#e9e5f0", "#ffffff"], seed: 77 }
};
var smooth = (v) => {
  const x = clamp(v);
  return x * x * (3 - 2 * x);
};
var out = (v) => 1 - (1 - clamp(v)) ** 3;
function draw(p, t, o) {
  if (t <= 0 || t >= meta.duration) return;
  const C = fit(o.palette, 8);
  const dragonIn = smooth((t - 0.04) / 0.24), dragonOut = 1 - smooth((t - 1.36) / 0.72), a = dragonIn * dragonOut;
  const roar = smooth((t - 0.28) / 0.25) * (1 - smooth((t - 1.13) / 0.32));
  const tremor = smooth((t - 0.1) / 0.25) * (1 - smooth((t - 0.85) / 0.25));
  const shakeX = Math.sin(t * 113) * 2 * tremor, shakeY = Math.sin(t * 137) * 1.5 * tremor;
  if (a > 1e-3) {
    const savedX = p.tx, savedY = p.ty, movingX = p.toX(shakeX, shakeY), movingY = p.toY(shakeX, shakeY);
    p.tx = movingX;
    p.ty = movingY;
    p.glow(0, -12, 66, C[3], a * 0.12);
    p.poly([[-30, -38], [-44, -54], [-62, -78], [-60, -54], [-49, -29], [-38, -15], [-30, -22]], C[0], a);
    p.poly([[30, -38], [44, -54], [62, -78], [60, -54], [49, -29], [38, -15], [30, -22]], C[0], a);
    p.polyline([[-30, -38], [-44, -54], [-62, -78], [-60, -54], [-49, -29]], C[4], a);
    p.polyline([[30, -38], [44, -54], [62, -78], [60, -54], [49, -29]], C[4], a);
    p.line(-61, -74, -46, -51, C[5], a * 0.75);
    p.line(61, -74, 46, -51, C[5], a * 0.75);
    p.poly([[-29, -37], [-42, -53], [-58, -68], [-76, -69], [-67, -76], [-51, -77], [-35, -60], [-22, -42]], C[1], a);
    p.poly([[29, -37], [42, -53], [58, -68], [76, -69], [67, -76], [51, -77], [35, -60], [22, -42]], C[1], a);
    p.polyline([[-29, -37], [-42, -53], [-58, -68], [-76, -69], [-67, -76], [-51, -77]], C[4], a);
    p.polyline([[29, -37], [42, -53], [58, -68], [76, -69], [67, -76], [51, -77]], C[4], a);
    p.poly([[-40, -5], [-54, 5], [-62, 4], [-52, 16], [-41, 19], [-31, 12]], C[1], a);
    p.poly([[40, -5], [54, 5], [62, 4], [52, 16], [41, 19], [31, 12]], C[1], a);
    p.polyline([[-40, -5], [-54, 5], [-62, 4], [-52, 16]], C[4], a * 0.8);
    p.polyline([[40, -5], [54, 5], [62, 4], [52, 16]], C[4], a * 0.8);
    for (const side of [-1, 1]) {
      p.poly([
        [side * 37, -6],
        [side * 52, -15],
        [side * 70, -20],
        [side * 59, -8],
        [side * 73, -4],
        [side * 55, 1],
        [side * 43, 9]
      ], C[1], a);
      p.polyline([[side * 37, -6], [side * 52, -15], [side * 70, -20], [side * 59, -8], [side * 73, -4]], C[4], a * 0.7);
      p.line(side * 46, 0, side * 63, -8, C[3], a * 0.9);
    }
    p.poly([[0, -52], [-16, -45], [-31, -49], [-39, -32], [-47, -15], [-43, 15], [-31, 37], [-18, 51], [0, 58]], C[0], a);
    p.poly([[0, -52], [16, -45], [31, -49], [39, -32], [47, -15], [43, 15], [31, 37], [18, 51], [0, 58]], C[0], a);
    p.polyline([[-47, -15], [-39, -32], [-31, -49], [-16, -45], [0, -52], [16, -45], [31, -49], [39, -32], [47, -15], [43, 15], [31, 37], [18, 51], [0, 58], [-18, 51], [-31, 37], [-43, 15], [-47, -15]], C[4], a * 0.78);
    p.poly([[-38, -22], [-29, -40], [-15, -36], [0, -43], [15, -36], [29, -40], [38, -22], [27, -15], [15, -19], [0, -26], [-15, -19], [-27, -15]], C[2], a);
    p.poly([[-43, -10], [-29, -14], [-16, -8], [-13, 8], [-22, 21], [-39, 17]], C[1], a);
    p.poly([[43, -10], [29, -14], [16, -8], [13, 8], [22, 21], [39, 17]], C[1], a);
    p.poly([[-39, 9], [-29, 15], [-24, 34], [-14, 44], [-23, 36], [-36, 24]], C[2], a);
    p.poly([[39, 9], [29, 15], [24, 34], [14, 44], [23, 36], [36, 24]], C[2], a);
    p.polyline([[-37, 3], [-27, 9], [-20, 22]], C[4], a * 0.65);
    p.polyline([[37, 3], [27, 9], [20, 22]], C[4], a * 0.65);
    p.poly([[-37, -17], [-16, -13], [-19, -7], [-29, -8]], C[5], a);
    p.poly([[37, -17], [16, -13], [19, -7], [29, -8]], C[5], a);
    p.line(-32, -13, -21, -11, C[6], a);
    p.line(32, -13, 21, -11, C[6], a);
    p.glow(-26, -12, 8, C[5], a * 0.16);
    p.glow(26, -12, 8, C[5], a * 0.16);
    p.polyline([[-39, -20], [-22, -17], [-13, -12]], C[4], a);
    p.polyline([[39, -20], [22, -17], [13, -12]], C[4], a);
    for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
      const x = side * (26 + row * 3), y = -2 + row * 8;
      p.line(x - side * 4, y - 2, x, y, C[3], a * 0.85);
      p.line(x, y, x - side * 3, y + 3, C[4], a * 0.55);
    }
    p.poly([[0, -22], [-10, -10], [-17, 12], [-21, 24], [-13, 35], [0, 38], [13, 35], [21, 24], [17, 12], [10, -10]], C[2], a);
    p.poly([[0, -20], [-4, 11], [-11, 25], [0, 29], [11, 25], [4, 11]], C[3], a);
    p.poly([[-17, 22], [-10, 20], [-8, 23], [-14, 26]], C[0], a);
    p.poly([[17, 22], [10, 20], [8, 23], [14, 26]], C[0], a);
    p.line(-12, 20, -8, 19, C[5], a * 0.7);
    p.line(12, 20, 8, 19, C[5], a * 0.7);
    const jaw = roar * 24;
    p.poly([[-22, 31], [-19, 42 + jaw * 0.45], [-12, 49 + jaw], [0, 53 + jaw], [12, 49 + jaw], [19, 42 + jaw * 0.45], [22, 31]], C[0], a);
    p.poly([[-18, 34], [-14, 39 + jaw * 0.4], [-9, 45 + jaw * 0.82], [0, 48 + jaw * 0.9], [9, 45 + jaw * 0.82], [14, 39 + jaw * 0.4], [18, 34]], C[1], a);
    p.poly([[-11, 39 + jaw * 0.44], [0, 42 + jaw * 0.74], [11, 39 + jaw * 0.44], [8, 43 + jaw * 0.82], [0, 45 + jaw * 0.88], [-8, 43 + jaw * 0.82]], C[3], a * roar * 0.8);
    p.polyline([[-22, 31], [-19, 42 + jaw * 0.45], [-12, 49 + jaw], [0, 53 + jaw], [12, 49 + jaw], [19, 42 + jaw * 0.45], [22, 31]], C[4], a * 0.9);
    p.tri(-19, 32, -13, 35, -14, 43 + roar * 4, C[6], a);
    p.tri(19, 32, 13, 35, 14, 43 + roar * 4, C[6], a);
    p.tri(-9, 38, -5, 38, -6, 43 + roar * 3, C[5], a);
    p.tri(9, 38, 5, 38, 6, 43 + roar * 3, C[5], a);
    p.tri(-13, 47 + jaw, -9, 46 + jaw * 0.88, -10, 42 + jaw * 0.75, C[5], a);
    p.tri(13, 47 + jaw, 9, 46 + jaw * 0.88, 10, 42 + jaw * 0.75, C[5], a);
    p.glow(0, 43 + jaw * 0.45, 12, C[4], a * roar * 0.24);
    p.line(-5, -33, 0, -42, C[4], a * 0.7);
    p.line(5, -33, 0, -42, C[4], a * 0.7);
    p.tx = savedX;
    p.ty = savedY;
  }
  const reveal = out((t - 0.62) / 0.12), hold = 1 - smooth((t - 1.38) / 0.65), cut = reveal * hold;
  if (cut > 1e-3) {
    const endX = -108 + 216 * reveal, endY = 57 - 114 * reveal;
    const span = Math.hypot(endX + 108, endY - 57), ux = (endX + 108) / (span || 1), uy = (endY - 57) / (span || 1);
    const nx = -uy, ny = ux, width = (3 + 25 * smooth((t - 0.68) / 0.14)) * (1 - 0.72 * smooth((t - 1.16) / 0.65));
    const points = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12, uneven = i === 0 || i === 12 ? 0 : Math.sin(i * 5.6 + o.seed) * 2.1, bulge = Math.sin(Math.PI * u) * width;
      points.push([-108 + ux * span * u + nx * (bulge + uneven), 57 + uy * span * u + ny * (bulge + uneven)]);
    }
    for (let i = 12; i >= 0; i--) {
      const u = i / 12, uneven = i === 0 || i === 12 ? 0 : Math.sin(i * 4.8 + o.seed) * 1.8, bulge = Math.sin(Math.PI * u) * width;
      points.push([-108 + ux * span * u - nx * (bulge + uneven), 57 + uy * span * u - ny * (bulge + uneven)]);
    }
    for (let i = 0; i < 12; i++) p.poly([points[i], points[i + 1], points[24 - i], points[25 - i]], C[0], cut);
    p.polyline(points.slice(0, 13), C[5], cut * 0.8);
    p.polyline(points.slice(13), C[3], cut * 0.95);
    const echo = Math.exp(-Math.abs(t - 0.77) * 9) * cut;
    p.line(-104, 48, endX - 4, endY - 9, C[4], echo * 0.65);
    p.line(-102, 66, endX + 6, endY + 8, C[2], echo * 0.8);
    p.line(-108, 57, endX, endY, C[6], cut * 0.6);
    for (let i = 0; i < 6; i++) {
      const u = i / 6, v = (i + 1) / 6;
      p.glowLine(-100 + (endX + 100) * u, 53 + (endY - 53) * u, -100 + (endX + 100) * v, 53 + (endY - 53) * v, 8, C[4], cut * 0.1);
    }
    const crack = out((t - 0.7) / 0.12), crackFade = 1 - smooth((t - 1.35) / 0.55);
    for (let i = 0; i < 6; i++) {
      const u = 0.23 + i * 0.1, side = i % 2 ? 1 : -1, bx = -108 + ux * span * u, by = 57 + uy * span * u;
      const length = (10 + i % 3 * 5) * crack;
      p.polyline([[bx, by], [bx + nx * side * length * 0.55 + ux * 5, by + ny * side * length * 0.55 + uy * 5], [bx + nx * side * length + ux * 7, by + ny * side * length + uy * 7]], C[4], cut * crackFade * 0.75);
    }
  }
  const burst = clamp((t - 0.7) / 0.8), burstAlpha = Math.sin(Math.PI * burst);
  if (burst > 0 && burst < 1) {
    const r = 8 + 40 * out(burst);
    p.arc(0, -4, r, 2, -2.85, -0.45, C[5], burstAlpha * 0.75);
    p.arc(0, -4, r * 0.73, 1, 0.22, 2.37, C[4], burstAlpha * 0.8);
    p.glow(0, -4, 36, C[4], burstAlpha * 0.14);
    for (let i = 0; i < 24; i++) {
      const angle = i * 2.399 + o.seed * 0.01, radius = 7 + (18 + i % 4 * 6) * out(burst);
      const x = Math.cos(angle) * radius, y = -4 + Math.sin(angle) * radius * 0.76;
      const size = (i % 4 === 0 ? 4 : 1.5) * (1 - burst * 0.7), nx = Math.cos(angle), ny = Math.sin(angle);
      p.poly([[x + nx * size * 2, y + ny * size * 2], [x - ny * size, y + nx * size], [x - nx * size, y - ny * size], [x + ny * size, y - nx * size]], i % 4 === 0 ? C[6] : C[4], burstAlpha * 0.8);
      p.line(x, y, x - nx * (5 + 8 * (1 - burst)), y - ny * (5 + 8 * (1 - burst)), C[4], burstAlpha * 0.65);
      if (i % 5 === 0) sparkle(p, x, y, 3 * (1 - burst), C[6], C[4], burstAlpha * 0.55);
    }
  }
  const flash = Math.exp(-Math.abs(t - 0.73) * 29);
  if (flash > 0.02) {
    p.poly([[-110, 58], [-40, 10], [49, -14], [-35, 34]], C[5], flash * 0.9);
    p.poly([[-40, 10], [42, -36], [108, -57], [49, -14]], C[5], flash * 0.9);
    p.line(-100, 54, 100, -54, C[7], flash);
    sparkle(p, 39, -21, 27 * flash, WHITE, C[6], flash * 0.9);
    p.glowLine(-60, 32, 90, -49, 7, C[5], flash * 0.23);
    p.glow(39, -21, 24, C[6], flash * 0.25);
  }
  for (let i = 0; i < 12; i++) {
    const u = (t - 0.75 - rand(i, o.seed) * 0.16) / (0.75 + rand(i, o.seed + 1) * 0.36);
    if (u <= 0 || u >= 1) continue;
    const angle = rand(i, o.seed + 2) * 6.283, distance = (10 + rand(i, o.seed + 3) * 39) * out(u), x = 31 + Math.cos(angle) * distance, y = -15 + Math.sin(angle) * distance * 0.7;
    const k = Math.sin(Math.PI * u) * 0.8;
    p.line(x, y, x - Math.cos(angle) * (2 + 6 * (1 - u)), y - Math.sin(angle) * (2 + 4 * (1 - u)), i % 4 === 0 ? C[6] : C[4], k);
  }
}
export {
  draw,
  meta
};
