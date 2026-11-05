/** Opt-in timing starter. Separate authoring channels, not a finished-effect claim. */
export function timingTemplate(name: string, category: string): string {
  return `import { createTimingCurve, fit, motionTrail, drawTrail } from "../../core/index.js";
import type { Painter } from "../../core/painter.js";

export const meta = { name: ${JSON.stringify(name)}, desc: "Timing study: edit travel, width, opacity and light independently.",
  tags: [${JSON.stringify(category)}, "timing-study"], size: [192,96], origin: [48,56], duration: 1.7, fps: 50, loop: false, bg: "dark",
  options: { seed: 1, palette: ["#241b31","#794250","#db865b","#ffe1a0"] } };

// Time is seconds; value is local x in pixels; velocity is pixels/second.
// Continue motion while opacity fades. Use after: "hold" for an intentional stop.
const travel = createTimingCurve([
  { time: 0, value: 0, velocity: 0 },
  { time: 0.25, value: 3 },
  { time: 0.9, value: 66, velocity: 85 },
], { after: "continue" });
const width = createTimingCurve([{ time: 0, value: 0 }, { time: 0.15, value: 1 }, { time: 1.2, value: 1 }, { time: 1.6, value: 0.5 }]);
const opacity = createTimingCurve([{ time: 0, value: 0 }, { time: 0.1, value: 1 }, { time: 1.1, value: 1 }, { time: 1.6, value: 0, velocity: 0 }]);
const light = createTimingCurve([{ time: 0, value: 0 }, { time: 0.2, value: 0.24 }, { time: 0.9, value: 0.12 }, { time: 1.5, value: 0 }]);

export function draw(p: Painter, t: number, o: typeof meta.options) {
  if (t <= 0 || t >= meta.duration) return;
  const C = fit(o.palette, 4), a = opacity.sample(t).value, w = width.sample(t).value;
  const position = (time: number): [number, number] => { const x = travel.sample(time).value; return [x, -10 - x * 0.12]; };
  const [x, y] = position(t);
  drawTrail(p, motionTrail(position, t, 0.15), { color: C[1], head: C[2], width: 3 * w, alpha: a, light: 0 });
  p.circle(x, y, 3 * w, C[2], a); p.dot(x - 1, y - 1, C[3], a);
  p.glow(x, y, 12, C[2], light.sample(t).value * a);
}

// Next: choose your own silhouette and timing. Render at target fps and inspect the ending.
// Shape, opacity and light intentionally do not share one scale-to-zero envelope.
`;
}
