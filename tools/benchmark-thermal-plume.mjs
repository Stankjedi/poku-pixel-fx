/** Compare build directories on identical animated frames, alternating their order.
 * Usage: node tools/benchmark-thermal-plume.mjs build [path/to/baseline-build]
 * Advisory wall-clock measurements, not a timing assertion for shared CI hosts.
 */
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const paths = process.argv.slice(2);
if (!paths.length) paths.push('build');
const renderers = await Promise.all(paths.map(async path => {
  const engine = await import(pathToFileURL(resolve(path, '3d/index.js')));
  const frame = engine.createFrame3D(192, 144);
  const painter = new engine.Painter3D(frame, { yaw: 0.68, elevation: 0.49, zoom: 1.65, target: [0, 1.95, 0] });
  return { path, engine, frame, painter, rounds: [], cached: [] };
}));
const mean = a => a.reduce((sum, x) => sum + x, 0) / a.length;
const median = a => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
const percentile = (a, p) => [...a].sort((a, b) => a - b)[Math.min(a.length - 1, Math.floor(a.length * p))];
for (let round = 0; round < 7; round++) {
  for (const r of renderers) { r.fx = r.engine.createFx3D(r.engine.thermalPlume3D); r.times = []; }
  for (let step = 1; step <= 64; step++) {
    const order = (round + step) % 2 ? [...renderers].reverse() : renderers;
    for (const r of order) {
      r.fx.update(0.1);
      r.painter.begin('#0a1525');
      const start = performance.now(); r.fx.draw(r.painter); r.times.push(performance.now() - start);
    }
  }
  if (round >= 2) for (const r of renderers) r.rounds.push({ meanMs: mean(r.times), burnMeanMs: mean(r.times.slice(4, 30)), p95Ms: percentile(r.times, 0.95) });
}
for (const r of renderers) { r.fx.seek(2); r.fx.draw(r.painter); }
for (let i = 0; i < 80; i++) for (const r of i % 2 ? [...renderers].reverse() : renderers) {
  r.painter.begin('#0a1525'); const start = performance.now(); r.fx.draw(r.painter);
  if (i >= 20) r.cached.push(performance.now() - start);
}
console.log(JSON.stringify({ node: process.version, dimensions: [192, 144], warmupRounds: 2, measuredRounds: 5, framesPerRound: 64,
  results: renderers.map(r => ({ path: r.path, medianMeanMs: median(r.rounds.map(v => v.meanMs)), medianBurnMeanMs: median(r.rounds.map(v => v.burnMeanMs)), medianP95Ms: median(r.rounds.map(v => v.p95Ms)), cachedMeanMs: mean(r.cached), rounds: r.rounds })) }, null, 2));
