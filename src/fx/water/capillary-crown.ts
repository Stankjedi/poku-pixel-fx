import type { Painter, Point } from "../../core/painter.js";
import { fit, smooth, rand, liquidMotion, liquidImpactTime, TAU, type LiquidLaunch } from "../../core/index.js";
import { WATER, ring, bead } from "./_lib.js";
import { liquidBead } from "./_liquid.js";

export const meta = {
  addedAt: "2026-11-04T00:35:00Z",
  name: "Capillary crown",
  desc: "A clear drop opens a hollow crown. Its rim pinches into round beads, collapses into a rebound jet, and settles through small landing rings and fading capillary waves.",
  tags: ["water", "drop", "crown", "splash", "surface-tension", "capillary", "one-shot"],
  size: [184, 128], origin: [92, 105], duration: 2.2, loop: false, fps: 30, bg: "dark",
  options: { palette: WATER, seed: 17 },
};

const HIT = 1 / 3, TEAR = .11, SY = .24, G = 700;
const incoming = { h: 45 * HIT + .5 * G * HIT * HIT, vh: -45 };
const physics = { gravity: G, drag: .45, depthScale: SY };
const height = (age: number) => 24 * smooth(0, .065, age) * (1 - smooth(.14, .46, age));
const radius = (age: number) => 10 + 27 * (1 - Math.exp(-age * 9));

function rim(a: number, age: number, seed: number): { x: number; z: number; h: number } {
  const scallop = Math.cos(a * 10 + seed * .31), fingers = 1 - smooth(TEAR, .19, age);
  // Low-frequency slosh remains after the fine fingers tear off, avoiding a rigid perfect cup.
  const slosh = Math.sin(a * 3 + age * 8 + seed * .23) * smooth(.1, .25, age);
  const r = radius(age) + 1.2 * scallop * fingers + slosh * .8;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r,
    h: height(age) * (1 + .10 * scallop * fingers + .035 * slosh) };
}

/** A connected thin sheet, not a stack of glowing discs. Far and near walls preserve an open cup. */
function crown(p: Painter, age: number, C: number[], seed: number, back: boolean) {
  const h = height(age);
  if (age < 0 || h < .45) return;
  const foot = 9 + 10 * smooth(0, .46, age), start = back ? Math.PI : 0;
  const points: Point[] = [], divisions = 70;
  for (let i = 0; i <= divisions; i++) {
    const a = start + i / divisions * Math.PI, q = rim(a, age, seed);
    points.push([q.x, q.z * SY - q.h]);
  }
  // Curved sheets flare from the cavity: straight quads would make a rigid drinking glass.
  for (let i = 0; i < divisions; i++) {
    const a = start + (i + .5) / divisions * Math.PI, lit = (-Math.cos(a) + .4) / 1.4;
    const edge = (index: number, u: number): Point => {
      const angle = start + index / divisions * Math.PI, q = rim(angle, age, seed);
      const r = foot + (Math.hypot(q.x, q.z) - foot) * u * u;
      return [Math.cos(angle) * r, Math.sin(angle) * r * SY - q.h * u];
    };
    for (let j = 0; j < 8; j++) {
      const u0 = j / 8, u1 = (j + 1) / 8;
      p.poly([edge(i, u0), edge(i, u1), edge(i + 1, u1), edge(i + 1, u0)],
        C[back ? lit > .5 ? 3 : 2 : lit > .5 ? 5 : 3], back ? .64 : .31);
    }
  }
  p.path(points, u => back ? C[4] : u > .60 ? C[7] : u > .15 ? C[6] : C[4], 1);
  if (age > .065 && age < TEAR) for (let i = 0; i < 10; i++) {
    const angle = (TAU * i - seed * .31) / 10, q = rim(angle, age, seed);
    if ((q.z < 0) !== back) continue;
    bead(p, q.x, q.z * SY - q.h, 0, 0, i % 3 === 0 ? 3 : 2, C);
  }
  // Stable, shape-following highlights, limited to a few ribs so the interior remains clear.
  for (const f of back ? [.16, .81] : [.12, .78]) {
    const a = start + f * Math.PI, q = rim(a, age, seed), v: Point[] = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12, r = foot + (Math.hypot(q.x, q.z) - foot) * u * u;
      v.push([Math.cos(a) * r, Math.sin(a) * r * SY - q.h * u]);
    }
    p.path(v, C[back ? 4 : 5], back ? .5 : .8);
  }
}

function drops(seed: number) {
  return Array.from({ length: 10 }, (_, i) => {
    // Every bead is born at a real crest of the connected rim, never at an unrelated random origin.
    const a = (TAU * i - seed * .31) / 10, q = rim(a, TEAR, seed);
    const speed = 38 + rand(i, seed, 1) * 31;
    const launch: LiquidLaunch = { ...q, vx: Math.cos(a) * speed, vz: Math.sin(a) * speed,
      vh: 55 + rand(i, seed, 2) * 75 };
    return { launch, impact: liquidImpactTime(launch, physics), size: i % 3 === 0 ? 3 : 2, i };
  });
}

function droplets(p: Painter, t: number, C: number[], seed: number, back: boolean) {
  const age = t - HIT - TEAR;
  if (age < 0) return;
  for (const d of drops(seed)) {
    if (((d.launch.z ?? 0) < 0) !== back) continue;
    if (age < d.impact) {
      liquidBead(p, d.launch, age, d.size, C, 1, physics, .018);
      continue;
    }
    const landed = liquidMotion(d.launch, d.impact, physics), since = age - d.impact;
    const strength = 1 - smooth(0, .36, since);
    if (strength <= 0) continue;
    ring(p, landed.x, landed.z * SY, 1 + since * 22, SY, strength * .8, C,
      { n: 1, seed: seed + d.i, hot: since < .035, wob: .18 });
    if (since < .075) {
      // Re-entry makes a small reflected spike at the computed contact, not a sparkle in mid-air.
      p.line(landed.x, landed.z * SY, landed.x, landed.z * SY - 2 * (1 - since / .075), C[6], strength);
    }
  }
}

function surface(p: Painter, age: number, C: number[], seed: number, half: number) {
  if (age <= 0) return;
  for (let i = 0; i < 3; i++) {
    const u = age - i * .085;
    if (u < 0) continue;
    const r = 8 + 53 * (1 - Math.exp(-u * 2.1)) - i * 2.8;
    const strength = (1 - smooth(.18, 1.65 - i * .1, u)) * (.78 - i * .20);
    ring(p, 0, 0, r, SY, strength, C, { n: 1, half, seed: seed + i, hot: u < .045, wob: .35 });
  }
}

export function drawBack(p: Painter, t: number, o: typeof meta.options) {
  if (t < HIT || t >= meta.duration) return;
  const C = fit(o.palette, 8), age = t - HIT;
  surface(p, age, C, o.seed, -1);
  if (age < .42) {
    const aperture = 4 + 6 * smooth(0, .2, age), fade = 1 - smooth(.18, .42, age);
    p.ellipse(0, 0, aperture, aperture * SY, C[1], .65 * fade);
  }
  droplets(p, t, C, o.seed, true);
  crown(p, age, C, o.seed, true);
}

export function draw(p: Painter, t: number, o: typeof meta.options) {
  if (t < 0 || t >= meta.duration) return;
  const C = fit(o.palette, 8), age = t - HIT;
  if (t < HIT) {
    liquidBead(p, incoming, t, 3, C, 1, { gravity: G, drag: 0, depthScale: SY }, .024);
    return;
  }
  surface(p, age, C, o.seed, 1);
  // Rebound: the collapsing cavity sends up a slender water column and pinches off one heavy bead.
  const rebound = age - .34, jet = 28 * smooth(0, .1, rebound) * (1 - smooth(.12, .34, rebound));
  if (jet > .3) {
    p.poly([[-4, 0], [-1.2, -jet], [1.3, -jet], [4, 0]], C[4], .85);
    p.line(-1.1, -jet, -2, -1, C[6]);
    if (rebound < .1) bead(p, 0, -jet, 0, 0, 3, C);
  }
  const upAge = rebound - .1, upLaunch = { h: 28, vh: 76, vx: 3 }, upPhysics = { ...physics, gravity: 600 };
  const upImpact = liquidImpactTime(upLaunch, upPhysics);
  if (upAge >= 0 && upAge < upImpact) liquidBead(p, upLaunch, upAge, 3, C, 1, upPhysics, .02);
  else if (upAge >= upImpact) {
    const since = upAge - upImpact, q = liquidMotion(upLaunch, upImpact, upPhysics);
    ring(p, q.x, 0, 2 + since * 27, SY, (1 - smooth(0, .6, since)) * .85, C, { n: 2, gap: 2.8, seed: o.seed });
  }
  crown(p, age, C, o.seed, false);
  droplets(p, t, C, o.seed, false);
  // A tiny reflected glint at impact, never a light ball that hides the liquid silhouette.
  if (age < .065) {
    const flash = 1 - age / .065;
    p.ellipse(0, -1, 7 + age * 60, 1.5, C[6], flash);
    p.glow(-2, -2, 13, C[5], .15 * flash);
  }
}
