import {
  FONTS
} from "./chunk-VBA4AN6M.js";
import {
  WHITE,
  luma,
  mix,
  noise
} from "./chunk-MBWWV6CB.js";

// src/fx/ui/_lib.ts
function spell(str, font = "big") {
  const F = FONTS[font], letters = [];
  let x = 0;
  for (const ch of String(str)) {
    const g = F.glyphs[ch] ?? F.glyphs[ch.toUpperCase()] ?? null;
    const w = g ? g.w : F.space;
    letters.push({ ch, g, x, w, h: F.h });
    x += w + F.gap;
  }
  return { letters, w: Math.max(0, x - F.gap), h: F.h };
}
var ids = new Int16Array(4096);
var edges = new Uint8Array(4096);
function drawWord(p, items, st) {
  if (!items.length) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) {
    const h = it.g.rows.length * it.sy, w = it.g.w * it.sx, sl = Math.abs(it.slant ?? 0) * it.g.rows.length;
    x0 = Math.min(x0, it.x - sl);
    x1 = Math.max(x1, it.x + w + sl);
    y0 = Math.min(y0, it.y);
    y1 = Math.max(y1, it.y + h);
  }
  const ow = st.ow ?? 1;
  x0 = Math.floor(x0) - 1 - ow;
  y0 = Math.floor(y0) - 1 - ow;
  x1 = Math.ceil(x1) + 2 + ow;
  y1 = Math.ceil(y1) + 3 + ow;
  const W = x1 - x0, H = y1 - y0;
  if (W * H > ids.length) ids = new Int16Array(W * H * 2), edges = new Uint8Array(W * H * 2);
  ids.fill(0, 0, W * H);
  items.forEach((it, k) => {
    const g = it.g, gh = g.rows.length, h = gh * it.sy, bot = it.y + h, sl = it.slant ?? 0;
    for (let py = Math.floor(it.y); py < Math.ceil(bot); py++) {
      const gy = Math.floor((py + 0.5 - it.y) / it.sy);
      if (gy < 0 || gy >= gh) continue;
      const shift = Math.round((bot - py - 0.5) / it.sy * sl);
      const ry = py + 0.5 - it.y - gy * it.sy, row = g.rows[gy];
      for (let px = Math.floor(it.x + shift) - 1; px <= Math.ceil(it.x + shift + g.w * it.sx); px++) {
        const fx = px + 0.5 - it.x - shift, gx = Math.floor(fx / it.sx);
        if (gx < 0 || gx >= g.w || !row[gx]) continue;
        const i = (py - y0) * W + (px - x0);
        if (i < 0 || i >= W * H) continue;
        ids[i] = k + 1;
        const rx = fx - gx * it.sx, up = gy > 0 ? g.rows[gy - 1] : null, dn = gy < gh - 1 ? g.rows[gy + 1] : null;
        const open = (r) => !r || !r[gx] && !r[gx - 1] && !r[gx + 1];
        edges[i] = (ry < 1 && open(up) ? 1 : 0) | (ry >= it.sy - 1 && open(dn) ? 2 : 0) | (rx < 1 && !(gx > 0 && row[gx - 1]) ? 4 : 0);
      }
    }
  });
  const at = (x, y) => x < x0 || y < y0 || x >= x1 || y >= y1 ? 0 : ids[(y - y0) * W + (x - x0)];
  const F = st.fill, nF = F.length, shine = st.shine, glint = st.glint ?? WHITE, sy0 = st.shineY ?? y0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const id = at(x, y);
      if (id) {
        const it = items[id - 1], v = (y + 0.5 - it.y) / (it.g.rows.length * it.sy);
        let i = Math.min(nF - 1, Math.max(0, Math.floor((1 - v) * nF)));
        let c = F[i];
        const e = edges[(y - y0) * W + (x - x0)];
        if (e & 1) c = st.edge ?? F[nF - 1];
        else if (e & 2) c = st.under ?? F[0];
        else if (e & 4 && i < nF - 1) c = F[i + 1];
        if (shine !== void 0 && shine !== null) {
          const d = Math.abs(x + 0.5 - (y + 0.5 - sy0) * 0.6 - shine);
          if (d < 1.1) c = WHITE;
          else if (d < 2.4) c = glint;
        }
        if (it.flash > 0.6 || it.flash > 0.25 && v < 0.5) c = WHITE;
        p.dot(x, y, c, it.a ?? 1);
        continue;
      }
      let n = 0;
      for (let dy = -ow; dy <= ow && !n; dy++) for (let dx = -ow; dx <= ow && !n; dx++) if (ow < 2 || Math.abs(dx) + Math.abs(dy) < 4) n = at(x + dx, y + dy);
      if (n) {
        p.dot(x, y, st.outline, items[n - 1].a ?? 1);
        continue;
      }
      const s = at(x - ow, y - 1 - ow) || at(x + 1 - ow, y - 1 - ow) || at(x - ow, y - ow);
      if (s && st.shadow) p.dot(x, y, st.shadow, (items[s - 1].a ?? 1) * 0.9);
    }
}
function tintActor(p, A, k, ramp) {
  if (!A || k <= 0.12) return;
  const m = A.mask, pix = A.pixels, cut = k > 0.6 ? 0 : k > 0.3 ? 0.22 : 0.5;
  for (let j = 0; j < m.h; j++)
    for (let i = 0; i < m.w; i++) {
      const q = j * m.w + i;
      if (!m.data[q]) continue;
      const l = pix ? luma(pix[q]) : 0.6;
      if (l < cut) continue;
      p.px(A.x + i, A.y + j, l > 0.5 ? k > 0.8 ? WHITE : ramp[2] : l > 0.22 ? ramp[1] : ramp[0]);
    }
}
function lightActor(p, A, c, k, rim = 0, t = 0) {
  if (!A || k <= 0.01 && rim <= 0.01) return;
  const m = A.mask, pix = A.pixels, has = (i, j) => i >= 0 && j >= 0 && i < m.w && j < m.h && m.data[j * m.w + i];
  for (let j = 0; j < m.h; j++)
    for (let i = 0; i < m.w; i++) {
      if (!m.data[j * m.w + i]) continue;
      if (k > 0.01) p.light(A.x + i, A.y + j, c, k * (1.1 - 0.5 * j / m.h));
      if (rim <= 0.01 || !has(i - 1, j) || !has(i + 1, j) || !has(i, j - 1)) continue;
      if (has(i - 2, j) && has(i + 2, j) && has(i, j - 2)) continue;
      const f = rim * (0.75 + 0.35 * noise(j * 0.6 - t * 8, i * 3));
      if (f > 0.25) p.px(A.x + i, A.y + j, mix(pix ? pix[j * m.w + i] || c : c, c, Math.min(0.85, f)));
    }
}
function haloActor(p, A, c, k, t = 0) {
  if (!A || k <= 0.02) return;
  p.outline(A.mask, A.x, A.y, c, (mx, my) => k * (0.75 + 0.45 * noise(my * 0.45 - t * 7, mx * 3)));
}
function panel(p, x, y, w, h, col, { r = 3, a = 1, shine = null } = {}) {
  if (w < 2 || h < 2) return;
  const X1 = x + w, Y1 = y + h;
  p.shade(x, y, X1, Y1, (px, py, o) => {
    const cx = Math.max(x + r - px, 0, px - (X1 - r)), cy = Math.max(y + r - py, 0, py - (Y1 - r));
    const e = cx > 0 && cy > 0 ? r - Math.hypot(cx, cy) : Math.min(px - x, X1 - px, py - y, Y1 - py);
    if (e < 0) return;
    o.a = a;
    if (e < 1) return col.outline;
    if (py - y < 2) return col.rim;
    if (Y1 - py < 2) return col.low;
    if (shine !== null) {
      const d = Math.abs(px - (py - y) * 0.6 - shine);
      if (d < 1.3) return WHITE;
      if (d < 3) return col.rim;
    }
    return py - y < h * 0.45 ? col.top : col.body;
  });
}
var HEART = [
  "..kkk...kkk..",
  ".khhok.khook.",
  "khwhookoooomk",
  "khwoooooooomk",
  "khoooooooommk",
  "kooooooooomdk",
  ".kooooooomdk.",
  "..kooooomdk..",
  "...kooomdk...",
  "....komdk....",
  ".....kdk.....",
  "......k......"
];
var heartPal = (C) => ({ k: C[0], w: WHITE, h: C[5], o: C[4], m: C[3], d: C[2] });
function shake(t, amp, t0 = 0, len = 0.3, seed = 1, hz = 32) {
  if (t < t0 || t > t0 + len) return [0, 0];
  const k = 1 - (t - t0) / len;
  return [Math.round(noise(t * hz, seed) * amp * k * 1.7), Math.round(noise(t * hz, seed + 7) * amp * k * 1.3)];
}

export {
  spell,
  drawWord,
  tintActor,
  lightActor,
  haloActor,
  panel,
  HEART,
  heartPal,
  shake
};
