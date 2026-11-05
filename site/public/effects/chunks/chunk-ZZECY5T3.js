import {
  hex
} from "./chunk-WFSCDWU6.js";

// src/fx/spawn/_lib.ts
function bodyOf(actor, C) {
  const m = actor.mask, px = actor.pixels, list = [], cells = new Array(m.w * m.h).fill(null);
  const on = (mx, my) => mx >= 0 && my >= 0 && mx < m.w && my < m.h && !!m.data[my * m.w + mx];
  for (let my = 0; my < m.h; my++)
    for (let mx = 0; mx < m.w; mx++) {
      if (!on(mx, my)) continue;
      const own = px?.[my * m.w + mx];
      const c = own ? hex(own) : C[Math.max(1, Math.min(C.length - 2, Math.round((C.length - 2) * (0.85 - my / m.h * 0.5))))];
      const b = { x: actor.x + mx, y: actor.y + my, mx, my, c, edge: !on(mx - 1, my) || !on(mx + 1, my) || !on(mx, my - 1) || !on(mx, my + 1) };
      list.push(b);
      cells[my * m.w + mx] = b;
    }
  return { list, w: m.w, h: m.h, x: actor.x, y: actor.y, on, cell: (mx, my) => on(mx, my) ? cells[my * m.w + mx] : null };
}
function rimOf(body) {
  const out = [];
  for (let my = -1; my <= body.h; my++)
    for (let mx = -1; mx <= body.w; mx++)
      if (!body.on(mx, my) && (body.on(mx - 1, my) || body.on(mx + 1, my) || body.on(mx, my - 1) || body.on(mx, my + 1)))
        out.push({ x: body.x + mx, y: body.y + my, mx, my });
  return out;
}

export {
  bodyOf,
  rimOf
};
