import type { Painter, Point } from '../../core/painter.js';
import type { stockActor } from '../../core/actor.js';
import { fit, Rng, mix, smooth, lerp, TAU, READY, restorationField2D, defineRestorationTiming2D, type RestorationTiming2D } from '../../core/index.js';
import { oval } from './_lib.js';

/** A restorative beat, deliberately independent from damage contacts and hit-stop. */
export const restoration: Readonly<RestorationTiming2D> = defineRestorationTiming2D({ startsAt: .14, pulseAt: .70, liftedAt: 1.16, endsAt: 1.94 });
export const meta = {
  name: 'Heal',
  desc: 'A small jade lotus gathers at the feet. Two soft ribbons climb around the target, a mint response restores its silhouette on one chest beat, and three ivory leaves rise away.',
  tags: ['holy', 'heal', 'restore', 'buff', 'lotus', 'target-bound', 'character', 'one-shot'],
  size: [96, 104], origin: [48, 92], duration: 2.1, loop: false, fps: 30, bg: 'ground', actor: 2,
  options: { palette: ['#102e2b', '#1e5144', '#38725a', '#65a578', '#94d7a0', '#c0efc0', '#e5f8da', '#fff9e4'], seed: 2 },
};
const HURT = { turn: .8, crouch: 4, lean: 2, hy: 1, fx: 1, fy: -21, bx: 7, by: -15, ffx: 4, fbx: -3 };
const OPEN = { turn: 1.05, crouch: 0, lean: 0, hy: -1, fx: -10, fy: -26, bx: 12, by: -26, ffx: 1, fbx: -2 };
export const act = {
  onBody: true,
  poses: [[-.25, HURT], [.14, HURT], [restoration.pulseAt, OPEN], [1.05, { ...OPEN, hy: 0 }], [1.75, READY], [2.1, READY]],
};
type Options = typeof meta.options & { actor: ReturnType<typeof stockActor> };

export function create(o: Options) {
  const C = fit(o.palette, 8), field = restorationField2D(o.actor, restoration), R = new Rng(o.seed);
  const motes = Array.from({ length: 7 }, (_, i) => ({ start: .12 + i * .095, phase: i * TAU / 7 + R.range(-.2, .2), lift: R.range(30, 43), life: R.range(.7, 1.0) }));
  const cx = field.centerX, foot = field.bottom + 1, chest = field.chest, h = foot - field.top;
  const radius = Math.max(12, (field.spanAt(chest[1])[1] - field.spanAt(chest[1])[0]) * .5 + 8);
  const activity = (t: number) => smooth(0, .24, t) * (1 - smooth(1.25, 1.86, t));

  function lotus(p: Painter, t: number, back: boolean) {
    const a = activity(t); if (a <= 0) return;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * TAU + .22, near = Math.sin(angle) >= 0;
      if (near === back) continue;
      const grow = smooth(i * .015, .34 + i * .015, t), k = grow * (1 - smooth(1.28 + i * .04, 1.72 + i * .025, t));
      if (k < .02) continue;
      const dx = Math.cos(angle), dy = Math.sin(angle), root: Point = [cx + dx * 3, foot + dy],
        tip: Point = [cx + dx * (12 + k * 4), foot + dy * 3 - 7 * k],
        mid: Point = [lerp(root[0], tip[0], .55), lerp(root[1], tip[1], .55)], width = 2.6 * k;
      const length = Math.hypot(tip[0] - root[0], tip[1] - root[1]), nx = -(tip[1] - root[1]) / length, ny = (tip[0] - root[0]) / length;
      const shape: Point[] = [root, [mid[0] + nx * width, mid[1] + ny * width], tip, [mid[0] - nx * width, mid[1] - ny * width]];
      p.poly(shape, back ? C[2] : C[3], a);
      p.path([root, shape[1], tip], back ? C[3] : C[5], a * .85, 1);
      p.path([root, [mid[0], mid[1] - .5], tip], back ? C[3] : C[4], a, 1);
      p.dot(tip[0], tip[1], C[5], a * .9);
    }
    oval(p, cx, foot, radius * .68, 2.7, back ? C[2] : C[3], a * .7, g => (Math.sin(g) < 0) === back);
    if (back) p.glow(cx, foot - 2, 12, C[3], a * .11);
  }

  function ribbons(p: Painter, t: number, back: boolean) {
    const state = field.sample(t); if (!state.active) return;
    const growth = smooth(restoration.startsAt, restoration.pulseAt + .1, t) * (1 - smooth(restoration.liftedAt - .05, restoration.liftedAt + .16, t));
    for (let arm = 0; arm < 2; arm++) {
      const points: Point[] = [], phase = arm * Math.PI + .3;
      // Trace only the trailing quarter of a turn. Depth splitting protects the target's face.
      for (let j = 0; j <= 36; j++) {
        const u = j / 36, y = state.sweepY + (1 - u) * h * .46, angle = phase + (foot - y) / h * 5.4 - t * .6;
        const r = radius * (1 - .12 * smooth(foot, field.top, y)), x = cx + Math.cos(angle) * r;
        const face = !back && y < field.top + h * .24 && Math.abs(x - chest[0]) < 8;
        const visible = !face && (Math.sin(angle) < 0) === back && y <= foot && y >= field.top - 1;
        if (!visible) { paint(); continue; }
        points.push([x, y + Math.sin(angle) * 2]);
      }
      paint();
      function paint() {
        if (points.length > 1) {
          p.path(points, C[1], state.coverage * growth * .8, back ? 1.6 : 2.6);
          p.path(points, u => u > .7 ? C[6] : C[4], u => state.coverage * growth * (.3 + .65 * u), back ? 1 : 1.5);
          p.glowPath(points, 4, C[4], state.coverage * growth * (back ? .06 : .10));
        }
        points.length = 0;
      }
    }
  }

  function upward(p: Painter, t: number, back: boolean) {
    for (const m of motes) {
      const age = t - m.start, u = age / m.life;
      if (u <= 0 || u >= 1) continue;
      const phase = m.phase + age * 1.15, z = Math.sin(phase);
      if ((z < 0) !== back) continue;
      const alpha = smooth(0, .14, u) * (1 - smooth(.48, 1, u));
      const x = cx + Math.cos(phase) * radius, y = foot - 2 - m.lift * u + z * 2;
      // A coherent upward teardrop, never gravity-bound sparks or radial impact debris.
      p.path([[x, y + 3], [x - .4, y + 1.2], [x, y]], back ? C[3] : C[5], v => alpha * (.18 + .65 * v), 1);
      p.glow(x, y, 3, C[4], alpha * .12);
    }
    if (back) return;
    for (let i = 0; i < 3; i++) {
      const start = restoration.pulseAt + .12 + i * .15, u = (t - start) / .75;
      if (u <= 0 || u >= 1) continue;
      const a = smooth(0, .15, u) * (1 - smooth(.48, 1, u)), side = i === 1 ? -1 : 1;
      const x = cx + side * (8 + i * 4) + Math.sin(u * 2.6 + i) * 2, y = field.top - 3 - 15 * u - i * 3;
      p.poly([[x - side * 3, y + 3], [x - side * 2, y - 1], [x + side * 3, y - 3], [x + side * 2, y + 1]], C[3], a);
      p.path([[x - side * 2, y + 2], [x + side * 2, y - 2]], C[6], a, 1);
      p.dot(x + side * 3, y - 3, C[5], a);
      p.glow(x, y, 4, C[4], a * .12);
    }
  }

  return {
    drawBack(p: Painter, t: number) { t = Math.round(t * 1e9) / 1e9; if (t >= meta.duration) return; lotus(p, t, true); ribbons(p, t, true); upward(p, t, true); },
    draw(p: Painter, t: number) {
      // Ignore sub-nanosecond host accumulation differences at pixel-cell boundaries.
      t = Math.round(t * 1e9) / 1e9;
      if (t >= meta.duration) return;
      const state = field.sample(t);
      const responseByRow = new Map<number, number>();
      for (const cell of field.cells) {
        let response = responseByRow.get(cell.y);
        if (response === undefined) { response = field.responseAt(cell.y, t); responseByRow.set(cell.y, response); }
        // Preserve original shading and face detail. Never drain the actor before healing.
        if (response > .08 && cell.color) p.px(cell.x, cell.y, mix(cell.color, C[4], response * (cell.edge ? .40 : .15)));
        if (cell.edge && response > .12) p.glow(cell.x, cell.y, 1.8, C[4], response * .018);
      }
      lotus(p, t, false); ribbons(p, t, false); upward(p, t, false);
      // The single application beat is offset beside the chest, keeping facial/body anatomy visible.
      if (state.pulse > 0) {
        const x = chest[0] - 9, y = chest[1] - 1, a = state.pulse;
        p.path([[x - 2, y], [x + 2, y]], C[6], a * .9, 1);
        p.path([[x, y - 2], [x, y + 2]], C[6], a * .9, 1);
        p.dot(x, y, C[7], a);
        p.glow(x, y, 6, C[4], a * .22);
      }
    },
  };
}
