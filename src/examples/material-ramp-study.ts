// Original controlled prop study. Reference lessons inform shading, not copied artwork.
import { createFrame } from "../core/fx.js";
import { Painter, type Point } from "../core/painter.js";
import { createMaterialRamp2D } from "../core/material-ramp.js";

type V = readonly [number, number, number];
export const MATERIAL_STUDY_PALETTES = {
  steel: ["#111a2b", "#293d55", "#61798b", "#b6cad0"],
  wood: ["#281b28", "#644238", "#ad7548", "#d5b170"],
  cloth: ["#13333e", "#24545e", "#3f8384", "#a6beb0"],
};
const unit = (v: V): V => { const n = Math.hypot(...v); return [v[0] / n, v[1] / n, v[2] / n]; };
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const polygon: Point[] = [[51, 22], [69, 23], [82, 18], [93, 17], [100, 22], [104, 33], [102, 46], [95, 57], [82, 61], [72, 54], [61, 51], [51, 50]];
function bladeSurface(x: number, y: number): V | null {
  let inside = false, distance = Infinity, edge: V = [0, 0, -1];
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (length * length)));
    const d = Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
    if (d < distance) { distance = d; edge = [dy / length * .72, -dx / length * .72, -.69]; }
  }
  if (!inside) return null;
  if (distance < 2.2) return edge;
  // Cross-blade curvature keeps the reflection a connected strip, rather than a ceramic-like spot.
  const nx = -.72 + (x - 51) / 53 * 1.3 + (y - 39) * .0018, ny = -.22;
  return [nx, ny, -Math.sqrt(Math.max(.1, 1 - nx * nx - ny * ny))];
}

/** Render the same original axe, cloth wrap and wood handle under one directional key.
 * Only palette thresholds and a selected steel highlight differ between the two modes.
 * Geometry, light, source palettes, coverage and zero glow are controlled across the comparison.
 */
export function renderMaterialRampStudy(mode: "uniform" | "authored" = "authored", light: V = [-.65, -.55, -1]) {
  if (!Array.isArray(light) || light.length !== 3 || !light.every(Number.isFinite) || !Number.isFinite(Math.hypot(...light)) || Math.hypot(...light) < 1e-12)
    throw new RangeError("Study light must be a finite, nonzero direction");
  const frame = createFrame(128, 108), p = new Painter(frame), material = new Uint8Array(128 * 108);
  const L = unit(light), half = [L[0], L[1], L[2] - 1] as V, H: V = Math.hypot(...half) < 1e-12 ? [0, 0, 0] : unit(half);
  const steel = createMaterialRamp2D(MATERIAL_STUDY_PALETTES.steel, mode === "authored" ?
    { thresholds: [.28, .66, .92], highlight: { color: "#fff0c4", threshold: .9 } } : {});
  const wood = createMaterialRamp2D(MATERIAL_STUDY_PALETTES.wood, mode === "authored" ? { thresholds: [.12, .48, .86] } : {});
  const cloth = createMaterialRamp2D(MATERIAL_STUDY_PALETTES.cloth, mode === "authored" ? { thresholds: [.10, .42, .84] } : {});
  const color = (normal: V, ramp: ReturnType<typeof createMaterialRamp2D>, specular = false) => {
    const N = unit(normal), diffuse = Math.max(0, dot(N, L));
    return ramp(.06 + diffuse * .94, specular && diffuse > 0 ? Math.max(0, dot(N, H)) ** 96 : 0);
  };
  const paint = (x0: number, y0: number, x1: number, y1: number, id: number,
    surface: (x: number, y: number) => V | null, ramp: ReturnType<typeof createMaterialRamp2D>, glossy = false) => {
    p.shade(x0, y0, x1, y1, (x, y) => {
      const normal = surface(x, y); if (!normal) return;
      material[Math.floor(y) * 128 + Math.floor(x)] = id;
      return color(normal, ramp, glossy);
    });
  };
  // Bent wooden haft. No added grain/noise is needed to demonstrate the material response.
  paint(45, 13, 67, 98, 2, (x, y) => {
    const center = 50 + (y - 17) * .13, radius = y > 86 ? 4.6 : 4;
    const u = (x - center) / radius; if (Math.abs(u) > 1) return null;
    return [u, .08, -Math.sqrt(Math.max(.05, 1 - u * u))];
  }, wood);
  paint(44, 23, 54, 49, 1, (x, y) => [Math.max(-.85, (x - 49) / 5), -.15, -.8], steel, true);
  paint(51, 17, 105, 62, 1, bladeSurface, steel, true);
  // Cloth folds follow three unequal wraps, not random detail or a universal outline.
  paint(49, 58, 68, 79, 3, (x, y) => {
    const center = 50 + (y - 17) * .13, radius = 5.6 + .6 * Math.sin((y - 58) * .45);
    const u = (x - center) / radius; if (Math.abs(u) > 1 || y < 58 + (x - center) * .22 || y > 78 + (x - center) * .12) return null;
    return [u * .85, .3 * Math.sin((y - 58) * .73 + u * .6), -Math.sqrt(Math.max(.09, 1 - u * u * .72))];
  }, cloth);
  // One functional pommel, with the same steel response as the blade.
  paint(56, 93, 67, 99, 1, (x, y) => {
    const u = (x - 61.5) / 5.5; if (Math.abs(u) > 1) return null;
    return [u * .75, y < 95 ? -.5 : .2, -.8];
  }, steel, true);
  return { frame, material };
}
