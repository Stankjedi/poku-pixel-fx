/** Transported polygon sweeps for solid curved horns, roots, cables and torn material. */
import { type Vec3, add3, sub3, mul3, cross3, dot3, norm3 } from './math.js';
import { type Color3D } from './frame.js';
import { type FragmentMesh3D } from './fragments.js';
import { Painter3D } from './painter.js';

export interface SweepSection3D {
  position: Vec3;
  /** Elliptical cross-section radii. A zero-radius endpoint makes a pointed cap. */
  width: number;
  thickness?: number;
  /** Twist around the path tangent, in radians. */
  twist?: number;
}
export interface SweepMesh3D extends FragmentMesh3D {
  /** Transported untwisted frames, exposed for attached seams and decorations. */
  frames: { tangent: Vec3; normal: Vec3; binormal: Vec3 }[];
}

/** Project the previous normal into the new tangent plane, avoiding world-up flips.
 * Duplicate sections are rejected; a path must have a well-defined tangent. */
export function createSweep3D(sections: readonly SweepSection3D[], sides = 5, initialNormal: Vec3 = [1, 0, 0]): SweepMesh3D {
  if (!Number.isSafeInteger(sides) || sides < 3 || sides > 32) throw new RangeError('sweep sides must be an integer in 3..32');
  if (sections.length < 2) return { vertices: [], faces: [], frames: [] };
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (!s.position.every(Number.isFinite) || !Number.isFinite(s.width) || s.width < 0 || !Number.isFinite(s.thickness ?? s.width) || (s.thickness ?? s.width) < 0 || !Number.isFinite(s.twist ?? 0)) throw new RangeError('sweep sections must have finite positions and non-negative radii');
    if (i && Math.hypot(...sub3(s.position, sections[i - 1].position)) < 1e-8) throw new RangeError('sweep sections must not repeat adjacent positions');
  }
  if (!initialNormal.every(Number.isFinite)) throw new RangeError('initial sweep normal must be finite');
  const vertices: Vec3[] = [], faces: [number, number, number][] = [], frames: SweepMesh3D['frames'] = [];
  let previous = norm3(initialNormal);
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i], before = sections[Math.max(0, i - 1)].position, after = sections[Math.min(sections.length - 1, i + 1)].position;
    let tangent = norm3(sub3(after, before));
    if (Math.hypot(...tangent) < 0.5) tangent = norm3(sub3(s.position, before));
    let normal = sub3(previous, mul3(tangent, dot3(previous, tangent)));
    if (Math.hypot(...normal) < 1e-6) {
      const axis: Vec3 = Math.abs(tangent[0]) < 0.75 ? [1, 0, 0] : [0, 0, 1];
      normal = sub3(axis, mul3(tangent, dot3(axis, tangent)));
    }
    normal = norm3(normal);
    const binormal = norm3(cross3(tangent, normal));
    frames.push({ tangent, normal, binormal }); previous = normal;
    for (let j = 0; j < sides; j++) {
      const a = j * Math.PI * 2 / sides + (s.twist ?? 0);
      vertices.push(add3(s.position, add3(mul3(normal, Math.cos(a) * s.width), mul3(binormal, Math.sin(a) * (s.thickness ?? s.width)))));
    }
    if (i) for (let j = 0; j < sides; j++) {
      const a = (i - 1) * sides + j, b = (i - 1) * sides + (j + 1) % sides, c = i * sides + j, d = i * sides + (j + 1) % sides;
      faces.push([a, b, c], [b, d, c]);
    }
  }
  // Caps are required: an oblique camera must not see through the base of a horn.
  for (let j = 1; j < sides - 1; j++) {
    faces.push([0, j + 1, j]);
    const last = (sections.length - 1) * sides;
    faces.push([last, last + j, last + j + 1]);
  }
  return { vertices, faces, frames };
}

export function drawSweep3D(p: Painter3D, mesh: SweepMesh3D, palette: readonly Color3D[], alpha = 1, emission = 0) {
  if (!palette.length || alpha <= 0) return;
  for (const [a, b, c] of mesh.faces) p.facet(mesh.vertices[a], mesh.vertices[b], mesh.vertices[c], palette, alpha, emission);
}
